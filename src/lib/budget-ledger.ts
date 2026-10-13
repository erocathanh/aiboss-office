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
export type BudgetState = 'unlimited' | 'ok' | 'warning' | 'exceeded' | 'config_error';

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

function getOpenHoldsFilePath(): string {
  ensureBudgetDir();
  return path.join(getBudgetDir(), 'open-holds.json');
}

let lockDepth = 0;

/**
 * Cross-process locking helper for budget ledger writes and atomic transactions.
 * Uses atomic directory creation with lock token ownership verification,
 * dead process detection, and re-entrancy support.
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
  const infoFile = path.join(lockDir, 'info.json');
  const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const start = Date.now();

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      try {
        fs.writeFileSync(
          infoFile,
          JSON.stringify({ pid: process.pid, token: lockToken, ts: Date.now() })
        );
      } catch {
        /* ignore write race */
      }
      break;
    } catch (err: unknown) {
      const errObj = err as { code?: string };
      if (errObj.code === 'EEXIST') {
        try {
          if (fs.existsSync(infoFile)) {
            const raw = fs.readFileSync(infoFile, 'utf-8');
            const info = JSON.parse(raw);
            let isProcessDead = false;
            try {
              process.kill(info.pid, 0);
            } catch (e: unknown) {
              if ((e as { code?: string }).code === 'ESRCH') {
                isProcessDead = true;
              }
            }

            // CRITICAL (Hermes FAIL 6 & Finding B):
            // NEVER steal lock of a live process!
            // Only reclaim when owner PID is confirmed dead by OS AND token matches.
            if (isProcessDead) {
              try {
                const checkInfo = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
                if (checkInfo.token === info.token) {
                  fs.rmSync(lockDir, { recursive: true, force: true });
                  continue;
                }
              } catch {
                /* race during recovery check */
              }
            }
          } else {
            // Lock dir exists but info.json is missing. Check if abandoned crash.
            const stat = fs.statSync(lockDir);
            if (Date.now() - stat.mtimeMs > 3000) {
              fs.rmSync(lockDir, { recursive: true, force: true });
              continue;
            }
          }
        } catch {
          /* ignore error during recovery check */
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
      if (fs.existsSync(infoFile)) {
        const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
        // Only delete lock if it still belongs to THIS process and THIS token
        if (info.token === lockToken && info.pid === process.pid) {
          fs.rmSync(lockDir, { recursive: true, force: true });
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

// -------------------------------------------------------------
// Durable Open-Holds Index (open-holds.json)
// -------------------------------------------------------------

function loadOpenHoldsMap(): Record<string, BudgetHoldRecord> {
  ensureBudgetDir();
  const openHoldsPath = getOpenHoldsFilePath();
  if (fs.existsSync(openHoldsPath)) {
    try {
      const content = fs.readFileSync(openHoldsPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, BudgetHoldRecord>;
      }
    } catch {
      /* ignore read error and fall back to reconstruct */
    }
  }

  // Reconstruct index from all budget files on disk
  const allRecords = readAllBudgetRecords(() => true);
  const map: Record<string, BudgetHoldRecord> = {};
  for (const r of allRecords) {
    if (r.type === 'hold') {
      map[r.holdId] = r;
    } else if (r.type === 'settle' || r.type === 'release') {
      delete map[r.holdId];
    }
  }

  try {
    saveOpenHoldsMap(map);
  } catch {
    /* ignore save race */
  }
  return map;
}

function saveOpenHoldsMap(map: Record<string, BudgetHoldRecord>): void {
  ensureBudgetDir();
  const openHoldsPath = getOpenHoldsFilePath();
  const tmpPath = path.join(getBudgetDir(), `.open-holds.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(map, null, 2), 'utf-8');
  fs.renameSync(tmpPath, openHoldsPath);
}

/**
 * Check if a hold is already closed (settled or released).
 * Uses durable open-holds index: if not present in open-holds map, it is closed or does not exist.
 */
export function isHoldClosed(holdId: string): boolean {
  return withBudgetLock(() => {
    const openHolds = loadOpenHoldsMap();
    return !openHolds[holdId];
  });
}

/**
 * Get map of currently active holds: holdId -> BudgetHoldRecord.
 * CRITICAL (Hermes FAIL 8 & 9): Reads from durable open-holds.json index so active holds
 * are preserved across server restarts regardless of time window.
 */
export function getActiveHolds(): Map<string, BudgetHoldRecord> {
  return withBudgetLock(() => {
    const openHolds = loadOpenHoldsMap();
    const map = new Map<string, BudgetHoldRecord>();
    for (const [k, v] of Object.entries(openHolds)) {
      map.set(k, v);
    }
    return map;
  });
}

/**
 * Record a budget hold prior to dispatch under lock.
 * Updates both the append-only ledger and the durable open-holds index.
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

    const openHolds = loadOpenHoldsMap();
    openHolds[record.holdId] = record;
    saveOpenHoldsMap(openHolds);

    return record;
  });
}

/**
 * Settle a budget hold upon run completion.
 * IDEMPOTENT & CROSS-PROCESS SAFE:
 * Under budget lock, checks if hold is in open-holds index.
 * If already closed, returns null immediately without duplicate append.
 */
export function settleHold(params: {
  holdId: string;
  runId: string;
  actualNanodollars: string | null;
  priced: boolean;
  ts?: string;
}): BudgetSettleRecord | null {
  return withBudgetLock(() => {
    const openHolds = loadOpenHoldsMap();
    if (!openHolds[params.holdId]) {
      return null; // Already closed or non-existent
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

    delete openHolds[params.holdId];
    saveOpenHoldsMap(openHolds);

    appendBudgetRecordDirect(record);
    return record;
  });
}

/**
 * Release a budget hold when a run fails without receipt, expires, or is orphaned.
 * IDEMPOTENT & CROSS-PROCESS SAFE:
 * Under budget lock, checks if hold is in open-holds index.
 * If already closed, returns null immediately without duplicate append.
 */
export function releaseHold(params: {
  holdId: string;
  reason: BudgetReleaseReason;
  ts?: string;
}): BudgetReleaseRecord | null {
  return withBudgetLock(() => {
    const openHolds = loadOpenHoldsMap();
    if (!openHolds[params.holdId]) {
      return null; // Already closed or non-existent
    }

    const record = sanitizeReleaseRecord({
      type: 'release',
      holdId: params.holdId,
      reason: params.reason,
      ts: params.ts || new Date().toISOString(),
    });
    if (!record) return null;

    delete openHolds[params.holdId];
    saveOpenHoldsMap(openHolds);

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

  // Read today's costs from costs ledger
  const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  const todayCostFile = path.join(baseDataDir, 'costs', `${todayStr}.jsonl`);
  const todayCosts = readCostFile(todayCostFile);

  // Filter costs by seatId if specified
  const filteredCosts = seatId
    ? todayCosts.filter((c) => c.seatId === seatId)
    : todayCosts;

  // De-duplicate / fold receipts by (runId, model) matching costs-ledger.ts
  const uniqueRecordsMap = new Map<string, CostRecord>();
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

  // Calculate active holds from durable open-holds index
  const activeHolds = getActiveHolds();
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

  // Fail closed on configuration errors
  const seatStatus = getBudgetStatus(seatId, nowIso);
  const officeStatus = getBudgetStatus(undefined, nowIso);

  if (seatStatus.state === 'config_error' || officeStatus.state === 'config_error') {
    recordReject({
      wakeId,
      seatId,
      scope: seatStatus.state === 'config_error' ? 'seat' : 'office',
      capNanodollars: seatStatus.capNanodollars ?? '0',
      spentNanodollars: seatStatus.spentNanodollars,
      heldNanodollars: seatStatus.heldNanodollars,
      estimateNanodollars: estimate.amountNanodollars,
      reason: 'config_error',
      ts: nowTs,
    });
    return {
      allowed: false,
      reason: 'config_error',
      scope: seatStatus.state === 'config_error' ? 'seat' : 'office',
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
  nowIso?: string;
}): {
  allowed: boolean;
  reason?: 'budget_exceeded' | 'config_error';
  admission: BudgetAdmissionResult;
  hold: BudgetHoldRecord | null;
} {
  return withBudgetLock(() => {
    const admission = checkBudgetAdmission(params.seatId, params.wakeId, params.nowIso);
    if (!admission.allowed) {
      return { allowed: false, reason: admission.reason, admission, hold: null };
    }

    const hold = recordHold({
      holdId: params.holdId,
      wakeId: params.wakeId,
      seatId: params.seatId,
      amountNanodollars: admission.estimate.amountNanodollars,
      basis: admission.estimate.basis,
      overBudget: Boolean(admission.overBudget),
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
 * Reads backwards across files, collects all updates for the run, and merges them
 * in chronological order so the final terminal state (finished/failed/killed) is accurately reflected.
 */
interface RawRunLine {
  type?: string;
  runId?: string;
  wakeId?: string;
  holdId?: string;
  status?: string;
  pid?: number;
  errorKind?: string;
  costStatus?: string;
  [key: string]: unknown;
}

function findFoldedRunForHold(hold: BudgetHoldRecord): {
  status?: string;
  runId?: string;
  pid?: number;
  errorKind?: string;
  costStatus?: string;
} | null {
  try {
    const baseDataDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
    const runsDir = path.join(baseDataDir, 'runs');
    if (!fs.existsSync(runsDir)) return null;

    const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.jsonl')).sort();
    const matchingLines: RawRunLine[] = [];

    for (const f of files) {
      const content = fs.readFileSync(path.join(runsDir, f), 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const p = JSON.parse(line) as RawRunLine;
          if (p.type === 'run' && (p.holdId === hold.holdId || p.wakeId === hold.wakeId)) {
            matchingLines.push(p);
          }
        } catch {
          /* ignore json parse error */
        }
      }
    }

    if (matchingLines.length === 0) return null;

    // Merge in chronological order to produce folded final state
    let folded: RawRunLine | null = null;
    for (const r of matchingLines) {
      if (!folded) {
        folded = Object.assign({}, r);
      } else {
        folded = Object.assign(folded, r);
      }
    }
    return folded;
  } catch {
    return null;
  }
}

/**
 * Reconcile open holds:
 * - Scans active holds from durable open-holds index.
 * - Folds run records to determine final run status.
 * - Checks PID liveness for running processes (never prematurely expires live workers).
 * - Settle holds when costs are recorded (preserving exact "0" actualNanodollars).
 * - Release holds when runs fail without receipts, expire, or are orphaned.
 */
export function reconcileOpenHolds(options?: {
  getRunFn?: (hold: BudgetHoldRecord) => {
    status?: string;
    runId?: string;
    pid?: number;
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
        let isProcessDead = false;
        if (run.pid) {
          try {
            process.kill(run.pid, 0);
          } catch (e: unknown) {
            if ((e as { code?: string }).code === 'ESRCH') {
              isProcessDead = true;
            }
          }
        }
        if (!isProcessDead) {
          // Process is still actively executing! Do NOT expire!
          continue;
        }
        // Process is dead without updating terminal state
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

      // 2. Terminal runs: finished, failed, killed
      if (run.status === 'finished' || run.status === 'failed' || run.status === 'killed') {
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
          // Receipts pricing in progress; wait for reconcilePendingCosts unless timed out
          if (holdAgeMs <= maxAgeMs) {
            continue;
          }
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
          // Finished or failed without any cost receipts ever recorded
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
