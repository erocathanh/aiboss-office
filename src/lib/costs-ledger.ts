/**
 * costs-ledger.ts — Cost Ledger & Aggregation (A-2)
 *
 * Records model usage receipts and computes per-seat and per-day costs in
 * operations/data/costs/<YYYY-MM-DD>.jsonl.
 *
 * Features:
 * - Append-only JSONL storage.
 * - Idempotency by (runId, model) — duplicate records are not re-appended and not double-counted.
 * - Exact integer nanodollar arithmetic using money.ts and BigInt throughout (no Number conversion).
 * - Stores and returns costNanodollars as decimal string (exact precision for arbitrary numbers).
 * - Avoids double-counting cache-creation tokens in totalTokens (inputTokens already includes them).
 * - Unpriced run accounting (priced: false, costNanodollars: null).
 * - Paginated / bounded aggregation queries by seat, by day, and date ranges.
 */

import fs from 'node:fs';
import path from 'node:path';
import { formatNanodollars } from './money-format';
import type { ModelReceipt } from './usage-receipt';
import { isFenced } from './budget-ledger';

export interface CostRecord {
  ts: string; // ISO
  seatId: string;
  runId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  costNanodollars: string | null; // Decimal string of nanodollars (10^9 per USD)
  priced: boolean;
  source: 'claude-stream-json';
}

export interface CostTotals {
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  totalTokens: number;
  costNanodollars: string; // Exact nanodollars as decimal string
  formattedCostUsd: string;
  unpricedRuns: number;
  totalRuns: number;
}

export interface SeatCostSummary extends CostTotals {
  seatId: string;
}

export interface DayCostSummary extends CostTotals {
  date: string; // YYYY-MM-DD
}

export interface CostsAggregation {
  summary: CostTotals;
  bySeat: Record<string, SeatCostSummary>;
  byDay: Record<string, DayCostSummary>;
  records: CostRecord[];
  partial: boolean;
  scannedFrom?: string;
  scannedTo?: string;
}

export function getCostsDir(): string {
  const baseDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  return path.join(baseDir, 'costs');
}

function ensureCostsDir(): void {
  const dir = getCostsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLogPathForDate(isoDateString?: string): string {
  ensureCostsDir();
  const dateStr = (isoDateString ? new Date(isoDateString) : new Date())
    .toISOString()
    .split('T')[0];
  return path.join(getCostsDir(), `${dateStr}.jsonl`);
}

/**
 * Read cost records from a single file, gracefully skipping corrupted lines.
 */
export function readCostFile(filePath: string): CostRecord[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const records: CostRecord[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as CostRecord;
        if (parsed && parsed.runId && parsed.model) {
          records.push({
            ...parsed,
            costNanodollars:
              parsed.costNanodollars !== null && parsed.costNanodollars !== undefined
                ? String(parsed.costNanodollars)
                : null,
          });
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
 * Read cost records, gracefully skipping unparseable or corrupted lines.
 */
export function readAllCostRecords(fileFilter?: (fileName: string) => boolean): CostRecord[] {
  ensureCostsDir();
  const costsDir = getCostsDir();
  if (!fs.existsSync(costsDir)) return [];

  let files = fs
    .readdirSync(costsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  if (fileFilter) {
    files = files.filter(fileFilter);
  }

  const records: CostRecord[] = [];
  for (const file of files) {
    const filePath = path.join(costsDir, file);
    records.push(...readCostFile(filePath));
  }
  return records;
}

/**
 * Check if a receipt for (runId, model) is already recorded.
 */
export function isCostRecorded(runId: string, model: string): boolean {
  const records = readAllCostRecords();
  return records.some((r) => r.runId === runId && r.model === model);
}

/**
 * Check if any cost receipt exists for runId.
 */
export function hasCostReceiptsForRun(runId: string): boolean {
  const records = readAllCostRecords();
  return records.some((r) => r.runId === runId);
}

/**
 * Check if priced cost receipt exists for runId.
 */
export function hasPricedCostReceiptsForRun(runId: string): boolean {
  const receipts = getCostReceiptsForRun(runId);
  return receipts.some((r) => r.priced);
}

/**
 * Return deduplicated cost receipts for the specified runId, folded by (runId, model)
 * keeping the newest receipt per model matching the API costs deduplication semantics.
 */
export function getCostReceiptsForRun(runId: string): CostRecord[] {
  const records = readAllCostRecords().filter((r) => r.runId === runId);
  records.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const uniqueByModel = new Map<string, CostRecord>();
  for (const r of records) {
    if (!uniqueByModel.has(r.model)) {
      uniqueByModel.set(r.model, r);
    }
  }
  return Array.from(uniqueByModel.values());
}

/**
 * Return all model names that have cost receipts recorded for the specified runId.
 */
export function getRecordedModelsForRun(runId: string): Set<string> {
  const records = readAllCostRecords();
  const models = new Set<string>();
  for (const r of records) {
    if (r.runId === runId) {
      models.add(r.model);
    }
  }
  return models;
}

/**
 * Record a single cost record idempotently. If (runId, model) exists, returns existing record.
 * Throws if disk write fails.
 */
export function recordCostReceipt(record: CostRecord): CostRecord {
  if (isFenced() && process.env.AIBOSS_TEST_DISABLE_FENCE_GUARD !== '1') {
    throw new Error('[costs-ledger] Instance is fenced. Writes are barred.');
  }
  if (
    process.env.AIBOSS_TEST_FAIL_COST_APPEND === '1' ||
    (process.env.AIBOSS_TEST_FAIL_COST_MODEL &&
      process.env.AIBOSS_TEST_FAIL_COST_MODEL === record.model)
  ) {
    throw new Error(`Injected cost record failure for model ${record.model}`);
  }
  ensureCostsDir();
  if (isCostRecorded(record.runId, record.model)) {
    const existing = readAllCostRecords().find((r) => r.runId === record.runId && r.model === record.model);
    return existing ?? record;
  }

  const filePath = getLogPathForDate(record.ts);
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  return record;
}

/**
 * Record an array of model usage receipts from a completed run.
 * Idempotent: receipts with already-recorded (runId, model) are not duplicated.
 */
export function recordCostReceipts(
  seatId: string,
  runId: string,
  receipts: ModelReceipt[],
  timestampIso?: string
): CostRecord[] {
  const ts = timestampIso ?? new Date().toISOString();
  const recorded: CostRecord[] = [];

  for (const receipt of receipts) {
    const record: CostRecord = {
      ts,
      seatId,
      runId,
      model: receipt.model,
      inputTokens: receipt.inputTokens,
      cachedInputTokens: receipt.cachedInputTokens,
      cacheCreationTokens: receipt.cacheCreationTokens,
      outputTokens: receipt.outputTokens,
      costNanodollars: receipt.costNanodollars,
      priced: receipt.priced,
      source: 'claude-stream-json',
    };
    recordCostReceipt(record);
    recorded.push(record);
  }

  return recorded;
}

export { formatNanodollars } from './money-format';

function makeTotals(): CostTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costNanodollars: '0',
    formattedCostUsd: '$0.00',
    unpricedRuns: 0,
    totalRuns: 0,
  };
}

/**
 * Aggregate cost records by seat and by day within optional date ranges.
 * Features:
 * - Deduplicates in-memory by (runId, model) to prevent double counting.
 * - Exact bigint addition throughout.
 * - Does not double-count cacheCreationTokens in totalTokens.
 * - Limits records array returned to options.limit (default 50).
 */
export function getCostsAggregation(options?: {
  seat?: string;
  from?: string;
  to?: string;
  limit?: number;
}): CostsAggregation {
  const fromTime = options?.from ? new Date(options.from).getTime() : undefined;
  const toTime = options?.to ? new Date(options.to).getTime() : undefined;
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50));

  let fromUtcDateStr: string | undefined = undefined;
  if (options?.from) {
    const fromDate = new Date(options.from);
    fromDate.setUTCDate(fromDate.getUTCDate() - 3); // 3-day recovery buffer
    fromUtcDateStr = fromDate.toISOString().split('T')[0];
  }
  let toUtcDateStr: string | undefined = undefined;
  if (options?.to) {
    const toDate = new Date(options.to);
    toDate.setUTCDate(toDate.getUTCDate() + 3); // 3-day recovery buffer
    toUtcDateStr = toDate.toISOString().split('T')[0];
  }

  const costsDir = getCostsDir();
  if (!fs.existsSync(costsDir)) {
    return {
      summary: makeTotals(),
      bySeat: {},
      byDay: {},
      records: [],
      partial: false,
    };
  }

  const allFiles = fs
    .readdirSync(costsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .reverse(); // Newest dates first

  const uniqueRecordsMap = new Map<string, CostRecord>();
  let stoppedEarly = false;
  const scannedFileDates: string[] = [];

  for (const file of allFiles) {
    const fileDateStr = file.replace('.jsonl', '');
    if (toUtcDateStr && fileDateStr > toUtcDateStr) continue;
    if (fromUtcDateStr && fileDateStr < fromUtcDateStr) break;

    scannedFileDates.push(fileDateStr);
    const fileRecords = readCostFile(path.join(costsDir, file));
    // Sort descending by timestamp within the file
    fileRecords.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    for (const r of fileRecords) {
      if (options?.seat && r.seatId !== options.seat) continue;
      const rTime = new Date(r.ts).getTime();
      if (fromTime !== undefined && rTime < fromTime) continue;
      if (toTime !== undefined && rTime > toTime) continue;

      const key = `${r.runId}::${r.model}`;
      if (!uniqueRecordsMap.has(key)) {
        uniqueRecordsMap.set(key, r);
      }
    }

    if (uniqueRecordsMap.size >= limit && !options?.from) {
      stoppedEarly = true;
      break;
    }
  }

  const records = Array.from(uniqueRecordsMap.values());
  records.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const summary = makeTotals();
  const allRunIds = new Set<string>();
  const allUnpricedRunIds = new Set<string>();
  let totalNanoBigInt = 0n;

  interface SeatAccumulator {
    totals: CostTotals;
    runs: Set<string>;
    unpricedRunIds: Set<string>;
    nanoBig: bigint;
  }

  const bySeatMap = new Map<string, SeatAccumulator>();
  const byDayMap = new Map<string, SeatAccumulator>();

  for (const r of records) {
    const dateStr = r.ts.split('T')[0];
    allRunIds.add(r.runId);
    if (!r.priced || r.costNanodollars === null) {
      allUnpricedRunIds.add(r.runId);
    }

    // Update global tokens (Anthropic inputTokens already includes cacheCreationTokens)
    summary.inputTokens += r.inputTokens;
    summary.cachedInputTokens += r.cachedInputTokens;
    summary.cacheCreationTokens += r.cacheCreationTokens;
    summary.outputTokens += r.outputTokens;
    summary.totalTokens += r.inputTokens + r.cachedInputTokens + r.outputTokens;

    if (r.costNanodollars !== null && r.priced) {
      try {
        totalNanoBigInt += BigInt(r.costNanodollars);
      } catch {
        /* skip invalid bigint string */
      }
    }

    // Seat grouping
    let seatEntry = bySeatMap.get(r.seatId);
    if (!seatEntry) {
      seatEntry = {
        totals: makeTotals(),
        runs: new Set<string>(),
        unpricedRunIds: new Set<string>(),
        nanoBig: 0n,
      };
      bySeatMap.set(r.seatId, seatEntry);
    }
    seatEntry.runs.add(r.runId);
    if (!r.priced || r.costNanodollars === null) {
      seatEntry.unpricedRunIds.add(r.runId);
    }
    seatEntry.totals.inputTokens += r.inputTokens;
    seatEntry.totals.cachedInputTokens += r.cachedInputTokens;
    seatEntry.totals.cacheCreationTokens += r.cacheCreationTokens;
    seatEntry.totals.outputTokens += r.outputTokens;
    seatEntry.totals.totalTokens += r.inputTokens + r.cachedInputTokens + r.outputTokens;
    if (r.costNanodollars !== null && r.priced) {
      try {
        seatEntry.nanoBig += BigInt(r.costNanodollars);
      } catch {
        /* skip invalid bigint string */
      }
    }

    // Day grouping
    let dayEntry = byDayMap.get(dateStr);
    if (!dayEntry) {
      dayEntry = {
        totals: makeTotals(),
        runs: new Set<string>(),
        unpricedRunIds: new Set<string>(),
        nanoBig: 0n,
      };
      byDayMap.set(dateStr, dayEntry);
    }
    dayEntry.runs.add(r.runId);
    if (!r.priced || r.costNanodollars === null) {
      dayEntry.unpricedRunIds.add(r.runId);
    }
    dayEntry.totals.inputTokens += r.inputTokens;
    dayEntry.totals.cachedInputTokens += r.cachedInputTokens;
    dayEntry.totals.cacheCreationTokens += r.cacheCreationTokens;
    dayEntry.totals.outputTokens += r.outputTokens;
    dayEntry.totals.totalTokens += r.inputTokens + r.cachedInputTokens + r.outputTokens;
    if (r.costNanodollars !== null && r.priced) {
      try {
        dayEntry.nanoBig += BigInt(r.costNanodollars);
      } catch {
        /* skip invalid bigint string */
      }
    }
  }

  summary.totalRuns = allRunIds.size;
  summary.unpricedRuns = allUnpricedRunIds.size;
  summary.costNanodollars = totalNanoBigInt.toString();
  summary.formattedCostUsd = formatNanodollars(totalNanoBigInt);

  const bySeat: Record<string, SeatCostSummary> = {};
  for (const [seatId, entry] of bySeatMap.entries()) {
    entry.totals.totalRuns = entry.runs.size;
    entry.totals.unpricedRuns = entry.unpricedRunIds.size;
    entry.totals.costNanodollars = entry.nanoBig.toString();
    entry.totals.formattedCostUsd = formatNanodollars(entry.nanoBig);
    bySeat[seatId] = {
      seatId,
      ...entry.totals,
    };
  }

  const byDay: Record<string, DayCostSummary> = {};
  for (const [date, entry] of byDayMap.entries()) {
    entry.totals.totalRuns = entry.runs.size;
    entry.totals.unpricedRuns = entry.unpricedRunIds.size;
    entry.totals.costNanodollars = entry.nanoBig.toString();
    entry.totals.formattedCostUsd = formatNanodollars(entry.nanoBig);
    byDay[date] = {
      date,
      ...entry.totals,
    };
  }

  const scannedTo = scannedFileDates.length > 0 ? scannedFileDates[0] : undefined;
  const scannedFrom = scannedFileDates.length > 0 ? scannedFileDates[scannedFileDates.length - 1] : undefined;

  return {
    summary,
    bySeat,
    byDay,
    records: records.slice(0, limit),
    partial: stoppedEarly,
    scannedFrom,
    scannedTo,
  };
}

export interface SeatPeriodCost {
  seatId: string;
  formattedCostToday: string;
  formattedCostThisMonth: string;
  unpricedRunsThisMonth: number;
}

/**
 * Returns summary of cost today and this month for each seat.
 */
export function getSeatPeriodCosts(seatList?: string[]): SeatPeriodCost[] {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thisMonthPrefix = todayStr.slice(0, 7);

  const allRecords = readAllCostRecords((file) => file.startsWith(thisMonthPrefix));
  const uniqueRecordsMap = new Map<string, CostRecord>();
  for (const r of allRecords) {
    uniqueRecordsMap.set(`${r.runId}::${r.model}`, r);
  }

  const seatTodayMap = new Map<string, bigint>();
  const seatMonthMap = new Map<string, bigint>();
  const seatUnpricedMap = new Map<string, Set<string>>();

  for (const r of uniqueRecordsMap.values()) {
    const dateStr = r.ts.split('T')[0];
    const isToday = dateStr === todayStr;
    const isThisMonth = dateStr.startsWith(thisMonthPrefix);

    if (!r.priced || r.costNanodollars === null) {
      if (isToday || isThisMonth) {
        if (!seatUnpricedMap.has(r.seatId)) {
          seatUnpricedMap.set(r.seatId, new Set());
        }
        seatUnpricedMap.get(r.seatId)!.add(r.runId);
      }
      continue;
    }

    let nano = 0n;
    try {
      nano = BigInt(r.costNanodollars);
    } catch {
      continue;
    }

    if (isToday) {
      seatTodayMap.set(r.seatId, (seatTodayMap.get(r.seatId) ?? 0n) + nano);
    }
    if (isThisMonth) {
      seatMonthMap.set(r.seatId, (seatMonthMap.get(r.seatId) ?? 0n) + nano);
    }
  }

  const seatsToIterate = seatList && seatList.length > 0
    ? seatList
    : Array.from(new Set([...seatTodayMap.keys(), ...seatMonthMap.keys()]));

  return seatsToIterate.map((seatId) => {
    const todayBig = seatTodayMap.get(seatId) ?? 0n;
    const monthBig = seatMonthMap.get(seatId) ?? 0n;
    const unpriced = seatUnpricedMap.get(seatId)?.size ?? 0;
    return {
      seatId,
      formattedCostToday: formatNanodollars(todayBig),
      formattedCostThisMonth: formatNanodollars(monthBig),
      unpricedRunsThisMonth: unpriced,
    };
  });
}
