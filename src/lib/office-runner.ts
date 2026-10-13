/**
 * 🤖 AIBOSS Office Server Runner (Pha 5A-2)
 *
 * Server-side scheduler that continuously monitors wakeup requests (kho-danh-thuc)
 * and executes agent turns via chayMotLuot without requiring an active browser.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chayMotLuot } from '@/lib/chay-mot-luot';
import { nhanYeuCau, xacNhanDaGiao, xemSo, conDung, traVeHangDoi, boYeuCau } from '@/lib/kho-danh-thuc';
import { layO, ghiMocKetThuc } from '@/lib/kho-phien';
import { coPhien, dangChay as dangChayNoiKhac, mocTepPhien } from '@/lib/doc-phien';
import { isSeatHeldByTerminal } from '@/lib/seat-active';
import { dsViec } from '@/lib/kho-tien-trinh';
import {
  generateRunOrWakeId,
  recordRun,
  updateRun,
  updateWake,
  recoverOrphanedRuns,
  type RunErrorKind,
} from '@/lib/runs-ledger';
import { extractUsageReceipts, type StreamJsonEvent } from '@/lib/usage-receipt';
import { recordCostReceipts, recordCostReceipt } from '@/lib/costs-ledger';

const REPO_ROOT = process.cwd();
const BASE_DATA_DIR = process.env.AIBOSS_DATA_DIR || path.join(REPO_ROOT, 'operations', 'data');
const RUNNER_OFF_FILE = path.join(BASE_DATA_DIR, 'runner.off');
const CONFIG_FILE = path.join(REPO_ROOT, 'config', 'office.json');
const LOG_FILE = path.join(BASE_DATA_DIR, 'runner.log.jsonl');

export interface RunnerConfig {
  enabled: boolean;
  interval_s: number;
  max_parallel: number;
}

export interface RunnerLogEvent {
  timestamp: string;
  seat: string;
  bell_id: string;
  event: 'start' | 'end' | 'skipped';
  start?: string;
  end?: string;
  duration_ms?: number;
  exit?: number | null;
  session_id?: string;
  error?: string;
  skipped_reason?: string;
}

let runnerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let isTickInProgress = false;
const activeSeats = new Set<string>();

interface InFlightTurn {
  seat: string;
  bell_id: string;
  wakeId: string;
  runId: string;
  startIso: string;
  startTime: number;
}
const inFlightTurns = new Map<string, InFlightTurn>();

/**
 * Flush any active in-flight turns with exit null and error reason.
 * Ensures every logged start event has a matching end event even during abrupt stops.
 */
export function flushInFlightTurns(reason: string): void {
  for (const [seat, turn] of inFlightTurns.entries()) {
    const endIso = new Date().toISOString();
    logRunnerEvent({
      timestamp: endIso,
      seat: turn.seat,
      bell_id: turn.bell_id,
      event: 'end',
      start: turn.startIso,
      end: endIso,
      duration_ms: Date.now() - turn.startTime,
      exit: null,
      error: reason,
    });
    if (turn.runId) {
      try {
        updateRun(turn.runId, {
          status: 'killed',
          finishedAt: endIso,
          exitCode: null,
          errorKind: 'sigkill',
        });
      } catch {
        /* ignore ledger write error during shutdown */
      }
    }
    inFlightTurns.delete(seat);
  }
}

if (typeof process !== 'undefined') {
  process.once('SIGINT', () => flushInFlightTurns('server received SIGINT'));
  process.once('SIGTERM', () => flushInFlightTurns('server received SIGTERM'));
  process.once('beforeExit', () => flushInFlightTurns('server beforeExit'));
}

/**
 * Read runner configuration from config/office.json with defaults.
 */
export function readRunnerConfig(): RunnerConfig {
  const defaults: RunnerConfig = {
    enabled: true,
    interval_s: 5,
    max_parallel: 2,
  };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.runner) {
        return {
          enabled: parsed.runner.enabled !== false,
          interval_s: typeof parsed.runner.interval_s === 'number' && parsed.runner.interval_s > 0
            ? parsed.runner.interval_s
            : defaults.interval_s,
          max_parallel: typeof parsed.runner.max_parallel === 'number' && parsed.runner.max_parallel > 0
            ? parsed.runner.max_parallel
            : defaults.max_parallel,
        };
      }
    }
  } catch {
    /* fallback to defaults */
  }

  return defaults;
}

/**
 * Check if runner is enabled by configuration and kill-switch.
 */
export function isRunnerEnabled(): boolean {
  if (fs.existsSync(RUNNER_OFF_FILE)) {
    return false;
  }
  const config = readRunnerConfig();
  return config.enabled;
}

/**
 * Append event to operations/data/runner.log.jsonl.
 */
export function logRunnerEvent(event: RunnerLogEvent): void {
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(event) + '\n', 'utf-8');
  } catch {
    /* ignore logging write failures */
  }
}

/**
 * Run a single polling cycle.
 * Traverses queue, validates seat state, claims request, and executes turn.
 */
export async function tickRunner(): Promise<number> {
  if (isTickInProgress) {
    return 0;
  }
  isTickInProgress = true;

  try {
    if (!isRunnerEnabled()) {
      return 0;
    }

    const config = readRunnerConfig();
    const bayGio = Date.now();
    const { hang_doi } = xemSo();

    // Select valid pending items
    const cho = hang_doi.filter((y) => y.trang_thai === 'cho' && conDung(y, bayGio));
    if (cho.length === 0) {
      return 0;
    }

    const liveProcesses = dsViec();
    const liveProcessSeats = new Set(liveProcesses.map((v) => v.ma_nhan_su));
    let executedInCycle = 0;

    for (const y of cho) {
      if (activeSeats.size >= config.max_parallel) {
        break;
      }

      // One turn per seat at a time
      if (activeSeats.has(y.ma_nhan_su) || liveProcessSeats.has(y.ma_nhan_su)) {
        logRunnerEvent({
          timestamp: new Date().toISOString(),
          seat: y.ma_nhan_su,
          bell_id: y.ma,
          event: 'skipped',
          skipped_reason: 'seat_busy_in_process',
        });
        if (y.wakeId) {
          try {
            updateWake(y.wakeId, {
              status: 'skipped',
              reason: 'seat_busy_in_process',
            });
          } catch {
            /* ignore */
          }
        }
        boYeuCau(y.ma, 'seat_busy_in_process');
        continue;
      }

      // Check terminal lock
      const terminalCheck = isSeatHeldByTerminal(y.ma_nhan_su);
      if (terminalCheck.isHeld) {
        logRunnerEvent({
          timestamp: new Date().toISOString(),
          seat: y.ma_nhan_su,
          bell_id: y.ma,
          event: 'skipped',
          skipped_reason: 'terminal',
        });
        if (y.wakeId) {
          try {
            updateWake(y.wakeId, {
              status: 'skipped',
              reason: 'seat_held_by_terminal',
            });
          } catch {
            /* ignore */
          }
        }
        boYeuCau(y.ma, 'seat_held_by_terminal');
        continue;
      }

      // Check if seat's current session is active elsewhere
      const o = layO(y.ma_o);
      const maPhienCu = o && o.ma_nhan_su === y.ma_nhan_su ? (o.ma_phien ?? null) : null;
      if (maPhienCu && dangChayNoiKhac(y.ma_nhan_su, maPhienCu, o?.moc_ket_thuc ?? null)) {
        logRunnerEvent({
          timestamp: new Date().toISOString(),
          seat: y.ma_nhan_su,
          bell_id: y.ma,
          event: 'skipped',
          skipped_reason: 'running_elsewhere',
        });
        if (y.wakeId) {
          try {
            updateWake(y.wakeId, {
              status: 'skipped',
              reason: 'seat_busy_running_elsewhere',
            });
          } catch {
            /* ignore */
          }
        }
        boYeuCau(y.ma, 'seat_busy_running_elsewhere');
        continue;
      }

      // Atomic claim from queue
      const claimed = nhanYeuCau(y.ma_o, y.ma_nhan_su, 'office-runner');
      if (!claimed.y) {
        continue;
      }

      const confirmed = xacNhanDaGiao(claimed.y.ma, 'office-runner');
      if (!confirmed.xong) {
        continue;
      }

      activeSeats.add(y.ma_nhan_su);
      executedInCycle++;

      const startIso = new Date().toISOString();
      const startTime = Date.now();
      const wakeId = claimed.y.wakeId ?? claimed.y.ma;
      const runId = generateRunOrWakeId('run');

      // F1: Wrap ledger writes in try/catch to recover queue item and free activeSeats on throw
      try {
        updateWake(wakeId, {
          status: 'claimed',
          claimedAt: startIso,
          runId,
        });

        recordRun({
          runId,
          wakeId,
          seatId: y.ma_nhan_su,
          startedAt: startIso,
          status: 'running',
          attempt: 1,
        });
      } catch (err) {
        console.error(`[office-runner] Failed to write ledger for claimed wake ${wakeId}:`, err);
        activeSeats.delete(y.ma_nhan_su);
        traVeHangDoi(claimed.y.ma);
        continue;
      }

      inFlightTurns.set(y.ma_nhan_su, {
        seat: y.ma_nhan_su,
        bell_id: y.ma,
        wakeId,
        runId,
        startIso,
        startTime,
      });

      logRunnerEvent({
        timestamp: startIso,
        seat: y.ma_nhan_su,
        bell_id: y.ma,
        event: 'start',
        start: startIso,
      });

      // Execute turn asynchronously so other seats are not blocked
      void (async () => {
        try {
          let phienDung = maPhienCu;
          if (phienDung && !coPhien(y.ma_nhan_su, phienDung)) {
            phienDung = null;
          }

          const result = await chayMotLuot(
            {
              maO: y.ma_o,
              maNhanSu: y.ma_nhan_su,
              cauHoi: y.cau_hoi,
              maPhienCu: phienDung,
              khiSinh: (pid) => {
                updateRun(runId, { pid });
              },
            },
            () => {
              /* output streams to Claude Code session file directly */
            }
          );

          const endIso = new Date().toISOString();
          const durationMs = Date.now() - startTime;
          const exitCode = result.exitCode ?? (result.loi ? 1 : 0);

          // 1. Process cost receipts FIRST (Finding B: record costs before finished, durable costStatus)
          let costStatus: 'recorded' | 'pending' | 'unpriced' = 'pending';
          if (result.rawResult) {
            try {
              const receipts = extractUsageReceipts([result.rawResult as StreamJsonEvent]);
              if (receipts.length > 0) {
                recordCostReceipts(y.ma_nhan_su, runId, receipts, endIso);
                costStatus = 'recorded';
              } else {
                recordCostReceipt({
                  ts: endIso,
                  seatId: y.ma_nhan_su,
                  runId,
                  model: 'unknown',
                  inputTokens: 0,
                  cachedInputTokens: 0,
                  cacheCreationTokens: 0,
                  outputTokens: 0,
                  costNanodollars: null,
                  priced: false,
                  source: 'claude-stream-json',
                });
                costStatus = 'unpriced';
              }
            } catch (err: unknown) {
              console.error(`[office-runner] Failed to record cost receipts for run ${runId}:`, err);
              costStatus = 'pending';
            }
          } else {
            try {
              recordCostReceipt({
                ts: endIso,
                seatId: y.ma_nhan_su,
                runId,
                model: 'unknown',
                inputTokens: 0,
                cachedInputTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
                costNanodollars: null,
                priced: false,
                source: 'claude-stream-json',
              });
              costStatus = 'unpriced';
            } catch (err: unknown) {
              console.error(`[office-runner] Failed to record fallback unpriced cost receipt for run ${runId}:`, err);
              costStatus = 'pending';
            }
          }

          // 2. Map failure to finite RunErrorKind codes (Item 10: sigkill, timeout, exit_nonzero, result_error, spawn_failed, orphaned)
          let finalStatus: 'finished' | 'failed' | 'timeout' | 'killed' = 'finished';
          let errorKind: RunErrorKind | undefined = undefined;

          if (result.exitSignal === 'SIGKILL' || result.loi?.includes('bị dừng bởi tín hiệu SIGKILL')) {
            finalStatus = 'killed';
            errorKind = 'sigkill';
          } else if (result.loi?.includes('khoảng lặng đã quá ngưỡng') || result.loi?.includes('timeout')) {
            finalStatus = 'timeout';
            errorKind = 'timeout';
          } else if (result.exitCode !== 0 && result.exitCode !== null) {
            finalStatus = 'failed';
            errorKind = 'exit_nonzero';
          } else if (result.loi?.startsWith('skipped: terminal')) {
            finalStatus = 'failed';
            errorKind = 'spawn_failed';
          } else if (result.loi) {
            finalStatus = 'failed';
            errorKind = 'result_error';
          }

          logRunnerEvent({
            timestamp: endIso,
            seat: y.ma_nhan_su,
            bell_id: y.ma,
            event: 'end',
            start: startIso,
            end: endIso,
            duration_ms: durationMs,
            exit: exitCode,
            error: errorKind,
            session_id: result.maPhien ?? undefined,
          });

          updateRun(runId, {
            status: finalStatus,
            finishedAt: endIso,
            exitCode: finalStatus === 'finished' ? 0 : exitCode,
            errorKind,
            costStatus,
            sessionId: result.maPhien ?? undefined,
            pid: result.pid_de_hien_thi ?? undefined,
          });

          if (result.maPhien) {
            const maP = result.maPhien;
            const ghiLai = () => {
              const oNay = layO(y.ma_o);
              if (!oNay || oNay.ma_nhan_su !== y.ma_nhan_su || oNay.ma_phien !== maP) return;
              const m = mocTepPhien(y.ma_nhan_su, maP);
              if (m !== null) ghiMocKetThuc(y.ma_o, m);
            };
            ghiLai();
            for (const delay of [1_500, 5_000, 15_000]) {
              setTimeout(ghiLai, delay).unref?.();
            }
          }
        } catch {
          const endIso = new Date().toISOString();
          try {
            recordCostReceipt({
              ts: endIso,
              seatId: y.ma_nhan_su,
              runId,
              model: 'unknown',
              inputTokens: 0,
              cachedInputTokens: 0,
              cacheCreationTokens: 0,
              outputTokens: 0,
              costNanodollars: null,
              priced: false,
              source: 'claude-stream-json',
            });
          } catch {
            /* ignore fallback unpriced marker */
          }
          logRunnerEvent({
            timestamp: endIso,
            seat: y.ma_nhan_su,
            bell_id: y.ma,
            event: 'end',
            start: startIso,
            end: endIso,
            duration_ms: Date.now() - startTime,
            exit: null,
            error: 'result_error',
          });
          updateRun(runId, {
            status: 'failed',
            finishedAt: endIso,
            exitCode: null,
            errorKind: 'result_error',
            costStatus: 'unpriced',
          });
        } finally {
          inFlightTurns.delete(y.ma_nhan_su);
          activeSeats.delete(y.ma_nhan_su);
        }
      })();
    }

    return executedInCycle;
  } finally {
    isTickInProgress = false;
  }
}

/**
 * Start the server runner interval loop.
 */
export function startOfficeRunner(): boolean {
  if (isRunning) {
    return false;
  }

  // Safe restart recovery (A-1 Item 5): recover orphaned running runs and expire old queued wakes
  try {
    recoverOrphanedRuns();
  } catch {
    /* ignore ledger recovery error */
  }

  isRunning = true;
  const config = readRunnerConfig();
  const intervalMs = config.interval_s * 1000;

  // Run initial tick immediately
  void tickRunner().catch(() => {});

  runnerTimer = setInterval(() => {
    void tickRunner().catch(() => {});
  }, intervalMs);

  return true;
}

/**
 * Stop the server runner interval loop.
 */
export function stopOfficeRunner(): void {
  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
  }
  flushInFlightTurns('runner stopped');
  isRunning = false;
  activeSeats.clear();
}

/**
 * Query runner status for monitoring and diagnostics.
 */
export function getOfficeRunnerStatus(): {
  running: boolean;
  enabled: boolean;
  active_seats: string[];
  config: RunnerConfig;
} {
  return {
    running: isRunning,
    enabled: isRunnerEnabled(),
    active_seats: Array.from(activeSeats),
    config: readRunnerConfig(),
  };
}
