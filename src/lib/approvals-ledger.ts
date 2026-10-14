import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getOfficeConfig } from '@/lib/office-config';
import { isFenced, isFenceGuardDisabledForTest } from '@/lib/budget-ledger';

/**
 * Approval Ledger & State Machine (A-4 v04)
 *
 * All records live in `<approvalsDir>/<YYYY-MM-DD>.jsonl` (UTC date):
 * - `request`: written by `operations/hooks/guard_bulk_send.py` (no `type` field in legacy/current hook lines,
 *   normalized to `type: "request"` on read; `"type": null` is rejected).
 * - `decision`: written by `POST /api/approvals/<requestId>/decision` (`decision: "approved" | "denied"`).
 * - `claim`: written atomically under lock exclusively by `approval_check.py --consume` (hook H4)
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
 * - Uses ASCII-only digit matching `[0-9]` with valid year domain `1970–9999`.
 * - Validates calendar date/time ranges and round-trips components via `Date.UTC` / `toISOString()`.
 * - Truncates sub-millisecond fractional digits to integer milliseconds (matching Python `parse_strict_iso_ms`).
 * - Verifies resulting UTC instant also stays within `1970-01-01T00:00:00.000Z .. 9999-12-31T23:59:59.999Z`
 *   so boundary offsets like `9999-12-31T23:59:59-00:01` are rejected identically to Python.
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

  // Round-trip verification against normalized UTC ISO representation of local components
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
  const normalizedSha = trimAscii(sha256 || '').toLowerCase();
  const payload = `${trimAscii(ts || '')}|${trimAscii(seat || '')}|${trimAscii(tool || '')}|${normalizedSha}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

export function getApprovalsDir(): string {
  const baseDir =
    process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  return path.join(baseDir, 'approvals');
}

function extractErrnoReason(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' && code ? code : 'EIO';
}

export class ApprovalLockTimeoutError extends Error {
  readonly code = 'lock_timeout';
  readonly status = 'lock_timeout';

  constructor() {
    super('Timed out acquiring approval lock.');
    this.name = 'ApprovalLockTimeoutError';
  }
}

export class ApprovalLockLostError extends Error {
  readonly code = 'lock_lost';
  readonly status = 'lock_lost';

  constructor() {
    super('Approval lock ownership was lost before write.');
    this.name = 'ApprovalLockLostError';
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

export function ensureApprovalsDir(): void {
  const dir = getApprovalsDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err: unknown) {
    throw new ApprovalIoError(extractErrnoReason(err));
  }
}

export function getApprovalLockPath(): string {
  return path.join(getApprovalsDir(), '.approvals.lock');
}

export function isApprovalLockDisabledForTest(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.AIBOSS_TEST_DISABLE_APPROVAL_LOCK === '1' &&
    Boolean(process.env.AIBOSS_DATA_DIR && trimAscii(process.env.AIBOSS_DATA_DIR))
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

let cachedSystemBootId: string | null = null;

/**
 * Read OS boot identifier (`kern.boottime` sec on macOS, `/proc/stat` `btime` on Linux) (F16).
 */
export function getSystemBootId(): string {
  if (cachedSystemBootId !== null) {
    return cachedSystemBootId;
  }
  try {
    if (process.platform === 'linux' && fs.existsSync('/proc/stat')) {
      const statContent = fs.readFileSync('/proc/stat', 'utf-8');
      const m = /^btime\s+([0-9]+)/m.exec(statContent);
      if (m && m[1]) {
        cachedSystemBootId = m[1];
        return cachedSystemBootId;
      }
    }
    const out = trimAscii(
      execFileSync('sysctl', ['-n', 'kern.boottime'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1000,
      })
    );
    const secMatch = /sec\s*=\s*([0-9]+)/.exec(out);
    if (secMatch && secMatch[1]) {
      cachedSystemBootId = secMatch[1];
      return cachedSystemBootId;
    }
    if (/^[0-9]+$/.test(out)) {
      cachedSystemBootId = out;
      return cachedSystemBootId;
    }
  } catch {
    /* fallback below */
  }
  cachedSystemBootId = 'unknown';
  return cachedSystemBootId;
}

const STALE_UNMEASURABLE_LOCK_MS = 30_000;
const STALE_LOCK_ARTIFACT_SWEEP_MS = 10 * 60_000; // 10 minutes (F16)
const SHARED_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function sleepSyncMs(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(SHARED_WAIT_BUFFER, 0, 0, Math.ceil(ms));
}

function monotonicNowMs(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

interface LockInspection {
  isStale: boolean;
  ino: number;
  raw: string;
}

/**
 * Unified stale lock inspection (F1b, F14, F16 — shared with Python `inspect_lock_staleness`):
 * - Verifies `statBefore.ino === statAfter.ino` around reading `.approvals.lock` so `ino` matches content.
 * - Checks `hostname`: if lock `hostname` is present and differs from current `os.hostname()`,
 *   returns `isStale: false` (never steal a lock created by a different host) (F16).
 * - On the same host:
 *   - If lock JSON contains `bootId` that is known and differs from current known OS `bootId`:
 *     stale (`isStale: true`) even if `pid` happens to exist after a machine reboot (F16).
 *   - If `bootId` is `'unknown'` or matches: a valid positive integer `pid` is stale IFF `!isPidAlive(pid)`
 *     (conservative rule: a live PID is NEVER reclaimed, even if held > 30s).
 *   - If `pid` cannot be measured (corrupted/unparseable lock file): stale IFF `mtime` age > 30s.
 */
function inspectLockStaleness(lockPath: string, nowMs: number): LockInspection | null {
  try {
    const statBefore = fs.statSync(lockPath);
    const raw = fs.readFileSync(lockPath, 'utf-8');
    const statAfter = fs.statSync(lockPath);
    if (statBefore.ino !== statAfter.ino) {
      return null;
    }
    const trimmed = trimAscii(raw);
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed) as {
          pid?: unknown;
          bootId?: unknown;
          hostname?: unknown;
        };
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const currentHostname = trimAscii(os.hostname());
          const lockHostname =
            typeof parsed.hostname === 'string' ? trimAscii(parsed.hostname) : '';
          if (lockHostname && currentHostname && lockHostname !== currentHostname) {
            return {
              isStale: false,
              ino: statAfter.ino,
              raw,
            };
          }

          const currentBootId = getSystemBootId();
          const lockBootId =
            typeof parsed.bootId === 'string' ? trimAscii(parsed.bootId) : '';
          if (
            lockBootId &&
            lockBootId !== 'unknown' &&
            currentBootId !== 'unknown' &&
            lockBootId !== currentBootId
          ) {
            return {
              isStale: true,
              ino: statAfter.ino,
              raw,
            };
          }
          if (
            typeof parsed.pid === 'number' &&
            Number.isInteger(parsed.pid) &&
            parsed.pid > 0
          ) {
            return {
              isStale: !isPidAlive(parsed.pid),
              ino: statAfter.ino,
              raw,
            };
          }
        }
      } catch {
        /* fall through to unmeasurable PID age check */
      }
    }
    return {
      isStale: nowMs - statAfter.mtimeMs > STALE_UNMEASURABLE_LOCK_MS,
      ino: statAfter.ino,
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

const LOCK_ARTIFACT_PID_REGEX =
  /^\.approvals\.lock\.(?:tmp|stale|rel)-([0-9]+)(?:-|$)/;

/**
 * Best-effort sweep of leftover `.approvals.lock.tmp*` / `.approvals.lock.stale-*` / `.approvals.lock.rel-*`
 * artifacts older than 10 minutes whose creator PID is no longer alive (F16).
 * Never touches `.approvals.lock` itself and never deletes `.tmp` of a still-living PID.
 */
function sweepOldLockArtifacts(approvalsDir: string, nowMs: number): void {
  try {
    const entries = fs.readdirSync(approvalsDir);
    let inspected = 0;
    for (const name of entries) {
      if (
        !name.startsWith('.approvals.lock.tmp') &&
        !name.startsWith('.approvals.lock.stale-') &&
        !name.startsWith('.approvals.lock.rel-')
      ) {
        continue;
      }
      inspected += 1;
      if (inspected > 32) break;
      const pidMatch = LOCK_ARTIFACT_PID_REGEX.exec(name);
      if (pidMatch && pidMatch[1]) {
        const artifactPid = parseInt(pidMatch[1], 10);
        if (isPidAlive(artifactPid)) {
          continue;
        }
      }
      const fullPath = path.join(approvalsDir, name);
      try {
        const st = fs.statSync(fullPath);
        if (nowMs - st.mtimeMs > STALE_LOCK_ARTIFACT_SWEEP_MS) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        /* ignore concurrent unlink */
      }
    }
  } catch {
    /* ignore sweep errors */
  }
}

let activeLockDepth = 0;
let activeLockOwnedIno: number | null = null;
let activeLockPath: string | null = null;

/**
 * Verify that the current process still owns `.approvals.lock` by checking that
 * `stat(lockPath).ino === activeLockOwnedIno` (F14a).
 * Called immediately before every ledger append (`decision`, `claim`, `execution`)
 * and before releasing the lock. If the lock was stolen or unlinked, throws `ApprovalLockLostError`.
 */
export function verifyApprovalLockOwnership(lockPath?: string): void {
  if (isApprovalLockDisabledForTest()) {
    return;
  }
  const targetLockPath = lockPath || activeLockPath || getApprovalLockPath();
  if (activeLockDepth <= 0 || activeLockOwnedIno === null) {
    throw new ApprovalLockLostError();
  }
  let currentIno: number | null = null;
  try {
    currentIno = fs.statSync(targetLockPath).ino;
  } catch {
    currentIno = null;
  }
  if (currentIno === null || currentIno !== activeLockOwnedIno) {
    throw new ApprovalLockLostError();
  }
}

/**
 * Cross-process atomic lock on `<approvals_dir>/.approvals.lock` (F1b, F14a/b, F15, F16, F18).
 * - (a) Owner inode verification (F14a): records `ownedIno` of `tmpPath` (`fstat`/`stat`) before
 *       `link(tmpPath, lockPath)` and verifies `stat(lockPath).ino === ownedIno` immediately after `link`,
 *       immediately before EVERY ledger append (`verifyApprovalLockOwnership`), and before releasing.
 *       If `ino` ever differs or `ENOENT`, aborts without writing a single byte (`ApprovalLockLostError` -> `lock_lost`).
 * - (b) Reclaimer inode verification before and after `rename` (F14b):
 *       Records `observedIno` of the stale lock; checks `stat(lockPath).ino === observedIno` right before
 *       `rename(lockPath, staleTarget)`; after `rename`, checks `stat(staleTarget).ino === observedIno`.
 *       If `staleIno !== observedIno` (accidentally took a live lock), immediately restores it via
 *       `rename(staleTarget, lockPath)` (if `lockPath` already exists, leaves `staleTarget`, logs to stderr,
 *       and retries; the displaced owner will also self-fence via (a)). Only when `staleIno === observedIno`
 *       does it `unlink(staleTarget)` and retry `link`.
 * - (c) Every loop branch checks the monotonic timeout deadline (`timeoutMs`, default 5000ms) before `continue`
 *       and throws `ApprovalLockTimeoutError` (`lock_timeout`) on expiry (F15).
 */
export function withApprovalLock<T>(fn: () => T, timeoutMs = 5000): T {
  if (isApprovalLockDisabledForTest()) {
    return fn();
  }
  if (activeLockDepth > 0 && activeLockOwnedIno !== null) {
    verifyApprovalLockOwnership();
    activeLockDepth += 1;
    try {
      return fn();
    } finally {
      activeLockDepth -= 1;
    }
  }

  ensureApprovalsDir();
  const approvalsDir = getApprovalsDir();
  const lockPath = getApprovalLockPath();
  const nowStart = Date.now();
  sweepOldLockArtifacts(approvalsDir, nowStart);

  const token = `${process.pid}-${nowStart}-${crypto.randomBytes(6).toString('hex')}`;
  const tmpPath = `${lockPath}.tmp-${process.pid}-${token}`;
  const deadlineMono = monotonicNowMs() + timeoutMs;

  const payload = JSON.stringify({
    pid: process.pid,
    token,
    createdAt: Date.now(),
    bootId: getSystemBootId(),
    hostname: os.hostname(),
  });
  let ownedIno: number;
  let tmpFd: number;
  try {
    tmpFd = fs.openSync(
      tmpPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      0o600
    );
  } catch (err: unknown) {
    throw new ApprovalIoError(extractErrnoReason(err));
  }
  try {
    fs.writeSync(tmpFd, payload, 0, 'utf-8');
    fs.fsyncSync(tmpFd);
    ownedIno = fs.fstatSync(tmpFd).ino;
  } catch (err: unknown) {
    try {
      fs.closeSync(tmpFd);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw new ApprovalIoError(extractErrnoReason(err));
  }
  try {
    fs.closeSync(tmpFd);
  } catch {
    /* ignore */
  }

  let acquired = false;
  try {
    while (true) {
      try {
        fs.linkSync(tmpPath, lockPath);
        let linkedIno: number | null = null;
        try {
          linkedIno = fs.statSync(lockPath).ino;
        } catch {
          linkedIno = null;
        }
        if (linkedIno === null || linkedIno !== ownedIno) {
          throw new ApprovalLockLostError();
        }
        acquired = true;
        break;
      } catch (err: unknown) {
        if (err instanceof ApprovalLockLostError) {
          throw err;
        }
        if ((err as { code?: string })?.code !== 'EEXIST') {
          throw new ApprovalIoError(extractErrnoReason(err));
        }
        const nowMono = monotonicNowMs();
        if (nowMono >= deadlineMono) {
          throw new ApprovalLockTimeoutError();
        }

        const inspection = inspectLockStaleness(lockPath, Date.now());
        if (inspection && inspection.isStale) {
          const observedIno = inspection.ino;
          let preRenameIno: number | null = null;
          try {
            preRenameIno = fs.statSync(lockPath).ino;
          } catch {
            preRenameIno = null;
          }
          if (preRenameIno === null || preRenameIno !== observedIno) {
            const afterPreCheckMono = monotonicNowMs();
            if (afterPreCheckMono >= deadlineMono) {
              throw new ApprovalLockTimeoutError();
            }
            sleepSyncMs(Math.min(25, Math.max(1, deadlineMono - afterPreCheckMono)));
            if (monotonicNowMs() >= deadlineMono) {
              throw new ApprovalLockTimeoutError();
            }
            continue;
          }

          const staleTarget = `${lockPath}.stale-${process.pid}-${process.hrtime.bigint().toString()}`;
          let renamed = false;
          try {
            fs.renameSync(lockPath, staleTarget);
            renamed = true;
          } catch {
            renamed = false;
          }

          if (renamed) {
            let staleIno: number | null = null;
            try {
              staleIno = fs.statSync(staleTarget).ino;
            } catch {
              staleIno = null;
            }
            if (staleIno === null || staleIno !== observedIno) {
              // F14b: Mis-reclaimed a newly created live lock! Restore staleTarget -> lockPath immediately:
              try {
                if (fs.existsSync(lockPath)) {
                  throw Object.assign(new Error('Lock path already occupied by new lock'), {
                    code: 'EEXIST',
                  });
                }
                fs.renameSync(staleTarget, lockPath);
              } catch (restoreErr: unknown) {
                process.stderr.write(
                  `[approvals-ledger] Could not restore mis-reclaimed lock ${path.basename(
                    staleTarget
                  )}: ${extractErrnoReason(restoreErr)}\n`
                );
              }
              const afterRestoreMono = monotonicNowMs();
              if (afterRestoreMono >= deadlineMono) {
                throw new ApprovalLockTimeoutError();
              }
              sleepSyncMs(Math.min(30, Math.max(1, deadlineMono - afterRestoreMono)));
              if (monotonicNowMs() >= deadlineMono) {
                throw new ApprovalLockTimeoutError();
              }
              continue;
            }

            try {
              fs.unlinkSync(staleTarget);
            } catch {
              /* ignore cleanup error on our own stale file */
            }
            if (monotonicNowMs() >= deadlineMono) {
              throw new ApprovalLockTimeoutError();
            }
            continue;
          }

          const afterRenameMono = monotonicNowMs();
          if (afterRenameMono >= deadlineMono) {
            throw new ApprovalLockTimeoutError();
          }
          sleepSyncMs(Math.min(30, Math.max(1, deadlineMono - afterRenameMono)));
          if (monotonicNowMs() >= deadlineMono) {
            throw new ApprovalLockTimeoutError();
          }
          continue;
        }

        const beforeWaitMono = monotonicNowMs();
        if (beforeWaitMono >= deadlineMono) {
          throw new ApprovalLockTimeoutError();
        }
        sleepSyncMs(Math.min(25, Math.max(1, deadlineMono - beforeWaitMono)));
        if (monotonicNowMs() >= deadlineMono) {
          throw new ApprovalLockTimeoutError();
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

  activeLockDepth = 1;
  activeLockOwnedIno = ownedIno;
  activeLockPath = lockPath;
  try {
    return fn();
  } finally {
    activeLockDepth = 0;
    activeLockOwnedIno = null;
    activeLockPath = null;
    if (acquired) {
      try {
        const currentStat = fs.statSync(lockPath);
        if (currentStat.ino === ownedIno) {
          const relPath = `${lockPath}.rel-${process.pid}-${token}`;
          try {
            fs.renameSync(lockPath, relPath);
            fs.unlinkSync(relPath);
          } catch {
            /* ignore */
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
 * - Rejects `"type": null` or any other `type` value (F2).
 * - Uses `trimAscii` so non-ASCII characters like U+FEFF are never silently stripped (F2).
 * - Requires valid ISO `ts` in `1970–9999` (F5) and normalizes legacy Vietnamese H1 `reason` strings (F9).
 */
export function sanitizeApprovalRequestRecord(
  raw: unknown
): ApprovalRequestRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if ('type' in obj && obj.type !== undefined && obj.type !== 'request') {
    return null;
  }

  if (
    typeof obj.ts !== 'string' ||
    typeof obj.seat !== 'string' ||
    typeof obj.tool !== 'string' ||
    typeof obj.sha256 !== 'string'
  ) {
    return null;
  }

  const ts = trimAscii(obj.ts);
  if (parseStrictIsoMs(ts) === null) return null;

  const seat = trimAscii(obj.seat);
  const tool = trimAscii(obj.tool);
  const sha256 = trimAscii(obj.sha256).toLowerCase();
  if (!seat || !tool || !sha256 || !/^[0-9a-f]{16,128}$/.test(sha256)) return null;

  const host =
    typeof obj.host === 'string' && trimAscii(obj.host) ? trimAscii(obj.host) : '-';
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
 * - Requires valid ISO `at` and `expiresAt` in `1970–9999` (F5 fail-closed).
 * - If `note` key is present (including `null`), it must be a string with <= 200 Unicode code points (F2b, F6).
 * - Uses `trimAscii` on all string fields (F2).
 */
export function sanitizeApprovalDecisionRecord(
  raw: unknown
): ApprovalDecisionRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'decision') return null;

  if (
    typeof obj.requestId !== 'string' ||
    typeof obj.at !== 'string' ||
    typeof obj.expiresAt !== 'string'
  ) {
    return null;
  }

  const requestId = trimAscii(obj.requestId).toLowerCase();
  const decision = obj.decision;
  const by = obj.by;
  const at = trimAscii(obj.at);
  const expiresAt = trimAscii(obj.expiresAt);

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
    const trimmed = trimAscii(obj.note);
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
 * Strictly sanitize a claim record (F1, F2).
 */
export function sanitizeApprovalClaimRecord(
  raw: unknown
): ApprovalClaimRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
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

  const requestId = trimAscii(obj.requestId).toLowerCase();
  const claimId = trimAscii(obj.claimId);
  const seatId = typeof obj.seatId === 'string' ? trimAscii(obj.seatId) : '';
  const tool = typeof obj.tool === 'string' ? trimAscii(obj.tool) : '';
  const digest =
    typeof obj.digest === 'string' ? trimAscii(obj.digest).toLowerCase() : '';
  const at = trimAscii(obj.at);

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
 * Requires string `requestId`, `seatId`, `at`, `digest`, and `result: "executed" | "failed"` (F1a, F2, F5).
 */
export function sanitizeApprovalExecutionRecord(
  raw: unknown
): ApprovalExecutionRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
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

  const requestId = trimAscii(obj.requestId).toLowerCase();
  const seatId = trimAscii(obj.seatId);
  const at = trimAscii(obj.at);
  const result = obj.result;
  const digest = trimAscii(obj.digest).toLowerCase();

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
    typeof obj.claimId === 'string' && trimAscii(obj.claimId).length > 0
      ? trimAscii(obj.claimId)
      : undefined;
  const runId =
    typeof obj.runId === 'string' && trimAscii(obj.runId).length > 0
      ? trimAscii(obj.runId)
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
  const trimmed = trimAscii(line);
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
    if (!('type' in raw) || raw.type === 'request') {
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

const STRICT_UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

/**
 * Split raw file bytes strictly on LF (`0x0a`) (F2):
 * Bare CR (`0x0d`) is never treated as a line boundary (identical to Python `raw_bytes.split(b"\n")`).
 * Lines containing invalid UTF-8 sequences decode to `""` and are discarded per-line.
 */
function splitBufferLinesLf(buf: Buffer): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0a) {
      const slice = buf.subarray(start, i);
      start = i + 1;
      try {
        lines.push(STRICT_UTF8_DECODER.decode(slice));
      } catch {
        lines.push('');
      }
    }
  }
  return lines;
}

interface ParsedLedgerWithMeta {
  records: ApprovalLedgerRecord[];
  requestSourceFile: Map<string, string>;
}

/**
 * Read all `.jsonl` files in the approvals directory (F2, F17):
 * - If the approvals directory does not exist (`ENOENT`), returns empty ledger.
 * - Any other error listing the directory or reading ANY `.jsonl` file (`EACCES`, `EIO`, etc.)
 *   throws `ApprovalLedgerUnreadableError` immediately (fail-closed; never folds partial history) (F17).
 * - Only malformed JSON lines inside a readable file are skipped per-line.
 */
function readApprovalFilesWithMeta(): ParsedLedgerWithMeta {
  const dir = getApprovalsDir();
  let dirEntries: string[];
  try {
    dirEntries = fs.readdirSync(dir);
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'ENOENT') {
      return { records: [], requestSourceFile: new Map() };
    }
    throw new ApprovalLedgerUnreadableError(dir, extractErrnoReason(err));
  }

  const files = dirEntries.filter((f) => f.endsWith('.jsonl')).sort();

  const records: ApprovalLedgerRecord[] = [];
  const requestSourceFile = new Map<string, string>();

  for (const file of files) {
    const filePath = path.join(dir, file);
    let fileBuf: Buffer;
    try {
      fileBuf = fs.readFileSync(filePath);
    } catch (err: unknown) {
      throw new ApprovalLedgerUnreadableError(filePath, extractErrnoReason(err));
    }
    const lines = splitBufferLinesLf(fileBuf);
    for (const line of lines) {
      const parsed = parseApprovalLedgerLine(line);
      if (parsed) {
        records.push(parsed);
        if (parsed.type === 'request' && !requestSourceFile.has(parsed.requestId)) {
          requestSourceFile.set(parsed.requestId, filePath);
        }
      }
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
 * Safe atomic JSONL append (F3, F10, F14a, F18):
 * - Verifies lock inode ownership (`verifyApprovalLockOwnership`) before opening and immediately
 *   before `writeSync` so a displaced lock owner never writes a single byte (`ApprovalLockLostError`) (F14a).
 * - Opens `filePath` with `O_CREAT | O_RDWR | O_APPEND` so the OS kernel guarantees
 *   every write is appended at the true end of file (never overwriting concurrent H1 hook appends).
 * - Wraps any filesystem I/O error in `ApprovalIoError` (F18).
 */
function appendJsonlLineSafely(filePath: string, serializedJson: string): void {
  verifyApprovalLockOwnership();
  ensureApprovalsDir();
  let fd: number;
  try {
    fd = fs.openSync(
      filePath,
      fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_APPEND,
      0o644
    );
  } catch (err: unknown) {
    throw new ApprovalIoError(extractErrnoReason(err));
  }
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
    verifyApprovalLockOwnership();
    fs.writeSync(fd, buf);
    fs.fsyncSync(fd);
  } catch (err: unknown) {
    if (err instanceof ApprovalLockLostError) {
      throw err;
    }
    throw new ApprovalIoError(extractErrnoReason(err));
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
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
  verifyApprovalLockOwnership();
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
  const entries = Array.from(map.values());
  entries.sort((a, b) => {
    const aMs = parseStrictIsoMs(a.request.ts) ?? 0;
    const bMs = parseStrictIsoMs(b.request.ts) ?? 0;
    if (bMs !== aMs) return bMs - aMs;
    return b.orderIndex - a.orderIndex;
  });
  return entries.map((folded) => buildApprovalItem(folded, nowMs));
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
  const statusFilter = query.status ? trimAscii(query.status).toLowerCase() : undefined;
  const seatFilter = query.seat ? trimAscii(query.seat) : undefined;

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
  const normId = trimAscii(requestId || '').toLowerCase();
  if (!normId) return null;
  const map = foldApprovalLedger();
  const folded = map.get(normId);
  if (!folded) return null;
  return buildApprovalItem(folded, nowMs);
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
    const normId = trimAscii(params.requestId || '').toLowerCase();
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

    const providedDigest = trimAscii(
      params.digest ?? existing.request.sha256
    ).toLowerCase();

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
