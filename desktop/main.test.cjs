'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
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
        return { resolvePort: () => 4330, APP_BASIC_REALM: 'aiboss-office' };
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

const tempDirsToClean = [];
process.on('exit', () => {
  for (const d of tempDirsToClean) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

function computeTestInstanceProof(nonce, host, port, realm) {
  const h = String(host || '').trim().toLowerCase();
  const digest = crypto.createHmac('sha256', nonce).update(`${h}:${port}:${realm}`, 'utf8').digest('hex');
  return `v1.${digest}`;
}

function createLoginHarness(
  envOverride = { PHONGBAN_USER: 'test-user', PHONGBAN_PASS: 'test-pass' },
  clockRef = { now: 1_700_000_000_000 },
  options = {},
) {
  const code = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const appListeners = new Map();
  const logs = [];
  const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiboss-f40-test-'));
  tempDirsToClean.push(tempConfigDir);
  const defaultNonce = options.nonce || 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  if (!options.skipNonceFile) {
    fs.writeFileSync(
      path.join(tempConfigDir, 'instance-4330.json'),
      JSON.stringify({
        port: 4330,
        nonce: defaultNonce,
        startedAt: '2026-10-15T12:00:00.000Z',
      }),
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  let headersReceivedHook = null;
  const mockSession = {
    defaultSession: {
      webRequest: {
        onHeadersReceived: (fn) => {
          headersReceivedHook = fn;
        },
      },
    },
  };

  const mockApp = {
    requestSingleInstanceLock: () => true,
    getLocale: () => 'en-GB',
    getLoginItemSettings: () => ({ openAtLogin: false }),
    quit: () => {},
    whenReady: () => ({
      then: (cb) => {
        if (options.triggerWhenReady) {
          cb();
        }
        return Promise.resolve();
      },
    }),
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

  const mergedEnv = {
    AIBOSS_CONFIG_DIR: tempConfigDir,
    ...envOverride,
  };

  vm.runInNewContext(code, {
    require: (name) => {
      if (name === 'electron') {
        return {
          app: mockApp,
          BrowserWindow: class {
            loadURL() {}
            loadFile() {}
            on() {}
            isDestroyed() { return false; }
            setTitle() {}
          },
          Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
          ipcMain: { handle: () => {} },
          session: mockSession,
        };
      }
      if (name === './config.cjs') {
        return { resolvePort: () => options.port || 4330, APP_BASIC_REALM: 'aiboss-office' };
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
      env: mergedEnv,
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

  function fire(url, authInfo, detailsOverride) {
    const cbCalls = [];
    let prevented = false;
    const defaultHeaders =
      authInfo && typeof authInfo === 'object'
        ? {
            'X-AIBOSS-Instance': computeTestInstanceProof(
              defaultNonce,
              authInfo.host || '127.0.0.1',
              authInfo.port || 4330,
              authInfo.realm || 'aiboss-office',
            ),
          }
        : undefined;
    const details =
      detailsOverride !== undefined
        ? detailsOverride
        : { url, responseHeaders: defaultHeaders };
    loginHandler(
      { preventDefault: () => { prevented = true; } },
      {},
      details,
      authInfo,
      (...args) => cbCalls.push(args),
    );
    return { cbCalls, prevented };
  }

  return {
    fire,
    logs,
    clockRef,
    tempConfigDir,
    defaultNonce,
    getHeadersReceivedHook: () => headersReceivedHook,
  };
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

test('F41 (i): login handler ignores challenge when port is a string ("4330") instead of a number', () => {
  const { fire } = createLoginHarness();
  const res = fire('http://127.0.0.1:4330/api/approvals/1/decision', {
    host: '127.0.0.1',
    port: '4330',
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res.prevented, false);
  assert.equal(res.cbCalls.length, 0);
});

test('F41 (ii): loading main.cjs throws when config.cjs does not export APP_BASIC_REALM', () => {
  const code = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  assert.throws(
    () => {
      vm.runInNewContext(code, {
        require: (name) => {
          if (name === 'electron') {
            return {
              app: { requestSingleInstanceLock: () => false, quit: () => {}, on: () => {} },
              BrowserWindow: class {},
              Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
              ipcMain: { handle: () => {} },
            };
          }
          if (name === './config.cjs') {
            return { resolvePort: () => 4330 };
          }
          return require(name);
        },
        __dirname,
        process,
        console,
      });
    },
    /APP_BASIC_REALM/,
    'main.cjs must throw at load time if APP_BASIC_REALM is missing from config.cjs',
  );
});

function parseTsElectronDictionary(tsFilePath) {
  const src = fs.readFileSync(tsFilePath, 'utf8');
  const idx = src.indexOf('  electron: {');
  assert.notEqual(idx, -1, `electron block must exist in ${tsFilePath}`);
  const sub = src.slice(idx);
  const wtMatch = sub.match(/windowTitle:\s*'([^']*)'/);
  const menuMatch = sub.match(/menu:\s*\{([\s\S]*?)\n\s*\},/);
  const trayMatch = sub.match(/tray:\s*\{([\s\S]*?)\n\s*\},/);
  assert.ok(menuMatch, `electron.menu block must exist in ${tsFilePath}`);
  assert.ok(trayMatch, `electron.tray block must exist in ${tsFilePath}`);
  const parseBlock = (block) => {
    const out = {};
    const re = /(\w+):\s*'((?:\\'|[^'])*)'/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      out[m[1]] = m[2].replace(/\\'/g, "'");
    }
    return out;
  };
  return {
    windowTitle: wtMatch ? wtMatch[1] : null,
    menu: parseBlock(menuMatch[1]),
    tray: parseBlock(trayMatch[1]),
  };
}

test('UI-2d B: desktop/i18n.cjs matches electron.menu.* and electron.tray.* in src/i18n/vi.ts and src/i18n/en.ts character-for-character', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const langs = [
    { lang: 'en', relPath: 'src/i18n/en.ts' },
    { lang: 'vi', relPath: 'src/i18n/vi.ts' },
  ];

  const mismatches = [];
  for (const { lang, relPath } of langs) {
    const tsDict = parseTsElectronDictionary(path.join(repoRoot, relPath));
    const cjsDict = desktopI18n.getDesktopCopy(lang);
    if (tsDict.windowTitle !== cjsDict.windowTitle) {
      mismatches.push(
        `[${lang}] electron.windowTitle: ${relPath}="${tsDict.windowTitle}" !== desktop/i18n.cjs="${cjsDict.windowTitle}"`,
      );
    }
    for (const section of ['menu', 'tray']) {
      const tsSection = tsDict[section];
      const cjsSection = cjsDict[section];
      const allKeys = new Set([...Object.keys(tsSection), ...Object.keys(cjsSection)]);
      for (const k of allKeys) {
        if (tsSection[k] !== cjsSection[k]) {
          mismatches.push(
            `[${lang}] electron.${section}.${k}: ${relPath}=${JSON.stringify(tsSection[k])} !== desktop/i18n.cjs=${JSON.stringify(cjsSection[k])}`,
          );
        }
      }
    }
  }

  assert.equal(
    mismatches.length,
    0,
    `Two-source desktop i18n mismatch(es) detected:\n${mismatches.join('\n')}`,
  );
});

test('F40 (a): 401 with valid X-AIBOSS-Instance HMAC matching instance-4330.json supplies credentials once (both details.responseHeaders and webRequest.onHeadersReceived)', () => {
  const { fire, defaultNonce, getHeadersReceivedHook, logs } = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    { now: 1_700_000_000_000 },
    { triggerWhenReady: true },
  );
  const validProof = computeTestInstanceProof(defaultNonce, '127.0.0.1', 4330, 'aiboss-office');
  const hook = getHeadersReceivedHook();
  assert.equal(typeof hook, 'function', 'webRequest.onHeadersReceived must be registered');

  let responderCalled = false;
  hook(
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-1/decision',
      statusCode: 401,
      responseHeaders: {
        'WWW-Authenticate': ['Basic realm="aiboss-office"'],
        'X-AIBOSS-Instance': [validProof],
      },
    },
    (resp) => {
      responderCalled = resp && resp.cancel === false;
    },
  );
  assert.equal(responderCalled, true);

  // Fire login without details.responseHeaders so it resolves from the webRequest 5s cache
  const res = fire(
    'http://127.0.0.1:4330/api/approvals/req-1/decision',
    {
      host: '127.0.0.1',
      port: 4330,
      realm: 'aiboss-office',
      scheme: 'basic',
      isProxy: false,
    },
    { url: 'http://127.0.0.1:4330/api/approvals/req-1/decision' },
  );
  assert.equal(res.prevented, true);
  assert.deepEqual(res.cbCalls, [['owner-u', 'owner-p']]);
  assert.equal(logs.some((l) => l.includes(defaultNonce) || l.includes(validProof) || l.includes('owner-p')), false);
});

test('F40 (b): 401 when instance-4330.json is missing cancels via callback() without sending credentials', () => {
  const { fire, logs, defaultNonce } = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    { now: 1_700_000_000_000 },
    { skipNonceFile: true },
  );
  const res = fire('http://127.0.0.1:4330/api/approvals/req-2/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res.prevented, false);
  assert.deepEqual(res.cbCalls, [[]]);
  assert.ok(logs.some((l) => l.includes('missing or invalid instance-4330.json')));
  assert.equal(logs.some((l) => l.includes(defaultNonce) || l.includes('owner-p')), false);
});

test('F40 (c): 401 without X-AIBOSS-Instance header (rogue server on same port/realm) cancels via callback() without sending credentials', () => {
  const { fire, logs, defaultNonce } = createLoginHarness({
    PHONGBAN_USER: 'owner-u',
    PHONGBAN_PASS: 'owner-p',
  });
  const res = fire(
    'http://127.0.0.1:4330/api/approvals/req-3/decision',
    {
      host: '127.0.0.1',
      port: 4330,
      realm: 'aiboss-office',
      scheme: 'basic',
      isProxy: false,
    },
    { url: 'http://127.0.0.1:4330/api/approvals/req-3/decision', responseHeaders: {} },
  );
  assert.equal(res.prevented, false);
  assert.deepEqual(res.cbCalls, [[]]);
  assert.ok(logs.some((l) => l.includes('missing X-AIBOSS-Instance header')));
  assert.equal(logs.some((l) => l.includes(defaultNonce) || l.includes('owner-p')), false);
});

test('F40 (d): 401 with X-AIBOSS-Instance signed by a different nonce cancels via callback() without sending credentials', () => {
  const { fire, logs, defaultNonce } = createLoginHarness({
    PHONGBAN_USER: 'owner-u',
    PHONGBAN_PASS: 'owner-p',
  });
  const rogueNonce = "ffffffffffffffff".repeat(4);
  const wrongProof = computeTestInstanceProof(rogueNonce, '127.0.0.1', 4330, 'aiboss-office');
  const res = fire(
    'http://127.0.0.1:4330/api/approvals/req-4/decision',
    {
      host: '127.0.0.1',
      port: 4330,
      realm: 'aiboss-office',
      scheme: 'basic',
      isProxy: false,
    },
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-4/decision',
      responseHeaders: { 'X-AIBOSS-Instance': wrongProof },
    },
  );
  assert.equal(res.prevented, false);
  assert.deepEqual(res.cbCalls, [[]]);
  assert.ok(logs.some((l) => l.includes('X-AIBOSS-Instance HMAC mismatch')));
  assert.equal(
    logs.some((l) => l.includes(defaultNonce) || l.includes(rogueNonce) || l.includes(wrongProof) || l.includes('owner-p')),
    false,
  );
});

test('F40 (e): 401 with valid X-AIBOSS-Instance remains blocked during 60s F38 cooldown window after prior rejection', () => {
  const clock = { now: 1_700_000_000_000 };
  const { fire } = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    clock,
  );
  const res1 = fire('http://127.0.0.1:4330/api/approvals/req-5/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res1.prevented, true);
  assert.deepEqual(res1.cbCalls, [['owner-u', 'owner-p']]);

  // 2nd challenge (rejected credentials) triggers 60s cooldown even though X-AIBOSS-Instance is valid
  const res2 = fire('http://127.0.0.1:4330/api/approvals/req-5/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res2.prevented, false);
  assert.deepEqual(res2.cbCalls, [[]]);

  // 3rd challenge 20s later with valid X-AIBOSS-Instance is still blocked by 60s cooldown
  clock.now += 20_000;
  const res3 = fire('http://127.0.0.1:4330/api/approvals/req-5/decision', {
    host: '127.0.0.1',
    port: 4330,
    realm: 'aiboss-office',
    scheme: 'basic',
    isProxy: false,
  });
  assert.equal(res3.prevented, false);
  assert.deepEqual(res3.cbCalls, [[]]);
});

test('F42 (f): 401 with X-AIBOSS-Instance signed for a different port (4341 !== authInfo.port 4330) cancels via callback() without sending credentials', () => {
  const { fire, logs, defaultNonce } = createLoginHarness({
    PHONGBAN_USER: 'owner-u',
    PHONGBAN_PASS: 'owner-p',
  });
  const proofForOtherPort = computeTestInstanceProof(defaultNonce, '127.0.0.1', 4341, 'aiboss-office');
  const res = fire(
    'http://127.0.0.1:4330/api/approvals/req-f/decision',
    {
      host: '127.0.0.1',
      port: 4330,
      realm: 'aiboss-office',
      scheme: 'basic',
      isProxy: false,
    },
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-f/decision',
      responseHeaders: { 'X-AIBOSS-Instance': proofForOtherPort },
    },
  );
  assert.equal(res.prevented, false);
  assert.deepEqual(res.cbCalls, [[]]);
  assert.ok(logs.some((l) => l.includes('X-AIBOSS-Instance HMAC mismatch')));
  assert.equal(
    logs.some((l) => l.includes(defaultNonce) || l.includes(proofForOtherPort) || l.includes('owner-p')),
    false,
  );
});

test('F42 (g): proxy forward mock (proxy on 4330 relays 401 proof signed by real server on 4341) cancels via callback() without sending credentials', () => {
  // Case g1: real server on 4341 only wrote instance-4341.json (no instance-4330.json exists)
  const h1 = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    { now: 1_700_000_000_000 },
    { skipNonceFile: true, triggerWhenReady: true },
  );
  const serverNonce = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
  fs.writeFileSync(
    path.join(h1.tempConfigDir, 'instance-4341.json'),
    JSON.stringify({ port: 4341, nonce: serverNonce, startedAt: '2026-10-16T00:00:00.000Z' }),
    { encoding: 'utf8', mode: 0o600 },
  );
  const relayedProofFrom4341 = computeTestInstanceProof(serverNonce, '127.0.0.1', 4341, 'aiboss-office');
  const hook1 = h1.getHeadersReceivedHook();
  hook1(
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-g1/decision',
      statusCode: 401,
      responseHeaders: {
        'WWW-Authenticate': ['Basic realm="aiboss-office"'],
        'X-AIBOSS-Instance': [relayedProofFrom4341],
      },
    },
    () => {},
  );
  const resG1 = h1.fire(
    'http://127.0.0.1:4330/api/approvals/req-g1/decision',
    { host: '127.0.0.1', port: 4330, realm: 'aiboss-office', scheme: 'basic', isProxy: false },
    { url: 'http://127.0.0.1:4330/api/approvals/req-g1/decision' },
  );
  assert.equal(resG1.prevented, false);
  assert.deepEqual(resG1.cbCalls, [[]]);

  // Case g2: even if instance-4330.json exists, relayed proof from 4341 fails HMAC verification on port 4330
  const h2 = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    { now: 1_700_000_000_000 },
    { nonce: serverNonce, triggerWhenReady: true },
  );
  const hook2 = h2.getHeadersReceivedHook();
  hook2(
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-g2/decision',
      statusCode: 401,
      responseHeaders: {
        'WWW-Authenticate': ['Basic realm="aiboss-office"'],
        'X-AIBOSS-Instance': [relayedProofFrom4341],
      },
    },
    () => {},
  );
  const resG2 = h2.fire(
    'http://127.0.0.1:4330/api/approvals/req-g2/decision',
    { host: '127.0.0.1', port: 4330, realm: 'aiboss-office', scheme: 'basic', isProxy: false },
    { url: 'http://127.0.0.1:4330/api/approvals/req-g2/decision' },
  );
  assert.equal(resG2.prevented, false);
  assert.deepEqual(resG2.cbCalls, [[]]);
  assert.ok(h2.logs.some((l) => l.includes('X-AIBOSS-Instance HMAC mismatch')));
});

test('F42 (h): replaying old proof after instance-4330.json rotates on server restart cancels via callback() without sending credentials', () => {
  const clock = { now: 1_700_000_000_000 };
  const oldNonce = "aaaa1111aaaa1111".repeat(4);
  const newNonce = "bbbb2222bbbb2222".repeat(4);
  const { fire, tempConfigDir, logs } = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    clock,
    { nonce: oldNonce },
  );
  const oldProof = computeTestInstanceProof(oldNonce, '127.0.0.1', 4330, 'aiboss-office');

  // 1st fire: warms instanceNonceCache with oldNonce and supplies credentials once
  const resFirst = fire(
    'http://127.0.0.1:4330/api/approvals/req-h1/decision',
    { host: '127.0.0.1', port: 4330, realm: 'aiboss-office', scheme: 'basic', isProxy: false },
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-h1/decision',
      responseHeaders: { 'X-AIBOSS-Instance': oldProof },
    },
  );
  assert.equal(resFirst.prevented, true);
  assert.deepEqual(resFirst.cbCalls, [['owner-u', 'owner-p']]);

  // Within the 5s cache TTL (+1s), server restarts and atomically replaces instance-4330.json with newNonce
  clock.now += 1_000;
  const nonceFile = path.join(tempConfigDir, 'instance-4330.json');
  const tmpFile = path.join(tempConfigDir, '.instance-4330.rotated.tmp');
  fs.writeFileSync(
    tmpFile,
    JSON.stringify({
      host: '127.0.0.1',
      port: 4330,
      nonce: newNonce,
      startedAt: '2026-10-16T00:05:00.000Z',
    }),
    { encoding: 'utf8', mode: 0o600 },
  );
  fs.renameSync(tmpFile, nonceFile);

  // 2nd fire: replaying oldProof after file rotation must invalidate hot cache and fail-closed
  const resReplay = fire(
    'http://127.0.0.1:4330/api/approvals/req-h2/decision',
    { host: '127.0.0.1', port: 4330, realm: 'aiboss-office', scheme: 'basic', isProxy: false },
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-h2/decision',
      responseHeaders: { 'X-AIBOSS-Instance': oldProof },
    },
  );
  assert.equal(resReplay.prevented, false);
  assert.deepEqual(resReplay.cbCalls, [[]]);
  assert.ok(logs.some((l) => l.includes('X-AIBOSS-Instance HMAC mismatch')));
  assert.equal(
    logs.some((l) => l.includes(oldNonce) || l.includes(newNonce) || l.includes(oldProof) || l.includes('owner-p')),
    false,
  );
});

test('F46 (i): 401 with X-AIBOSS-Instance signed for ::1:4330 while authInfo.host is 127.0.0.1 cancels via callback() without sending credentials', () => {
  const { fire, defaultNonce, logs } = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    { now: 1_700_000_000_000 },
  );
  const ipv6Proof = computeTestInstanceProof(defaultNonce, '::1', 4330, 'aiboss-office');
  const res = fire(
    'http://127.0.0.1:4330/api/approvals/req-f46-i/decision',
    { host: '127.0.0.1', port: 4330, realm: 'aiboss-office', scheme: 'basic', isProxy: false },
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-f46-i/decision',
      responseHeaders: { 'X-AIBOSS-Instance': ipv6Proof },
    },
  );
  assert.equal(res.prevented, false);
  assert.deepEqual(res.cbCalls, [[]]);
  assert.ok(logs.some((l) => l.includes('X-AIBOSS-Instance HMAC mismatch')));
  assert.equal(logs.some((l) => l.includes(defaultNonce) || l.includes(ipv6Proof) || l.includes('owner-p')), false);
});

test('F46 (j): 401 when authInfo.host is localhost or ::1 cancels via callback() without sending credentials (no loopback merging)', () => {
  const { fire, defaultNonce, logs } = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    { now: 1_700_000_000_000 },
  );
  const ipv4Proof = computeTestInstanceProof(defaultNonce, '127.0.0.1', 4330, 'aiboss-office');
  for (const nonIpv4Host of ['localhost', '::1', '[::1]']) {
    const proofForHost = computeTestInstanceProof(defaultNonce, nonIpv4Host, 4330, 'aiboss-office');
    for (const candidateProof of [ipv4Proof, proofForHost]) {
      const res = fire(
        `http://${nonIpv4Host === '::1' ? '[::1]' : nonIpv4Host}:4330/api/approvals/req-f46-j/decision`,
        { host: nonIpv4Host, port: 4330, realm: 'aiboss-office', scheme: 'basic', isProxy: false },
        {
          url: `http://${nonIpv4Host === '::1' ? '[::1]' : nonIpv4Host}:4330/api/approvals/req-f46-j/decision`,
          responseHeaders: { 'X-AIBOSS-Instance': candidateProof },
        },
      );
      assert.equal(res.prevented, false, `must not preventDefault for host=${nonIpv4Host}`);
      assert.deepEqual(res.cbCalls, [[]], `must cancel via callback() for host=${nonIpv4Host}`);
    }
  }
  assert.ok(logs.some((l) => l.includes('non-IPv4 loopback host rejected')));
});

test('F46 (k): same-port IPv4<->IPv6 proxy relay mock (proxy on 127.0.0.1:4330 relays proof signed by real server on [::1]:4330) cancels via callback() without sending credentials', () => {
  const realServerIpv6Nonce = "cccc3333cccc3333".repeat(4);
  const { fire, getHeadersReceivedHook, logs } = createLoginHarness(
    { PHONGBAN_USER: 'owner-u', PHONGBAN_PASS: 'owner-p' },
    { now: 1_700_000_000_000 },
    { nonce: realServerIpv6Nonce, triggerWhenReady: true },
  );
  // Real server bound to [::1]:4330 writes instance-4330.json and signs proof for ::1:4330:aiboss-office
  const proofFromIpv6RealServer = computeTestInstanceProof(
    realServerIpv6Nonce,
    '::1',
    4330,
    'aiboss-office',
  );
  const hook = getHeadersReceivedHook();
  assert.equal(typeof hook, 'function');

  // Proxy on 127.0.0.1:4330 forwards the 401 and X-AIBOSS-Instance header back to Electron on 127.0.0.1:4330
  hook(
    {
      url: 'http://127.0.0.1:4330/api/approvals/req-f46-k/decision',
      statusCode: 401,
      responseHeaders: {
        'WWW-Authenticate': ['Basic realm="aiboss-office"'],
        'X-AIBOSS-Instance': [proofFromIpv6RealServer],
      },
    },
    () => {},
  );
  const resProxyRelay = fire(
    'http://127.0.0.1:4330/api/approvals/req-f46-k/decision',
    { host: '127.0.0.1', port: 4330, realm: 'aiboss-office', scheme: 'basic', isProxy: false },
    { url: 'http://127.0.0.1:4330/api/approvals/req-f46-k/decision' },
  );
  assert.equal(resProxyRelay.prevented, false);
  assert.deepEqual(resProxyRelay.cbCalls, [[]]);
  assert.ok(logs.some((l) => l.includes('X-AIBOSS-Instance HMAC mismatch')));
  assert.equal(
    logs.some(
      (l) =>
        l.includes(realServerIpv6Nonce) ||
        l.includes(proofFromIpv6RealServer) ||
        l.includes('owner-p'),
    ),
    false,
  );
});

test('F50 (l): verified listener requirement — 0 handles, handle not listening, inspection error, and 2 listeners on same port return null with 0 files; 1 verified listener emits proof', async () => {
  const net = require('node:net');
  const { pathToFileURL } = require('node:url');
  const f50CfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f50-desktop-test-'));
  const prevCfgDir = process.env.AIBOSS_CONFIG_DIR;
  const prevTestSeam = process.env.AIBOSS_NONCE_TEST_LISTENER;
  process.env.AIBOSS_CONFIG_DIR = f50CfgDir;
  delete process.env.AIBOSS_NONCE_TEST_LISTENER;

  const listenOn = (port, host) =>
    new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.on('error', reject);
      srv.listen(port, host, () => resolve(srv));
    });
  const closeSrv = (srv) => new Promise((resolve) => srv.close(() => resolve()));

  try {
    const nonceModPath = path.join(__dirname, '..', 'src', 'lib', 'instance-nonce.ts');
    const nonceMod = await import(pathToFileURL(nonceModPath).href);

    // F50e: importing module writes 0 files
    assert.deepEqual(fs.readdirSync(f50CfgDir), [], 'F50e: importing instance-nonce.ts must write 0 files');

    // F50a/b: 0 handles -> null record, null proof, 0 files
    const recNoHandle = nonceMod.initInstanceNonce({ port: 4346, host: '127.0.0.1', configDir: f50CfgDir });
    const sigNoHandle = nonceMod.buildInstanceProofHeader('aiboss-office');
    assert.equal(recNoHandle, null, 'F50a: 0 handles must return null record');
    assert.equal(sigNoHandle, null, 'F50b: 0 handles must return null proof');
    assert.deepEqual(fs.readdirSync(f50CfgDir), [], 'F50a/b: 0 handles must write 0 files');

    // Handle not listening (listening: false) and inspection error
    const origGetHandles = process._getActiveHandles;
    try {
      process._getActiveHandles = () => [
        { listening: false, address: () => ({ address: '127.0.0.1', port: 4346 }) },
      ];
      assert.equal(
        nonceMod.initInstanceNonce({ port: 4346, host: '127.0.0.1', configDir: f50CfgDir }),
        null,
        'F50: handle with listening=false must return null',
      );
      assert.equal(nonceMod.buildInstanceProofHeader('aiboss-office'), null);

      process._getActiveHandles = () => {
        throw new Error('simulated_handle_inspection_error');
      };
      assert.equal(
        nonceMod.initInstanceNonce({ port: 4346, host: '127.0.0.1', configDir: f50CfgDir }),
        null,
        'F50: inspection error must return null',
      );
      assert.equal(nonceMod.buildInstanceProofHeader('aiboss-office'), null);
      assert.deepEqual(fs.readdirSync(f50CfgDir), [], 'F50: unverified handle/error must write 0 files');
    } finally {
      process._getActiveHandles = origGetHandles;
    }

    // F50c: 1 real listener on 127.0.0.1:4349 with conflicting hint ::1 -> socket wins, signs 127.0.0.1
    const s1 = await listenOn(4349, '127.0.0.1');
    try {
      const recValid = nonceMod.initInstanceNonce({ port: 4349, host: '::1', configDir: f50CfgDir });
      assert.ok(recValid, 'F50c: 1 verified listener must return record');
      assert.equal(recValid.host, '127.0.0.1', 'F50c: real socket address 127.0.0.1 must override hint ::1');
      const sigValid = nonceMod.buildInstanceProofHeader('aiboss-office');
      const expectedSig4349 = computeTestInstanceProof(recValid.nonce, '127.0.0.1', 4349, 'aiboss-office');
      assert.equal(sigValid, expectedSig4349, 'F50c: proof must be signed for 127.0.0.1:4349');

      // Verify Electron accepts this verified 127.0.0.1:4349 proof from the real instance-4349.json file
      const harness4349 = createLoginHarness(
        {
          PHONGBAN_USER: 'owner-u',
          PHONGBAN_PASS: 'owner-p',
          AIBOSS_OFFICE_PORT: '4349',
          AIBOSS_CONFIG_DIR: f50CfgDir,
        },
        { now: 1_700_000_000_000 },
        { port: 4349, skipNonceFile: true },
      );
      const resValid = harness4349.fire(
        'http://127.0.0.1:4349/api/approvals/req-f50-c/decision',
        { host: '127.0.0.1', port: 4349, realm: 'aiboss-office', scheme: 'basic', isProxy: false },
        {
          url: 'http://127.0.0.1:4349/api/approvals/req-f50-c/decision',
          responseHeaders: { 'X-AIBOSS-Instance': sigValid },
        },
      );
      assert.equal(resValid.prevented, true);
      assert.deepEqual(resValid.cbCalls, [['owner-u', 'owner-p']]);
    } finally {
      await closeSrv(s1);
    }

    // After s1 closes, buildInstanceProofHeader must immediately return null (F50 §1.3)
    assert.equal(
      nonceMod.buildInstanceProofHeader('aiboss-office'),
      null,
      'F50: closing the listener socket must immediately disable buildInstanceProofHeader',
    );

    // F50d: 2 listeners on the same port 4344 (127.0.0.1 + ::1) -> ambiguous -> null
    const s2 = await listenOn(4344, '127.0.0.1');
    const s3 = await listenOn(4344, '::1');
    try {
      const recAmb = nonceMod.initInstanceNonce({ port: 4344, host: '::1', configDir: f50CfgDir });
      const sigAmb = nonceMod.buildInstanceProofHeader('aiboss-office');
      assert.equal(recAmb, null, 'F50d: 2 listeners on same port must return null record');
      assert.equal(sigAmb, null, 'F50d: 2 listeners on same port must return null proof');
      assert.equal(
        fs.existsSync(path.join(f50CfgDir, 'instance-4344.json')),
        false,
        'F50d: ambiguous listeners must NOT create instance-4344.json',
      );
    } finally {
      await closeSrv(s2);
      await closeSrv(s3);
    }

    // F50f: 1 real listener on ::1:4348 -> signs ::1:4348:aiboss-office
    const s4 = await listenOn(4348, '::1');
    try {
      const recIpv6 = nonceMod.initInstanceNonce({ port: 4348, configDir: f50CfgDir });
      assert.ok(recIpv6, 'F50f: single ::1 listener must initialize record');
      assert.equal(recIpv6.host, '::1');
      const sigIpv6 = nonceMod.buildInstanceProofHeader('aiboss-office');
      const expectedSig4348 = computeTestInstanceProof(recIpv6.nonce, '::1', 4348, 'aiboss-office');
      assert.equal(sigIpv6, expectedSig4348, 'F50f: single ::1 listener must sign ::1:4348:aiboss-office');
    } finally {
      await closeSrv(s4);
    }
  } finally {
    if (prevCfgDir === undefined) delete process.env.AIBOSS_CONFIG_DIR;
    else process.env.AIBOSS_CONFIG_DIR = prevCfgDir;
    if (prevTestSeam === undefined) delete process.env.AIBOSS_NONCE_TEST_LISTENER;
    else process.env.AIBOSS_NONCE_TEST_LISTENER = prevTestSeam;
    fs.rmSync(f50CfgDir, { recursive: true, force: true });
  }
});

