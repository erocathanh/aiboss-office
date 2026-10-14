/**
 * approvals-ledger.ts — Approval Ledger State Machine (A-4 v02)
 *
 * Implements append-only approval ledger in operations/data/approvals/<YYYY-MM-DD>.jsonl
 * connecting hook requests -> digest -> owner/localhost decision -> claim -> execution.
 *
 * Record types in the same daily JSONL file:
 * 1. request (written by hook guard_bulk_send.py without `type`, or with `type: "request"`):
 *    { ts, seat, tool, host, len, sha256, head60, reason }
 *    Deterministic requestId = first 16 lowercase hex chars of sha256(ts + "|" + seat + "|" + tool + "|" + sha256)
 * 2. decision (written by server):
 *    { type: "decision", requestId, decision: "approved" | "denied", by: "owner" | "localhost", at, note?, expiresAt }
 * 3. claim (written atomically under lock by `approval_check.py --consume` or `checkAndConsumeApproval` before action):
 *    { type: "claim", requestId, claimId, seatId, tool, digest, at }
 * 4. execution (written under lock by server / `approval_mark.py`):
 *    { type: "execution", requestId, claimId?, runId?, seatId, at, result: "executed" | "failed" | "digest_mismatch" | "expired", digest }
 *
 * Hardened invariants (A-4 v02 — F1..F9):
 * - F1: Cross-process lock (.approvals.lock via O_EXCL) around read-check-append; atomic claim/consume before action;
 *       execution cannot be recorded or folded unless preceded by a valid, unexpired `approved` decision.
 * - F2: Identical schema and transition validation across TypeScript and Python; execution requires matching
 *       requestId, seatId, digest, and valid timestamp ordering (`decision.at <= execution.at <= decision.expiresAt`,
 *       or matching active `claimId` claimed before `expiresAt`).
 * - F3: Under write lock, inspects final byte of target JSONL file; if not `\n`, writes `\n` before appending
 *       so a partial/corrupted trailing fragment never swallows a new record.
 * - F4: Resolves the newest request for `(seat, tool, sha256)` by parsed UTC epoch timestamp (with ledger order tie-break)
 *       and evaluates only that request, never falling back to an older approval.
 * - F5: Fail-closed on invalid/unparseable ISO timestamps in `ts`, `at`, or `expiresAt`.
 * - F6: Strict validation of `note` type and length (<= 200 chars) before ledger append.
 * - F8: `expiresAt` is always computed from server `ttlMinutes` configuration (no public client override).
 * - F9: Legacy Vietnamese `reason` strings from H1 (`guard_bulk_send.py`) are normalized to English codes.
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

export interface ApprovalClaimRecord {
  type: 'claim';
  requestId: string;
  claimId: string;
  seatId: string;
  tool: string;
  digest: string;
  at: string;
}

export interface ApprovalExecutionRecord {
  type: 'execution';
  requestId: string;
  claimId?: string;
  runId?: string;
  seatId: string;
  at: string;
  result: ApprovalExecutionResult;
  digest: string;
}

export type ApprovalLedgerRecord =
  | ApprovalRequestRecord
  | ApprovalDecisionRecord
  | ApprovalClaimRecord
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
  claim?: {
    claimId: string;
    at: string;
    seatId: string;
    tool: string;
    digest: string;
  } | null;
  execution: {
    result: ApprovalExecutionResult;
    at: string;
    digest: string;
    seatId: string;
    claimId?: string;
    runId?: string;
  } | null;
  decidedBy?: ApprovalDecisionActor;
  decidedAt?: string;
  expiresAt?: string;
  note?: string;
  claimId?: string;
  claimedAt?: string;
  executedAt?: string;
  executionResult?: ApprovalExecutionResult;
  executionDigest?: string;
  runId?: string;
}

const ISO_8601_STRICT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse an ISO-8601 timestamp strictly to epoch milliseconds.
 * Returns null if the format or calendar date is invalid (F5 fail-closed).
 */
export function parseStrictIsoMs(val: unknown): number | null {
  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!ISO_8601_STRICT_RE.test(s)) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms) || !Number.isFinite(ms)) return null;
  return ms;
}

/**
 * Map legacy Vietnamese H1 hook reason strings (from operations/hooks/guard_bulk_send.py)
 * to clean English reason codes so the UI and API remain 100% English (F9).
 */
export function normalizeApprovalReason(raw: unknown): string {
  if (typeof raw !== 'string') return 'unknown';
  const s = raw.trim();
  if (!s) return 'unknown';

  if (s.includes('Công cụ MCP') || s.includes('Cong cu MCP')) {
    return 'mcp_external_send';
  }
  if (s.includes('-K/--config')) {
    return 'curl_config_flag';
  }
  if (s.includes('fetch_page_messages')) {
    return 'inbox_message_fetch';
  }
  if (s.includes('batch request') && s.includes('graph.facebook.com')) {
    return 'facebook_graph_batch';
  }
  if (s.includes('graph.facebook.com') && s.includes('/messages')) {
    return 'facebook_graph_messages';
  }
  if (
    s.includes('lệnh POST gửi tin nhắn/email') ||
    s.includes('POST gui tin nhan/email')
  ) {
    return 'external_post_send';
  }
  if (
    s.includes('kết nối gửi tin/email ra dịch vụ bên ngoài') ||
    s.includes('ket noi gui tin/email')
  ) {
    return 'external_endpoint_send';
  }
  if (/[^\x20-\x7E]/.test(s)) {
    return 'guarded_external_action';
  }
  return s.slice(0, 120);
}

/**
 * Sanitize head60 preview to pure printable ASCII so no non-English characters leak into UI.
 */
export function sanitizeHead60Ascii(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.slice(0, 60).replace(/[^\x20-\x7E]/g, '?');
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

export function getApprovalLockPath(): string {
  return path.join(getApprovalsDir(), '.approvals.lock');
}

export function isApprovalLockDisabledForTest(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.AIBOSS_TEST_DISABLE_APPROVAL_LOCK === '1';
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as { code?: string })?.code === 'EPERM';
  }
}

/**
 * Cross-process atomic lock on <approvals_dir>/.approvals.lock using O_CREAT | O_EXCL.
 * Shared protocol with Python approval_check.py and approval_mark.py (F1).
 */
export function withApprovalLock<T>(fn: () => T, timeoutMs = 5000): T {
  if (isApprovalLockDisabledForTest()) {
    return fn();
  }
  ensureApprovalsDir();
  const lockPath = getApprovalLockPath();
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const start = Date.now();
  let fd: number | null = null;

  while (true) {
    try {
      fd = fs.openSync(
        lockPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR,
        0o644
      );
      const payload = JSON.stringify({
        pid: process.pid,
        token,
        createdAt: Date.now(),
      });
      fs.writeSync(fd, payload, 0, 'utf-8');
      fs.fsyncSync(fd);
      break;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'EEXIST') {
        try {
          const stat = fs.statSync(lockPath);
          const raw = fs.readFileSync(lockPath, 'utf-8').trim();
          if (raw) {
            const parsed = JSON.parse(raw) as { pid?: number; createdAt?: number };
            if (typeof parsed.pid === 'number' && !isPidAlive(parsed.pid)) {
              try {
                fs.unlinkSync(lockPath);
                continue;
              } catch {
                /* ignore race */
              }
            }
          } else if (Date.now() - stat.mtimeMs > 5000) {
            try {
              fs.unlinkSync(lockPath);
              continue;
            } catch {
              /* ignore race */
            }
          }
        } catch {
          /* ignore transient read error */
        }

        if (Date.now() - start > timeoutMs) {
          throw new Error(
            `[approvals-ledger] Timeout waiting for approval lock (${timeoutMs}ms)`
          );
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        continue;
      }
      throw err;
    }
  }

  try {
    return fn();
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
      try {
        if (fs.existsSync(lockPath)) {
          const current = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as {
            token?: string;
          };
          if (current?.token === token) {
            fs.unlinkSync(lockPath);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
}

export function getApprovalLogPathForDate(isoDateString?: string): string {
  ensureApprovalsDir();
  const ms = isoDateString ? parseStrictIsoMs(isoDateString) : Date.now();
  const validDate = ms !== null ? new Date(ms) : new Date();
  const dateStr = validDate.toISOString().split('T')[0];
  return path.join(getApprovalsDir(), `${dateStr}.jsonl`);
}

function getUtcDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Strictly sanitize a raw request record (hook line without `type` or with `type: "request"`).
 * Requires valid ISO `ts` (F5) and normalizes legacy Vietnamese H1 `reason` strings (F9).
 */
export function sanitizeApprovalRequestRecord(
  raw: unknown
): ApprovalRequestRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== undefined && obj.type !== 'request') return null;

  const ts = typeof obj.ts === 'string' ? obj.ts.trim() : '';
  if (parseStrictIsoMs(ts) === null) return null;

  const seat = typeof obj.seat === 'string' ? obj.seat.trim() : '';
  const tool = typeof obj.tool === 'string' ? obj.tool.trim() : '';
  const sha256 = typeof obj.sha256 === 'string' ? obj.sha256.trim().toLowerCase() : '';
  if (!seat || !tool || !sha256 || !/^[0-9a-f]{16,128}$/.test(sha256)) return null;

  const host = typeof obj.host === 'string' && obj.host.trim() ? obj.host.trim() : '-';
  const len =
    typeof obj.len === 'number' && Number.isFinite(obj.len) && obj.len >= 0
      ? Math.floor(obj.len)
      : 0;
  const head60 = sanitizeHead60Ascii(obj.head60);
  const reason = normalizeApprovalReason(obj.reason);

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
 * Requires valid ISO `at` and `expiresAt` (F5 fail-closed).
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
    !/^[0-9a-f]{16}$/.test(requestId) ||
    (decision !== 'approved' && decision !== 'denied') ||
    (by !== 'owner' && by !== 'localhost') ||
    parseStrictIsoMs(at) === null ||
    parseStrictIsoMs(expiresAt) === null
  ) {
    return null;
  }

  let note: string | undefined;
  if (obj.note !== undefined && obj.note !== null) {
    if (typeof obj.note !== 'string') return null;
    const trimmed = obj.note.trim();
    if (trimmed.length > 200) return null;
    if (trimmed.length > 0) {
      note = trimmed;
    }
  }

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
 * Strictly sanitize a claim record (F1).
 */
export function sanitizeApprovalClaimRecord(
  raw: unknown
): ApprovalClaimRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'claim') return null;

  const requestId =
    typeof obj.requestId === 'string' ? obj.requestId.trim().toLowerCase() : '';
  const claimId = typeof obj.claimId === 'string' ? obj.claimId.trim() : '';
  const seatId = typeof obj.seatId === 'string' ? obj.seatId.trim() : '';
  const tool = typeof obj.tool === 'string' ? obj.tool.trim() : '';
  const digest = typeof obj.digest === 'string' ? obj.digest.trim().toLowerCase() : '';
  const at = typeof obj.at === 'string' ? obj.at.trim() : '';

  if (
    !/^[0-9a-f]{16}$/.test(requestId) ||
    !claimId ||
    parseStrictIsoMs(at) === null ||
    (digest !== '' && !/^[0-9a-f]{16,128}$/.test(digest))
  ) {
    return null;
  }

  return {
    type: 'claim',
    requestId,
    claimId,
    seatId,
    tool,
    digest,
    at,
  };
}

/**
 * Strictly sanitize an execution record.
 * Requires `requestId`, `seatId`, valid ISO `at`, valid `result`, and hex `digest` (F2, F5).
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
    !/^[0-9a-f]{16}$/.test(requestId) ||
    !seatId ||
    parseStrictIsoMs(at) === null ||
    (result !== 'executed' &&
      result !== 'failed' &&
      result !== 'digest_mismatch' &&
      result !== 'expired') ||
    !/^[0-9a-f]{16,128}$/.test(digest)
  ) {
    return null;
  }

  const claimId =
    typeof obj.claimId === 'string' && obj.claimId.trim().length > 0
      ? obj.claimId.trim()
      : undefined;
  const runId =
    typeof obj.runId === 'string' && obj.runId.trim().length > 0
      ? obj.runId.trim()
      : undefined;

  return {
    type: 'execution',
    requestId,
    ...(claimId !== undefined ? { claimId } : {}),
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
    if (raw.type === 'claim') {
      return sanitizeApprovalClaimRecord(raw);
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

  const sanitizedClaim = item.claim
    ? {
        claimId: item.claim.claimId,
        at: item.claim.at,
        seatId: item.claim.seatId,
        tool: item.claim.tool,
        digest: item.claim.digest,
      }
    : null;

  const sanitizedExecution = item.execution
    ? {
        result: item.execution.result,
        at: item.execution.at,
        digest: item.execution.digest,
        seatId: item.execution.seatId,
        ...(item.execution.claimId ? { claimId: item.execution.claimId } : {}),
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
    head60: sanitizeHead60Ascii(item.head60),
    reason: normalizeApprovalReason(item.reason),
    decision: sanitizedDecision,
    ...(sanitizedClaim ? { claim: sanitizedClaim } : {}),
    execution: sanitizedExecution,
    ...(sanitizedDecision
      ? {
          decidedBy: sanitizedDecision.by,
          decidedAt: sanitizedDecision.at,
          expiresAt: sanitizedDecision.expiresAt,
          ...(sanitizedDecision.note ? { note: sanitizedDecision.note } : {}),
        }
      : {}),
    ...(sanitizedClaim
      ? {
          claimId: sanitizedClaim.claimId,
          claimedAt: sanitizedClaim.at,
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

function resolveTargetFileForRequest(
  requestSourceFile: string | undefined,
  atIso?: string
): string {
  ensureApprovalsDir();
  const ms = atIso ? parseStrictIsoMs(atIso) : Date.now();
  const validNow = ms !== null ? new Date(ms) : new Date();
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

/**
 * Safe JSONL append (F3):
 * When called inside `withApprovalLock`, inspects the last byte of `filePath`.
 * If the file is non-empty and does NOT end with `\n` (0x0a), writes `\n` first
 * so a partial trailing fragment never corrupts or swallows the newly appended record.
 */
function appendJsonlLineSafely(filePath: string, serializedJson: string): void {
  ensureApprovalsDir();
  const fd = fs.openSync(
    filePath,
    fs.constants.O_CREAT | fs.constants.O_RDWR,
    0o644
  );
  try {
    const stat = fs.fstatSync(fd);
    let prefix = '';
    if (stat.size > 0) {
      const lastByteBuf = Buffer.alloc(1);
      fs.readSync(fd, lastByteBuf, 0, 1, stat.size - 1);
      if (lastByteBuf[0] !== 0x0a) {
        prefix = '\n';
      }
    }
    const buf = Buffer.from(prefix + serializedJson + '\n', 'utf-8');
    fs.writeSync(fd, buf, 0, buf.length, stat.size);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function appendApprovalRecordUnlocked(
  record:
    | ApprovalDecisionRecord
    | ApprovalClaimRecord
    | ApprovalExecutionRecord,
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
  } else if (record.type === 'claim') {
    const sanitized = sanitizeApprovalClaimRecord(record);
    if (!sanitized) {
      throw new Error('[approvals-ledger] Refusing to write invalid claim record.');
    }
    lineObj = { ...sanitized };
  } else {
    const sanitized = sanitizeApprovalExecutionRecord(record);
    if (!sanitized) {
      throw new Error('[approvals-ledger] Refusing to write invalid execution record.');
    }
    lineObj = { ...sanitized };
  }
  appendJsonlLineSafely(filePath, JSON.stringify(lineObj));
}

export interface FoldedRequestState {
  request: ApprovalRequestRecord;
  requestTsMs: number;
  orderIndex: number;
  decision: ApprovalDecisionRecord | null;
  claim: ApprovalClaimRecord | null;
  primaryExecution: ApprovalExecutionRecord | null;
  allExecutions: ApprovalExecutionRecord[];
  sourceFile?: string;
}

/**
 * Fold approval ledger with unified state transition validation (F1, F2, F5).
 * Identical rules to Python `load_folded_ledger` in `approval_check.py` and `approval_mark.py`:
 * - Only the first valid `decision` per `requestId` is accepted.
 * - A `claim` is only accepted after a valid `decision: "approved"`, before `expiresAt`,
 *   with matching `seatId`, `tool`, and `digest`, when no prior claim or execution exists.
 * - An `execution` with `result: "executed" | "failed"` is ONLY accepted as `primaryExecution`
 *   when:
 *   1. `decision` already exists and `decision.decision === "approved"` (never before approval!).
 *   2. `primaryExecution` is still null (single-use).
 *   3. `seatId === request.seat` and `digest === request.sha256` (strict identity & digest match).
 *   4. `at` is a valid ISO timestamp >= `decision.at`, and either `at < decision.expiresAt`
 *      or matches an active `claim` that was claimed before `decision.expiresAt`.
 *   5. If `claim` exists on the entry and `execution.claimId` is present, `execution.claimId === claim.claimId`.
 */
export function foldApprovalLedger(): Map<string, FoldedRequestState> {
  const { records, requestSourceFile } = readApprovalFilesWithMeta();
  const map = new Map<string, FoldedRequestState>();
  let orderCounter = 0;

  for (const r of records) {
    orderCounter += 1;
    if (r.type === 'request') {
      const reqTsMs = parseStrictIsoMs(r.ts);
      if (reqTsMs === null) continue;
      if (!map.has(r.requestId)) {
        map.set(r.requestId, {
          request: r,
          requestTsMs: reqTsMs,
          orderIndex: orderCounter,
          decision: null,
          claim: null,
          primaryExecution: null,
          allExecutions: [],
          sourceFile: requestSourceFile.get(r.requestId),
        });
      }
    } else if (r.type === 'decision') {
      const entry = map.get(r.requestId);
      if (!entry || entry.decision !== null) continue;
      const decAtMs = parseStrictIsoMs(r.at);
      const expMs = parseStrictIsoMs(r.expiresAt);
      if (decAtMs === null || expMs === null) continue;
      entry.decision = r;
    } else if (r.type === 'claim') {
      const entry = map.get(r.requestId);
      if (!entry || !entry.decision || entry.decision.decision !== 'approved') {
        continue;
      }
      if (entry.claim !== null || entry.primaryExecution !== null) {
        continue;
      }
      if (
        (r.seatId && r.seatId !== entry.request.seat) ||
        (r.tool && r.tool !== entry.request.tool) ||
        (r.digest && r.digest !== entry.request.sha256)
      ) {
        continue;
      }
      const claimAtMs = parseStrictIsoMs(r.at);
      const decAtMs = parseStrictIsoMs(entry.decision.at);
      const expMs = parseStrictIsoMs(entry.decision.expiresAt);
      if (
        claimAtMs === null ||
        decAtMs === null ||
        expMs === null ||
        claimAtMs < decAtMs ||
        claimAtMs >= expMs
      ) {
        continue;
      }
      entry.claim = {
        ...r,
        seatId: r.seatId || entry.request.seat,
        tool: r.tool || entry.request.tool,
        digest: r.digest || entry.request.sha256,
      };
    } else if (r.type === 'execution') {
      const entry = map.get(r.requestId);
      if (!entry) continue;
      entry.allExecutions.push(r);

      if (entry.primaryExecution !== null) {
        continue;
      }
      // F1 & F2: Execution can ONLY transition from an existing `approved` decision
      if (!entry.decision || entry.decision.decision !== 'approved') {
        continue;
      }
      // F2: Must match request seat and sha256 digest
      if (r.seatId !== entry.request.seat || r.digest !== entry.request.sha256) {
        continue;
      }

      const execAtMs = parseStrictIsoMs(r.at);
      const decAtMs = parseStrictIsoMs(entry.decision.at);
      const expMs = parseStrictIsoMs(entry.decision.expiresAt);
      if (execAtMs === null || decAtMs === null || expMs === null) {
        continue;
      }
      if (execAtMs < decAtMs) {
        continue;
      }

      if (r.result === 'executed' || r.result === 'failed') {
        if (entry.claim !== null) {
          if (r.claimId !== entry.claim.claimId) {
            continue;
          }
        } else if (execAtMs >= expMs) {
          continue;
        }
        entry.primaryExecution = r;
      } else if (r.result === 'expired') {
        entry.primaryExecution = r;
      }
    }
  }

  return map;
}

function buildApprovalItem(
  folded: FoldedRequestState,
  nowMs = Date.now()
): ApprovalItem {
  const { request, decision, claim, primaryExecution } = folded;
  let state: ApprovalDerivedState = 'requested';
  let status: ApprovalStatus = 'pending';

  if (!decision) {
    state = 'requested';
    status = 'pending';
  } else if (decision.decision === 'denied') {
    state = 'denied';
    status = 'denied';
  } else if (decision.decision === 'approved') {
    const expMs = parseStrictIsoMs(decision.expiresAt);
    const decAtMs = parseStrictIsoMs(decision.at);
    if (expMs === null || decAtMs === null) {
      // F5: Fail-closed on invalid timestamps
      state = 'expired';
      status = 'expired';
    } else if (primaryExecution) {
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
    } else if (nowMs >= expMs) {
      state = 'expired';
      status = 'expired';
    } else {
      // CRITICAL: approved without valid primaryExecution is NEVER displayed as executed
      state = 'approved';
      status = 'approved';
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
    ...(claim
      ? {
          claim: {
            claimId: claim.claimId,
            at: claim.at,
            seatId: claim.seatId,
            tool: claim.tool,
            digest: claim.digest,
          },
        }
      : {}),
    execution: primaryExecution
      ? {
          result: primaryExecution.result,
          at: primaryExecution.at,
          digest: primaryExecution.digest,
          seatId: primaryExecution.seatId,
          ...(primaryExecution.claimId ? { claimId: primaryExecution.claimId } : {}),
          ...(primaryExecution.runId ? { runId: primaryExecution.runId } : {}),
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
  const entries = Array.from(map.values());

  // Sort newest first by parsed timestamp, breaking ties by ledger orderIndex descending
  entries.sort((a, b) => {
    if (b.requestTsMs !== a.requestTsMs) {
      return b.requestTsMs - a.requestTsMs;
    }
    return b.orderIndex - a.orderIndex;
  });

  let items = entries.map((entry) => buildApprovalItem(entry, nowMs));

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
 * Record an owner or localhost decision ("approved" | "denied") for a requestId under lock.
 * - Unknown requestId -> 404
 * - Already decided requestId -> 409
 * - Invalid note (> 200 chars or non-string) -> 400 without writing to ledger (F6)
 * - Always computes expiresAt from server `ttlMinutes` configuration (F8)
 */
export function recordApprovalDecision(params: {
  requestId: string;
  decision: ApprovalDecisionValue;
  by: ApprovalDecisionActor;
  note?: unknown;
  at?: string;
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

  let noteClean: string | undefined;
  if (params.note !== undefined && params.note !== null) {
    if (typeof params.note !== 'string') {
      return {
        ok: false,
        status: 400,
        code: 'invalid_input',
        message: 'Field `note` must be a string.',
      };
    }
    const trimmed = params.note.trim();
    if (trimmed.length > 200) {
      return {
        ok: false,
        status: 400,
        code: 'invalid_input',
        message: 'Field `note` must not exceed 200 characters.',
      };
    }
    if (trimmed.length > 0) {
      noteClean = trimmed;
    }
  }

  return withApprovalLock(() => {
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
    const atMs = parseStrictIsoMs(atIso);
    if (atMs === null) {
      return {
        ok: false,
        status: 400,
        code: 'invalid_input',
        message: 'Invalid ISO timestamp `at`.',
      };
    }

    const ttlMinutes =
      params.ttlMinutes ?? getOfficeConfig().approvals?.ttlMinutes ?? 60;
    const expiresAtIso = new Date(atMs + ttlMinutes * 60_000).toISOString();

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
    appendApprovalRecordUnlocked(decisionRecord, targetFile);

    existing.decision = decisionRecord;
    const updatedItem = buildApprovalItem(existing, nowMs);

    return {
      ok: true,
      decisionRecord,
      item: updatedItem,
    };
  });
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
      status:
        | 'not_found'
        | 'pending'
        | 'denied'
        | 'expired'
        | 'digest_mismatch'
        | 'claim_mismatch';
      message: string;
      executionRecord?: ApprovalExecutionRecord;
      item?: ApprovalItem;
    };

/**
 * Record an execution for a requestId under lock.
 * - Requires a valid `approved` decision before recording execution (F1).
 * - Enforces single-use per requestId and optional claimId verification (F1, F2).
 */
export function recordApprovalExecution(params: {
  requestId: string;
  result: 'executed' | 'failed';
  claimId?: string;
  runId?: string;
  digest?: string;
  at?: string;
  idempotent?: boolean;
  nowMs?: number;
}): RecordExecutionOutcome {
  if (isFenced() && !isFenceGuardDisabledForTest()) {
    throw new Error('[approvals-ledger] Instance is fenced. Writes are barred.');
  }

  return withApprovalLock(() => {
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
    const atMs = parseStrictIsoMs(atIso);
    if (atMs === null) {
      return {
        ok: false,
        status: 'expired',
        message: 'Invalid execution timestamp.',
        item: buildApprovalItem(existing, nowMs),
      };
    }

    const targetFile = resolveTargetFileForRequest(existing.sourceFile, atIso);
    const providedDigest = (params.digest ?? existing.request.sha256)
      .trim()
      .toLowerCase();

    // Check if already executed (single-use enforcement)
    if (existing.primaryExecution !== null) {
      if (
        params.idempotent &&
        existing.primaryExecution.result === params.result &&
        (existing.primaryExecution.claimId ?? undefined) ===
          (params.claimId ?? undefined)
      ) {
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
        ...(params.claimId ? { claimId: params.claimId } : {}),
        ...(params.runId ? { runId: params.runId } : {}),
        seatId: existing.request.seat,
        at: atIso,
        result: 'digest_mismatch',
        digest: providedDigest,
      };
      appendApprovalRecordUnlocked(mismatchRecord, targetFile);
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

    const expMs = parseStrictIsoMs(existing.decision.expiresAt);
    const decAtMs = parseStrictIsoMs(existing.decision.at);
    if (expMs === null || decAtMs === null || atMs < decAtMs) {
      return {
        ok: false,
        status: 'expired',
        message: `Approval request "${normId}" has invalid decision timestamps.`,
        item: buildApprovalItem(existing, nowMs),
      };
    }

    if (existing.claim !== null) {
      if (!params.claimId || params.claimId !== existing.claim.claimId) {
        return {
          ok: false,
          status: 'claim_mismatch',
          message: `Claim ID mismatch for approval request "${normId}".`,
          item: buildApprovalItem(existing, nowMs),
        };
      }
    } else {
      if (params.claimId) {
        return {
          ok: false,
          status: 'claim_mismatch',
          message: `No active claim exists for approval request "${normId}".`,
          item: buildApprovalItem(existing, nowMs),
        };
      }
      if (nowMs >= expMs) {
        const expiredRecord: ApprovalExecutionRecord = {
          type: 'execution',
          requestId: normId,
          ...(params.runId ? { runId: params.runId } : {}),
          seatId: existing.request.seat,
          at: atIso,
          result: 'expired',
          digest: providedDigest,
        };
        appendApprovalRecordUnlocked(expiredRecord, targetFile);
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
    }

    if (providedDigest !== existing.request.sha256) {
      const mismatchRecord: ApprovalExecutionRecord = {
        type: 'execution',
        requestId: normId,
        ...(params.claimId ? { claimId: params.claimId } : {}),
        ...(params.runId ? { runId: params.runId } : {}),
        seatId: existing.request.seat,
        at: atIso,
        result: 'digest_mismatch',
        digest: providedDigest,
      };
      appendApprovalRecordUnlocked(mismatchRecord, targetFile);
      existing.allExecutions.push(mismatchRecord);

      return {
        ok: false,
        status: 'digest_mismatch',
        message: `Digest mismatch for approval request "${normId}".`,
        executionRecord: mismatchRecord,
        item: buildApprovalItem(existing, nowMs),
      };
    }

    const effectiveClaimId = params.claimId ?? existing.claim?.claimId;
    const execRecord: ApprovalExecutionRecord = {
      type: 'execution',
      requestId: normId,
      ...(effectiveClaimId ? { claimId: effectiveClaimId } : {}),
      ...(params.runId ? { runId: params.runId } : {}),
      seatId: existing.request.seat,
      at: atIso,
      result: params.result,
      digest: existing.request.sha256,
    };
    appendApprovalRecordUnlocked(execRecord, targetFile);
    existing.primaryExecution = execRecord;
    existing.allExecutions.push(execRecord);

    return {
      ok: true,
      idempotent: false,
      executionRecord: execRecord,
      item: buildApprovalItem(existing, nowMs),
    };
  });
}
