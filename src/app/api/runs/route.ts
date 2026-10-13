import { NextRequest, NextResponse } from 'next/server';
import { getRuns } from '@/lib/runs-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/runs?seat=<slug>&from=<ISO>&to=<ISO>&limit=50
 * Returns recent runs merged with corresponding wake data.
 * Validates limit (1-500, default 50) and date strings (returns 400 on error).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seat = searchParams.get('seat') ?? undefined;
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const limitRaw = searchParams.get('limit');

    let limit = 50;
    if (limitRaw !== null) {
      if (!/^\d+$/.test(limitRaw)) {
        return NextResponse.json(
          { loi: 'Invalid limit parameter. Must be an integer between 1 and 500.' },
          { status: 400 }
        );
      }
      limit = parseInt(limitRaw, 10);
      if (limit < 1 || limit > 500) {
        return NextResponse.json(
          { loi: 'Limit out of range. Must be between 1 and 500.' },
          { status: 400 }
        );
      }
    }

    if (from !== undefined && isNaN(Date.parse(from))) {
      return NextResponse.json(
        { loi: 'Invalid `from` date parameter. Must be a valid ISO date string.' },
        { status: 400 }
      );
    }

    if (to !== undefined && isNaN(Date.parse(to))) {
      return NextResponse.json(
        { loi: 'Invalid `to` date parameter. Must be a valid ISO date string.' },
        { status: 400 }
      );
    }

    const runs = getRuns({ seat, from, to, limit });

    return NextResponse.json({
      runs,
      total: runs.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ loi: message }, { status: 500 });
  }
}
