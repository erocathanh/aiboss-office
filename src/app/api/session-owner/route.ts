import { NextRequest } from 'next/server';
import { bindingOf, isWriteBinding, sameBinding } from '@/components/ung-dung/nap-bo-ghe';
import { dsPhien, phienCoTienTrinhSong } from '@/lib/doc-phien';
import { layTatCa, datO } from '@/lib/kho-phien';
import { dsViec, datCho, traCho } from '@/lib/kho-tien-trinh';
import { timNhanSu } from '@/lib/nhan-su';
import { oTrongTam } from '@/lib/so-o';
import { confirmOwnership } from '@/lib/so-so-huu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This is an explicit Owner UI entry point, never an automatic observation path.
export async function POST(req: NextRequest) {
  // Next may construct nextUrl with its listening hostname, not the browser's LAN Host.
  // Browser JS cannot override Host; this is CSRF protection, not local-agent authentication.
  let sameOrigin = false;
  try {
    const host = req.headers.get('host');
    sameOrigin = !!host && req.headers.get('origin') === new URL(`${req.nextUrl.protocol}//${host}`).origin;
  } catch { /* Invalid or absent origin/host fails closed. */ }
  if (!sameOrigin) {
    return Response.json({ loi: 'Chỉ nhận thao tác nối từ chính trang ứng dụng.' }, { status: 403 });
  }
  let body;
  try { body = await req.json(); } catch {
    return Response.json({ loi: 'Yêu cầu không phải JSON.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') return Response.json({ loi: 'Yêu cầu không hợp lệ.' }, { status: 400 });
  const { ma_o: slot, ma_nhan_su: seat, ma_phien: session, binding } = body;
  if (typeof slot !== 'string' || !oTrongTam(slot) || typeof seat !== 'string'
      || !timNhanSu(seat) || typeof session !== 'string' || !/^[0-9a-fA-F-]{8,64}$/.test(session)
      || !isWriteBinding(binding)) {
    return Response.json({ loi: 'Ô, ghế hoặc mã phiên không hợp lệ.' }, { status: 400 });
  }
  if (!datCho(slot)) return Response.json({ loi: 'Ô đang mở lượt. Chờ lượt xong rồi nối.' }, { status: 409 });
  let confirmed = false;
  try {
    const slots = layTatCa();
    const current = slots[slot];
    if (!sameBinding(bindingOf(current), binding) || current?.ma_nhan_su !== seat) {
      return Response.json({ loi: 'Liên kết ô đã đổi. Đóng rồi mở lại thông tin trước khi nối.' }, { status: 409 });
    }
    // No own-turn exemption: recent writes are conservatively blocked on this manual path.
    const candidate = dsPhien(seat).find(row => row.ma === session);
    if (!candidate) return Response.json({ loi: 'Không thấy phiên thật trong thư mục ghế này.' }, { status: 404 });
    const running = dsViec();
    if (candidate.dang_chay || phienCoTienTrinhSong(session) || running.some(row =>
      row.ma_o === slot || row.ma_nhan_su === seat || slots[row.ma_o]?.ma_phien === session)) {
      return Response.json({ loi: 'Ô hoặc phiên có dấu hiệu đang chạy; chờ lượt xong và hết 5 phút từ lần ghi cuối rồi thử lại.' }, { status: 409 });
    }
    // Reuse the CLI's only Owner ledger writer. Keep all checks and writes synchronous.
    confirmOwnership(session, seat, [seat]);
    confirmed = true;
    if (!datO(slot, seat, session, binding)) {
      return Response.json({ loi: 'Đã ghi xác nhận sở hữu nhưng liên kết ô đã đổi; mở lại thông tin để kiểm tra.', owner_confirmed: true }, { status: 409 });
    }
    return Response.json({ xong: true, owner_confirmed: true, ma_phien: session });
  } catch {
    return Response.json({
      loi: confirmed ? 'Đã ghi xác nhận sở hữu nhưng chưa ghi được sổ ô. Mở lại thông tin rồi thử nối lại.' : 'Không ghi được xác nhận sở hữu. Sổ có thể lỗi hoặc không đọc được.',
      owner_confirmed: confirmed,
    }, { status: 500 });
  } finally { traCho(slot); }
}
