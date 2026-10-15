import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  en,
  vi,
  UI_LANGUAGE_STORAGE_KEY,
  UI_LANGUAGE_DATA_ATTR,
  DEFAULT_UI_LANGUAGE_MODE,
  FALLBACK_UI_LANGUAGE,
  resolveSystemUiLanguage,
  readUiLanguage,
  saveUiLanguage,
  applyUiLanguage,
  syncUiLanguageOnStorageEvent,
  setCurrentUiLanguage,
  t,
} from '../src/i18n/core.ts';
import { scanUiLiterals } from '../operations/scripts/check-i18n-literals.mjs';

const require = createRequire(import.meta.url);
const desktopI18n = require('../desktop/i18n.cjs');

function flattenDictionaryKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenDictionaryKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

test('UI-2 Dictionary Parity: every key in en exists in vi and vice versa (0 missing, 0 empty)', () => {
  const enKeys = flattenDictionaryKeys(en);
  const viKeys = flattenDictionaryKeys(vi);

  const missingInVi = enKeys.filter((k) => !viKeys.includes(k));
  const missingInEn = viKeys.filter((k) => !enKeys.includes(k));

  assert.deepEqual(missingInVi, [], `Keys in en missing from vi: ${missingInVi.join(', ')}`);
  assert.deepEqual(missingInEn, [], `Keys in vi missing from en: ${missingInEn.join(', ')}`);
  assert.equal(enKeys.length, viKeys.length);
  assert.ok(enKeys.length >= 250, `Expected at least 250 translation keys, found ${enKeys.length}`);

  for (const key of enKeys) {
    const enVal = t(key, undefined, 'en');
    const viVal = t(key, undefined, 'vi');
    assert.equal(typeof enVal, 'string');
    assert.equal(typeof viVal, 'string');
    assert.ok(enVal.length > 0, `Empty en value for key ${key}`);
    assert.ok(viVal.length > 0, `Empty vi value for key ${key}`);
    // Verify Vietnamese copy rules: no forbidden 'tiệm'/'shop' or prohibition icons
    assert.ok(!/\b(tiệm|shop)\b/i.test(viVal), `Forbidden word in vi key ${key}: ${viVal}`);
    assert.ok(!/[🚫⛔]/.test(viVal), `Forbidden prohibition icon in vi key ${key}: ${viVal}`);
  }
});

test('UI-2 Missing Key Fallback: t() with missing key returns raw key and logs console.warn without throwing', () => {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.join(' '));
  };

  try {
    setCurrentUiLanguage('en');
    const resultEn = t('nonexistent.section.missing_key');
    assert.equal(resultEn, 'nonexistent.section.missing_key');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Missing translation key: "nonexistent\.section\.missing_key"/);

    setCurrentUiLanguage('vi');
    const resultVi = t('another.missing.key');
    assert.equal(resultVi, 'another.missing.key');
    assert.equal(warnings.length, 2);
    assert.match(warnings[1], /Missing translation key: "another\.missing\.key" \(lang="vi"\)/);
  } finally {
    console.warn = origWarn;
    setCurrentUiLanguage('en');
  }
});

test('UI-2 System Language Default: follows navigator.language / system locale (vi-VN -> vi, en-GB -> en)', () => {
  assert.equal(DEFAULT_UI_LANGUAGE_MODE, 'system');
  assert.equal(FALLBACK_UI_LANGUAGE, 'en');

  // Explicit locale parameter
  assert.equal(resolveSystemUiLanguage('vi-VN'), 'vi');
  assert.equal(resolveSystemUiLanguage('vi'), 'vi');
  assert.equal(resolveSystemUiLanguage('VI-vn'), 'vi');
  assert.equal(resolveSystemUiLanguage('en-GB'), 'en');
  assert.equal(resolveSystemUiLanguage('en-US'), 'en');
  assert.equal(resolveSystemUiLanguage('ja-JP'), 'en');
  assert.equal(resolveSystemUiLanguage(''), 'en');

  // Single-constant override mode verification
  assert.equal(resolveSystemUiLanguage('vi-VN', 'en'), 'en');
  assert.equal(resolveSystemUiLanguage('en-GB', 'vi'), 'vi');

  // Mock global navigator.language
  const origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'vi-VN' },
      configurable: true,
      writable: true,
    });
    assert.equal(resolveSystemUiLanguage(), 'vi');

    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-GB' },
      configurable: true,
      writable: true,
    });
    assert.equal(resolveSystemUiLanguage(), 'en');
  } finally {
    if (origNavigator) {
      Object.defineProperty(globalThis, 'navigator', origNavigator);
    }
  }
});

test('UI-2 Persistence & Cross-Tab Sync: localStorage read/write, DOM attributes, and storage event sync', () => {
  const store = new Map();
  const mockStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
  };

  // When storage is empty, readUiLanguage falls back to system locale
  assert.equal(readUiLanguage(mockStorage, 'vi-VN'), 'vi');
  assert.equal(readUiLanguage(mockStorage, 'en-GB'), 'en');

  // Saving language persists to UI_LANGUAGE_STORAGE_KEY
  assert.equal(saveUiLanguage('vi', mockStorage), 'vi');
  assert.equal(store.get(UI_LANGUAGE_STORAGE_KEY), 'vi');
  assert.equal(readUiLanguage(mockStorage, 'en-GB'), 'vi');

  assert.equal(saveUiLanguage('en', mockStorage), 'en');
  assert.equal(store.get(UI_LANGUAGE_STORAGE_KEY), 'en');
  assert.equal(readUiLanguage(mockStorage, 'vi-VN'), 'en');

  // DOM attribute & document title update
  const attrs = new Map();
  const mockDoc = {
    title: '',
    documentElement: {
      lang: 'en',
      setAttribute: (k, v) => attrs.set(k, v),
    },
  };

  applyUiLanguage('vi', mockDoc);
  assert.equal(attrs.get(UI_LANGUAGE_DATA_ATTR), 'vi');
  assert.equal(mockDoc.documentElement.lang, 'vi');
  assert.equal(mockDoc.title, 'AIBOSS Office — Văn phòng AI tự hành');

  // Cross-tab storage event sync
  const syncedEn = syncUiLanguageOnStorageEvent(
    { key: UI_LANGUAGE_STORAGE_KEY, newValue: 'en' },
    mockDoc,
  );
  assert.equal(syncedEn, 'en');
  assert.equal(attrs.get(UI_LANGUAGE_DATA_ATTR), 'en');
  assert.equal(mockDoc.documentElement.lang, 'en');
  assert.equal(mockDoc.title, 'AIBOSS Office — Autonomous Workspace');

  // Unrelated storage key is ignored
  const ignored = syncUiLanguageOnStorageEvent(
    { key: 'other-key', newValue: 'vi' },
    mockDoc,
  );
  assert.equal(ignored, null);
});

test('UI-2 Electron Menu & IPC: desktop menu template and window title rebuild when language changes', () => {
  assert.equal(desktopI18n.resolveDesktopSystemLanguage('vi-VN'), 'vi');
  assert.equal(desktopI18n.resolveDesktopSystemLanguage('en-GB'), 'en');

  const enTemplate = desktopI18n.buildAppMenuTemplate({ lang: 'en', isDev: true });
  const viTemplate = desktopI18n.buildAppMenuTemplate({ lang: 'vi', isDev: true });

  assert.deepEqual(
    enTemplate.map((item) => item.label),
    ['AIBOSS Office', 'File', 'Edit', 'View', 'Window', 'Help'],
  );
  assert.deepEqual(
    viTemplate.map((item) => item.label),
    ['AIBOSS Office', 'Tệp', 'Chỉnh sửa', 'Hiển thị', 'Cửa sổ', 'Trợ giúp'],
  );

  assert.equal(desktopI18n.getWindowTitle('en'), 'AIBOSS Office — Autonomous Workspace');
  assert.equal(desktopI18n.getWindowTitle('vi'), 'AIBOSS Office — Văn phòng AI tự hành');
});

test('UI-2 AST Literal Scanner: 0 untranslated UI literal strings (>= 2 words) in src/components/** and src/app/**', () => {
  const report = scanUiLiterals();
  assert.ok(report.scannedFilesCount >= 18);
  assert.deepEqual(
    report.violations,
    [],
    `Found untranslated UI literals: ${JSON.stringify(report.violations, null, 2)}`,
  );
});
