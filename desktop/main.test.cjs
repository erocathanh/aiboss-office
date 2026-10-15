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

test('main.cjs handles Electron login event for loopback Basic Auth from process.env with single-retry guard', () => {
  const appListeners = new Map();
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

  const code = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
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
      if (name === './config.cjs') return { resolvePort: () => 4330 };
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
    process: {
      ...process,
      argv: ['node', 'main.cjs'],
      env: { PHONGBAN_USER: 'test-user', PHONGBAN_PASS: 'test-pass' },
      versions: { electron: '44.7.0', node: process.versions.node },
    },
    console,
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
  });

  const loginHandler = appListeners.get('login');
  assert.equal(typeof loginHandler, 'function', 'app.on("login") must be registered');

  // 1. Non-loopback host is ignored
  let cbCalls = [];
  let prevented = false;
  loginHandler(
    { preventDefault: () => { prevented = true; } },
    {},
    { url: 'https://example.com/api/approvals/123/decision' },
    { host: 'example.com' },
    (...args) => cbCalls.push(args),
  );
  assert.equal(prevented, false);
  assert.equal(cbCalls.length, 0);

  // 2. Loopback 127.0.0.1 first attempt supplies credentials
  cbCalls = [];
  prevented = false;
  loginHandler(
    { preventDefault: () => { prevented = true; } },
    {},
    { url: 'http://127.0.0.1:4330/api/approvals/123/decision' },
    { host: '127.0.0.1' },
    (...args) => cbCalls.push(args),
  );
  assert.equal(prevented, true);
  assert.deepEqual(cbCalls, [['test-user', 'test-pass']]);

  // 3. Second consecutive attempt for same URL triggers retry guard (cancels instead of infinite loop)
  cbCalls = [];
  prevented = false;
  loginHandler(
    { preventDefault: () => { prevented = true; } },
    {},
    { url: 'http://127.0.0.1:4330/api/approvals/123/decision' },
    { host: '127.0.0.1' },
    (...args) => cbCalls.push(args),
  );
  assert.equal(prevented, false);
  assert.deepEqual(cbCalls, [[]]);
});
