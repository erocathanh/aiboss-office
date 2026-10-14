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

/**
 * Resolve decision actor (F7):
 * - `owner` ONLY when `PHONGBAN_USER` and `PHONGBAN_PASS` are configured and
 *   the `Authorization: Basic ...` header matches both credentials.
 * - When `PHONGBAN_USER` / `PHONGBAN_PASS` are not configured, `by` is never `owner`.
 * - Requests exempted by localhost (per middleware.ts) without valid matching Basic Auth
 *   are attributed as `localhost`.
 */
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

  const envUser = process.env.PHONGBAN_USER;
  const envPass = process.env.PHONGBAN_PASS;
  const hasConfiguredAuth = Boolean(envUser && envPass);

  if (hasConfiguredAuth && authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx >= 0) {
        const u = decoded.slice(0, idx);
        const p = decoded.slice(idx + 1);
        if (u === envUser && p === envPass) {
          return { allowed: true, by: 'owner' };
        }
      }
    } catch {
      /* fall through */
    }
    if (!isLocalhost) {
      return {
        allowed: false,
        status: 401,
        message: 'Invalid Basic Auth credentials.',
      };
    }
  }

  if (isLocalhost) {
    return { allowed: true, by: 'localhost' };
  }

  if (!hasConfiguredAuth) {
    return {
      allowed: false,
      status: 503,
      message: 'Authentication is not configured on this server.',
    };
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
}

/**
 * POST /api/approvals/<requestId>/decision
 * Body: { decision: "approved" | "denied", note?: string }
 * - Unknown requestId -> 404
 * - Already decided requestId -> 409
 * - Invalid decision or invalid/overlong note (> 200 chars) -> 400 (no ledger write)
 * - Server always computes expiresAt from configured TTL (F8: client expiresAt is ignored)
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

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
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

  // F6: Validate `note` type and length (<= 200 chars) BEFORE calling ledger
  let note: string | undefined;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      return NextResponse.json(
        {
          error: 'invalid_note',
          message: 'Field `note` must be a string.',
        },
        { status: 400 }
      );
    }
    if (body.note.length > 200 || body.note.trim().length > 200) {
      return NextResponse.json(
        {
          error: 'note_too_long',
          message: 'Field `note` must not exceed 200 characters.',
        },
        { status: 400 }
      );
    }
    const trimmedNote = body.note.trim();
    if (trimmedNote.length > 0) {
      note = trimmedNote;
    }
  }

  try {
    const result = recordApprovalDecision({
      requestId,
      decision: decision as ApprovalDecisionValue,
      by: auth.by,
      note,
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
