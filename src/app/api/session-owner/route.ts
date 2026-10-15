import { NextRequest } from 'next/server';
import { bindingOf, isWriteBinding, sameBinding } from '@/components/ung-dung/nap-bo-ghe';
import { dsPhien, phienCoTienTrinhSong } from '@/lib/doc-phien';
import { layTatCa, datO } from '@/lib/kho-phien';
import { dsViec, datCho, traCho } from '@/lib/kho-tien-trinh';
import { timNhanSu } from '@/lib/nhan-su';
import { oTrongTam } from '@/lib/so-o';
import { confirmOwnership } from '@/lib/so-so-huu';
import { serverNoticeJson } from '@/lib/server-notices';

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
    return serverNoticeJson(req, 'sessionOwner.sameOriginRequired', undefined, 403);
  }
  let body;
  try { body = await req.json(); } catch {
    return serverNoticeJson(req, 'chat.invalidJson', undefined, 400);
  }
  if (!body || typeof body !== 'object') {
    return serverNoticeJson(req, 'sessionOwner.invalidRequest', undefined, 400);
  }
  const { ma_o: slot, ma_nhan_su: seat, ma_phien: session, binding } = body;
  if (typeof slot !== 'string' || !oTrongTam(slot) || typeof seat !== 'string'
      || !timNhanSu(seat) || typeof session !== 'string' || !/^[0-9a-fA-F-]{8,64}$/.test(session)
      || !isWriteBinding(binding)) {
    return serverNoticeJson(req, 'sessionOwner.invalidParams', undefined, 400);
  }
  if (!datCho(slot)) {
    return serverNoticeJson(req, 'sessionOwner.slotBusy', undefined, 409);
  }
  let confirmed = false;
  try {
    const slots = layTatCa();
    const current = slots[slot];
    if (!sameBinding(bindingOf(current), binding) || current?.ma_nhan_su !== seat) {
      return serverNoticeJson(req, 'sessionOwner.bindingChanged', undefined, 409);
    }
    // No own-turn exemption: recent writes are conservatively blocked on this manual path.
    const candidate = dsPhien(seat).find(row => row.ma === session);
    if (!candidate) {
      return serverNoticeJson(req, 'sessionOwner.sessionNotFound', undefined, 404);
    }
    const running = dsViec();
    if (candidate.dang_chay || phienCoTienTrinhSong(session) || running.some(row =>
      row.ma_o === slot || row.ma_nhan_su === seat || slots[row.ma_o]?.ma_phien === session)) {
      return serverNoticeJson(req, 'sessionOwner.sessionActive', undefined, 409);
    }
    // Reuse the CLI's only Owner ledger writer. Keep all checks and writes synchronous.
    confirmOwnership(session, seat, [seat]);
    confirmed = true;
    if (!datO(slot, seat, session, binding)) {
      return serverNoticeJson(
        req,
        'sessionOwner.confirmedButSlotChanged',
        undefined,
        409,
        { owner_confirmed: true },
      );
    }
    return Response.json({ xong: true, owner_confirmed: true, ma_phien: session });
  } catch {
    return serverNoticeJson(
      req,
      confirmed ? 'sessionOwner.confirmedButSlotWriteFailed' : 'sessionOwner.confirmFailed',
      undefined,
      500,
      { owner_confirmed: confirmed },
    );
  } finally { traCho(slot); }
}
