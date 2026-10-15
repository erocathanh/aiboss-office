'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const desktopI18n = require('./i18n.cjs');

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
        return {
          initTray: () => {},
          updateTrayStatus: () => {},
          getDesktopStatus: () => ({}),
          setStartAtLogin: () => {},
          destroyTray: () => {},
          loadSavedLanguage: () => null,
          setTrayLanguage: () => {},
        };
      }
      if (name === './power.cjs') {
        return { updatePowerSaveState: () => {} };
      }
      if (name === './i18n.cjs') {
        return desktopI18n;
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

test('desktop/i18n.cjs resolves default language from system locale and builds full EN/VI menu templates', () => {
  assert.equal(desktopI18n.resolveDesktopSystemLanguage('vi-VN'), 'vi');
  assert.equal(desktopI18n.resolveDesktopSystemLanguage('vi'), 'vi');
  assert.equal(desktopI18n.resolveDesktopSystemLanguage('en-GB'), 'en');
  assert.equal(desktopI18n.resolveDesktopSystemLanguage('fr-FR'), 'en');
  assert.equal(desktopI18n.resolveDesktopSystemLanguage(''), 'en');

  const enMenu = desktopI18n.buildAppMenuTemplate({ lang: 'en', isDev: true });
  const viMenu = desktopI18n.buildAppMenuTemplate({ lang: 'vi', isDev: true });

  assert.deepEqual(
    enMenu.map((m) => m.label),
    ['AIBOSS Office', 'File', 'Edit', 'View', 'Window', 'Help'],
  );
  assert.deepEqual(
    viMenu.map((m) => m.label),
    ['AIBOSS Office', 'Tệp', 'Chỉnh sửa', 'Xem', 'Cửa sổ', 'Trợ giúp'],
  );

  assert.equal(desktopI18n.getWindowTitle('en'), 'AIBOSS Office — Autonomous Workspace');
  assert.equal(desktopI18n.getWindowTitle('vi'), 'AIBOSS Office — Văn phòng AI tự hành');
});

test('main.cjs initializes menu from app.getLocale() and rebuilds app menu, tray, and window title on IPC language change without restart', async () => {
  const builtMenus = [];
  const appliedMenus = [];
  const trayLangCalls = [];
  const ipcHandlers = new Map();
  let windowTitle = '';
  let quitCalls = 0;

  const mockApp = {
    requestSingleInstanceLock: () => true,
    getLocale: () => 'en-GB',
    getLoginItemSettings: () => ({ openAtLogin: false }),
    quit: () => {
      quitCalls++;
    },
    whenReady: () => Promise.resolve(),
    on: () => {},
  };

  const mockBrowserWindow = class {
    constructor(opts) {
      windowTitle = opts.title;
      this.webContents = {
        once: () => {},
        executeJavaScript: async () => {},
      };
    }
    on() {}
    isDestroyed() {
      return false;
    }
    setTitle(nextTitle) {
      windowTitle = nextTitle;
    }
    loadURL() {}
    loadFile() {}
  };

  const code = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');

  vm.runInNewContext(code, {
    require: (name) => {
      if (name === 'electron') {
        return {
          app: mockApp,
          BrowserWindow: mockBrowserWindow,
          Menu: {
            buildFromTemplate: (tpl) => {
              builtMenus.push(tpl);
              return { template: tpl };
            },
            setApplicationMenu: (menu) => {
              appliedMenus.push(menu);
            },
          },
          ipcMain: {
            handle: (channel, fn) => {
              ipcHandlers.set(channel, fn);
            },
          },
        };
      }
      if (name === './config.cjs') {
        return { resolvePort: () => 4330 };
      }
      if (name === './server-manager.cjs') {
        return {
          ensureServerReady: async () => ({ ok: true }),
          stopSpawnedServer: () => {},
          probeServer: async () => true,
        };
      }
      if (name === './tray.cjs') {
        return {
          initTray: () => {},
          updateTrayStatus: () => {},
          getDesktopStatus: () => ({}),
          setStartAtLogin: () => {},
          destroyTray: () => {},
          loadSavedLanguage: () => null,
          setTrayLanguage: (lang, opts) => {
            trayLangCalls.push({ lang, opts });
          },
        };
      }
      if (name === './power.cjs') {
        return { updatePowerSaveState: () => {} };
      }
      if (name === './i18n.cjs') {
        return desktopI18n;
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

  // Wait for whenReady().then(...) microtasks to complete
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(builtMenus.length, 1, 'Initial application menu should be built once on startup');
  assert.deepEqual(
    builtMenus[0].map((m) => m.label),
    ['AIBOSS Office', 'File', 'Edit', 'View', 'Window', 'Help'],
  );
  assert.equal(windowTitle, 'AIBOSS Office — Autonomous Workspace');

  const setLangHandler = ipcHandlers.get('desktop:set-language');
  assert.equal(typeof setLangHandler, 'function', 'desktop:set-language IPC handler must be registered');

  // Switch to Vietnamese via IPC
  const viRes = await setLangHandler({}, 'vi');
  assert.equal(viRes.language, 'vi');
  assert.equal(builtMenus.length, 2, 'Menu should be rebuilt when language changes to vi');
  assert.equal(appliedMenus.length, 2, 'Menu.setApplicationMenu should be called again');
  assert.deepEqual(
    builtMenus[1].map((m) => m.label),
    ['AIBOSS Office', 'Tệp', 'Chỉnh sửa', 'Xem', 'Cửa sổ', 'Trợ giúp'],
  );
  assert.equal(windowTitle, 'AIBOSS Office — Văn phòng AI tự hành');
  assert.equal(trayLangCalls.at(-1).lang, 'vi');
  assert.equal(quitCalls, 0, 'App must not quit or restart on language change');

  // Switch back to English via IPC
  const enRes = await setLangHandler({}, 'en');
  assert.equal(enRes.language, 'en');
  assert.equal(builtMenus.length, 3, 'Menu should be rebuilt when language changes back to en');
  assert.deepEqual(
    builtMenus[2].map((m) => m.label),
    ['AIBOSS Office', 'File', 'Edit', 'View', 'Window', 'Help'],
  );
  assert.equal(windowTitle, 'AIBOSS Office — Autonomous Workspace');
  assert.equal(trayLangCalls.at(-1).lang, 'en');
  assert.equal(quitCalls, 0, 'App must not quit or restart on language change');
});

function createLoginHarness(
  envOverride = { PHONGBAN_USER: 'test-user', PHONGBAN_PASS: 'test-pass' },
  clockRef = { now: 1_700_000_000_000 },
) {
  const code = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const appListeners = new Map();
  const logs = [];
  const mockApp = {
    requestSingleInstanceLock: () => true,
    getLocale: () => 'en-GB',
    getLoginItemSettings: () => ({ openAtLogin: false }),
    quit: () => {},
    whenReady: () => new Promise(() => {}),
    on: (evt, fn) => {
      appListeners.set(evt, fn);
    },
  };

  const FakeDate = class extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clockRef.now]));
    }
    static now() {
      return clockRef.now;
    }
  };

  vm.runInNewContext(code, {
    require: (name) => {
      if (name === 'electron') {
        return {
          app: mockApp,
          BrowserWindow: class {},
          Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
          ipcMain: { handle: () => {} },
        };
      }
      if (name === './config.cjs') {
        return { resolvePort: () => 4330, APP_BASIC_REALM: 'aiboss-office' };
      }
      if (name === './server-manager.cjs') {
        return { ensureServerReady: async () => ({ ok: true }), stopSpawnedServer: () => {}, probeServer: async () => true };
      }
      if (name === './tray.cjs') {
        return {
          initTray: () => {},
          updateTrayStatus: () => {},
          getDesktopStatus: () => ({}),
          setStartAtLogin: () => {},
          destroyTray: () => {},
          loadSavedLanguage: () => null,
          setTrayLanguage: () => {},
        };
      }
      if (name === './power.cjs') return { updatePowerSaveState: () => {} };
      if (name === './i18n.cjs') return desktopI18n;
      return require(name);
    },
    __dirname,
    Date: FakeDate,
    process: {
      ...process,
      argv: ['node', 'main.cjs'],
      env: envOverride,
      versions: { electron: '44.7.0', node: process.versions.node },
    },
    console: {
      ...console,
      log: (...args) => logs.push(args.join(' ')),
    },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
  });

  const loginHandler = appListeners.get('login');
  assert.equal(typeof loginHandler, 'function', 'app.on("login") must be registered');

  function fire(url, authInfo) {
    const cbCalls = [];
    let prevented = false;
    loginHandler(
      { preventDefault: () => { prevented = true; } },
      {},
      { url },
      authInfo,
      (...args) => cbCalls.push(args),
    );
    return { cbCalls, prevented };
  }

  return { fire, logs, clockRef };
}

test('F39 (i): login handler ignores challenge when PHONGBAN_* env vars are absent', () => {
  const { fire } = createLoginHarness({});
  const res = fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res.prevented, false);
  assert.equal(res.cbCalls.length, 0);
});

test('F39 (ii): login handler ignores loopback challenge when port !== targetPort', () => {
  const { fire } = createLoginHarness();
  const res = fire('http://127.0.0.1:4319/api/o', {
    host: '127.0.0.1',
    port: 4319,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res.prevented, false);
  assert.equal(res.cbCalls.length, 0);
});

test('F39 (iii): login handler ignores challenge when realm !== aiboss-office', () => {
  const { fire } = createLoginHarness();
  const res = fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'phong-ban-ai',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res.prevented, false);
  assert.equal(res.cbCalls.length, 0);
});

test('F39 (iv): login handler ignores challenge when isProxy === true', () => {
  const { fire } = createLoginHarness();
  const res = fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: true,
  });
  assert.equal(res.prevented, false);
  assert.equal(res.cbCalls.length, 0);
});

test('F39 (v): login handler ignores challenge when scheme is digest', () => {
  const { fire } = createLoginHarness();
  const res = fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'digest',
    isProxy: false,
  });
  assert.equal(res.prevented, false);
  assert.equal(res.cbCalls.length, 0);
});

test('F39 (vi): login handler ignores challenge when host is non-loopback or authInfo fields are missing', () => {
  const { fire } = createLoginHarness();
  const resExternal = fire('https://example.com/api/approvals/1/decision', {
    host: 'example.com',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(resExternal.prevented, false);
  assert.equal(resExternal.cbCalls.length, 0);

  const resIncomplete = fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
  });
  assert.equal(resIncomplete.prevented, false);
  assert.equal(resIncomplete.cbCalls.length, 0);
});

test('F39 (vii): positive control — exact target 1st attempt supplies PHONGBAN_USER and PHONGBAN_PASS', () => {
  const { fire } = createLoginHarness();
  const res = fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res.prevented, true);
  assert.deepEqual(res.cbCalls, [['test-user', 'test-pass']]);
});

test('F39 (viii): 2nd attempt on same host:port:realm key cancels via callback() and logs without secrets', () => {
  const { fire, logs } = createLoginHarness();
  fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  const res2 = fire('http://127.0.0.1:4330/api/approvals/2/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res2.prevented, false);
  assert.deepEqual(res2.cbCalls, [[]]);
  const blockLog = logs.find((l) => l.includes('app Basic Auth rejected'));
  assert.ok(blockLog);
  assert.equal(blockLog.includes('test-pass'), false);
});

test('F39 (ix): 3rd attempt within 60s cooldown window remains blocked and cancels via callback()', () => {
  const clock = { now: 1_700_000_000_000 };
  const { fire } = createLoginHarness({ PHONGBAN_USER: 'test-user', PHONGBAN_PASS: 'test-pass' }, clock);
  fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  clock.now += 15_000;
  const res3 = fire('http://127.0.0.1:4330/api/approvals/3/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res3.prevented, false);
  assert.deepEqual(res3.cbCalls, [[]]);
});

test('F39 (x): after 60s cooldown window elapses, login handler unblocks and supplies credentials again', () => {
  const clock = { now: 1_700_000_000_000 };
  const { fire } = createLoginHarness({ PHONGBAN_USER: 'test-user', PHONGBAN_PASS: 'test-pass' }, clock);
  fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  clock.now += 60_000;
  const resAfter = fire('http://127.0.0.1:4330/api/approvals/4/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(resAfter.prevented, true);
  assert.deepEqual(resAfter.cbCalls, [['test-user', 'test-pass']]);
});
