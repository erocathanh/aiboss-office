'use strict';

let powerSaveBlocker = null;
try {
  powerSaveBlocker = require('electron').powerSaveBlocker;
} catch (e) {
  // Mockable in tests
}

let activeBlockerId = null;

/**
 * Updates power save blocker state based on active seat count.
 * @param {number} activeSeatCount
 * @param {Object} [psb] custom powerSaveBlocker for testing
 * @returns {{ active: boolean, blockerId: number|null }}
 */
function updatePowerSaveState(activeSeatCount, psb = powerSaveBlocker) {
  if (!psb) {
    return { active: false, blockerId: null };
  }

  if (activeSeatCount > 0 && activeBlockerId === null) {
    activeBlockerId = psb.start('prevent-app-suspension');
    console.log(
      `[PowerSave] Started assertion: prevent-app-suspension (blockerId: ${activeBlockerId}) - ${activeSeatCount} seat(s) running`
    );
  } else if (activeSeatCount === 0 && activeBlockerId !== null) {
    psb.stop(activeBlockerId);
    console.log('[PowerSave] Stopped assertion: prevent-app-suspension - all seats idle');
    activeBlockerId = null;
  }

  return {
    active: activeBlockerId !== null,
    blockerId: activeBlockerId,
  };
}

function getActiveBlockerId() {
  return activeBlockerId;
}

function resetPowerState() {
  activeBlockerId = null;
}

module.exports = {
  updatePowerSaveState,
  getActiveBlockerId,
  resetPowerState,
};
