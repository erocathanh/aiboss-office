'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { Tray, Menu, nativeImage, app } = require('electron');
const {
  FALLBACK_UI_LANGUAGE,
  isDesktopLanguage,
  getDesktopCopy,
} = require('./i18n.cjs');

let tray = null;
let currentWindow = null;
let currentPort = 4330;
let isServerOnline = false;
let activeSeats = 0;
let isStartAtLogin = false;
let currentLanguage = FALLBACK_UI_LANGUAGE;

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function readRawSettings() {
  try {
    const file = getSettingsPath();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && typeof data === 'object') {
        return data;
      }
    }
  } catch (e) {
    // ignore
  }
  return {};
}

function loadSavedSettings() {
  const data = readRawSettings();
  if (typeof data.startAtLogin === 'boolean') {
    return data.startAtLogin;
  }
  try {
    const loginItem = app.getLoginItemSettings();
    return !!loginItem.openAtLogin;
  } catch (e) {
    return false;
  }
}

function loadSavedLanguage() {
  const data = readRawSettings();
  if (isDesktopLanguage(data.uiLanguage)) {
    return data.uiLanguage;
  }
  return null;
}

function persistSettings(patch) {
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const existing = readRawSettings();
    const merged = {
      ...existing,
      startAtLogin: isStartAtLogin,
      uiLanguage: currentLanguage,
      ...patch,
    };
    fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  } catch (e) {
    console.error('[AIBOSS Desktop] Failed to save desktop settings:', e.message);
  }
}

function buildTrayMenuTemplate({
  lang = currentLanguage,
  serverOnline = isServerOnline,
  port = currentPort,
  seatsCount = activeSeats,
  startAtLogin = isStartAtLogin,
  onOpenWindow = () => {},
  onToggleStartAtLogin = () => {},
  onQuit = () => {},
} = {}) {
  const copy = getDesktopCopy(lang).tray;
  const serverText = (serverOnline ? copy.serverOnline : copy.serverOffline).replace(
    '{port}',
    String(port),
  );
  const seatsText =
    seatsCount > 0
      ? copy.activeSeatsRunning.replace('{count}', String(seatsCount))
      : copy.activeSeatsIdle;

  return [
    {
      label: copy.openOffice,
      click: onOpenWindow,
    },
    { type: 'separator' },
    {
      label: serverText,
      enabled: false,
    },
    {
      label: seatsText,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: copy.startAtLogin,
      type: 'checkbox',
      checked: startAtLogin,
      click: onToggleStartAtLogin,
    },
    { type: 'separator' },
    {
      label: copy.quit,
      accelerator: 'CommandOrControl+Q',
      click: onQuit,
    },
  ];
}

function buildMenu() {
  return Menu.buildFromTemplate(
    buildTrayMenuTemplate({
      lang: currentLanguage,
      serverOnline: isServerOnline,
      port: currentPort,
      seatsCount: activeSeats,
      startAtLogin: isStartAtLogin,
      onOpenWindow: () => {
        if (currentWindow && !currentWindow.isDestroyed()) {
          if (currentWindow.isMinimized()) currentWindow.restore();
          currentWindow.show();
          currentWindow.focus();
        }
      },
      onToggleStartAtLogin: (item) => {
        isStartAtLogin = item.checked;
        try {
          app.setLoginItemSettings({
            openAtLogin: isStartAtLogin,
            openAsHidden: true,
          });
          persistSettings({ startAtLogin: isStartAtLogin });
          console.log(`[AIBOSS Desktop] Start at login updated: ${isStartAtLogin}`);
        } catch (err) {
          console.error('[AIBOSS Desktop] Failed to set login item settings:', err.message);
        }
      },
      onQuit: () => {
        app.isQuitting = true;
        app.quit();
      },
    }),
  );
}

function initTray({ window, port, lang }) {
  if (isDesktopLanguage(lang)) {
    currentLanguage = lang;
  }
  if (tray) return tray;

  currentWindow = window;
  currentPort = port;
  isStartAtLogin = loadSavedSettings();

  const iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  const copy = getDesktopCopy(currentLanguage).tray;
  tray = new Tray(icon);
  tray.setToolTip(copy.tooltip);
  tray.setContextMenu(buildMenu());

  tray.on('click', () => {
    if (currentWindow && !currentWindow.isDestroyed()) {
      if (currentWindow.isVisible()) {
        currentWindow.focus();
      } else {
        currentWindow.show();
        currentWindow.focus();
      }
    }
  });

  return tray;
}

function updateTrayStatus({ serverOnline, activeSeatsCount }) {
  if (typeof serverOnline === 'boolean') isServerOnline = serverOnline;
  if (typeof activeSeatsCount === 'number') activeSeats = activeSeatsCount;

  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildMenu());
  }
}

function setTrayLanguage(lang, { persist = true } = {}) {
  if (isDesktopLanguage(lang)) {
    currentLanguage = lang;
  }
  if (persist) {
    persistSettings({ uiLanguage: currentLanguage });
  }
  if (tray && !tray.isDestroyed()) {
    const copy = getDesktopCopy(currentLanguage).tray;
    tray.setToolTip(copy.tooltip);
    tray.setContextMenu(buildMenu());
  }
  return currentLanguage;
}

function getTrayLanguage() {
  return currentLanguage;
}

function getDesktopStatus() {
  return {
    isElectron: true,
    serverOnline: isServerOnline,
    port: currentPort,
    activeSeats,
    startAtLogin: isStartAtLogin,
    language: currentLanguage,
  };
}

function setStartAtLogin(enabled) {
  isStartAtLogin = !!enabled;
  try {
    app.setLoginItemSettings({
      openAtLogin: isStartAtLogin,
      openAsHidden: true,
    });
    persistSettings({ startAtLogin: isStartAtLogin });
  } catch (e) {
    // ignore
  }
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildMenu());
  }
  return isStartAtLogin;
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  initTray,
  updateTrayStatus,
  getDesktopStatus,
  setStartAtLogin,
  destroyTray,
  loadSavedLanguage,
  setTrayLanguage,
  getTrayLanguage,
  buildTrayMenuTemplate,
};
