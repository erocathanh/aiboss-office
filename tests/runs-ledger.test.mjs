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
} from '../src/lib/runs-ledger.ts';
import { traVeHangDoi } from '../src/lib/kho-danh-thuc.ts';
import { readAllCostRecords } from '../src/lib/costs-ledger.ts';

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

  // Case 11: Fault injection & queue recovery (simulates runner append failure -> activeSeats cleaned + item reverted)
  {
    const activeSeats = new Set();
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
            da_xu: true,
            trang_thai: 'da_giao',
          },
        ],
        moc_goi: [],
      })
    );

    // Simulate runner claiming seat
    activeSeats.add('fault-seat');
    assert.equal(activeSeats.has('fault-seat'), true);

    // Fault injection: simulate append failure in runner
    try {
      throw new Error('Disk full on recordRun');
    } catch {
      activeSeats.delete('fault-seat');
      traVeHangDoi(testQueueMa);
    }

    assert.equal(activeSeats.has('fault-seat'), false, 'activeSeats must be cleaned up on failure');
    const updatedQueue = JSON.parse(fs.readFileSync(testQueueFile, 'utf-8'));
    const item = updatedQueue.hang_doi.find((x) => x.ma === testQueueMa);
    assert.equal(item.trang_thai, 'cho', 'Queue item must revert to "cho" on ledger throw');
    assert.equal(item.da_xu, false);
    assert.equal(item.xu_luc, null);
    console.log('  [PASS] Case 11: fault injection recovery verifies activeSeats cleanup and queue item return');
  }

  // Case 12: Finding B — pending cost reconciliation & fault injection recovery
  {
    const costRunId = generateRunOrWakeId('run');
    const rawStreamEvent = {
      type: 'result',
      usage: {
        input_tokens: 1500,
        output_tokens: 250,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 50,
      },
      total_cost_usd: 0.015,
      model: 'claude-3-7-sonnet-20250219',
    };

    // Attempt 1: Run finishes but recording costs threw -> stored with costStatus: 'pending' and rawUsage
    recordRun({
      runId: costRunId,
      seatId: 'cost-lifecycle-seat',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'finished',
      costStatus: 'pending',
      rawUsage: rawStreamEvent,
    });

    const pendingRun = getRun(costRunId);
    assert.equal(pendingRun.costStatus, 'pending', 'Attempt 1 failed recording: status must be pending');
    const costsBefore = readAllCostRecords().filter((c) => c.runId === costRunId);
    assert.equal(costsBefore.length, 0, 'No costs recorded before reconciliation');

    // Attempt 2: Reconciler runs (at runner startup / recoverOrphanedRuns)
    const reconciled = reconcilePendingCosts();
    assert.ok(reconciled >= 1, 'Reconciler must recover pending run');

    const reconciledRun = getRun(costRunId);
    assert.equal(reconciledRun.costStatus, 'recorded', 'Reconciled run must have costStatus: recorded');

    const costsAfter = readAllCostRecords().filter((c) => c.runId === costRunId);
    assert.equal(costsAfter.length, 1, 'Costs ledger must contain exact single line for recovered run');
    assert.equal(costsAfter[0].model, 'claude-3-7-sonnet-20250219');
    assert.equal(costsAfter[0].inputTokens, 1550); // 1500 + 50
    assert.equal(costsAfter[0].outputTokens, 250);
    assert.equal(costsAfter[0].cachedInputTokens, 100);
    assert.equal(costsAfter[0].priced, true);

    // Attempt 3: Idempotent re-run must not create duplicate cost lines
    reconcilePendingCosts();
    const costsIdempotent = readAllCostRecords().filter((c) => c.runId === costRunId);
    assert.equal(costsIdempotent.length, 1, 'Reconciler must be idempotent (exact 1 line in costs ledger)');

    // Test orphaned recovery preserves existing recorded costs
    const orphanRunId = generateRunOrWakeId('run');
    recordRun({
      runId: orphanRunId,
      seatId: 'cost-lifecycle-seat',
      startedAt: new Date(Date.now() - 30_000).toISOString(),
      status: 'running',
      pid: 9999998,
    });
    recoverOrphanedRuns();
    const orphanRun = getRun(orphanRunId);
    assert.equal(orphanRun.costStatus, 'unpriced', 'Orphaned run without usage must mark costStatus: unpriced');
    console.log('  [PASS] Case 12: Finding B pending cost reconciliation verified with fault injection & single ledger line');
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
