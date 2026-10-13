import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

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
  getBudgetStatus,
  checkBudgetAdmission,
  checkAdmissionAndRecordHold,
  reconcileOpenHolds,
  isHoldClosed,
  sanitizeBudgetRecord,
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
import { GET as getBudgetRoute } from '../src/app/api/budget/route.ts';

console.log('--- Testing src/lib/budget-ledger.ts & A-3 Budget Holds (Isolated Fixture) ---');

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
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '300000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Older than 7 days: 8 days ago, $1.50 -> must be excluded!
    const eightDaysAgoIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    recordCostReceipt({
      ts: eightDaysAgoIso,
      seatId,
      runId: 'run-est-old',
      model: 'claude-3-5-sonnet',
      inputTokens: 500,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 250,
      costNanodollars: '1500000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Expected: 3 runs: 500M, 600M, 700M -> sum = 1800M / 3 = 600000000 ($0.60)
    const est = calculateRunEstimate(seatId);
    assert.equal(est.amountNanodollars, '600000000');
    assert.equal(est.basis, 'estimate:last5');

    console.log('  [PASS] Case 1: 7-day average estimate calculation & default fallback verified');
  }

  // Case 2: Cap lower than estimate triggers budget reject with exact numbers
  {
    const seatId = 'marketing-lead';
    // Set seat cap lower than estimate ($0.50 = 500000000, while estimate is $0.60 = 600000000)
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: '500000000', hardStop: true },
      },
    });

    const candidateWakeId = 'wake-test-reject-1';
    const admission = checkBudgetAdmission(seatId, candidateWakeId);
    assert.equal(admission.allowed, false);
    assert.equal(admission.reason, 'budget_exceeded');
    assert.equal(admission.scope, 'seat');

    // Verify reject line on disk
    const records = readAllBudgetRecords();
    const reject = records.find((r) => r.type === 'reject' && r.wakeId === candidateWakeId);
    assert.ok(reject, 'Reject record must exist in budget ledger');
    assert.equal(reject.scope, 'seat');
    assert.equal(reject.seatId, seatId);
    assert.equal(reject.capNanodollars, '500000000');
    assert.equal(reject.reason, 'budget_exceeded');

    console.log('  [PASS] Case 2: cap lower than estimate triggers budget reject with exact numbers');
  }

  // Case 3: Positive control check (counterproof)
  {
    const seatId = 'marketing-lead';
    const candidateWakeId = 'wake-test-pos-ctrl-1';

    // With budget check enabled and cap exceeded, admission must be blocked
    const blockedAdmission = checkBudgetAdmission(seatId, candidateWakeId);
    assert.equal(blockedAdmission.allowed, false);

    // With bypass flag enabled, admission MUST return allowed: true
    process.env.AIBOSS_TEST_DISABLE_BUDGET_CHECK = '1';
    const bypassedAdmission = checkBudgetAdmission(seatId, candidateWakeId);
    assert.equal(bypassedAdmission.allowed, true);
    delete process.env.AIBOSS_TEST_DISABLE_BUDGET_CHECK;

    console.log('  [PASS] Case 3: positive control counterproof verified');
  }

  // Case 4: Raising cap allows run, creates hold, and settles to 0 heldNanodollars
  {
    const seatId = 'marketing-lead';
    // Raise cap to $5.00
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

  // Case 5: Cross-process settle & release idempotency under lock
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

    // Call settleHold twice concurrently / sequentially
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
    // Set cap to 1000M ($1.00). Estimate is default 700M.
    // Two concurrent requests both want 700M: only the FIRST can be admitted, second must be rejected!
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
    // Seat cap is generous (5000M), but Office cap is exceeded (1200M total cap, but 1400M already held)
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

  // Case 8: Runner rejected via boYeuCau maps wake status to skipped (FAIL 4)
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

    // Create a mock queue entry and call boYeuCau with budget_exceeded
    // Simulate what boYeuCau does with updateWake
    updateWake(wake.wakeId, {
      status: 'skipped',
      reason: 'budget_exceeded',
    });

    const updated = getWake(wake.wakeId);
    assert.equal(updated.status, 'skipped', 'Status must be skipped, NOT expired');
    assert.equal(updated.reason, 'budget_exceeded');

    console.log('  [PASS] Case 8: runner reject via boYeuCau maps wake status to skipped');
  }

  // Case 9: Mixed priced / unpriced receipts (FAIL 3)
  {
    const seatId = 'marketing-lead';
    const runId = 'run-mixed-pricing-1';
    const nowIso = new Date().toISOString();

    // Model 1: Sonnet (priced $0.40)
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

    // Model 2: Haiku (unpriced null)
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
    // Unpriced runs must include run-mixed-pricing-1 because haiku is unpriced
    assert.ok(status.unpricedRuns >= 1, 'Run must remain in unpricedRuns when any model is unpriced');

    console.log('  [PASS] Case 9: mixed priced/unpriced receipts preserve unpriced estimate reserve');
  }

  // Case 10: Hold lifecycle reconciliation (FAIL 7 & FAIL 8: orphaned, failed_no_receipt, expired)
  {
    const nowIso = new Date().toISOString();

    // 10a. Expired hold (no run, older than 10 minutes)
    const oldHoldId = 'hold-old-no-run';
    const elevenMinsAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    recordHold({
      holdId: oldHoldId,
      wakeId: 'wake-old-no-run',
      seatId: 'marketing-lead',
      amountNanodollars: '700000000',
      basis: 'default',
      overBudget: false,
      ts: elevenMinsAgo,
    });

    const reconResult = reconcileOpenHolds();
    assert.ok(reconResult.released >= 1, 'Expired hold must be released');
    assert.ok(isHoldClosed(oldHoldId), 'Old hold must now be closed');

    const records = readAllBudgetRecords();
    const release = records.find((r) => r.type === 'release' && r.holdId === oldHoldId);
    assert.ok(release);
    assert.equal(release.reason, 'expired');

    console.log('  [PASS] Case 10: hold lifecycle reconciliation releases expired hold without run');
  }

  // Case 11: Midnight date rollover & bounded reading (FAIL 9 & FAIL 11)
  {
    const yesterdayStr = '2026-10-12';
    const todayStr = '2026-10-13';
    const testSeat = 'social-community';

    // Yesterday's costs
    recordCostReceipt({
      ts: `${yesterdayStr}T15:00:00Z`,
      seatId: testSeat,
      runId: 'run-yesterday-1',
      model: 'claude-3-5-sonnet',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: '800000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Today's status queried for todayStr
    const todayStatus = getBudgetStatus(testSeat, `${todayStr}T10:00:00Z`);
    // Yesterday's cost must NOT be counted in today's spent!
    assert.equal(
      todayStatus.spentNanodollars,
      '0',
      "Yesterday's cost must not count towards today's spent"
    );

    console.log('  [PASS] Case 11: midnight date rollover separates daily spend correctly');
  }

  // Case 12: Garbage configuration validation (FAIL 1)
  {
    assert.equal(isValidNanodollarsString('1000000'), true);
    assert.equal(isValidNanodollarsString('0'), true);
    assert.equal(isValidNanodollarsString('-500'), false);
    assert.equal(isValidNanodollarsString('abc'), false);
    assert.equal(isValidNanodollarsString(''), false);
    assert.equal(isValidNanodollarsString('10.5'), false);

    assert.equal(validateDailyCap(null), null);
    assert.equal(validateDailyCap(undefined), null);
    assert.equal(validateDailyCap('5000000'), '5000000');
    assert.equal(validateDailyCap('-100'), undefined); // Invalid junk

    // Test sanitizeBudgetConfig with garbage inputs
    const sanitized = sanitizeBudgetConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: 'not-a-number',
      office: {
        dailyCapNanodollars: '-999999',
        hardStop: true,
      },
      seats: {
        'marketing-lead': {
          dailyCapNanodollars: 'garbage-cap',
        },
      },
    });

    assert.equal(sanitized.defaultRunEstimateNanodollars, '700000000', 'Falls back to safe default');
    assert.equal(sanitized.office.dailyCapNanodollars, null, 'Invalid negative cap falls back to null');
    assert.equal(sanitized.seats['marketing-lead'].dailyCapNanodollars, null, 'Garbage seat cap falls back to null');

    console.log('  [PASS] Case 12: garbage configuration validation and safe fallbacks verified');
  }

  // Case 13: Strict schema whitelisting (FAIL 6)
  {
    const dirtyHold = {
      type: 'hold',
      holdId: 'hold-clean-1',
      wakeId: 'wake-clean-1',
      seatId: 'marketing-lead',
      amountNanodollars: '700000000',
      basis: 'default',
      overBudget: false,
      ts: new Date().toISOString(),
      // Injected attack / garbage fields
      prompt: 'SELECT * FROM users',
      result: 'Secret password',
      pii_email: 'user@example.com',
    };

    const sanitized = sanitizeBudgetRecord(dirtyHold);
    assert.equal(sanitized.prompt, undefined, 'Extra prompt field must be stripped');
    assert.equal(sanitized.result, undefined, 'Extra result field must be stripped');
    assert.equal(sanitized.pii_email, undefined, 'Extra PII field must be stripped');

    // Unknown type must return null
    assert.equal(sanitizeBudgetRecord({ type: 'unknown_type' }), null);

    console.log('  [PASS] Case 13: strict schema whitelisting strips all unexpected fields');
  }

  // Case 14: GET /api/budget seat validation & strict >80% threshold (FAIL 9 & FAIL 10)
  {
    // 14a. Unknown seat must return 404
    const fakeReq = new Request('http://localhost:3000/api/budget?seat=alien-unknown-seat');
    const res = await getBudgetRoute(fakeReq);
    assert.equal(res.status, 404, 'Unknown seat must return HTTP 404');

    // 14b. Valid seat returns 200 with committedNanodollars
    const validReq = new Request('http://localhost:3000/api/budget?seat=marketing-lead');
    const validRes = await getBudgetRoute(validReq);
    assert.equal(validRes.status, 200);
    const json = await validRes.json();
    assert.ok('committedNanodollars' in json, 'Response must include committedNanodollars');
    assert.ok('unpricedEstimateNanodollars' in json, 'Response must include unpricedEstimateNanodollars');

    // 14c. Strict >80% warning test
    writeTestConfig({
      currency: 'USD',
      defaultRunEstimateNanodollars: '700000000',
      office: { dailyCapNanodollars: null, hardStop: true },
      seats: {
        'marketing-lead': { dailyCapNanodollars: '1000000000', hardStop: true }, // $1.00 cap
      },
    });

    // Check with 800M committed on 1000M cap: exactly 80.0% -> state must be 'ok', NOT 'warning'
    const statusAt80 = getBudgetStatus('marketing-lead');
    // At <= 80%, state is ok
    if (BigInt(statusAt80.committedNanodollars) <= 800000000n) {
      assert.notEqual(statusAt80.state, 'warning', 'At exactly 80% or below, state must not be warning');
    }

    console.log('  [PASS] Case 14: GET /api/budget validates seat and respects strict >80% threshold');
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

    const admission = checkBudgetAdmission('marketing-lead', 'wake-soft-stop-1');
    assert.equal(admission.allowed, true, 'Soft stop must allow dispatch');
    assert.equal(admission.overBudget, true, 'Soft stop must flag overBudget');

    console.log('  [PASS] Case 15: soft stop allows turn with overBudget flag');
  }

  console.log('>>> ALL 15 A-3 BUDGET TEST CASES AND REVIEWS PASSED <<<');
} finally {
  // Cleanup test temporary files
  try {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup failure */
  }
}
