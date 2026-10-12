'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { Tray, Menu, nativeImage, app } = require('electron');

let tray = null;
let currentWindow = null;
let currentPort = 4330;
let isServerOnline = false;
let activeSeats = 0;
let isStartAtLogin = false;

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function loadSavedSettings() {
  try {
    const file = getSettingsPath();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof data.startAtLogin === 'boolean') {
        return data.startAtLogin;
      }
    }
  } catch (e) {
    // ignore
  }
  try {
    const loginItem = app.getLoginItemSettings();
    return !!loginItem.openAtLogin;
  } catch (e) {
    return false;
  }
}

function persistSettings(settings) {
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('[AIBOSS Desktop] Failed to save desktop settings:', e.message);
  }
}

function buildMenu() {
  const serverText = isServerOnline
    ? `Server: Online (127.0.0.1:${currentPort})`
    : `Server: Offline (127.0.0.1:${currentPort})`;

  const seatsText = activeSeats > 0
    ? `Active Seats: ${activeSeats} running`
    : `Active Seats: 0 running (idle)`;

  return Menu.buildFromTemplate([
    {
      label: 'Open AIBOSS Office',
      click: () => {
        if (currentWindow && !currentWindow.isDestroyed()) {
          if (currentWindow.isMinimized()) currentWindow.restore();
          currentWindow.show();
          currentWindow.focus();
        }
      },
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
      label: 'Start at Login',
      type: 'checkbox',
      checked: isStartAtLogin,
      click: (item) => {
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
    },
    { type: 'separator' },
    {
      label: 'Quit AIBOSS Office',
      accelerator: 'CommandOrControl+Q',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function initTray({ window, port }) {
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

  tray = new Tray(icon);
  tray.setToolTip('AIBOSS Office');
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

function getDesktopStatus() {
  return {
    isElectron: true,
    serverOnline: isServerOnline,
    port: currentPort,
    activeSeats,
    startAtLogin: isStartAtLogin,
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
};
