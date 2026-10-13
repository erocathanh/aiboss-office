/**
 * budget-ledger.ts — Budget Hold & Cap Enforcement Ledger (A-3)
 *
 * Implements pre-dispatch budget reservations (holds), settling upon run completion,
 * releasing on failure/orphan, and rejecting when caps are exceeded.
 *
 * Storage: operations/data/budget/<YYYY-MM-DD>.jsonl (append-only)
 *
 * Line types:
 * - hold: { type, holdId, wakeId, seatId, amountNanodollars, basis: "estimate:last5"|"default", overBudget, ts }
 * - settle: { type, holdId, runId, actualNanodollars|null, priced, ts }
 * - release: { type, holdId, reason: "orphaned"|"failed_no_receipt"|"expired", ts }
 * - reject: { type, wakeId, seatId, scope: "seat"|"office", capNanodollars, spentNanodollars, heldNanodollars, estimateNanodollars, ts }
 *
 * Idempotency: per holdId — a hold can be settled or released at most once.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getOfficeConfig } from './office-config';
import { readCostFile, readAllCostRecords } from './costs-ledger';

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
  wakeId: string;
  seatId: string;
  scope: BudgetRejectScope;
  capNanodollars: string | null;
  spentNanodollars: string;
  heldNanodollars: string;
  estimateNanodollars: string;
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
  remainingNanodollars: string | null;
  state: BudgetState;
  hardStop: boolean;
}

export interface BudgetAdmissionResult {
  allowed: boolean;
  overBudget?: boolean;
  reason?: 'budget_exceeded';
  scope?: BudgetRejectScope;
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

/**
 * Read budget records from a single file, gracefully skipping corrupted lines.
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
        const parsed = JSON.parse(trimmed) as BudgetRecord;
        if (parsed && typeof parsed.type === 'string') {
          records.push(parsed);
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
 * Read all budget records across files.
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
  }

  const records: BudgetRecord[] = [];
  for (const file of files) {
    const filePath = path.join(budgetDir, file);
    records.push(...readBudgetFile(filePath));
  }
  return records;
}

/**
 * Append a budget record to the date-partitioned JSONL file.
 */
export function appendBudgetRecord(record: BudgetRecord): void {
  ensureBudgetDir();
  const filePath = getBudgetLogPathForDate(record.ts);
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
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
 */
export function getActiveHolds(): Map<string, BudgetHoldRecord> {
  const records = readAllBudgetRecords();
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
 * Record a budget hold prior to dispatch.
 */
export function recordHold(hold: Omit<BudgetHoldRecord, 'type'>): BudgetHoldRecord {
  const record: BudgetHoldRecord = {
    type: 'hold',
    ...hold,
  };
  appendBudgetRecord(record);
  return record;
}

/**
 * Settle a budget hold upon run completion.
 * IDEMPOTENT: If already settled or released, does NOT append a duplicate line.
 */
export function settleHold(params: {
  holdId: string;
  runId: string;
  actualNanodollars: string | null;
  priced: boolean;
  ts?: string;
}): BudgetSettleRecord | null {
  if (isHoldClosed(params.holdId)) {
    return null;
  }
  const record: BudgetSettleRecord = {
    type: 'settle',
    holdId: params.holdId,
    runId: params.runId,
    actualNanodollars: params.actualNanodollars,
    priced: params.priced,
    ts: params.ts || new Date().toISOString(),
  };
  appendBudgetRecord(record);
  return record;
}

/**
 * Release a budget hold when a run fails without receipt, expires, or is orphaned.
 * IDEMPOTENT: If already settled or released, does NOT append a duplicate line.
 */
export function releaseHold(params: {
  holdId: string;
  reason: BudgetReleaseReason;
  ts?: string;
}): BudgetReleaseRecord | null {
  if (isHoldClosed(params.holdId)) {
    return null;
  }
  const record: BudgetReleaseRecord = {
    type: 'release',
    holdId: params.holdId,
    reason: params.reason,
    ts: params.ts || new Date().toISOString(),
  };
  appendBudgetRecord(record);
  return record;
}

/**
 * Record a budget rejection event when a cap is exceeded.
 */
export function recordReject(reject: Omit<BudgetRejectRecord, 'type'>): BudgetRejectRecord {
  const record: BudgetRejectRecord = {
    type: 'reject',
    ...reject,
  };
  appendBudgetRecord(record);
  return record;
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
 */
export function calculateRunEstimate(
  seatId: string,
  nowIso?: string
): { amountNanodollars: string; basis: BudgetBasis } {
  const config = getOfficeConfig();
  const defaultEstimate =
    config.budget?.defaultRunEstimateNanodollars || '700000000';

  const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;

  // Read all cost records
  const costRecords = readAllCostRecords();

  // Filter to this seat, within 7 days, and priced
  const relevantCosts = costRecords.filter((r) => {
    if (r.seatId !== seatId || !r.priced || !r.costNanodollars) return false;
    const costTime = new Date(r.ts).getTime();
    return costTime >= sevenDaysAgoMs && costTime <= nowMs;
  });

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
 */
export function getBudgetStatus(seatId?: string, nowIso?: string): BudgetStatus {
  const config = getOfficeConfig();
  const now = nowIso ? new Date(nowIso) : new Date();
  const todayStr = now.toISOString().split('T')[0];

  const defaultEstimate =
    config.budget?.defaultRunEstimateNanodollars || '700000000';

  const capNanodollars = seatId
    ? (config.budget?.seats?.[seatId]?.dailyCapNanodollars ?? null)
    : (config.budget?.office?.dailyCapNanodollars ?? null);

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

  let spentBig = 0n;
  const unpricedRunIds = new Set<string>();
  const pricedRunIds = new Set<string>();

  for (const c of filteredCosts) {
    if (c.priced && c.costNanodollars) {
      spentBig += BigInt(c.costNanodollars);
      pricedRunIds.add(c.runId);
    } else {
      unpricedRunIds.add(c.runId);
    }
  }

  // Any run that had at least one priced model is considered priced
  for (const pid of pricedRunIds) {
    unpricedRunIds.delete(pid);
  }
  const unpricedRuns = unpricedRunIds.size;

  // Calculate active holds
  const activeHolds = getActiveHolds();
  let heldBig = 0n;
  for (const hold of activeHolds.values()) {
    if (!seatId || hold.seatId === seatId) {
      heldBig += BigInt(hold.amountNanodollars);
    }
  }

  const spentNanodollars = spentBig.toString();
  const heldNanodollars = heldBig.toString();

  let remainingNanodollars: string | null = null;
  let state: BudgetState = 'unlimited';

  if (capNanodollars !== null) {
    const capBig = BigInt(capNanodollars);
    const unpricedEstimateBig = BigInt(unpricedRuns) * BigInt(defaultEstimate);
    const committedBig = spentBig + unpricedEstimateBig + heldBig;
    const remainingBig = capBig - committedBig;
    remainingNanodollars = remainingBig.toString();

    if (committedBig > capBig) {
      state = 'exceeded';
    } else if (committedBig * 100n >= capBig * 80n) {
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
    config.budget?.defaultRunEstimateNanodollars || '700000000';
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
          ts: nowTs,
        });
        return {
          allowed: false,
          reason: 'budget_exceeded',
          scope: 'seat',
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
          ts: nowTs,
        });
        return {
          allowed: false,
          reason: 'budget_exceeded',
          scope: 'office',
          estimate,
        };
      }
      overBudget = true;
    }
  }

  return {
    allowed: true,
    overBudget,
    estimate,
  };
}
