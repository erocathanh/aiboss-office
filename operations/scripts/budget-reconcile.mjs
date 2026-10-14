#!/usr/bin/env node

/**
 * operations/scripts/budget-reconcile.mjs
 * Operator CLI for inspecting open holds and performing safe manual hold releases.
 *
 * Usage:
 *   node --import ./tests/register.mjs operations/scripts/budget-reconcile.mjs --check
 *   node --import ./tests/register.mjs operations/scripts/budget-reconcile.mjs --release <holdId> [--reason <expired|orphaned|failed_no_receipt>]
 */

import {
  replayAndGetCheckpoint,
  getActiveHolds,
  releaseHold,
} from '../../src/lib/budget-ledger.ts';

const ALLOWED_REASONS = ['expired', 'orphaned', 'failed_no_receipt'];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    check: false,
    release: null,
    reason: 'expired',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') {
      options.check = true;
    } else if (args[i] === '--release' && i + 1 < args.length) {
      options.release = args[++i];
    } else if (args[i] === '--reason' && i + 1 < args.length) {
      options.reason = args[++i];
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  if (options.check) {
    console.log('[budget-reconcile] Replaying SST and checking open holds checkpoint...');
    replayAndGetCheckpoint();
    const active = getActiveHolds();
    console.log(`[budget-reconcile] Total active open holds: ${active.size}`);
    for (const [holdId, hold] of active.entries()) {
      console.log(` - Hold: ${holdId} | Seat: ${hold.seatId} | Amount: ${hold.amountNanodollars} nanoUSD | Created: ${hold.ts}`);
    }
    return;
  }

  if (options.release) {
    if (!ALLOWED_REASONS.includes(options.reason)) {
      console.error(`[budget-reconcile] ERROR: Invalid reason "${options.reason}". Allowed values: ${ALLOWED_REASONS.join(', ')}`);
      process.exit(1);
    }

    console.log(`[budget-reconcile] Performing manual release for hold "${options.release}" with reason "${options.reason}"...`);
    const released = releaseHold({
      holdId: options.release,
      reason: options.reason,
      ts: new Date().toISOString(),
    });

    if (!released) {
      console.error(`[budget-reconcile] WARNING: Hold "${options.release}" not found in open holds or could not be released.`);
      process.exit(1);
    }

    // Replay to confirm checkpoint update
    replayAndGetCheckpoint();
    const activeAfter = getActiveHolds();
    if (!activeAfter.has(options.release)) {
      console.log(`[budget-reconcile] SUCCESS: Hold "${options.release}" has been safely released and removed from checkpoint.`);
    } else {
      console.error(`[budget-reconcile] WARNING: Hold "${options.release}" still appears in active holds.`);
      process.exit(1);
    }
    return;
  }

  console.log(`Usage:
  node --import ./tests/register.mjs operations/scripts/budget-reconcile.mjs --check
  node --import ./tests/register.mjs operations/scripts/budget-reconcile.mjs --release <holdId> [--reason <expired|orphaned|failed_no_receipt>]`);
}

main().catch((err) => {
  console.error('[budget-reconcile] Unexpected failure:', err);
  process.exit(1);
});
