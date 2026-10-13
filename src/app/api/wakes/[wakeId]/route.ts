import { NextRequest, NextResponse } from 'next/server';
import { getWake, sanitizeWake } from '@/lib/runs-ledger';

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

  return NextResponse.json({
    wake: sanitizeWake(wake),
  });
}
