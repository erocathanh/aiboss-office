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

  // 7. Reverse scan without from stops early when limit is reached
  {
    const costsDir = getCostsDir();
    // Write 3 consecutive day files with distinct records
    for (let day = 1; day <= 3; day++) {
      const dateStr = `2026-10-0${day}`;
      const dayPath = path.join(costsDir, `${dateStr}.jsonl`);
      fs.writeFileSync(
        dayPath,
        JSON.stringify({
          ts: `${dateStr}T12:00:00.000Z`,
          seatId: 'reverse-seat',
          runId: `run-day-${day}`,
          model: 'claude-3-7-sonnet-20250219',
          inputTokens: 100,
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 10,
          costNanodollars: '10000000',
          priced: true,
          source: 'claude-stream-json',
        }) + '\n'
      );
    }

    // Query limit=1: must return only the newest record (2026-10-03)
    const aggLimit1 = getCostsAggregation({ seat: 'reverse-seat', limit: 1 });
    assert.equal(aggLimit1.records.length, 1);
    assert.equal(aggLimit1.records[0].runId, 'run-day-3', 'Must fetch newest record from day 3 first');
    assert.equal(aggLimit1.summary.totalRuns, 1);

    // Query limit=2: must return newest two records (day 3 and day 2)
    const aggLimit2 = getCostsAggregation({ seat: 'reverse-seat', limit: 2 });
    assert.equal(aggLimit2.records.length, 2);
    assert.equal(aggLimit2.records[0].runId, 'run-day-3');
    assert.equal(aggLimit2.records[1].runId, 'run-day-2');
    console.log('  [PASS] Case 7: reverse scan with limit accumulates newest records and stops early');
  }

  // 8. Missing directory handling returns clean empty aggregation
  {
    const originalEnv = process.env.AIBOSS_DATA_DIR;
    try {
      process.env.AIBOSS_DATA_DIR = path.join(os.tmpdir(), 'missing-costs-' + Date.now());
      const emptyAgg = getCostsAggregation({ seat: 'any' });
      assert.deepEqual(emptyAgg.records, []);
      assert.equal(emptyAgg.summary.totalRuns, 0);
      assert.equal(emptyAgg.summary.costNanodollars, '0');
    } finally {
      process.env.AIBOSS_DATA_DIR = originalEnv;
    }
    console.log('  [PASS] Case 8: missing costs directory returns clean empty aggregation without throwing');
  }

  // 9. ISO date bounds with timezone offset
  {
    const costsDir = getCostsDir();
    const utcDateStr = '2026-10-08';
    const dayPath = path.join(costsDir, `${utcDateStr}.jsonl`);
    fs.writeFileSync(
      dayPath,
      JSON.stringify({
        ts: '2026-10-08T22:30:00.000Z',
        seatId: 'offset-cost-seat',
        runId: 'run-cost-offset-1',
        model: 'claude-3-7-sonnet-20250219',
        inputTokens: 500,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 50,
        costNanodollars: '50000000',
        priced: true,
        source: 'claude-stream-json',
      }) + '\n'
    );

    // 22:30 UTC on Oct 08 is 07:30 on Oct 09 in +09:00
    const aggOffset = getCostsAggregation({
      seat: 'offset-cost-seat',
      from: '2026-10-09T07:00:00+09:00',
      to: '2026-10-09T08:00:00+09:00',
    });
    assert.equal(aggOffset.records.length, 1);
    assert.equal(aggOffset.records[0].runId, 'run-cost-offset-1');
    console.log('  [PASS] Case 9: ISO date bounds with timezone offsets correctly match UTC files');
  }

  console.log('>>> ALL COSTS LEDGER TEST CASES PASSED <<<');
} finally {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup */
  }
}
