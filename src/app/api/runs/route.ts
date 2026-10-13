import { NextRequest, NextResponse } from 'next/server';
import { getRuns } from '@/lib/runs-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/runs?seat=<slug>&from=<ISO>&to=<ISO>&limit=50
 * Returns recent runs merged with corresponding wake data.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seat = searchParams.get('seat') ?? undefined;
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const limitRaw = searchParams.get('limit');
    const limit = limitRaw ? parseInt(limitRaw, 10) : 50;

    const runs = getRuns({ seat, from, to, limit: isNaN(limit) ? 50 : limit });

    return NextResponse.json({
      runs,
      total: runs.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ loi: message }, { status: 500 });
  }
}
