import { NextRequest, NextResponse } from 'next/server';
import { readSeatActive, isSeatHeldByTerminal } from '@/lib/seat-active';
import { timNhanSu, dsNhanSu } from '@/lib/nhan-su';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ seat: string }> }
) {
  const { seat } = await params;
  const seatId = (seat ?? '').trim();

  if (!seatId) {
    return NextResponse.json({ loi: 'Missing seat identifier.' }, { status: 400 });
  }

  let ns = timNhanSu(seatId);
  if (!ns) {
    // Guard against startup race condition: poll up to 600ms
    const start = Date.now();
    while (!ns && Date.now() - start < 600) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      ns = timNhanSu(seatId);
    }
  }

  if (!ns) {
    if (dsNhanSu().length === 0) {
      return NextResponse.json(
        { loi: 'Roster loading. The personnel directory is initializing.', status: 'roster_loading' },
        { status: 503, headers: { 'Retry-After': '1' } }
      );
    }
    return NextResponse.json({ loi: `Seat '${seatId}' not found.` }, { status: 404 });
  }

  const active = readSeatActive(seatId);
  const { isHeld, reason } = isSeatHeldByTerminal(seatId);

  return NextResponse.json({
    seat: seatId,
    active,
    is_terminal_held: isHeld,
    reason: isHeld ? reason : undefined,
    resume_cmd: active?.resume_cmd ?? (ns.thu_muc ? `cd '${ns.thu_muc}' && claude` : null),
  });
}
