/**
 * approvals-ledger.ts — Approval Ledger State Machine (A-4)
 *
 * Implements append-only approval ledger in operations/data/approvals/<YYYY-MM-DD>.jsonl
 * connecting hook requests -> digest -> owner/localhost decision -> execution.
 *
 * Record types in the same daily JSONL file:
 * 1. request (written by hook guard_bulk_send.py without `type`, or with `type: "request"`):
 *    { ts, seat, tool, host, len, sha256, head60, reason }
 *    Deterministic requestId = first 16 lowercase hex chars of sha256(ts + "|" + seat + "|" + tool + "|" + sha256)
 * 2. decision (written by server):
 *    { type: "decision", requestId, decision: "approved" | "denied", by: "owner" | "localhost", at, note?, expiresAt }
 * 3. execution (written by server / approval_mark.py):
 *    { type: "execution", requestId, runId?, seatId, at, result: "executed" | "failed" | "digest_mismatch" | "expired", digest }
 *
 * State machine derived purely from ledger:
 *   requested (pending) -> approved | denied -> executed | failed | expired
 *   - `approved` is NEVER displayed as `executed`.
 *   - `approved` past `expiresAt` without execution -> derived as `expired`.
 *   - Single-use per `requestId`: a `requestId` can only be executed once.
 *   - Strict field whitelist on all read/write/API paths (zero prompt/turn text/PII leakage).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getOfficeConfig } from '@/lib/office-config';
import { isFenced, isFenceGuardDisabledForTest } from '@/lib/budget-ledger';

export type ApprovalDecisionValue = 'approved' | 'denied';
export type ApprovalDecisionActor = 'owner' | 'localhost';
export type ApprovalExecutionResult = 'executed' | 'failed' | 'digest_mismatch' | 'expired';
export type ApprovalDerivedState =
  | 'requested'
  | 'approved'
  | 'denied'
  | 'executed'
  | 'failed'
  | 'expired';
export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'executed'
  | 'failed'
  | 'expired';

export interface ApprovalRequestRecord {
  type: 'request';
  requestId: string;
  ts: string;
  seat: string;
  tool: string;
  host: string;
  len: number;
  sha256: string;
  head60: string;
  reason: string;
}

export interface ApprovalDecisionRecord {
  type: 'decision';
  requestId: string;
  decision: ApprovalDecisionValue;
  by: ApprovalDecisionActor;
  at: string;
  note?: string;
  expiresAt: string;
}

export interface ApprovalExecutionRecord {
  type: 'execution';
  requestId: string;
  runId?: string;
  seatId: string;
  at: string;
  result: ApprovalExecutionResult;
  digest: string;
}

export type ApprovalLedgerRecord =
  | ApprovalRequestRecord
  | ApprovalDecisionRecord
  | ApprovalExecutionRecord;

export interface ApprovalItem {
  requestId: string;
  status: ApprovalStatus;
  state: ApprovalDerivedState;
  ts: string;
  seat: string;
  tool: string;
  host: string;
  len: number;
  sha256: string;
  head60: string;
  reason: string;
  decision: {
    decision: ApprovalDecisionValue;
    by: ApprovalDecisionActor;
    at: string;
    expiresAt: string;
    note?: string;
  } | null;
  execution: {
    result: ApprovalExecutionResult;
    at: string;
    digest: string;
    seatId: string;
    runId?: string;
  } | null;
  decidedBy?: ApprovalDecisionActor;
  decidedAt?: string;
  expiresAt?: string;
  note?: string;
  executedAt?: string;
  executionResult?: ApprovalExecutionResult;
  executionDigest?: string;
  runId?: string;
}

/**
 * Deterministic requestId formula shared between TypeScript server and Python hook scripts:
 * first 16 lowercase hex chars of sha256(ts + "|" + seat + "|" + tool + "|" + sha256).
 */
export function computeRequestId(
  ts: string,
  seat: string,
  tool: string,
  sha256: string
): string {
  const payload = `${ts}|${seat}|${tool}|${sha256}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

export function getApprovalsDir(): string {
  const baseDir =
    process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  return path.join(baseDir, 'approvals');
}

export function ensureApprovalsDir(): void {
  const dir = getApprovalsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getApprovalLogPathForDate(isoDateString?: string): string {
  ensureApprovalsDir();
  const dateObj = isoDateString ? new Date(isoDateString) : new Date();
  const validDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const dateStr = validDate.toISOString().split('T')[0];
  return path.join(getApprovalsDir(), `${dateStr}.jsonl`);
}

function getUtcDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Strictly sanitize a raw request record (hook line without `type` or with `type: "request"`).
 * Strips any non-whitelisted fields to guarantee zero prompt/PII leakage.
 */
export function sanitizeApprovalRequestRecord(
  raw: unknown
): ApprovalRequestRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== undefined && obj.type !== 'request') return null;

  const ts = typeof obj.ts === 'string' ? obj.ts.trim() : '';
  const seat = typeof obj.seat === 'string' ? obj.seat.trim() : '';
  const tool = typeof obj.tool === 'string' ? obj.tool.trim() : '';
  const sha256 = typeof obj.sha256 === 'string' ? obj.sha256.trim().toLowerCase() : '';
  if (!ts || !seat || !tool || !sha256) return null;

  const host = typeof obj.host === 'string' ? obj.host.trim() : '-';
  const len =
    typeof obj.len === 'number' && Number.isFinite(obj.len) && obj.len >= 0
      ? Math.floor(obj.len)
      : 0;
  const head60 =
    typeof obj.head60 === 'string' ? obj.head60.slice(0, 60) : '';
  const reason =
    typeof obj.reason === 'string' ? obj.reason.trim().slice(0, 120) : 'unknown';

  const requestId = computeRequestId(ts, seat, tool, sha256);

  return {
    type: 'request',
    requestId,
    ts,
    seat,
    tool,
    host,
    len,
    sha256,
    head60,
    reason,
  };
}

/**
 * Strictly sanitize a decision record.
 */
export function sanitizeApprovalDecisionRecord(
  raw: unknown
): ApprovalDecisionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'decision') return null;

  const requestId =
    typeof obj.requestId === 'string' ? obj.requestId.trim().toLowerCase() : '';
  const decision = obj.decision;
  const by = obj.by;
  const at = typeof obj.at === 'string' ? obj.at.trim() : '';
  const expiresAt = typeof obj.expiresAt === 'string' ? obj.expiresAt.trim() : '';

  if (
    !requestId ||
    (decision !== 'approved' && decision !== 'denied') ||
    (by !== 'owner' && by !== 'localhost') ||
    !at ||
    !expiresAt
  ) {
    return null;
  }

  const note =
    typeof obj.note === 'string' && obj.note.trim().length > 0
      ? obj.note.trim().slice(0, 200)
      : undefined;

  return {
    type: 'decision',
    requestId,
    decision,
    by,
    at,
    ...(note !== undefined ? { note } : {}),
    expiresAt,
  };
}

/**
 * Strictly sanitize an execution record.
 */
export function sanitizeApprovalExecutionRecord(
  raw: unknown
): ApprovalExecutionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'execution') return null;

  const requestId =
    typeof obj.requestId === 'string' ? obj.requestId.trim().toLowerCase() : '';
  const seatId = typeof obj.seatId === 'string' ? obj.seatId.trim() : '';
  const at = typeof obj.at === 'string' ? obj.at.trim() : '';
  const result = obj.result;
  const digest = typeof obj.digest === 'string' ? obj.digest.trim().toLowerCase() : '';

  if (
    !requestId ||
    !seatId ||
    !at ||
    (result !== 'executed' &&
      result !== 'failed' &&
      result !== 'digest_mismatch' &&
      result !== 'expired') ||
    !digest
  ) {
    return null;
  }

  const runId =
    typeof obj.runId === 'string' && obj.runId.trim().length > 0
      ? obj.runId.trim()
      : undefined;

  return {
    type: 'execution',
    requestId,
    ...(runId !== undefined ? { runId } : {}),
    seatId,
    at,
    result,
    digest,
  };
}

/**
 * Parse and sanitize a single JSONL line from approvals ledger.
 */
export function parseApprovalLedgerLine(
  line: string
): ApprovalLedgerRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type === 'decision') {
      return sanitizeApprovalDecisionRecord(raw);
    }
    if (raw.type === 'execution') {
      return sanitizeApprovalExecutionRecord(raw);
    }
    if (raw.type === undefined || raw.type === 'request') {
      return sanitizeApprovalRequestRecord(raw);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Explicit schema whitelist for external API exposure (like sanitizeRun).
 */
export function sanitizeApprovalItem(item: ApprovalItem): ApprovalItem {
  const sanitizedDecision = item.decision
    ? {
        decision: item.decision.decision,
        by: item.decision.by,
        at: item.decision.at,
        expiresAt: item.decision.expiresAt,
        ...(item.decision.note ? { note: item.decision.note.slice(0, 200) } : {}),
      }
    : null;

  const sanitizedExecution = item.execution
    ? {
        result: item.execution.result,
        at: item.execution.at,
        digest: item.execution.digest,
        seatId: item.execution.seatId,
        ...(item.execution.runId ? { runId: item.execution.runId } : {}),
      }
    : null;

  return {
    requestId: item.requestId,
    status: item.status,
    state: item.state,
    ts: item.ts,
    seat: item.seat,
    tool: item.tool,
    host: item.host,
    len: item.len,
    sha256: item.sha256,
    head60: item.head60.slice(0, 60),
    reason: item.reason,
    decision: sanitizedDecision,
    execution: sanitizedExecution,
    ...(sanitizedDecision
      ? {
          decidedBy: sanitizedDecision.by,
          decidedAt: sanitizedDecision.at,
          expiresAt: sanitizedDecision.expiresAt,
          ...(sanitizedDecision.note ? { note: sanitizedDecision.note } : {}),
        }
      : {}),
    ...(sanitizedExecution
      ? {
          executedAt: sanitizedExecution.at,
          executionResult: sanitizedExecution.result,
          executionDigest: sanitizedExecution.digest,
          ...(sanitizedExecution.runId ? { runId: sanitizedExecution.runId } : {}),
        }
      : {}),
  };
}

interface ParsedLedgerWithMeta {
  records: ApprovalLedgerRecord[];
  requestSourceFile: Map<string, string>;
}

function readApprovalFilesWithMeta(): ParsedLedgerWithMeta {
  const dir = getApprovalsDir();
  if (!fs.existsSync(dir)) {
    return { records: [], requestSourceFile: new Map() };
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  const records: ApprovalLedgerRecord[] = [];
  const requestSourceFile = new Map<string, string>();

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const parsed = parseApprovalLedgerLine(line);
        if (parsed) {
          records.push(parsed);
          if (parsed.type === 'request' && !requestSourceFile.has(parsed.requestId)) {
            requestSourceFile.set(parsed.requestId, filePath);
          }
        }
      }
    } catch {
      /* skip unreadable file gracefully */
    }
  }

  return { records, requestSourceFile };
}

export function readApprovalRecords(): ApprovalLedgerRecord[] {
  return readApprovalFilesWithMeta().records;
}

/**
 * Resolve target JSONL file for appending decision/execution records.
 * Writes to today's UTC file when the request came from today or yesterday;
 * if the request lives in a synthetic test fixture date file and today's file does not exist,
 * appends to the request's source file so single-file fixtures remain self-contained.
 */
function resolveTargetFileForRequest(
  requestSourceFile: string | undefined,
  atIso?: string
): string {
  ensureApprovalsDir();
  const now = atIso ? new Date(atIso) : new Date();
  const validNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const todayStr = getUtcDateString(validNow);
  const yesterday = new Date(validNow.getTime() - 86_400_000);
  const yesterdayStr = getUtcDateString(yesterday);

  const todayPath = path.join(getApprovalsDir(), `${todayStr}.jsonl`);
  if (requestSourceFile) {
    const base = path.basename(requestSourceFile, '.jsonl');
    if (base !== todayStr && base !== yesterdayStr && !fs.existsSync(todayPath)) {
      return requestSourceFile;
    }
  }
  return todayPath;
}

function appendApprovalRecord(
  record: ApprovalDecisionRecord | ApprovalExecutionRecord,
  targetFilePath?: string
): void {
  if (isFenced() && !isFenceGuardDisabledForTest()) {
    throw new Error('[approvals-ledger] Instance is fenced. Writes are barred.');
  }
  ensureApprovalsDir();
  const filePath = targetFilePath || getApprovalLogPathForDate(record.at);
  let lineObj: Record<string, unknown>;
  if (record.type === 'decision') {
    const sanitized = sanitizeApprovalDecisionRecord(record);
    if (!sanitized) {
      throw new Error('[approvals-ledger] Refusing to write invalid decision record.');
    }
    lineObj = { ...sanitized };
  } else {
    const sanitized = sanitizeApprovalExecutionRecord(record);
    if (!sanitized) {
      throw new Error('[approvals-ledger] Refusing to write invalid execution record.');
    }
    lineObj = { ...sanitized };
  }
  fs.appendFileSync(filePath, JSON.stringify(lineObj) + '\n', 'utf-8');
}

interface FoldedRequestState {
  request: ApprovalRequestRecord;
  decision: ApprovalDecisionRecord | null;
  primaryExecution: ApprovalExecutionRecord | null;
  allExecutions: ApprovalExecutionRecord[];
  sourceFile?: string;
}

function foldApprovalLedger(): Map<string, FoldedRequestState> {
  const { records, requestSourceFile } = readApprovalFilesWithMeta();
  const map = new Map<string, FoldedRequestState>();

  for (const r of records) {
    if (r.type === 'request') {
      if (!map.has(r.requestId)) {
        map.set(r.requestId, {
          request: r,
          decision: null,
          primaryExecution: null,
          allExecutions: [],
          sourceFile: requestSourceFile.get(r.requestId),
        });
      }
    } else if (r.type === 'decision') {
      const entry = map.get(r.requestId);
      // Only the first decision per requestId takes effect (immutable once decided)
      if (entry && entry.decision === null) {
        entry.decision = r;
      }
    } else if (r.type === 'execution') {
      const entry = map.get(r.requestId);
      if (entry) {
        entry.allExecutions.push(r);
        // First terminal execution (executed / failed / expired) consumes the single-use approval
        if (
          entry.primaryExecution === null &&
          (r.result === 'executed' || r.result === 'failed' || r.result === 'expired')
        ) {
          entry.primaryExecution = r;
        }
      }
    }
  }

  return map;
}

function buildApprovalItem(
  folded: FoldedRequestState,
  nowMs = Date.now()
): ApprovalItem {
  const { request, decision, primaryExecution, allExecutions } = folded;
  let state: ApprovalDerivedState = 'requested';
  let status: ApprovalStatus = 'pending';
  const effectiveExecution =
    primaryExecution ??
    (allExecutions.length > 0 ? allExecutions[allExecutions.length - 1] : null);

  if (!decision) {
    state = 'requested';
    status = 'pending';
  } else if (decision.decision === 'denied') {
    state = 'denied';
    status = 'denied';
  } else if (decision.decision === 'approved') {
    if (primaryExecution) {
      if (primaryExecution.result === 'executed') {
        state = 'executed';
        status = 'executed';
      } else if (primaryExecution.result === 'failed') {
        state = 'failed';
        status = 'failed';
      } else {
        state = 'expired';
        status = 'expired';
      }
    } else {
      const expMs = Date.parse(decision.expiresAt);
      if (!Number.isNaN(expMs) && nowMs >= expMs) {
        state = 'expired';
        status = 'expired';
      } else {
        // CRITICAL: approved without execution is NEVER displayed as executed
        state = 'approved';
        status = 'approved';
      }
    }
  }

  const item: ApprovalItem = {
    requestId: request.requestId,
    status,
    state,
    ts: request.ts,
    seat: request.seat,
    tool: request.tool,
    host: request.host,
    len: request.len,
    sha256: request.sha256,
    head60: request.head60,
    reason: request.reason,
    decision: decision
      ? {
          decision: decision.decision,
          by: decision.by,
          at: decision.at,
          expiresAt: decision.expiresAt,
          ...(decision.note ? { note: decision.note } : {}),
        }
      : null,
    execution: effectiveExecution
      ? {
          result: effectiveExecution.result,
          at: effectiveExecution.at,
          digest: effectiveExecution.digest,
          seatId: effectiveExecution.seatId,
          ...(effectiveExecution.runId ? { runId: effectiveExecution.runId } : {}),
        }
      : null,
  };

  return sanitizeApprovalItem(item);
}

/**
 * Get a single approval item by requestId.
 */
export function getApprovalById(
  requestId: string,
  nowMs = Date.now()
): ApprovalItem | null {
  const normId = requestId.trim().toLowerCase();
  if (!normId) return null;
  const map = foldApprovalLedger();
  const entry = map.get(normId);
  if (!entry) return null;
  return buildApprovalItem(entry, nowMs);
}

/**
 * Query approvals from ledger with optional status filter and limit.
 * Sorted newest request `ts` first.
 */
export function getApprovals(options?: {
  status?: string;
  seat?: string;
  limit?: number;
  nowMs?: number;
}): { approvals: ApprovalItem[]; total: number } {
  const nowMs = options?.nowMs ?? Date.now();
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50));
  const statusFilter = options?.status?.trim().toLowerCase();

  const map = foldApprovalLedger();
  let items = Array.from(map.values()).map((entry) =>
    buildApprovalItem(entry, nowMs)
  );

  if (options?.seat) {
    items = items.filter((item) => item.seat === options.seat);
  }

  if (statusFilter) {
    items = items.filter((item) => {
      if (statusFilter === 'pending' || statusFilter === 'requested') {
        return item.status === 'pending' || item.state === 'requested';
      }
      return item.status === statusFilter || item.state === statusFilter;
    });
  }

  // Sort newest first by request timestamp
  items.sort((a, b) => {
    const tB = Date.parse(b.ts) || 0;
    const tA = Date.parse(a.ts) || 0;
    return tB - tA;
  });

  const sliced = items.slice(0, limit).map(sanitizeApprovalItem);
  return {
    approvals: sliced,
    total: items.length,
  };
}

export type RecordDecisionResult =
  | {
      ok: true;
      decisionRecord: ApprovalDecisionRecord;
      item: ApprovalItem;
    }
  | {
      ok: false;
      status: 400 | 404 | 409;
      code: 'invalid_input' | 'not_found' | 'already_decided';
      message: string;
      item?: ApprovalItem;
    };

/**
 * Record an owner or localhost decision ("approved" | "denied") for a requestId.
 * - Unknown requestId -> 404
 * - Already decided requestId -> 409
 */
export function recordApprovalDecision(params: {
  requestId: string;
  decision: ApprovalDecisionValue;
  by: ApprovalDecisionActor;
  note?: string;
  at?: string;
  expiresAt?: string;
  ttlMinutes?: number;
  nowMs?: number;
}): RecordDecisionResult {
  if (isFenced() && !isFenceGuardDisabledForTest()) {
    throw new Error('[approvals-ledger] Instance is fenced. Writes are barred.');
  }

  const normId = (params.requestId || '').trim().toLowerCase();
  if (!normId) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_input',
      message: 'Missing requestId.',
    };
  }
  if (params.decision !== 'approved' && params.decision !== 'denied') {
    return {
      ok: false,
      status: 400,
      code: 'invalid_input',
      message: 'Decision must be "approved" or "denied".',
    };
  }
  if (params.by !== 'owner' && params.by !== 'localhost') {
    return {
      ok: false,
      status: 400,
      code: 'invalid_input',
      message: 'Invalid actor `by`; must be "owner" or "localhost".',
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const map = foldApprovalLedger();
  const existing = map.get(normId);

  if (!existing) {
    return {
      ok: false,
      status: 404,
      code: 'not_found',
      message: `Approval request "${normId}" not found.`,
    };
  }

  if (existing.decision !== null) {
    return {
      ok: false,
      status: 409,
      code: 'already_decided',
      message: `Approval request "${normId}" has already been decided (${existing.decision.decision}).`,
      item: buildApprovalItem(existing, nowMs),
    };
  }

  const atIso = params.at || new Date(nowMs).toISOString();
  const atMs = Date.parse(atIso);
  const baseMs = Number.isNaN(atMs) ? nowMs : atMs;
  const ttlMinutes =
    params.ttlMinutes ?? getOfficeConfig().approvals?.ttlMinutes ?? 60;
  const expiresAtIso =
    params.expiresAt || new Date(baseMs + ttlMinutes * 60_000).toISOString();

  const noteClean =
    typeof params.note === 'string' && params.note.trim().length > 0
      ? params.note.trim().slice(0, 200)
      : undefined;

  const decisionRecord: ApprovalDecisionRecord = {
    type: 'decision',
    requestId: normId,
    decision: params.decision,
    by: params.by,
    at: atIso,
    ...(noteClean !== undefined ? { note: noteClean } : {}),
    expiresAt: expiresAtIso,
  };

  const targetFile = resolveTargetFileForRequest(existing.sourceFile, atIso);
  appendApprovalRecord(decisionRecord, targetFile);

  existing.decision = decisionRecord;
  const updatedItem = buildApprovalItem(existing, nowMs);

  return {
    ok: true,
    decisionRecord,
    item: updatedItem,
  };
}

export type RecordExecutionOutcome =
  | {
      ok: true;
      idempotent: boolean;
      executionRecord: ApprovalExecutionRecord;
      item: ApprovalItem;
    }
  | {
      ok: false;
      status: 'not_found' | 'pending' | 'denied' | 'expired' | 'digest_mismatch';
      message: string;
      executionRecord?: ApprovalExecutionRecord;
      item?: ApprovalItem;
    };

/**
 * Record an execution for a requestId.
 * - Enforces single-use per requestId:
 *   + When `idempotent: true` (used by `approval_mark.py`), if already executed, returns `ok: true, idempotent: true` without writing a duplicate line.
 *   + When `idempotent: false` (default for second execution attempts), appends an execution line with `result: "digest_mismatch"` and rejects.
 */
export function recordApprovalExecution(params: {
  requestId: string;
  result: 'executed' | 'failed';
  runId?: string;
  digest?: string;
  at?: string;
  idempotent?: boolean;
  nowMs?: number;
}): RecordExecutionOutcome {
  if (isFenced() && !isFenceGuardDisabledForTest()) {
    throw new Error('[approvals-ledger] Instance is fenced. Writes are barred.');
  }

  const normId = (params.requestId || '').trim().toLowerCase();
  const nowMs = params.nowMs ?? Date.now();
  const map = foldApprovalLedger();
  const existing = map.get(normId);

  if (!existing) {
    return {
      ok: false,
      status: 'not_found',
      message: `Approval request "${normId}" not found.`,
    };
  }

  const atIso = params.at || new Date(nowMs).toISOString();
  const targetFile = resolveTargetFileForRequest(existing.sourceFile, atIso);
  const providedDigest = (params.digest ?? existing.request.sha256).trim().toLowerCase();

  // Check if already executed (single-use enforcement)
  if (existing.primaryExecution !== null) {
    if (params.idempotent) {
      return {
        ok: true,
        idempotent: true,
        executionRecord: existing.primaryExecution,
        item: buildApprovalItem(existing, nowMs),
      };
    }

    const mismatchRecord: ApprovalExecutionRecord = {
      type: 'execution',
      requestId: normId,
      ...(params.runId ? { runId: params.runId } : {}),
      seatId: existing.request.seat,
      at: atIso,
      result: 'digest_mismatch',
      digest: providedDigest,
    };
    appendApprovalRecord(mismatchRecord, targetFile);
    existing.allExecutions.push(mismatchRecord);

    return {
      ok: false,
      status: 'digest_mismatch',
      message: `Approval request "${normId}" was already used once.`,
      executionRecord: mismatchRecord,
      item: buildApprovalItem(existing, nowMs),
    };
  }

  if (!existing.decision) {
    return {
      ok: false,
      status: 'pending',
      message: `Approval request "${normId}" is still pending decision.`,
      item: buildApprovalItem(existing, nowMs),
    };
  }

  if (existing.decision.decision === 'denied') {
    return {
      ok: false,
      status: 'denied',
      message: `Approval request "${normId}" was denied.`,
      item: buildApprovalItem(existing, nowMs),
    };
  }

  const expMs = Date.parse(existing.decision.expiresAt);
  if (!Number.isNaN(expMs) && nowMs >= expMs) {
    const expiredRecord: ApprovalExecutionRecord = {
      type: 'execution',
      requestId: normId,
      ...(params.runId ? { runId: params.runId } : {}),
      seatId: existing.request.seat,
      at: atIso,
      result: 'expired',
      digest: providedDigest,
    };
    appendApprovalRecord(expiredRecord, targetFile);
    existing.primaryExecution = expiredRecord;
    existing.allExecutions.push(expiredRecord);

    return {
      ok: false,
      status: 'expired',
      message: `Approval request "${normId}" has expired.`,
      executionRecord: expiredRecord,
      item: buildApprovalItem(existing, nowMs),
    };
  }

  if (providedDigest !== existing.request.sha256) {
    const mismatchRecord: ApprovalExecutionRecord = {
      type: 'execution',
      requestId: normId,
      ...(params.runId ? { runId: params.runId } : {}),
      seatId: existing.request.seat,
      at: atIso,
      result: 'digest_mismatch',
      digest: providedDigest,
    };
    appendApprovalRecord(mismatchRecord, targetFile);
    existing.allExecutions.push(mismatchRecord);

    return {
      ok: false,
      status: 'digest_mismatch',
      message: `Digest mismatch for approval request "${normId}".`,
      executionRecord: mismatchRecord,
      item: buildApprovalItem(existing, nowMs),
    };
  }

  const execRecord: ApprovalExecutionRecord = {
    type: 'execution',
    requestId: normId,
    ...(params.runId ? { runId: params.runId } : {}),
    seatId: existing.request.seat,
    at: atIso,
    result: params.result,
    digest: existing.request.sha256,
  };
  appendApprovalRecord(execRecord, targetFile);
  existing.primaryExecution = execRecord;
  existing.allExecutions.push(execRecord);

  return {
    ok: true,
    idempotent: false,
    executionRecord: execRecord,
    item: buildApprovalItem(existing, nowMs),
  };
}
