import { NextRequest, NextResponse } from 'next/server';
import { getCostsAggregation } from '@/lib/costs-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/costs?seat=<slug>&from=<ISO>&to=<ISO>
 * Returns token and cost aggregations per seat and per day.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seat = searchParams.get('seat') ?? undefined;
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;

    const aggregation = getCostsAggregation({ seat, from, to });

    return NextResponse.json(aggregation);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ loi: message }, { status: 500 });
  }
}
