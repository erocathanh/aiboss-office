import { NextRequest, NextResponse } from 'next/server';
import { getIsRunnerStarting } from '@/lib/office-runner';
import { getApprovals, sanitizeApprovalItem } from '@/lib/approvals-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUS_FILTERS = new Set([
  'pending',
  'requested',
  'approved',
  'denied',
  'executed',
  'failed',
  'expired',
]);

/**
 * GET /api/approvals?status=pending|approved|denied|executed|expired&limit=50
 * Returns approval items with their derived state from the append-only approvals ledger.
 */
export async function GET(req: NextRequest) {
  if (getIsRunnerStarting()) {
    return NextResponse.json(
      {
        error: 'runner_starting',
        message: 'Office runner is starting up and waiting for startup lock.',
      },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const statusRaw = searchParams.get('status');
    const seatRaw = searchParams.get('seat');
    const limitRaw = searchParams.get('limit');

    let status: string | undefined;
    if (statusRaw !== null && statusRaw.trim() !== '') {
      const normalized = statusRaw.trim().toLowerCase();
      if (!VALID_STATUS_FILTERS.has(normalized)) {
        return NextResponse.json(
          {
            error: 'invalid_status',
            message:
              'Invalid status filter. Must be one of: pending, approved, denied, executed, failed, expired.',
          },
          { status: 400 }
        );
      }
      status = normalized;
    }

    let limit = 50;
    if (limitRaw !== null) {
      if (!/^\d+$/.test(limitRaw)) {
        return NextResponse.json(
          {
            error: 'invalid_limit',
            message: 'Invalid limit parameter. Must be an integer between 1 and 500.',
          },
          { status: 400 }
        );
      }
      limit = parseInt(limitRaw, 10);
      if (limit < 1 || limit > 500) {
        return NextResponse.json(
          {
            error: 'invalid_limit',
            message: 'Limit out of range. Must be between 1 and 500.',
          },
          { status: 400 }
        );
      }
    }

    const seat = seatRaw && seatRaw.trim() ? seatRaw.trim() : undefined;
    const result = getApprovals({ status, seat, limit });

    return NextResponse.json({
      approvals: result.approvals.map(sanitizeApprovalItem),
      total: result.total,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'internal_error', message },
      { status: 500 }
    );
  }
}
