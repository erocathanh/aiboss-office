import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getOfficeConfig } from '@/lib/office-config';
import { isFenced, isFenceGuardDisabledForTest } from '@/lib/budget-ledger';

/**
 * Approval Ledger Thin Client (A-4 v06)
 *
 * Single implementation architecture (A-4 v06):
 * - All cross-process locking (`fcntl.flock(fd, LOCK_EX | LOCK_NB)` on `<approvalsDir>/.approvals.lock`),
 *   atomic `O_APPEND` writes (`os.write` loop + `os.fsync` + tail readback verification),
 *   and binary `b"\n"` / BOM / RFC-8259 JSON reading and state-machine folding
 *   live exclusively in `operations/scripts/approval_ledger.py` (`O_APPEND`).
 * - This TypeScript module is a thin client that validates inputs, invokes `operations/scripts/approval_ledger.py`
 *   (`dump`, `decide`, `mark`) via `child_process.spawnSync`, maps error codes (`lock_timeout`,
 *   `ledger_unreadable`, `io_error`), and applies the explicit `sanitizeApprovalItem` field whitelist.
 */

export type ApprovalDerivedState =
  | 'requested'
  | 'not_yet_valid'
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

export type ApprovalDecisionValue = 'approved' | 'denied';
export type ApprovalDecisionActor = 'owner' | 'localhost';
export type ApprovalExecutionResult = 'executed' | 'failed';

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

/**
 * Strip ONLY ASCII whitespace `[ \t\r\n]` from both ends (F2 — identical to Python `s.strip(" \t\r\n")`).
 * Never strips U+FEFF (BOM) or non-ASCII whitespace characters.
 */
export function trimAscii(s: string): string {
  return s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
}

const ISO_ASCII_REGEX =
  /^(19[7-9][0-9]|[2-9][0-9]{3})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?(Z|([+-])([0-9]{2}):([0-9]{2}))$/;

const MIN_VALID_UTC_MS = 0; // 1970-01-01T00:00:00.000Z
const MAX_VALID_UTC_MS = 253_402_300_799_999; // 9999-12-31T23:59:59.999Z

function daysInUtcMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

/**
 * Strictly parse an ISO-8601 timestamp with explicit UTC (`Z`) or numeric offset (`±HH:MM`) (F2c, F5).
 */
export function parseStrictIsoMs(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const trimmed = trimAscii(iso);
  if (!trimmed) return null;
  const m = ISO_ASCII_REGEX.exec(trimmed);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const fracStr = m[7] || '';
  const tzFull = m[8];
  const tzSign = m[9];
  const tzHourStr = m[10];
  const tzMinStr = m[11];

  if (year < 1970 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  const maxDay = daysInUtcMonth(year, month);
  if (day < 1 || day > maxDay) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  const ms = fracStr ? Number((fracStr + '000').slice(0, 3)) : 0;

  let offsetMinutes = 0;
  if (tzFull !== 'Z') {
    const offHour = Number(tzHourStr);
    const offMin = Number(tzMinStr);
    if (offHour < 0 || offHour > 23 || offMin < 0 || offMin > 59) {
      return null;
    }
    offsetMinutes = (tzSign === '+' ? 1 : -1) * (offHour * 60 + offMin);
  }

  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  if (!Number.isFinite(localUtcMs)) return null;

  const expectedLocalIso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${String(ms).padStart(3, '0')}Z`;
  if (new Date(localUtcMs).toISOString() !== expectedLocalIso) {
    return null;
  }

  const epochMs = localUtcMs - offsetMinutes * 60_000;
  if (epochMs < MIN_VALID_UTC_MS || epochMs > MAX_VALID_UTC_MS) {
    return null;
  }
  if (new Date(epochMs + offsetMinutes * 60_000).toISOString() !== expectedLocalIso) {
    return null;
  }

  return epochMs;
}

export const parseIsoTimestampMs = parseStrictIsoMs;

/**
 * Count Unicode code points in a string without trimming (F2b, F6).
 */
export function countCodePoints(s: string): number {
  return Array.from(s).length;
}

const H1_VIETNAMESE_REASON_RULES: Array<{ pattern: RegExp; code: string }> = [
  {
    pattern: /công cụ mcp|mcp.*gửi dữ liệu ra bên ngoài/i,
    code: 'mcp_external_send',
  },
  {
    pattern: /tệp cấu hình\s*\(-k\/--config\)|-k\/--config/i,
    code: 'curl_config_flag',
  },
  {
    pattern: /fetch_page_messages\.py|truy xuất tin nhắn hộp thư/i,
    code: 'inbox_message_fetch',
  },
  {
    pattern: /graph\.facebook\.com.*\/messages|gửi tin nhắn\s*\(\/messages\)/i,
    code: 'facebook_graph_messages',
  },
  {
    pattern: /batch request.*graph\.facebook\.com/i,
    code: 'facebook_graph_batch',
  },
  {
    pattern: /lệnh post gửi tin nhắn\/email|post gửi tin nhắn/i,
    code: 'external_post_send',
  },
  {
    pattern: /kết nối gửi tin\/email ra dịch vụ bên ngoài/i,
    code: 'external_endpoint_send',
  },
];

export function normalizeApprovalReason(rawReason: unknown): string {
  const s = typeof rawReason === 'string' ? trimAscii(rawReason) : '';
  if (!s) return 'guarded_external_action';

  for (const rule of H1_VIETNAMESE_REASON_RULES) {
    if (rule.pattern.test(s)) {
      return rule.code;
    }
  }

  if (/[^\x00-\x7F]/.test(s)) {
    return 'guarded_external_action';
  }

  return s.slice(0, 200);
}

export function sanitizeHead60Ascii(rawHead60: unknown): string {
  const s = typeof rawHead60 === 'string' ? rawHead60.slice(0, 60) : '';
  if (!s) return '';
  if (/[^\x00-\x7F]/.test(s)) {
    return s.replace(/[^\x20-\x7E]/g, '?');
  }
  return s;
}

export function computeRequestId(
  ts: string,
  seat: string,
  tool: string,
  sha256: string
): string {
  const normalizedSha = trimAscii(sha256 || '').toLowerCase();
  const payload = `${trimAscii(ts || '')}|${trimAscii(seat || '')}|${trimAscii(tool || '')}|${normalizedSha}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

export function getApprovalsDir(): string {
  const baseDir =
    process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  return path.join(baseDir, 'approvals');
}

export class ApprovalLockTimeoutError extends Error {
  readonly code = 'lock_timeout';
  readonly status = 'lock_timeout';

  constructor() {
    super('Timed out acquiring approval lock.');
    this.name = 'ApprovalLockTimeoutError';
  }
}

export class ApprovalLedgerUnreadableError extends Error {
  readonly code = 'ledger_unreadable';
  readonly status = 'ledger_unreadable';
  readonly file: string;
  readonly reason: string;

  constructor(filePath: string, reason = 'EACCES') {
    const base = path.basename(filePath);
    super(`Approval ledger file is unreadable (${base}).`);
    this.name = 'ApprovalLedgerUnreadableError';
    this.file = base;
    this.reason = reason;
  }
}

export class ApprovalIoError extends Error {
  readonly code = 'io_error';
  readonly status = 'io_error';
  readonly reason: string;

  constructor(reason = 'EIO') {
    super(`Approval ledger I/O error (${reason}).`);
    this.name = 'ApprovalIoError';
    this.reason = reason;
  }
}

function getUtcDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getApprovalLogPathForDate(dateStrOrIso?: string): string {
  const dir = getApprovalsDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err: unknown) {
    const code = (err as { code?: unknown })?.code;
    throw new ApprovalIoError(typeof code === 'string' && code ? code : 'EIO');
  }
  let d = new Date();
  if (dateStrOrIso) {
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateStrOrIso)) {
      return path.join(dir, `${dateStrOrIso}.jsonl`);
    }
    const ms = parseStrictIsoMs(dateStrOrIso);
    if (ms !== null) {
      d = new Date(ms);
    }
  }
  return path.join(dir, `${getUtcDateString(d)}.jsonl`);
}

/**
 * Explicit schema whitelist for external API exposure (prevents leaking `prompt` / `rawUsage` / `ZEBRA`).
 */
export function sanitizeApprovalItem(item: ApprovalItem): ApprovalItem {
  const sanitizedDecision = item.decision
    ? {
        decision: item.decision.decision,
        by: item.decision.by,
        at: item.decision.at,
        expiresAt: item.decision.expiresAt,
        ...(item.decision.note ? { note: item.decision.note } : {}),
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

function getApprovalLedgerScriptPath(): string {
  const root = process.env.AIBOSS_OFFICE_ROOT || process.cwd();
  return path.resolve(root, 'operations', 'scripts', 'approval_ledger.py');
}

/**
 * Invoke `operations/scripts/approval_ledger.py` via `spawnSync('python3', ...)`
 * and map infrastructure errors (`lock_timeout`, `ledger_unreadable`, `io_error`) to typed exceptions.
 * All underlying writes inside `approval_ledger.py` use `O_APPEND` under `fcntl.flock`.
 */
function runApprovalLedgerCli(args: string[]): Record<string, unknown> {
  const scriptPath = getApprovalLedgerScriptPath();
  const res = spawnSync('python3', [scriptPath, ...args], {
    env: process.env,
    encoding: 'utf-8',
    timeout: 15_000,
  });

  if (res.error) {
    const errCode = (res.error as { code?: string }).code || 'EIO';
    throw new ApprovalIoError(errCode);
  }

  const rawStdout = trimAscii(res.stdout || '');
  if (!rawStdout) {
    throw new ApprovalIoError('EIO');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawStdout) as Record<string, unknown>;
  } catch {
    throw new ApprovalIoError('EIO');
  }

  const status = parsed.status;
  if (status === 'lock_timeout') {
    throw new ApprovalLockTimeoutError();
  }
  if (status === 'ledger_unreadable') {
    throw new ApprovalLedgerUnreadableError(
      typeof parsed.file === 'string' ? parsed.file : 'approvals',
      typeof parsed.reason === 'string' ? parsed.reason : 'EACCES'
    );
  }
  if (status === 'io_error') {
    throw new ApprovalIoError(typeof parsed.reason === 'string' ? parsed.reason : 'EIO');
  }

  return parsed;
}

export interface GetApprovalsQuery {
  status?: string | null;
  seat?: string | null;
  limit?: number;
  nowMs?: number;
}

export interface GetApprovalsResult {
  approvals: ApprovalItem[];
  total: number;
}

export function getApprovals(query: GetApprovalsQuery = {}): GetApprovalsResult {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const args = ['dump', '--json', '--limit', String(limit)];
  if (query.status && trimAscii(query.status)) {
    args.push('--status', trimAscii(query.status).toLowerCase());
  }
  if (query.seat && trimAscii(query.seat)) {
    args.push('--seat', trimAscii(query.seat));
  }
  if (typeof query.nowMs === 'number' && Number.isFinite(query.nowMs)) {
    args.push('--now-ms', String(Math.floor(query.nowMs)));
  }

  const parsed = runApprovalLedgerCli(args);
  const rawList = Array.isArray(parsed.approvals) ? (parsed.approvals as ApprovalItem[]) : [];
  const total = typeof parsed.total === 'number' ? parsed.total : rawList.length;

  return {
    approvals: rawList.map(sanitizeApprovalItem),
    total,
  };
}

export function getApprovalById(
  requestId: string,
  nowMs?: number
): ApprovalItem | null {
  const normId = trimAscii(requestId || '').toLowerCase();
  if (!normId) return null;
  const args = ['dump', '--json', '--request-id', normId];
  if (typeof nowMs === 'number' && Number.isFinite(nowMs)) {
    args.push('--now-ms', String(Math.floor(nowMs)));
  }
  const parsed = runApprovalLedgerCli(args);
  if (!parsed.item || typeof parsed.item !== 'object') {
    return null;
  }
  return sanitizeApprovalItem(parsed.item as ApprovalItem);
}

export function readApprovalRecords(): ApprovalLedgerRecord[] {
  const parsed = runApprovalLedgerCli(['dump', '--json', '--records']);
  return Array.isArray(parsed.records) ? (parsed.records as ApprovalLedgerRecord[]) : [];
}

export interface RecordDecisionSuccess {
  ok: true;
  decisionRecord: ApprovalDecisionRecord;
  item: ApprovalItem;
}

export interface RecordDecisionFailure {
  ok: false;
  status: 400 | 404 | 409;
  code: 'invalid_input' | 'not_found' | 'already_decided';
  message: string;
  item?: ApprovalItem;
}

export type RecordDecisionResult = RecordDecisionSuccess | RecordDecisionFailure;

/**
 * Record an approval decision (`approved` or `denied`) for `requestId` by calling
 * `operations/scripts/approval_ledger.py decide` (A-4 v06 Item 2 & 4).
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

  const normId = trimAscii(params.requestId || '').toLowerCase();
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
  if ('note' in params && params.note !== undefined) {
    if (typeof params.note !== 'string') {
      return {
        ok: false,
        status: 400,
        code: 'invalid_input',
        message: 'Field `note` must be a string.',
      };
    }
    if (countCodePoints(params.note) > 200) {
      return {
        ok: false,
        status: 400,
        code: 'invalid_input',
        message: 'Field `note` must not exceed 200 characters.',
      };
    }
    const trimmed = trimAscii(params.note);
    if (trimmed.length > 0) {
      noteClean = trimmed;
    }
  }

  if (params.at !== undefined) {
    if (parseStrictIsoMs(params.at) === null) {
      return {
        ok: false,
        status: 400,
        code: 'invalid_input',
        message: 'Invalid ISO timestamp `at`.',
      };
    }
  }

  const ttlMinutes =
    params.ttlMinutes ?? getOfficeConfig().approvals?.ttlMinutes ?? 60;

  const args = [
    'decide',
    '--request-id',
    normId,
    '--decision',
    params.decision,
    '--by',
    params.by,
    '--ttl-minutes',
    String(ttlMinutes),
  ];
  if (noteClean !== undefined) {
    args.push('--note', noteClean);
  }
  if (params.at !== undefined) {
    args.push('--at', trimAscii(params.at));
  }
  if (typeof params.nowMs === 'number' && Number.isFinite(params.nowMs)) {
    args.push('--now-ms', String(Math.floor(params.nowMs)));
  }

  const parsed = runApprovalLedgerCli(args);
  if (parsed.ok === true) {
    return {
      ok: true,
      decisionRecord: parsed.decisionRecord as ApprovalDecisionRecord,
      item: sanitizeApprovalItem(parsed.item as ApprovalItem),
    };
  }

  const httpStatus =
    parsed.httpStatus === 400 || parsed.httpStatus === 404 || parsed.httpStatus === 409
      ? parsed.httpStatus
      : 409;
  const code =
    parsed.code === 'invalid_input' ||
    parsed.code === 'not_found' ||
    parsed.code === 'already_decided'
      ? parsed.code
      : 'already_decided';

  return {
    ok: false,
    status: httpStatus,
    code,
    message: typeof parsed.message === 'string' ? parsed.message : 'Decision rejected.',
    ...(parsed.item ? { item: sanitizeApprovalItem(parsed.item as ApprovalItem) } : {}),
  };
}

export type RecordExecutionOutcome =
  | {
      ok: true;
      status: 'executed' | 'failed';
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
        | 'not_yet_valid'
        | 'already_executed'
        | 'digest_mismatch'
        | 'claim_mismatch';
      message: string;
      item?: ApprovalItem;
    };

/**
 * Record an execution for `requestId` by calling `operations/scripts/approval_ledger.py mark` (A-4 v06).
 */
export function recordApprovalExecution(params: {
  requestId: string;
  result: 'executed' | 'failed';
  claimId?: string;
  runId?: string;
  digest?: string;
  at?: string;
  idempotent?: boolean;
  throwOnError?: boolean;
  nowMs?: number;
}): RecordExecutionOutcome {
  if (isFenced() && !isFenceGuardDisabledForTest()) {
    throw new Error('[approvals-ledger] Instance is fenced. Writes are barred.');
  }

  const normId = trimAscii(params.requestId || '').toLowerCase();
  const args = [
    'mark',
    '--request-id',
    normId,
    '--result',
    params.result,
    '--include-item',
  ];
  if (params.claimId) {
    args.push('--claim-id', trimAscii(params.claimId));
  }
  if (params.runId) {
    args.push('--run-id', trimAscii(params.runId));
  }
  if (params.digest) {
    args.push('--digest', trimAscii(params.digest).toLowerCase());
  }
  if (params.at) {
    args.push('--at', trimAscii(params.at));
  }
  if (typeof params.nowMs === 'number' && Number.isFinite(params.nowMs)) {
    args.push('--now-ms', String(Math.floor(params.nowMs)));
  }
  if (!params.idempotent) {
    args.push('--no-idempotent');
  }

  const parsed = runApprovalLedgerCli(args);
  let outcome: RecordExecutionOutcome;
  if (parsed.ok === true) {
    outcome = {
      ok: true,
      status: (parsed.status as 'executed' | 'failed') || params.result,
      idempotent: Boolean(parsed.idempotent),
      executionRecord: parsed.executionRecord as ApprovalExecutionRecord,
      item: sanitizeApprovalItem(parsed.item as ApprovalItem),
    };
  } else {
    outcome = {
      ok: false,
      status: (parsed.status as Exclude<RecordExecutionOutcome, { ok: true }>['status']) || 'not_found',
      message: typeof parsed.message === 'string' ? parsed.message : 'Execution rejected.',
      ...(parsed.item ? { item: sanitizeApprovalItem(parsed.item as ApprovalItem) } : {}),
    };
  }

  if (!outcome.ok && params.throwOnError) {
    const err = new Error(outcome.message) as Error & { status?: string };
    err.status = outcome.status;
    throw err;
  }

  return outcome;
}
