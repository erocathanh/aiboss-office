import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// 1. ISOLATE DATA DIR: Tests must NEVER touch operations/data or production ledgers
const testDataDir = path.join(
  os.tmpdir(),
  'aiboss-test-costs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
);
process.env.AIBOSS_DATA_DIR = testDataDir;

import {
  recordCostReceipts,
  getCostsAggregation,
  formatNanodollars,
  isCostRecorded,
  getCostsDir,
} from '../src/lib/costs-ledger.ts';

console.log('--- Testing src/lib/costs-ledger.ts ---');

try {
  const testRunId1 = `test-run-${Date.now()}-1`;
  const testRunId2 = `test-run-${Date.now()}-2`;
  const testSeat = `marketing-test-${Date.now()}`;

  // 1. Record single priced receipt with exact string nanodollars
  const receipts1 = [
    {
      model: 'claude-3-7-sonnet-20250219',
      inputTokens: 1000,
      cachedInputTokens: 200,
      cacheCreationTokens: 400,
      outputTokens: 150,
      totalCostUsd: '0.68',
      costNanodollars: '680000000',
      priced: true,
    },
  ];

  const recorded1 = recordCostReceipts(testSeat, testRunId1, receipts1);
  assert.equal(recorded1.length, 1);
  assert.equal(recorded1[0].runId, testRunId1);
  assert.equal(recorded1[0].costNanodollars, '680000000');
  assert.equal(isCostRecorded(testRunId1, 'claude-3-7-sonnet-20250219'), true);
  console.log('  [PASS] Case 1: recording cost receipt succeeds and marks isCostRecorded');

  // 2. Test Idempotency & Correct Token Sum (No double-counting cache creation)
  const recordedAgain = recordCostReceipts(testSeat, testRunId1, receipts1);
  assert.equal(recordedAgain.length, 1);

  const agg1 = getCostsAggregation({ seat: testSeat });
  assert.equal(agg1.summary.totalRuns, 1);
  assert.equal(agg1.summary.costNanodollars, '680000000');
  assert.equal(agg1.summary.formattedCostUsd, '$0.68');

  // Finding A check: totalTokens = inputTokens (1000) + cachedInputTokens (200) + outputTokens (150) = 1350
  assert.equal(
    agg1.summary.totalTokens,
    1350,
    'totalTokens must equal inputTokens + cachedInputTokens + outputTokens without double-counting cacheCreation'
  );
  console.log('  [PASS] Case 2: idempotency prevents duplicate logging and tokens are not double-counted');

  // 3. Test Unpriced receipt
  const receipts2 = [
    {
      model: 'claude-unknown-model',
      inputTokens: 500,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 50,
      costNanodollars: null,
      priced: false,
    },
  ];

  recordCostReceipts(testSeat, testRunId2, receipts2);
  const agg2 = getCostsAggregation({ seat: testSeat });
  assert.equal(agg2.summary.totalRuns, 2);
  assert.equal(agg2.summary.unpricedRuns, 1);
  assert.equal(agg2.summary.costNanodollars, '680000000'); // cost unchanged because unpriced is null
  assert.equal(agg2.bySeat[testSeat].unpricedRuns, 1);
  console.log('  [PASS] Case 3: unpriced receipt accounted in unpricedRuns without corrupting cost totals');

  // 4. Large number (> 2^53 nanodollars) representation and exact arithmetic
  const bigRunId = `test-run-big-${Date.now()}`;
  const bigReceipt = [
    {
      model: 'claude-big',
      inputTokens: 10000,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 500,
      totalCostUsd: '15000000.50',
      costNanodollars: '15000000500000000', // > 2^53
      priced: true,
    },
  ];
  recordCostReceipts('big-seat', bigRunId, bigReceipt);
  const bigAgg = getCostsAggregation({ seat: 'big-seat' });
  assert.equal(bigAgg.summary.costNanodollars, '15000000500000000', 'BigInt nanodollars must preserve exact decimal string');
  assert.equal(bigAgg.summary.formattedCostUsd, '$15000000.50');
  console.log('  [PASS] Case 4: large numbers > 2^53 preserved without precision loss');

  // 5. Test formatting helper
  assert.equal(formatNanodollars('680000000'), '$0.68');
  assert.equal(formatNanodollars(0), '$0.00');
  assert.equal(formatNanodollars(12500000000n), '$12.50');
  assert.equal(formatNanodollars('15000000500000000'), '$15000000.50');
  console.log('  [PASS] Case 5: formatNanodollars displays clean USD strings for arbitrary magnitudes');

  // 6. Corrupted JSON lines in costs directory handled gracefully
  const costsDir = getCostsDir();
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(costsDir, `${today}.jsonl`);
  fs.appendFileSync(filePath, 'CORRUPTED_LINE_NOT_JSON\n{"invalid":"cost"}\n');

  const aggAfterCorrupt = getCostsAggregation({ seat: testSeat });
  assert.ok(aggAfterCorrupt);
  assert.equal(aggAfterCorrupt.summary.totalRuns, 2);
  console.log('  [PASS] Case 6: corrupted lines in costs ledger skipped gracefully');

  console.log('>>> ALL COSTS LEDGER TEST CASES PASSED <<<');
} finally {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup */
  }
}
