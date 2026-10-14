import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getOfficeConfig } from '@/lib/office-config';
import { isFenced, isFenceGuardDisabledForTest } from '@/lib/budget-ledger';

/**
 * Approval Ledger & State Machine (A-4 v03)
 *
 * All records live in `<approvalsDir>/<YYYY-MM-DD>.jsonl` (UTC date):
 * - `request`: written by `operations/hooks/guard_bulk_send.py` (no `type` field in legacy/current hook lines,
 *   normalized to `type: "request"` on read).
 * - `decision`: written by `POST /api/approvals/<requestId>/decision` (`decision: "approved" | "denied"`).
 * - `claim`: written atomically under lock by `approval_check.py --consume` (or `checkAndConsumeApproval`)
 *   right before executing the guarded action (`type: "claim"`).
 * - `execution`: written by `operations/scripts/approval_mark.py` (or `recordApprovalExecution`)
 *   after the action runs (`result: "executed" | "failed"`).
 *
 * Deterministic requestId formula (shared between TypeScript and Python):
 *   `sha256(ts + "|" + seat + "|" + tool + "|" + sha256).slice(0, 16)` (16 lowercase hex chars)
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

const ISO_ASCII_REGEX =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?(Z|([+-])([0-9]{2}):([0-9]{2}))$/;

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
 * Strictly parse an ISO-8601 timestamp with explicit UTC (`Z`) or numeric offset (`±HH:MM`).
 * - Uses ASCII-only digit matching `[0-9]` (rejects Unicode numerals).
 * - Validates calendar date/time ranges and round-trips components via `Date.UTC` / `toISOString()`.
 * - Truncates sub-millisecond fractional digits to integer milliseconds (matching Python `parse_strict_iso_utc`).
 * - Returns `null` on any invalid timestamp (F2c, F5 fail-closed).
 */
export function parseStrictIsoMs(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const trimmed = iso.trim();
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

  if (year < 1 || year > 9999) return null;
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

  // Round-trip verification against normalized UTC ISO representation of local components
  const expectedLocalIso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${String(ms).padStart(3, '0')}Z`;
  if (new Date(localUtcMs).toISOString() !== expectedLocalIso) {
    return null;
  }

  const epochMs = localUtcMs - offsetMinutes * 60_000;
  if (new Date(epochMs + offsetMinutes * 60_000).toISOString() !== expectedLocalIso) {
    return null;
  }

  return epochMs;
}

export const parseIsoTimestampMs = parseStrictIsoMs;

/**
 * Count Unicode code points in a string without trimming (F2b, F6).
 * Matches Python `len(s)` on `str`.
 */
export function countCodePoints(s: string): number {
  return Array.from(s).length;
}

/**
 * Normalize legacy Vietnamese H1 `reason` strings from `operations/hooks/guard_bulk_send.py`
 * to clean English codes so the API and UI never leak Vietnamese strings (F9).
 */
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
  const s = typeof rawReason === 'string' ? rawReason.trim() : '';
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

/**
 * Ensure `head60` is strictly ASCII-safe and capped at 60 characters.
 */
export function sanitizeHead60Ascii(rawHead60: unknown): string {
  const s = typeof rawHead60 === 'string' ? rawHead60.slice(0, 60) : '';
  if (!s) return '';
  if (/[^\x00-\x7F]/.test(s)) {
    return s.replace(/[^\x20-\x7E]/g, '?');
  }
  return s;
}

/**
 * Deterministic 16-hex requestId from (ts, seat, tool, sha256).
 */
export function computeRequestId(
  ts: string,
  seat: string,
  tool: string,
  sha256: string
): string {
  const normalizedSha = (sha256 || '').trim().toLowerCase();
  const payload = `${(ts || '').trim()}|${(seat || '').trim()}|${(tool || '').trim()}|${normalizedSha}`;
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
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.AIBOSS_TEST_DISABLE_APPROVAL_LOCK === '1' &&
    Boolean(process.env.AIBOSS_DATA_DIR && process.env.AIBOSS_DATA_DIR.trim())
  );
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

const STALE_UNMEASURABLE_LOCK_MS = 30_000;

interface LockInspection {
  isStale: boolean;
  ino: number;
  raw: string;
}

/**
 * Unified stale lock inspection (F1b — shared with Python `inspect_lock_staleness`):
 * - If lock JSON contains a valid positive integer `pid`: stale IFF `!isPidAlive(pid)`
 *   (a live PID is NEVER reclaimed, even if held > 30s).
 * - If `pid` cannot be measured (corrupted/unparseable lock file): stale IFF `mtime` age > 30s.
 */
function inspectLockStaleness(lockPath: string, nowMs: number): LockInspection | null {
  try {
    const stat = fs.statSync(lockPath);
    const raw = fs.readFileSync(lockPath, 'utf-8');
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed) as { pid?: unknown };
        if (
          typeof parsed.pid === 'number' &&
          Number.isInteger(parsed.pid) &&
          parsed.pid > 0
        ) {
          return {
            isStale: !isPidAlive(parsed.pid),
            ino: stat.ino,
            raw,
          };
        }
      } catch {
        /* fall through to unmeasurable PID age check */
      }
    }
    return {
      isStale: nowMs - stat.mtimeMs > STALE_UNMEASURABLE_LOCK_MS,
      ino: stat.ino,
      raw,
    };
  } catch {
    return null;
  }
}

export function isLockFileStale(lockPath: string, nowMs = Date.now()): boolean {
  const info = inspectLockStaleness(lockPath, nowMs);
  return info ? info.isStale : false;
}

/**
 * Safely reclaim an orphan lock file using atomic `rename` under `.approvals.reclaim.lock`
 * so two concurrent reclaimers can never delete or steal a newly created lock (F1b).
 */
function tryReclaimStaleLock(
  approvalsDir: string,
  lockPath: string,
  observed: LockInspection
): void {
  const reclaimGuardPath = path.join(approvalsDir, '.approvals.reclaim.lock');
  const guardTmp = path.join(
    approvalsDir,
    `.approvals.reclaim.tmp-${process.pid}-${process.hrtime.bigint().toString()}`
  );
  let guardAcquired = false;

  try {
    fs.writeFileSync(
      guardTmp,
      JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
      { encoding: 'utf-8', mode: 0o600 }
    );
    try {
      fs.linkSync(guardTmp, reclaimGuardPath);
      guardAcquired = true;
    } catch {
      const guardCheck = inspectLockStaleness(reclaimGuardPath, Date.now());
      if (guardCheck && guardCheck.isStale) {
        const staleGuard = `${reclaimGuardPath}.stale-${process.pid}-${process.hrtime.bigint().toString()}`;
        try {
          fs.renameSync(reclaimGuardPath, staleGuard);
          fs.unlinkSync(staleGuard);
        } catch {
          /* ignore race */
        }
      }
      return;
    }

    // Re-verify under reclaim guard that `.approvals.lock` is STILL the exact same orphan file
    const recheck = inspectLockStaleness(lockPath, Date.now());
    if (
      !recheck ||
      !recheck.isStale ||
      recheck.ino !== observed.ino ||
      recheck.raw !== observed.raw
    ) {
      return;
    }

    const staleTarget = `${lockPath}.stale-${process.pid}-${process.hrtime.bigint().toString()}`;
    try {
      fs.renameSync(lockPath, staleTarget);
      try {
        fs.unlinkSync(staleTarget);
      } catch {
        /* ignore cleanup race */
      }
    } catch {
      /* another process renamed first */
    }
  } finally {
    try {
      fs.unlinkSync(guardTmp);
    } catch {
      /* ignore */
    }
    if (guardAcquired) {
      try {
        fs.unlinkSync(reclaimGuardPath);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Cross-process atomic lock on `<approvals_dir>/.approvals.lock` (F1b).
 * - Publishes a fully-written lock file atomically via `link(tmpPath, lockPath)` (`O_EXCL` semantics).
 * - Reclaims orphan locks via atomic `rename` to `.approvals.lock.stale-<pid>-<ns>` under `.approvals.reclaim.lock`.
 */
export function withApprovalLock<T>(fn: () => T, timeoutMs = 5000): T {
  if (isApprovalLockDisabledForTest()) {
    return fn();
  }
  ensureApprovalsDir();
  const approvalsDir = getApprovalsDir();
  const lockPath = getApprovalLockPath();
  const token = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const tmpPath = `${lockPath}.tmp-${process.pid}-${token}`;
  const start = Date.now();

  const payload = JSON.stringify({
    pid: process.pid,
    token,
    createdAt: Date.now(),
  });
  const tmpFd = fs.openSync(
    tmpPath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600
  );
  try {
    fs.writeSync(tmpFd, payload, 0, 'utf-8');
    fs.fsyncSync(tmpFd);
  } finally {
    fs.closeSync(tmpFd);
  }

  let acquired = false;
  try {
    while (true) {
      try {
        fs.linkSync(tmpPath, lockPath);
        acquired = true;
        break;
      } catch (err: unknown) {
        if ((err as { code?: string })?.code !== 'EEXIST') {
          throw err;
        }
        const inspection = inspectLockStaleness(lockPath, Date.now());
        if (inspection && inspection.isStale) {
          tryReclaimStaleLock(approvalsDir, lockPath, inspection);
          continue;
        }
        if (Date.now() - start >= timeoutMs) {
          throw new Error(
            `[approvals-ledger] Timed out acquiring approval lock at ${lockPath}`
          );
        }
        const waitEnd = Date.now() + 10;
        while (Date.now() < waitEnd) {
          /* brief spin wait */
        }
      }
    }
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }

  try {
    return fn();
  } finally {
    if (acquired) {
      try {
        const currentRaw = fs.readFileSync(lockPath, 'utf-8').trim();
        if (currentRaw) {
          const currentParsed = JSON.parse(currentRaw) as { token?: string };
          if (currentParsed.token === token) {
            const relPath = `${lockPath}.rel-${process.pid}-${token}`;
            try {
              fs.renameSync(lockPath, relPath);
              fs.unlinkSync(relPath);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
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

  if (
    typeof obj.ts !== 'string' ||
    typeof obj.seat !== 'string' ||
    typeof obj.tool !== 'string' ||
    typeof obj.sha256 !== 'string'
  ) {
    return null;
  }

  const ts = obj.ts.trim();
  if (parseStrictIsoMs(ts) === null) return null;

  const seat = obj.seat.trim();
  const tool = obj.tool.trim();
  const sha256 = obj.sha256.trim().toLowerCase();
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
 * - Requires valid ISO `at` and `expiresAt` (F5 fail-closed).
 * - If `note` key is present (including `null`), it must be a string with <= 200 Unicode code points (F2b, F6).
 */
export function sanitizeApprovalDecisionRecord(
  raw: unknown
): ApprovalDecisionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'decision') return null;

  if (
    typeof obj.requestId !== 'string' ||
    typeof obj.at !== 'string' ||
    typeof obj.expiresAt !== 'string'
  ) {
    return null;
  }

  const requestId = obj.requestId.trim().toLowerCase();
  const decision = obj.decision;
  const by = obj.by;
  const at = obj.at.trim();
  const expiresAt = obj.expiresAt.trim();

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
  if ('note' in obj && obj.note !== undefined) {
    if (typeof obj.note !== 'string') return null;
    if (countCodePoints(obj.note) > 200) return null;
    const trimmed = obj.note.trim();
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
 * Strictly sanitize a claim record (F1, F2a).
 */
export function sanitizeApprovalClaimRecord(
  raw: unknown
): ApprovalClaimRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'claim') return null;

  if (
    typeof obj.requestId !== 'string' ||
    typeof obj.claimId !== 'string' ||
    typeof obj.at !== 'string'
  ) {
    return null;
  }
  if ('seatId' in obj && obj.seatId !== undefined && typeof obj.seatId !== 'string') {
    return null;
  }
  if ('tool' in obj && obj.tool !== undefined && typeof obj.tool !== 'string') {
    return null;
  }
  if ('digest' in obj && obj.digest !== undefined && typeof obj.digest !== 'string') {
    return null;
  }

  const requestId = obj.requestId.trim().toLowerCase();
  const claimId = obj.claimId.trim();
  const seatId = typeof obj.seatId === 'string' ? obj.seatId.trim() : '';
  const tool = typeof obj.tool === 'string' ? obj.tool.trim() : '';
  const digest = typeof obj.digest === 'string' ? obj.digest.trim().toLowerCase() : '';
  const at = obj.at.trim();

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
 * Requires string `requestId`, `seatId`, `at`, `digest`, and `result: "executed" | "failed"` (F1a, F2a, F5).
 */
export function sanitizeApprovalExecutionRecord(
  raw: unknown
): ApprovalExecutionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'execution') return null;

  if (
    typeof obj.requestId !== 'string' ||
    typeof obj.seatId !== 'string' ||
    typeof obj.at !== 'string' ||
    typeof obj.digest !== 'string'
  ) {
    return null;
  }
  if ('claimId' in obj && obj.claimId !== undefined && typeof obj.claimId !== 'string') {
    return null;
  }
  if ('runId' in obj && obj.runId !== undefined && typeof obj.runId !== 'string') {
    return null;
  }

  const requestId = obj.requestId.trim().toLowerCase();
  const seatId = obj.seatId.trim();
  const at = obj.at.trim();
  const result = obj.result;
  const digest = obj.digest.trim().toLowerCase();

  if (
    !/^[0-9a-f]{16}$/.test(requestId) ||
    !seatId ||
    parseStrictIsoMs(at) === null ||
    (result !== 'executed' && result !== 'failed') ||
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
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
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

export function getApprovalLogPathForDate(dateStrOrIso?: string): string {
  ensureApprovalsDir();
  let d = new Date();
  if (dateStrOrIso) {
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateStrOrIso)) {
      return path.join(getApprovalsDir(), `${dateStrOrIso}.jsonl`);
    }
    const ms = parseStrictIsoMs(dateStrOrIso);
    if (ms !== null) {
      d = new Date(ms);
    }
  }
  return path.join(getApprovalsDir(), `${getUtcDateString(d)}.jsonl`);
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
 * Safe atomic JSONL append (F3, F10):
 * Opens `filePath` with `O_CREAT | O_RDWR | O_APPEND` so the OS kernel guarantees
 * every write is appended at the true end of file (never overwriting concurrent H1 hook appends).
 * Inspects the last byte to prepend `\n` if a crashed process left a partial line without newline,
 * then writes `prefix + serializedJson + '\n'` in a single `writeSync` call with no offset argument.
 */
function appendJsonlLineSafely(filePath: string, serializedJson: string): void {
  ensureApprovalsDir();
  const fd = fs.openSync(
    filePath,
    fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_APPEND,
    0o644
  );
  try {
    const stat = fs.fstatSync(fd);
    let prefix = '';
    if (stat.size > 0) {
      const lastByteBuf = Buffer.alloc(1);
      const bytesRead = fs.readSync(fd, lastByteBuf, 0, 1, stat.size - 1);
      if (bytesRead === 1 && lastByteBuf[0] !== 0x0a) {
        prefix = '\n';
      }
    }
    const buf = Buffer.from(prefix + serializedJson + '\n', 'utf-8');
    fs.writeSync(fd, buf);
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
 * Fold approval ledger with unified state transition validation (F1, F2, F5, F11).
 * Identical rules to Python `load_folded_ledger` in `approval_check.py` and `approval_mark.py`.
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
      } else {
        state = 'failed';
        status = 'failed';
      }
    } else if (nowMs < decAtMs) {
      // F11: Decision `at` is in the future — not yet valid/active
      state = 'not_yet_valid';
      status = 'pending';
    } else if (nowMs >= expMs && !claim) {
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
 * Derive current state for every request in the ledger.
 */
export function deriveApprovalItems(nowMs = Date.now()): ApprovalItem[] {
  const map = foldApprovalLedger();
  const items: ApprovalItem[] = [];
  for (const folded of map.values()) {
    items.push(buildApprovalItem(folded, nowMs));
  }
  items.sort((a, b) => {
    const aMs = parseStrictIsoMs(a.ts) ?? 0;
    const bMs = parseStrictIsoMs(b.ts) ?? 0;
    return bMs - aMs;
  });
  return items;
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
  const all = deriveApprovalItems(query.nowMs);
  const statusFilter = query.status?.trim().toLowerCase();
  const seatFilter = query.seat?.trim();

  const filtered = all.filter((item) => {
    if (seatFilter && item.seat !== seatFilter) {
      return false;
    }
    if (!statusFilter || statusFilter === 'all') {
      return true;
    }
    if (statusFilter === 'pending' || statusFilter === 'requested') {
      return item.status === 'pending' || item.state === 'requested';
    }
    return item.status === statusFilter || item.state === statusFilter;
  });

  return {
    approvals: filtered.slice(0, limit),
    total: filtered.length,
  };
}

export function getApprovalById(
  requestId: string,
  nowMs = Date.now()
): ApprovalItem | null {
  const normId = (requestId || '').trim().toLowerCase();
  if (!normId) return null;
  const map = foldApprovalLedger();
  const folded = map.get(normId);
  if (!folded) return null;
  return buildApprovalItem(folded, nowMs);
}

export type ApprovalCheckFailureReason =
  | 'not_found'
  | 'pending'
  | 'denied'
  | 'expired'
  | 'not_yet_valid'
  | 'claimed'
  | 'executed'
  | 'failed'
  | 'digest_mismatch'
  | 'superseded';

export type ApprovalCheckOutcome =
  | {
      ok: true;
      allowed: true;
      requestId: string;
      status: 'approved';
      expiresAt: string;
      claimId?: string;
      item: ApprovalItem;
    }
  | {
      ok: false;
      allowed: false;
      status: ApprovalCheckFailureReason;
      reason: ApprovalCheckFailureReason;
      requestId?: string;
      latestRequestId?: string;
      expiresAt?: string;
      claimId?: string;
      item?: ApprovalItem;
    };

function makeCheckFailure(
  reason: ApprovalCheckFailureReason,
  extra: {
    requestId?: string;
    latestRequestId?: string;
    expiresAt?: string;
    claimId?: string;
    item?: ApprovalItem;
  } = {}
): ApprovalCheckOutcome {
  return {
    ok: false,
    allowed: false,
    status: reason,
    reason,
    ...extra,
  };
}

/**
 * Evaluate the NEWEST request for `(seat, tool, sha256)` ordered by UTC epoch timestamp (F4, F11).
 * If `requestId` is provided, it only confirms that the newest request matches `requestId`;
 * if a newer request exists, returns `reason: "superseded"` (never falls back to an older approval).
 */
function evaluateApprovalForActionUnlocked(params: {
  seat: string;
  tool: string;
  sha256: string;
  requestId?: string;
  nowMs: number;
}):
  | {
      ok: true;
      latest: FoldedRequestState;
      item: ApprovalItem;
      expiresAt: string;
    }
  | {
      ok: false;
      outcome: ApprovalCheckOutcome;
    } {
  const seat = (params.seat || '').trim();
  const tool = (params.tool || '').trim();
  const sha256 = (params.sha256 || '').trim().toLowerCase();
  const reqIdFilter = params.requestId ? params.requestId.trim().toLowerCase() : undefined;
  const nowMs = params.nowMs;

  const map = foldApprovalLedger();
  const candidates = Array.from(map.values()).filter(
    (f) => f.request.seat === seat && f.request.tool === tool
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      outcome: makeCheckFailure('not_found', {
        ...(reqIdFilter ? { requestId: reqIdFilter } : {}),
      }),
    };
  }

  // F4: Sort ascending by real UTC epoch timestamp, tie-breaking by ledger line order
  candidates.sort((a, b) => {
    if (a.requestTsMs !== b.requestTsMs) {
      return a.requestTsMs - b.requestTsMs;
    }
    return a.orderIndex - b.orderIndex;
  });

  const exactDigestMatches = candidates.filter(
    (c) => c.request.sha256 === sha256
  );

  if (exactDigestMatches.length === 0) {
    const latestOther = candidates[candidates.length - 1];
    return {
      ok: false,
      outcome: makeCheckFailure('digest_mismatch', {
        requestId: latestOther.request.requestId,
        item: buildApprovalItem(latestOther, nowMs),
      }),
    };
  }

  // F4: Always select the NEWEST request for (seat, tool, sha256) FIRST
  const latest = exactDigestMatches[exactDigestMatches.length - 1];

  // F4: If caller specified requestId, it must match the newest request; older requests are superseded
  if (reqIdFilter && latest.request.requestId !== reqIdFilter) {
    const matchedOld = candidates.some((c) => c.request.requestId === reqIdFilter);
    return {
      ok: false,
      outcome: makeCheckFailure(matchedOld ? 'superseded' : 'not_found', {
        requestId: reqIdFilter,
        ...(matchedOld ? { latestRequestId: latest.request.requestId } : {}),
      }),
    };
  }

  const latestItem = buildApprovalItem(latest, nowMs);

  if (!latest.decision) {
    return {
      ok: false,
      outcome: makeCheckFailure('pending', {
        requestId: latest.request.requestId,
        item: latestItem,
      }),
    };
  }

  if (latest.decision.decision === 'denied') {
    return {
      ok: false,
      outcome: makeCheckFailure('denied', {
        requestId: latest.request.requestId,
        expiresAt: latest.decision.expiresAt,
        item: latestItem,
      }),
    };
  }

  const expMs = parseStrictIsoMs(latest.decision.expiresAt);
  const decAtMs = parseStrictIsoMs(latest.decision.at);
  if (expMs === null || decAtMs === null) {
    return {
      ok: false,
      outcome: makeCheckFailure('expired', {
        requestId: latest.request.requestId,
        expiresAt: latest.decision.expiresAt,
        item: latestItem,
      }),
    };
  }

  if (latest.primaryExecution !== null) {
    return {
      ok: false,
      outcome: makeCheckFailure(
        latest.primaryExecution.result === 'failed' ? 'failed' : 'executed',
        {
          requestId: latest.request.requestId,
          expiresAt: latest.decision.expiresAt,
          claimId: latest.primaryExecution.claimId,
          item: latestItem,
        }
      ),
    };
  }

  if (latest.claim !== null) {
    return {
      ok: false,
      outcome: makeCheckFailure('claimed', {
        requestId: latest.request.requestId,
        expiresAt: latest.decision.expiresAt,
        claimId: latest.claim.claimId,
        item: latestItem,
      }),
    };
  }

  // F11: Decision `at` in the future is not yet valid
  if (nowMs < decAtMs) {
    return {
      ok: false,
      outcome: makeCheckFailure('not_yet_valid', {
        requestId: latest.request.requestId,
        expiresAt: latest.decision.expiresAt,
        item: latestItem,
      }),
    };
  }

  if (nowMs >= expMs) {
    return {
      ok: false,
      outcome: makeCheckFailure('expired', {
        requestId: latest.request.requestId,
        expiresAt: latest.decision.expiresAt,
        item: latestItem,
      }),
    };
  }

  return {
    ok: true,
    latest,
    item: latestItem,
    expiresAt: latest.decision.expiresAt,
  };
}

/**
 * Non-consuming check for an active approval for `(seat, tool, sha256)`.
 */
export function findActiveApprovalForAction(params: {
  seat: string;
  tool: string;
  sha256: string;
  requestId?: string;
  nowMs?: number;
}): ApprovalCheckOutcome {
  const nowMs = params.nowMs ?? Date.now();
  const evaluated = evaluateApprovalForActionUnlocked({
    ...params,
    nowMs,
  });
  if (!evaluated.ok) {
    return evaluated.outcome;
  }
  return {
    ok: true,
    allowed: true,
    requestId: evaluated.latest.request.requestId,
    status: 'approved',
    expiresAt: evaluated.expiresAt,
    item: evaluated.item,
  };
}

/**
 * Atomic single-use claim/consume before action execution (F1, F4, F11, F12):
 * Under the cross-process lock, checks if the newest request for `(seat, tool, sha256)`
 * is `approved`, valid (`now >= decision.at` and `now < decision.expiresAt`), unclaimed,
 * and unexecuted; if so, writes a `claim` record and returns `{ ok: true, allowed: true, status: 'approved', requestId, claimId, expiresAt }`.
 */
export function checkAndConsumeApproval(params: {
  seat: string;
  tool: string;
  sha256: string;
  requestId?: string;
  nowMs?: number;
}): ApprovalCheckOutcome {
  if (isFenced() && !isFenceGuardDisabledForTest()) {
    throw new Error('[approvals-ledger] Instance is fenced. Writes are barred.');
  }

  return withApprovalLock(() => {
    const nowMs = params.nowMs ?? Date.now();
    const evaluated = evaluateApprovalForActionUnlocked({
      ...params,
      nowMs,
    });
    if (!evaluated.ok) {
      return evaluated.outcome;
    }

    const { latest, expiresAt } = evaluated;
    const atIso = new Date(nowMs).toISOString();
    const claimId = crypto
      .createHash('sha256')
      .update(
        `${latest.request.requestId}|${process.pid}|${atIso}|${crypto.randomBytes(8).toString('hex')}`,
        'utf8'
      )
      .digest('hex')
      .slice(0, 16);

    const claimRecord: ApprovalClaimRecord = {
      type: 'claim',
      requestId: latest.request.requestId,
      claimId,
      seatId: latest.request.seat,
      tool: latest.request.tool,
      digest: latest.request.sha256,
      at: atIso,
    };

    const targetFile = resolveTargetFileForRequest(latest.sourceFile, atIso);
    appendApprovalRecordUnlocked(claimRecord, targetFile);
    latest.claim = claimRecord;

    return {
      ok: true,
      allowed: true,
      requestId: latest.request.requestId,
      status: 'approved',
      expiresAt,
      claimId,
      item: buildApprovalItem(latest, nowMs),
    };
  });
}

export const consumeApprovalForAction = checkAndConsumeApproval;

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
 * Record an approval decision (`approved` or `denied`) for `requestId`.
 * - Unknown `requestId` -> 404
 * - Already decided `requestId` -> 409
 * - `note` present (including `null`) and non-string or > 200 Unicode code points -> 400 (no ledger write) (F2b, F6)
 * - `expiresAt` is always computed from server `ttlMinutes` (F8).
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
    const trimmed = params.note.trim();
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
 * Record an execution for a requestId under lock (F1a, F1b, F2, F11).
 * - Writes 0 bytes to the ledger whenever the request is not in a valid active `approved` state
 *   (`not_found`, `pending`, `denied`, `expired`, `not_yet_valid`, `already_executed` / `digest_mismatch`, `claim_mismatch`).
 * - Throws an Error when `throwOnError: true` is passed and the transition is rejected.
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

  const outcome = withApprovalLock((): RecordExecutionOutcome => {
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

    const providedDigest = (params.digest ?? existing.request.sha256)
      .trim()
      .toLowerCase();

    // F1a: Already executed — 0 lines written on repeat/conflict
    if (existing.primaryExecution !== null) {
      if (
        params.idempotent &&
        existing.primaryExecution.result === params.result &&
        (existing.primaryExecution.claimId ?? undefined) ===
          (params.claimId ?? undefined)
      ) {
        return {
          ok: true,
          status: existing.primaryExecution.result,
          idempotent: true,
          executionRecord: existing.primaryExecution,
          item: buildApprovalItem(existing, nowMs),
        };
      }

      return {
        ok: false,
        status: 'digest_mismatch',
        message: `Approval request "${normId}" was already used once.`,
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
    if (expMs === null || decAtMs === null) {
      return {
        ok: false,
        status: 'expired',
        message: `Approval request "${normId}" has invalid decision timestamps.`,
        item: buildApprovalItem(existing, nowMs),
      };
    }

    if (nowMs < decAtMs || atMs < decAtMs) {
      return {
        ok: false,
        status: 'not_yet_valid',
        message: `Approval request "${normId}" decision timestamp is in the future.`,
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
      // F1a: Expired approval -> 0 lines written to ledger!
      if (nowMs >= expMs || atMs >= expMs) {
        return {
          ok: false,
          status: 'expired',
          message: `Approval request "${normId}" has expired.`,
          item: buildApprovalItem(existing, nowMs),
        };
      }
    }

    // F1a: Digest mismatch -> 0 lines written to ledger!
    if (providedDigest !== existing.request.sha256) {
      return {
        ok: false,
        status: 'digest_mismatch',
        message: `Digest mismatch for approval request "${normId}".`,
        item: buildApprovalItem(existing, nowMs),
      };
    }

    const targetFile = resolveTargetFileForRequest(existing.sourceFile, atIso);
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
      status: params.result,
      idempotent: false,
      executionRecord: execRecord,
      item: buildApprovalItem(existing, nowMs),
    };
  });

  if (!outcome.ok && params.throwOnError) {
    const err = new Error(outcome.message) as Error & { status?: string };
    err.status = outcome.status;
    throw err;
  }

  return outcome;
}
