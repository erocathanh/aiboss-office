/**
 * costs-ledger.ts — Cost Ledger & Aggregation (A-2)
 *
 * Records model usage receipts and computes per-seat and per-day costs in
 * operations/data/costs/<YYYY-MM-DD>.jsonl.
 *
 * Features:
 * - Append-only JSONL storage.
 * - Idempotency by (runId, model) — duplicate records are not re-appended and not double-counted.
 * - Exact integer nanodollar arithmetic using money.ts.
 * - Unpriced run accounting (priced: false, costNanodollars: null).
 * - Aggregation by seat, by day, and date-range filters.
 */

import fs from 'node:fs';
import path from 'node:path';
import { formatUsdExact, unitsToCents } from './money';
import type { ModelReceipt } from './usage-receipt';

export interface CostRecord {
  ts: string; // ISO
  seatId: string;
  runId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  costNanodollars: number | null;
  priced: boolean;
  source: 'claude-stream-json';
}

export interface CostTotals {
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  totalTokens: number;
  costNanodollars: number;
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
}

const REPO_ROOT = process.cwd();
const COSTS_DIR = path.join(REPO_ROOT, 'operations', 'data', 'costs');

function ensureCostsDir(): void {
  if (!fs.existsSync(COSTS_DIR)) {
    fs.mkdirSync(COSTS_DIR, { recursive: true });
  }
}

function getLogPathForDate(isoDateString?: string): string {
  ensureCostsDir();
  const dateStr = (isoDateString ? new Date(isoDateString) : new Date())
    .toISOString()
    .split('T')[0];
  return path.join(COSTS_DIR, `${dateStr}.jsonl`);
}

/**
 * Read all cost records from operations/data/costs/*.jsonl
 */
export function readAllCostRecords(): CostRecord[] {
  ensureCostsDir();
  if (!fs.existsSync(COSTS_DIR)) return [];

  const files = fs
    .readdirSync(COSTS_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  const records: CostRecord[] = [];
  for (const file of files) {
    const filePath = path.join(COSTS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as CostRecord;
          if (parsed && parsed.runId && parsed.model) {
            records.push(parsed);
          }
        } catch {
          /* ignore corrupted lines */
        }
      }
    } catch {
      /* ignore read errors */
    }
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
 * Record a single cost record idempotently. If (runId, model) exists, returns existing record.
 */
export function recordCostReceipt(record: CostRecord): CostRecord {
  ensureCostsDir();
  if (isCostRecorded(record.runId, record.model)) {
    // Already recorded: return existing without appending
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
    recorded.push(recordCostReceipt(record));
  }

  return recorded;
}

/**
 * Format integer nanodollars to human USD string using money.ts.
 */
export function formatNanodollars(nanodollars: bigint | number): string {
  const big = typeof nanodollars === 'bigint' ? nanodollars : BigInt(Math.round(nanodollars));
  return formatUsdExact(unitsToCents(big));
}

/**
 * Query and aggregate costs with optional seat, from, to filters.
 */
export function getCostsAggregation(options?: {
  seat?: string;
  from?: string; // ISO string
  to?: string; // ISO string
}): CostsAggregation {
  const rawRecords = readAllCostRecords();

  // 1. Deduplicate by runId + model
  const deduplicated = new Map<string, CostRecord>();
  for (const r of rawRecords) {
    const key = `${r.runId}::${r.model}`;
    // Keep first or latest; here we set it
    deduplicated.set(key, r);
  }

  let records = Array.from(deduplicated.values());

  // 2. Filters
  if (options?.seat) {
    records = records.filter((r) => r.seatId === options.seat);
  }
  if (options?.from) {
    const fromTime = new Date(options.from).getTime();
    records = records.filter((r) => new Date(r.ts).getTime() >= fromTime);
  }
  if (options?.to) {
    const toTime = new Date(options.to).getTime();
    records = records.filter((r) => new Date(r.ts).getTime() <= toTime);
  }

  // 3. Compute Totals Helper
  function makeTotals(): CostTotals {
    return {
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costNanodollars: 0,
      formattedCostUsd: '$0.00',
      unpricedRuns: 0,
      totalRuns: 0,
    };
  }

  let totalNanoBigInt = 0n;
  const summary = makeTotals();

  const bySeatMap = new Map<string, { totals: CostTotals; runs: Set<string>; unpricedRunIds: Set<string>; nanoBig: bigint }>();
  const byDayMap = new Map<string, { totals: CostTotals; runs: Set<string>; unpricedRunIds: Set<string>; nanoBig: bigint }>();

  const allRunIds = new Set<string>();
  const allUnpricedRunIds = new Set<string>();

  for (const r of records) {
    const dateStr = r.ts.split('T')[0];
    allRunIds.add(r.runId);
    if (!r.priced || r.costNanodollars === null) {
      allUnpricedRunIds.add(r.runId);
    }

    // Update global
    summary.inputTokens += r.inputTokens;
    summary.cachedInputTokens += r.cachedInputTokens;
    summary.cacheCreationTokens += r.cacheCreationTokens;
    summary.outputTokens += r.outputTokens;
    summary.totalTokens += r.inputTokens + r.cachedInputTokens + r.cacheCreationTokens + r.outputTokens;

    if (r.costNanodollars !== null && r.priced) {
      totalNanoBigInt += BigInt(r.costNanodollars);
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
    seatEntry.totals.totalTokens += r.inputTokens + r.cachedInputTokens + r.cacheCreationTokens + r.outputTokens;
    if (r.costNanodollars !== null && r.priced) {
      seatEntry.nanoBig += BigInt(r.costNanodollars);
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
    dayEntry.totals.totalTokens += r.inputTokens + r.cachedInputTokens + r.cacheCreationTokens + r.outputTokens;
    if (r.costNanodollars !== null && r.priced) {
      dayEntry.nanoBig += BigInt(r.costNanodollars);
    }
  }

  summary.totalRuns = allRunIds.size;
  summary.unpricedRuns = allUnpricedRunIds.size;
  summary.costNanodollars = Number(totalNanoBigInt);
  summary.formattedCostUsd = formatNanodollars(totalNanoBigInt);

  const bySeat: Record<string, SeatCostSummary> = {};
  for (const [seatId, entry] of bySeatMap.entries()) {
    entry.totals.totalRuns = entry.runs.size;
    entry.totals.unpricedRuns = entry.unpricedRunIds.size;
    entry.totals.costNanodollars = Number(entry.nanoBig);
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
    entry.totals.costNanodollars = Number(entry.nanoBig);
    entry.totals.formattedCostUsd = formatNanodollars(entry.nanoBig);
    byDay[date] = {
      date,
      ...entry.totals,
    };
  }

  return {
    summary,
    bySeat,
    byDay,
    records,
  };
}

/**
 * Convenient helper for Settings UI: Cost today and this month per seat.
 */
export function getSeatPeriodCosts(seatIds: string[]): Array<{
  seatId: string;
  costTodayNanodollars: number;
  formattedCostToday: string;
  costThisMonthNanodollars: number;
  formattedCostThisMonth: string;
  unpricedRunsToday: number;
  unpricedRunsThisMonth: number;
}> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const todayAgg = getCostsAggregation({ from: `${todayStr}T00:00:00.000Z` });
  const monthAgg = getCostsAggregation({ from: startOfMonth });

  return seatIds.map((seatId) => {
    const todaySeat = todayAgg.bySeat[seatId];
    const monthSeat = monthAgg.bySeat[seatId];

    return {
      seatId,
      costTodayNanodollars: todaySeat?.costNanodollars ?? 0,
      formattedCostToday: todaySeat?.formattedCostUsd ?? '$0.00',
      costThisMonthNanodollars: monthSeat?.costNanodollars ?? 0,
      formattedCostThisMonth: monthSeat?.formattedCostUsd ?? '$0.00',
      unpricedRunsToday: todaySeat?.unpricedRuns ?? 0,
      unpricedRunsThisMonth: monthSeat?.unpricedRuns ?? 0,
    };
  });
}
