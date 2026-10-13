import assert from 'node:assert/strict';
import {
  usdToCents,
  usdToUnits,
  centsToUnits,
  addCents,
  subtractCents,
  formatUsdExact,
  MONEY_SCALE,
  MAX_MONEY_UNITS,
} from '../src/lib/money.ts';

console.log('--- Testing src/lib/money.ts ---');

// Case 1: parse "0.68" USD
{
  const units = usdToUnits('0.68');
  assert.equal(units, 680_000_000n, '0.68 USD must equal 680,000,000 nanodollar units');
  const cents = usdToCents('0.68');
  assert.equal(cents, '68.0000000', '0.68 USD must equal 68.0000000 cents');
  console.log('  [PASS] Case 1: parse "0.68" USD correctly');
}

// Case 2: Addition
{
  const sum = addCents('0.68', '1.32');
  assert.equal(sum, '2.0000000', '0.68 + 1.32 must equal 2.0000000 cents');
  const sum2 = addCents('10.5', '20.25', '0.0000001');
  assert.equal(sum2, '30.7500001', 'Multi-value add must be exact');
  console.log('  [PASS] Case 2: addition with exact integer arithmetic');
}

// Case 3: Half-away-from-zero rounding
{
  // 0.5 cents ($0.005) rounds up to 1 cent ($0.01)
  assert.equal(formatUsdExact('0.5'), '$0.01', '0.5 cents rounds to $0.01');
  // 0.49 cents ($0.0049) rounds down to 0 cents ($0.00)
  assert.equal(formatUsdExact('0.49'), '$0.00', '0.49 cents rounds to $0.00');
  // Negative half-away-from-zero: -0.5 cents rounds to -$0.01
  assert.equal(formatUsdExact('-0.5'), '-$0.01', '-0.5 cents rounds to -$0.01');
  console.log('  [PASS] Case 3: half-away-from-zero rounding');
}

// Case 4: Overflow and precision guard throws error
{
  assert.throws(
    () => centsToUnits('1'.repeat(161)),
    /precision/,
    'Text exceeding 160 chars must throw precision error'
  );
  assert.throws(
    () => centsToUnits('1e101'),
    /exponent/,
    'Exponent > 100 must throw out of range error'
  );
  assert.throws(
    () => centsToUnits('1e25'),
    /storage/,
    'Value exceeding MAX_MONEY_UNITS must throw storage error'
  );
  console.log('  [PASS] Case 4: overflow and precision limits throw errors');
}

// Case 5: Negative amounts
{
  const diff = subtractCents('10', '15');
  assert.equal(diff, '-5.0000000', '10 - 15 must equal -5.0000000 cents');
  const formatted = formatUsdExact('-50');
  assert.equal(formatted, '-$0.50', '-50 cents formats as -$0.50');
  console.log('  [PASS] Case 5: negative amounts preserved and formatted correctly');
}

console.log('>>> ALL 5 MONEY TEST CASES PASSED <<<');
