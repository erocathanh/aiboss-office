'use strict';

const DEFAULT_UI_LANGUAGE_MODE = 'system';
const FALLBACK_UI_LANGUAGE = 'en';

const DESKTOP_DICTIONARY = Object.freeze({
  en: Object.freeze({
    windowTitle: 'AIBOSS Office — Autonomous Workspace',
    menu: Object.freeze({
      app: 'AIBOSS Office',
      about: 'About AIBOSS Office',
      services: 'Services',
      hide: 'Hide AIBOSS Office',
      hideOthers: 'Hide Others',
      unhide: 'Show All',
      quit: 'Quit AIBOSS Office',
      file: 'File',
      openSettings: 'Office Settings…',
      closeWindow: 'Close Window',
      edit: 'Edit',
      undo: 'Undo',
      redo: 'Redo',
      cut: 'Cut',
      copy: 'Copy',
      paste: 'Paste',
      selectAll: 'Select All',
      view: 'View',
      reload: 'Reload',
      forceReload: 'Force Reload',
      toggleDevTools: 'Toggle Developer Tools',
      resetZoom: 'Actual Size',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      togglefullscreen: 'Toggle Full Screen',
      window: 'Window',
      minimize: 'Minimize',
      zoom: 'Zoom',
      front: 'Bring All to Front',
      help: 'Help',
      openWorkspace: 'Open AIBOSS Office',
      openOfficeSettings: 'Open Office Settings',
    }),
    tray: Object.freeze({
      tooltip: 'AIBOSS Office',
      openOffice: 'Open AIBOSS Office',
      serverOnline: 'Server: Online (127.0.0.1:{port})',
      serverOffline: 'Server: Offline (127.0.0.1:{port})',
      activeSeatsRunning: 'Active Seats: {count} running',
      activeSeatsIdle: 'Active Seats: 0 running (idle)',
      startAtLogin: 'Start at Login',
      quit: 'Quit AIBOSS Office',
    }),
  }),
  vi: Object.freeze({
    windowTitle: 'AIBOSS Office — Văn phòng AI tự hành',
    menu: Object.freeze({
      app: 'AIBOSS Office',
      about: 'Giới thiệu về AIBOSS Office',
      services: 'Dịch vụ',
      hide: 'Ẩn AIBOSS Office',
      hideOthers: 'Ẩn các ứng dụng khác',
      unhide: 'Hiện tất cả',
      quit: 'Thoát AIBOSS Office',
      file: 'Tệp',
      openSettings: 'Cài đặt văn phòng…',
      closeWindow: 'Đóng cửa sổ',
      edit: 'Chỉnh sửa',
      undo: 'Hoàn tác',
      redo: 'Làm lại',
      cut: 'Cắt',
      copy: 'Sao chép',
      paste: 'Dán',
      selectAll: 'Chọn tất cả',
      view: 'Xem',
      reload: 'Tải lại trang',
      forceReload: 'Buộc tải lại trang',
      toggleDevTools: 'Bật/tắt công cụ lập trình',
      resetZoom: 'Kích thước thực tế',
      zoomIn: 'Phóng to',
      zoomOut: 'Thu nhỏ',
      togglefullscreen: 'Toàn màn hình',
      window: 'Cửa sổ',
      minimize: 'Thu nhỏ cửa sổ',
      zoom: 'Thu phóng cửa sổ',
      front: 'Đưa tất cả lên trước',
      help: 'Trợ giúp',
      openWorkspace: 'Mở AIBOSS Office',
      openOfficeSettings: 'Mở cài đặt văn phòng',
    }),
    tray: Object.freeze({
      tooltip: 'AIBOSS Office',
      openOffice: 'Mở AIBOSS Office',
      serverOnline: 'Máy chủ: đang trực tuyến (127.0.0.1:{port})',
      serverOffline: 'Máy chủ: ngoại tuyến (127.0.0.1:{port})',
      activeSeatsRunning: 'Ghế đang chạy: {count}',
      activeSeatsIdle: 'Ghế đang chạy: 0 (đang nghỉ)',
      startAtLogin: 'Khởi động cùng máy',
      quit: 'Thoát AIBOSS Office',
    }),
  }),
});

function isDesktopLanguage(value) {
  return value === 'en' || value === 'vi';
}

function resolveDesktopSystemLanguage(rawLocale, modeOverride = DEFAULT_UI_LANGUAGE_MODE) {
  if (modeOverride === 'en' || modeOverride === 'vi') {
    return modeOverride;
  }
  const candidate = typeof rawLocale === 'string' ? rawLocale.trim().toLowerCase() : '';
  if (candidate.startsWith('vi')) {
    return 'vi';
  }
  return FALLBACK_UI_LANGUAGE;
}

function normalizeDesktopLanguage(value, rawSystemLocale) {
  if (isDesktopLanguage(value)) return value;
  return resolveDesktopSystemLanguage(rawSystemLocale);
}

function getDesktopCopy(lang) {
  const normalized = isDesktopLanguage(lang) ? lang : FALLBACK_UI_LANGUAGE;
  return DESKTOP_DICTIONARY[normalized];
}

function getWindowTitle(lang) {
  return getDesktopCopy(lang).windowTitle;
}

function buildAppMenuTemplate({
  lang = FALLBACK_UI_LANGUAGE,
  isDev = false,
  onQuit = () => {},
  onOpenWindow = () => {},
  onOpenSettings = () => {},
} = {}) {
  const copy = getDesktopCopy(lang).menu;

  return [
    {
      label: copy.app,
      submenu: [
        { role: 'about', label: copy.about },
        { type: 'separator' },
        { role: 'services', label: copy.services },
        { type: 'separator' },
        { role: 'hide', label: copy.hide },
        { role: 'hideOthers', label: copy.hideOthers },
        { role: 'unhide', label: copy.unhide },
        { type: 'separator' },
        {
          label: copy.quit,
          accelerator: 'CommandOrControl+Q',
          click: onQuit,
        },
      ],
    },
    {
      label: copy.file,
      submenu: [
        {
          label: copy.openSettings,
          accelerator: 'CommandOrControl+,',
          click: onOpenSettings,
        },
        { type: 'separator' },
        {
          role: 'close',
          label: copy.closeWindow,
          accelerator: 'CommandOrControl+W',
        },
        { type: 'separator' },
        {
          label: copy.quit,
          accelerator: 'CommandOrControl+Q',
          click: onQuit,
        },
      ],
    },
    {
      label: copy.edit,
      submenu: [
        { role: 'undo', label: copy.undo },
        { role: 'redo', label: copy.redo },
        { type: 'separator' },
        { role: 'cut', label: copy.cut },
        { role: 'copy', label: copy.copy },
        { role: 'paste', label: copy.paste },
        { role: 'selectAll', label: copy.selectAll },
      ],
    },
    {
      label: copy.view,
      submenu: [
        { role: 'reload', label: copy.reload, accelerator: 'CommandOrControl+R' },
        { role: 'forceReload', label: copy.forceReload, accelerator: 'CommandOrControl+Shift+R' },
        { type: 'separator' },
        { role: 'resetZoom', label: copy.resetZoom },
        { role: 'zoomIn', label: copy.zoomIn },
        { role: 'zoomOut', label: copy.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: copy.togglefullscreen },
        ...(isDev
          ? [
              { type: 'separator' },
              {
                role: 'toggleDevTools',
                label: copy.toggleDevTools,
                accelerator: 'Alt+CommandOrControl+I',
              },
            ]
          : []),
      ],
    },
    {
      label: copy.window,
      submenu: [
        { role: 'minimize', label: copy.minimize, accelerator: 'CommandOrControl+M' },
        { role: 'zoom', label: copy.zoom },
        { type: 'separator' },
        { role: 'front', label: copy.front },
        { type: 'separator' },
        { role: 'close', label: copy.closeWindow, accelerator: 'CommandOrControl+W' },
      ],
    },
    {
      label: copy.help,
      submenu: [
        {
          label: copy.openWorkspace,
          click: onOpenWindow,
        },
        {
          label: copy.openOfficeSettings,
          click: onOpenSettings,
        },
      ],
    },
  ];
}

module.exports = {
  DEFAULT_UI_LANGUAGE_MODE,
  FALLBACK_UI_LANGUAGE,
  DESKTOP_DICTIONARY,
  isDesktopLanguage,
  resolveDesktopSystemLanguage,
  normalizeDesktopLanguage,
  getDesktopCopy,
  getWindowTitle,
  buildAppMenuTemplate,
};
