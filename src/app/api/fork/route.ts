import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { CAU_HINH } from '@/lib/cau-hinh';
import { spawnClaudeSeatProcess } from '@/lib/chay-agent';
import { timNhanSu } from '@/lib/nhan-su';
import { thuMucAgent, mocTepPhien } from '@/lib/doc-phien';
import { themMatXich, khoCua, doTep } from '@/lib/goc-tich';
import { layO, layTatCa, datO, ghiMocKetThuc } from '@/lib/kho-phien';
import { bindingOf } from '@/components/ung-dung/nap-bo-ghe';
import { HAN_FORK_MS } from '@/lib/han-gio-fork';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOC_KHO = path.join(CAU_HINH.thuMucLamViec, '.claude', 'projects');

/** Tìm MỌI kho đang chứa bản ghi của mã phiên này. */
function timNguon(maPhien: string): string[] {
  try {
    return fs
      .readdirSync(GOC_KHO)
      .map((d) => path.join(GOC_KHO, d, `${maPhien}.jsonl`))
      .filter((p) => fs.existsSync(p));
  } catch {
    return [];
  }
}

/**
 * POST /api/fork  { ma_nhan_su, ma_phien, ma_o }
 *
 * 🧬 Đưa một phiên mở từ THƯ MỤC KHÁC về ghế này — bằng FORK, ⛔ không phải chép trần.
 *
 * 🔴 Vì sao ⛔ KHÔNG chép trần (ca thật 15/08): chép giữ NGUYÊN mã phiên ⇒ **cùng một mã
 *    nằm ở hai kho** ⇒ bộ canh dò tiến trình theo mã sẽ báo bận nhầm, và Owner nhìn hai
 *    chỗ đều thấy «phiên 5d2238a0» ⛔ không phân biệt được. `--fork-session` cấp **mã MỚI**.
 *
 * 🔴 Bản gốc ở kho NHÀ = **ĐỐI CHỨNG**: được ĐỌC, cấm ghi thêm · cấm cắt · cấm đổi tên.
 *    Đo sau mỗi lần fork: kích thước + số dòng phải Y NGUYÊN (trả về trong `doi_chung`).
 */
export async function POST(req: NextRequest) {
  const initialSlots = layTatCa();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const maNhanSu = String(body.ma_nhan_su ?? '').trim();
  const maPhien = String(body.ma_phien ?? '').trim();
  const maO = /^o-\d+$/.test(String(body.ma_o ?? '')) ? String(body.ma_o) : 'o-1';

  if (!timNhanSu(maNhanSu)) return Response.json({ loi: 'Không có ghế này.' }, { status: 404 });
  if (!/^[0-9a-f-]{16,}$/i.test(maPhien)) return Response.json({ loi: 'Mã phiên không hợp lệ.' }, { status: 400 });

  const nguon = timNguon(maPhien);
  if (!nguon.length) return Response.json({ loi: `⛔ Không tìm thấy bản ghi nào mang mã ${maPhien.slice(0, 8)}…` }, { status: 404 });

  // ⚠️ Trùng mã ở NHIỀU kho ⇒ mơ hồ. ⛔ Đừng tự chọn tệp mới nhất — hỏi người.
  const kho = khoCua(maNhanSu);
  const ngoai = nguon.filter((p) => path.dirname(p) !== kho);
  if (ngoai.length > 1) {
    return Response.json(
      { loi: `⚠️ Mã này tồn tại ở ${ngoai.length} kho khác nhau — ⛔ không tự chọn được. Nguồn: ${ngoai.join(' · ')}` },
      { status: 409 },
    );
  }
  const goc = ngoai[0] ?? nguon[0];

  // Ảnh chụp bản gốc TRƯỚC — để chứng minh ta ⛔ không đụng.
  const truoc = doTep(goc);
  const stTruoc = fs.statSync(goc);

  // ① chép GIỮ MỐC (-p): mốc gốc ⇒ bộ canh ⛔ không phán «vừa đổi ⇒ đang chạy nơi khác»
  fs.mkdirSync(kho, { recursive: true });
  const dich = path.join(kho, `${maPhien}.jsonl`);
  fs.copyFileSync(goc, dich);
  fs.utimesSync(dich, stTruoc.atime, stTruoc.mtime);

  // ② mở bằng --fork-session ⇒ Claude tự cấp MÃ MỚI
  const thuMuc = thuMucAgent(maNhanSu);
  /**
   * 📌 FORK KHÔNG SINH `CLAUDE.md` — Owner quyết round-17 lúc 10:10 ngày 07/09/2026 (lựa chọn 🅑):
   *    «Đưa việc sinh CLAUDE.md ra khỏi fork; làm bằng lệnh riêng có danh sách xem trước.»
   *    Lệnh đó: `dev/sinh-ho-so-ghe.mjs` — mặc định CHỈ XEM TRƯỚC, phải khai `--dong-y` mới ghi.
   *
   * 🕳 VÌ SAO BỎ, ghi lại kẻo người sau tưởng ai đó quên: ba vòng soi liên tiếp đều bác cùng MỘT
   *    hình — giữa lúc BIẾT một sự thật về thư mục đích và lúc GHI vào đó có một quãng, và trong
   *    quãng ấy sự thật hết hạn.
   *      vòng 1  biết «tên khác nhà»        → ghi   ⇒ tên KHÔNG phải danh tính (hoa-thường)
   *      vòng 2  biết «danh tính khác nhà»  → ghi   ⇒ danh tính đổi được giữa hai bước
   *      vòng 3  biết «app vừa tạo»         → ghi   ⇒ cái vừa tạo bị thay giữa hai bước
   *    Mỗi bản vá làm phép BIẾT khôn hơn; chẳng bản nào rút ngắn QUÃNG GIỮA BIẾT VÀ GHI.
   *
   * 🔴 CÂU CŨ Ở ĐÂY SAI — người soi bác vòng 1 round-17 (07/09/2026). Giữ NGUYÊN VĂN để
   *    đừng ai viết lại:   «fork KHÔNG còn ghi tệp nào vào thư mục ghế»
   *    kèm phép đo tôi đưa: «đếm `writeFileSync` của fork vào `thuMuc` phải ra 0».
   * 🕳 Phép đo ấy RA 0 THẬT, và nó VẪN nói dối — vì nó trả lời SAI CÂU:
   *      nó đếm  : trong TỆP NÀY có bao nhiêu chữ `writeFileSync`
   *      tôi đọc : fork ghi bao nhiêu tệp VÀO THƯ MỤC GHẾ
   *    Đếm một cái TÊN trong một tệp KHÔNG đo được tác dụng phụ của những hàm nó GỌI.
   * 📏 Chuỗi gọi THẬT (người soi dựng lại được, và tôi đọc lại đúng thế):
   *      route.ts:128 themMatXich → goc-tich.ts:113 ghiGocTich
   *      → goc-tich.ts:46-47 đích là thuMucAgent(...)/.goc-tich.json → :60 writeFileSync
   *    ⇒ fork VẪN ghi MỘT tệp vào thư mục ghế: `.goc-tich.json`.
   *
   * ✅ THỨ THẬT SỰ ĐỔI Ở VÒNG NÀY, hẹp đúng bằng số đo: **fork KHÔNG còn SINH `CLAUDE.md`**.
   *    Việc sinh hồ sơ dời sang lệnh riêng `dev/sinh-ho-so-ghe.mjs`, mặc định xem trước.
   * ⚠️ `.goc-tich.json` thì VẪN ghi, và nó là NGHIỆP VỤ — đường truy ngược phiên cha.
   *    KHÔNG xoá nó để làm đẹp một con số. Muốn hợp đồng là «fork KHÔNG ghi tệp nào vào ghế»
   *    thì đó là quyết định của PM/Owner, KHÔNG phải thứ người viết mã tự chọn.
   * ⇒ Vậy nên quãng kiểm-rồi-ghi Ở ĐƯỜNG GỐC TÍCH VẪN CÒN. Tôi KHÔNG khai đã đóng nó.
   */
  const maMoi = await new Promise<string | null>((giai) => {
    const { tien } = spawnClaudeSeatProcess({
      thuMuc,
      maNhanSu,
      outputFormat: 'json',
      maPhienCu: maPhien,
      forkSession: true,
    });
    let ra = '';
    tien.stdout.on('data', (c: Buffer) => { ra += c.toString('utf8'); });
    tien.stdin.write('Trả lời đúng 1 chữ: ok');
    tien.stdin.end();
    // ⏱ Hạn giờ lấy từ NGUỒN DUY NHẤT — xem `@/lib/han-gio-fork`. Trước đây là số trần ở đây,
    //    và hai câu văn ở máy khách là hai bản chép của nó.
    const gio = setTimeout(() => tien.kill('SIGTERM'), HAN_FORK_MS);
    tien.on('close', () => {
      clearTimeout(gio);
      try {
        const j = JSON.parse(ra) as { session_id?: string };
        giai(j.session_id ?? null);
      } catch {
        const m = ra.match(/"session_id"\s*:\s*"([0-9a-f-]{36})"/i);
        giai(m ? m[1] : null);
      }
    });
    tien.on('error', () => { clearTimeout(gio); giai(null); });
  });

  if (!maMoi || maMoi === maPhien) {
    return Response.json({ loi: '⛔ Fork ⛔ không cấp được mã mới. Bản chép vẫn còn — nhưng nó CÙNG mã với bản gốc, ⛔ chưa tách được.' }, { status: 500 });
  }

  // ③ ghi sổ GỐC TÍCH — nối cả chuỗi tổ tiên nếu phiên cha cũng từng là bản fork
  const gt = themMatXich(maNhanSu, maMoi, maPhien, goc);


  // ④ ĐO LẠI bản gốc — chứng minh ta ⛔ không đụng
  const sau = doTep(goc);
  const stSau = fs.statSync(goc);
  const nguyenVen = truoc.soDong === sau.soDong && stTruoc.size === stSau.size;

  // ⑤ ô này trỏ sang phiên MỚI
  if (!datO(maO, maNhanSu, maMoi, bindingOf(initialSlots[maO]))) {
    return Response.json({ loi: 'Fork đã tạo phiên mới nhưng ô đã đổi. Không ghi đè lựa chọn mới.', ma_moi: maMoi }, { status: 409 });
  }
  const forkBinding = bindingOf(layO(maO));

  /**
   * 🔑 KHAI «app này VỪA SỞ HỮU và VỪA GHI tệp phiên mới» ⇒ mở CỬA THA THỨ BA
   *    (`doc-phien.ts` → `dangChay`, vế `if (mocKetThucCuaTa !== null) return false`).
   *
   * 🕳 ⛔ KHÔNG có hai dòng này thì Owner bị chặn OAN 5 PHÚT sau MỖI lần fork
   *    (ca thật 20/08, dính 2/2 lần). Đường đi: `datO` đổi sang mã phiên MỚI ⇒
   *    `kho-phien.ts:62` cố ý xoá mốc (đúng cho ca ĐỔI GHẾ) ⇒ ô có mã mới mà mốc NULL
   *    ⇒ cửa 3 đóng; tệp fork vừa chép nên mtime MỚI ⇒ cửa 2 cũng đóng ⇒ CHẶN.
   * 📌 FORK là đường DUY NHẤT sinh ra tệp VỪA CÓ NỘI DUNG VỪA MỚI. Ba đường kia đều thoát:
   *    phiên mới (⛔ chưa có tệp) · đổi ghế (tệp cũ) · đóng ô (⛔ không có phiên).
   *    ⇒ Vá ĐÚNG chỗ này, ⛔ ĐỪNG sửa `datO`/`kho-phien`/ngưỡng 5 phút cho «tổng quát».
   *
   * ⚠️ `mocTepPhien`, ⛔ TUYỆT ĐỐI KHÔNG `Date.now()`: `moc_ket_thuc` theo định nghĩa là
   *    MỐC SỬA TỆP, ⛔ không phải mốc đồng hồ (`chat/route.ts:231` cũng dùng hàm này).
   *    Trộn hai loại số vào một ô thì hôm nay ⛔ ai so nên ⛔ lộ — ngày nào có người
   *    thêm phép so, nó SAI ÂM THẦM.
   *
   * 🕳 KHE HỞ bản vá này MỞ RA — ghi ra để người sau biết chỗ mà nghi, ⛔ giấu:
   *    mở cửa 3 ⇒ ô vừa fork MẤT lớp che của cửa 2 trong 5 phút đầu, chỉ còn cửa 1 (`ps`).
   *    `ps` hụt khi: terminal vừa `exec` chưa hiện trong bảng (vài trăm ms — hẹp) HOẶC
   *    `claude` đang chạy rồi TỰ ĐỔI mã phiên bên trong nên dòng lệnh vẫn mang mã CŨ (rộng hơn).
   *    Diện: CHỈ ô vừa fork, CHỈ 5 phút đầu. Chấp nhận được — đổi lấy việc Owner dùng được ngay.
   */
  const mocMoi = mocTepPhien(maNhanSu, maMoi);
  if (mocMoi !== null) ghiMocKetThuc(maO, mocMoi, forkBinding);

  return Response.json({
    ma_moi: maMoi,
    goc_tich: gt,
    doi_chung: {
      duong_dan: goc,
      so_dong_truoc: truoc.soDong,
      so_dong_sau: sau.soDong,
      byte_truoc: stTruoc.size,
      byte_sau: stSau.size,
      nguyen_ven: nguyenVen,
    },
  });
}
