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
  findRecentWakeByIdempotencyKey,
  getRunsDir,
  isProcessAlive,
} from '../src/lib/runs-ledger.ts';

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

  // Case 2: Sliding-window idempotency across minute boundary (e.g. 12:00:59 and 12:01:01)
  {
    const prompt = 'Review viral marketing strategy';
    const key1 = computeIdempotencyKey('marketing-lead', prompt);
    const key2 = computeIdempotencyKey('marketing-lead', prompt);
    assert.equal(key1, key2, 'Semantic idempotency key must not bucket by minute');

    const wakeT1 = recordWake({
      wakeId: generateRunOrWakeId('wake'),
      seatId: 'marketing-lead',
      source: 'bell',
      requestedAt: new Date(1700000059000).toISOString(), // 12:00:59
      idempotencyKey: key1,
      status: 'queued',
    });

    // 2 seconds later (12:01:01) across minute boundary
    const duplicate = findRecentWakeByIdempotencyKey('marketing-lead', key1, 60_000, 1700000061000);
    assert.ok(duplicate, 'Must detect duplicate across minute boundary');
    assert.equal(duplicate.wakeId, wakeT1.wakeId);

    // 65 seconds later: sliding window expired
    const expiredWindow = findRecentWakeByIdempotencyKey('marketing-lead', key1, 60_000, 1700000059000 + 65_000);
    assert.equal(expiredWindow, null, 'Wake older than 60s sliding window must not block new wake');

    console.log('  [PASS] Case 2: sliding-window idempotency works across minute boundaries');
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

  console.log('>>> ALL RUNS LEDGER TEST CASES PASSED <<<');
} finally {
  // Clean up isolated test directory
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup */
  }
}
