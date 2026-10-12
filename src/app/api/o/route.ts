import { NextRequest } from 'next/server';
import { layTatCa, datO } from '@/lib/kho-phien';
import { bindingOf, isWriteBinding, sameBinding } from '@/components/ung-dung/nap-bo-ghe';
import { coPhien } from '@/lib/doc-phien';
import { timNhanSu } from '@/lib/nhan-su';
import { ghiVetGhiRong } from '@/lib/vet-mat-lien-ket';
import { claimSeat, releaseSeat } from '@/lib/seat-active';
import { thuMucAgent } from '@/lib/doc-phien';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/o  → ô nào đang mở phiên nào (khôi phục sau khi tắt trình duyệt/máy chủ)
 * POST /api/o  → ghi lại lựa chọn của Owner
 */
export async function GET() {
  return Response.json({ o: layTatCa() });
}

export async function POST(req: NextRequest) {
  let than: { ma_o?: unknown; ma_nhan_su?: unknown; ma_phien?: unknown; xoa_lien_ket?: unknown; binding?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const maO = typeof than.ma_o === 'string' ? than.ma_o.trim() : '';
  if (!/^o-\d+$/.test(maO)) return Response.json({ loi: 'Mã ô không hợp lệ.' }, { status: 400 });

  const maNhanSu = typeof than.ma_nhan_su === 'string' ? than.ma_nhan_su.trim() : null;
  const maPhien = typeof than.ma_phien === 'string' ? than.ma_phien.trim() : null;
  // Body decoding may finish after another request has replaced this binding.
  if (!isWriteBinding(than.binding) || !sameBinding(bindingOf(layTatCa()[maO]), than.binding)) {
    return Response.json({ xong: false, bo_qua: 'loi-thoi', loi: 'Liên kết ô đã đổi. Đọc lại ô trước khi ghi.' }, { status: 409 });
  }

  if (maNhanSu && !timNhanSu(maNhanSu)) {
    return Response.json({ loi: 'Không có nhân sự này.' }, { status: 404 });
  }
  // ⛔ Chốt chặn: chỉ nhận phiên CÓ THẬT trong kho của ĐÚNG nhân sự đó.
  //    Nếu không, trình duyệt có thể trỏ ô sang phiên của dự án khác trên máy.
  if (maPhien && (!maNhanSu || !coPhien(maNhanSu, maPhien))) {
    return Response.json({ loi: 'Phiên không thuộc nhân sự này.' }, { status: 400 });
  }

  /**
   * 🛡 CHỐT CHỐNG XOÁ VÔ Ý (17/08/2026 — sinh từ ca thật, ⛔ đừng gỡ).
   *
   * Ghi mã phiên RỖNG lên ô ĐANG CÓ mã phiên = hành động ⛔ KHÔNG LÙI ĐƯỢC:
   * xoá rồi thì giao diện ⛔ không có đường nối lại, Owner mất cả lịch sử làm việc.
   * Ca thật: `fetch('/api/o')` thất bại → client tưởng sổ trắng → xin ghi rỗng.
   *
   * ⇒ Muốn xoá thì phải KHAI Ý ĐỊNH: `xoa_lien_ket: true`.
   *   Đóng ô · tạo phiên mới · chọn ghế chưa có phiên = ý định THẬT, có khai cờ.
   *   Còn "tôi tưởng sổ trắng" thì ⛔ KHÔNG phải ý định ⇒ giữ nguyên + ghi vệt.
   * ⚠️ Chỉ áp khi CÙNG nhân sự — đổi sang người khác thì mã phiên cũ vốn ⛔ không dùng được.
   */
  const xoaLienKet = than.xoa_lien_ket === true;
  if (maNhanSu && !maPhien && !xoaLienKet) {
    const cu = layTatCa()[maO];
    if (cu?.ma_phien && cu.ma_nhan_su === maNhanSu) {
      ghiVetGhiRong(maO, maNhanSu, cu.ma_phien);
      return Response.json({
        xong: true,
        bo_qua: 'giu-lien-ket',
        ma_phien: cu.ma_phien,
        vi_sao: 'Xin ghi mã phiên rỗng lên ô đang có phiên mà ⛔ không khai ý định xoá ⇒ giữ nguyên.',
      });
    }
  }

  if (!datO(maO, maNhanSu, maPhien, than.binding)) {
    return Response.json({ xong: false, bo_qua: 'loi-thoi' }, { status: 409 });
  }

  if (maNhanSu && maPhien) {
    try {
      claimSeat(maNhanSu, {
        tool: 'app',
        sessionId: maPhien,
        pid: null,
        cwd: thuMucAgent(maNhanSu),
      });
    } catch {}
  } else if (maNhanSu && !maPhien && xoaLienKet) {
    try {
      releaseSeat(maNhanSu, 'session_changed');
    } catch {}
  }
  return Response.json({ xong: true });
}
