/**
 * runs-ledger.ts — Run and Wakeup Ledger (A-1)
 *
 * Appends and tracks wake requests and execution runs in operations/data/runs/<YYYY-MM-DD>.jsonl.
 * Implements:
 * - Append-only JSONL logging.
 * - Sliding-window idempotency deduplication (seatId + prompt, 60s sliding window).
 * - Process-aware restart recovery (checks PID liveness, expires old queued wakes).
 * - Safe error handling (throws on append failure for 500 propagation).
 * - Finite errorKind codes (sigkill, timeout, exit_nonzero, result_error, spawn_failed, orphaned).
 * - Efficient date-bounded reverse querying for runs and wakes with multi-day state folding.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  getNormalizedUsageFromRaw,
  type NormalizedUsage,
} from '@/lib/usage-receipt';
import {
  hasPricedCostReceiptsForRun,
  getRecordedModelsForRun,
  recordCostReceipt,
} from '@/lib/costs-ledger';

export type RunErrorKind =
  | 'sigkill'
  | 'timeout'
  | 'exit_nonzero'
  | 'result_error'
  | 'spawn_failed'
  | 'orphaned';

export interface WakeRecord {
  type: 'wake';
  wakeId: string;
  seatId: string;
  source: 'app' | 'bell' | 'schedule' | 'terminal';
  requestedAt: string; // ISO
  idempotencyKey: string;
  status: 'queued' | 'claimed' | 'skipped' | 'expired';
  claimedAt?: string;
  runId?: string;
  queueId?: string;
  reason?: string;
  updatedAt?: string;
}

export interface RunRecord {
  type: 'run';
  runId: string;
  wakeId?: string;
  seatId: string;
  sessionId?: string;
  startedAt: string; // ISO
  finishedAt?: string;
  status: 'running' | 'finished' | 'failed' | 'timeout' | 'killed';
  exitCode?: number | null;
  resumeCmd?: string;
  errorKind?: RunErrorKind;
  attempt?: number;
  pid?: number;
  costStatus?: 'recorded' | 'pending' | 'unpriced';
  rawUsage?: NormalizedUsage[] | null;
  updatedAt?: string;
}

export type LedgerRecord = WakeRecord | RunRecord;

export function getRunsDir(): string {
  const baseDir = process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), 'operations', 'data');
  return path.join(baseDir, 'runs');
}

function ensureRunsDir(): void {
  const dir = getRunsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate an ID in the format prefix-YYYYMMDD-HHMMSS-<6 hex>.
 */
export function generateRunOrWakeId(prefix: 'wake' | 'run'): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex');
  return `${prefix}-${yyyy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
}

/**
 * Compute semantic idempotency key: hash of seatId + normalized content.
 * Does NOT bucket by fixed minutes — sliding window comparison is handled at query time.
 * Always returns a 32-char hex SHA-256 digest (never raw text).
 */
export function computeIdempotencyKey(seatId: string, content: string): string {
  const raw = `${seatId.trim()}::${content.trim()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Compute custom idempotency key from caller-provided khoa.
 * Always hashes with prefix to prevent leaking caller text into logs/APIs.
 */
export function computeCustomIdempotencyKey(seatId: string, khoa: string): string {
  const raw = `custom::${seatId.trim()}::${khoa.trim()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Sanitize a wake record for external exposure.
 * Ensures any legacy custom: plaintext key is converted to a 32-char SHA-256 hash.
 */
export function sanitizeWake(wake: WakeRecord): WakeRecord {
  if (!wake) return wake;
  let key = wake.idempotencyKey;
  if (key && key.startsWith('custom:')) {
    key = computeCustomIdempotencyKey(wake.seatId, key.slice(7));
  }
  const sanitized: WakeRecord = {
    type: 'wake',
    wakeId: wake.wakeId,
    seatId: wake.seatId,
    source: wake.source,
    requestedAt: wake.requestedAt,
    idempotencyKey: key,
    status: wake.status,
    ...(wake.claimedAt ? { claimedAt: wake.claimedAt } : {}),
    ...(wake.runId ? { runId: wake.runId } : {}),
    ...(wake.queueId ? { queueId: wake.queueId } : {}),
    ...(wake.reason ? { reason: wake.reason } : {}),
    ...(wake.updatedAt ? { updatedAt: wake.updatedAt } : {}),
  };
  return sanitized;
}

/**
 * Sanitize a run record for external API exposure.
 * Explicit schema whitelist — strips rawUsage completely and excludes any unknown/legacy properties.
 */
export function sanitizeRun(run: MergedRunInfo): MergedRunInfo {
  const sanitized: MergedRunInfo = {
    type: 'run',
    runId: run.runId,
    seatId: run.seatId,
    startedAt: run.startedAt,
    status: run.status,
    ...(run.wakeId ? { wakeId: run.wakeId } : {}),
    ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    ...(run.exitCode !== undefined ? { exitCode: run.exitCode } : {}),
    ...(run.resumeCmd ? { resumeCmd: run.resumeCmd } : {}),
    ...(run.errorKind ? { errorKind: run.errorKind } : {}),
    ...(run.attempt !== undefined ? { attempt: run.attempt } : {}),
    ...(run.pid !== undefined ? { pid: run.pid } : {}),
    ...(run.costStatus ? { costStatus: run.costStatus } : {}),
    ...(run.updatedAt ? { updatedAt: run.updatedAt } : {}),
    ...(run.wake ? { wake: sanitizeWake(run.wake) } : {}),
  };
  return sanitized;
}

/**
 * Sanitize rawUsage at storage boundaries (recordRun, updateRun, appendRecord).
 * Guarantees that no raw strings, prompt text, result, or error arrays can ever be written to disk.
 */
export function sanitizeRawUsage(
  rawUsage: unknown
): NormalizedUsage[] | null | undefined {
  if (rawUsage === null) return null;
  if (rawUsage === undefined) return undefined;
  const normalized = getNormalizedUsageFromRaw(rawUsage);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Fold a single run record, removing rawUsage if status is recorded or unpriced, or if rawUsage is null.
 */
export function foldRunRecord(record: RunRecord): RunRecord {
  const res = { ...record };
  if (
    res.rawUsage === null ||
    res.costStatus === 'recorded' ||
    res.costStatus === 'unpriced'
  ) {
    delete res.rawUsage;
  }
  return res;
}

/**
 * Merge older and newer run records respecting tombstones and state transitions.
 * When newer has rawUsage === null or costStatus === 'recorded' | 'unpriced',
 * rawUsage is deleted from the merged record.
 */
export function mergeRunRecordPair(older: RunRecord, newer: RunRecord): RunRecord {
  const merged: RunRecord = { ...older, ...newer };
  if (
    newer.rawUsage === null ||
    newer.costStatus === 'recorded' ||
    newer.costStatus === 'unpriced' ||
    merged.costStatus === 'recorded' ||
    merged.costStatus === 'unpriced'
  ) {
    delete merged.rawUsage;
  }
  return merged;
}

function getLogPathForDate(isoDateString?: string): string {
  ensureRunsDir();
  const dateStr = (isoDateString ? new Date(isoDateString) : new Date())
    .toISOString()
    .split('T')[0];
  return path.join(getRunsDir(), `${dateStr}.jsonl`);
}

/**
 * Appends record to ledger file. Throws on error to prevent silent data loss.
 * Sanitizes rawUsage before write to guarantee no raw strings enter JSONL files.
 */
function appendRecord(record: LedgerRecord): void {
  if (process.env.AIBOSS_TEST_FAIL_APPEND === '1') {
    throw new Error('Injected ledger append failure for testing');
  }
  if (record.type === 'run' && record.rawUsage !== undefined && record.rawUsage !== null) {
    record.rawUsage = sanitizeRawUsage(record.rawUsage);
  }
  ensureRunsDir();
  const filePath = getLogPathForDate();
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
}

/**
 * Helper to obtain the effective event timestamp in epoch milliseconds.
 */
function getRecordTimestamp(r: LedgerRecord): number {
  if (r.type === 'run') {
    return new Date(r.updatedAt || r.finishedAt || r.startedAt).getTime();
  }
  return new Date(r.updatedAt || r.claimedAt || r.requestedAt).getTime();
}

/**
 * Record a new wake request in the runs ledger.
 */
export function recordWake(wake: Omit<WakeRecord, 'type'>): WakeRecord {
  const full: WakeRecord = {
    type: 'wake',
    updatedAt: wake.requestedAt,
    ...wake,
  };
  appendRecord(full);
  return full;
}

/**
 * Append an updated state for a wake request.
 */
export function updateWake(wakeId: string, patch: Partial<WakeRecord>): WakeRecord | null {
  const current = getWake(wakeId);
  if (!current) return null;
  const updated: WakeRecord = {
    ...current,
    ...patch,
    type: 'wake',
    wakeId,
    updatedAt: new Date().toISOString(),
  };
  appendRecord(updated);
  return updated;
}

/**
 * Record a new run in the runs ledger.
 */
export function recordRun(run: Omit<RunRecord, 'type'>): RunRecord {
  const full: RunRecord = {
    type: 'run',
    attempt: 1,
    costStatus: 'pending',
    updatedAt: run.startedAt,
    ...run,
    ...(run.rawUsage !== undefined ? { rawUsage: sanitizeRawUsage(run.rawUsage) } : {}),
  };
  appendRecord(full);
  return full;
}

/**
 * Append an updated state for an active run.
 */
export function updateRun(runId: string, patch: Partial<RunRecord>): RunRecord | null {
  const current = getRun(runId);
  if (!current) return null;
  const updated: RunRecord = {
    ...current,
    ...patch,
    type: 'run',
    runId,
    updatedAt: new Date().toISOString(),
  };
  if (
    patch.rawUsage === null ||
    patch.costStatus === 'recorded' ||
    patch.costStatus === 'unpriced'
  ) {
    updated.rawUsage = null;
  } else if (patch.rawUsage !== undefined) {
    updated.rawUsage = sanitizeRawUsage(patch.rawUsage);
  } else if (current.rawUsage !== undefined && updated.rawUsage !== null) {
    updated.rawUsage = sanitizeRawUsage(current.rawUsage);
  }
  appendRecord(updated);
  return updated;
}

/**
 * Reads records from files, skipping corrupted lines gracefully.
 */
export function readRunFiles(fileFilter?: (fileName: string) => boolean): LedgerRecord[] {
  ensureRunsDir();
  const runsDir = getRunsDir();
  if (!fs.existsSync(runsDir)) return [];
  let files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.jsonl')).sort();
  if (fileFilter) {
    files = files.filter(fileFilter);
  }

  const records: LedgerRecord[] = [];
  for (const file of files) {
    const filePath = path.join(runsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as LedgerRecord;
          if (parsed && (parsed.type === 'wake' || parsed.type === 'run')) {
            records.push(parsed);
          }
        } catch {
          /* skip corrupted line gracefully */
        }
      }
    } catch {
      /* skip unreadable file gracefully */
    }
  }
  return records;
}

/**
 * Find recent wake by idempotencyKey within sliding window (default 60s).
 * Evaluates true elapsed milliseconds between now and wake.requestedAt.
 * Excludes expired and skipped wakes so previously rejected attempts do not block valid retries.
 */
export function findRecentWakeByIdempotencyKey(
  seatId: string,
  idempotencyKey: string,
  maxAgeMs = 60_000,
  nowMs = Date.now()
): WakeRecord | null {
  const records = readRunFiles();

  // Fold wakes to latest status
  const wakesById = new Map<string, WakeRecord>();
  for (const r of records) {
    if (r.type === 'wake') {
      const existing = wakesById.get(r.wakeId);
      if (!existing || getRecordTimestamp(r) >= getRecordTimestamp(existing)) {
        wakesById.set(r.wakeId, { ...existing, ...r });
      }
    }
  }

  for (const wake of wakesById.values()) {
    if (wake.seatId === seatId && wake.idempotencyKey === idempotencyKey) {
      const reqTime = new Date(wake.requestedAt).getTime();
      const age = nowMs - reqTime;
      // Sliding window match: requested within [0, maxAgeMs], not expired, and not skipped
      if (age >= 0 && age <= maxAgeMs && wake.status !== 'expired' && wake.status !== 'skipped') {
        return wake;
      }
    }
  }
  return null;
}

/**
 * Get wake by wakeId (resolves to latest folded event).
 */
export function getWake(wakeId: string): WakeRecord | null {
  const records = readRunFiles();
  let found: WakeRecord | null = null;
  for (const r of records) {
    if (r.type === 'wake' && r.wakeId === wakeId) {
      if (found) {
        found = Object.assign({}, found, r);
      } else {
        found = r;
      }
    }
  }
  return found ? sanitizeWake(found) : null;
}

/**
 * Get run by runId (resolves to latest folded event).
 */
export function getRun(runId: string): RunRecord | null {
  const records = readRunFiles();
  let found: RunRecord | null = null;
  for (const r of records) {
    if (r.type === 'run' && r.runId === runId) {
      if (found) {
        found = mergeRunRecordPair(found, r);
      } else {
        found = foldRunRecord(r);
      }
    }
  }
  return found;
}

export interface MergedRunInfo extends RunRecord {
  wake?: WakeRecord;
}

export interface GetRunsResult {
  runs: MergedRunInfo[];
  total: number;
  partial: boolean;
  scannedFrom?: string;
  scannedTo?: string;
}

/**
 * Query runs merged with corresponding wake data and query metadata.
 * Features:
 * - Scans in reverse chronological order (newest dates first).
 * - Folds multi-day runs preserving the latest event by timestamp (never overwrites newer with older).
 * - Correctly normalizes ISO date bounds to UTC dates for file partitioning with 3-day recovery buffer.
 * - Sanitizes legacy custom: keys in embedded wakes to 32-char SHA-256 hashes.
 * - Safely stops early once limit matching runs have been gathered without violating startedAt ordering.
 */
export function getRunsWithMetadata(options?: {
  seat?: string;
  from?: string;
  to?: string;
  limit?: number;
}): GetRunsResult {
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50));
  const runsDir = getRunsDir();
  if (!fs.existsSync(runsDir)) {
    return { runs: [], total: 0, partial: false };
  }

  const fromTime = options?.from ? new Date(options.from).getTime() : undefined;
  const toTime = options?.to ? new Date(options.to).getTime() : undefined;

  // Align dates to UTC YYYY-MM-DD with 3-day recovery buffer
  let fromUtcDateStr: string | undefined = undefined;
  if (options?.from) {
    const fromDate = new Date(options.from);
    fromDate.setUTCDate(fromDate.getUTCDate() - 3);
    fromUtcDateStr = fromDate.toISOString().split('T')[0];
  }
  let toUtcDateStr: string | undefined = undefined;
  if (options?.to) {
    const toDate = new Date(options.to);
    toDate.setUTCDate(toDate.getUTCDate() + 3);
    toUtcDateStr = toDate.toISOString().split('T')[0];
  }

  const allFiles = fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .reverse(); // Newest dates first

  const wakesById = new Map<string, WakeRecord>();
  const runsById = new Map<string, RunRecord>();
  let stoppedEarly = false;
  const scannedFileDates: string[] = [];

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const fileDateStr = file.replace('.jsonl', '');
    if (toUtcDateStr && fileDateStr > toUtcDateStr) continue;
    if (fromUtcDateStr && fileDateStr < fromUtcDateStr) break;

    scannedFileDates.push(fileDateStr);
    const records = readRunFiles((f) => f === file);
    for (const r of records) {
      if (r.type === 'wake') {
        const existing = wakesById.get(r.wakeId);
        if (!existing) {
          wakesById.set(r.wakeId, r);
        } else {
          // Keep the newer event by timestamp; merge to retain earlier metadata
          const rTime = getRecordTimestamp(r);
          const existTime = getRecordTimestamp(existing);
          if (rTime >= existTime) {
            wakesById.set(r.wakeId, { ...existing, ...r });
          } else {
            wakesById.set(r.wakeId, { ...r, ...existing });
          }
        }
      } else if (r.type === 'run') {
        const existing = runsById.get(r.runId);
        if (!existing) {
          runsById.set(r.runId, foldRunRecord(r));
        } else {
          // Keep the newer event by timestamp; merge to retain earlier metadata
          const rTime = getRecordTimestamp(r);
          const existTime = getRecordTimestamp(existing);
          if (rTime >= existTime) {
            runsById.set(r.runId, mergeRunRecordPair(existing, r));
          } else {
            runsById.set(r.runId, mergeRunRecordPair(r, existing));
          }
        }
      }
    }

    // Check if we can safely stop early based on startedAt ordering
    if (!options?.from) {
      const candidateMatchingRuns = Array.from(runsById.values()).filter((r) => {
        if (options?.seat && r.seatId !== options.seat) return false;
        const started = new Date(r.startedAt).getTime();
        if (fromTime !== undefined && started < fromTime) return false;
        if (toTime !== undefined && started > toTime) return false;
        return true;
      });
      candidateMatchingRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

      if (candidateMatchingRuns.length >= limit) {
        const nextFile = allFiles[i + 1];
        if (!nextFile) {
          break;
        }
        const nextFileDateStr = nextFile.replace('.jsonl', '');
        const nextFileEndMs = new Date(nextFileDateStr + 'T23:59:59.999Z').getTime();
        const kthStartedAtMs = new Date(candidateMatchingRuns[limit - 1].startedAt).getTime();
        if (kthStartedAtMs > nextFileEndMs) {
          stoppedEarly = true;
          break;
        }
      }
    }
  }

  let runs = Array.from(runsById.values());

  if (options?.seat) {
    runs = runs.filter((r) => r.seatId === options.seat);
  }
  if (fromTime !== undefined) {
    runs = runs.filter((r) => new Date(r.startedAt).getTime() >= fromTime);
  }
  if (toTime !== undefined) {
    runs = runs.filter((r) => new Date(r.startedAt).getTime() <= toTime);
  }

  // Sort descending by startedAt
  runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const slicedRuns = runs.slice(0, limit).map((run) => {
    const rawWake = run.wakeId ? wakesById.get(run.wakeId) : undefined;
    const wake = rawWake ? sanitizeWake(rawWake) : undefined;
    const runInfo: MergedRunInfo = {
      ...run,
      ...(wake ? { wake } : {}),
    };
    return sanitizeRun(runInfo);
  });

  const scannedTo = scannedFileDates.length > 0 ? scannedFileDates[0] : undefined;
  const scannedFrom = scannedFileDates.length > 0 ? scannedFileDates[scannedFileDates.length - 1] : undefined;

  return {
    runs: slicedRuns,
    total: slicedRuns.length,
    partial: stoppedEarly,
    scannedFrom,
    scannedTo,
  };
}

/**
 * Query runs merged with corresponding wake data.
 * Backwards compatible helper returning MergedRunInfo[] array.
 */
export function getRuns(options?: {
  seat?: string;
  from?: string;
  to?: string;
  limit?: number;
}): MergedRunInfo[] {
  return getRunsWithMetadata(options).runs;
}

/**
 * Check if a process is still alive using signal 0.
 */
export function isProcessAlive(pid: number | undefined | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    return code === 'EPERM'; // Process exists but we do not have permission to signal it
  }
}

/**
 * Reconcile runs with costStatus === 'pending'.
 * Scans all runs, attempts to record pending costs into costs-ledger using stored rawUsage,
 * and updates run's costStatus to 'recorded' or 'unpriced'.
 * Returns count of reconciled runs.
 */
export function reconcilePendingCosts(): number {
  const records = readRunFiles();
  const runsById = new Map<string, RunRecord>();

  for (const r of records) {
    if (r.type === 'run') {
      const existing = runsById.get(r.runId);
      if (!existing) {
        runsById.set(r.runId, foldRunRecord(r));
      } else if (getRecordTimestamp(r) >= getRecordTimestamp(existing)) {
        runsById.set(r.runId, mergeRunRecordPair(existing, r));
      } else {
        runsById.set(r.runId, mergeRunRecordPair(r, existing));
      }
    }
  }

  let reconciledCount = 0;

  for (const run of runsById.values()) {
    // Only reconcile finished/failed runs, not runs currently in-flight
    if (run.status === 'running') continue;

    if (run.costStatus === 'pending') {
      const timestampIso = run.finishedAt || run.updatedAt || new Date().toISOString();
      const recordedModels = getRecordedModelsForRun(run.runId);

      // Check expected receipts from rawUsage
      const expectedReceipts = getNormalizedUsageFromRaw(run.rawUsage);

      if (expectedReceipts.length > 0) {
        let allModelsRecorded = true;
        for (const receipt of expectedReceipts) {
          if (!recordedModels.has(receipt.model)) {
            try {
              recordCostReceipt({
                ts: timestampIso,
                seatId: run.seatId,
                runId: run.runId,
                model: receipt.model,
                inputTokens: receipt.inputTokens,
                cachedInputTokens: receipt.cachedInputTokens,
                cacheCreationTokens: receipt.cacheCreationTokens,
                outputTokens: receipt.outputTokens,
                costNanodollars: receipt.costNanodollars,
                priced: receipt.priced,
                source: 'claude-stream-json',
              });
              recordedModels.add(receipt.model);
            } catch (err: unknown) {
              allModelsRecorded = false;
              console.error(`[runs-ledger] Reconcile cost failed for model ${receipt.model} in run ${run.runId}:`, err);
            }
          }
        }

        // CRITICAL (Hermes Finding B & Item 2):
        // Only mark recorded if ALL expected models have been successfully recorded!
        if (allModelsRecorded && expectedReceipts.every((r) => recordedModels.has(r.model))) {
          // Tombstone rawUsage with null to wipe it from ledger and readers
          updateRun(run.runId, { costStatus: 'recorded', rawUsage: null });
          reconciledCount++;
        }
      } else {
        // No rawUsage available to price (e.g. unknown model or fallback)
        // Check if any cost receipt exists for runId
        if (recordedModels.size > 0) {
          const hasPriced = hasPricedCostReceiptsForRun(run.runId);
          updateRun(run.runId, { costStatus: hasPriced ? 'recorded' : 'unpriced', rawUsage: null });
          reconciledCount++;
        } else {
          try {
            recordCostReceipt({
              ts: timestampIso,
              seatId: run.seatId,
              runId: run.runId,
              model: 'unknown',
              inputTokens: 0,
              cachedInputTokens: 0,
              cacheCreationTokens: 0,
              outputTokens: 0,
              costNanodollars: null,
              priced: false,
              source: 'claude-stream-json',
            });
            updateRun(run.runId, { costStatus: 'unpriced', rawUsage: null });
            reconciledCount++;
          } catch (err: unknown) {
            console.error(`[runs-ledger] Fallback unpriced cost failed for run ${run.runId}:`, err);
            // Keep pending so consumer / reconciler will retry
          }
        }
      }
    }
  }

  return reconciledCount;
}

/**
 * On runner startup: recover orphaned running runs, expire old queued wakes, and reconcile pending costs.
 * Only marks running runs as orphaned if their PID is no longer alive.
 */
export function recoverOrphanedRuns(nowMs = Date.now()): { orphanedRuns: number; expiredWakes: number } {
  // Reconcile pending costs before evaluating orphans
  try {
    reconcilePendingCosts();
  } catch {
    /* ignore */
  }

  const records = readRunFiles();

  const wakesById = new Map<string, WakeRecord>();
  const runsById = new Map<string, RunRecord>();

  for (const r of records) {
    if (r.type === 'wake') {
      const existing = wakesById.get(r.wakeId);
      if (!existing || getRecordTimestamp(r) >= getRecordTimestamp(existing)) {
        wakesById.set(r.wakeId, { ...existing, ...r });
      }
    } else if (r.type === 'run') {
      const existing = runsById.get(r.runId);
      if (!existing) {
        runsById.set(r.runId, foldRunRecord(r));
      } else if (getRecordTimestamp(r) >= getRecordTimestamp(existing)) {
        runsById.set(r.runId, mergeRunRecordPair(existing, r));
      } else {
        runsById.set(r.runId, mergeRunRecordPair(r, existing));
      }
    }
  }

  let orphanedRuns = 0;
  let expiredWakes = 0;

  // 1. Recover runs marked running on restart IF process is dead
  for (const run of runsById.values()) {
    if (run.status === 'running') {
      const alive = isProcessAlive(run.pid);
      if (!alive) {
        const orphanTime = new Date(nowMs).toISOString();
        const hasPriced = hasPricedCostReceiptsForRun(run.runId);
        let orphanCostStatus: 'recorded' | 'pending' | 'unpriced' = hasPriced ? 'recorded' : 'unpriced';
        if (!hasPriced) {
          try {
            recordCostReceipt({
              ts: orphanTime,
              seatId: run.seatId,
              runId: run.runId,
              model: 'unknown',
              inputTokens: 0,
              cachedInputTokens: 0,
              cacheCreationTokens: 0,
              outputTokens: 0,
              costNanodollars: null,
              priced: false,
              source: 'claude-stream-json',
            });
            orphanCostStatus = 'unpriced';
          } catch (err: unknown) {
            console.error(`[runs-ledger] Failed to record fallback cost receipt for orphaned run ${run.runId}:`, err);
            // CRITICAL (Hermes Item 3): Keep pending so reconciler can retry later
            orphanCostStatus = 'pending';
          }
        }
        updateRun(run.runId, {
          status: 'failed',
          finishedAt: orphanTime,
          errorKind: 'orphaned',
          costStatus: orphanCostStatus,
          rawUsage: orphanCostStatus === 'pending' ? (sanitizeRawUsage(run.rawUsage) ?? null) : null,
          updatedAt: orphanTime,
        });
        orphanedRuns++;
      }
    }
  }

  // 2. Expire queued wakes older than 3 minutes (aligning with queue TTL)
  const THREE_MINUTES_MS = 3 * 60 * 1000;
  for (const wake of wakesById.values()) {
    if (wake.status === 'queued') {
      const age = nowMs - new Date(wake.requestedAt).getTime();
      if (age > THREE_MINUTES_MS) {
        const expireTime = new Date(nowMs).toISOString();
        updateWake(wake.wakeId, {
          status: 'expired',
          reason: 'queued_ttl_exceeded',
          updatedAt: expireTime,
        });
        expiredWakes++;
      }
    }
  }

  return { orphanedRuns, expiredWakes };
}
