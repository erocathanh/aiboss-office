/**
 * runs-ledger.ts — Run and Wakeup Ledger (A-1)
 *
 * Appends and tracks wake requests and execution runs in operations/data/runs/<YYYY-MM-DD>.jsonl.
 * Implements:
 * - Append-only JSONL logging.
 * - Idempotency key deduplication (seatId + prompt + 60s window).
 * - Safe restart recovery (orphaned running -> failed, expired queued > 10m).
 * - Queries for runs and wakes.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
  reason?: string;
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
  errorKind?: string;
  attempt?: number;
}

export type LedgerRecord = WakeRecord | RunRecord;

const REPO_ROOT = process.cwd();
const RUNS_DIR = path.join(REPO_ROOT, 'operations', 'data', 'runs');

function ensureRunsDir(): void {
  if (!fs.existsSync(RUNS_DIR)) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
  }
}

/**
 * Generate an ID in the format YYYYMMDD-HHMMSS-<6 hex>.
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
 * Compute idempotency key: hash of seatId + content + 60-second window.
 */
export function computeIdempotencyKey(seatId: string, content: string, nowMs = Date.now()): string {
  const windowIndex = Math.floor(nowMs / 60_000);
  const raw = `${seatId.trim()}::${content.trim()}::${windowIndex}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function getLogPathForDate(isoDateString?: string): string {
  ensureRunsDir();
  const dateStr = (isoDateString ? new Date(isoDateString) : new Date())
    .toISOString()
    .split('T')[0];
  return path.join(RUNS_DIR, `${dateStr}.jsonl`);
}

function appendRecord(record: LedgerRecord): void {
  try {
    const filePath = getLogPathForDate();
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    /* ignore ledger append failures to preserve main loop */
  }
}

/**
 * Record a new wake request in the runs ledger.
 */
export function recordWake(wake: Omit<WakeRecord, 'type'>): WakeRecord {
  const full: WakeRecord = {
    type: 'wake',
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
    ...run,
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
  };
  appendRecord(updated);
  return updated;
}

/**
 * Scan recent files in operations/data/runs to find recent records.
 */
function readAllRunFiles(): LedgerRecord[] {
  ensureRunsDir();
  if (!fs.existsSync(RUNS_DIR)) return [];
  const files = fs.readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  const records: LedgerRecord[] = [];
  for (const file of files) {
    const filePath = path.join(RUNS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as LedgerRecord;
          records.push(parsed);
        } catch {
          /* skip corrupted line */
        }
      }
    } catch {
      /* skip read error */
    }
  }
  return records;
}

/**
 * Find recent wake by idempotencyKey within window (default 60s).
 */
export function findRecentWakeByIdempotencyKey(
  seatId: string,
  idempotencyKey: string,
  maxAgeMs = 60_000
): WakeRecord | null {
  const records = readAllRunFiles();
  const now = Date.now();

  // Fold wakes to latest status
  const wakesById = new Map<string, WakeRecord>();
  for (const r of records) {
    if (r.type === 'wake') {
      wakesById.set(r.wakeId, r);
    }
  }

  for (const wake of wakesById.values()) {
    if (wake.seatId === seatId && wake.idempotencyKey === idempotencyKey) {
      const age = now - new Date(wake.requestedAt).getTime();
      if (age <= maxAgeMs && (wake.status === 'queued' || wake.status === 'claimed')) {
        return wake;
      }
    }
  }
  return null;
}

/**
 * Get wake by wakeId (resolves to latest event).
 */
export function getWake(wakeId: string): WakeRecord | null {
  const records = readAllRunFiles();
  let found: WakeRecord | null = null;
  for (const r of records) {
    if (r.type === 'wake' && r.wakeId === wakeId) {
      found = r;
    }
  }
  return found;
}

/**
 * Get run by runId (resolves to latest event).
 */
export function getRun(runId: string): RunRecord | null {
  const records = readAllRunFiles();
  let found: RunRecord | null = null;
  for (const r of records) {
    if (r.type === 'run' && r.runId === runId) {
      found = r;
    }
  }
  return found;
}

export interface MergedRunInfo extends RunRecord {
  wake?: WakeRecord;
}

/**
 * Query runs merged with corresponding wake data.
 */
export function getRuns(options?: {
  seat?: string;
  from?: string;
  to?: string;
  limit?: number;
}): MergedRunInfo[] {
  const records = readAllRunFiles();
  const limit = options?.limit ?? 50;

  // Group latest states
  const wakesById = new Map<string, WakeRecord>();
  const runsById = new Map<string, RunRecord>();

  for (const r of records) {
    if (r.type === 'wake') {
      wakesById.set(r.wakeId, r);
    } else if (r.type === 'run') {
      runsById.set(r.runId, r);
    }
  }

  let runs = Array.from(runsById.values());

  if (options?.seat) {
    runs = runs.filter((r) => r.seatId === options.seat);
  }
  if (options?.from) {
    const fromTime = new Date(options.from).getTime();
    runs = runs.filter((r) => new Date(r.startedAt).getTime() >= fromTime);
  }
  if (options?.to) {
    const toTime = new Date(options.to).getTime();
    runs = runs.filter((r) => new Date(r.startedAt).getTime() <= toTime);
  }

  // Sort descending by startedAt
  runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const merged: MergedRunInfo[] = runs.slice(0, limit).map((run) => {
    const wake = run.wakeId ? wakesById.get(run.wakeId) : undefined;
    return {
      ...run,
      ...(wake ? { wake } : {}),
    };
  });

  return merged;
}

/**
 * On runner startup: recover orphaned running runs and expire old queued wakes.
 */
export function recoverOrphanedRuns(): { orphanedRuns: number; expiredWakes: number } {
  const records = readAllRunFiles();
  const now = Date.now();

  const wakesById = new Map<string, WakeRecord>();
  const runsById = new Map<string, RunRecord>();

  for (const r of records) {
    if (r.type === 'wake') {
      wakesById.set(r.wakeId, r);
    } else if (r.type === 'run') {
      runsById.set(r.runId, r);
    }
  }

  let orphanedRuns = 0;
  let expiredWakes = 0;

  // 1. Recover runs marked running on restart
  for (const run of runsById.values()) {
    if (run.status === 'running') {
      updateRun(run.runId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        errorKind: 'orphaned',
      });
      orphanedRuns++;
    }
  }

  // 2. Expire queued wakes older than 10 minutes
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  for (const wake of wakesById.values()) {
    if (wake.status === 'queued') {
      const age = now - new Date(wake.requestedAt).getTime();
      if (age > TEN_MINUTES_MS) {
        updateWake(wake.wakeId, {
          status: 'expired',
          reason: 'queued_timeout_exceeded',
        });
        expiredWakes++;
      }
    }
  }

  return { orphanedRuns, expiredWakes };
}
