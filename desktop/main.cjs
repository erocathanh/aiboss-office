'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const { URL } = require('node:url');
const http = require('node:http');
const { app, BrowserWindow, Menu, ipcMain, session } = require('electron');

// APP_BASIC_REALM must match the realm in src/app/api/approvals/[requestId]/decision/route.ts
const { resolvePort, APP_BASIC_REALM } = require('./config.cjs');
if (typeof APP_BASIC_REALM !== 'string' || !APP_BASIC_REALM.trim()) {
  throw new Error('desktop/main.cjs requires APP_BASIC_REALM to be exported by desktop/config.cjs');
}
const { ensureServerReady, stopSpawnedServer, probeServer } = require('./server-manager.cjs');
const {
  initTray,
  updateTrayStatus,
  getDesktopStatus,
  setStartAtLogin,
  destroyTray,
  loadSavedLanguage,
  setTrayLanguage,
} = require('./tray.cjs');
const { updatePowerSaveState } = require('./power.cjs');
const {
  FALLBACK_UI_LANGUAGE,
  resolveDesktopSystemLanguage,
  normalizeDesktopLanguage,
  getWindowTitle,
  buildAppMenuTemplate,
} = require('./i18n.cjs');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[AIBOSS Desktop] Another instance is already running. Exiting.');
  app.quit();
} else {
  let mainWindow = null;
  let statusInterval = null;
  let currentLanguage = FALLBACK_UI_LANGUAGE;
  const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
  const repoRoot = path.resolve(__dirname, '..');
  const targetPort = resolvePort({ argv: process.argv, env: process.env, repoRoot });

  // 10 startup log lines
  console.log('1. [AIBOSS Desktop] Initializing AIBOSS Office desktop shell v0.1.0');
  console.log(`2. [AIBOSS Desktop] Platform: ${process.platform} (${process.arch}), Electron: ${process.versions.electron}, Node: ${process.versions.node}`);
  console.log(`3. [AIBOSS Desktop] Target server port: ${targetPort} (source: config/office.json)`);
  console.log('4. [AIBOSS Desktop] Single instance lock: acquired successfully');
  console.log(`5. [AIBOSS Desktop] Repository root: ${repoRoot}`);
  console.log('6. [AIBOSS Desktop] Web security: contextIsolation=true, nodeIntegration=false, sandbox=true');
  console.log('7. [AIBOSS Desktop] Window geometry: 1280x800 (min 900x600)');
  console.log(`8. [AIBOSS Desktop] Server URL: http://127.0.0.1:${targetPort}/`);
  console.log('9. [AIBOSS Desktop] Background monitor: polling every 10s (tray + power assertion)');
  console.log('10. [AIBOSS Desktop] Desktop shell ready');

  function focusAndShowWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  }

  function openSettingsView() {
    focusAndShowWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`http://127.0.0.1:${targetPort}/settings`);
    }
  }

  // Handle HTTP Basic Auth challenges fail-closed for the exact local AIBOSS Office server only (F37, F38, F40).
  // Policy for F38 retry lifecycle: keyed by `${host}:${port}:${realm}`; after 1 rejected attempt, keep blocking
  // (cancel via callback()) until a 60-second cooldown window elapses.
  // Policy for F40 instance proof: 401 response must carry X-AIBOSS-Instance = v1.<HMAC-SHA256(nonce, host:port:realm)>
  // matching ${AIBOSS_CONFIG_DIR:-~/.config/aiboss-office}/instance-${targetPort}.json.
  const LOGIN_RETRY_COOLDOWN_MS = 60 * 1000;
  const INSTANCE_NONCE_CACHE_TTL_MS = 5 * 1000;
  const INSTANCE_HEADER_TTL_MS = 5 * 1000;
  const loginAttemptState = new Map();
  const recentInstanceProofHeaders = new Map();
  let instanceNonceCache = {
    filePath: '',
    mtimeMs: -1,
    expiresAt: 0,
    nonce: null,
  };

  function resolveConfigDir() {
    const envDir = process.env.AIBOSS_CONFIG_DIR;
    if (typeof envDir === 'string' && envDir.trim().length > 0) {
      return path.resolve(envDir.trim());
    }
    return path.join(os.homedir(), '.config', 'aiboss-office');
  }

  function readInstanceNonce(port, nowMs) {
    const filePath = path.join(resolveConfigDir(), `instance-${port}.json`);
    try {
      const stat = fs.statSync(filePath);
      if (
        instanceNonceCache.filePath === filePath &&
        instanceNonceCache.mtimeMs === stat.mtimeMs &&
        nowMs < instanceNonceCache.expiresAt &&
        typeof instanceNonceCache.nonce === 'string'
      ) {
        return instanceNonceCache.nonce;
      }
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (
        raw &&
        typeof raw === 'object' &&
        raw.port === port &&
        typeof raw.nonce === 'string' &&
        /^[0-9a-f]{64}$/i.test(raw.nonce)
      ) {
        instanceNonceCache = {
          filePath,
          mtimeMs: stat.mtimeMs,
          expiresAt: nowMs + INSTANCE_NONCE_CACHE_TTL_MS,
          nonce: raw.nonce,
        };
        return raw.nonce;
      }
    } catch {
      // Missing or unreadable instance-<port>.json
    }
    instanceNonceCache = { filePath: '', mtimeMs: -1, expiresAt: 0, nonce: null };
    return null;
  }

  function extractHeaderCaseInsensitive(headersObj, targetName) {
    if (!headersObj || typeof headersObj !== 'object') {
      return null;
    }
    const lowerTarget = targetName.toLowerCase();
    for (const [k, v] of Object.entries(headersObj)) {
      if (k.toLowerCase() === lowerTarget) {
        if (Array.isArray(v)) {
          return typeof v[0] === 'string' ? v[0].trim() : null;
        }
        if (typeof v === 'string') {
          return v.trim();
        }
      }
    }
    return null;
  }

  function registerInstanceHeaderListener() {
    if (
      !session ||
      !session.defaultSession ||
      !session.defaultSession.webRequest ||
      typeof session.defaultSession.webRequest.onHeadersReceived !== 'function'
    ) {
      return;
    }
    session.defaultSession.webRequest.onHeadersReceived((details, responder) => {
      try {
        if (details && details.statusCode === 401 && typeof details.url === 'string') {
          const parsedUrl = new URL(details.url);
          const h = (parsedUrl.hostname || '').toLowerCase();
          const p = parsedUrl.port
            ? Number.parseInt(parsedUrl.port, 10)
            : parsedUrl.protocol === 'https:'
              ? 443
              : 80;
          const wwwAuth = extractHeaderCaseInsensitive(details.responseHeaders, 'www-authenticate') || '';
          const realmMatch = wwwAuth.match(/realm="([^"]+)"/i);
          const realm = realmMatch ? realmMatch[1] : APP_BASIC_REALM;
          const instanceHeader = extractHeaderCaseInsensitive(details.responseHeaders, 'x-aiboss-instance');
          const keyWithRealm = `${h}:${p}:${realm}`;
          const keyHostPort = `${h}:${p}`;
          const exp = Date.now() + INSTANCE_HEADER_TTL_MS;
          if (instanceHeader) {
            recentInstanceProofHeaders.set(keyWithRealm, { value: instanceHeader, expiresAt: exp });
            recentInstanceProofHeaders.set(keyHostPort, { value: instanceHeader, expiresAt: exp });
          } else {
            recentInstanceProofHeaders.delete(keyWithRealm);
            recentInstanceProofHeaders.delete(keyHostPort);
          }
        }
      } catch {
        // Ignore URL parse errors on non-standard schemes
      }
      if (typeof responder === 'function') {
        responder({ cancel: false });
      }
    });
  }

  function resolveChallengeInstanceHeader(details, host, port, realm, nowMs) {
    if (details && details.responseHeaders && typeof details.responseHeaders === 'object') {
      return extractHeaderCaseInsensitive(details.responseHeaders, 'x-aiboss-instance');
    }
    const keyWithRealm = `${host}:${port}:${realm}`;
    const keyHostPort = `${host}:${port}`;
    const entry = recentInstanceProofHeaders.get(keyWithRealm) || recentInstanceProofHeaders.get(keyHostPort);
    if (entry && nowMs <= entry.expiresAt && typeof entry.value === 'string') {
      return entry.value;
    }
    return null;
  }

  function verifyInstanceHmacProof(nonce, host, port, realm, headerValue) {
    if (typeof headerValue !== 'string' || !/^v1\.[0-9a-f]{64}$/i.test(headerValue.trim())) {
      return false;
    }
    const expected =
      'v1.' +
      crypto
        .createHmac('sha256', nonce)
        .update(`${host}:${port}:${realm}`, 'utf8')
        .digest('hex');
    const actualBuf = Buffer.from(headerValue.trim().toLowerCase(), 'utf8');
    const expectedBuf = Buffer.from(expected.toLowerCase(), 'utf8');
    return actualBuf.length === expectedBuf.length && crypto.timingSafeEqual(actualBuf, expectedBuf);
  }

  app.on('login', (event, _webContents, details, authInfo, callback) => {
    const envUser = typeof process.env.PHONGBAN_USER === 'string' ? process.env.PHONGBAN_USER : '';
    const envPass = typeof process.env.PHONGBAN_PASS === 'string' ? process.env.PHONGBAN_PASS : '';
    if (!envUser || !envPass || typeof callback !== 'function') {
      return;
    }
    if (
      !authInfo ||
      typeof authInfo !== 'object' ||
      typeof authInfo.isProxy !== 'boolean' ||
      typeof authInfo.scheme !== 'string' ||
      typeof authInfo.host !== 'string' ||
      typeof authInfo.port !== 'number' ||
      !Number.isInteger(authInfo.port) ||
      typeof authInfo.realm !== 'string'
    ) {
      return;
    }

    // 1. Must not be a proxy challenge
    if (authInfo.isProxy !== false) {
      return;
    }
    // 2. Scheme must be basic (case-insensitive)
    if (authInfo.scheme.toLowerCase() !== 'basic') {
      return;
    }
    // 3. Host must be loopback AND port must match targetPort from resolvePort (strict integer type, F41)
    const host = authInfo.host.toLowerCase();
    const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
    const port = authInfo.port;
    if (!isLoopback || port !== targetPort) {
      return;
    }
    // 4. Realm must match APP_BASIC_REALM ('aiboss-office', must match src/app/api/approvals/[requestId]/decision/route.ts)
    if (authInfo.realm !== APP_BASIC_REALM) {
      return;
    }

    const key = `${host}:${port}:${authInfo.realm}`;
    const now = Date.now();
    let state = loginAttemptState.get(key);
    if (state && state.blockedUntil > 0 && now >= state.blockedUntil) {
      loginAttemptState.delete(key);
      state = undefined;
    }

    if (state && state.attempts >= 1) {
      if (state.blockedUntil === 0) {
        state.blockedUntil = now + LOGIN_RETRY_COOLDOWN_MS;
        console.log(
          `[AIBOSS Desktop] app Basic Auth rejected for ${key}; not retrying until ${new Date(state.blockedUntil).toISOString()} (60s cooldown)`,
        );
      }
      callback();
      return;
    }

    // 5. Instance nonce HMAC proof check (F40)
    const instanceNonce = readInstanceNonce(targetPort, now);
    if (!instanceNonce) {
      console.log(
        `[AIBOSS Desktop] WARNING: Basic Auth challenge for ${key} cancelled (missing or invalid instance-${targetPort}.json)`,
      );
      callback();
      return;
    }

    const proofHeader = resolveChallengeInstanceHeader(details, host, port, authInfo.realm, now);
    if (!proofHeader) {
      console.log(
        `[AIBOSS Desktop] WARNING: Basic Auth challenge for ${key} cancelled (missing X-AIBOSS-Instance header)`,
      );
      callback();
      return;
    }

    if (!verifyInstanceHmacProof(instanceNonce, host, port, authInfo.realm, proofHeader)) {
      console.log(
        `[AIBOSS Desktop] WARNING: Basic Auth challenge for ${key} cancelled (X-AIBOSS-Instance HMAC mismatch)`,
      );
      callback();
      return;
    }

    loginAttemptState.set(key, { attempts: 1, blockedUntil: 0 });
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    callback(envUser, envPass);
  });

  // Handle second-instance focus
  app.on('second-instance', () => {
    focusAndShowWindow();
  });

  // Build localized application menu (File · Edit · View · Window · Help)
  function setupAppMenu(lang = currentLanguage) {
    const template = buildAppMenuTemplate({
      lang,
      isDev,
      onQuit: () => {
        app.isQuitting = true;
        app.quit();
      },
      onOpenWindow: focusAndShowWindow,
      onOpenSettings: openSettingsView,
    });

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return template;
  }

  function resolveInitialLanguage() {
    const saved = typeof loadSavedLanguage === 'function' ? loadSavedLanguage() : null;
    if (saved === 'en' || saved === 'vi') {
      return saved;
    }
    const systemLocale = typeof app.getLocale === 'function' ? app.getLocale() : '';
    return resolveDesktopSystemLanguage(systemLocale);
  }

  function applyDesktopLanguage(nextLang, { persist = true } = {}) {
    const systemLocale = typeof app.getLocale === 'function' ? app.getLocale() : '';
    const normalized = normalizeDesktopLanguage(nextLang, systemLocale);
    currentLanguage = normalized;

    setupAppMenu(currentLanguage);
    if (typeof setTrayLanguage === 'function') {
      setTrayLanguage(currentLanguage, { persist });
    }
    if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.setTitle === 'function') {
      mainWindow.setTitle(getWindowTitle(currentLanguage));
    }

    return {
      language: currentLanguage,
      windowTitle: getWindowTitle(currentLanguage),
    };
  }

  // Polls backend status and seats count
  async function pollStatus() {
    try {
      const isOnline = await probeServer(targetPort, 1200);
      let activeCount = 0;

      if (isOnline) {
        // Attempt to read active seats from GET /api/o
        activeCount = await new Promise((resolve) => {
          const req = http.get(
            {
              host: '127.0.0.1',
              port: targetPort,
              path: '/api/o',
              timeout: 1500,
            },
            (res) => {
              let body = '';
              res.on('data', (c) => (body += c));
              res.on('end', () => {
                try {
                  const json = JSON.parse(body);
                  if (json && json.o && typeof json.o === 'object') {
                    const slots = Object.values(json.o);
                    const activeSlots = slots.filter((s) => s && s.ma_nhan_su && s.ma_phien && s.moc_ket_thuc === null);
                    resolve(activeSlots.length);
                  } else if (Array.isArray(json.activeSeats)) {
                    resolve(json.activeSeats.length);
                  } else if (typeof json.runningCount === 'number') {
                    resolve(json.runningCount);
                  } else {
                    resolve(0);
                  }
                } catch (e) {
                  resolve(0);
                }
              });
            }
          );
          req.on('error', () => resolve(0));
          req.on('timeout', () => {
            req.destroy();
            resolve(0);
          });
        });
      }

      updateTrayStatus({ serverOnline: isOnline, activeSeatsCount: activeCount });
      updatePowerSaveState(activeCount);
    } catch (err) {
      // background error ignored
    }
  }

  function parseWindowGeometry() {
    let width = 1280;
    let height = 800;
    for (let i = 0; i < process.argv.length; i++) {
      if (process.argv[i] === '--width' && process.argv[i + 1]) width = parseInt(process.argv[i + 1], 10) || 1280;
      if (process.argv[i] === '--height' && process.argv[i + 1]) height = parseInt(process.argv[i + 1], 10) || 800;
    }
    return { width, height };
  }

  // Creates the main desktop window
  function createMainWindow(lang = currentLanguage) {
    const geo = parseWindowGeometry();
    mainWindow = new BrowserWindow({
      width: geo.width,
      height: geo.height,
      minWidth: 900,
      minHeight: 600,
      title: getWindowTitle(lang),
      backgroundColor: '#0a1929',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    if (typeof mainWindow.on === 'function') {
      // Keep localized window title synchronized with currentLanguage
      mainWindow.on('page-title-updated', (event) => {
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.setTitle === 'function') {
          mainWindow.setTitle(getWindowTitle(currentLanguage));
        }
      });

      // Close button hides window into tray instead of exiting
      mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
          event.preventDefault();
          mainWindow.hide();
        }
      });

      mainWindow.on('closed', () => {
        mainWindow = null;
      });
    }

    return mainWindow;
  }

  // Check for screenshot CLI flag
  function parseScreenshotPath() {
    for (let i = 0; i < process.argv.length; i++) {
      if (process.argv[i] === '--screenshot' && process.argv[i + 1]) {
        return path.resolve(process.argv[i + 1]);
      }
      if (process.argv[i].startsWith('--screenshot=')) {
        return path.resolve(process.argv[i].split('=')[1]);
      }
    }
    return null;
  }

  // Check for route path CLI flag
  function parseRoutePath() {
    for (let i = 0; i < process.argv.length; i++) {
      if (process.argv[i] === '--path' && process.argv[i + 1]) {
        return process.argv[i + 1].startsWith('/') ? process.argv[i + 1] : '/' + process.argv[i + 1];
      }
      if (process.argv[i].startsWith('--path=')) {
        const val = process.argv[i].split('=')[1];
        return val.startsWith('/') ? val : '/' + val;
      }
    }
    return '';
  }

  app.whenReady().then(async () => {
    registerInstanceHeaderListener();
    currentLanguage = resolveInitialLanguage();
    setupAppMenu(currentLanguage);
    const win = createMainWindow(currentLanguage);
    initTray({ window: win, port: targetPort, lang: currentLanguage });

    const routePath = parseRoutePath();
    const serverUrl = `http://127.0.0.1:${targetPort}${routePath}`;
    const screenshotPath = parseScreenshotPath();

    // Check if server is already running
    const isUp = await probeServer(targetPort, 1500);

    if (isUp) {
      console.log(`[AIBOSS Desktop] Server is online at ${serverUrl}. Loading view...`);
      win.loadURL(serverUrl);
    } else {
      console.log(`[AIBOSS Desktop] Server is offline. Loading splash screen and launching service...`);
      win.loadFile(path.join(__dirname, 'splash.html'));

      ensureServerReady(targetPort, {
        maxWaitMs: 60000,
        intervalMs: 1000,
        repoRoot,
      }).then((result) => {
        if (result.ok) {
          console.log(`[AIBOSS Desktop] Server became ready after ${result.elapsedMs}ms. Loading ${serverUrl}...`);
          win.loadURL(serverUrl);
        } else {
          console.error(`[AIBOSS Desktop] Server start timed out: ${result.error}`);
          win.webContents.executeJavaScript(`
            document.getElementById('statusMessage').textContent = 'Server start timed out after 60s.';
            document.getElementById('progressBar').style.display = 'none';
            document.getElementById('errorBox').style.display = 'block';
            document.getElementById('errorBox').textContent = 'Could not establish connection to 127.0.0.1:${targetPort}. Please verify services.';
            document.getElementById('retryBtn').style.display = 'inline-block';
          `).catch(() => {});
        }
      });
    }

    // Screenshot capture automation handler
    if (screenshotPath) {
      console.log(`[AIBOSS Desktop] Automated screenshot requested: ${screenshotPath}`);
      win.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const img = await win.webContents.capturePage();
            const pngBuf = img.toPNG();
            const dir = path.dirname(screenshotPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(screenshotPath, pngBuf);
            console.log(`[AIBOSS Desktop] Screenshot successfully captured to: ${screenshotPath} (${pngBuf.length} bytes)`);
          } catch (err) {
            console.error('[AIBOSS Desktop] Failed to capture screenshot:', err);
          } finally {
            app.isQuitting = true;
            app.quit();
          }
        }, 1500);
      });
    }

    // Register IPC handlers
    ipcMain.handle('desktop:get-port', () => targetPort);
    ipcMain.handle('desktop:get-status', () => getDesktopStatus());
    ipcMain.handle('desktop:get-login-item', () => app.getLoginItemSettings());
    ipcMain.handle('desktop:set-login-item', (_e, enabled) => setStartAtLogin(enabled));
    ipcMain.handle('desktop:get-language', () => currentLanguage);
    ipcMain.handle('aiboss-desktop:get-language', () => currentLanguage);
    ipcMain.handle('desktop:set-language', (_e, nextLang) => applyDesktopLanguage(nextLang, { persist: true }));
    ipcMain.handle('aiboss-desktop:set-language', (_e, nextLang) => applyDesktopLanguage(nextLang, { persist: true }));
    ipcMain.handle('desktop:report-running', (_e, count) => {
      updatePowerSaveState(count);
      return count;
    });

    // Measurement automation flag for 5B-2 live testing
    if (process.argv.includes('--measure-live')) {
      const { execSync } = require('node:child_process');
      const pid = process.pid;
      console.log(`[MEASURE_START] Live measurement for PID ${pid} at ${new Date().toISOString()}`);

      console.log('--- 1. POWER ASSERTION (BEFORE) ---');
      const b = execSync('pmset -g assertions', { encoding: 'utf8' });
      const bLines = b.split('\n').filter((l) => l.includes(`pid ${pid}`) || (l.includes('NoIdleSleepAssertion') && l.includes('Electron')));
      console.log(bLines.join('\n') || `(no assertion for pid ${pid})`);

      console.log('--- 1. POWER ASSERTION (ACTIVE) ---');
      const blockerId = updatePowerSaveState(1).blockerId;
      await new Promise((r) => setTimeout(r, 600));
      const activeOut = execSync('pmset -g assertions', { encoding: 'utf8' });
      const activeLines = activeOut.split('\n').filter((l) => l.includes(`pid ${pid}`) || (l.includes('NoIdleSleepAssertion') && l.includes('Electron')));
      console.log(activeLines.join('\n'));

      console.log('--- 1. POWER ASSERTION (RELEASED) ---');
      updatePowerSaveState(0);
      await new Promise((r) => setTimeout(r, 600));
      const relOut = execSync('pmset -g assertions', { encoding: 'utf8' });
      const relLines = relOut.split('\n').filter((l) => l.includes(`pid ${pid}`) || (l.includes('NoIdleSleepAssertion') && l.includes('Electron')));
      console.log(relLines.join('\n') || `(assertion released for pid ${pid})`);

      console.log('--- 2. LOGIN ITEM (TOGGLE TEST) ---');
      console.log('Before toggle:', JSON.stringify(app.getLoginItemSettings()));
      setStartAtLogin(true);
      console.log('After ON:', JSON.stringify(app.getLoginItemSettings()));
      setStartAtLogin(false);
      console.log('After OFF:', JSON.stringify(app.getLoginItemSettings()));

      app.isQuitting = true;
      app.quit();
      return;
    }

    // Start background polling
    pollStatus();
    statusInterval = setInterval(pollStatus, 10000);
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    if (statusInterval) clearInterval(statusInterval);
    destroyTray();
    stopSpawnedServer();
  });

  app.on('window-all-closed', () => {
    // On macOS, desktop applications typically stay running in the tray/dock until explicit quit
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow(currentLanguage);
    }
  });
}
