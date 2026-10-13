import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  recordCostReceipts,
  getCostsAggregation,
  formatNanodollars,
  isCostRecorded,
} from '../src/lib/costs-ledger.ts';

const REPO_ROOT = process.cwd();
const COSTS_DIR = path.join(REPO_ROOT, 'operations', 'data', 'costs');

console.log('--- Testing src/lib/costs-ledger.ts ---');

// Clean up test costs directory or use a unique runId to isolate
const testRunId1 = `test-run-${Date.now()}-1`;
const testRunId2 = `test-run-${Date.now()}-2`;
const testSeat = `marketing-test-${Date.now()}`;

// 1. Record single priced receipt
const receipts1 = [
  {
    model: 'claude-3-7-sonnet-20250219',
    inputTokens: 1000,
    cachedInputTokens: 200,
    cacheCreationTokens: 400,
    outputTokens: 150,
    totalCostUsd: '0.68',
    costNanodollars: 680000000,
    priced: true,
  },
];

const recorded1 = recordCostReceipts(testSeat, testRunId1, receipts1);
assert.equal(recorded1.length, 1);
assert.equal(recorded1[0].runId, testRunId1);
assert.equal(recorded1[0].costNanodollars, 680000000);
assert.equal(isCostRecorded(testRunId1, 'claude-3-7-sonnet-20250219'), true);
console.log('  [PASS] Case 1: recording cost receipt succeeds and marks isCostRecorded');

// 2. Test Idempotency: re-recording same receipt does not duplicate or double-count
const recordedAgain = recordCostReceipts(testSeat, testRunId1, receipts1);
assert.equal(recordedAgain.length, 1);

const agg1 = getCostsAggregation({ seat: testSeat });
assert.equal(agg1.summary.totalRuns, 1);
assert.equal(agg1.summary.costNanodollars, 680000000);
assert.equal(agg1.summary.formattedCostUsd, '$0.68');
console.log('  [PASS] Case 2: idempotency prevents duplicate cost logging and double-counting');

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
assert.equal(agg2.summary.costNanodollars, 680000000); // cost hasn't changed because unpriced is null
assert.equal(agg2.bySeat[testSeat].unpricedRuns, 1);
console.log('  [PASS] Case 3: unpriced receipt accounted in unpricedRuns without corrupting cost totals');

// 4. Test formatting
assert.equal(formatNanodollars(680000000), '$0.68');
assert.equal(formatNanodollars(0), '$0.00');
assert.equal(formatNanodollars(12500000000n), '$12.50');
console.log('  [PASS] Case 4: formatNanodollars displays clean USD strings');

console.log('>>> ALL COSTS LEDGER TEST CASES PASSED <<<');
