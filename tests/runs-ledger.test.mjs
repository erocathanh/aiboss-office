import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// 1. ISOLATE DATA DIR: Tests must NEVER touch operations/data or production ledgers
const testDataDir = path.join(
  os.tmpdir(),
  'aiboss-test-runs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
);
process.env.AIBOSS_DATA_DIR = testDataDir;

import {
  generateRunOrWakeId,
  computeIdempotencyKey,
  recordWake,
  updateWake,
  recordRun,
  updateRun,
  getWake,
  getRun,
  getRuns,
  recoverOrphanedRuns,
  reconcilePendingCosts,
  findRecentWakeByIdempotencyKey,
  getRunsDir,
  isProcessAlive,
  sanitizeRun,
} from '../src/lib/runs-ledger.ts';
import { readAllCostRecords, recordCostReceipt } from '../src/lib/costs-ledger.ts';
import { tickRunner, getOfficeRunnerStatus } from '../src/lib/office-runner.ts';
import { sanitizeUsageReceipts, getNormalizedUsageFromRaw } from '../src/lib/usage-receipt.ts';

console.log('--- Testing src/lib/runs-ledger.ts ---');

try {
  // Case 1: ID generation format: prefix-YYYYMMDD-HHMMSS-<6 hex>
  {
    const wakeId = generateRunOrWakeId('wake');
    const runId = generateRunOrWakeId('run');
    assert.match(wakeId, /^wake-\d{8}-\d{6}-[a-f0-9]{6}$/);
    assert.match(runId, /^run-\d{8}-\d{6}-[a-f0-9]{6}$/);
    console.log('  [PASS] Case 1: ID generation format matches prefix-YYYYMMDD-HHMMSS-<6 hex>');
  }

  // Case 2: Sliding-window idempotency across minute boundary
  {
    const prompt = 'Review viral marketing strategy';
    const key1 = computeIdempotencyKey('marketing-lead', prompt);
    const key2 = computeIdempotencyKey('marketing-lead', prompt);
    assert.equal(key1, key2, 'Semantic idempotency key must not bucket by minute');

    // Exact minute boundary calculation:
    const T0 = Math.floor(1700000000000 / 60000) * 60000;
    assert.equal(T0 % 60000, 0, 'T0 must be an exact minute boundary');
    const T1 = T0 - 2000; // 2 seconds before minute boundary
    const T2 = T0 + 2000; // 2 seconds after minute boundary
    assert.notEqual(
      Math.floor(T1 / 60000),
      Math.floor(T2 / 60000),
      'T1 and T2 must belong to different integer minute buckets'
    );

    const wakeT1 = recordWake({
      wakeId: generateRunOrWakeId('wake'),
      seatId: 'marketing-lead',
      source: 'bell',
      requestedAt: new Date(T1).toISOString(),
      idempotencyKey: key1,
      status: 'queued',
    });

    // 4 seconds later (across true minute boundary)
    const duplicate = findRecentWakeByIdempotencyKey('marketing-lead', key1, 60_000, T2);
    assert.ok(duplicate, 'Must detect duplicate across true minute boundary');
    assert.equal(duplicate.wakeId, wakeT1.wakeId);

    // 65 seconds later: sliding window expired
    const expiredWindow = findRecentWakeByIdempotencyKey('marketing-lead', key1, 60_000, T1 + 65_000);
    assert.equal(expiredWindow, null, 'Wake older than 60s sliding window must not block new wake');

    // Skipped wake must NOT block subsequent valid retry
    updateWake(wakeT1.wakeId, { status: 'skipped', reason: 'seat_not_open' });
    const retryAfterReject = findRecentWakeByIdempotencyKey('marketing-lead', key1, 60_000, T2);
    assert.equal(retryAfterReject, null, 'Skipped wake must not block valid retry');

    console.log('  [PASS] Case 2: sliding-window idempotency across true minute boundary and skipped exclusion');
  }

  // Case 3: Record wake and update state
  {
    const testWakeId = generateRunOrWakeId('wake');
    const testKey = computeIdempotencyKey('test-seat', 'Task 1');
    const wake = recordWake({
      wakeId: testWakeId,
      seatId: 'test-seat',
      source: 'bell',
      requestedAt: new Date().toISOString(),
      idempotencyKey: testKey,
      status: 'queued',
    });
    assert.equal(wake.wakeId, testWakeId);

    const testRunId = generateRunOrWakeId('run');
    updateWake(testWakeId, { status: 'claimed', runId: testRunId });
    const claimedWake = getWake(testWakeId);
    assert.equal(claimedWake.status, 'claimed');
    assert.equal(claimedWake.runId, testRunId);
    console.log('  [PASS] Case 3: recordWake and updateWake transition state to claimed');
  }

  // Case 4: Record run with PID and update to finished with exitCode
  {
    const runId = generateRunOrWakeId('run');
    recordRun({
      runId,
      seatId: 'test-seat',
      startedAt: new Date().toISOString(),
      status: 'running',
      pid: process.pid,
    });
    const running = getRun(runId);
    assert.equal(running.status, 'running');
    assert.equal(running.pid, process.pid);

    updateRun(runId, {
      status: 'finished',
      finishedAt: new Date().toISOString(),
      exitCode: 0,
    });
    const finishedRun = getRun(runId);
    assert.equal(finishedRun.status, 'finished');
    assert.equal(finishedRun.exitCode, 0);
    console.log('  [PASS] Case 4: recordRun and updateRun transition to finished with PID');
  }

  // Case 5: getRuns query with limit and wake merging
  {
    const runId = generateRunOrWakeId('run');
    const wakeId = generateRunOrWakeId('wake');
    recordWake({
      wakeId,
      seatId: 'query-seat',
      source: 'bell',
      requestedAt: new Date().toISOString(),
      idempotencyKey: 'query-key',
      status: 'claimed',
      runId,
    });
    recordRun({
      runId,
      wakeId,
      seatId: 'query-seat',
      startedAt: new Date().toISOString(),
      status: 'finished',
      exitCode: 0,
    });

    const runs = getRuns({ seat: 'query-seat', limit: 10 });
    const found = runs.find((r) => r.runId === runId);
    assert.ok(found);
    assert.equal(found.status, 'finished');
    assert.ok(found.wake);
    assert.equal(found.wake.wakeId, wakeId);
    console.log('  [PASS] Case 5: getRuns returns run merged with corresponding wake data');
  }

  // Case 6: Safe restart recovery with PID check (alive vs dead process)
  {
    // A. Alive run: PID is current process (process.pid) -> must NOT be marked orphaned
    const aliveRunId = generateRunOrWakeId('run');
    recordRun({
      runId: aliveRunId,
      seatId: 'recovery-seat',
      startedAt: new Date().toISOString(),
      status: 'running',
      pid: process.pid,
    });

    // B. Dead run: PID is a non-existent pid (e.g. 9999999) -> MUST be marked orphaned
    const deadPid = 9999999;
    assert.equal(isProcessAlive(deadPid), false, 'Dead PID must register as not alive');

    const deadRunId = generateRunOrWakeId('run');
    recordRun({
      runId: deadRunId,
      seatId: 'recovery-seat',
      startedAt: new Date(Date.now() - 30_000).toISOString(),
      status: 'running',
      pid: deadPid,
    });

    // C. Expired queued wake (> 3 minutes old)
    const expiredWakeId = generateRunOrWakeId('wake');
    recordWake({
      wakeId: expiredWakeId,
      seatId: 'recovery-seat',
      source: 'bell',
      requestedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      idempotencyKey: 'expired-key',
      status: 'queued',
    });

    // D. Fresh queued wake (< 30 seconds old) -> must NOT expire
    const freshWakeId = generateRunOrWakeId('wake');
    recordWake({
      wakeId: freshWakeId,
      seatId: 'recovery-seat',
      source: 'bell',
      requestedAt: new Date().toISOString(),
      idempotencyKey: 'fresh-key',
      status: 'queued',
    });

    const result = recoverOrphanedRuns();
    assert.ok(result.orphanedRuns >= 1);
    assert.ok(result.expiredWakes >= 1);

    // Verify alive run is preserved
    const aliveRun = getRun(aliveRunId);
    assert.equal(aliveRun.status, 'running', 'Running run with alive PID must NOT be marked orphaned');

    // Verify dead run is marked failed:orphaned
    const deadRun = getRun(deadRunId);
    assert.equal(deadRun.status, 'failed', 'Running run with dead PID must be marked failed');
    assert.equal(deadRun.errorKind, 'orphaned');

    // Verify wake expiration
    assert.equal(getWake(expiredWakeId).status, 'expired', 'Queued wake older than TTL must expire');
    assert.equal(getWake(freshWakeId).status, 'queued', 'Recent queued wake must remain queued');

    console.log('  [PASS] Case 6: recoverOrphanedRuns respects process liveness and queue TTL');
  }

  // Case 7: Corrupted JSON lines in ledger files are skipped gracefully
  {
    const runsDir = getRunsDir();
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(runsDir, `${today}.jsonl`);
    fs.appendFileSync(filePath, 'CORRUPT_NOT_JSON_LINE\n{"invalid":"structure"}\n{broken_json: 1\n');

    // Reading should not crash
    const runsAfterCorrupt = getRuns({ seat: 'recovery-seat', limit: 10 });
    assert.ok(Array.isArray(runsAfterCorrupt));
    console.log('  [PASS] Case 7: corrupted JSON lines in ledger files handled gracefully');
  }

  // Case 8: Multi-day folding preserves newest event (starts Day 1, finishes Day 2)
  {
    const runsDir = getRunsDir();
    const day1File = path.join(runsDir, '2026-10-10.jsonl');
    const day2File = path.join(runsDir, '2026-10-11.jsonl');
    const multiDayRunId = 'run-multiday-test-1';

    // Day 1: Started running at 23:59:00
    fs.appendFileSync(
      day1File,
      JSON.stringify({
        type: 'run',
        runId: multiDayRunId,
        seatId: 'multiday-seat',
        prompt: 'Multi-day execution task',
        startedAt: '2026-10-10T23:59:00.000Z',
        status: 'running',
        attempt: 1,
        updatedAt: '2026-10-10T23:59:00.000Z',
      }) + '\n'
    );

    // Day 2: Finished at 00:01:30
    fs.appendFileSync(
      day2File,
      JSON.stringify({
        type: 'run',
        runId: multiDayRunId,
        seatId: 'multiday-seat',
        startedAt: '2026-10-10T23:59:00.000Z',
        finishedAt: '2026-10-11T00:01:30.000Z',
        status: 'finished',
        exitCode: 0,
        costStatus: 'recorded',
        updatedAt: '2026-10-11T00:01:30.000Z',
      }) + '\n'
    );

    const queriedRuns = getRuns({ seat: 'multiday-seat', limit: 10 });
    assert.equal(queriedRuns.length, 1, 'Multi-day run must fold into exactly one record');
    assert.equal(
      queriedRuns[0].status,
      'finished',
      'Multi-day folding must preserve newest finished status (never revert to running)'
    );
    assert.equal(queriedRuns[0].startedAt, '2026-10-10T23:59:00.000Z');
    assert.equal(queriedRuns[0].finishedAt, '2026-10-11T00:01:30.000Z');
    assert.equal(queriedRuns[0].costStatus, 'recorded');
    console.log('  [PASS] Case 8: multi-day folding correctly preserves latest status across midnight');
  }

  // Case 9: ISO date bounds with timezone offset in getRuns
  {
    const runsDir = getRunsDir();
    const utcDateFile = path.join(runsDir, '2026-10-12.jsonl');
    const offsetRunId = 'run-offset-test-1';

    fs.appendFileSync(
      utcDateFile,
      JSON.stringify({
        type: 'run',
        runId: offsetRunId,
        seatId: 'offset-seat',
        startedAt: '2026-10-12T16:00:00.000Z',
        status: 'finished',
        exitCode: 0,
        updatedAt: '2026-10-12T16:00:00.000Z',
      }) + '\n'
    );

    // Query with +09:00 timezone offset (16:00 UTC on Oct 12 is 01:00 on Oct 13 in JST/KST)
    const runsWithOffset = getRuns({
      seat: 'offset-seat',
      from: '2026-10-13T00:30:00+09:00', // equivalent to 2026-10-12T15:30:00Z
      to: '2026-10-13T02:00:00+09:00',   // equivalent to 2026-10-12T17:00:00Z
    });
    assert.equal(runsWithOffset.length, 1, 'Runs query must normalize ISO bounds to UTC without dropping offset matches');
    assert.equal(runsWithOffset[0].runId, offsetRunId);
    console.log('  [PASS] Case 9: ISO date bounds with timezone offsets accurately query UTC files');
  }

  // Case 10: Missing directory / missing files returns empty arrays / null with dedicated assertions
  {
    const originalEnv = process.env.AIBOSS_DATA_DIR;
    try {
      process.env.AIBOSS_DATA_DIR = path.join(os.tmpdir(), 'missing-dir-' + Date.now());
      assert.deepEqual(getRuns({ seat: 'nonexistent' }), [], 'getRuns on missing directory must return empty array');
      assert.equal(getWake('wake-missing-id'), null, 'getWake on missing file must return null');
      assert.equal(getRun('run-missing-id'), null, 'getRun on missing file must return null');
    } finally {
      process.env.AIBOSS_DATA_DIR = originalEnv;
    }
    console.log('  [PASS] Case 10: missing directory and missing files return clean empty/null results');
  }

  // Case 11: Real tickRunner fault injection & queue recovery (append failure -> activeSeats cleaned + item reverted)
  {
    const testQueueMa = 'test-queue-fault-' + Date.now();
    const testQueueFile = path.join(testDataDir, 'danh-thuc.json');
    fs.mkdirSync(testDataDir, { recursive: true });
    fs.writeFileSync(
      testQueueFile,
      JSON.stringify({
        hang_doi: [
          {
            ma: testQueueMa,
            ma_o: 'o-1',
            ma_nhan_su: 'fault-seat',
            tu_ai: 'tester',
            cau_hoi: 'Test fault handling',
            luc: Date.now(),
            da_xu: false,
            trang_thai: 'cho',
          },
        ],
        moc_goi: [],
      })
    );

    // Initial check: fault-seat not in active_seats
    assert.equal(getOfficeRunnerStatus().active_seats.includes('fault-seat'), false);

    // Injected failure on appendRecord
    process.env.AIBOSS_TEST_FAIL_APPEND = '1';
    try {
      // Execute REAL tickRunner
      await tickRunner();
    } finally {
      delete process.env.AIBOSS_TEST_FAIL_APPEND;
    }

    // Verify real activeSeats cleaned up 'fault-seat'
    const status = getOfficeRunnerStatus();
    assert.equal(
      status.active_seats.includes('fault-seat'),
      false,
      'real activeSeats must not contain fault-seat after error'
    );

    // Verify queue item reverted to 'cho' via real traVeHangDoi
    const updatedQueue = JSON.parse(fs.readFileSync(testQueueFile, 'utf-8'));
    const item = updatedQueue.hang_doi.find((x) => x.ma === testQueueMa);
    assert.equal(item.trang_thai, 'cho', 'Queue item must revert to "cho" on ledger throw');
    assert.equal(item.da_xu, false);
    assert.equal(item.xu_luc, null);
    console.log('  [PASS] Case 11: fault injection recovery verifies real tickRunner activeSeats cleanup and queue return');
  }

  // Case 12: Multi-model run partial failure, retry per-model, and idempotency (Hermes Finding B / Item 2)
  {
    const multiRunId = generateRunOrWakeId('run');
    const modelA = 'claude-3-7-sonnet-20250219';
    const modelB = 'claude-3-5-haiku-20241022';

    const normalizedReceipts = sanitizeUsageReceipts([
      {
        model: modelA,
        inputTokens: 1000,
        cachedInputTokens: 50,
        cacheCreationTokens: 20,
        outputTokens: 200,
        totalCostUsd: '0.010',
        costNanodollars: '10000000',
        priced: true,
      },
      {
        model: modelB,
        inputTokens: 500,
        cachedInputTokens: 20,
        cacheCreationTokens: 0,
        outputTokens: 100,
        totalCostUsd: '0.002',
        costNanodollars: '2000000',
        priced: true,
      },
    ]);

    // Simulate partial write during run completion: modelA succeeds, but modelB throws
    recordCostReceipt({
      ts: new Date().toISOString(),
      seatId: 'multi-model-seat',
      runId: multiRunId,
      model: modelA,
      inputTokens: 1020,
      cachedInputTokens: 50,
      cacheCreationTokens: 20,
      outputTokens: 200,
      costNanodollars: '10000000',
      priced: true,
      source: 'claude-stream-json',
    });

    // Run is saved as pending with normalized rawUsage
    recordRun({
      runId: multiRunId,
      seatId: 'multi-model-seat',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'finished',
      costStatus: 'pending',
      rawUsage: normalizedReceipts,
    });

    // Verify modelA is recorded, modelB is not
    const costsBefore = readAllCostRecords().filter((c) => c.runId === multiRunId);
    assert.equal(costsBefore.length, 1);
    assert.equal(costsBefore[0].model, modelA);

    // 1. Reconcile with failure still active for modelB: must NOT mark recorded!
    process.env.AIBOSS_TEST_FAIL_COST_MODEL = modelB;
    try {
      const reconciledPartial = reconcilePendingCosts();
      assert.equal(reconciledPartial, 0, 'Must not mark run recorded when modelB fails');
      const runStillPending = getRun(multiRunId);
      assert.equal(runStillPending.costStatus, 'pending', 'Run must remain pending when some models missing');
    } finally {
      delete process.env.AIBOSS_TEST_FAIL_COST_MODEL;
    }

    // 2. Reconcile with failure cleared: modelB is now recorded, run transitions to recorded
    const reconciledComplete = reconcilePendingCosts();
    assert.equal(reconciledComplete, 1, 'Reconciler must complete multi-model run');

    const runCompleted = getRun(multiRunId);
    assert.equal(runCompleted.costStatus, 'recorded', 'Run must now be recorded');
    assert.equal(runCompleted.rawUsage, undefined, 'rawUsage must be removed by tombstone folding');

    const costsAfter = readAllCostRecords().filter((c) => c.runId === multiRunId);
    assert.equal(costsAfter.length, 2, 'Both modelA and modelB receipts must now exist');
    assert.ok(costsAfter.some((c) => c.model === modelA));
    assert.ok(costsAfter.some((c) => c.model === modelB));

    // 3. Reconcile a 3rd time: idempotent, no extra cost records created
    const reconciledAgain = reconcilePendingCosts();
    assert.equal(reconciledAgain, 0);
    const costsFinal = readAllCostRecords().filter((c) => c.runId === multiRunId);
    assert.equal(costsFinal.length, 2, 'No duplicates in costs ledger on repeated reconciliation');

    console.log('  [PASS] Case 12: multi-model partial failure retry and idempotent reconciliation verified');
  }

  // Case 13: Orphaned run recovery fallback failure preserves pending (Hermes Item 3)
  {
    const orphanRunId = generateRunOrWakeId('run');
    recordRun({
      runId: orphanRunId,
      seatId: 'orphan-fallback-seat',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'running',
      pid: 9999997,
    });

    // Simulate failure writing fallback receipt
    process.env.AIBOSS_TEST_FAIL_COST_MODEL = 'unknown';
    try {
      recoverOrphanedRuns();
    } finally {
      delete process.env.AIBOSS_TEST_FAIL_COST_MODEL;
    }

    const orphanAfterFailedFallback = getRun(orphanRunId);
    assert.equal(orphanAfterFailedFallback.status, 'failed');
    assert.equal(orphanAfterFailedFallback.errorKind, 'orphaned');
    assert.equal(
      orphanAfterFailedFallback.costStatus,
      'pending',
      'Orphaned run must remain pending when fallback receipt write fails'
    );

    // Now reconcile with fallback writing functioning
    const recoveredCount = reconcilePendingCosts();
    assert.ok(recoveredCount >= 1, 'Reconciler must recover pending orphan fallback');
    const orphanFinal = getRun(orphanRunId);
    assert.equal(orphanFinal.costStatus, 'unpriced', 'Orphaned run must transition to unpriced once recorded');
    console.log('  [PASS] Case 13: orphaned run fallback failure preserves pending status and recovers cleanly');
  }

  // Case 14: Zero free-text leaks in ledger files, tombstone null, and whitelist API (Hermes Item 10 / H1 / H2)
  {
    const leakRunId = generateRunOrWakeId('run');
    const secretText = 'SECRET_DO_NOT_LEAK_PROMPT_12345';
    const errorText = 'CRITICAL_INTERNAL_ERROR_STACK_67890';

    const rawEventWithSecrets = {
      type: 'result',
      result: secretText,
      prompt: secretText,
      errors: [errorText],
      model: 'claude-3-7-sonnet-20250219',
      total_cost_usd: 0.005,
      usage: {
        input_tokens: 200,
        output_tokens: 80,
      },
    };

    // Sanitize usage receipts: must strip result, prompt, errors
    const sanitized = getNormalizedUsageFromRaw(rawEventWithSecrets);
    assert.equal(sanitized.length, 1);
    assert.equal(sanitized[0].model, 'claude-3-7-sonnet-20250219');
    assert.equal(sanitized[0].inputTokens, 200);
    assert.equal(sanitized[0].outputTokens, 80);
    assert.equal('result' in sanitized[0], false, 'result text must be stripped');
    assert.equal('prompt' in sanitized[0], false, 'prompt text must be stripped');
    assert.equal('errors' in sanitized[0], false, 'errors text must be stripped');

    // Record pending run
    recordRun({
      runId: leakRunId,
      seatId: 'leak-seat',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'finished',
      costStatus: 'pending',
      rawUsage: sanitized,
    });

    // Check ledger files on disk: verify no secret text was ever written
    const files = fs.readdirSync(getRunsDir());
    for (const f of files) {
      const content = fs.readFileSync(path.join(getRunsDir(), f), 'utf-8');
      assert.equal(content.includes(secretText), false, `Ledger file ${f} must not contain secret text`);
      assert.equal(content.includes(errorText), false, `Ledger file ${f} must not contain error text`);
    }

    // Reconcile run: writes tombstone rawUsage: null
    reconcilePendingCosts();

    // Verify getRun has no rawUsage property after folding
    const foldedRun = getRun(leakRunId);
    assert.equal(foldedRun.costStatus, 'recorded');
    assert.equal('rawUsage' in foldedRun, false, 'rawUsage must be deleted from folded run');

    // Verify getRuns query output has no rawUsage property
    const queriedRuns = getRuns({ limit: 10 });
    const matchingQueried = queriedRuns.find((r) => r.runId === leakRunId);
    assert.ok(matchingQueried);
    assert.equal('rawUsage' in matchingQueried, false, 'rawUsage must not exist in getRuns output');

    // Verify sanitizeRun strips rawUsage unconditionally
    const sanitizedApiRun = sanitizeRun({ ...foldedRun, rawUsage: sanitized });
    assert.equal('rawUsage' in sanitizedApiRun, false, 'sanitizeRun must strip rawUsage');

    console.log('  [PASS] Case 14: zero free-text leaks, tombstone deletion, and API whitelisting verified');
  }

  // Case 15: Invalid total_cost_usd string (e.g. "provider-error-detail") drops string and marks priced: false (Hermes v06 #1)
  {
    const invalidCostEvent = {
      type: 'result',
      model: 'claude-3-7-sonnet-20250219',
      total_cost_usd: 'provider-error-detail',
      usage: {
        input_tokens: 300,
        output_tokens: 120,
      },
    };

    const receipts = getNormalizedUsageFromRaw(invalidCostEvent);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].model, 'claude-3-7-sonnet-20250219');
    assert.equal(receipts[0].inputTokens, 300);
    assert.equal(receipts[0].outputTokens, 120);
    assert.equal(receipts[0].totalCostUsd, undefined, 'Invalid totalCostUsd string must be omitted');
    assert.equal(receipts[0].costNanodollars, null, 'Unparsed cost must be costNanodollars: null');
    assert.equal(receipts[0].priced, false, 'Unparsed cost must be priced: false');
    assert.equal('provider-error-detail' in receipts[0], false);
    assert.equal(
      JSON.stringify(receipts).includes('provider-error-detail'),
      false,
      'Error detail string must not leak into receipt'
    );

    // Also verify sanitizeUsageReceipts with explicit bad totalCostUsd
    const badCostReceipts = sanitizeUsageReceipts([
      {
        model: 'bad-cost-model',
        inputTokens: 10,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 5,
        totalCostUsd: 'not-a-number-rate-limit-error',
        costNanodollars: null,
        priced: true,
      },
    ]);
    assert.equal(badCostReceipts[0].totalCostUsd, undefined);
    assert.equal(badCostReceipts[0].priced, false);
    assert.equal(JSON.stringify(badCostReceipts).includes('rate-limit-error'), false);

    console.log('  [PASS] Case 15: invalid totalCostUsd strings strictly dropped and marked unpriced');
  }

  // Case 16: Legacy record with raw text in rawUsage sanitized across updates and API output (Hermes v06 #2, #3)
  {
    const legacyRunId = generateRunOrWakeId('run');
    const legacySecretText = 'LEGACY_PROMPT_SECRET_IN_RAW_USAGE_88888';
    const legacyErrorText = 'LEGACY_ERROR_STACK_IN_RAW_USAGE_99999';

    // Simulate legacy run directly recorded with un-sanitized rawUsage
    recordRun({
      runId: legacyRunId,
      seatId: 'legacy-seat',
      startedAt: new Date().toISOString(),
      status: 'running',
      rawUsage: {
        result: legacySecretText,
        errors: [legacyErrorText],
        custom_junk: 'should_never_exist_on_disk',
      },
    });

    // Check disk: sanitizeRawUsage in recordRun/appendRecord must have stripped all junk!
    const files = fs.readdirSync(getRunsDir());
    for (const f of files) {
      const content = fs.readFileSync(path.join(getRunsDir(), f), 'utf-8');
      assert.equal(content.includes(legacySecretText), false, 'Disk must not contain legacy secret text');
      assert.equal(content.includes(legacyErrorText), false, 'Disk must not contain legacy error text');
      assert.equal(content.includes('custom_junk'), false, 'Disk must not contain custom junk');
    }

    // Update the run with another patch
    updateRun(legacyRunId, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      rawUsage: {
        result: 'ANOTHER_LEAK_ATTEMPT',
      },
    });

    // Check disk again: no leak
    for (const f of files) {
      const content = fs.readFileSync(path.join(getRunsDir(), f), 'utf-8');
      assert.equal(content.includes('ANOTHER_LEAK_ATTEMPT'), false);
    }

    // Query via getRuns: verify sanitizeRun explicit whitelist drops any unknown properties
    const runsResult = getRuns({ limit: 5 });
    const legacyRun = runsResult.find((r) => r.runId === legacyRunId);
    assert.ok(legacyRun);
    assert.equal('rawUsage' in legacyRun, false, 'rawUsage must not exist in API output');
    assert.equal('custom_junk' in legacyRun, false, 'unknown properties must not exist in API output');

    console.log('  [PASS] Case 16: legacy rawUsage sanitized across writer boundaries and API output strictly whitelisted');
  }

  console.log('>>> ALL RUNS LEDGER TEST CASES PASSED <<<');
} finally {
  // Clean up isolated test directory
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup */
  }
}
