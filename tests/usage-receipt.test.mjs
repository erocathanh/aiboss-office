import assert from 'node:assert/strict';
import { extractUsageReceipts, parseStreamJsonLines } from '../src/lib/usage-receipt.ts';

console.log('--- Testing src/lib/usage-receipt.ts ---');

// Case 1: Standard single-model run from real seat turn (text anonymized)
{
  const rawNdjson = [
    JSON.stringify({ type: 'system', data: 'session init' }),
    JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } } }),
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      total_cost_usd: 0.067425,
      modelUsage: {
        'claude-3-7-sonnet-20250219': {
          inputTokens: 1250,
          outputTokens: 85,
          cacheCreationInputTokens: 300,
          cacheReadInputTokens: 4200,
          costUSD: 0.067425,
        },
      },
    }),
  ].join('\n');

  const receipts = extractUsageReceipts(rawNdjson);
  assert.equal(receipts.length, 1);
  const r = receipts[0];
  assert.equal(r.model, 'claude-3-7-sonnet-20250219');
  // Cache creation (300) added to input (1250) = 1550
  assert.equal(r.inputTokens, 1550, 'Input tokens must include cache creation');
  assert.equal(r.cacheCreationTokens, 300);
  assert.equal(r.cachedInputTokens, 4200);
  assert.equal(r.outputTokens, 85);
  assert.equal(r.priced, true);
  assert.equal(r.totalCostUsd, '0.067425');
  // 0.067425 USD = 67,425,000 nanodollars
  assert.equal(r.costNanodollars, 67_425_000);
  console.log('  [PASS] Case 1: standard single-model run with nanodollar precision');
}

// Case 2: Multi-model / subagent run
{
  const events = [
    {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 0.0812,
      modelUsage: {
        'claude-3-7-sonnet-20250219': {
          inputTokens: 2000,
          outputTokens: 150,
          cacheCreationInputTokens: 500,
          cacheReadInputTokens: 1000,
          costUSD: 0.075,
        },
        'claude-3-5-haiku-20241022': {
          inputTokens: 800,
          outputTokens: 200,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUSD: 0.0062,
        },
      },
    },
  ];

  const receipts = extractUsageReceipts(events);
  assert.equal(receipts.length, 2, 'Must extract 2 model receipts');
  const sonnet = receipts.find((r) => r.model === 'claude-3-7-sonnet-20250219');
  const haiku = receipts.find((r) => r.model === 'claude-3-5-haiku-20241022');

  assert.ok(sonnet && haiku);
  assert.equal(sonnet.inputTokens, 2500); // 2000 + 500
  assert.equal(sonnet.costNanodollars, 75_000_000);
  assert.equal(haiku.inputTokens, 800);
  assert.equal(haiku.costNanodollars, 6_200_000);
  console.log('  [PASS] Case 2: multi-model / subagent usage properly partitioned');
}

// Case 3: Unpriced run (missing total_cost_usd or cost is null)
{
  const events = [
    {
      type: 'result',
      subtype: 'success',
      usage: {
        input_tokens: 500,
        output_tokens: 40,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 200,
      },
      model: 'claude-local-stub',
      // total_cost_usd omitted/null
    },
  ];

  const receipts = extractUsageReceipts(events);
  assert.equal(receipts.length, 1);
  const r = receipts[0];
  assert.equal(r.priced, false);
  assert.equal(r.costNanodollars, null);
  assert.equal(r.inputTokens, 600); // 500 + 100
  console.log('  [PASS] Case 3: unpriced run handled as { costNanodollars: null, priced: false }');
}

// Case 4: Cache creation and read token separation
{
  const events = [
    {
      type: 'result',
      model: 'claude-3-5-sonnet',
      total_cost_usd: 0.015,
      usage: {
        input_tokens: 1000,
        cache_creation_input_tokens: 250,
        cache_read_input_tokens: 3500,
        output_tokens: 120,
      },
    },
  ];

  const receipts = extractUsageReceipts(events);
  assert.equal(receipts.length, 1);
  const r = receipts[0];
  assert.equal(r.inputTokens, 1250, 'Billed input tokens must sum base input + cache creation');
  assert.equal(r.cachedInputTokens, 3500, 'Cache read tokens must be distinct');
  assert.equal(r.cacheCreationTokens, 250, 'Cache creation tokens recorded separately');
  console.log('  [PASS] Case 4: cache tokens properly separated and summed');
}

// Case 5: Positive Control — Verifying that failing to add cache-creation to inputTokens FAILS
{
  console.log('--- Testing Positive Control for Cache Creation Addition ---');
  const sample = [
    {
      type: 'result',
      total_cost_usd: 0.01,
      modelUsage: {
        'test-model': {
          inputTokens: 1000,
          cacheCreationInputTokens: 400,
          outputTokens: 50,
        },
      },
    },
  ];

  // Control without adding cache-creation
  const faultyReceipts = extractUsageReceipts(sample, { skipCacheCreationAddition: true });
  let failedAsExpected = false;
  try {
    assert.equal(
      faultyReceipts[0].inputTokens,
      1400,
      'When cache creation is skipped, inputTokens should fail assertion'
    );
  } catch (err) {
    failedAsExpected = true;
    console.log('  [PASS] Positive control: skipping cache creation addition causes assertion failure as expected:', err.message);
  }
  assert.ok(failedAsExpected, 'Positive control MUST fail when cache creation is not added');
}

console.log('>>> ALL USAGE RECEIPT TEST CASES AND POSITIVE CONTROL PASSED <<<');
