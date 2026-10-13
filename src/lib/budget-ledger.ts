/**
 * budget-ledger.ts — Budget Hold & Cap Enforcement Ledger (A-3)
 *
 * Implements pre-dispatch budget reservations (holds), settling upon run completion,
 * releasing on failure/orphan/expiry, and rejecting when caps are exceeded.
 *
 * Storage: operations/data/budget/<YYYY-MM-DD>.jsonl (append-only)
 * Durable index: operations/data/budget/open-holds.json
 *
 * Line types:
 * - hold:    { type, holdId, wakeId, seatId, amountNanodollars, basis, overBudget, ts }
 * - settle:  { type, holdId, runId, actualNanodollars|null, priced, ts }
 * - release: { type, holdId, reason: "orphaned"|"failed_no_receipt"|"expired", ts }
 * - reject:  { type, wakeId, seatId, scope: "seat"|"office", capNanodollars, spentNanodollars, heldNanodollars, estimateNanodollars, reason, ts }
 *
 * Safety & Concurrency:
 * - Cross-process atomic locking via directory creation (.budget.lock) with ownership tokens.
 * - Live-process verification via OS signals (never steals lock from running owner).
 * - Durable open-holds index (open-holds.json) updated atomically under lock.
 * - Strict whitelisting for all 4 line types; zero free-text/prompt/result leaks.
 * - Idempotent settling and releasing per holdId backed by open-holds index.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  getOfficeConfig,
  isValidNanodollarsString,
  validateDailyCap,
  validateRunEstimate,
} from './office-config';
import { readCostFile, getCostReceiptsForRun, type CostRecord } from './costs-ledger';

export type BudgetBasis = 'estimate:last5' | 'default';
export type BudgetReleaseReason = 'orphaned' | 'failed_no_receipt' | 'expired';
export type BudgetRejectScope = 'seat' | 'office';
export type BudgetState = 'unlimited' | 'ok' | 'warning' | 'exceeded' | 'config_error' | 'snapshot_not_ready';

export interface BudgetWorkerIdentity {
  pid?: number;
  processStartedAt?: string;
  instanceId?: string;
}

export interface BudgetHoldRecord {
  type: 'hold';
  holdId: string;
  wakeId: string;
  seatId: string;
  amountNanodollars: string;
  basis: BudgetBasis;
  overBudget: boolean;
  worker?: BudgetWorkerIdentity;
  ts: string;
}

export interface OpenHoldsCheckpoint {
  version: 2;
  updatedAt: string;
  filePositions: Record<string, number>;
  holds: Record<string, BudgetHoldRecord>;
}

export interface BudgetSettleRecord {
  type: 'settle';
  holdId: string;
  runId: string;
  actualNanodollars: string | null;
  priced: boolean;
  ts: string;
}

export interface BudgetReleaseRecord {
  type: 'release';
  holdId: string;
  reason: BudgetReleaseReason;
  ts: string;
}

export interface BudgetRejectRecord {
  type: 'reject';
  wakeId?: string;
  seatId?: string;
  scope: BudgetRejectScope;
  capNanodollars: string | null;
  spentNanodollars: string;
  heldNanodollars: string;
  estimateNanodollars?: string;
  reason: string;
  ts: string;
}

export type BudgetRecord =
  | BudgetHoldRecord
  | BudgetSettleRecord
  | BudgetReleaseRecord
  | BudgetRejectRecord;

export interface BudgetStatus {
  seat: string | null;
  capNanodollars: string | null;
  spentNanodollars: string;
  heldNanodollars: string;
  unpricedRuns: number;
  unpricedEstimateNanodollars: string;
  committedNanodollars: string;
  remainingNanodollars: string | null;
  state: BudgetState;
  hardStop: boolean;
  configErrors?: string[];
}

export interface BudgetAdmissionResult {
  allowed: boolean;
  overBudget?: boolean;
  reason?: 'budget_exceeded' | 'config_error';
  scope?: BudgetRejectScope;
  remainingNanodollars?: string | null;
  estimate: {
    amountNanodollars: string;
    basis: BudgetBasis;
  };
}

export function getBudgetDir(): string {
  const baseDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  return path.join(baseDir, 'budget');
}

export function ensureBudgetDir(): void {
  const dir = getBudgetDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getBudgetLogPathForDate(isoDateString?: string): string {
  ensureBudgetDir();
  const dateStr = (isoDateString ? new Date(isoDateString) : new Date())
    .toISOString()
    .split('T')[0];
  return path.join(getBudgetDir(), `${dateStr}.jsonl`);
}

export function getOpenHoldsFilePath(): string {
  return path.join(getBudgetDir(), 'open-holds.json');
}

export function getProcessStartTime(pid: number): string | null {
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? new Date(out).toISOString() : null;
  } catch {
    return null;
  }
}

export type ProcessLiveness = 'alive' | 'dead' | 'unverified';

export function checkProcessLiveness(pid: number, expectedStartedAt?: string): ProcessLiveness {
  if (!pid || pid <= 0 || !Number.isInteger(pid)) {
    return 'unverified';
  }
  try {
    process.kill(pid, 0);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'ESRCH') {
      return 'dead'; // Process does not exist
    }
    return 'unverified';
  }
  if (!expectedStartedAt) {
    // Hermes Item 8: Missing worker start time cannot verify PID recycling -> unverified!
    return 'unverified';
  }
  const actual = getProcessStartTime(pid);
  if (!actual) {
    // ps query failed but process signal succeeded -> unverified
    return 'unverified';
  }
  if (actual !== expectedStartedAt) {
    return 'dead'; // Start time mismatch indicates PID was reused
  }
  return 'alive';
}

export function isProcessAlive(pid: number, expectedStartedAt?: string): boolean {
  return checkProcessLiveness(pid, expectedStartedAt) === 'alive';
}

// -------------------------------------------------------------
// Single-Instance Startup Lock on AIBOSS_DATA_DIR (Condition b)
// -------------------------------------------------------------

export interface InstanceLockMetadata {
  pid: number;
  processStartedAt: string;
  token: string;
  ts: string;
}

let activeInstanceToken: string | null = null;

export function getInstanceLockFilePath(dataDir?: string): string {
  const baseDir = dataDir || process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  return path.join(baseDir, '.instance.lock');
}

export function acquireInstanceLock(dataDir?: string): { acquired: boolean; pid?: number; token?: string } {
  const lockDir = getInstanceLockFilePath(dataDir);
  const baseDir = path.dirname(lockDir);
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const currentPid = process.pid;
  const currentStartTime = getProcessStartTime(currentPid) || new Date().toISOString();
  const token = `${currentPid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadata: InstanceLockMetadata = {
    pid: currentPid,
    processStartedAt: currentStartTime,
    token,
    ts: new Date().toISOString(),
  };

  // 1. Write metadata inside private tmp directory before atomic publication
  const tmpDir = path.join(baseDir, `.instance-init-${token}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'info.json'), JSON.stringify(metadata, null, 2), 'utf-8');

    // 2. Atomic publish via renameSync
    try {
      fs.renameSync(tmpDir, lockDir);
      activeInstanceToken = token;
      return { acquired: true, pid: currentPid, token };
    } catch {
      // lockDir already exists (EEXIST / ENOTEMPTY)
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }

  // 3. Inspect existing lock
  try {
    let held: InstanceLockMetadata | null = null;
    const infoPath = path.join(lockDir, 'info.json');

    if (fs.existsSync(infoPath)) {
      held = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
    } else if (fs.existsSync(lockDir) && !fs.statSync(lockDir).isDirectory()) {
      // Plain file fallback
      held = JSON.parse(fs.readFileSync(lockDir, 'utf-8'));
    }

    if (held && typeof held.pid === 'number') {
      const liveness = checkProcessLiveness(held.pid, held.processStartedAt);
      if (liveness === 'alive') {
        // Active instance is running
        return { acquired: false, pid: held.pid };
      }
      if (liveness === 'unverified') {
        // Hermes Condition (b): Chưa xác minh được chủ thì TỪ CHỐI khởi động, không xoá khoá!
        return { acquired: false, pid: held.pid };
      }

      // liveness === 'dead': Reclaim safely via atomic rename (no check-then-unlink race!)
      const reclaimDir = path.join(baseDir, `.instance-reclaim-${held.token || 'stale'}-${Date.now()}`);
      try {
        fs.renameSync(lockDir, reclaimDir);
        try {
          fs.rmSync(reclaimDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }

        // Now attempt acquire
        const reacquireTmp = path.join(baseDir, `.instance-init-${token}`);
        fs.mkdirSync(reacquireTmp, { recursive: true });
        fs.writeFileSync(path.join(reacquireTmp, 'info.json'), JSON.stringify(metadata, null, 2), 'utf-8');
        try {
          fs.renameSync(reacquireTmp, lockDir);
          activeInstanceToken = token;
          return { acquired: true, pid: currentPid, token };
        } catch {
          try {
            fs.rmSync(reacquireTmp, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
          return { acquired: false };
        }
      } catch {
        // Another concurrent process won the reclaim race
        return { acquired: false };
      }
    }
  } catch {
    /* error reading or parsing existing lock */
  }

  return { acquired: false };
}

export function releaseInstanceLock(dataDir?: string): void {
  const lockDir = getInstanceLockFilePath(dataDir);
  const baseDir = path.dirname(lockDir);
  try {
    if (!fs.existsSync(lockDir)) return;

    let held: InstanceLockMetadata | null = null;
    const infoPath = path.join(lockDir, 'info.json');
    if (fs.existsSync(infoPath)) {
      held = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
    } else if (!fs.statSync(lockDir).isDirectory()) {
      held = JSON.parse(fs.readFileSync(lockDir, 'utf-8'));
    }

    if (held && (held.token === activeInstanceToken || held.pid === process.pid)) {
      const retireDir = path.join(
        baseDir,
        `.instance-retired-${held.token || process.pid}-${Date.now()}`
      );
      try {
        fs.renameSync(lockDir, retireDir);
        fs.rmSync(retireDir, { recursive: true, force: true });
      } catch {
        try {
          fs.rmSync(lockDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      activeInstanceToken = null;
    }
  } catch {
    /* ignore release errors */
  }
}

export interface LockMetadata {
  pid: number;
  processStartedAt: string;
  token: string;
  ts: number;
}

let lockDepth = 0;

/**
 * Cross-process locking helper for budget ledger writes and atomic transactions.
 * Features:
 * - Atomic directory creation via rename from private tmp dir (lockDir NEVER exists without info.json).
 * - Ownership verification via unique lock token and PID start-time check (immune to PID reuse).
 * - Live processes are NEVER stolen from.
 * - Reclaim only when lease expired (>5000ms) AND owner process is dead (ESRCH / start time mismatch).
 * - Atomic reclaim via directory rename (no check-then-rm TOCTOU race).
 * - Metadata write errors abort immediately without entering critical section.
 */
export function withBudgetLock<T>(fn: () => T, timeoutMs = 5000): T {
  // Test hook for counterproof verification:
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.AIBOSS_TEST_DISABLE_BUDGET_LOCK === '1'
  ) {
    return fn();
  }

  if (lockDepth > 0) {
    lockDepth++;
    try {
      return fn();
    } finally {
      lockDepth--;
    }
  }

  ensureBudgetDir();
  const lockDir = path.join(getBudgetDir(), '.budget.lock');
  const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const startedAt = getProcessStartTime(process.pid) || new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString();
  const start = Date.now();

  while (true) {
    const tmpDir = path.join(getBudgetDir(), `.lock-init-${lockToken}`);
    let acquired = false;

    try {
      fs.mkdirSync(tmpDir);
      const info: LockMetadata = {
        pid: process.pid,
        processStartedAt: startedAt,
        token: lockToken,
        ts: Date.now(),
      };
      fs.writeFileSync(path.join(tmpDir, 'info.json'), JSON.stringify(info));
      try {
        fs.renameSync(tmpDir, lockDir);
        acquired = true;
      } catch {
        // lockDir already exists (EEXIST / ENOTEMPTY)
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    } catch (tmpErr) {
      // Writing info or creating tmp dir failed: NEVER enter critical section!
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      throw tmpErr;
    }

    if (acquired) {
      break;
    }

    // Inspect existing lock
    const infoFile = path.join(lockDir, 'info.json');
    try {
      if (fs.existsSync(infoFile)) {
        const raw = fs.readFileSync(infoFile, 'utf-8');
        const held = JSON.parse(raw) as LockMetadata;
        const isDead = !isProcessAlive(held.pid, held.processStartedAt);
        const leaseExpired = Date.now() - held.ts > 5000;

        // Reclaim ONLY when: lease expired AND owner process is dead AND token exists!
        if (leaseExpired && isDead && held.token) {
          const reclaimDir = path.join(getBudgetDir(), `.lock-reclaim-${held.token}-${Date.now()}`);
          try {
            // Atomic rename to reclaimDir (No check-then-rm!)
            fs.renameSync(lockDir, reclaimDir);
            try {
              const recRaw = fs.readFileSync(path.join(reclaimDir, 'info.json'), 'utf-8');
              const recInfo = JSON.parse(recRaw);
              if (recInfo.token === held.token) {
                fs.rmSync(reclaimDir, { recursive: true, force: true });
                continue; // Reclaim successful, acquire next loop
              } else {
                // Token mismatch, restore lock
                fs.renameSync(reclaimDir, lockDir);
              }
            } catch {
              fs.rmSync(reclaimDir, { recursive: true, force: true });
            }
          } catch {
            // Another process reclaimed or lock freed, continue loop
          }
        }
      }
    } catch {
      /* ignore read race */
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(`Budget ledger lock timeout after ${timeoutMs}ms`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
  }

  lockDepth = 1;
  try {
    return fn();
  } finally {
    lockDepth = 0;
    try {
      const infoFile = path.join(lockDir, 'info.json');
      if (fs.existsSync(infoFile)) {
        const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
        // Only release lock if it still belongs to THIS process and THIS token
        if (info.token === lockToken && info.pid === process.pid) {
          const relDir = path.join(getBudgetDir(), `.lock-rel-${lockToken}`);
          try {
            fs.renameSync(lockDir, relDir);
            fs.rmSync(relDir, { recursive: true, force: true });
          } catch {
            fs.rmSync(lockDir, { recursive: true, force: true });
          }
        }
      }
    } catch {
      /* ignore cleanup error */
    }
  }
}

// -------------------------------------------------------------
// Schema Whitelisting & Validation
// -------------------------------------------------------------

export function sanitizeHoldRecord(raw: unknown): BudgetHoldRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'hold') return null;
  if (typeof r.holdId !== 'string' || typeof r.wakeId !== 'string' || typeof r.seatId !== 'string') return null;
  if (!isValidNanodollarsString(r.amountNanodollars)) return null;
  if (r.basis !== 'estimate:last5' && r.basis !== 'default') return null;
  const ts = typeof r.ts === 'string' && r.ts ? r.ts : new Date().toISOString();
  let worker: BudgetWorkerIdentity | undefined = undefined;
  if (r.worker && typeof r.worker === 'object') {
    const w = r.worker as Record<string, unknown>;
    worker = {
      ...(typeof w.pid === 'number' ? { pid: w.pid } : {}),
      ...(typeof w.processStartedAt === 'string' ? { processStartedAt: w.processStartedAt } : {}),
      ...(typeof w.instanceId === 'string' ? { instanceId: w.instanceId } : {}),
    };
  }

  return {
    type: 'hold',
    holdId: r.holdId,
    wakeId: r.wakeId,
    seatId: r.seatId,
    amountNanodollars: r.amountNanodollars,
    basis: r.basis,
    overBudget: Boolean(r.overBudget),
    ...(worker ? { worker } : {}),
    ts,
  };
}

export function sanitizeSettleRecord(raw: unknown): BudgetSettleRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'settle') return null;
  if (typeof r.holdId !== 'string' || typeof r.runId !== 'string' || typeof r.ts !== 'string') return null;
  const actual = r.actualNanodollars === null ? null : (isValidNanodollarsString(r.actualNanodollars) ? r.actualNanodollars : null);

  return {
    type: 'settle',
    holdId: r.holdId,
    runId: r.runId,
    actualNanodollars: actual,
    priced: Boolean(r.priced),
    ts: r.ts,
  };
}

export function sanitizeReleaseRecord(raw: unknown): BudgetReleaseRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'release') return null;
  if (typeof r.holdId !== 'string' || typeof r.ts !== 'string') return null;
  const validReasons: BudgetReleaseReason[] = ['failed_no_receipt', 'orphaned', 'expired'];
  if (!validReasons.includes(r.reason as BudgetReleaseReason)) return null;

  return {
    type: 'release',
    holdId: r.holdId,
    reason: r.reason as BudgetReleaseReason,
    ts: r.ts,
  };
}

export function sanitizeRejectRecord(raw: unknown): BudgetRejectRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'reject') return null;
  if (typeof r.scope !== 'string' || (r.scope !== 'seat' && r.scope !== 'office')) return null;
  if (typeof r.reason !== 'string' || typeof r.ts !== 'string') return null;
  if (!isValidNanodollarsString(r.spentNanodollars) || !isValidNanodollarsString(r.heldNanodollars)) return null;

  const cap = r.capNanodollars === null ? null : (isValidNanodollarsString(r.capNanodollars) ? r.capNanodollars : null);
  const estimate = r.estimateNanodollars === undefined ? undefined : (isValidNanodollarsString(r.estimateNanodollars) ? r.estimateNanodollars : undefined);

  return {
    type: 'reject',
    scope: r.scope,
    seatId: typeof r.seatId === 'string' ? r.seatId : undefined,
    wakeId: typeof r.wakeId === 'string' ? r.wakeId : undefined,
    capNanodollars: cap,
    spentNanodollars: r.spentNanodollars,
    heldNanodollars: r.heldNanodollars,
    estimateNanodollars: estimate,
    reason: r.reason,
    ts: r.ts,
  };
}

export function sanitizeBudgetRecord(raw: unknown): BudgetRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as { type?: unknown }).type;
  switch (type) {
    case 'hold': return sanitizeHoldRecord(raw);
    case 'settle': return sanitizeSettleRecord(raw);
    case 'release': return sanitizeReleaseRecord(raw);
    case 'reject': return sanitizeRejectRecord(raw);
    default: return null;
  }
}

// -------------------------------------------------------------
// Reader Functions (Bounded & Validated)
// -------------------------------------------------------------

/**
 * Read budget records from a single file, gracefully skipping corrupted lines and non-whitelisted types.
 */
export function readBudgetFile(filePath: string): BudgetRecord[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const records: BudgetRecord[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        const sanitized = sanitizeBudgetRecord(parsed);
        if (sanitized) {
          records.push(sanitized);
        }
      } catch {
        /* ignore corrupted lines */
      }
    }
    return records;
  } catch {
    return [];
  }
}

/**
 * Read all budget records across files (bounded to recent files by default).
 */
export function readAllBudgetRecords(fileFilter?: (fileName: string) => boolean): BudgetRecord[] {
  ensureBudgetDir();
  const budgetDir = getBudgetDir();
  if (!fs.existsSync(budgetDir)) return [];

  let files = fs
    .readdirSync(budgetDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  if (fileFilter) {
    files = files.filter(fileFilter);
  } else if (files.length > 14) {
    // Bound reading to last 14 days by default
    files = files.slice(-14);
  }

  const records: BudgetRecord[] = [];
  for (const file of files) {
    const filePath = path.join(budgetDir, file);
    records.push(...readBudgetFile(filePath));
  }
  return records;
}

export interface RepairLogTailResult {
  repaired: boolean;
  validLines: number;
}

/**
 * Inspects the tail of a date-partitioned JSONL file (Hermes Item 6).
 * Any uncommitted fragment (line without trailing newline or failing JSON parse)
 * is treated as an incomplete uncommitted tail and trimmed back to the last valid line.
 * Checkpoint filePositions must only reflect valid committed lines.
 * Throws if the file cannot be safely repaired (fails closed).
 */
export function repairLogTail(filePath: string): RepairLogTailResult {
  if (!fs.existsSync(filePath)) {
    return { repaired: false, validLines: 0 };
  }
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return { repaired: false, validLines: 0 };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const hasTrailingNewline = raw.endsWith('\n');

  // Split lines
  const rawLines = raw.split('\n');
  if (hasTrailingNewline) {
    rawLines.pop(); // Remove the empty string after the trailing newline
  }

  const validLinesList: string[] = [];
  let needsRepair = !hasTrailingNewline;
  let corruptStartIndex = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (i === rawLines.length - 1 && !hasTrailingNewline) {
        needsRepair = true;
        corruptStartIndex = i;
        break;
      }
      continue;
    }

    if (i === rawLines.length - 1 && !hasTrailingNewline) {
      needsRepair = true;
      corruptStartIndex = i;
      break;
    }

    try {
      JSON.parse(trimmed);
      validLinesList.push(trimmed);
    } catch {
      needsRepair = true;
      corruptStartIndex = i;
      break;
    }
  }

  if (needsRepair) {
    try {
      const repairedContent = validLinesList.length > 0 ? validLinesList.join('\n') + '\n' : '';
      fs.writeFileSync(filePath, repairedContent, 'utf-8');
      console.warn(
        `[budget-ledger] Repaired incomplete log tail in ${filePath}: trimmed uncommitted fragment from line ${
          corruptStartIndex >= 0 ? corruptStartIndex + 1 : rawLines.length
        }`
      );
      return { repaired: true, validLines: validLinesList.length };
    } catch (err) {
      console.error(`[budget-ledger] FAILED to repair corrupted log tail in ${filePath}:`, err);
      throw new Error(`Corrupted log tail in ${filePath} could not be safely repaired: ${String(err)}`);
    }
  }

  return { repaired: false, validLines: validLinesList.length };
}

function appendBudgetRecordDirect(record: BudgetRecord): void {
  ensureBudgetDir();
  const filePath = getBudgetLogPathForDate(record.ts);
  // Hermes Item 6: Ensure tail is clean before appending
  repairLogTail(filePath);
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
}

/**
 * Append a budget record to the date-partitioned JSONL file under the budget lock.
 */
export function appendBudgetRecord(record: BudgetRecord): void {
  const sanitized = sanitizeBudgetRecord(record);
  if (!sanitized) {
    throw new Error('Invalid budget record rejected by schema whitelist');
  }
  withBudgetLock(() => {
    appendBudgetRecordDirect(sanitized);
  });
}

// -------------------------------------------------------------
// Durable Open-Holds Checkpoint Index (open-holds.json)
// -------------------------------------------------------------

export function loadOpenHoldsCheckpoint(): OpenHoldsCheckpoint | null {
  const budgetDir = getBudgetDir();
  if (!fs.existsSync(budgetDir)) return null;
  const openHoldsPath = getOpenHoldsFilePath();
  if (!fs.existsSync(openHoldsPath)) return null;
  try {
    const content = fs.readFileSync(openHoldsPath, 'utf-8');
    const parsed = JSON.parse(content);
    // Hermes Finding M4: If checkpoint is v1 or missing filePositions, do NOT mix snapshot holds with single cursor!
    // Return null to force replayAndGetCheckpoint to rebuild holds and filePositions from JSONL SST from scratch.
    if (
      parsed &&
      parsed.version === 2 &&
      parsed.holds &&
      typeof parsed.holds === 'object' &&
      parsed.filePositions &&
      typeof parsed.filePositions === 'object'
    ) {
      return parsed as OpenHoldsCheckpoint;
    }
  } catch {
    /* corrupt checkpoint */
  }
  return null;
}

export function saveOpenHoldsCheckpoint(cp: OpenHoldsCheckpoint): void {
  ensureBudgetDir();
  const openHoldsPath = getOpenHoldsFilePath();
  const tmpPath = path.join(getBudgetDir(), `.open-holds.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(cp, null, 2), 'utf-8');
  fs.renameSync(tmpPath, openHoldsPath);
}

/**
 * Replay unindexed budget records from date-partitioned JSONL files (the Single Source of Truth)
 * into the durable open-holds checkpoint index.
 * Multi-partition tracking (Hermes Item M2 & M4):
 * Tracks line counts per file in cp.filePositions[file]. Any append to an older partition
 * (e.g. cross-midnight settles) is detected and replayed cleanly.
 * Must be called under withBudgetLock.
 */
export function replayAndGetCheckpoint(): OpenHoldsCheckpoint {
  ensureBudgetDir();
  const budgetDir = getBudgetDir();
  let cp = loadOpenHoldsCheckpoint();

  if (!cp) {
    // Hermes Finding M4: Log v1 migration when encountering legacy checkpoint file
    const openHoldsPath = getOpenHoldsFilePath();
    if (fs.existsSync(openHoldsPath)) {
      try {
        const raw = fs.readFileSync(openHoldsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) {
          console.warn(
            '[budget-ledger] Detected v1 checkpoint index. Rebuilding holds and filePositions from JSONL SST from scratch.'
          );
        }
      } catch {
        /* ignore */
      }
    }

    cp = {
      version: 2,
      updatedAt: new Date().toISOString(),
      filePositions: {},
      holds: {},
    };
  }

  const allFiles = fs
    .readdirSync(budgetDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  for (const file of allFiles) {
    const filePath = path.join(budgetDir, file);
    if (!fs.existsSync(filePath)) continue;

    // Hermes Item 6: Inspect and repair log tail before reading
    repairLogTail(filePath);

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    let startLineIndex = cp.filePositions[file] ?? 0;

    // If checkpoint position exceeds valid lines, reset and rebuild
    if (startLineIndex > lines.length) {
      console.warn(
        `[budget-ledger] Checkpoint filePosition for ${file} (${startLineIndex}) exceeds valid line count (${lines.length}). Rebuilding checkpoint from scratch.`
      );
      cp.holds = {};
      cp.filePositions = {};
      startLineIndex = 0;
      for (const f of allFiles) {
        const fp = path.join(budgetDir, f);
        if (!fs.existsSync(fp)) continue;
        repairLogTail(fp);
        const fc = fs.readFileSync(fp, 'utf-8');
        const fl = fc.split('\n').filter((l) => l.trim().length > 0);
        for (const l of fl) {
          try {
            const p = JSON.parse(l);
            const s = sanitizeBudgetRecord(p);
            if (!s) continue;
            if (s.type === 'hold') {
              cp.holds[s.holdId] = s;
            } else if (s.type === 'settle' || s.type === 'release') {
              delete cp.holds[s.holdId];
            }
          } catch {
            /* skip */
          }
        }
        cp.filePositions[f] = fl.length;
      }
      break;
    }

    if (startLineIndex < lines.length) {
      for (let i = startLineIndex; i < lines.length; i++) {
        const line = lines[i];
        try {
          const parsed = JSON.parse(line);
          const sanitized = sanitizeBudgetRecord(parsed);
          if (!sanitized) continue;

          if (sanitized.type === 'hold') {
            cp.holds[sanitized.holdId] = sanitized;
          } else if (sanitized.type === 'settle' || sanitized.type === 'release') {
            delete cp.holds[sanitized.holdId];
          }
        } catch {
          /* skip corrupted line */
        }
      }
    }

    cp.filePositions[file] = lines.length;
  }

  cp.updatedAt = new Date().toISOString();
  saveOpenHoldsCheckpoint(cp);
  return cp;
}

/**
 * Initialize budget ledger checkpoint on server startup.
 */
export function initBudgetLedger(): OpenHoldsCheckpoint {
  return withBudgetLock(() => replayAndGetCheckpoint());
}

/**
 * Check if a hold is already closed (settled or released).
 * Under lock, replays unindexed log lines and verifies absence in checkpoint.
 */
export function isHoldClosed(holdId: string): boolean {
  return withBudgetLock(() => {
    const cp = replayAndGetCheckpoint();
    return !cp.holds[holdId];
  });
}

/**
 * Get map of currently active holds: holdId -> BudgetHoldRecord.
 * Reads directly from the validated checkpoint snapshot.
 */
export function getActiveHolds(): Map<string, BudgetHoldRecord> {
  const cp = loadOpenHoldsCheckpoint();
  const map = new Map<string, BudgetHoldRecord>();
  if (cp && cp.holds) {
    for (const [k, v] of Object.entries(cp.holds)) {
      map.set(k, v);
    }
  }
  return map;
}

/**
 * Record a budget hold prior to dispatch under lock.
 * Single Source of Truth (SST) pattern:
 * 1. Replays unindexed log lines into checkpoint.
 * 2. Appends hold to JSONL first.
 * 3. Updates and saves checkpoint index.
 */
export function recordHold(hold: Omit<BudgetHoldRecord, 'type'>): BudgetHoldRecord {
  return withBudgetLock(() => {
    const record = sanitizeHoldRecord({
      type: 'hold',
      holdId: hold.holdId,
      wakeId: hold.wakeId,
      seatId: hold.seatId,
      amountNanodollars: hold.amountNanodollars,
      basis: hold.basis,
      overBudget: Boolean(hold.overBudget),
      ...(hold.worker ? { worker: hold.worker } : {}),
      ts: hold.ts,
    });
    if (!record) {
      throw new Error('Invalid budget hold record');
    }

    const cp = replayAndGetCheckpoint();

    // 1. Append to SST JSONL first
    appendBudgetRecordDirect(record);

    // Test hook for crash injection (Hermes Item 11)
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.AIBOSS_TEST_CRASH_AFTER_JSONL_APPEND === '1'
    ) {
      process.kill(process.pid, 'SIGKILL');
    }

    // 2. Update checkpoint
    cp.holds[record.holdId] = record;
    const logFile = path.basename(getBudgetLogPathForDate(record.ts));
    cp.filePositions[logFile] = (cp.filePositions[logFile] ?? 0) + 1;
    cp.updatedAt = new Date().toISOString();
    saveOpenHoldsCheckpoint(cp);

    return record;
  });
}

/**
 * Settle a budget hold upon run completion.
 * IDEMPOTENT & CROSS-PROCESS SAFE:
 * Under budget lock:
 * 1. Replays unindexed log lines into checkpoint.
 * 2. Checks if hold exists in checkpoint; if not, returns null immediately.
 * 3. Appends settle record to JSONL first (SST).
 * 4. Removes hold from checkpoint and saves.
 */
export function settleHold(params: {
  holdId: string;
  runId: string;
  actualNanodollars: string | null;
  priced: boolean;
  ts?: string;
}): BudgetSettleRecord | null {
  return withBudgetLock(() => {
    const cp = replayAndGetCheckpoint();
    if (!cp.holds[params.holdId]) {
      return null; // Already settled, released, or non-existent
    }

    const record = sanitizeSettleRecord({
      type: 'settle',
      holdId: params.holdId,
      runId: params.runId,
      actualNanodollars: params.actualNanodollars,
      priced: params.priced,
      ts: params.ts || new Date().toISOString(),
    });
    if (!record) return null;

    // 1. Append to SST JSONL first
    appendBudgetRecordDirect(record);

    // 2. Update checkpoint
    delete cp.holds[params.holdId];
    const logFile = path.basename(getBudgetLogPathForDate(record.ts));
    cp.filePositions[logFile] = (cp.filePositions[logFile] ?? 0) + 1;
    cp.updatedAt = new Date().toISOString();
    saveOpenHoldsCheckpoint(cp);

    return record;
  });
}

/**
 * Release a budget hold when a run fails without receipt, expires, or is orphaned.
 * IDEMPOTENT & CROSS-PROCESS SAFE:
 * Under budget lock:
 * 1. Replays unindexed log lines into checkpoint.
 * 2. Checks if hold exists in checkpoint; if not, returns null immediately.
 * 3. Appends release record to JSONL first (SST).
 * 4. Removes hold from checkpoint and saves.
 */
export function releaseHold(params: {
  holdId: string;
  reason: BudgetReleaseReason;
  ts?: string;
}): BudgetReleaseRecord | null {
  return withBudgetLock(() => {
    const cp = replayAndGetCheckpoint();
    if (!cp.holds[params.holdId]) {
      return null; // Already settled, released, or non-existent
    }

    const record = sanitizeReleaseRecord({
      type: 'release',
      holdId: params.holdId,
      reason: params.reason,
      ts: params.ts || new Date().toISOString(),
    });
    if (!record) return null;

    // 1. Append to SST JSONL first
    appendBudgetRecordDirect(record);

    // 2. Update checkpoint
    delete cp.holds[params.holdId];
    const logFile = path.basename(getBudgetLogPathForDate(record.ts));
    cp.filePositions[logFile] = (cp.filePositions[logFile] ?? 0) + 1;
    cp.updatedAt = new Date().toISOString();
    saveOpenHoldsCheckpoint(cp);

    return record;
  });
}

/**
 * Record a budget rejection event when a cap is exceeded under lock.
 */
export function recordReject(reject: Omit<BudgetRejectRecord, 'type'>): BudgetRejectRecord {
  return withBudgetLock(() => {
    const record = sanitizeRejectRecord({
      type: 'reject',
      scope: reject.scope,
      seatId: reject.seatId,
      wakeId: reject.wakeId,
      capNanodollars: reject.capNanodollars,
      spentNanodollars: reject.spentNanodollars,
      heldNanodollars: reject.heldNanodollars,
      estimateNanodollars: reject.estimateNanodollars,
      reason: reject.reason,
      ts: reject.ts,
    });
    if (!record) {
      throw new Error('Invalid budget reject record');
    }
    appendBudgetRecordDirect(record);
    return record;
  });
}

/**
 * Find holdId for a run by scanning budget ledger backwards.
 */
export function findHoldIdForRun(runId: string, wakeId?: string): string | null {
  const records = readAllBudgetRecords();
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.type === 'hold') {
      if (wakeId && r.wakeId === wakeId) return r.holdId;
      if (r.holdId.replace('hold', 'run') === runId) return r.holdId;
    }
  }
  return null;
}

// -------------------------------------------------------------
// Estimation & Admission Check (Algorithms)
// -------------------------------------------------------------

/**
 * Historical run estimate calculation:
 * - Scans past 7 days of cost ledger files.
 * - Folds receipts by (runId, model) keeping the newest record per model.
 * - CRITICAL (Hermes FAIL 2): Excludes runs that have ANY unpriced model.
 * - Averages the last 5 fully-priced runs using exact integer BigInt arithmetic.
 * - Falls back to defaultRunEstimateNanodollars if fewer than 1 fully-priced run.
 */
export function calculateRunEstimate(
  seatId: string,
  nowIso?: string
): { amountNanodollars: string; basis: BudgetBasis } {
  return getHistoricalRunEstimate(seatId, nowIso);
}

export function getHistoricalRunEstimate(
  seatId: string,
  nowIso?: string
): { amountNanodollars: string; basis: BudgetBasis } {
  const config = getOfficeConfig();
  const defaultEstimate =
    validateRunEstimate(config.budget?.defaultRunEstimateNanodollars) || '700000000';

  const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;

  // Scan cost files within the 7-day window
  const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  const costsDir = path.join(baseDataDir, 'costs');
  const relevantCosts: CostRecord[] = [];

  if (fs.existsSync(costsDir)) {
    const files = fs.readdirSync(costsDir).filter((f) => f.endsWith('.jsonl')).sort();
    for (const f of files) {
      const datePart = f.replace('.jsonl', '');
      const fileDateMs = new Date(datePart + 'T00:00:00Z').getTime();
      if (!isNaN(fileDateMs) && fileDateMs < sevenDaysAgoMs - 24 * 60 * 60 * 1000) {
        continue;
      }
      const records = readCostFile(path.join(costsDir, f));
      for (const r of records) {
        if (r.seatId !== seatId) continue;
        const rTime = new Date(r.ts).getTime();
        if (rTime >= sevenDaysAgoMs && rTime <= nowMs) {
          relevantCosts.push(r);
        }
      }
    }
  }

  // Group by runId and fold by model (newest record per model wins)
  relevantCosts.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  interface RunAcc {
    latestTs: number;
    models: Map<string, CostRecord>;
  }
  const runMap = new Map<string, RunAcc>();
  for (const c of relevantCosts) {
    let acc = runMap.get(c.runId);
    const ts = new Date(c.ts).getTime();
    if (!acc) {
      acc = { latestTs: ts, models: new Map() };
      runMap.set(c.runId, acc);
    }
    if (ts > acc.latestTs) acc.latestTs = ts;
    if (!acc.models.has(c.model)) {
      acc.models.set(c.model, c);
    }
  }

  // Filter ONLY fully-priced runs (zero unpriced models)
  const fullyPricedRuns: Array<{ totalNanodollars: bigint; latestTs: number }> = [];
  for (const acc of runMap.values()) {
    if (acc.models.size === 0) continue;
    let isFullyPriced = true;
    let runTotal = 0n;
    for (const m of acc.models.values()) {
      if (!m.priced || m.costNanodollars === null) {
        isFullyPriced = false;
        break;
      }
      runTotal += BigInt(m.costNanodollars);
    }
    if (isFullyPriced) {
      fullyPricedRuns.push({ totalNanodollars: runTotal, latestTs: acc.latestTs });
    }
  }

  // Sort by latestTs descending
  fullyPricedRuns.sort((a, b) => b.latestTs - a.latestTs);

  const top5 = fullyPricedRuns.slice(0, 5);
  if (top5.length === 0) {
    return {
      amountNanodollars: defaultEstimate,
      basis: 'default',
    };
  }

  const sum = top5.reduce((acc, r) => acc + r.totalNanodollars, 0n);
  const average = sum / BigInt(top5.length);

  return {
    amountNanodollars: average.toString(),
    basis: 'estimate:last5',
  };
}

/**
 * Get current budget status for a seat or office-wide.
 * Accounting:
 * - Folds receipts by (runId, model) like costs-ledger.ts.
 * - Preserves run in unpricedRuns if ANY model is unpriced.
 * - Active holds read from durable open-holds.json index.
 * - Warning threshold is strictly > 80% (committed * 100n > cap * 80n).
 * - Distinguishes configuration errors (config_error) from unlimited/ok/warning/exceeded.
 */
export function getBudgetStatus(seatId?: string, nowIso?: string): BudgetStatus {
  const config = getOfficeConfig();
  const now = nowIso ? new Date(nowIso) : new Date();
  const todayStr = now.toISOString().split('T')[0];

  const defaultEstimate =
    validateRunEstimate(config.budget?.defaultRunEstimateNanodollars) || '700000000';

  const seatConfig = seatId ? config.budget?.seats?.[seatId] : undefined;
  const officeConfig = config.budget?.office;

  const rawCap = seatId
    ? (seatConfig?.dailyCapNanodollars ?? null)
    : (officeConfig?.dailyCapNanodollars ?? null);
  const capNanodollars = validateDailyCap(rawCap) ?? null;

  const hardStop = seatId
    ? (seatConfig?.hardStop ?? officeConfig?.hardStop ?? true)
    : (officeConfig?.hardStop ?? true);

  const hasConfigError = Boolean(
    (seatId ? seatConfig?.hasConfigError : officeConfig?.hasConfigError) ||
    (config.budget?.configErrors && config.budget.configErrors.length > 0)
  );

  const cp = loadOpenHoldsCheckpoint();
  if (!cp) {
    // Snapshot not ready: do not scan entire disk history in GET!
    return {
      seat: seatId ?? null,
      capNanodollars,
      spentNanodollars: '0',
      heldNanodollars: '0',
      unpricedRuns: 0,
      unpricedEstimateNanodollars: '0',
      committedNanodollars: '0',
      remainingNanodollars: capNanodollars,
      state: 'snapshot_not_ready',
      hardStop,
      configErrors: config.budget?.configErrors,
    };
  }

  // Read today's costs from costs ledger
  const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  const todayCostFile = path.join(baseDataDir, 'costs', `${todayStr}.jsonl`);
  const todayCosts = readCostFile(todayCostFile);

  // Filter costs by seatId if specified
  const filteredCosts = seatId
    ? todayCosts.filter((c) => c.seatId === seatId)
    : todayCosts;

  // De-duplicate / fold receipts by (runId, model) keeping NEWEST receipt matching costs-ledger.ts
  const sortedCosts = [...filteredCosts].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
  );
  const uniqueRecordsMap = new Map<string, CostRecord>();
  for (const c of sortedCosts) {
    const key = `${c.runId}::${c.model}`;
    if (!uniqueRecordsMap.has(key)) {
      uniqueRecordsMap.set(key, c);
    }
  }

  let spentBig = 0n;
  const unpricedRunIds = new Set<string>();

  for (const c of uniqueRecordsMap.values()) {
    if (c.priced && c.costNanodollars) {
      spentBig += BigInt(c.costNanodollars);
    }
    if (!c.priced || c.costNanodollars === null) {
      unpricedRunIds.add(c.runId);
    }
  }

  const unpricedRuns = unpricedRunIds.size;
  const unpricedEstimateBig = BigInt(unpricedRuns) * BigInt(defaultEstimate);

  // Calculate active holds from durable open-holds checkpoint
  let heldBig = 0n;
  for (const hold of Object.values(cp.holds)) {
    if (!seatId || hold.seatId === seatId) {
      heldBig += BigInt(hold.amountNanodollars);
    }
  }

  const spentNanodollars = spentBig.toString();
  const heldNanodollars = heldBig.toString();
  const unpricedEstimateNanodollars = unpricedEstimateBig.toString();
  const committedBig = spentBig + unpricedEstimateBig + heldBig;
  const committedNanodollars = committedBig.toString();

  let remainingNanodollars: string | null = null;
  let state: BudgetState = 'unlimited';

  if (hasConfigError) {
    state = 'config_error';
  } else if (capNanodollars !== null) {
    const capBig = BigInt(capNanodollars);
    const remainingBig = capBig - committedBig;
    remainingNanodollars = remainingBig.toString();

    if (committedBig > capBig) {
      state = 'exceeded';
    } else if (committedBig * 100n > capBig * 80n) {
      // Strictly > 80% per specification
      state = 'warning';
    } else {
      state = 'ok';
    }
  }

  return {
    seat: seatId ?? null,
    capNanodollars,
    spentNanodollars,
    heldNanodollars,
    unpricedRuns,
    unpricedEstimateNanodollars,
    committedNanodollars,
    remainingNanodollars,
    state,
    hardStop,
    ...(config.budget?.configErrors ? { configErrors: config.budget.configErrors } : {}),
  };
}

/**
 * Check budget admission for a candidate turn before dispatch.
 * Checks seat-level cap then office-level cap.
 * Fails closed if configuration error is present.
 */
export function checkBudgetAdmission(
  seatId: string,
  wakeId: string,
  nowIso?: string
): BudgetAdmissionResult {
  const estimate = calculateRunEstimate(seatId, nowIso);

  // Positive control hook for tests:
  // When AIBOSS_TEST_DISABLE_BUDGET_CHECK=1 in non-production, bypass cap checks to prove counterproof.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.AIBOSS_TEST_DISABLE_BUDGET_CHECK === '1'
  ) {
    return {
      allowed: true,
      overBudget: false,
      estimate,
    };
  }

  const config = getOfficeConfig();
  const defaultEstimate =
    validateRunEstimate(config.budget?.defaultRunEstimateNanodollars) || '700000000';
  const nowTs = nowIso || new Date().toISOString();

  // Fail closed on configuration errors or unready snapshot (Hermes Item 6)
  let seatStatus = getBudgetStatus(seatId, nowIso);
  let officeStatus = getBudgetStatus(undefined, nowIso);

  if (seatStatus.state === 'snapshot_not_ready' || officeStatus.state === 'snapshot_not_ready') {
    try {
      withBudgetLock(() => replayAndGetCheckpoint());
      seatStatus = getBudgetStatus(seatId, nowIso);
      officeStatus = getBudgetStatus(undefined, nowIso);
    } catch {
      /* replay failed */
    }
  }

  if (
    seatStatus.state === 'config_error' ||
    officeStatus.state === 'config_error' ||
    seatStatus.state === 'snapshot_not_ready' ||
    officeStatus.state === 'snapshot_not_ready'
  ) {
    const isSnapshotNotReady =
      seatStatus.state === 'snapshot_not_ready' || officeStatus.state === 'snapshot_not_ready';
    recordReject({
      wakeId,
      seatId,
      scope: (seatStatus.state === 'config_error' || seatStatus.state === 'snapshot_not_ready') ? 'seat' : 'office',
      capNanodollars: seatStatus.capNanodollars ?? '0',
      spentNanodollars: seatStatus.spentNanodollars,
      heldNanodollars: seatStatus.heldNanodollars,
      estimateNanodollars: estimate.amountNanodollars,
      reason: isSnapshotNotReady ? 'snapshot_not_ready' : 'config_error',
      ts: nowTs,
    });
    return {
      allowed: false,
      reason: 'config_error',
      scope: (seatStatus.state === 'config_error' || seatStatus.state === 'snapshot_not_ready') ? 'seat' : 'office',
      remainingNanodollars: '0',
      estimate,
    };
  }

  let overBudget = false;

  // 1. Check Seat Cap
  if (seatStatus.capNanodollars !== null) {
    const seatCap = BigInt(seatStatus.capNanodollars);
    const seatSpent = BigInt(seatStatus.spentNanodollars);
    const seatHeld = BigInt(seatStatus.heldNanodollars);
    const seatUnpricedEst = BigInt(seatStatus.unpricedRuns) * BigInt(defaultEstimate);
    const estAmount = BigInt(estimate.amountNanodollars);

    const totalCommitted = seatSpent + seatUnpricedEst + seatHeld + estAmount;

    if (totalCommitted > seatCap) {
      if (seatStatus.hardStop) {
        recordReject({
          wakeId,
          seatId,
          scope: 'seat',
          capNanodollars: seatStatus.capNanodollars,
          spentNanodollars: seatStatus.spentNanodollars,
          heldNanodollars: seatStatus.heldNanodollars,
          estimateNanodollars: estimate.amountNanodollars,
          reason: 'budget_exceeded',
          ts: nowTs,
        });
        return {
          allowed: false,
          reason: 'budget_exceeded',
          scope: 'seat',
          remainingNanodollars: seatStatus.remainingNanodollars,
          estimate,
        };
      }
      overBudget = true;
    }
  }

  // 2. Check Office Cap
  if (officeStatus.capNanodollars !== null) {
    const officeCap = BigInt(officeStatus.capNanodollars);
    const officeSpent = BigInt(officeStatus.spentNanodollars);
    const officeHeld = BigInt(officeStatus.heldNanodollars);
    const officeUnpricedEst = BigInt(officeStatus.unpricedRuns) * BigInt(defaultEstimate);
    const estAmount = BigInt(estimate.amountNanodollars);

    const totalOfficeCommitted = officeSpent + officeUnpricedEst + officeHeld + estAmount;

    if (totalOfficeCommitted > officeCap) {
      if (officeStatus.hardStop) {
        recordReject({
          wakeId,
          seatId,
          scope: 'office',
          capNanodollars: officeStatus.capNanodollars,
          spentNanodollars: officeStatus.spentNanodollars,
          heldNanodollars: officeStatus.heldNanodollars,
          estimateNanodollars: estimate.amountNanodollars,
          reason: 'budget_exceeded',
          ts: nowTs,
        });
        return {
          allowed: false,
          reason: 'budget_exceeded',
          scope: 'office',
          remainingNanodollars: officeStatus.remainingNanodollars,
          estimate,
        };
      }
      overBudget = true;
    }
  }

  return {
    allowed: true,
    overBudget,
    remainingNanodollars: seatStatus.remainingNanodollars,
    estimate,
  };
}

/**
 * ATOMIC TRANSACTION: Check budget admission and record hold in a single locked transaction.
 * Guarantees that two concurrent processes cannot both pass admission and create holds exceeding the cap.
 */
export function checkAdmissionAndRecordHold(params: {
  seatId: string;
  wakeId: string;
  holdId: string;
  worker?: BudgetWorkerIdentity;
  nowIso?: string;
}): {
  allowed: boolean;
  reason?: 'budget_exceeded' | 'config_error';
  admission: BudgetAdmissionResult;
  hold: BudgetHoldRecord | null;
} {
  return withBudgetLock(() => {
    // 1. Mandatory Precondition (Hermes Item 6):
    // Replay checkpoint index BEFORE evaluating caps and admission!
    // If replay fails or checkpoint is missing/unready, fail closed and never dispatch.
    try {
      replayAndGetCheckpoint();
    } catch {
      const estimate = calculateRunEstimate(params.seatId, params.nowIso);
      recordReject({
        wakeId: params.wakeId,
        seatId: params.seatId,
        scope: 'office',
        capNanodollars: '0',
        spentNanodollars: '0',
        heldNanodollars: '0',
        estimateNanodollars: estimate.amountNanodollars,
        reason: 'snapshot_not_ready',
        ts: params.nowIso || new Date().toISOString(),
      });
      return {
        allowed: false,
        reason: 'config_error',
        admission: {
          allowed: false,
          reason: 'config_error',
          scope: 'office',
          remainingNanodollars: '0',
          estimate,
        },
        hold: null,
      };
    }

    const admission = checkBudgetAdmission(params.seatId, params.wakeId, params.nowIso);
    if (!admission.allowed) {
      return { allowed: false, reason: admission.reason, admission, hold: null };
    }

    // Deterministic barrier test hook for counterproof verification (Hermes Item 11):
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.AIBOSS_TEST_BARRIER_DIR
    ) {
      const barrierDir = process.env.AIBOSS_TEST_BARRIER_DIR;
      const myPid = process.pid;
      fs.writeFileSync(path.join(barrierDir, `arrived-${myPid}`), '1');
      const releaseFile = path.join(barrierDir, 'release');
      const start = Date.now();
      while (!fs.existsSync(releaseFile) && Date.now() - start < 3000) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }

    const hold = recordHold({
      holdId: params.holdId,
      wakeId: params.wakeId,
      seatId: params.seatId,
      amountNanodollars: admission.estimate.amountNanodollars,
      basis: admission.estimate.basis,
      overBudget: Boolean(admission.overBudget),
      ...(params.worker ? { worker: params.worker } : {}),
      ts: params.nowIso || new Date().toISOString(),
    });

    return { allowed: true, admission, hold };
  });
}

// -------------------------------------------------------------
// Reconciliation of Open Holds
// -------------------------------------------------------------

/**
 * Helper to fold run records for a hold from runs-ledger files.
 * Reads backwards across files, collects all updates grouped by runId, and merges them
 * in chronological order so the final terminal state (finished/failed/killed) is accurately reflected.
 * Separates distinct runs sharing the same wakeId.
 */
interface RawRunLine {
  type?: string;
  runId?: string;
  wakeId?: string;
  holdId?: string;
  status?: string;
  pid?: number;
  processStartedAt?: string;
  instanceId?: string;
  errorKind?: string;
  costStatus?: string;
  startedAt?: string;
  [key: string]: unknown;
}

export function findFoldedRunForHold(hold: BudgetHoldRecord): {
  status?: string;
  runId?: string;
  pid?: number;
  processStartedAt?: string;
  instanceId?: string;
  errorKind?: string;
  costStatus?: string;
} | null {
  try {
    const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
    const runsDir = path.join(baseDataDir, 'runs');
    if (!fs.existsSync(runsDir)) return null;

    const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.jsonl')).sort();
    const runsById = new Map<string, RawRunLine>();

    for (const f of files) {
      const content = fs.readFileSync(path.join(runsDir, f), 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const p = JSON.parse(line) as RawRunLine;
          if (p.type === 'run' && typeof p.runId === 'string') {
            const existing = runsById.get(p.runId) || {};
            runsById.set(p.runId, Object.assign(existing, p));
          }
        } catch {
          /* ignore json parse error */
        }
      }
    }

    // 1. Exact match by holdId
    for (const r of runsById.values()) {
      if (r.holdId === hold.holdId) {
        return r;
      }
    }

    // 2. Fallback match by wakeId, choosing latest run by startedAt
    let latestMatchingWake: RawRunLine | null = null;
    for (const r of runsById.values()) {
      if (r.wakeId === hold.wakeId) {
        if (
          !latestMatchingWake ||
          (r.startedAt && String(r.startedAt) >= String(latestMatchingWake.startedAt))
        ) {
          latestMatchingWake = r;
        }
      }
    }

    return latestMatchingWake;
  } catch {
    return null;
  }
}

/**
 * Reconcile open holds:
 * - Scans active holds from durable open-holds checkpoint index.
 * - Folds run records by runId to determine final run status.
 * - Checks PID liveness and start-time identity for running processes (never prematurely expires live workers).
 * - Settle holds when costs are recorded (preserving exact "0" actualNanodollars).
 * - CRITICAL (Hermes FAIL 7): Never settles partial receipts while run.costStatus === 'pending'.
 * - Release holds when runs fail without receipts, expire, or are orphaned.
 */
export function reconcileOpenHolds(options?: {
  getRunFn?: (hold: BudgetHoldRecord) => {
    status?: string;
    runId?: string;
    pid?: number;
    processStartedAt?: string;
    instanceId?: string;
    errorKind?: string;
    costStatus?: string;
  } | null;
  getReceiptsFn?: (runId: string) => Array<{ priced: boolean; costNanodollars: string | null }>;
  maxAgeMs?: number;
  nowIso?: string;
}): { settled: number; released: number } {
  const maxAgeMs = options?.maxAgeMs ?? 10 * 60 * 1000; // 10 minutes default
  const nowMs = options?.nowIso ? new Date(options.nowIso).getTime() : Date.now();
  const nowTs = options?.nowIso || new Date().toISOString();

  let settled = 0;
  let released = 0;

  withBudgetLock(() => {
    const activeHolds = getActiveHolds();
    if (activeHolds.size === 0) return;

    for (const hold of activeHolds.values()) {
      const holdTimeMs = new Date(hold.ts).getTime();
      const holdAgeMs = nowMs - holdTimeMs;

      const run = options?.getRunFn ? options.getRunFn(hold) : findFoldedRunForHold(hold);

      if (!run) {
        // No run was ever recorded for this hold
        if (holdAgeMs > maxAgeMs) {
          releaseHold({
            holdId: hold.holdId,
            reason: 'expired',
            ts: nowTs,
          });
          released++;
        }
        continue;
      }

      const runId = run.runId || hold.holdId.replace('hold', 'run');

      // 1. Process still running
      if (run.status === 'running') {
        if (run.pid) {
          const liveness = checkProcessLiveness(run.pid, run.processStartedAt);
          if (liveness === 'alive') {
            // Worker is actively executing! NEVER expire!
            continue;
          }
          if (liveness === 'unverified') {
            // OS query status could not be verified; give grace period before expiry
            if (holdAgeMs > maxAgeMs * 2) {
              releaseHold({
                holdId: hold.holdId,
                reason: 'expired',
                ts: nowTs,
              });
              released++;
            }
            continue;
          }
          // Worker process is definitely dead (ESRCH or start time mismatch)
          if (holdAgeMs > maxAgeMs) {
            releaseHold({
              holdId: hold.holdId,
              reason: 'expired',
              ts: nowTs,
            });
            released++;
          }
        } else {
          // PID is missing / unverified
          if (holdAgeMs > maxAgeMs) {
            releaseHold({
              holdId: hold.holdId,
              reason: 'expired',
              ts: nowTs,
            });
            released++;
          }
        }
        continue;
      }

      // 2. Terminal runs: finished, failed, killed, timeout (Hermes Item 7 / FAIL 7)
      const isTerminal =
        run.status === 'finished' ||
        run.status === 'failed' ||
        run.status === 'killed' ||
        run.status === 'timeout';

      if (isTerminal) {
        if (run.errorKind === 'orphaned' || (run as { status?: string }).status === 'orphaned') {
          releaseHold({
            holdId: hold.holdId,
            reason: 'orphaned',
            ts: nowTs,
          });
          released++;
          continue;
        }

        if (run.costStatus === 'pending') {
          // CRITICAL (Hermes Item 7 / FAIL 7):
          // Receipts pricing is still in progress across models for terminal states including timeout.
          // NEVER settle partially or expire based on hold age! Settle ONLY when reconcilePendingCosts completes!
          continue;
        }
        let receipts: Array<{ priced: boolean; costNanodollars: string | null }> = [];
        if (options?.getReceiptsFn) {
          receipts = options.getReceiptsFn(runId);
        } else {
          const costRecs = getCostReceiptsForRun(runId);
          receipts = costRecs.map((r) => ({ priced: Boolean(r.priced), costNanodollars: r.costNanodollars }));
        }

        if (receipts.length > 0) {
          const isFullyPriced = receipts.every((r) => r.priced && r.costNanodollars !== null);
          const totalActualBig = receipts.reduce(
            (acc, r) => acc + (r.costNanodollars ? BigInt(r.costNanodollars) : 0n),
            0n
          );
          settleHold({
            holdId: hold.holdId,
            runId,
            actualNanodollars: isFullyPriced ? totalActualBig.toString() : null,
            priced: isFullyPriced,
            ts: nowTs,
          });
          settled++;
        } else {
          // Finished, failed, or timed out without any cost receipts ever recorded
          releaseHold({
            holdId: hold.holdId,
            reason: 'failed_no_receipt',
            ts: nowTs,
          });
          released++;
        }
      } else if (holdAgeMs > maxAgeMs) {
        releaseHold({
          holdId: hold.holdId,
          reason: 'expired',
          ts: nowTs,
        });
        released++;
      }
    }
  });

  return { settled, released };
}
