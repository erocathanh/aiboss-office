import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { timNhanSu } from './nhan-su';

export interface SeatActiveRecord {
  schema: number;
  seat: string;
  tool: 'app' | 'terminal' | 'antigravity';
  app: 'aiboss-office' | 'aiboss-app-chat' | null;
  session_id: string;
  pid: number | null;
  cwd: string;
  host: string;
  started_at: string;
  last_write: string;
  resume_cmd: string | null;
}

export interface SeatLogEntry extends SeatActiveRecord {
  ended_at: string;
  reason: 'released' | 'session_changed' | 'taken_over' | 'process_gone' | 'moved';
}

const REPO_ROOT = process.env.AIBOSS_OFFICE_ROOT
  ? path.resolve(process.env.AIBOSS_OFFICE_ROOT)
  : path.resolve(process.cwd());

/**
 * Resolve seat directory where seat-active.json and seat-log.jsonl reside.
 */
export function getSeatDir(seatId: string): string {
  const ns = timNhanSu(seatId);
  if (ns?.thu_muc && fs.existsSync(ns.thu_muc)) {
    return ns.thu_muc;
  }
  // Standard office seat location
  const deptSeatDir = path.join(REPO_ROOT, 'departments', 'marketing', 'seats', seatId);
  if (fs.existsSync(deptSeatDir)) {
    return deptSeatDir;
  }
  // Fallback to operations/data/seats/<seatId>
  const opsSeatDir = path.join(REPO_ROOT, 'operations', 'data', 'seats', seatId);
  fs.mkdirSync(opsSeatDir, { recursive: true });
  return opsSeatDir;
}

/**
 * Secondary mirror directory in operations/data/seats/<seatId>
 */
export function getOpsSeatDir(seatId: string): string {
  const opsSeatDir = path.join(REPO_ROOT, 'operations', 'data', 'seats', seatId);
  fs.mkdirSync(opsSeatDir, { recursive: true });
  return opsSeatDir;
}

/**
 * Read active seat record. Checks seat dir and ops mirror dir.
 */
export function readSeatActive(seatId: string): SeatActiveRecord | null {
  const dirs = [getSeatDir(seatId), getOpsSeatDir(seatId)];
  for (const dir of dirs) {
    const filePath = path.join(dir, 'seat-active.json');
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as SeatActiveRecord;
        if (parsed && typeof parsed.session_id === 'string') {
          return parsed;
        }
      } catch {
        /* ignore corrupted or partial read */
      }
    }
  }
  return null;
}

/**
 * Check if seat is currently held by terminal with a live process.
 */
export function isSeatHeldByTerminal(seatId: string): {
  isHeld: boolean;
  record: SeatActiveRecord | null;
  reason?: string;
} {
  const record = readSeatActive(seatId);
  if (!record) {
    return { isHeld: false, record: null };
  }

  if (record.tool === 'terminal' && record.pid) {
    let isAlive = false;
    try {
      // Check if process exists and is alive
      process.kill(record.pid, 0);
      isAlive = true;
    } catch {
      isAlive = false;
    }

    if (isAlive) {
      return {
        isHeld: true,
        record,
        reason: `Seat '${seatId}' is open in terminal (PID ${record.pid}, session ${record.session_id})`,
      };
    }
  }

  return { isHeld: false, record };
}

/**
 * Claim or update a seat record. Writes atomically and logs history if session changes.
 */
export function claimSeat(
  seatId: string,
  params: {
    tool: 'app' | 'terminal' | 'antigravity';
    sessionId: string;
    pid?: number | null;
    cwd?: string;
    app?: 'aiboss-office' | 'aiboss-app-chat' | null;
  },
): { success: boolean; record: SeatActiveRecord; error?: string } {
  const primaryDir = getSeatDir(seatId);
  const opsDir = getOpsSeatDir(seatId);
  const nowIso = new Date().toISOString();

  const prev = readSeatActive(seatId);
  const cwd = params.cwd ?? primaryDir;
  const resumeCmd = `cd '${cwd}' && claude --resume ${params.sessionId}`;

  const newRecord: SeatActiveRecord = {
    schema: 1,
    seat: seatId,
    tool: params.tool,
    app: params.app ?? 'aiboss-office',
    session_id: params.sessionId,
    pid: params.pid ?? (params.tool === 'app' ? process.pid : null),
    cwd,
    host: os.hostname(),
    started_at: prev?.session_id === params.sessionId ? prev.started_at : nowIso,
    last_write: nowIso,
    resume_cmd: resumeCmd,
  };

  // If session changed, append previous session to seat-log.jsonl
  if (prev && prev.session_id && prev.session_id !== params.sessionId) {
    const logEntry: SeatLogEntry = {
      ...prev,
      ended_at: nowIso,
      reason: 'session_changed',
    };
    const logLine = JSON.stringify(logEntry) + '\n';
    try {
      fs.appendFileSync(path.join(primaryDir, 'seat-log.jsonl'), logLine);
      if (primaryDir !== opsDir) {
        fs.appendFileSync(path.join(opsDir, 'seat-log.jsonl'), logLine);
      }
    } catch {
      /* ignore logging failure */
    }
  }

  // Atomic write to seat-active.json
  const content = JSON.stringify(newRecord, null, 2);
  const targetDirs = Array.from(new Set([primaryDir, opsDir]));

  for (const dir of targetDirs) {
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = path.join(dir, `.seat-active.json.tmp.${Date.now()}`);
    const finalPath = path.join(dir, 'seat-active.json');
    try {
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, finalPath);
    } catch {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    }
  }

  return { success: true, record: newRecord };
}

/**
 * Update PID of active seat without changing session.
 */
export function updateSeatActivePid(seatId: string, pid: number | null): void {
  const current = readSeatActive(seatId);
  if (!current) return;

  const nowIso = new Date().toISOString();
  const updated: SeatActiveRecord = {
    ...current,
    pid,
    last_write: nowIso,
  };

  const primaryDir = getSeatDir(seatId);
  const opsDir = getOpsSeatDir(seatId);
  const targetDirs = Array.from(new Set([primaryDir, opsDir]));
  const content = JSON.stringify(updated, null, 2);

  for (const dir of targetDirs) {
    const tmpPath = path.join(dir, `.seat-active.json.tmp.${Date.now()}`);
    const finalPath = path.join(dir, 'seat-active.json');
    try {
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, finalPath);
    } catch {}
  }
}

/**
 * Release active seat and record entry in seat-log.jsonl.
 */
export function releaseSeat(
  seatId: string,
  reason: SeatLogEntry['reason'] = 'released',
): void {
  const primaryDir = getSeatDir(seatId);
  const opsDir = getOpsSeatDir(seatId);
  const prev = readSeatActive(seatId);
  const nowIso = new Date().toISOString();

  if (prev) {
    const logEntry: SeatLogEntry = {
      ...prev,
      ended_at: nowIso,
      reason,
    };
    const logLine = JSON.stringify(logEntry) + '\n';
    try {
      fs.appendFileSync(path.join(primaryDir, 'seat-log.jsonl'), logLine);
      if (primaryDir !== opsDir) {
        fs.appendFileSync(path.join(opsDir, 'seat-log.jsonl'), logLine);
      }
    } catch {}
  }

  const targetDirs = Array.from(new Set([primaryDir, opsDir]));
  for (const dir of targetDirs) {
    const finalPath = path.join(dir, 'seat-active.json');
    if (fs.existsSync(finalPath)) {
      try {
        fs.unlinkSync(finalPath);
      } catch {}
    }
  }
}
