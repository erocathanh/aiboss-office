import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getBudgetStatus } from '@/lib/budget-ledger';
import { getOfficeConfig } from '@/lib/office-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getKnownSeats(): Set<string> {
  const known = new Set<string>();
  const config = getOfficeConfig();
  if (config.budget?.seats) {
    for (const k of Object.keys(config.budget.seats)) {
      known.add(k);
    }
  }
  try {
    const seatsPath = path.join(process.cwd(), 'data', 'seats.json');
    if (fs.existsSync(seatsPath)) {
      const seats = JSON.parse(fs.readFileSync(seatsPath, 'utf-8'));
      if (Array.isArray(seats)) {
        for (const s of seats) {
          if (s && typeof s.seat_id === 'string') {
            known.add(s.seat_id);
          }
        }
      }
    }
  } catch {
    /* fallback */
  }
  return known;
}

/**
 * GET /api/budget?seat=<slug>
 * Returns budget status including daily cap, spent, held, unpriced runs, remaining, and state.
 * If no seat is provided, returns aggregated office-level budget status.
 * If an unknown seat slug is requested, returns 404 with error details.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seat = searchParams.get('seat') ?? undefined;

    if (seat) {
      const knownSeats = getKnownSeats();
      if (!knownSeats.has(seat)) {
        return NextResponse.json(
          {
            error: 'unknown_seat',
            seat,
            message: `Seat '${seat}' is not recognized in the office catalog`,
          },
          { status: 404 }
        );
      }
    }

    const status = getBudgetStatus(seat);
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ loi: message }, { status: 500 });
  }
}
