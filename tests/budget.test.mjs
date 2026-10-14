import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// 1. ISOLATE DATA AND CONFIG DIRS: Tests must NEVER touch operations/data or config/office.json
const testBaseDir = path.join(
  os.tmpdir(),
  'aiboss-test-budget-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
);
const testDataDir = path.join(testBaseDir, 'data');
const testConfigDir = path.join(testBaseDir, 'config');

fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testConfigDir, { recursive: true });

process.env.AIBOSS_DATA_DIR = testDataDir;
process.env.AIBOSS_CONFIG_DIR = testConfigDir;

// Helper to write isolated test configuration
function writeTestConfig(budgetConfig) {
  const cfg = {
    version: 1,
    timezone: 'Europe/London',
    timezone_label: 'London',
    working_hours: {
      start: '09:00',
      end: '18:00',
      days: [1, 2, 3, 4, 5],
    },
    ui_language: 'en',
    progress_marks: [7, 9, 11, 13, 15, 17, 19, 21],
    response_time_working_hours: {
      incident: 4,
      routine: 24,
    },
    budget: budgetConfig,
    last_edited: {
      at: '2026-10-12T14:09:00Z',
      by: 'test-runner',
    },
  };
  fs.writeFileSync(path.join(testConfigDir, 'office.json'), JSON.stringify(cfg, null, 2), 'utf-8');
}

// Initial config
writeTestConfig({
  currency: 'USD',
  defaultRunEstimateNanodollars: '700000000',
  office: { dailyCapNanodollars: null, hardStop: true },
  seats: {
    'marketing-lead': { dailyCapNanodollars: null, hardStop: true },
    'content-writer': { dailyCapNanodollars: null, hardStop: true },
  },
});

import {
  getBudgetDir,
  readBudgetFile,
  readAllBudgetRecords,
  recordHold,
  settleHold,
  releaseHold,
  recordReject,
  calculateRunEstimate,
  getHistoricalRunEstimate,
  getBudgetStatus,
  checkBudgetAdmission,
  checkAdmissionAndRecordHold,
  reconcileOpenHolds,
  isHoldClosed,
  getActiveHolds,
  sanitizeBudgetRecord,
  withBudgetLock,
  initBudgetLedger,
  loadOpenHoldsCheckpoint,
  saveOpenHoldsCheckpoint,
  replayAndGetCheckpoint,
  getProcessStartTime,
  isProcessAlive,
  checkProcessLiveness,
  acquireInstanceLock,
  releaseInstanceLock,
  verifyInstanceLockActive,
  renewInstanceLock,
  repairLogTail,
  fenceInstance,
  isFenced,
  resetFencingForTest,
  UNINITIALIZED_LOCK_TIMEOUT_MS,
  hasActiveInstanceToken,
  isFenceGuardDisabledForTest,
  isInstanceMutexDisabledForTest,
  isMutexRecheckDisabledForTest,
  withInstanceMutex,
  __testHooks,
} from '../src/lib/budget-ledger.ts';
import {
  stopOfficeRunner,
  flushInFlightTurns,
  registerInFlightTurnForTest,
  getInFlightTurnCountForTest,
  tickRunner,
  logRunnerEvent,
} from '../src/lib/office-runner.ts';
import { ghiMocKetThuc } from '../src/lib/kho-phien.ts';
import {
  isValidNanodollarsString,
  validateDailyCap,
  validateRunEstimate,
  sanitizeBudgetConfig,
  getOfficeConfig,
} from '../src/lib/office-config.ts';
import { recordCostReceipt, getCostReceiptsForRun } from '../src/lib/costs-ledger.ts';
import {
  recordWake,
  updateWake,
  recordRun,
  updateRun,
  getRun,
  getWake,
  generateRunOrWakeId,
  reconcilePendingCosts,
} from '../src/lib/runs-ledger.ts';
import { boYeuCau } from '../src/lib/kho-danh-thuc.ts';
import { formatNanodollars } from '../src/lib/money-format.ts';
import { MAX_MONEY_UNITS } from '../src/lib/money.ts';
import { GET as getBudgetRoute } from '../src/app/api/budget/route.ts';

console.log('--- Testing src/lib/budget-ledger.ts & A-3 Budget Holds (Hardened Fixture) ---');

try {
  // Case 1: 7-day average estimate calculation & default fallback
  {
    const seatId = 'marketing-lead';

    // Baseline with no runs: must return default 700000000 nanodollars ($0.70)
    const initialEst = calculateRunEstimate(seatId);
    assert.equal(initialEst.amountNanodollars, '700000000');
    assert.equal(initialEst.basis, 'default');

    // Add 3 priced runs in costs ledger within past 7 days
    const nowIso = new Date().toISOString();
    recordCostReceipt({
      ts: nowIso,
      seatId,
      runId: 'run-est-1',
      model: 'claude-3-5-sonnet',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '500000000', // $0.50
      priced: true,
      source: 'claude-stream-json',
    });

    recordCostReceipt({
      ts: nowIso,
      seatId,
      runId: 'run-est-2',
      model: 'claude-3-5-sonnet',
      inputTokens: 200,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 100,
      costNanodollars: '600000000', // $0.60
      priced: true,
      source: 'claude-stream-json',
    });

    // Multi-model run: run-est-3 has 2 models: 400M + 300M = 700M
    recordCostReceipt({
      ts: nowIso,
      seatId,
      runId: 'run-est-3',
      model: 'claude-3-5-sonnet',
      inputTokens: 200,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 100,
      costNanodollars: '400000000',
      priced: true,
      source: 'claude-stream-json',
    });
    recordCostReceipt({
      ts: nowIso,
      seatId,
      runId: 'run-est-3',
      model: 'claude-3-5-haiku',
      inputTokens: 300,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 150,
      costNanodollars: '300000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Average of runs: (500M + 600M + 700M) / 3 = 600M = 600000000
    const est = calculateRunEstimate(seatId);
    assert.equal(est.amountNanodollars, '600000000');
    assert.equal(est.basis, 'estimate:last5');

    console.log('  [PASS] Case 1: 7-day average estimate calculation & default fallback verified');
  }

  // Case 2: Cap lower than estimate triggers budget reject with exact numbers
  {
    const seatId = 'marketing-lead';
    // Set daily cap to 500M ($0.50), while estimate is 600M ($0.60)
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: '500000000', hardStop: true },
      },
    });

    const admission = checkBudgetAdmission(seatId, 'wake-test-reject-1');
    assert.equal(admission.allowed, false, 'Turn must be rejected when estimate > cap');
    assert.equal(admission.reason, 'budget_exceeded');
    assert.equal(admission.scope, 'seat');

    // Verify rejection record in budget log
    const records = readAllBudgetRecords();
    const reject = records.find((r) => r.type === 'reject' && r.wakeId === 'wake-test-reject-1');
    assert.ok(reject, 'Reject record must be logged');
    assert.equal(reject.scope, 'seat');
    assert.equal(reject.capNanodollars, '500000000');
    assert.equal(reject.estimateNanodollars, '600000000');

    console.log('  [PASS] Case 2: cap lower than estimate triggers budget reject with exact numbers');
  }

  // Case 3: Positive control counterproof
  {
    const seatId = 'marketing-lead';
    // When disabled via environment variable, checkBudgetAdmission must bypass cap check
    process.env.AIBOSS_TEST_DISABLE_BUDGET_CHECK = '1';
    try {
      const bypassed = checkBudgetAdmission(seatId, 'wake-test-bypass');
      assert.equal(bypassed.allowed, true, 'Admission must be allowed when budget check is disabled');
    } finally {
      delete process.env.AIBOSS_TEST_DISABLE_BUDGET_CHECK;
    }

    // Now re-run with normal check: must be rejected!
    const enforced = checkBudgetAdmission(seatId, 'wake-test-enforced');
    assert.equal(enforced.allowed, false, 'Admission must be rejected when budget check is active');

    console.log('  [PASS] Case 3: positive control counterproof verified');
  }

  // Case 4: Raising cap allows run, creates hold, and settles to 0 heldNanodollars
  {
    const seatId = 'marketing-lead';
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: '5000000000', hardStop: true },
      },
    });

    const wakeId = 'wake-test-hold-1';
    const holdId = 'hold-test-1';
    const nowIso = new Date().toISOString();

    const admission = checkAdmissionAndRecordHold({
      seatId,
      wakeId,
      holdId,
      nowIso,
    });
    assert.equal(admission.allowed, true);
    assert.ok(admission.hold);
    assert.equal(admission.hold.amountNanodollars, '600000000');

    // Status: held must equal 600M
    const statusBefore = getBudgetStatus(seatId);
    assert.equal(statusBefore.heldNanodollars, '600000000');

    // Settle hold with actual cost $0.55 = 550000000
    const settle = settleHold({
      holdId,
      runId: 'run-test-settle-1',
      actualNanodollars: '550000000',
      priced: true,
      ts: new Date().toISOString(),
    });
    assert.ok(settle);
    assert.equal(settle.type, 'settle');
    assert.equal(settle.priced, true);

    // After settle: held must return to 0
    const statusAfter = getBudgetStatus(seatId);
    assert.equal(statusAfter.heldNanodollars, '0');

    console.log('  [PASS] Case 4: raising cap allows run, creates hold, and settles to 0 heldNanodollars');
  }

  // Case 5: Settle & release idempotency under lock backed by open-holds index
  {
    const holdId = 'hold-test-idempotent-1';
    recordHold({
      holdId,
      wakeId: 'wake-idem-1',
      seatId: 'marketing-lead',
      amountNanodollars: '600000000',
      basis: 'estimate:last5',
      overBudget: false,
      ts: new Date().toISOString(),
    });

    const s1 = settleHold({
      holdId,
      runId: 'run-idem-1',
      actualNanodollars: '600000000',
      priced: true,
    });
    const s2 = settleHold({
      holdId,
      runId: 'run-idem-1',
      actualNanodollars: '600000000',
      priced: true,
    });
    const r3 = releaseHold({
      holdId,
      reason: 'failed_no_receipt',
    });

    assert.ok(s1 !== null, 'First settle must succeed');
    assert.equal(s2, null, 'Second settle must be ignored (idempotent)');
    assert.equal(r3, null, 'Release after settle must be ignored');

    console.log('  [PASS] Case 5: cross-process settle & release idempotency verified');
  }

  // Case 6: Concurrent race condition: two holds racing for a cap (Finding B)
  {
    const seatId = 'content-writer';
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'content-writer': { dailyCapNanodollars: '1000000000', hardStop: true },
      },
    });

    const res1 = checkAdmissionAndRecordHold({
      seatId,
      wakeId: 'wake-race-1',
      holdId: 'hold-race-1',
    });
    const res2 = checkAdmissionAndRecordHold({
      seatId,
      wakeId: 'wake-race-2',
      holdId: 'hold-race-2',
    });

    assert.equal(res1.allowed, true, 'First racer must be admitted');
    assert.ok(res1.hold, 'First racer gets hold record');
    assert.equal(res2.allowed, false, 'Second racer must be blocked by hold from first');
    assert.equal(res2.reason, 'budget_exceeded');

    console.log('  [PASS] Case 6: concurrent race condition correctly serializes and enforces cap');
  }

  // Case 7: Office cap + Seat cap both active
  {
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: '1200000000', hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: '5000000000', hardStop: true },
      },
    });

    const admission = checkBudgetAdmission('marketing-lead', 'wake-office-cap-test');
    assert.equal(admission.allowed, false);
    assert.equal(admission.scope, 'office');
    assert.equal(admission.reason, 'budget_exceeded');

    console.log('  [PASS] Case 7: office cap and seat cap co-enforcement verified');
  }

  // Case 8: Runner rejected via REAL boYeuCau maps wake status to skipped (Hermes FAIL 4 & FAIL 11)
  {
    const wake = recordWake({
      wakeId: 'wake-boyeucau-1',
      seatId: 'marketing-lead',
      content: 'Run a campaign',
      requestedAt: new Date().toISOString(),
      status: 'queued',
      channel: 'test',
      idempotencyKey: 'idem-boyeucau-1',
    });

    // Write real queue file in test data directory
    const testQueueFile = path.join(testDataDir, 'danh-thuc.json');
    const queueItemMa = 'queue-test-boyeucau-real';
    fs.writeFileSync(
      testQueueFile,
      JSON.stringify({
        hang_doi: [
          {
            ma: queueItemMa,
            ma_o: 'o-test-1',
            ma_nhan_su: 'marketing-lead',
            tu_ai: 'tester',
            cau_hoi: 'Real boYeuCau test',
            luc: Date.now(),
            da_xu: false,
            trang_thai: 'cho',
            wakeId: wake.wakeId,
          },
        ],
        moc_goi: [],
      })
    );

    // Call REAL boYeuCau from kho-danh-thuc.ts
    const discarded = boYeuCau(queueItemMa, 'budget_exceeded');
    assert.equal(discarded, true, 'boYeuCau must return true for found item');

    // Verify queue file updated on disk
    const qDisk = JSON.parse(fs.readFileSync(testQueueFile, 'utf-8'));
    const itemDisk = qDisk.hang_doi.find((x) => x.ma === queueItemMa);
    assert.ok(itemDisk, 'Queue item must exist');
    assert.equal(itemDisk.trang_thai, 'bo', 'Item must be marked "bo"');
    assert.equal(itemDisk.ly_do, 'budget_exceeded', 'Item reason must be budget_exceeded');

    // Verify wake ledger updated on disk: must be 'skipped', NOT 'expired'
    const updatedWake = getWake(wake.wakeId);
    assert.equal(updatedWake.status, 'skipped', 'Status in ledger must be "skipped", never "expired"');
    assert.equal(updatedWake.reason, 'budget_exceeded');

    console.log('  [PASS] Case 8: real boYeuCau maps queue to bo and wake status to skipped');
  }

  // Case 9: Mixed priced / unpriced receipts (FAIL 3)
  {
    const seatId = 'marketing-lead';
    const runId = 'run-mixed-pricing-1';
    const nowIso = new Date().toISOString();

    recordCostReceipt({
      ts: nowIso,
      seatId,
      runId,
      model: 'claude-3-5-sonnet',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '400000000',
      priced: true,
      source: 'claude-stream-json',
    });

    recordCostReceipt({
      ts: nowIso,
      seatId,
      runId,
      model: 'claude-3-5-haiku',
      inputTokens: 50,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 25,
      costNanodollars: null,
      priced: false,
      source: 'claude-stream-json',
    });

    const status = getBudgetStatus(seatId);
    assert.ok(status.unpricedRuns >= 1, 'Run must remain in unpricedRuns when any model is unpriced');

    console.log('  [PASS] Case 9: mixed priced/unpriced receipts preserve unpriced estimate reserve');
  }

  // Case 10: Hold lifecycle reconciliation across all terminal & live states (Hermes FAIL 7, 8 & 11)
  {
    const nowIso = new Date().toISOString();
    const elevenMinsAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

    // 10a. Expired hold (no run ever recorded, age > 10m)
    const oldHoldId = 'hold-old-no-run';
    recordHold({
      holdId: oldHoldId,
      wakeId: 'wake-old-no-run',
      seatId: 'marketing-lead',
      amountNanodollars: '700000000',
      basis: 'default',
      overBudget: false,
      ts: elevenMinsAgo,
    });

    // 10b. Finished run with priced receipt (cost "0" test, N1)
    const runZeroId = 'run-finished-cost-zero';
    const holdZeroId = 'hold-finished-cost-zero';
    recordHold({
      holdId: holdZeroId,
      wakeId: 'wake-zero-1',
      seatId: 'marketing-lead',
      amountNanodollars: '700000000',
      basis: 'default',
      overBudget: false,
      ts: nowIso,
    });
    recordRun({
      runId: runZeroId,
      wakeId: 'wake-zero-1',
      holdId: holdZeroId,
      seatId: 'marketing-lead',
      status: 'finished',
      costStatus: 'recorded',
      startedAt: nowIso,
      finishedAt: nowIso,
      attempt: 1,
    });
    recordCostReceipt({
      ts: nowIso,
      seatId: 'marketing-lead',
      runId: runZeroId,
      model: 'free-local-model',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '0', // Exact 0 cost
      priced: true,
      source: 'claude-stream-json',
    });

    // 10c. Failed run without any receipt
    const runFailedId = 'run-failed-no-receipt';
    const holdFailedId = 'hold-failed-no-receipt';
    recordHold({
      holdId: holdFailedId,
      wakeId: 'wake-failed-1',
      seatId: 'marketing-lead',
      amountNanodollars: '700000000',
      basis: 'default',
      overBudget: false,
      ts: nowIso,
    });
    recordRun({
      runId: runFailedId,
      wakeId: 'wake-failed-1',
      holdId: holdFailedId,
      seatId: 'marketing-lead',
      status: 'failed',
      costStatus: 'none',
      startedAt: nowIso,
      finishedAt: nowIso,
      attempt: 1,
    });

    // 10d. Orphaned run (status: failed, errorKind: orphaned)
    const runOrphanId = 'run-orphan-test';
    const holdOrphanId = 'hold-orphan-test';
    recordHold({
      holdId: holdOrphanId,
      wakeId: 'wake-orphan-1',
      seatId: 'marketing-lead',
      amountNanodollars: '700000000',
      basis: 'default',
      overBudget: false,
      ts: nowIso,
    });
    recordRun({
      runId: runOrphanId,
      wakeId: 'wake-orphan-1',
      holdId: holdOrphanId,
      seatId: 'marketing-lead',
      status: 'failed',
      errorKind: 'orphaned',
      startedAt: nowIso,
      finishedAt: nowIso,
      attempt: 1,
    });

    // 10e. Running run with LIVE PID: must NOT expire even if older than maxAgeMs
    const runLiveId = 'run-live-active';
    const holdLiveId = 'hold-live-active';
    recordHold({
      holdId: holdLiveId,
      wakeId: 'wake-live-1',
      seatId: 'marketing-lead',
      amountNanodollars: '700000000',
      basis: 'default',
      overBudget: false,
      ts: elevenMinsAgo, // 11 mins old
    });
    recordRun({
      runId: runLiveId,
      wakeId: 'wake-live-1',
      holdId: holdLiveId,
      seatId: 'marketing-lead',
      status: 'running',
      pid: process.pid, // Current process is guaranteed alive
      startedAt: elevenMinsAgo,
      attempt: 1,
    });

    // Run reconciler
    const res = reconcileOpenHolds();

    // Verify 10a: expired released
    assert.ok(isHoldClosed(oldHoldId), 'Old hold without run must be closed');

    // Verify 10b: finished with cost "0" settled with actualNanodollars: "0" (N1)
    assert.ok(isHoldClosed(holdZeroId), 'Hold with priced receipts must be settled');
    const records = readAllBudgetRecords();
    const settleZero = records.find((r) => r.type === 'settle' && r.holdId === holdZeroId);
    assert.ok(settleZero, 'Settle record must exist for zero cost run');
    assert.equal(settleZero.actualNanodollars, '0', 'Cost "0" must be preserved as "0", not null (N1)');
    assert.equal(settleZero.priced, true);

    // Verify 10c: failed without receipt released with failed_no_receipt
    assert.ok(isHoldClosed(holdFailedId));
    const releaseFailed = records.find((r) => r.type === 'release' && r.holdId === holdFailedId);
    assert.ok(releaseFailed);
    assert.equal(releaseFailed.reason, 'failed_no_receipt');

    // Verify 10d: orphaned run released with orphaned
    assert.ok(isHoldClosed(holdOrphanId));
    const releaseOrphan = records.find((r) => r.type === 'release' && r.holdId === holdOrphanId);
    assert.ok(releaseOrphan);
    assert.equal(releaseOrphan.reason, 'orphaned');

    // Verify 10e: live running run MUST NOT be expired
    assert.equal(isHoldClosed(holdLiveId), false, 'Live running run must NOT have hold expired');

    console.log('  [PASS] Case 10: hold lifecycle covers expired, cost 0 settle, failed_no_receipt, orphaned, and live PID preservation');
  }

  // Case 11: Multi-day rollover and long restart: holds preserved across days (Hermes FAIL 8 & 9)
  {
    // Create an active hold dated 3 days ago in budget ledger
    const threeDaysAgoIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const ancientHoldId = 'hold-ancient-3days-ago';
    recordHold({
      holdId: ancientHoldId,
      wakeId: 'wake-ancient-1',
      seatId: 'marketing-lead',
      amountNanodollars: '350000000',
      basis: 'default',
      overBudget: false,
      ts: threeDaysAgoIso,
    });

    // Check active holds: must NOT be lost due to 2-day truncation!
    const active = getActiveHolds();
    assert.ok(active.has(ancientHoldId), 'Hold from 3 days ago must be preserved in durable open-holds index');

    // Check getBudgetStatus: heldNanodollars must include the 350M hold!
    const status = getBudgetStatus('marketing-lead');
    assert.ok(
      BigInt(status.heldNanodollars) >= 350000000n,
      'getBudgetStatus must include ancient hold in heldNanodollars'
    );

    // Settle it cleanly
    settleHold({
      holdId: ancientHoldId,
      runId: 'run-ancient-1',
      actualNanodollars: '350000000',
      priced: true,
    });
    assert.ok(isHoldClosed(ancientHoldId), 'Ancient hold settles cleanly');

    console.log('  [PASS] Case 11: multi-day rollover and restart preserves open holds indefinitely');
  }

  // Case 12: Invalid configuration (negative, garbage, > MAX_MONEY_UNITS) fails closed (FAIL 1, N3)
  {
    // 12a. Negative cap
    const sanitizedNeg = sanitizeBudgetConfig({
      office: { dailyCapNanodollars: '-1000000' },
      seats: { 'bad-seat': { dailyCapNanodollars: 'garbage_val' } },
    });
    assert.ok(sanitizedNeg.configErrors && sanitizedNeg.configErrors.length >= 2);
    assert.equal(sanitizedNeg.office.hasConfigError, true);
    assert.equal(sanitizedNeg.seats['bad-seat'].hasConfigError, true);

    // 12b. Cap exceeding MAX_MONEY_UNITS (10^24 - 1)
    const hugeCap = '999999999999999999999999999999999999';
    assert.equal(isValidNanodollarsString(hugeCap), false, 'Cap > MAX_MONEY_UNITS must be rejected');

    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'invalid-cap-seat': { dailyCapNanodollars: hugeCap, hardStop: true },
      },
    });

    // Check admission: must fail closed with reason: config_error!
    const adm = checkBudgetAdmission('invalid-cap-seat', 'wake-cfg-err-1');
    assert.equal(adm.allowed, false, 'Invalid cap must fail closed');
    assert.equal(adm.reason, 'config_error');

    // Check budget status: state must be config_error
    const st = getBudgetStatus('invalid-cap-seat');
    assert.equal(st.state, 'config_error');

    console.log('  [PASS] Case 12: configuration validation rejects negative, junk, and > MAX_MONEY_UNITS with fail closed');
  }

  // Case 13: Schema whitelisting strictly strips unexpected fields
  {
    const sanitized = sanitizeBudgetRecord({
      type: 'hold',
      holdId: 'hold-clean-1',
      wakeId: 'wake-clean-1',
      seatId: 'marketing-lead',
      amountNanodollars: '700000000',
      basis: 'default',
      overBudget: false,
      ts: new Date().toISOString(),
      prompt: 'secret system prompt that must not leak',
      freeText: 'confidential user data',
    });
    assert.ok(sanitized);
    assert.equal('prompt' in sanitized, false, 'Unexpected field prompt must be stripped');
    assert.equal('freeText' in sanitized, false, 'Unexpected field freeText must be stripped');

    console.log('  [PASS] Case 13: strict schema whitelisting strips all unexpected fields');
  }

  // Case 14: GET /api/budget validates seat and tests strict >80% threshold unconditionally (FAIL 11)
  {
    const thresholdSeat = 'threshold-test-seat';
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        [thresholdSeat]: { dailyCapNanodollars: '1000000000', hardStop: true }, // $1.00 cap
      },
    });

    // 14a. Test exactly 80.0% (800,000,000 committed on 1,000,000,000 cap): state MUST be 'ok', NOT 'warning'
    const hold80Id = 'hold-exact-80';
    recordHold({
      holdId: hold80Id,
      wakeId: 'wake-80',
      seatId: thresholdSeat,
      amountNanodollars: '800000000',
      basis: 'default',
      overBudget: false,
      ts: new Date().toISOString(),
    });

    const status80 = getBudgetStatus(thresholdSeat);
    assert.equal(status80.committedNanodollars, '800000000');
    assert.equal(status80.state, 'ok', 'At exactly 80.0%, state must be ok, strictly not warning');

    // 14b. Test strictly > 80.0% (801,000,000 committed): state MUST be 'warning'
    releaseHold({ holdId: hold80Id, reason: 'failed_no_receipt' });
    const holdOver80Id = 'hold-over-80';
    recordHold({
      holdId: holdOver80Id,
      wakeId: 'wake-over-80',
      seatId: thresholdSeat,
      amountNanodollars: '801000000',
      basis: 'default',
      overBudget: false,
      ts: new Date().toISOString(),
    });

    const statusOver80 = getBudgetStatus(thresholdSeat);
    assert.equal(statusOver80.committedNanodollars, '801000000');
    assert.equal(statusOver80.state, 'warning', 'At strictly > 80%, state must be warning');

    // 14c. Test > 100% (1,050,000,000 committed): state MUST be 'exceeded'
    releaseHold({ holdId: holdOver80Id, reason: 'failed_no_receipt' });
    recordHold({
      holdId: 'hold-exceeded',
      wakeId: 'wake-exceeded',
      seatId: thresholdSeat,
      amountNanodollars: '1050000000',
      basis: 'default',
      overBudget: false,
      ts: new Date().toISOString(),
    });

    const statusExceeded = getBudgetStatus(thresholdSeat);
    assert.equal(statusExceeded.state, 'exceeded', 'At > 100%, state must be exceeded');

    console.log('  [PASS] Case 14: unconditional threshold assertions verified (80% -> ok, 80.1% -> warning, 105% -> exceeded)');
  }

  // Case 15: Soft stop (hardStop: false) allows turn with overBudget: true (PASS 5 confirmation)
  {
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: '100000', hardStop: false }, // tiny cap $0.0001
      },
    });

    const admission = checkBudgetAdmission('marketing-lead', 'wake-soft-stop');
    assert.equal(admission.allowed, true, 'Soft stop must allow turn');
    assert.equal(admission.overBudget, true, 'overBudget must be true');

    console.log('  [PASS] Case 15: soft stop allows turn with overBudget flag');
  }

  // Case 16: REAL two-process concurrency with synchronization barrier and dead-process recovery (Hermes FAIL 11 & Finding B)
  {
    const barrierFile = path.join(testDataDir, 'process-barrier.txt');
    if (fs.existsSync(barrierFile)) fs.unlinkSync(barrierFile);

    // Test 1: Live child holding lock cannot have lock stolen by parent
    const liveChild = spawn(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `
      import fs from 'node:fs';
      import { withBudgetLock } from './src/lib/budget-ledger.ts';
      const barrier = process.argv[1];
      withBudgetLock(() => {
        fs.writeFileSync(barrier, 'holding');
        const start = Date.now();
        while (Date.now() - start < 400) {}
      });
      fs.writeFileSync(barrier, 'done');
      `,
      barrierFile,
    ], {
      env: { ...process.env, AIBOSS_DATA_DIR: testDataDir, AIBOSS_CONFIG_DIR: testConfigDir }
    });

    // Wait until child is actively holding lock with safe 5s deadline
    const startWait = Date.now();
    while (!fs.existsSync(barrierFile) || fs.readFileSync(barrierFile, 'utf-8') !== 'holding') {
      if (Date.now() - startWait > 5000) {
        throw new Error('Timeout waiting for child process to acquire lock');
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    // Parent attempts to acquire with 100ms timeout: MUST fail because child is alive!
    let parentTimeout = false;
    try {
      withBudgetLock(() => 'stolen', 100);
    } catch (err) {
      if (err.message.includes('timeout')) parentTimeout = true;
    }
    assert.equal(parentTimeout, true, 'Live process lock MUST NOT be stolen by concurrent process');

    // Wait for child to exit cleanly
    await new Promise((r) => liveChild.on('exit', r));

    // Parent acquires now: MUST succeed
    const parentAcquired = withBudgetLock(() => 'acquired_after_child', 2000);
    assert.equal(parentAcquired, 'acquired_after_child');

    // Test 2: Dead child process lock recovery via atomic reclaim (lease expired >5000ms)
    const deadChild = spawnSync(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `
      import fs from 'node:fs';
      import path from 'node:path';
      const lockDir = path.join(process.env.AIBOSS_DATA_DIR, 'budget', '.budget.lock');
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(
        path.join(lockDir, 'info.json'),
        JSON.stringify({ pid: process.pid, processStartedAt: '2026-01-01T00:00:00.000Z', token: 'dead-child-token', ts: Date.now() - 6000 })
      );
      process.exit(0);
      `
    ], {
      env: { ...process.env, AIBOSS_DATA_DIR: testDataDir, AIBOSS_CONFIG_DIR: testConfigDir }
    });
    assert.equal(deadChild.status, 0);

    // Parent sees lock left by dead process with expired lease: MUST safely reclaim via atomic rename and proceed!
    const recovered = withBudgetLock(() => 'recovered_dead_lock', 2000);
    assert.equal(recovered, 'recovered_dead_lock', 'Lock left by dead PID must be safely reclaimed');

    // Test 3: REAL two-process concurrent admission race with barrier
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'concurrent-racer': { dailyCapNanodollars: '1000000000', hardStop: true }, // $1.00 cap allows only ONE $0.70 run
      },
    });

    const admissionBarrier = path.join(testDataDir, 'admission-barrier.txt');
    const childResultFile = path.join(testDataDir, 'child-admission-result.json');
    if (fs.existsSync(admissionBarrier)) fs.unlinkSync(admissionBarrier);
    if (fs.existsSync(childResultFile)) fs.unlinkSync(childResultFile);

    const childRacer = spawn(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `
      import fs from 'node:fs';
      import { checkAdmissionAndRecordHold } from './src/lib/budget-ledger.ts';
      const [barrier, resultFile] = [process.argv[1], process.argv[2]];
      // Wait for release signal
      while (!fs.existsSync(barrier)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      const res = checkAdmissionAndRecordHold({
        seatId: 'concurrent-racer',
        wakeId: 'wake-child-race',
        holdId: 'hold-child-race',
      });
      fs.writeFileSync(resultFile, JSON.stringify({ allowed: res.allowed, reason: res.reason, holdId: res.hold ? res.hold.holdId : null }));
      `,
      admissionBarrier,
      childResultFile,
    ], {
      env: { ...process.env, AIBOSS_DATA_DIR: testDataDir, AIBOSS_CONFIG_DIR: testConfigDir }
    });

    // Give child 50ms to reach barrier loop
    await new Promise((r) => setTimeout(r, 50));
    // Trigger race by creating barrier
    fs.writeFileSync(admissionBarrier, 'GO');

    const parentRes = checkAdmissionAndRecordHold({
      seatId: 'concurrent-racer',
      wakeId: 'wake-parent-race',
      holdId: 'hold-parent-race',
    });

    await new Promise((r) => childRacer.on('exit', r));
    assert.ok(fs.existsSync(childResultFile), 'Child racer must produce result');
    const childRes = JSON.parse(fs.readFileSync(childResultFile, 'utf-8'));

    // Mutual exclusion: exactly one must be allowed, one must be rejected
    assert.notEqual(parentRes.allowed, childRes.allowed, 'Exactly one concurrent racer must be allowed');
    if (parentRes.allowed) {
      assert.equal(childRes.allowed, false);
      assert.equal(childRes.reason, 'budget_exceeded');
    } else {
      assert.equal(parentRes.allowed, false);
      assert.equal(parentRes.reason, 'budget_exceeded');
      assert.equal(childRes.allowed, true);
    }

    // Test 4: REAL two-process concurrent settle race
    const settleHoldId = 'hold-concurrent-settle';
    recordHold({
      holdId: settleHoldId,
      wakeId: 'wake-settle-conc',
      seatId: 'concurrent-racer',
      amountNanodollars: '500000000',
      basis: 'default',
      overBudget: false,
      ts: new Date().toISOString(),
    });

    const settleBarrier = path.join(testDataDir, 'settle-barrier.txt');
    const childSettleResultFile = path.join(testDataDir, 'child-settle-result.json');
    if (fs.existsSync(settleBarrier)) fs.unlinkSync(settleBarrier);
    if (fs.existsSync(childSettleResultFile)) fs.unlinkSync(childSettleResultFile);

    const childSettler = spawn(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `
      import fs from 'node:fs';
      import { settleHold } from './src/lib/budget-ledger.ts';
      const [barrier, resultFile] = [process.argv[1], process.argv[2]];
      while (!fs.existsSync(barrier)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      const s = settleHold({
        holdId: 'hold-concurrent-settle',
        runId: 'run-child-settler',
        actualNanodollars: '500000000',
        priced: true,
      });
      fs.writeFileSync(resultFile, JSON.stringify({ settled: s !== null }));
      `,
      settleBarrier,
      childSettleResultFile,
    ], {
      env: { ...process.env, AIBOSS_DATA_DIR: testDataDir, AIBOSS_CONFIG_DIR: testConfigDir }
    });

    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(settleBarrier, 'GO');

    const parentSettle = settleHold({
      holdId: settleHoldId,
      runId: 'run-parent-settler',
      actualNanodollars: '500000000',
      priced: true,
    });

    await new Promise((r) => childSettler.on('exit', r));
    assert.ok(fs.existsSync(childSettleResultFile), 'Child settler must produce result');
    const childSettleRes = JSON.parse(fs.readFileSync(childSettleResultFile, 'utf-8'));

    // Exactly one settle succeeded, the other returned null
    assert.notEqual(parentSettle !== null, childSettleRes.settled, 'Exactly one concurrent settle must succeed');

    console.log('  [PASS] Case 16: real two-process barrier concurrency, admission race, and dead-PID recovery verified');
  }

  // Case 17: Historical estimate: unpriced models discarded, only fully priced runs averaged (Hermes FAIL 2)
  {
    const estSeat = 'pure-priced-seat';
    const nowIso = new Date().toISOString();

    // Run A: fully priced (model 1 = $1.00, model 2 = $0.50 -> total $1.50)
    recordCostReceipt({
      ts: nowIso,
      seatId: estSeat,
      runId: 'run-fully-priced-A',
      model: 'model-1',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '1000000000',
      priced: true,
      source: 'claude-stream-json',
    });
    recordCostReceipt({
      ts: nowIso,
      seatId: estSeat,
      runId: 'run-fully-priced-A',
      model: 'model-2',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '500000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Run B: PARTIALLY unpriced (model 1 = $2.00, model 2 = null/unpriced) -> MUST BE DISCARDED!
    recordCostReceipt({
      ts: nowIso,
      seatId: estSeat,
      runId: 'run-partial-unpriced-B',
      model: 'model-1',
      inputTokens: 200,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 100,
      costNanodollars: '2000000000',
      priced: true,
      source: 'claude-stream-json',
    });
    recordCostReceipt({
      ts: nowIso,
      seatId: estSeat,
      runId: 'run-partial-unpriced-B',
      model: 'model-2',
      inputTokens: 200,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 100,
      costNanodollars: null,
      priced: false,
      source: 'claude-stream-json',
    });

    // Run C: fully priced ($1.00)
    recordCostReceipt({
      ts: nowIso,
      seatId: estSeat,
      runId: 'run-fully-priced-C',
      model: 'model-1',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '1000000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Average of fully priced runs A ($1.50) and C ($1.00):
    // (1500000000 + 1000000000) / 2 = 1250000000 ($1.25)
    const estResult = getHistoricalRunEstimate(estSeat);
    assert.equal(
      estResult.amountNanodollars,
      '1250000000',
      'Run B with unpriced model must NOT be included in historical estimate average'
    );
    assert.equal(estResult.basis, 'estimate:last5');

    console.log('  [PASS] Case 17: historical estimate strictly discards runs with unpriced models');
  }

  // Case 18: Receipt deduplication by (runId, model) and exact "0" cost preservation (Hermes N1, N2)
  {
    const dedupRunId = 'run-dedup-test';
    const nowIso = new Date().toISOString();

    // Record first receipt via recordCostReceipt
    recordCostReceipt({
      ts: nowIso,
      seatId: 'marketing-lead',
      runId: dedupRunId,
      model: 'duplicate-model',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '100000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Directly append a second receipt for the same model to simulate duplicate ledger entries on disk
    const todayStr = nowIso.split('T')[0];
    const costFile = path.join(testDataDir, 'costs', `${todayStr}.jsonl`);
    fs.appendFileSync(
      costFile,
      JSON.stringify({
        ts: new Date(Date.now() + 1000).toISOString(),
        seatId: 'marketing-lead',
        runId: dedupRunId,
        model: 'duplicate-model',
        inputTokens: 120,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 60,
        costNanodollars: '120000000',
        priced: true,
        source: 'claude-stream-json',
      }) + '\n'
    );

    const receipts = getCostReceiptsForRun(dedupRunId);
    assert.equal(receipts.length, 1, 'Duplicate model receipts for same runId must be folded to 1');
    assert.equal(receipts[0].costNanodollars, '120000000', 'Latest receipt must be retained');

    console.log('  [PASS] Case 18: getCostReceiptsForRun folds duplicate receipts by (runId, model)');
  }

  // Case 19: Safe monetary formatting with formatNanodollars and MAX_MONEY_UNITS bounds (Hermes N3)
  {
    assert.equal(formatNanodollars(null), '$0.00');
    assert.equal(formatNanodollars(undefined), '$0.00');
    assert.equal(formatNanodollars('0'), '$0.00');
    assert.equal(formatNanodollars('733263400'), '$0.73');
    assert.equal(formatNanodollars(733263400n), '$0.73');

    // Values exceeding MAX_MONEY_UNITS must not throw, returning bounded representation
    const huge = (MAX_MONEY_UNITS + 100n).toString();
    const formattedHuge = formatNanodollars(huge);
    assert.equal(formattedHuge, '$---', 'Huge value must format safely without throwing');

    console.log('  [PASS] Case 19: formatNanodollars bounds checking against MAX_MONEY_UNITS verified');
  }

  // Case 20: Real crash injection via SIGKILL right after JSONL append and admission recovery (Item 6 & 11)
  {
    const todayStr = new Date().toISOString().split('T')[0];
    const budgetLogPath = path.join(testDataDir, 'budget', `${todayStr}.jsonl`);
    const crashedHoldId = 'hold-crash-sigkill-' + Date.now();
    const crashedWakeId = 'wake-crash-sigkill-' + Date.now();

    // Baseline: make sure checkpoint is initialized and clean
    initBudgetLedger();
    const cpBefore = loadOpenHoldsCheckpoint();
    assert.ok(cpBefore, 'Checkpoint must exist');
    assert.equal(cpBefore.holds[crashedHoldId], undefined);

    // 1. Configure baseline config first so default estimate and state are consistent
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '500000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: null, hardStop: true },
      },
    });

    const currentStatus = getBudgetStatus('marketing-lead');
    const baseCommitted = BigInt(currentStatus.committedNanodollars);
    const est = calculateRunEstimate('marketing-lead');
    const estBig = BigInt(est.amountNanodollars);
    const crashedHoldAmount = 600000000n;
    // Set cap just below (baseCommitted + crashedHold + estBig) so crashed hold tips it over the cap
    const capNanodollars = (baseCommitted + crashedHoldAmount + estBig - 1000n).toString();
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '500000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: capNanodollars, hardStop: true },
      },
    });

    // 2. Spawn child process that executes real recordHold with AIBOSS_TEST_CRASH_AFTER_JSONL_APPEND=1
    // The child must be terminated by SIGKILL immediately after writing to the JSONL SST
    const childScript = `
      import { recordHold } from './src/lib/budget-ledger.ts';
      recordHold({
        holdId: '${crashedHoldId}',
        wakeId: '${crashedWakeId}',
        seatId: 'marketing-lead',
        amountNanodollars: '600000000',
        basis: 'default',
        overBudget: false,
        ts: new Date().toISOString(),
      });
    `;

    const childRes = spawnSync(process.execPath, ['--import', './tests/register.mjs', '-e', childScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AIBOSS_DATA_DIR: testDataDir,
        AIBOSS_CONFIG_DIR: testConfigDir,
        AIBOSS_TEST_CRASH_AFTER_JSONL_APPEND: '1',
      },
    });

    // Assert that child process was abruptly terminated by SIGKILL
    assert.equal(childRes.signal, 'SIGKILL', 'Process calling recordHold must be killed by SIGKILL immediately after JSONL append');

    // 3. Verify on-disk invariant:
    // - SST file on disk MUST contain the crashed hold record
    // - Checkpoint on disk (open-holds.json) must NOT yet contain the crashed hold (proves crash preceded checkpoint write)
    const logLines = fs.readFileSync(budgetLogPath, 'utf-8').trim().split('\n');
    const hasRecordInLog = logLines.some((l) => l.includes(crashedHoldId));
    assert.ok(hasRecordInLog, 'SST JSONL log file must contain the durable hold appended before SIGKILL');

    const cpAfterCrash = loadOpenHoldsCheckpoint();
    assert.equal(
      cpAfterCrash.holds[crashedHoldId],
      undefined,
      'Checkpoint on disk must NOT contain crashed hold before replay (write was interrupted)'
    );

    // 4. Admission recovery (Hermes Item 6 & 11):
    // Admission transaction calls replayAndGetCheckpoint() FIRST under the lock before cap checks.
    // Seat cap is $1.00. The crashed hold is $0.60.
    const subsequentWakeId = 'wake-after-crash-' + Date.now();
    const subsequentHoldId = 'hold-after-crash-' + Date.now();
    const admissionRes = checkAdmissionAndRecordHold({
      seatId: 'marketing-lead',
      wakeId: subsequentWakeId,
      holdId: subsequentHoldId,
    });

    assert.equal(admissionRes.allowed, false, 'Admission must reject because recovered crashed hold counts against daily cap');
    assert.equal(admissionRes.reason, 'budget_exceeded');
    assert.equal(admissionRes.admission.scope, 'seat');

    // Checkpoint has now been durably updated by the admission replay
    const cpRecovered = loadOpenHoldsCheckpoint();
    assert.ok(cpRecovered.holds[crashedHoldId], 'Checkpoint must now contain the recovered crashed hold');
    assert.equal(isHoldClosed(crashedHoldId), false, 'Recovered hold must be recognized as active');

    // 5. Clean up recovered hold by releasing it
    const releaseRes = releaseHold({
      holdId: crashedHoldId,
      reason: 'failed_no_receipt',
    });
    assert.ok(releaseRes, 'Releasing recovered hold must succeed');
    assert.equal(isHoldClosed(crashedHoldId), true, 'Released hold must now be closed');

    // Now crashed hold is released, committed spend returns to baseCommitted.
    // baseCommitted + estBig <= capNanodollars, so subsequent admission must admit!
    const allowedWakeId = 'wake-allowed-' + Date.now();
    const allowedHoldId = 'hold-allowed-' + Date.now();
    const admissionRes2 = checkAdmissionAndRecordHold({
      seatId: 'marketing-lead',
      wakeId: allowedWakeId,
      holdId: allowedHoldId,
    });
    assert.equal(admissionRes2.allowed, true, 'Subsequent admission must succeed once recovered hold is cleared');
    assert.ok(admissionRes2.hold, 'Hold must be created for admitted run');

    console.log('  [PASS] Case 20: real SIGKILL crash injection during recordHold recovers via admission replay and enforces cap');
  }

  // Case 21: Pending run age preservation and receipt folding (Hermes Item 3 & 5 / FAIL 7 & 3)
  {
    const wakePendingId = 'wake-pending-' + Date.now();
    const runPendingId = 'run-pending-' + Date.now();
    const holdPendingId = 'hold-pending-' + Date.now();
    const twoHoursAgoIso = new Date(Date.now() - 7200000).toISOString();

    const holdPending = recordHold({
      holdId: holdPendingId,
      wakeId: wakePendingId,
      seatId: 'marketing-lead',
      amountNanodollars: '800000000',
      basis: 'default',
      overBudget: false,
      ts: twoHoursAgoIso,
    });

    recordRun({
      runId: runPendingId,
      wakeId: wakePendingId,
      holdId: holdPendingId,
      seatId: 'marketing-lead',
      status: 'failed',
      costStatus: 'pending',
      startedAt: twoHoursAgoIso,
      attempt: 1,
    });

    // Record partial cost receipt for this run
    recordCostReceipt({
      ts: new Date().toISOString(),
      seatId: 'marketing-lead',
      runId: runPendingId,
      model: 'model-a',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '300000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Run reconciliation with maxAgeMs = 3600000 (1 hour).
    // Because costStatus is 'pending', the hold MUST NOT be settled with partial receipts and MUST NOT be expired!
    reconcileOpenHolds({ maxAgeMs: 3600000 });

    const holdsMap1 = getActiveHolds();
    assert.ok(
      holdsMap1.has(holdPendingId),
      'Hold for terminal run with costStatus=pending must be preserved even if hold is older than maxAgeMs'
    );

    // Now update run costStatus to 'reconciled'
    updateRun(runPendingId, {
      costStatus: 'reconciled',
    });

    // Next reconciliation must cleanly settle the hold using the full cost receipt ($0.30)
    reconcileOpenHolds({ maxAgeMs: 3600000 });
    const holdsMap2 = getActiveHolds();
    assert.equal(
      holdsMap2.has(holdPendingId),
      false,
      'Hold must be settled once costStatus transitions to reconciled'
    );
    assert.equal(isHoldClosed(holdPendingId), true);

    console.log('  [PASS] Case 21: pending run age preservation and receipt folding verified');
  }

  // Case 22: PID liveness check, finite expiration for dead/missing PID, and PID reuse detection (Hermes Item 4 / FAIL 8 & Finding B)
  {
    // 1. Direct process liveness and start-time unit verification
    const currentPid = process.pid;
    const currentStartTime = getProcessStartTime(currentPid);
    assert.ok(currentStartTime, 'Current process start time must be queryable via ps');
    assert.equal(
      checkProcessLiveness(currentPid, undefined),
      'unverified',
      'Process without expectedStartedAt must return unverified (Hermes Item 8)'
    );
    assert.equal(isProcessAlive(currentPid, currentStartTime), true, 'Current process must be alive with matching start time');

    // PID reuse simulation: mismatched start time must report process dead
    const fakeStartTime = '1970-01-01T00:00:00.000Z';
    assert.equal(
      isProcessAlive(currentPid, fakeStartTime),
      false,
      'Mismatched process start time must indicate PID was recycled'
    );

    // Non-existent PID must report dead
    const deadPid = 999999;
    assert.equal(isProcessAlive(deadPid), false, 'Non-existent PID must report dead');

    // 2. Finite expiration in reconcileOpenHolds
    const oldTs = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago

    // Hold A: Has LIVE running worker (current PID and start time) -> MUST NOT EXPIRE
    const holdLiveId = 'hold-live-proc-' + Date.now();
    const runLiveId = 'run-live-proc-' + Date.now();
    recordHold({
      holdId: holdLiveId,
      wakeId: 'wake-live-proc',
      seatId: 'marketing-lead',
      amountNanodollars: '600000000',
      basis: 'default',
      overBudget: false,
      worker: {
        pid: currentPid,
        processStartedAt: currentStartTime,
        instanceId: 'inst-live',
      },
      ts: oldTs,
    });
    recordRun({
      runId: runLiveId,
      wakeId: 'wake-live-proc',
      holdId: holdLiveId,
      seatId: 'marketing-lead',
      status: 'running',
      pid: currentPid,
      processStartedAt: currentStartTime,
      instanceId: 'inst-live',
      startedAt: oldTs,
      attempt: 1,
    });

    // Hold B: Has DEAD worker PID -> MUST EXPIRE and be released
    const holdDeadId = 'hold-dead-proc-' + Date.now();
    const runDeadId = 'run-dead-proc-' + Date.now();
    recordHold({
      holdId: holdDeadId,
      wakeId: 'wake-dead-proc',
      seatId: 'marketing-lead',
      amountNanodollars: '600000000',
      basis: 'default',
      overBudget: false,
      worker: {
        pid: deadPid,
        processStartedAt: oldTs,
        instanceId: 'inst-dead',
      },
      ts: oldTs,
    });
    recordRun({
      runId: runDeadId,
      wakeId: 'wake-dead-proc',
      holdId: holdDeadId,
      seatId: 'marketing-lead',
      status: 'running',
      pid: deadPid,
      processStartedAt: oldTs,
      instanceId: 'inst-dead',
      startedAt: oldTs,
      attempt: 1,
    });

    // Hold C: Has RECYCLED PID (current PID but mismatched start time) -> MUST EXPIRE
    const holdRecycledId = 'hold-recycled-proc-' + Date.now();
    const runRecycledId = 'run-recycled-proc-' + Date.now();
    recordHold({
      holdId: holdRecycledId,
      wakeId: 'wake-recycled-proc',
      seatId: 'marketing-lead',
      amountNanodollars: '600000000',
      basis: 'default',
      overBudget: false,
      worker: {
        pid: currentPid,
        processStartedAt: fakeStartTime,
        instanceId: 'inst-recycled',
      },
      ts: oldTs,
    });
    recordRun({
      runId: runRecycledId,
      wakeId: 'wake-recycled-proc',
      holdId: holdRecycledId,
      seatId: 'marketing-lead',
      status: 'running',
      pid: currentPid,
      processStartedAt: fakeStartTime,
      instanceId: 'inst-recycled',
      startedAt: oldTs,
      attempt: 1,
    });

    // Hold D: Has NO worker identity beyond maxAgeMs -> MUST KEEP HOLD to avoid over-admission (Hermes Item 8)
    const holdNoWorkerId = 'hold-no-worker-proc-' + Date.now();
    const runNoWorkerId = 'run-no-worker-proc-' + Date.now();
    recordHold({
      holdId: holdNoWorkerId,
      wakeId: 'wake-no-worker-proc',
      seatId: 'marketing-lead',
      amountNanodollars: '600000000',
      basis: 'default',
      overBudget: false,
      ts: oldTs,
    });
    recordRun({
      runId: runNoWorkerId,
      wakeId: 'wake-no-worker-proc',
      holdId: holdNoWorkerId,
      seatId: 'marketing-lead',
      status: 'running',
      startedAt: oldTs,
      attempt: 1,
    });

    // Hold E: Has worker identity with unverified liveness (missing processStartedAt) -> MUST KEEP HOLD (Hermes Item 8)
    const holdUnverifiedId = 'hold-unverified-proc-' + Date.now();
    const runUnverifiedId = 'run-unverified-proc-' + Date.now();
    recordHold({
      holdId: holdUnverifiedId,
      wakeId: 'wake-unverified-proc',
      seatId: 'marketing-lead',
      amountNanodollars: '600000000',
      basis: 'default',
      overBudget: false,
      worker: {
        pid: currentPid,
        instanceId: 'inst-unverified',
      },
      ts: oldTs,
    });
    recordRun({
      runId: runUnverifiedId,
      wakeId: 'wake-unverified-proc',
      holdId: holdUnverifiedId,
      seatId: 'marketing-lead',
      status: 'running',
      pid: currentPid,
      startedAt: oldTs,
      attempt: 1,
    });

    // Run reconciliation with maxAgeMs = 3600000 (1 hour)
    reconcileOpenHolds({ maxAgeMs: 3600000 });

    const remainingActive = getActiveHolds();
    assert.ok(
      remainingActive.has(holdLiveId),
      'Hold with live worker must NOT be expired regardless of hold age'
    );
    assert.equal(
      remainingActive.has(holdDeadId),
      false,
      'Hold with dead worker PID must be expired and released'
    );
    assert.equal(
      remainingActive.has(holdRecycledId),
      false,
      'Hold with recycled PID (start time mismatch) must be expired and released'
    );
    assert.equal(
      remainingActive.has(holdNoWorkerId),
      true,
      'Hold without verified worker PID must be retained to avoid over-admission (Hermes Item 8)'
    );
    assert.equal(
      remainingActive.has(holdUnverifiedId),
      true,
      'Hold with unverified worker liveness must be retained and NEVER expire by age alone (Hermes Item 8)'
    );

    console.log('  [PASS] Case 22: live PID preservation, unverified hold retention, and dead/recycled PID expiration verified');
  }

  // Case 23: Route handler GET /api/budget verification (200, 404, 503 snapshot_not_ready)
  {
    // 1. Office status (no seat query param) -> 200 OK
    const officeReq = new Request('http://127.0.0.1:4330/api/budget');
    const officeRes = await getBudgetRoute(officeReq);
    assert.equal(officeRes.status, 200, 'GET /api/budget must return 200 OK for office status');
    const officeJson = await officeRes.json();
    assert.equal(officeJson.seat, null);
    assert.ok(typeof officeJson.spentNanodollars === 'string');

    // 2. Known seat status -> 200 OK
    const seatReq = new Request('http://127.0.0.1:4330/api/budget?seat=marketing-lead');
    const seatRes = await getBudgetRoute(seatReq);
    assert.equal(seatRes.status, 200, 'GET /api/budget?seat=marketing-lead must return 200 OK');
    const seatJson = await seatRes.json();
    assert.equal(seatJson.seat, 'marketing-lead');

    // 3. Unknown seat -> 404 Not Found
    const unknownReq = new Request('http://127.0.0.1:4330/api/budget?seat=non-existent-seat-xyz');
    const unknownRes = await getBudgetRoute(unknownReq);
    assert.equal(unknownRes.status, 404, 'GET /api/budget for unknown seat must return 404');
    const unknownJson = await unknownRes.json();
    assert.equal(unknownJson.error, 'unknown_seat');

    // 4. Snapshot not ready -> 503 Service Unavailable
    // Temporarily rename open-holds.json to simulate cold start prior to initBudgetLedger
    const openHoldsPath = path.join(testDataDir, 'budget', 'open-holds.json');
    const backupPath = path.join(testDataDir, 'budget', 'open-holds.json.bak');
    let hasBackup = false;
    if (fs.existsSync(openHoldsPath)) {
      fs.renameSync(openHoldsPath, backupPath);
      hasBackup = true;
    }
    try {
      const unreadyRes = await getBudgetRoute(officeReq);
      assert.equal(unreadyRes.status, 503, 'GET /api/budget when snapshot is not ready must return 503');
      const unreadyJson = await unreadyRes.json();
      assert.equal(unreadyJson.error, 'snapshot_not_ready');
    } finally {
      if (hasBackup && fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, openHoldsPath);
      }
    }

    console.log('  [PASS] Case 23: GET /api/budget route returns 200, 404, and 503 snapshot_not_ready as expected');
  }

  // Case 24: Multi-partition checkpoint positions & cross-midnight replay (Finding M2)
  {
    const olderDate = '2026-09-01';
    const olderFile = `${olderDate}.jsonl`;
    const olderLogPath = path.join(testDataDir, 'budget', olderFile);
    const holdOldId = 'hold-older-partition-' + Date.now();

    // 1. Write a hold to an older partition (simulate yesterday or 3 days ago)
    const oldHoldRecord = {
      type: 'hold',
      holdId: holdOldId,
      wakeId: 'wake-old-part',
      seatId: 'marketing-lead',
      amountNanodollars: '350000000',
      basis: 'default',
      overBudget: false,
      ts: `${olderDate}T12:00:00.000Z`,
    };
    fs.appendFileSync(olderLogPath, JSON.stringify(oldHoldRecord) + '\n', 'utf-8');

    // Replay: checkpoint should index older partition at 1 and track holdOldId
    const cp1 = replayAndGetCheckpoint();
    assert.equal(cp1.filePositions[olderFile], 1, 'Older partition line position must be tracked in checkpoint');
    assert.ok(cp1.holds[holdOldId], 'Hold from older partition must be active in checkpoint');
    assert.equal(isHoldClosed(holdOldId), false);

    // 2. Cross-midnight settle: settle record written back to older partition
    const oldSettleRecord = {
      type: 'settle',
      holdId: holdOldId,
      runId: 'run-settle-cross-midnight',
      actualNanodollars: '300000000',
      priced: true,
      ts: `${olderDate}T14:00:00.000Z`,
    };
    fs.appendFileSync(olderLogPath, JSON.stringify(oldSettleRecord) + '\n', 'utf-8');

    // Replay: checkpoint should detect delta in older partition (advancing to 2) and delete hold
    const cp2 = replayAndGetCheckpoint();
    assert.equal(cp2.filePositions[olderFile], 2, 'Delta in older partition must be detected and position updated');
    assert.equal(cp2.holds[holdOldId], undefined, 'Settled hold from older partition must be removed from checkpoint');
    assert.equal(isHoldClosed(holdOldId), true, 'Hold must be reported as closed');

    console.log('  [PASS] Case 24: multi-partition checkpoint positions & cross-midnight replay verified (Finding M2)');
  }

  // Case 25: Single-instance startup lock: 4 gaps of Condition (b) (Hermes Vòng 8 & PM v09)
  {
    const lockFilePath = path.join(testDataDir, '.instance.lock');

    // 0. Base setup: Acquire instance lock: must create a SINGLE FILE via open(O_EXCL)
    resetFencingForTest();
    if (fs.existsSync(lockFilePath)) {
      if (fs.statSync(lockFilePath).isDirectory()) fs.rmSync(lockFilePath, { recursive: true, force: true });
      else fs.unlinkSync(lockFilePath);
    }
    const lock1 = acquireInstanceLock(testDataDir);
    assert.equal(lock1.acquired, true, 'Acquiring instance lock must succeed for first runner');
    assert.equal(lock1.pid, process.pid);
    assert.ok(fs.existsSync(lockFilePath), '.instance.lock file must exist on disk');
    assert.equal(
      fs.statSync(lockFilePath).isDirectory(),
      false,
      '.instance.lock must be a FILE, not a directory (Hermes Condition b)'
    );

    // Reject second concurrent runner via open(O_EXCL) EEXIST
    const childLockScript = `
      import { acquireInstanceLock } from './src/lib/budget-ledger.ts';
      const res = acquireInstanceLock(process.env.AIBOSS_DATA_DIR);
      if (!res.acquired) {
        process.exit(42);
      }
      process.exit(0);
    `;
    const childLockRes = spawnSync(process.execPath, ['--import', './tests/register.mjs', '-e', childLockScript], {
      cwd: process.cwd(),
      env: { ...process.env, AIBOSS_DATA_DIR: testDataDir },
    });
    assert.equal(childLockRes.status, 42, 'Second server runner process must be rejected by instance lock (acquired: false)');
    releaseInstanceLock(testDataDir);

    // -------------------------------------------------------------
    // Khe ①: Sticky fencing — bars ALL writers across process lifetime
    // -------------------------------------------------------------
    resetFencingForTest();
    if (fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath);
    const lockA = acquireInstanceLock(testDataDir);
    assert.equal(lockA.acquired, true);
    assert.equal(isFenced(), false, 'Instance initially not fenced');

    // Simulate loss of lock ownership: fenceInstance() is triggered
    fenceInstance();
    assert.equal(isFenced(), true, 'isFenced() must be true after revocation/fence');

    // stopOfficeRunner / releaseInstanceLock sets activeInstanceToken = null
    releaseInstanceLock(testDataDir);

    // Assert that activeInstanceToken is now null, but isFenced() is STILL true (sticky)!
    assert.equal(isFenced(), true, 'isFenced() must remain sticky true even after releaseInstanceLock clears activeInstanceToken');

    // Subtest 1.1: Calling acquireInstanceLock again while fenced MUST be permanently refused and remain fenced
    assert.throws(
      () => acquireInstanceLock(testDataDir),
      /Instance is fenced/,
      'acquireInstanceLock must throw and permanently refuse to acquire when instance has been fenced'
    );
    assert.equal(isFenced(), true, 'Instance must remain fenced after refused acquire attempt');
    assert.equal(hasActiveInstanceToken(), false, 'Instance must not obtain token after refused acquire');

    // Subtest 1.2: Calling flushInFlightTurns with an active in-flight turn leaves runs/*.jsonl and costs/*.jsonl byte-for-byte identical (MD5 unchanged)
    const runsDir = path.join(testDataDir, 'runs');
    const costsDir = path.join(testDataDir, 'costs');
    fs.mkdirSync(runsDir, { recursive: true });
    fs.mkdirSync(costsDir, { recursive: true });

    const todayDate = new Date().toISOString().split('T')[0];
    const runFile = path.join(runsDir, `${todayDate}.jsonl`);
    const costFile = path.join(costsDir, `${todayDate}.jsonl`);
    if (!fs.existsSync(runFile)) fs.writeFileSync(runFile, '{"type":"seed_run"}\n', 'utf-8');
    if (!fs.existsSync(costFile)) fs.writeFileSync(costFile, '{"type":"seed_cost"}\n', 'utf-8');

    const runMd5Before = crypto.createHash('md5').update(fs.readFileSync(runFile)).digest('hex');
    const costMd5Before = crypto.createHash('md5').update(fs.readFileSync(costFile)).digest('hex');

    // Register an active in-flight turn
    registerInFlightTurnForTest({
      seat: 'marketing-lead',
      bell_id: 'bell-fenced-test',
      wakeId: 'wake-fenced-test',
      runId: 'run-fenced-test',
      holdId: 'hold-fenced-test',
      startIso: new Date().toISOString(),
      startTime: Date.now(),
    });
    assert.equal(getInFlightTurnCountForTest(), 1, 'In-flight turn registered');

    // Call flushInFlightTurns while fenced
    flushInFlightTurns('server shutdown while fenced');

    // Assert: In-flight map is cleared, but disk files are 100% byte-for-byte identical
    const runMd5After = crypto.createHash('md5').update(fs.readFileSync(runFile)).digest('hex');
    const costMd5After = crypto.createHash('md5').update(fs.readFileSync(costFile)).digest('hex');
    assert.equal(runMd5After, runMd5Before, 'runs/*.jsonl MD5 must remain byte-for-byte identical after fenced flush');
    assert.equal(costMd5After, costMd5Before, 'costs/*.jsonl MD5 must remain byte-for-byte identical after fenced flush');
    assert.equal(getInFlightTurnCountForTest(), 0, 'In-flight turns cleared without writing to disk');

    // Subtest 1.3: Fenced process firing late turn completion callbacks (receipt & updateRun) is barred from writing
    assert.throws(
      () => recordCostReceipt({
        ts: new Date().toISOString(),
        seatId: 'marketing-lead',
        runId: 'run-late-callback',
        model: 'model-x',
        inputTokens: 100,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 50,
        costNanodollars: '100000000',
        priced: true,
        source: 'claude-stream-json',
      }),
      /Instance is fenced/,
      'recordCostReceipt must throw when instance is fenced (barring late receipts)'
    );

    assert.throws(
      () => updateRun('run-late-callback', {
        status: 'finished',
        finishedAt: new Date().toISOString(),
      }),
      /Instance is fenced/,
      'updateRun must throw when instance is fenced (barring late updates)'
    );

    assert.throws(
      () => withBudgetLock(() => 'late_write_payload'),
      /Instance has been fenced/,
      'withBudgetLock must permanently refuse writes when instance has been fenced (Khe ①)'
    );

    // Verify disk files STILL byte-for-byte unchanged
    const runMd5Final = crypto.createHash('md5').update(fs.readFileSync(runFile)).digest('hex');
    const costMd5Final = crypto.createHash('md5').update(fs.readFileSync(costFile)).digest('hex');
    assert.equal(runMd5Final, runMd5Before, 'runs/*.jsonl MD5 unchanged after late callback attempts');
    assert.equal(costMd5Final, costMd5Before, 'costs/*.jsonl MD5 unchanged after late callback attempts');

    // Subtest 1.4: tickRunner and logRunnerEvent when fenced do NOT write to runner.log.jsonl (Khe ①)
    const runnerLogFile = path.join(testDataDir, 'runner.log.jsonl');
    if (!fs.existsSync(runnerLogFile)) fs.writeFileSync(runnerLogFile, '{"event":"seed_log"}\n', 'utf-8');
    const runnerLogMd5Before = crypto.createHash('md5').update(fs.readFileSync(runnerLogFile)).digest('hex');

    logRunnerEvent({
      timestamp: new Date().toISOString(),
      seat: 'marketing-lead',
      bell_id: 'bell-fenced-test',
      event: 'skipped',
      skipped_reason: 'seat_busy_in_process',
    });
    const runnerLogMd5AfterLog = crypto.createHash('md5').update(fs.readFileSync(runnerLogFile)).digest('hex');
    assert.equal(runnerLogMd5AfterLog, runnerLogMd5Before, 'logRunnerEvent must NOT write to runner.log.jsonl when instance is fenced');

    // Also call tickRunner while fenced: must exit immediately returning 0 and leave log unchanged
    const tickResult = await tickRunner();
    assert.equal(tickResult, 0, 'tickRunner must return 0 immediately when instance is fenced');
    const runnerLogMd5AfterTick = crypto.createHash('md5').update(fs.readFileSync(runnerLogFile)).digest('hex');
    assert.equal(runnerLogMd5AfterTick, runnerLogMd5Before, 'tickRunner must NOT write to runner.log.jsonl when instance is fenced');

    // Subtest 1.5: ghiMocKetThuc does NOT write to o-phien.json when instance is fenced (Khe ①)
    const oPhienFile = path.join(testDataDir, 'o-phien.json');
    const initialOPhien = { 'slot-1': { ma_nhan_su: 'marketing-lead', ma_phien: 'phien-1', cap_nhat: Date.now(), moc_ket_thuc: 100 } };
    fs.writeFileSync(oPhienFile, JSON.stringify(initialOPhien, null, 2), 'utf-8');
    const oPhienMd5Before = crypto.createHash('md5').update(fs.readFileSync(oPhienFile)).digest('hex');

    ghiMocKetThuc('slot-1', 99999);
    const oPhienMd5After = crypto.createHash('md5').update(fs.readFileSync(oPhienFile)).digest('hex');
    assert.equal(oPhienMd5After, oPhienMd5Before, 'ghiMocKetThuc must NOT write to o-phien.json when instance is fenced');

    // Subtest 1.6: In production, test bypass switch is inert: guards STILL block writes! (Khe ①)
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.AIBOSS_TEST_DISABLE_FENCE_GUARD = '1';
    try {
      assert.equal(isFenceGuardDisabledForTest(), false, 'isFenceGuardDisabledForTest must return false when NODE_ENV is production');
      assert.throws(
        () => withBudgetLock(() => 'should_throw_in_prod'),
        /Instance has been fenced/,
        'withBudgetLock MUST still block writes in production even if AIBOSS_TEST_DISABLE_FENCE_GUARD=1'
      );
      ghiMocKetThuc('slot-1', 88888);
      const oPhienMd5Prod = crypto.createHash('md5').update(fs.readFileSync(oPhienFile)).digest('hex');
      assert.equal(oPhienMd5Prod, oPhienMd5Before, 'ghiMocKetThuc MUST still be blocked in production');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      delete process.env.AIBOSS_TEST_DISABLE_FENCE_GUARD;
    }

    // Subtest 1.7: Positive counterproof for Khe ①: setting __testHooks.disableFenceGuard = true bypasses fence guard
    __testHooks.disableFenceGuard = true;
    try {
      assert.equal(isFenceGuardDisabledForTest(), true);
      let counterproofExecuted = false;
      withBudgetLock(() => { counterproofExecuted = true; });
      assert.equal(counterproofExecuted, true, 'Setting __testHooks.disableFenceGuard = true must bypass fence guard (counterproof)');
    } finally {
      __testHooks.disableFenceGuard = undefined;
    }

    // -------------------------------------------------------------
    // Khe ②: Crash between open(O_EXCL) and write metadata does NOT block startup indefinitely
    // -------------------------------------------------------------
    resetFencingForTest();
    // Simulate crash right after open(O_EXCL): empty 0-byte file
    fs.writeFileSync(lockFilePath, '', 'utf-8');

    // Subtest 2.1: Recent crash (< 10s): acquireInstanceLock must fail closed to protect ongoing write
    const recentAttempt = acquireInstanceLock(testDataDir);
    assert.equal(recentAttempt.acquired, false, 'Uninitialized lock <10s must fail closed (give writer time)');

    // Subtest 2.2: Orphaned crash (> 10s): simulate file older than 10s via utimesSync
    const oldTime = (Date.now() - 15000) / 1000;
    fs.utimesSync(lockFilePath, oldTime, oldTime);

    // Now acquireInstanceLock must detect orphaned empty lock, reclaim via atomic rename, and succeed!
    const orphanedReclaim = acquireInstanceLock(testDataDir);
    assert.equal(orphanedReclaim.acquired, true, 'Orphaned empty lock from startup crash must be safely reclaimed (Khe ②)');
    assert.equal(orphanedReclaim.pid, process.pid);
    const validMetadata = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert.equal(validMetadata.pid, process.pid, 'Lock file must contain valid JSON metadata after reclaim');
    releaseInstanceLock(testDataDir);

    // Subtest 2.3: Half-written non-empty JSON lock (e.g. crash during write) older than 10s MUST be safely reclaimed!
    fs.writeFileSync(lockFilePath, '{"pid":123,"tok', 'utf-8');
    const recentHalfAttempt = acquireInstanceLock(testDataDir);
    assert.equal(recentHalfAttempt.acquired, false, 'Half-written lock <10s must fail closed');

    // Make it older than 10s via utimesSync
    fs.utimesSync(lockFilePath, oldTime, oldTime);
    const halfReclaim = acquireInstanceLock(testDataDir);
    assert.equal(halfReclaim.acquired, true, 'Half-written non-empty JSON lock >10s must be safely reclaimed (Khe ② recovery)');
    assert.equal(halfReclaim.pid, process.pid);
    const validHalfMetadata = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert.equal(validHalfMetadata.pid, process.pid, 'Lock file must contain valid JSON metadata after half-written lock reclaim');
    releaseInstanceLock(testDataDir);

    // Subtest 2.4: Contender modifying half-written lock during beforeReplace causes reclaim to abort
    fs.writeFileSync(lockFilePath, '{"pid":123,"tok', 'utf-8');
    fs.utimesSync(lockFilePath, oldTime, oldTime);
    const contenderHalfToken = `contender-half-${Date.now()}`;
    __testHooks.beforeReplace = () => {
      fs.writeFileSync(
        lockFilePath,
        JSON.stringify({
          pid: process.pid,
          processStartedAt: getProcessStartTime(process.pid),
          token: contenderHalfToken,
          leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
          heartbeatAt: new Date().toISOString(),
          ts: new Date().toISOString(),
        }),
        'utf-8'
      );
    };

    const halfContenderReclaim = acquireInstanceLock(testDataDir);
    __testHooks.beforeReplace = undefined;
    assert.equal(halfContenderReclaim.acquired, false, 'Reclaim of corrupt lock must fail if contender modified content');
    const diskAfterHalfContender = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert.equal(diskAfterHalfContender.token, contenderHalfToken, 'Contender lock must be preserved');
    fs.unlinkSync(lockFilePath);
    resetFencingForTest();

    // -------------------------------------------------------------
    // Khe ③: Safe handling of legacy v06/v07 directory lock: Live owner protected, dead owner cleaned
    // -------------------------------------------------------------
    resetFencingForTest();
    if (fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath);
    fs.mkdirSync(lockFilePath, { recursive: true });

    // Subtest 3.1: Live v07 owner in info.json: DO NOT DELETE, REFUSE STARTUP!
    const legacyInfoPath = path.join(lockFilePath, 'info.json');
    fs.writeFileSync(
      legacyInfoPath,
      JSON.stringify({
        pid: process.pid,
        processStartedAt: getProcessStartTime(process.pid),
        token: 'live-v07-token',
        ts: Date.now(),
      }),
      'utf-8'
    );

    const liveLegacyAttempt = acquireInstanceLock(testDataDir);
    assert.equal(liveLegacyAttempt.acquired, false, 'Live v07 instance lock must refuse startup (Khe ③)');
    assert.equal(liveLegacyAttempt.pid, process.pid);
    assert.ok(fs.existsSync(lockFilePath) && fs.statSync(lockFilePath).isDirectory(), 'Live legacy directory MUST NOT be deleted');
    assert.ok(fs.existsSync(legacyInfoPath), 'Live legacy info.json MUST remain intact');

    // Subtest 3.2: Dead v07 owner in info.json: Clean up directory and acquire single-file lock
    fs.writeFileSync(
      legacyInfoPath,
      JSON.stringify({
        pid: 999999,
        processStartedAt: '1970-01-01T00:00:00.000Z',
        token: 'dead-v07-token',
        ts: 0,
      }),
      'utf-8'
    );
    const deadLegacyAttempt = acquireInstanceLock(testDataDir);
    assert.equal(deadLegacyAttempt.acquired, true, 'Dead v07 legacy lock must be cleaned up and single-file lock acquired');
    assert.equal(fs.statSync(lockFilePath).isDirectory(), false, 'Legacy directory converted to single file');
    releaseInstanceLock(testDataDir);

    // -------------------------------------------------------------
    // Khe ④: Unified owned mutex, 2-process isolation, decoupled switches & lease enforcement
    // -------------------------------------------------------------
    resetFencingForTest();
    if (fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath);

    // Subtest 4.1: Two real child processes: Process 2 cannot steal mutex while Process 1 is alive
    const mutexTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiboss-mutex-test-'));
    const mutexReadyFile = path.join(mutexTestDir, 'p1.ready');

    // Process 1: holds mutex for 600ms
    const p1 = spawn(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `import { withInstanceMutex } from "./src/lib/budget-ledger.ts";
       import fs from "node:fs";
       withInstanceMutex(process.env.MUTEX_TEST_DIR, () => {
         fs.writeFileSync(process.env.MUTEX_READY_FILE, "ready");
         Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
       });`
    ], {
      env: { ...process.env, NODE_ENV: 'test', MUTEX_TEST_DIR: mutexTestDir, MUTEX_READY_FILE: mutexReadyFile },
      stdio: 'pipe',
    });

    // Wait for P1 to acquire mutex
    while (!fs.existsSync(mutexReadyFile)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    // Process 2: attempts to acquire mutex with short timeout (150ms). Must time out!
    const p2Res = spawnSync(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `import { withInstanceMutex } from "./src/lib/budget-ledger.ts";
       try {
         withInstanceMutex(process.env.MUTEX_TEST_DIR, () => {
           process.exit(0);
         }, 150);
       } catch (err) {
         process.exit(2);
       }`
    ], {
      env: { ...process.env, NODE_ENV: 'test', MUTEX_TEST_DIR: mutexTestDir },
    });

    assert.equal(p2Res.status, 2, 'Process 2 must time out with exit code 2 while Process 1 is alive holding mutex (Khe ④)');

    // Wait for P1 to finish cleanly
    const p1ExitCode = await new Promise((resolve) => p1.on('exit', resolve));
    assert.equal(p1ExitCode, 0, 'Process 1 must exit cleanly');
    fs.rmSync(mutexTestDir, { recursive: true, force: true });

    // Subtest 4.2: Dead process mutex recovery: killed process mutex is safely reclaimed
    const deadMutexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiboss-mutex-kill-'));
    const killReadyFile = path.join(deadMutexDir, 'kill.ready');

    const pKill = spawn(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `import { withInstanceMutex } from "./src/lib/budget-ledger.ts";
       import fs from "node:fs";
       withInstanceMutex(process.env.MUTEX_TEST_DIR, () => {
         fs.writeFileSync(process.env.MUTEX_READY_FILE, "ready");
         Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);
       });`
    ], {
      env: { ...process.env, NODE_ENV: 'test', MUTEX_TEST_DIR: deadMutexDir, MUTEX_READY_FILE: killReadyFile },
      stdio: 'pipe',
    });

    while (!fs.existsSync(killReadyFile)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    // Abruptly kill pKill with SIGKILL and await exit so OS reaps child
    const pKillExitPromise = new Promise((resolve) => pKill.on('exit', resolve));
    process.kill(pKill.pid, 'SIGKILL');
    await pKillExitPromise;

    // Now reclaimer process must successfully reclaim the dead process mutex
    const pReclaimRes = spawnSync(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `import { withInstanceMutex } from "./src/lib/budget-ledger.ts";
       withInstanceMutex(process.env.MUTEX_TEST_DIR, () => {
         process.exit(0);
       }, 2000);`
    ], {
      env: { ...process.env, NODE_ENV: 'test', MUTEX_TEST_DIR: deadMutexDir },
    });

    assert.equal(pReclaimRes.status, 0, 'Reclaimer must successfully reclaim mutex after owner was killed with SIGKILL (Khe ④)');
    fs.rmSync(deadMutexDir, { recursive: true, force: true });

    // Subtest 4.3: Positive counterproof 1: AIBOSS_TEST_DISABLE_INSTANCE_MUTEX=1 causes concurrent entry
    const cpMutexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiboss-mutex-cp-'));
    const cpReadyFile = path.join(cpMutexDir, 'cp.ready');

    const pCp1 = spawn(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `import { withInstanceMutex } from "./src/lib/budget-ledger.ts";
       import fs from "node:fs";
       withInstanceMutex(process.env.MUTEX_TEST_DIR, () => {
         fs.writeFileSync(process.env.MUTEX_READY_FILE, "ready");
         Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
       });`
    ], {
      env: { ...process.env, NODE_ENV: 'test', MUTEX_TEST_DIR: cpMutexDir, MUTEX_READY_FILE: cpReadyFile },
      stdio: 'pipe',
    });

    while (!fs.existsSync(cpReadyFile)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    const pCp2Res = spawnSync(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `import { withInstanceMutex } from "./src/lib/budget-ledger.ts";
       try {
         withInstanceMutex(process.env.MUTEX_TEST_DIR, () => {
           process.exit(0);
         }, 150);
       } catch (err) {
         process.exit(2);
       }`
    ], {
      env: { ...process.env, NODE_ENV: 'test', MUTEX_TEST_DIR: cpMutexDir, AIBOSS_TEST_DISABLE_INSTANCE_MUTEX: '1' },
    });

    assert.equal(pCp2Res.status, 0, 'When instance mutex is disabled for test, Process 2 enters concurrently (exit code 0 counterproof)');
    await new Promise((resolve) => pCp1.on('exit', resolve));
    fs.rmSync(cpMutexDir, { recursive: true, force: true });

    // Subtest 4.4: In production, AIBOSS_TEST_DISABLE_INSTANCE_MUTEX is INERT
    const prodMutexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiboss-mutex-prod-'));
    const prodReadyFile = path.join(prodMutexDir, 'prod.ready');

    const pProd1 = spawn(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `import { withInstanceMutex } from "./src/lib/budget-ledger.ts";
       import fs from "node:fs";
       withInstanceMutex(process.env.MUTEX_TEST_DIR, () => {
         fs.writeFileSync(process.env.MUTEX_READY_FILE, "ready");
         Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
       });`
    ], {
      env: { ...process.env, NODE_ENV: 'production', MUTEX_TEST_DIR: prodMutexDir, MUTEX_READY_FILE: prodReadyFile },
      stdio: 'pipe',
    });

    while (!fs.existsSync(prodReadyFile)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    const pProd2Res = spawnSync(process.execPath, [
      '--import', './tests/register.mjs',
      '-e',
      `import { withInstanceMutex } from "./src/lib/budget-ledger.ts";
       try {
         withInstanceMutex(process.env.MUTEX_TEST_DIR, () => {
           process.exit(0);
         }, 150);
       } catch (err) {
         process.exit(2);
       }`
    ], {
      env: { ...process.env, NODE_ENV: 'production', MUTEX_TEST_DIR: prodMutexDir, AIBOSS_TEST_DISABLE_INSTANCE_MUTEX: '1' },
    });

    assert.equal(pProd2Res.status, 2, 'In production, AIBOSS_TEST_DISABLE_INSTANCE_MUTEX is inert: mutex is enforced (exit code 2)');
    await new Promise((resolve) => pProd1.on('exit', resolve));
    fs.rmSync(prodMutexDir, { recursive: true, force: true });

    // Subtest 4.5: Inside-mutex recheck isolation & counterproof (Khe ④ decoupled switch)
    const deadOrigToken = `dead-orig-${Date.now()}`;
    fs.writeFileSync(
      lockFilePath,
      JSON.stringify({
        pid: 999999,
        processStartedAt: '1970-01-01T00:00:00.000Z',
        token: deadOrigToken,
        leaseExpiresAt: new Date(Date.now() - 10000).toISOString(),
        ts: new Date().toISOString(),
      }),
      'utf-8'
    );

    // Setup hook: between checking the dead lock and renaming candidate, Contender B claims the lock!
    const contenderToken = `contender-${Date.now()}`;
    __testHooks.beforeReplace = () => {
      fs.writeFileSync(
        lockFilePath,
        JSON.stringify({
          pid: process.pid,
          processStartedAt: getProcessStartTime(process.pid),
          token: contenderToken,
          leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
          heartbeatAt: new Date().toISOString(),
          ts: new Date().toISOString(),
        }),
        'utf-8'
      );
    };

    // Reclaimer A attempts to reclaim with recheck enabled (default):
    const reclaimA = acquireInstanceLock(testDataDir);
    assert.equal(reclaimA.acquired, false, 'Reclaimer A must lose and not overwrite contender slipping in');
    const diskAfterReclaimA = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert.equal(diskAfterReclaimA.token, contenderToken, 'Contender B lock must remain intact and not overwritten');

    // Positive counterproof: Now reset lock to dead owner, and disable ONLY mutex recheck
    // via __testHooks.disableMutexRecheck = true (keeping withInstanceMutex ACTIVE). Contender is now overwritten!
    fs.writeFileSync(
      lockFilePath,
      JSON.stringify({
        pid: 999999,
        processStartedAt: '1970-01-01T00:00:00.000Z',
        token: deadOrigToken,
        leaseExpiresAt: new Date(Date.now() - 10000).toISOString(),
        ts: new Date().toISOString(),
      }),
      'utf-8'
    );
    __testHooks.disableMutexRecheck = true;
    const recheckDisabledReclaim = acquireInstanceLock(testDataDir);
    assert.equal(recheckDisabledReclaim.acquired, true, 'When recheck is disabled, reclaimer overwrites contender (counterproof)');
    const diskAfterBypass = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert.equal(diskAfterBypass.token, recheckDisabledReclaim.token, 'Contender overwritten when recheck disabled');

    __testHooks.beforeReplace = undefined;
    __testHooks.disableMutexRecheck = undefined;
    releaseInstanceLock(testDataDir);
    resetFencingForTest();

    // Subtest 4.6: Renew fails and fences if token on disk was replaced by another process before rename
    const lockToRenew = acquireInstanceLock(testDataDir, 5000);
    assert.equal(lockToRenew.acquired, true);

    const intruderRenewToken = `intruder-renew-${Date.now()}`;
    __testHooks.beforeReplace = () => {
      fs.writeFileSync(
        lockFilePath,
        JSON.stringify({
          pid: 999998,
          processStartedAt: '1970-01-01T00:00:00.000Z',
          token: intruderRenewToken,
          leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
          ts: new Date().toISOString(),
        }),
        'utf-8'
      );
    };

    // Attempt renew: MUST return false, trigger fence, and NOT overwrite intruder
    const renewResult = renewInstanceLock(testDataDir);
    __testHooks.beforeReplace = undefined; // Clean up hook
    assert.equal(renewResult, false, 'renewInstanceLock must return false when token on disk is replaced (Khe ④)');
    assert.equal(isFenced(), true, 'renewInstanceLock must fence instance on token mismatch');
    const diskAfterRenew = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert.equal(diskAfterRenew.token, intruderRenewToken, 'Intruder lock file must NOT be overwritten by renew');
    resetFencingForTest();
    if (fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath);

    // Subtest 4.7: Release with condition: foreign lock file must NOT be unlinked
    // Acquire lock first
    const lockToRelease = acquireInstanceLock(testDataDir, 5000);
    assert.equal(lockToRelease.acquired, true);

    const intruderRelToken = `intruder-rel-${Date.now()}`;
    __testHooks.beforeReplace = () => {
      fs.writeFileSync(
        lockFilePath,
        JSON.stringify({
          pid: 999997,
          processStartedAt: '1970-01-01T00:00:00.000Z',
          token: intruderRelToken,
          leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
          ts: new Date().toISOString(),
        }),
        'utf-8'
      );
    };

    releaseInstanceLock(testDataDir);
    __testHooks.beforeReplace = undefined;
    assert.ok(fs.existsSync(lockFilePath), 'releaseInstanceLock must NOT delete lock file belonging to another token (Khe ④)');
    const diskAfterRel = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert.equal(diskAfterRel.token, intruderRelToken, 'Intruder lock must remain intact');
    fs.unlinkSync(lockFilePath); // Manual cleanup of intruder lock
    resetFencingForTest();

    // Subtest 4.8: Reclaim enforces BOTH dead process AND expired lease!
    // Setup lock held by dead PID 999999 BUT with leaseExpiresAt in the FUTURE (+5000ms)
    fs.writeFileSync(
      lockFilePath,
      JSON.stringify({
        pid: 999999,
        processStartedAt: '1970-01-01T00:00:00.000Z',
        token: 'unexpired-lease-token',
        leaseExpiresAt: new Date(Date.now() + 5000).toISOString(),
        ts: new Date().toISOString(),
      }),
      'utf-8'
    );
    const unexpiredReclaim = acquireInstanceLock(testDataDir);
    assert.equal(
      unexpiredReclaim.acquired,
      false,
      'Reclaim MUST be rejected if lease is still active even though process is dead (Khe ④ lease enforcement)'
    );

    // Now set leaseExpiresAt in the PAST (-5000ms): dead process + expired lease -> reclaim succeeds!
    fs.writeFileSync(
      lockFilePath,
      JSON.stringify({
        pid: 999999,
        processStartedAt: '1970-01-01T00:00:00.000Z',
        token: 'expired-lease-token',
        leaseExpiresAt: new Date(Date.now() - 5000).toISOString(),
        ts: new Date().toISOString(),
      }),
      'utf-8'
    );
    const expiredReclaim = acquireInstanceLock(testDataDir);
    assert.equal(
      expiredReclaim.acquired,
      true,
      'Reclaim MUST succeed when process is dead AND lease has expired'
    );
    releaseInstanceLock(testDataDir);
    assert.equal(fs.existsSync(lockFilePath), false, 'Lock file cleaned up');
    resetFencingForTest();

    console.log('  [PASS] Case 25: Condition (b) all 4 gaps verified (sticky fencing, startup crash recovery, legacy dir protection, unified lease mechanics)');
  }

  // Case 26: Universal pending guard for all terminal statuses & worker liveness tri-state (Item 7 & Item 8)
  {
    const statuses = ['timeout', 'failed', 'killed', 'finished'];
    const holdIds = [];
    const twoHoursAgoIso = new Date(Date.now() - 7200000).toISOString();

    for (const status of statuses) {
      const holdId = `hold-terminal-${status}-${Date.now()}`;
      const wakeId = `wake-terminal-${status}-${Date.now()}`;
      const runId = `run-terminal-${status}-${Date.now()}`;
      holdIds.push(holdId);

      recordHold({
        holdId,
        wakeId,
        seatId: 'marketing-lead',
        amountNanodollars: '400000000',
        basis: 'default',
        overBudget: false,
        ts: twoHoursAgoIso,
      });

      recordRun({
        runId,
        wakeId,
        holdId,
        seatId: 'marketing-lead',
        status,
        costStatus: 'pending', // Pending costs must be guarded across ALL terminal statuses!
        startedAt: twoHoursAgoIso,
        attempt: 1,
      });
    }

    // Reconcile with maxAgeMs = 1 hour (holds are 2 hours old)
    reconcileOpenHolds({ maxAgeMs: 3600000 });

    const activeHoldsMap = getActiveHolds();
    for (const holdId of holdIds) {
      assert.ok(
        activeHoldsMap.has(holdId),
        `Hold ${holdId} with costStatus=pending must NEVER be settled or expired prematurely`
      );
    }

    // Test checkProcessLiveness tri-state (Hermes Item 8)
    const currentStartTime = getProcessStartTime(process.pid);
    assert.equal(checkProcessLiveness(process.pid, currentStartTime), 'alive');
    assert.equal(checkProcessLiveness(process.pid, '1970-01-01T00:00:00.000Z'), 'dead');
    assert.equal(checkProcessLiveness(999999, undefined), 'dead');
    assert.equal(checkProcessLiveness(undefined, undefined), 'unverified');
    assert.equal(checkProcessLiveness(0, undefined), 'unverified');

    console.log('  [PASS] Case 26: universal terminal pending guard and checkProcessLiveness tri-state verified (Item 7 & 8)');
  }

  // Case 27: Pure read-only GET /api/budget without disk mutation (Item 9)
  {
    const pristineNonExistentDir = path.join(testBaseDir, 'pristine-nonexistent-data-' + Date.now());
    assert.equal(fs.existsSync(pristineNonExistentDir), false);

    const savedDataDir = process.env.AIBOSS_DATA_DIR;
    process.env.AIBOSS_DATA_DIR = pristineNonExistentDir;

    try {
      const req = new Request('http://127.0.0.1:4330/api/budget');
      const res = await getBudgetRoute(req);

      assert.equal(res.status, 503, 'GET /api/budget on empty uninitialized data dir must return 503');
      const data = await res.json();
      assert.equal(data.error, 'snapshot_not_ready');

      // CRITICAL: Disk must remain completely untouched! No directory created!
      assert.equal(
        fs.existsSync(pristineNonExistentDir),
        false,
        'GET /api/budget must be pure read-only and never create directories or files on disk'
      );
    } finally {
      process.env.AIBOSS_DATA_DIR = savedDataDir;
    }

    console.log('  [PASS] Case 27: pure read-only GET /api/budget without disk mutation verified (Item 9)');
  }

  // Case 28: Truncated/corrupted JSONL tail repair and uncommitted fragment guard (Item 6)
  {
    const todayStr = '2026-10-14';
    const testLogFile = `${todayStr}.jsonl`;
    const testLogPath = path.join(testDataDir, 'budget', testLogFile);

    // 1. Write one valid hold
    const validHold1 = {
      type: 'hold',
      holdId: 'hold-tail-valid-1',
      wakeId: 'wake-tail-1',
      seatId: 'marketing-lead',
      amountNanodollars: '200000000',
      basis: 'default',
      overBudget: false,
      ts: `${todayStr}T10:00:00.000Z`,
    };
    fs.writeFileSync(testLogPath, JSON.stringify(validHold1) + '\n', 'utf-8');

    // 2. Append an uncommitted trailing fragment without newline
    fs.appendFileSync(testLogPath, '{"type":"hold","holdId":"hold-broken-tail-partial', 'utf-8');

    // repairLogTail must detect uncommitted fragment, trim it, and log warning
    const res1 = repairLogTail(testLogPath);
    assert.equal(res1.repaired, true, 'repairLogTail must report file was repaired');
    assert.equal(res1.validLines, 1, 'Valid line count must be 1');

    // Raw content must end with newline and contain exactly validHold1
    const contentAfterRepair = fs.readFileSync(testLogPath, 'utf-8');
    assert.ok(contentAfterRepair.endsWith('\n'), 'Repaired file must end with trailing newline');
    assert.equal(contentAfterRepair.trim(), JSON.stringify(validHold1));

    // 3. Replay: checkpoint must NEVER advance over uncommitted fragments
    const cp = replayAndGetCheckpoint();
    assert.equal(cp.filePositions[testLogFile], 1, 'Checkpoint filePosition must strictly match valid lines');
    assert.ok(cp.holds['hold-tail-valid-1']);
    assert.equal(cp.holds['hold-broken-tail-partial'], undefined);

    // 4. Subsequent write via settleHold must write cleanly on next line
    const validSettle1 = {
      type: 'settle',
      holdId: 'hold-tail-valid-1',
      runId: 'run-tail-1',
      actualNanodollars: '180000000',
      priced: true,
      ts: `${todayStr}T11:00:00.000Z`,
    };
    settleHold(validSettle1);

    const cpAfterSettle = replayAndGetCheckpoint();
    assert.equal(cpAfterSettle.filePositions[testLogFile], 2, 'File position advances to 2 after clean append');
    assert.equal(cpAfterSettle.holds['hold-tail-valid-1'], undefined, 'Hold was settled');

    // 5. Corrupted JSON parse error at tail (in-place truncation test)
    const validBytesBeforeCorruption = fs.statSync(testLogPath).size;
    fs.appendFileSync(testLogPath, '{"type":"broken" garbage\n', 'utf-8');
    const corruptedSize = fs.statSync(testLogPath).size;
    assert.ok(corruptedSize > validBytesBeforeCorruption);

    const res2 = repairLogTail(testLogPath);
    assert.equal(res2.repaired, true);
    assert.equal(res2.validLines, 2);
    // In-place truncation check: file size truncated back to exact byte length of valid lines
    assert.equal(fs.statSync(testLogPath).size, validBytesBeforeCorruption, 'Tail must be truncated in-place');

    // 6. Hermes Item 6: Corruption in MIDDLE of log must fail-closed (throw Error, never drop middle lines)
    const middleCorruptLog = path.join(testDataDir, 'budget', 'middle-corrupt.jsonl');
    const mLine1 = JSON.stringify({ type: 'hold', holdId: 'h-mid-1', ts: `${todayStr}T10:00:00Z` }) + '\n';
    const mLine2Bad = '{"type":"broken" unparseable syntax in middle\n';
    const mLine3 = JSON.stringify({ type: 'hold', holdId: 'h-mid-3', ts: `${todayStr}T10:05:00Z` }) + '\n';
    fs.writeFileSync(middleCorruptLog, mLine1 + mLine2Bad + mLine3, 'utf-8');

    assert.throws(
      () => repairLogTail(middleCorruptLog),
      /Corrupted budget record in middle of log/,
      'Corrupted record in middle of log must fail-closed and throw Error'
    );
    // File content must be untouched
    assert.equal(
      fs.readFileSync(middleCorruptLog, 'utf-8'),
      mLine1 + mLine2Bad + mLine3,
      'File with middle corruption must NOT be modified or truncated'
    );
    fs.unlinkSync(middleCorruptLog);

    console.log('  [PASS] Case 28: in-place tail truncation, uncommitted tail repair, and middle corruption fail-closed guard verified (Item 6)');
  }

  // Case 29: Checkpoint v1 -> v2 migration rebuilding holds and filePositions from SST (Finding M4)
  {
    const legacyDate = '2026-07-15';
    const legacyFile = `${legacyDate}.jsonl`;
    const legacyLogPath = path.join(testDataDir, 'budget', legacyFile);
    const holdV1Id = 'hold-v1-migration-test';

    // In JSONL SST: hold was created and then settled!
    const recHold = {
      type: 'hold',
      holdId: holdV1Id,
      wakeId: 'wake-v1-test',
      seatId: 'marketing-lead',
      amountNanodollars: '300000000',
      basis: 'default',
      overBudget: false,
      ts: `${legacyDate}T08:00:00.000Z`,
    };
    const recSettle = {
      type: 'settle',
      holdId: holdV1Id,
      runId: 'run-v1-test',
      actualNanodollars: '300000000',
      priced: true,
      ts: `${legacyDate}T09:00:00.000Z`,
    };
    fs.writeFileSync(legacyLogPath, JSON.stringify(recHold) + '\n' + JSON.stringify(recSettle) + '\n', 'utf-8');

    // Simulate stale v1 checkpoint on disk:
    // v1 snapshot falsely contains holdV1Id and only tracks lastReplayedFile/lastLineCount cursor
    const openHoldsPath = path.join(testDataDir, 'budget', 'open-holds.json');
    const staleV1 = {
      version: 1,
      updatedAt: '2026-07-15T08:30:00.000Z',
      lastReplayedFile: legacyFile,
      lastLineCount: 1,
      holds: {
        [holdV1Id]: recHold,
      },
    };
    fs.writeFileSync(openHoldsPath, JSON.stringify(staleV1, null, 2), 'utf-8');

    // Replay: loadOpenHoldsCheckpoint must reject v1 snapshot and replayAndGetCheckpoint
    // must rebuild both holds and filePositions from JSONL SST from scratch.
    const migratedCp = replayAndGetCheckpoint();
    assert.equal(migratedCp.version, 2, 'Migrated checkpoint must be version 2');
    assert.equal(
      migratedCp.holds[holdV1Id],
      undefined,
      'Settled hold must NEVER be resurrected from stale v1 snapshot (Finding M4)'
    );
    assert.equal(migratedCp.filePositions[legacyFile], 2, 'File position must reflect both records in SST');
    assert.equal(isHoldClosed(holdV1Id), true, 'Hold must be verified closed');

    console.log('  [PASS] Case 29: checkpoint v1 -> v2 migration rebuilding holds from SST verified (Finding M4)');
  }

  // Case 30: Deterministic barrier counterproof fixture at concurrency points (Item 11)
  {
    const seatId = 'barrier-tester';
    // Configure barrier-tester with cap = 700000000 (700M), default estimate = 700M
    // Exactly 1 run can fit within the daily cap!
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: null, hardStop: true },
        'content-writer': { dailyCapNanodollars: null, hardStop: true },
        'barrier-tester': { dailyCapNanodollars: '700000000', hardStop: true },
      },
    });

    const budgetLedgerPath = path.join(process.cwd(), 'src', 'lib', 'budget-ledger.ts');
    const childScriptContent = `
      import fs from 'node:fs';
      import path from 'node:path';
      import { checkAdmissionAndRecordHold } from '${budgetLedgerPath}';

      try {
        const [workerId, seatId, wakeId, holdId, barrierDir] = process.argv.slice(2);
        const readyFile = path.join(barrierDir, 'ready-' + workerId);
        const startFile = path.join(barrierDir, 'start');

        // 1. Announce ready
        fs.writeFileSync(readyFile, '1');

        // 2. Wait for parent start signal
        const startWait = Date.now();
        while (!fs.existsSync(startFile) && Date.now() - startWait < 5000) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }

        // 3. Enter admission check and record hold
        const result = checkAdmissionAndRecordHold({
          seatId,
          wakeId,
          holdId,
        });

        if (result.allowed) {
          process.exit(0);
        } else {
          process.exit(1);
        }
      } catch (err) {
        console.error('Child runner error:', err);
        process.exit(99);
      }
    `;

    const runnerScriptPath = path.join(testBaseDir, 'runner-case30.mjs');
    fs.writeFileSync(runnerScriptPath, childScriptContent, 'utf-8');

    // --- Phase A: Normal Mechanism (with lock) -> PASS ---
    const barrierDirA = path.join(testBaseDir, 'barrier-a');
    fs.mkdirSync(barrierDirA, { recursive: true });

    const pA1 = spawn(
      process.execPath,
      ['--import', './tests/register.mjs', runnerScriptPath, 'w1', seatId, 'wake-norm-1', 'hold-norm-1', barrierDirA],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AIBOSS_DATA_DIR: testDataDir,
          AIBOSS_CONFIG_DIR: testConfigDir,
          AIBOSS_TEST_BARRIER_DIR: barrierDirA,
        },
      }
    );

    const pA2 = spawn(
      process.execPath,
      ['--import', './tests/register.mjs', runnerScriptPath, 'w2', seatId, 'wake-norm-2', 'hold-norm-2', barrierDirA],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AIBOSS_DATA_DIR: testDataDir,
          AIBOSS_CONFIG_DIR: testConfigDir,
          AIBOSS_TEST_BARRIER_DIR: barrierDirA,
        },
      }
    );

    let outA1 = '', errA1 = '', outA2 = '', errA2 = '';
    pA1.stdout.on('data', (d) => { outA1 += d.toString(); });
    pA1.stderr.on('data', (d) => { errA1 += d.toString(); });
    pA2.stdout.on('data', (d) => { outA2 += d.toString(); });
    pA2.stderr.on('data', (d) => { errA2 += d.toString(); });

    // Wait for both to be ready
    const readyA1 = path.join(barrierDirA, 'ready-w1');
    const readyA2 = path.join(barrierDirA, 'ready-w2');
    const waitReadyAStart = Date.now();
    while ((!fs.existsSync(readyA1) || !fs.existsSync(readyA2)) && Date.now() - waitReadyAStart < 5000) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    // Release start signal
    fs.writeFileSync(path.join(barrierDirA, 'start'), '1');

    // Wait until at least one worker arrives at the critical concurrency point
    const arrivedA1 = path.join(barrierDirA, `arrived-${pA1.pid}`);
    const arrivedA2 = path.join(barrierDirA, `arrived-${pA2.pid}`);
    const waitArrivedAStart = Date.now();
    while (!fs.existsSync(arrivedA1) && !fs.existsSync(arrivedA2) && Date.now() - waitArrivedAStart < 5000) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    // Under lock, only ONE worker can be at the barrier inside the transaction at any moment!
    // Release the barrier
    fs.writeFileSync(path.join(barrierDirA, 'release'), '1');

    const [codeA1, codeA2] = await Promise.all([
      new Promise((resolve) => pA1.on('close', resolve)),
      new Promise((resolve) => pA2.on('close', resolve)),
    ]);

    // Exactly one process must succeed (code 0), exactly one must fail (code 1)
    const successCountA = (codeA1 === 0 ? 1 : 0) + (codeA2 === 0 ? 1 : 0);
    assert.equal(successCountA, 1, 'Under budget lock, exactly 1 turn must be admitted');

    const statusA = getBudgetStatus(seatId);
    assert.equal(statusA.heldNanodollars, '700000000', 'Exactly 1 hold of 700M nanodollars committed');

    // --- Phase B: Disabling Mechanism (AIBOSS_TEST_DISABLE_BUDGET_LOCK=1) -> FAILS (proves counterproof) ---
    // Settle or release hold-norm-1 to reset budget
    const activeHoldA = getActiveHolds();
    for (const h of activeHoldA.values()) {
      if (h.seatId === seatId) {
        releaseHold({ holdId: h.holdId, reason: 'failed_no_receipt', ts: new Date().toISOString() });
      }
    }
    const statusClean = getBudgetStatus(seatId);
    assert.equal(statusClean.heldNanodollars, '0', 'Held nanodollars reset to 0 before counterproof run');

    const barrierDirB = path.join(testBaseDir, 'barrier-b');
    fs.mkdirSync(barrierDirB, { recursive: true });

    const pB1 = spawn(
      process.execPath,
      ['--import', './tests/register.mjs', runnerScriptPath, 'w1', seatId, 'wake-dis-1', 'hold-dis-1', barrierDirB],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AIBOSS_DATA_DIR: testDataDir,
          AIBOSS_CONFIG_DIR: testConfigDir,
          AIBOSS_TEST_BARRIER_DIR: barrierDirB,
          AIBOSS_TEST_DISABLE_BUDGET_LOCK: '1',
        },
      }
    );

    const pB2 = spawn(
      process.execPath,
      ['--import', './tests/register.mjs', runnerScriptPath, 'w2', seatId, 'wake-dis-2', 'hold-dis-2', barrierDirB],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AIBOSS_DATA_DIR: testDataDir,
          AIBOSS_CONFIG_DIR: testConfigDir,
          AIBOSS_TEST_BARRIER_DIR: barrierDirB,
          AIBOSS_TEST_DISABLE_BUDGET_LOCK: '1',
        },
      }
    );

    // Wait for both to be ready
    const readyB1 = path.join(barrierDirB, 'ready-w1');
    const readyB2 = path.join(barrierDirB, 'ready-w2');
    const waitReadyBStart = Date.now();
    while ((!fs.existsSync(readyB1) || !fs.existsSync(readyB2)) && Date.now() - waitReadyBStart < 5000) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    // Release start signal
    fs.writeFileSync(path.join(barrierDirB, 'start'), '1');

    // Without budget lock, BOTH workers simultaneously reach the concurrency point!
    const arrivedB1 = path.join(barrierDirB, `arrived-${pB1.pid}`);
    const arrivedB2 = path.join(barrierDirB, `arrived-${pB2.pid}`);
    const waitArrivedBStart = Date.now();
    while ((!fs.existsSync(arrivedB1) || !fs.existsSync(arrivedB2)) && Date.now() - waitArrivedBStart < 5000) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    assert.ok(fs.existsSync(arrivedB1), 'Worker 1 reached concurrency point without lock');
    assert.ok(fs.existsSync(arrivedB2), 'Worker 2 reached concurrency point without lock simultaneously');

    // Release both workers simultaneously past the concurrency point
    fs.writeFileSync(path.join(barrierDirB, 'release'), '1');

    const [codeB1, codeB2] = await Promise.all([
      new Promise((resolve) => pB1.on('close', resolve)),
      new Promise((resolve) => pB2.on('close', resolve)),
    ]);

    // Counterproof result: WITHOUT lock, BOTH workers pass admission and commit holds!
    assert.equal(codeB1, 0, 'Worker 1 was admitted without lock');
    assert.equal(codeB2, 0, 'Worker 2 was admitted without lock');

    const allRecords = readAllBudgetRecords();
    const disHolds = allRecords.filter(
      (r) => r.type === 'hold' && r.seatId === seatId && r.holdId.startsWith('hold-dis-')
    );
    assert.equal(
      disHolds.length,
      2,
      'Counterproof proved: without lock, both workers concurrently committed holds (2 holds > 1 allowed)'
    );
    const totalCommittedWithoutLock = disHolds.reduce(
      (sum, r) => sum + BigInt(r.amountNanodollars),
      0n
    );
    assert.equal(
      totalCommittedWithoutLock.toString(),
      '1400000000',
      'Counterproof proved: without lock, total committed holds (1.4B) exceeds daily cap (700M)'
    );

    console.log('  [PASS] Case 30: deterministic barrier counterproof fixture at concurrency points verified (Item 11)');
  }

  console.log('>>> ALL 30 A-3 BUDGET TEST CASES AND REVIEWS PASSED <<<');
} catch (err) {
  console.error('\nTest failed with error:', err);
  process.exit(1);
} finally {
  // Clean up test directories
  try {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
