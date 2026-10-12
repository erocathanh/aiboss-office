'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('main.cjs takes single instance lock before initialization and quits if another instance holds it', () => {
  let quitCalled = 0;
  let whenReadyCalled = 0;
  let browserWindowCreated = 0;

  const mockApp = {
    requestSingleInstanceLock: () => false,
    quit: () => {
      quitCalled++;
    },
    whenReady: () => {
      whenReadyCalled++;
      return Promise.resolve();
    },
    on: () => {},
  };

  const mockBrowserWindow = class {
    constructor() {
      browserWindowCreated++;
    }
  };

  const code = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');

  vm.runInNewContext(code, {
    require: (name) => {
      if (name === 'electron') {
        return {
          app: mockApp,
          BrowserWindow: mockBrowserWindow,
          Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
          ipcMain: { handle: () => {} },
        };
      }
      if (name === './config.cjs') {
        return { resolvePort: () => 4330 };
      }
      if (name === './server-manager.cjs') {
        return { ensureServerReady: async () => ({ ok: true }), stopSpawnedServer: () => {}, probeServer: async () => true };
      }
      if (name === './tray.cjs') {
        return { initTray: () => {}, updateTrayStatus: () => {}, getDesktopStatus: () => ({}), setStartAtLogin: () => {}, destroyTray: () => {} };
      }
      if (name === './power.cjs') {
        return { updatePowerSaveState: () => {} };
      }
      return require(name);
    },
    __dirname,
    process: {
      ...process,
      argv: ['node', 'main.cjs'],
      versions: { electron: '44.7.0', node: process.versions.node },
    },
    console,
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
  });

  assert.equal(quitCalled, 1, 'app.quit() must be called when lock fails');
  assert.equal(whenReadyCalled, 0, 'whenReady must not be registered when lock fails');
  assert.equal(browserWindowCreated, 0, 'No BrowserWindow should be constructed');
});
