import assert from 'node:assert/strict';
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
} from '../src/lib/runs-ledger.ts';

console.log('--- Testing src/lib/runs-ledger.ts ---');

// 1. ID generation format: prefix-YYYYMMDD-HHMMSS-<6 hex>
const wakeId = generateRunOrWakeId('wake');
const runId = generateRunOrWakeId('run');
assert.match(wakeId, /^wake-\d{8}-\d{6}-[a-f0-9]{6}$/);
assert.match(runId, /^run-\d{8}-\d{6}-[a-f0-9]{6}$/);
console.log('  [PASS] Case 1: ID generation format matches prefix-YYYYMMDD-HHMMSS-<6 hex>');

// 2. Idempotency key stability
const key1 = computeIdempotencyKey('marketing-lead', 'Review pipeline', 1700000000000);
const key2 = computeIdempotencyKey('marketing-lead', 'Review pipeline', 1700000010000); // 10s later in same minute
assert.equal(key1, key2);
console.log('  [PASS] Case 2: Idempotency key is identical within 60s window');

// 3. Record wake and find recent wake
const testWakeId = generateRunOrWakeId('wake');
const testKey = computeIdempotencyKey('marketing-lead-test', 'Wake prompt ' + Date.now(), Date.now());
const wake = recordWake({
  wakeId: testWakeId,
  seatId: 'marketing-lead-test',
  source: 'bell',
  requestedAt: new Date().toISOString(),
  idempotencyKey: testKey,
  status: 'queued',
});
assert.equal(wake.wakeId, testWakeId);

const foundWake = findRecentWakeByIdempotencyKey('marketing-lead-test', testKey, 60_000);
assert.ok(foundWake);
assert.equal(foundWake.wakeId, testWakeId);
console.log('  [PASS] Case 3: recordWake and findRecentWakeByIdempotencyKey match');

// 4. Update wake to claimed
updateWake(testWakeId, { status: 'claimed', runId });
const claimedWake = getWake(testWakeId);
assert.equal(claimedWake.status, 'claimed');
assert.equal(claimedWake.runId, runId);
console.log('  [PASS] Case 4: updateWake transitions state to claimed');

// 5. Record run and update to finished
recordRun({
  runId,
  wakeId: testWakeId,
  seatId: 'marketing-lead-test',
  startedAt: new Date().toISOString(),
  status: 'running',
});
assert.equal(getRun(runId).status, 'running');

updateRun(runId, {
  status: 'finished',
  finishedAt: new Date().toISOString(),
  exitCode: 0,
});
const finishedRun = getRun(runId);
assert.equal(finishedRun.status, 'finished');
assert.equal(finishedRun.exitCode, 0);
console.log('  [PASS] Case 5: recordRun and updateRun transition to finished with exitCode');

// 6. getRuns query with wake merging
const runs = getRuns({ seat: 'marketing-lead-test', limit: 10 });
const testRunEntry = runs.find((r) => r.runId === runId);
assert.ok(testRunEntry);
assert.equal(testRunEntry.status, 'finished');
assert.ok(testRunEntry.wake);
assert.equal(testRunEntry.wake.wakeId, testWakeId);
console.log('  [PASS] Case 6: getRuns returns run merged with corresponding wake data');

// 7. Safe restart recovery of orphaned running runs
const orphanedRunId = generateRunOrWakeId('run');
recordRun({
  runId: orphanedRunId,
  seatId: 'marketing-lead-test',
  startedAt: new Date(Date.now() - 30_000).toISOString(),
  status: 'running',
});
assert.equal(getRun(orphanedRunId).status, 'running');

const recoveryResult = recoverOrphanedRuns();
assert.ok(recoveryResult.orphanedRuns >= 1);
const recoveredRun = getRun(orphanedRunId);
assert.equal(recoveredRun.status, 'failed');
assert.equal(recoveredRun.errorKind, 'orphaned');
console.log('  [PASS] Case 7: recoverOrphanedRuns safely transitions running runs to failed:orphaned');

console.log('>>> ALL RUNS LEDGER TEST CASES PASSED <<<');
