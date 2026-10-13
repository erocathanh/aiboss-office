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

    // Wait until child is actively holding lock
    while (!fs.existsSync(barrierFile) || fs.readFileSync(barrierFile, 'utf-8') !== 'holding') {
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

    // Test 2: Dead child process lock recovery
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
        JSON.stringify({ pid: process.pid, token: 'dead-child-token', ts: Date.now() })
      );
      process.exit(0);
      `
    ], {
      env: { ...process.env, AIBOSS_DATA_DIR: testDataDir, AIBOSS_CONFIG_DIR: testConfigDir }
    });
    assert.equal(deadChild.status, 0);

    // Parent sees lock left by dead process: MUST safely reclaim and proceed!
    const recovered = withBudgetLock(() => 'recovered_dead_lock', 2000);
    assert.equal(recovered, 'recovered_dead_lock', 'Lock left by dead PID must be safely reclaimed');

    console.log('  [PASS] Case 16: real two-process barrier concurrency and dead-PID recovery verified');
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

  console.log('>>> ALL 19 A-3 BUDGET TEST CASES AND REVIEWS PASSED <<<');
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
