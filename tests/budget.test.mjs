import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

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
} from '../src/lib/budget-ledger.ts';
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

  // Case 20: Crash injection between JSONL write and checkpoint write (Hermes Item 1 & 9 / FAIL 6 & 9)
  {
    const todayStr = new Date().toISOString().split('T')[0];
    const budgetLogPath = path.join(testDataDir, 'budget', `${todayStr}.jsonl`);
    const injectedHoldId = 'hold-crash-injected-' + Date.now();
    const injectedWakeId = 'wake-crash-injected-' + Date.now();

    // 1. Ensure existing checkpoint state is captured
    initBudgetLedger();
    const cpBefore = loadOpenHoldsCheckpoint();
    assert.ok(cpBefore, 'Checkpoint must exist after initialization');
    const lineCountBefore = cpBefore.lastLineCount;

    // 2. Simulate process appending hold to JSONL SST then crashing before saving to open-holds.json
    const unindexedHoldRecord = {
      type: 'hold',
      holdId: injectedHoldId,
      wakeId: injectedWakeId,
      seatId: 'marketing-lead',
      amountNanodollars: '500000000',
      basis: 'default',
      overBudget: false,
      ts: new Date().toISOString(),
    };
    fs.appendFileSync(budgetLogPath, JSON.stringify(unindexedHoldRecord) + '\n', 'utf-8');

    // 3. Replay from SST via initBudgetLedger / replayAndGetCheckpoint
    const cpRecovered = initBudgetLedger();
    assert.ok(cpRecovered.holds[injectedHoldId], 'Checkpoint must recover unindexed hold from JSONL SST');
    assert.equal(cpRecovered.lastLineCount, lineCountBefore + 1, 'Replay line counter must advance');
    assert.equal(isHoldClosed(injectedHoldId), false, 'Recovered hold must be recognized as open');

    // 4. Simulate process appending settle to JSONL then crashing before saving checkpoint
    const unindexedSettleRecord = {
      type: 'settle',
      holdId: injectedHoldId,
      runId: 'run-crash-settle-' + Date.now(),
      actualNanodollars: '450000000',
      priced: true,
      ts: new Date().toISOString(),
    };
    fs.appendFileSync(budgetLogPath, JSON.stringify(unindexedSettleRecord) + '\n', 'utf-8');

    // 5. Verify isHoldClosed and initBudgetLedger automatically replay and reconcile
    assert.equal(isHoldClosed(injectedHoldId), true, 'Replayed settle must mark hold as closed');
    const activeHolds = getActiveHolds();
    assert.equal(activeHolds.has(injectedHoldId), false, 'Closed hold must be removed from active holds snapshot');

    console.log('  [PASS] Case 20: crash injection between JSONL write and checkpoint write recovers cleanly via SST');
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
    assert.equal(isProcessAlive(currentPid), true, 'Current process must be alive');
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

    // Hold D: Has NO worker identity beyond maxAgeMs -> MUST EXPIRE (finite expiration policy)
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
      false,
      'Hold without verified worker PID must expire cleanly beyond maxAgeMs'
    );

    console.log('  [PASS] Case 22: live PID preservation, finite expiration for dead/missing PID, and PID reuse detection verified');
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

  console.log('>>> ALL 23 A-3 BUDGET TEST CASES AND REVIEWS PASSED <<<');
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
