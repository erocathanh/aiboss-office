import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getIsRunnerStarting } from '@/lib/office-runner';
import {
  ApprovalIoError,
  ApprovalLedgerUnreadableError,
  ApprovalLockTimeoutError,
  recordApprovalDecision,
  sanitizeApprovalItem,
  trimAscii,
  type ApprovalDecisionActor,
  type ApprovalDecisionValue,
} from '@/lib/approvals-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function isStrictLocalhostHost(rawHost: string): boolean {
  const trimmed = trimAscii(rawHost).toLowerCase();
  if (!trimmed) {
    return false;
  }
  let hostname = trimmed;
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx < 0) return false;
    hostname = trimmed.slice(0, closeIdx + 1);
  } else {
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx >= 0) {
      hostname = trimmed.slice(0, colonIdx);
    }
  }
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

/**
 * Resolve decision actor (F7, F13):
 * - When `PHONGBAN_USER` and `PHONGBAN_PASS` are configured:
 *   Basic Auth is mandatory EVEN from `localhost` / `127.0.0.1` (F13),
 *   compared in constant time via `crypto.timingSafeEqual` on SHA-256 digests.
 *   Missing or wrong credentials return HTTP 401; valid credentials return `by: 'owner'`.
 * - Only when `PHONGBAN_USER` / `PHONGBAN_PASS` are NOT configured:
 *   strict loopback (`localhost`, `127.0.0.1`, `[::1]`; empty `Host` is rejected) is exempted as `by: 'localhost'`,
 *   while non-localhost requests return HTTP 503.
 */
function resolveDecisionActor(req: NextRequest): {
  allowed: boolean;
  by?: ApprovalDecisionActor;
  status?: number;
  message?: string;
} {
  const authHeader = req.headers.get('authorization') || '';
  const host = req.headers.get('host') || '';
  const isLocalhost = isStrictLocalhostHost(host);

  const envUser = process.env.PHONGBAN_USER;
  const envPass = process.env.PHONGBAN_PASS;
  const hasConfiguredAuth = Boolean(envUser && envPass);

  if (hasConfiguredAuth && envUser && envPass) {
    if (!authHeader.startsWith('Basic ')) {
      return {
        allowed: false,
        status: 401,
        message: 'Authentication required.',
      };
    }
    try {
      const decoded = Buffer.from(trimAscii(authHeader.slice(6)), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx >= 0) {
        const u = decoded.slice(0, idx);
        const p = decoded.slice(idx + 1);
        const userOk = timingSafeStringEqual(u, envUser);
        const passOk = timingSafeStringEqual(p, envPass);
        if (userOk && passOk) {
          return { allowed: true, by: 'owner' };
        }
      }
    } catch {
      /* fall through */
    }
    return {
      allowed: false,
      status: 401,
      message: 'Invalid Basic Auth credentials.',
    };
  }

  if (isLocalhost) {
    return { allowed: true, by: 'localhost' };
  }

  return {
    allowed: false,
    status: 503,
    message: 'Authentication is not configured on this server.',
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
 * - Invalid decision or invalid/overlong note (> 200 Unicode code points, or note: null) -> 400 (0 ledger writes)
 * - Lock timeout / ledger unreadable / I/O error -> 503 with generic message (no raw error leak)
 * - Server always computes expiresAt from configured TTL via `approval_ledger.py decide` (F8: client expiresAt is ignored)
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
  const requestId = trimAscii(resolvedParams?.requestId || '').toLowerCase();
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

  // F6: Validate `note` type (including rejecting `note: null`) and Unicode code point length (<= 200)
  // BEFORE calling CLI (0 bytes written on failure).
  let note: string | undefined;
  if ('note' in body && body.note !== undefined) {
    if (typeof body.note !== 'string') {
      return NextResponse.json(
        {
          error: 'invalid_note',
          message: 'Field `note` must be a string.',
        },
        { status: 400 }
      );
    }
    if (Array.from(body.note).length > 200) {
      return NextResponse.json(
        {
          error: 'note_too_long',
          message: 'Field `note` must not exceed 200 characters.',
        },
        { status: 400 }
      );
    }
    note = body.note;
  }

  try {
    const result = recordApprovalDecision({
      requestId,
      decision: decision as ApprovalDecisionValue,
      by: auth.by,
      ...(note !== undefined ? { note } : {}),
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
    const code = (err as { code?: string })?.code;
    if (err instanceof ApprovalLockTimeoutError || code === 'lock_timeout') {
      return NextResponse.json(
        {
          error: 'lock_timeout',
          status: 'lock_timeout',
          message: 'Timed out waiting for approval ledger lock.',
        },
        { status: 503 }
      );
    }
    if (err instanceof ApprovalLedgerUnreadableError || code === 'ledger_unreadable') {
      return NextResponse.json(
        {
          error: 'ledger_unreadable',
          status: 'ledger_unreadable',
          message: 'Approval ledger is currently unreadable.',
        },
        { status: 503 }
      );
    }
    if (
      err instanceof ApprovalIoError ||
      code === 'io_error' ||
      (typeof code === 'string' && code.startsWith('E'))
    ) {
      return NextResponse.json(
        {
          error: 'io_error',
          status: 'io_error',
          message: 'Approval ledger I/O error.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'internal_error', message: 'Internal server error.' },
      { status: 500 }
    );
  }
}
