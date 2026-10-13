/**
 * budget-ledger.ts — Budget Hold & Cap Enforcement Ledger (A-3)
 *
 * Implements pre-dispatch budget reservations (holds), settling upon run completion,
 * releasing on failure/orphan/expiry, and rejecting when caps are exceeded.
 *
 * Storage: operations/data/budget/<YYYY-MM-DD>.jsonl (append-only)
 *
 * Line types:
 * - hold:    { type, holdId, wakeId, seatId, amountNanodollars, basis, overBudget, ts }
 * - settle:  { type, holdId, runId, actualNanodollars|null, priced, ts }
 * - release: { type, holdId, reason: "orphaned"|"failed_no_receipt"|"expired", ts }
 * - reject:  { type, wakeId, seatId, scope: "seat"|"office", capNanodollars, spentNanodollars, heldNanodollars, estimateNanodollars, reason, ts }
 *
 * Safety & Concurrency:
 * - Cross-process atomic locking via directory creation (.budget.lock).
 * - Strict whitelisting for all 4 line types; zero free-text/prompt/result leaks.
 * - Idempotent settling and releasing per holdId.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  getOfficeConfig,
  isValidNanodollarsString,
  validateDailyCap,
  validateRunEstimate,
} from './office-config';
import { readCostFile } from './costs-ledger';

export type BudgetBasis = 'estimate:last5' | 'default';
export type BudgetReleaseReason = 'orphaned' | 'failed_no_receipt' | 'expired';
export type BudgetRejectScope = 'seat' | 'office';
export type BudgetState = 'unlimited' | 'ok' | 'warning' | 'exceeded';

export interface BudgetHoldRecord {
  type: 'hold';
  holdId: string;
  wakeId: string;
  seatId: string;
  amountNanodollars: string;
  basis: BudgetBasis;
  overBudget: boolean;
  ts: string;
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
}

export interface BudgetAdmissionResult {
  allowed: boolean;
  overBudget?: boolean;
  reason?: 'budget_exceeded';
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

let lockDepth = 0;

/**
 * Cross-process locking helper for budget ledger writes and atomic transactions.
 * Uses atomic directory creation with stale lock detection and re-entrancy support.
 */
export function withBudgetLock<T>(fn: () => T, timeoutMs = 5000): T {
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
  const start = Date.now();

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      try {
        fs.writeFileSync(
          path.join(lockDir, 'info.json'),
          JSON.stringify({ pid: process.pid, ts: Date.now() })
        );
      } catch {
        /* ignore */
      }
      break;
    } catch (err: unknown) {
      const errObj = err as { code?: string };
      if (errObj.code === 'EEXIST') {
        try {
          const infoFile = path.join(lockDir, 'info.json');
          if (fs.existsSync(infoFile)) {
            const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
            const isStale = Date.now() - info.ts > 10000;
            let isProcessDead = false;
            try {
              process.kill(info.pid, 0);
            } catch (e: unknown) {
              if ((e as { code?: string }).code === 'ESRCH') isProcessDead = true;
            }
            if (isStale || isProcessDead) {
              fs.rmSync(lockDir, { recursive: true, force: true });
              continue;
            }
          }
        } catch {
          /* ignore error during stale check */
        }

        if (Date.now() - start > timeoutMs) {
          throw new Error(`Budget ledger lock timeout after ${timeoutMs}ms`);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
      } else {
        throw err;
      }
    }
  }

  lockDepth = 1;
  try {
    return fn();
  } finally {
    lockDepth = 0;
    try {
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      /* ignore */
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
  if (typeof r.ts !== 'string') return null;

  return {
    type: 'hold',
    holdId: r.holdId,
    wakeId: r.wakeId,
    seatId: r.seatId,
    amountNanodollars: r.amountNanodollars,
    basis: r.basis,
    overBudget: Boolean(r.overBudget),
    ts: r.ts,
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

function appendBudgetRecordDirect(record: BudgetRecord): void {
  ensureBudgetDir();
  const filePath = getBudgetLogPathForDate(record.ts);
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

/**
 * Check if a hold is already closed (settled or released).
 */
export function isHoldClosed(holdId: string): boolean {
  const records = readAllBudgetRecords();
  return records.some(
    (r) => (r.type === 'settle' || r.type === 'release') && r.holdId === holdId
  );
}

/**
 * Get map of currently active holds: holdId -> BudgetHoldRecord.
 * Bounded to today and yesterday's files to avoid unbounded disk scans.
 */
export function getActiveHolds(nowIso?: string): Map<string, BudgetHoldRecord> {
  const now = nowIso ? new Date(nowIso) : new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Read budget records for yesterday and today (or all if in test environment with custom dates)
  const records = readAllBudgetRecords((f) => {
    const name = f.replace('.jsonl', '');
    return name === todayStr || name === yesterdayStr;
  });

  const holds = new Map<string, BudgetHoldRecord>();
  const closed = new Set<string>();

  for (const r of records) {
    if (r.type === 'hold') {
      holds.set(r.holdId, r);
    } else if (r.type === 'settle' || r.type === 'release') {
      closed.add(r.holdId);
    }
  }

  for (const holdId of closed) {
    holds.delete(holdId);
  }

  return holds;
}

/**
 * Record a budget hold prior to dispatch under lock.
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
      ts: hold.ts,
    });
    if (!record) {
      throw new Error('Invalid budget hold record');
    }
    appendBudgetRecordDirect(record);
    return record;
  });
}

/**
 * Settle a budget hold upon run completion.
 * IDEMPOTENT & CROSS-PROCESS SAFE: Under budget lock, checks if already settled/released before appending.
 */
export function settleHold(params: {
  holdId: string;
  runId: string;
  actualNanodollars: string | null;
  priced: boolean;
  ts?: string;
}): BudgetSettleRecord | null {
  return withBudgetLock(() => {
    if (isHoldClosed(params.holdId)) {
      return null;
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
    appendBudgetRecordDirect(record);
    return record;
  });
}

/**
 * Release a budget hold when a run fails without receipt, expires, or is orphaned.
 * IDEMPOTENT & CROSS-PROCESS SAFE: Under budget lock, checks if already settled/released before appending.
 */
export function releaseHold(params: {
  holdId: string;
  reason: BudgetReleaseReason;
  ts?: string;
}): BudgetReleaseRecord | null {
  return withBudgetLock(() => {
    if (isHoldClosed(params.holdId)) {
      return null;
    }
    const record = sanitizeReleaseRecord({
      type: 'release',
      holdId: params.holdId,
      reason: params.reason,
      ts: params.ts || new Date().toISOString(),
    });
    if (!record) return null;
    appendBudgetRecordDirect(record);
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
 * Find hold record by wakeId.
 */
export function findHoldByWakeId(wakeId: string): BudgetHoldRecord | undefined {
  const records = readAllBudgetRecords();
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.type === 'hold' && r.wakeId === wakeId) {
      return r;
    }
  }
  return undefined;
}

/**
 * Find holdId for a given runId (looks up settled record or wakeId link).
 */
export function findHoldIdForRun(runId: string, wakeId?: string): string | undefined {
  const records = readAllBudgetRecords();
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.type === 'settle' && r.runId === runId) {
      return r.holdId;
    }
  }
  if (wakeId) {
    const hold = findHoldByWakeId(wakeId);
    if (hold) return hold.holdId;
  }
  return undefined;
}

/**
 * Calculate run estimate for a seat:
 * Average costNanodollars of up to 5 most recent priced runs in the past 7 days.
 * If none available, returns defaultRunEstimateNanodollars.
 * Bounded: Only reads cost files from the past 7 days.
 */
export function calculateRunEstimate(
  seatId: string,
  nowIso?: string
): { amountNanodollars: string; basis: BudgetBasis } {
  const config = getOfficeConfig();
  const defaultEstimate =
    validateRunEstimate(config.budget?.defaultRunEstimateNanodollars) || '700000000';

  const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;

  // Scan only cost files within the 7-day window
  const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  const costsDir = path.join(baseDataDir, 'costs');
  const relevantCosts: Array<{ runId: string; seatId: string; priced: boolean; costNanodollars: string | null; ts: string }> = [];

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
        if (r.seatId !== seatId || !r.priced || !r.costNanodollars) continue;
        const rTime = new Date(r.ts).getTime();
        if (rTime >= sevenDaysAgoMs && rTime <= nowMs) {
          relevantCosts.push(r);
        }
      }
    }
  }

  // Group by runId (sum per-model costs for the same run)
  const runCosts = new Map<string, { totalNanodollars: bigint; latestTs: number }>();
  for (const c of relevantCosts) {
    const existing = runCosts.get(c.runId);
    const amount = BigInt(c.costNanodollars!);
    const ts = new Date(c.ts).getTime();
    if (!existing) {
      runCosts.set(c.runId, { totalNanodollars: amount, latestTs: ts });
    } else {
      existing.totalNanodollars += amount;
      if (ts > existing.latestTs) existing.latestTs = ts;
    }
  }

  // Sort by latestTs descending
  const sortedRuns = Array.from(runCosts.values()).sort(
    (a, b) => b.latestTs - a.latestTs
  );

  const top5 = sortedRuns.slice(0, 5);
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
 * - Warning threshold is strictly > 80% (committed * 100n > cap * 80n).
 */
export function getBudgetStatus(seatId?: string, nowIso?: string): BudgetStatus {
  const config = getOfficeConfig();
  const now = nowIso ? new Date(nowIso) : new Date();
  const todayStr = now.toISOString().split('T')[0];

  const defaultEstimate =
    validateRunEstimate(config.budget?.defaultRunEstimateNanodollars) || '700000000';

  const rawCap = seatId
    ? (config.budget?.seats?.[seatId]?.dailyCapNanodollars ?? null)
    : (config.budget?.office?.dailyCapNanodollars ?? null);
  const capNanodollars = validateDailyCap(rawCap) ?? null;

  const hardStop = seatId
    ? (config.budget?.seats?.[seatId]?.hardStop ?? config.budget?.office?.hardStop ?? true)
    : (config.budget?.office?.hardStop ?? true);

  // Read today's costs from costs ledger
  const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  const todayCostFile = path.join(baseDataDir, 'costs', `${todayStr}.jsonl`);
  const todayCosts = readCostFile(todayCostFile);

  // Filter costs by seatId if specified
  const filteredCosts = seatId
    ? todayCosts.filter((c) => c.seatId === seatId)
    : todayCosts;

  // De-duplicate / fold receipts by (runId, model) matching costs-ledger.ts
  const uniqueRecordsMap = new Map<string, (typeof todayCosts)[0]>();
  for (const c of filteredCosts) {
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

  // Calculate active holds (bounded to today/yesterday)
  const activeHolds = getActiveHolds(nowIso);
  let heldBig = 0n;
  for (const hold of activeHolds.values()) {
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

  if (capNanodollars !== null) {
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
  };
}

/**
 * Check budget admission for a candidate turn before dispatch.
 * Checks seat-level cap then office-level cap.
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

  // 1. Check Seat Cap
  const seatStatus = getBudgetStatus(seatId, nowIso);
  let overBudget = false;

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
  const officeStatus = getBudgetStatus(undefined, nowIso);
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
 * Atomic Check & Hold Transaction (Hermes Finding B).
 * Under the budget lock, evaluates admission and records the hold record atomically.
 * Prevents race conditions between concurrent runner processes.
 */
export function checkAdmissionAndRecordHold(params: {
  seatId: string;
  wakeId: string;
  holdId: string;
  nowIso?: string;
}): {
  allowed: boolean;
  hold?: BudgetHoldRecord;
  reason?: 'budget_exceeded';
  scope?: BudgetRejectScope;
  overBudget?: boolean;
  remainingNanodollars?: string | null;
  estimate: {
    amountNanodollars: string;
    basis: BudgetBasis;
  };
} {
  return withBudgetLock(() => {
    const admission = checkBudgetAdmission(params.seatId, params.wakeId, params.nowIso);
    if (!admission.allowed) {
      return admission;
    }

    const holdRecord = sanitizeHoldRecord({
      type: 'hold',
      holdId: params.holdId,
      wakeId: params.wakeId,
      seatId: params.seatId,
      amountNanodollars: admission.estimate.amountNanodollars,
      basis: admission.estimate.basis,
      overBudget: Boolean(admission.overBudget),
      ts: params.nowIso || new Date().toISOString(),
    });

    if (holdRecord) {
      appendBudgetRecordDirect(holdRecord);
    }

    return {
      ...admission,
      hold: holdRecord ?? undefined,
    };
  });
}

/**
 * Reconcile Open Budget Holds (Hermes FAIL 7 & FAIL 8).
 * Scans active holds and reconciles their lifecycle:
 * - Settles holds whose runs have finished and have receipts.
 * - Releases holds whose runs failed/killed without receipts (reason: failed_no_receipt).
 * - Releases holds whose runs are orphaned (reason: orphaned).
 * - Releases holds older than maxAgeMs without runs (reason: expired).
 */
export function reconcileOpenHolds(options?: {
  getRunFn?: (hold: BudgetHoldRecord) => { status?: string; runId?: string; pid?: number } | null;
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
    const activeHolds = getActiveHolds(options?.nowIso);
    if (activeHolds.size === 0) return;

    for (const hold of activeHolds.values()) {
      const holdTimeMs = new Date(hold.ts).getTime();
      const holdAgeMs = nowMs - holdTimeMs;

      let run: { status?: string; runId?: string; pid?: number } | null = null;
      if (options?.getRunFn) {
        run = options.getRunFn(hold);
      } else {
        // Fallback: look up in runs files
        try {
          const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
          const runsDir = path.join(baseDataDir, 'runs');
          if (fs.existsSync(runsDir)) {
            const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.jsonl')).sort();
            for (let i = files.length - 1; i >= 0; i--) {
              const lines = fs.readFileSync(path.join(runsDir, files[i]), 'utf-8').split('\n');
              for (const l of lines) {
                if (!l.trim()) continue;
                try {
                  const p = JSON.parse(l);
                  if (p.type === 'run' && (p.holdId === hold.holdId || p.wakeId === hold.wakeId)) {
                    run = p;
                    break;
                  }
                } catch {
                  /* ignore */
                }
              }
              if (run) break;
            }
          }
        } catch {
          /* ignore */
        }
      }

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

      // Run exists
      const runId = run.runId || hold.holdId.replace('hold', 'run');

      if (run.status === 'finished' || run.status === 'failed' || run.status === 'killed') {
        let receipts: Array<{ priced: boolean; costNanodollars: string | null }> = [];
        if (options?.getReceiptsFn) {
          receipts = options.getReceiptsFn(runId);
        } else {
          // Look up receipts in costs ledger
          try {
            const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
            const costsDir = path.join(baseDataDir, 'costs');
            if (fs.existsSync(costsDir)) {
              const files = fs.readdirSync(costsDir).filter((f) => f.endsWith('.jsonl')).sort();
              for (const f of files) {
                const recs = readCostFile(path.join(costsDir, f));
                for (const r of recs) {
                  if (r.runId === runId) {
                    receipts.push({ priced: Boolean(r.priced), costNanodollars: r.costNanodollars });
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
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
            actualNanodollars: totalActualBig > 0n ? totalActualBig.toString() : null,
            priced: isFullyPriced,
            ts: nowTs,
          });
          settled++;
        } else {
          // Finished/failed without any receipts recorded
          releaseHold({
            holdId: hold.holdId,
            reason: 'failed_no_receipt',
            ts: nowTs,
          });
          released++;
        }
      } else if (run.status === 'orphaned') {
        releaseHold({
          holdId: hold.holdId,
          reason: 'orphaned',
          ts: nowTs,
        });
        released++;
      } else if (holdAgeMs > maxAgeMs) {
        // Run has been in non-terminal state longer than maxAgeMs without heartbeat
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
