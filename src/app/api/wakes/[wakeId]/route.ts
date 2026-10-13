import { NextRequest, NextResponse } from 'next/server';
import { getWake, computeCustomIdempotencyKey } from '@/lib/runs-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/wakes/<wakeId>
 * Returns status of a specific wakeup request.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wakeId: string }> }
) {
  const { wakeId } = await params;
  const cleanId = (wakeId ?? '').trim();

  if (!cleanId) {
    return NextResponse.json({ loi: 'Missing wakeId parameter.' }, { status: 400 });
  }

  const wake = getWake(cleanId);
  if (!wake) {
    return NextResponse.json({ loi: `Wake '${cleanId}' not found.`, wakeId: cleanId }, { status: 404 });
  }

  const safeWake = {
    ...wake,
    idempotencyKey: wake.idempotencyKey?.startsWith('custom:')
      ? computeCustomIdempotencyKey(wake.seatId, wake.idempotencyKey.slice(7))
      : wake.idempotencyKey,
  };

  return NextResponse.json({
    wake: safeWake,
  });
}
