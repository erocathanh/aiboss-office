import { NextRequest, NextResponse } from 'next/server';
import { getBudgetStatus } from '@/lib/budget-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/budget?seat=<slug>
 * Returns budget status including daily cap, spent, held, unpriced runs, remaining, and state.
 * If no seat is provided, returns aggregated office-level budget status.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seat = searchParams.get('seat') ?? undefined;

    const status = getBudgetStatus(seat);
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ loi: message }, { status: 500 });
  }
}
