import { NextRequest } from 'next/server';
import { chayAgent } from '@/lib/chay-agent';
import { CAU_HINH, loiDanHeThong } from '@/lib/cau-hinh';
import { xinLuot, moLuot, dongLuot, nhanDangKhach } from '@/lib/chan-muc-dung';
import { layO, datO, ghiMocKetThuc } from '@/lib/kho-phien';
import { thuMucAgent, dangChay, coPhien, mocTepPhien, NGUONG_SONG_PHUT } from '@/lib/doc-phien';
import { timNhanSu } from '@/lib/nhan-su';

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
    matBanGhi = true;
    maPhienCu = null;
    datO(maO, maNhanSu, null); // xoá liên kết hỏng
  }

  // ⛔ LUẬT CỨNG: ⛔ TUYỆT ĐỐI KHÔNG resume phiên ĐANG CHẠY ở terminal khác.
  //    Hai tiến trình cùng ghi một tệp phiên = hỏng bản ghi.
  if (maPhienCu && dangChay(maNhanSu, maPhienCu, o?.moc_ket_thuc ?? null)) {
    return Response.json(
      {
        loi:
          `Phiên này vừa đổi trong ${NGUONG_SONG_PHUT} phút — nhiều khả năng ĐANG CHẠY ở terminal khác. ` +
          'Nối vào lúc này sẽ hỏng bản ghi phiên. Hãy đóng phiên bên kia, hoặc mở phiên mới.',
      },
      { status: 409 },
    );
  }

  // ⛔ Chặn mức dùng TRƯỚC khi đẻ tiến trình — agent chạy hoang = tiền thật.
  const chan = xinLuot(khach);
  if (!chan.cho_qua) {
    return Response.json(
      { loi: chan.ly_do, cho_giay: chan.cho_giay },
      { status: 429, headers: { 'Retry-After': String(chan.cho_giay) } },
    );
  }

  const huy = new AbortController();
  req.signal.addEventListener('abort', () => huy.abort());

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
              'Không tìm thấy bản ghi phiên cũ trên đĩa — đã bỏ liên kết và mở PHIÊN MỚI. ' +
              'Ngữ cảnh trước đó KHÔNG còn.',
          }));
        }

        for await (const mau of chayAgent({
          cauHoi,
          maPhienCu,
          thuMuc: thuMucAgent(maNhanSu),
          loiDan: loiDanHeThong(ns.nhan, ns.vai, ns.ten_phong),
          tinHieuHuy: huy.signal,
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
        // ⭐ Ghi mốc "lượt của TA vừa xong" để lượt SAU không bị chính ta chặn nhầm.
        if (maPhienDaDung) {
          const m = mocTepPhien(maNhanSu, maPhienDaDung);
          if (m !== null) ghiMocKetThuc(maO, m);
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
      huy.abort();
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
