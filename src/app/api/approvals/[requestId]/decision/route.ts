import { NextRequest, NextResponse } from 'next/server';
import { getIsRunnerStarting } from '@/lib/office-runner';
import {
  recordApprovalDecision,
  sanitizeApprovalItem,
  type ApprovalDecisionActor,
  type ApprovalDecisionValue,
} from '@/lib/approvals-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveDecisionActor(req: NextRequest): {
  allowed: boolean;
  by?: ApprovalDecisionActor;
  status?: number;
  message?: string;
} {
  const authHeader = req.headers.get('authorization') || '';
  const host = (req.headers.get('host') || '').toLowerCase();
  const isLocalhost =
    !host ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('localhost') ||
    host.startsWith('[::1]');

  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx >= 0) {
        const u = decoded.slice(0, idx);
        const p = decoded.slice(idx + 1);
        const envUser = process.env.PHONGBAN_USER;
        const envPass = process.env.PHONGBAN_PASS;
        if (envUser && envPass) {
          if (u === envUser && p === envPass) {
            return { allowed: true, by: 'owner' };
          }
          if (!isLocalhost) {
            return {
              allowed: false,
              status: 401,
              message: 'Invalid Basic Auth credentials.',
            };
          }
        }
        if (u.length > 0) {
          return { allowed: true, by: 'owner' };
        }
      }
    } catch {
      if (!isLocalhost) {
        return {
          allowed: false,
          status: 401,
          message: 'Malformed Basic Auth header.',
        };
      }
    }
  }

  if (isLocalhost) {
    return { allowed: true, by: 'localhost' };
  }

  return {
    allowed: false,
    status: 401,
    message: 'Authentication required.',
  };
}

interface DecisionRequestBody {
  decision?: unknown;
  note?: unknown;
  expiresAt?: unknown;
}

/**
 * POST /api/approvals/<requestId>/decision
 * Body: { decision: "approved" | "denied", note?: string, expiresAt?: string }
 * - Unknown requestId -> 404
 * - Already decided requestId -> 409
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  if (getIsRunnerStarting()) {
    return NextResponse.json(
      {
        error: 'runner_starting',
        message: 'Office runner is starting up and waiting for startup lock.',
      },
      { status: 503 }
    );
  }

  const auth = resolveDecisionActor(req);
  if (!auth.allowed || !auth.by) {
    return NextResponse.json(
      { error: 'unauthorized', message: auth.message || 'Authentication required.' },
      { status: auth.status || 401 }
    );
  }

  const resolvedParams = await Promise.resolve(context.params);
  const requestId = (resolvedParams?.requestId || '').trim().toLowerCase();
  if (!requestId) {
    return NextResponse.json(
      { error: 'invalid_request_id', message: 'Missing requestId parameter.' },
      { status: 400 }
    );
  }

  let body: DecisionRequestBody;
  try {
    body = (await req.json()) as DecisionRequestBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Invalid JSON request body.' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const decision = body.decision;
  if (decision !== 'approved' && decision !== 'denied') {
    return NextResponse.json(
      {
        error: 'invalid_decision',
        message: 'Field `decision` must be "approved" or "denied".',
      },
      { status: 400 }
    );
  }

  const note =
    typeof body.note === 'string' && body.note.trim().length > 0
      ? body.note.trim().slice(0, 200)
      : undefined;

  let expiresAt: string | undefined;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    if (typeof body.expiresAt !== 'string' || Number.isNaN(Date.parse(body.expiresAt))) {
      return NextResponse.json(
        {
          error: 'invalid_expires_at',
          message: 'Field `expiresAt` must be a valid ISO date string.',
        },
        { status: 400 }
      );
    }
    expiresAt = new Date(body.expiresAt).toISOString();
  }

  try {
    const result = recordApprovalDecision({
      requestId,
      decision: decision as ApprovalDecisionValue,
      by: auth.by,
      note,
      expiresAt,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.code,
          message: result.message,
          ...(result.item ? { approval: sanitizeApprovalItem(result.item) } : {}),
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      approval: sanitizeApprovalItem(result.item),
      decision: result.decisionRecord,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'internal_error', message },
      { status: 500 }
    );
  }
}
