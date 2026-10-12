'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { updatePowerSaveState, resetPowerState, getActiveBlockerId } = require('./power.cjs');

test('powerSaveBlocker activates when active seats > 0 and stops when idle', () => {
  resetPowerState();

  let nextId = 101;
  const started = [];
  const stopped = [];

  const mockPsb = {
    start: (type) => {
      started.push(type);
      return nextId++;
    },
    stop: (id) => {
      stopped.push(id);
    },
  };

  // Idle seats initially -> no blocker started
  const s0 = updatePowerSaveState(0, mockPsb);
  assert.equal(s0.active, false);
  assert.equal(s0.blockerId, null);
  assert.equal(started.length, 0);

  // 2 seats become active -> blocker started
  const s1 = updatePowerSaveState(2, mockPsb);
  assert.equal(s1.active, true);
  assert.equal(s1.blockerId, 101);
  assert.deepEqual(started, ['prevent-app-suspension']);
  assert.equal(stopped.length, 0);

  // More seats become active -> does NOT double-start
  const s2 = updatePowerSaveState(5, mockPsb);
  assert.equal(s2.active, true);
  assert.equal(s2.blockerId, 101);
  assert.equal(started.length, 1);

  // All seats become idle -> blocker stopped
  const s3 = updatePowerSaveState(0, mockPsb);
  assert.equal(s3.active, false);
  assert.equal(s3.blockerId, null);
  assert.deepEqual(stopped, [101]);

  // Remains idle -> does NOT double-stop
  const s4 = updatePowerSaveState(0, mockPsb);
  assert.equal(s4.active, false);
  assert.equal(stopped.length, 1);
});
