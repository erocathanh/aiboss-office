import { NextRequest } from 'next/server';
import { chayAgent } from '@/lib/chay-agent';
import { CAU_HINH, loiDanHeThong } from '@/lib/cau-hinh';
import { xinLuot, moLuot, dongLuot, nhanDangKhach } from '@/lib/chan-muc-dung';
import { layO, datO, ghiMocKetThuc } from '@/lib/kho-phien';
import { thuMucAgent, dangChay, coPhien, mocTepPhien, NGUONG_SONG_PHUT } from '@/lib/doc-phien';
import { dangKyViec, xoaViec, dsViec } from '@/lib/kho-tien-trinh';
import { ghiVetMatLienKet } from '@/lib/vet-mat-lien-ket';
import { timNhanSu } from '@/lib/nhan-su';
import { traChuoi } from '@/lib/tra-chuoi';

export const runtime = 'nodejs'; // cần spawn tiến trình con → ⛔ không chạy edge
export const dynamic = 'force-dynamic';

/**
 * VÌ SAO CHỌN SSE (Server-Sent Events) THAY VÌ WEBSOCKET
 * ------------------------------------------------------
 * 1. Luồng ở đây MỘT CHIỀU: câu hỏi đi lên bằng một POST bình thường, chỉ có
 *    câu trả lời cần chảy ngược về. WebSocket là kênh hai chiều — trả giá cho
 *    một chiều ta không dùng.
 * 2. Next.js App Router phục vụ SSE bằng ReadableStream ngay trong route handler,
 *    ⛔ KHÔNG cần dựng máy chủ riêng. Muốn WebSocket là phải bỏ `next dev`,
 *    tự ghép node:http + ws (đúng cách openclaw làm) — nặng hơn hẳn cho vòng đầu.
 * 3. SSE đi trên HTTP thường ⇒ qua được proxy/Cloudflare mà ⛔ không phải mở
 *    thêm cấu hình nâng cấp giao thức.
 * 4. Vòng sau chia 2–4 ô: mỗi ô mở một luồng SSE riêng, ⛔ không vướng gì.
 */

function goi(du_lieu: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(du_lieu)}\n\n`);
}

export async function POST(req: NextRequest) {
  const khach = nhanDangKhach(req.headers);

  let than: { ma_o?: unknown; ma_nhan_su?: unknown; cau_hoi?: unknown; phien_moi?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const maO = typeof than.ma_o === 'string' && /^o-\d+$/.test(than.ma_o) ? than.ma_o : 'o-1';
  const maNhanSu = typeof than.ma_nhan_su === 'string' ? than.ma_nhan_su.trim() : '';
  const cauHoi = typeof than.cau_hoi === 'string' ? than.cau_hoi.trim() : '';
  const phienMoi = than.phien_moi === true;

  if (!maNhanSu) return Response.json({ loi: 'Thiếu nhân sự.' }, { status: 400 });
  if (!cauHoi) return Response.json({ loi: 'Câu hỏi trống.' }, { status: 400 });
  if (cauHoi.length > CAU_HINH.toiDaKyTu) {
    return Response.json({ loi: `Câu hỏi dài quá ${CAU_HINH.toiDaKyTu} ký tự.` }, { status: 413 });
  }

  const ns = timNhanSu(maNhanSu);
  if (!ns) return Response.json({ loi: 'Không có nhân sự này.' }, { status: 404 });

  // Phiên nào? Lấy từ SỔ TRÊN ĐĨA — ⛔ trình duyệt không tự chỉ định mã phiên.
  const o = layO(maO);
  let maPhienCu = phienMoi || !o || o.ma_nhan_su !== maNhanSu ? null : (o.ma_phien ?? null);

  /**
   * 🪤 BẪY openclaw ĐÃ CẮN HỘ (KIEN-TRUC-SAU.md §3.3):
   * TRƯỚC khi `--resume`, phải KIỂM bản ghi phiên có đọc được không.
   * Thiếu bản ghi mà cứ `--resume` mù → Claude Code âm thầm mở PHIÊN TRẮNG,
   * trong khi giao diện vẫn hiện lịch sử cũ ⇒ người dùng mất ngữ cảnh mà KHÔNG BIẾT.
   * ⇒ Thiếu bản ghi thì XOÁ liên kết và nói thẳng ra, ⛔ không im lặng.
   */
  let matBanGhi = false;
  if (maPhienCu && !coPhien(maNhanSu, maPhienCu)) {
    /**
     * ⚠️ MỘT MẪU ĐƠN ⛔ KHÔNG ĐỦ để tuyên một phiên là mất.
     * Luật nhà: sống hay chết phải đo 2 mẫu CÁCH NHAU — một mẫu dễ bắt nhầm đúng
     * lúc tệp đang được thay/đổi tên. ⇒ Đo lại sau 1,5 giây rồi mới kết luận.
     * Nhánh này chỉ chạy trong ca hiếm nên 1,5 giây ⛔ không làm chậm đường thường.
     */
    ghiVetMatLienKet(maO, maNhanSu, maPhienCu, false);
    await new Promise((r) => setTimeout(r, 1500));
    if (!coPhien(maNhanSu, maPhienCu)) {
      matBanGhi = true;
      maPhienCu = null; // ⛔ không `--resume` mù (bẫy openclaw) — nhưng ⇩
      /**
       * ⛔ ĐÃ BỎ `datO(maO, maNhanSu, null)`.
       * Xoá liên kết là hành động KHÔNG LÙI ĐƯỢC, mà bằng chứng chỉ là phép đo tệp.
       * Ca 17/08: Owner mất cả chuỗi làm việc, phải nối tay lại từ dòng lệnh.
       * ⇒ Giữ liên kết trong sổ: lượt này mở phiên mới, nhưng Owner vẫn NỐI LẠI được.
       */
    }
  }

  // ⛔ LUẬT CỨNG: ⛔ TUYỆT ĐỐI KHÔNG resume phiên ĐANG CHẠY ở nơi khác.
  //    Hai tiến trình cùng ghi một tệp phiên = hỏng bản ghi.
  if (maPhienCu && dangChay(maNhanSu, maPhienCu, o?.moc_ket_thuc ?? null)) {
    /**
     * 🗣 NÓI ĐÚNG THỨ MÌNH ĐO ĐƯỢC, ⛔ đoán hộ Owner (P0-7, 31/08/2026).
     *
     * 🐛 Câu cũ luôn khai «⛔ nhiều khả năng ĐANG CHẠY ở terminal khác» — kể cả khi
     *    ⛔ có terminal nào. Owner gặp câu đó thì đi tìm một cửa sổ ⛔ tồn tại, trong khi
     *    thủ phạm là CHÍNH GHẾ TRONG APP. Một lời khai sai còn tốn thời gian hơn ⛔ khai.
     * ✅ Nay sổ tiến trình của máy chủ trả lời được: ghế đó CÓ nằm trong sổ ⛔.
     *      CÓ  ⇒ nói thẳng «ghế này đang chạy dở», kèm chạy bao lâu rồi
     *      ⛔  ⇒ mới được nói «nơi khác», và phải nói rõ đó là SUY ĐOÁN
     */
    const dangTrongApp = dsViec().find((v) => v.ma_nhan_su === maNhanSu);
    const loi = dangTrongApp
      ? `Ghế này ĐANG CHẠY DỞ ngay trong app (ô ${dangTrongApp.ma_o}, đã chạy ` +
        `${Math.round((Date.now() - dangTrongApp.bat_dau) / 1000)} giây). ` +
        'Chờ nó xong, hoặc bấm nút Dừng ở ô đó rồi gửi lại.'
      : `Phiên này vừa đổi trong ${NGUONG_SONG_PHUT} phút mà sổ tiến trình của app ⛔ có nó. ` +
        'Nhiều khả năng nó đang chạy ở NƠI KHÁC (cửa sổ dòng lệnh chẳng hạn) — đây là SUY ĐOÁN, ' +
        '⛔ phải điều app đo được. Nối vào lúc này sẽ hỏng bản ghi phiên; hãy mở phiên mới.';
    return Response.json({ loi, trong_app: !!dangTrongApp }, { status: 409 });
  }

  // ⛔ Chặn mức dùng TRƯỚC khi đẻ tiến trình — agent chạy hoang = tiền thật.
  const chan = xinLuot(khach);
  if (!chan.cho_qua) {
    return Response.json(
      { loi: chan.ly_do, cho_giay: chan.cho_giay },
      { status: 429, headers: { 'Retry-After': String(chan.cho_giay) } },
    );
  }

  /**
   * 🔴 ⛔ ĐÃ BỎ `req.signal.addEventListener('abort', () => huy.abort())` (17/08/2026).
   *
   * `req.signal` là tín hiệu ngắt CỦA TRÌNH DUYỆT. Nối nó vào bộ huỷ nghĩa là:
   * Owner đóng tab · khoá màn điện thoại · rớt wifi ⇒ `SIGTERM` vào `claude`.
   * Owner nói thẳng app này THAY CHO TERMINAL — mà terminal thì đóng cửa sổ
   * ⛔ không giết việc đang chạy.
   *
   * ⇒ Bộ huỷ này giờ CHỈ dùng cho lệnh dừng RÕ RÀNG. "Mất kết nối" ⛔ KHÔNG phải
   *   "tôi muốn dừng" — cùng một họ với chốt `xoa_lien_ket` ở `/api/o`.
   */
  const huy = new AbortController();
  let pidDangChay: number | null = null;

  moLuot();
  let daDong = false;
  const dongMotLan = () => {
    if (!daDong) {
      daDong = true;
      dongLuot();
    }
  };

  let maPhienDaDung: string | null = maPhienCu;

  const luong = new ReadableStream<Uint8Array>({
    async start(dieu) {
      // Nhịp giữ sống mỗi 20 giây (Cloudflare cắt kết nối rảnh ở 125 giây → 524).
      // Dòng bắt đầu bằng ':' là CHÚ THÍCH trong chuẩn SSE — trình duyệt bỏ qua.
      const nhip = setInterval(() => {
        try { dieu.enqueue(new TextEncoder().encode(': nhip\n\n')); } catch { /* đã đóng */ }
      }, 20_000);

      try {
        dieu.enqueue(goi({ loai: 'bat-dau', noi_tiep: Boolean(maPhienCu) }));
        // ⛔ Không im lặng: báo thẳng là đã mất bản ghi phiên cũ.
        if (matBanGhi) {
          dieu.enqueue(goi({
            loai: 'mat-ban-ghi',
            thong_diep:
              'Không đọc được bản ghi phiên cũ (đã đo 2 lần) — lượt này mở PHIÊN MỚI. ' +
              'Liên kết cũ vẫn GIỮ trong sổ: bấm chọn lại phiên là nối về được.',
          }));
        }

        /**
         * 🔎 CHẶN NGAY TẠI Ô GÕ (Owner chốt round-122 (bos-funnel) · Q2=A).
         *
         * Câu loại «tôi đã nói/giao/gửi… CHƯA» ⇒ app TỰ TRA chuỗi đời của ghế rồi ĐÍNH
         * kết quả + ĐỘ PHỦ vào câu hỏi. Vì sao ⛔ không để ghế tự nhớ: fork chỉ giữ **8,4%**
         * (đo 805/9.616 dòng) ⇒ ghế «⛔ không nhớ» là chuyện THƯỜNG, và nết mặc định của nó là
         * đáp «dạ chưa ạ» — **sai tự tin**, mà Owner ⛔ KHÔNG có cách kiểm. Kiểu sai phá lòng tin.
         * ⭐ Sống NGOÀI cửa sổ ngữ cảnh ⇒ ⛔ không mất khi nén, ⛔ không cần hook.
         */
        let cauGui = cauHoi;
        try {
          const tra = traChuoi(maNhanSu, maPhienCu, cauHoi);
          if (tra) {
            cauGui = cauHoi + String.fromCharCode(10, 10) + tra.loi_dan;
            dieu.enqueue(goi({
              loai: 'tra-chuoi', do_phu: tra.do_phu, so_tang: tra.so_tang,
              so_khop: tra.khop.length, tu_khoa: tra.tu_khoa,
            }));
          }
        } catch {
          /* tra hỏng thì ⛔ ĐỪNG chặn lượt chat — cứ gửi câu gốc */
        }
        for await (const mau of chayAgent({
          cauHoi: cauGui,
          maPhienCu,
          thuMuc: thuMucAgent(maNhanSu),
          // 👑 Ghế có LINH HỒN RIÊNG (TỔNG GIÁM ĐỐC) thì ⛔ KHÔNG nhét qua lời dặn hệ thống nữa —
          //    linh hồn được chép sẵn thành `CLAUDE.md` trong THƯ MỤC GHẾ, và Claude Code
          //    TỰ NẠP theo chỗ đứng (đúng cơ chế cascade — xem chon-mau/luat-nap.html).
          //    Cách này hơn ở chỗ: sửa linh hồn = sửa 1 tệp, ⛔ không phải đẩy lại app;
          //    và phiên mở từ terminal ở cùng thư mục cũng nhận đúng vai.
          loiDan: ns.soul ? undefined : loiDanHeThong(ns.nhan, ns.vai, ns.ten_phong),
          tinHieuHuy: huy.signal,
          // 🔌 Người xem rời đi thì việc VẪN CHẠY TỚI HẾT.
          chayNen: true,
          khiSinh: (pid) => {
            pidDangChay = pid;
            dangKyViec(maO, pid, maNhanSu); // để nút DỪNG còn giết được
          },
        })) {
          if (mau.loai === 'phien') {
            // Ghi XUỐNG ĐĨA ngay ⇒ tắt máy chủ/trình duyệt vẫn tìm lại được phiên.
            maPhienDaDung = mau.ma_phien;
            datO(maO, maNhanSu, mau.ma_phien);
            dieu.enqueue(goi({ loai: 'da-noi-mach', noi_tiep: Boolean(maPhienCu) }));
          } else if (mau.loai === 'chu') {
            dieu.enqueue(goi({ loai: 'chu', chu: mau.chu }));
          } else if (mau.loai === 'loi') {
            dieu.enqueue(goi({ loai: 'loi', thong_diep: mau.thong_diep }));
          } else if (mau.loai === 'xong') {
            // ⛔ Không đẩy mã phiên ra trình duyệt. Chi phí thì cho xem để Owner canh tiền.
            dieu.enqueue(goi({ loai: 'xong', chi_phi_usd: mau.chi_phi_usd, token: mau.token }));
          }
        }
      } catch (e) {
        dieu.enqueue(
          goi({ loai: 'loi', thong_diep: e instanceof Error ? e.message : 'Lỗi không rõ.' }),
        );
      } finally {
        clearInterval(nhip);
        /**
         * ⭐ Ghi mốc "lượt của TA vừa xong" để lượt SAU ⛔ không bị chính ta chặn nhầm.
         *
         * 🔴 Ca thật 14/08: lấy mốc ĐÚNG LÚC NÀY là **đo trước khi việc xong** —
         *    `claude` nhận SIGTERM ⛔ không chết ngay, còn xả bản ghi thêm tới 51 giây
         *    (đo được). Mốc lấy sớm ⇒ lượt sau bị bộ canh phán "đang chạy ở terminal
         *    khác" trong khi ⛔ không có terminal nào ⇒ ghế câm giữa buổi quay.
         * ⇒ Lấy ngay MỘT lần (để có mốc nếu máy chủ tắt đột ngột), rồi **lấy lại**
         *    vài nhịp sau cho tới khi tệp thôi đổi. Luôn giữ mốc MỚI NHẤT.
         */
        if (pidDangChay !== null) xoaViec(maO, pidDangChay); // việc xong ⇒ rút khỏi sổ
        if (maPhienDaDung) {
          const maP = maPhienDaDung;
          const ghiLai = () => {
            const m = mocTepPhien(maNhanSu, maP);
            if (m !== null) ghiMocKetThuc(maO, m);
          };
          ghiLai();
          for (const cho of [1_500, 5_000, 15_000]) {
            setTimeout(ghiLai, cho).unref?.();
          }
        }
        dongMotLan();
        try {
          dieu.close();
        } catch {
          /* đã đóng rồi */
        }
      }
    },
    cancel() {
      /**
       * Trình duyệt bỏ luồng (đóng tab · khoá màn · rớt mạng).
       * ⛔ TUYỆT ĐỐI KHÔNG `huy.abort()` ở đây — xem chú thích chỗ khai `huy`.
       * Chỉ ngừng ĐƯỜNG XEM; việc bên dưới chạy tiếp và tự ghi vào bản ghi phiên,
       * nên mở lại app là đọc được đầy đủ.
       */
      dongMotLan();
    },
  });

  return new Response(luong, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // ⛔ đừng để proxy gom lại rồi trả một cục
    },
  });
}
