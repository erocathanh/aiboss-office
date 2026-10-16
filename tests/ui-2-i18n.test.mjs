import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  en,
  vi,
  UI_LANGUAGE_STORAGE_KEY,
  UI_LANGUAGE_COOKIE_KEY,
  UI_LANGUAGE_DATA_ATTR,
  DEFAULT_UI_LANGUAGE_MODE,
  FALLBACK_UI_LANGUAGE,
  parseUiLanguageCookie,
  parseAcceptLanguagePrimaryLocale,
  resolveServerUiLanguage,
  resolveSystemUiLanguage,
  readUiLanguage,
  saveUiLanguage,
  applyUiLanguage,
  syncUiLanguageOnStorageEvent,
  markClientInitialized,
  setCurrentUiLanguage,
  t,
  formatLocalTimestamp,
} from '../src/i18n/core.ts';
import { UiLanguageProvider } from '../src/i18n/index.ts';
import { ApprovalsSettingsCard } from '../src/components/office/ApprovalsSettingsCard.tsx';
import { GET as getDesktopStatusRoute } from '../src/app/api/desktop/status/route.ts';
import { POST as postDecisionRoute } from '../src/app/api/approvals/[requestId]/decision/route.ts';
import { moTaHanFork } from '../src/lib/han-gio-fork.ts';
import { NextRequest } from 'next/server';
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
    ['AIBOSS Office', 'Tệp', 'Chỉnh sửa', 'Xem', 'Cửa sổ', 'Trợ giúp'],
  );

  assert.equal(desktopI18n.getWindowTitle('en'), 'AIBOSS Office — Autonomous Workspace');
  assert.equal(desktopI18n.getWindowTitle('vi'), 'AIBOSS Office — Văn phòng AI tự hành');
});

test('UI-2 AST Literal Scanner: 0 untranslated UI literal strings (>= 2 words, or >= 1 word in button/label) in src/components/** and src/app/**', () => {
  const report = scanUiLiterals();
  assert.ok(report.scannedFilesCount >= 19);
  assert.deepEqual(
    report.violations,
    [],
    `Found untranslated UI literals: ${JSON.stringify(report.violations, null, 2)}`,
  );

  // Positive control in isolated temp dir: 1-word literal in <button>Save</button> MUST be caught
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-scanner-pos-'));
  try {
    const compDir = path.join(tmpRepo, 'src/components');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(
      path.join(compDir, 'TempBtn.tsx'),
      'export function TempBtn() { return <button type="button">Save</button>; }\n',
      'utf8',
    );
    const posReport = scanUiLiterals({ repoRoot: tmpRepo });
    assert.equal(posReport.violations.length, 1);
    assert.equal(posReport.violations[0].text, 'Save');
    assert.equal(posReport.violations[0].kind, 'JSXText(button/label)');
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('UI-2 v02 V2: SSR language resolution (Cookie > Accept-Language > Fallback) + cookie & data-ui-lang sync', () => {
  assert.equal(UI_LANGUAGE_COOKIE_KEY, 'aiboss-office.ui-language');

  // Cookie parsing
  assert.equal(parseUiLanguageCookie('vi'), 'vi');
  assert.equal(parseUiLanguageCookie('en'), 'en');
  assert.equal(parseUiLanguageCookie('other=1; aiboss-office.ui-language=vi; theme=dark'), 'vi');
  assert.equal(parseUiLanguageCookie('aiboss-office.ui-language=en'), 'en');
  assert.equal(parseUiLanguageCookie('aiboss-office.ui-language=fr'), null);
  assert.equal(parseUiLanguageCookie(''), null);

  // Accept-Language primary locale parsing
  assert.equal(parseAcceptLanguagePrimaryLocale('vi-VN,vi;q=0.9,en-US;q=0.8'), 'vi-VN');
  assert.equal(parseAcceptLanguagePrimaryLocale('en-GB,en;q=0.9'), 'en-GB');
  assert.equal(parseAcceptLanguagePrimaryLocale('en-US;q=0.5,vi-VN;q=0.9'), 'vi-VN');

  // Server resolution priority: cookie > modeOverride > Accept-Language > fallback
  assert.equal(
    resolveServerUiLanguage({ acceptLanguage: 'vi-VN,vi;q=0.9,en-US;q=0.8' }),
    'vi',
  );
  assert.equal(
    resolveServerUiLanguage({ acceptLanguage: 'en-GB,en;q=0.9' }),
    'en',
  );
  assert.equal(
    resolveServerUiLanguage({
      cookieValue: 'en',
      acceptLanguage: 'vi-VN,vi;q=0.9,en-US;q=0.8',
    }),
    'en',
  );
  assert.equal(
    resolveServerUiLanguage({
      cookieValue: 'vi',
      acceptLanguage: 'en-GB,en;q=0.9',
    }),
    'vi',
  );
  assert.equal(resolveServerUiLanguage({}), 'en');

  // saveUiLanguage writes both localStorage and document.cookie
  const store = new Map();
  const mockStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const mockCookieDoc = { cookie: '' };
  saveUiLanguage('vi', mockStorage, mockCookieDoc);
  assert.equal(store.get(UI_LANGUAGE_STORAGE_KEY), 'vi');
  assert.match(mockCookieDoc.cookie, /^aiboss-office\.ui-language=vi; Path=\/; Max-Age=31536000; SameSite=Lax$/);

  // When localStorage is empty (system mode), readUiLanguage honors server-stamped data-ui-lang attribute
  store.clear();
  const mockDomDocVi = {
    documentElement: {
      getAttribute: (k) => (k === UI_LANGUAGE_DATA_ATTR ? 'vi' : null),
    },
  };
  const mockDomDocEn = {
    documentElement: {
      getAttribute: (k) => (k === UI_LANGUAGE_DATA_ATTR ? 'en' : null),
    },
  };
  assert.equal(readUiLanguage(mockStorage, undefined, mockDomDocVi), 'vi');
  assert.equal(readUiLanguage(mockStorage, undefined, mockDomDocEn), 'en');
});

test('UI-2 v02 V3 & V4: /api/desktop/status returns 200 and ApprovalsSettingsCard renders in both en and vi', async () => {
  const statusRes = await getDesktopStatusRoute();
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();
  assert.equal(statusBody.available, false);
  assert.equal(statusBody.running, false);

  try {
    const htmlEn = renderToStaticMarkup(
      React.createElement(
        UiLanguageProvider,
        { initialLang: 'en' },
        React.createElement(ApprovalsSettingsCard, { initialApprovals: [] }),
      ),
    );
    assert.ok(htmlEn.includes('Approvals'));
    assert.ok(htmlEn.includes('Pending Requests (0)'));
    assert.ok(htmlEn.includes('No pending approval requests.'));
    assert.ok(htmlEn.includes('Decided Ledger (0)'));

    const htmlVi = renderToStaticMarkup(
      React.createElement(
        UiLanguageProvider,
        { initialLang: 'vi' },
        React.createElement(ApprovalsSettingsCard, { initialApprovals: [] }),
      ),
    );
    assert.ok(htmlVi.includes('Duyệt thao tác'));
    assert.ok(htmlVi.includes('Yêu cầu chờ duyệt (0)'));
    assert.ok(htmlVi.includes('Chưa có yêu cầu nào đang chờ duyệt.'));
    assert.ok(htmlVi.includes('Sổ đã quyết (0)'));
  } finally {
    setCurrentUiLanguage('en');
  }
});

test('UI-2c: moTaHanFork(t), formatLocalTimestamp, Approvals actor/ttl formatting, and 401 WWW-Authenticate header', async () => {
  try {
    setCurrentUiLanguage('vi');
    assert.equal(moTaHanFork(t), 'tối đa 3 phút');
    setCurrentUiLanguage('en');
    assert.equal(moTaHanFork(t), 'up to 3 minutes');

    const viTime = formatLocalTimestamp('2026-10-12T18:10:00Z', 'vi', false);
    const enTime = formatLocalTimestamp('2026-10-12T18:10:00Z', 'en', false);
    assert.ok(viTime.includes('18:10') && viTime.includes('12/10/2026'), `Unexpected viTime: ${viTime}`);
    assert.ok(enTime.includes('18:10') && enTime.includes('12/10/2026'), `Unexpected enTime: ${enTime}`);

    const decidedSample = [
      {
        requestId: '1122334455667788',
        ts: '2026-10-14T20:15:00.000Z',
        seat: 'copywriter-seat',
        tool: 'Bash',
        host: 'api.example.com',
        reason: 'external_post_send',
        sha256: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        head60: 'curl -X POST https://api.example.com',
        status: 'approved',
        state: 'decided',
        decidedBy: 'owner',
        decidedAt: '2026-10-14T20:16:00.000Z',
        expiresAt: '2026-10-14T21:15:00.000Z',
      },
    ];
    const htmlViDecided = renderToStaticMarkup(
      React.createElement(
        UiLanguageProvider,
        { initialLang: 'vi' },
        React.createElement(ApprovalsSettingsCard, { initialApprovals: decidedSample }),
      ),
    );
    assert.ok(htmlViDecided.includes('bởi Chủ văn phòng'), 'decidedBy="owner" must be translated to "bởi Chủ văn phòng" in vi');
    assert.ok(htmlViDecided.includes('hiệu lực đến:'), 'ttlLabel must use "hiệu lực đến:" in vi');
    assert.ok(!htmlViDecided.includes('2026-10-14T21:15:00.000Z'), 'expiresAt must not render raw ISO string');

    // Verify 401 WWW-Authenticate header on decision route when Basic Auth is configured
    const prevUser = process.env.PHONGBAN_USER;
    const prevPass = process.env.PHONGBAN_PASS;
    process.env.PHONGBAN_USER = 'unit-user';
    process.env.PHONGBAN_PASS = 'unit-pass';
    try {
      const req = new NextRequest('http://127.0.0.1:4330/api/approvals/0000000000000000/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:4330' },
        body: JSON.stringify({ decision: 'approved' }),
      });
      const res = await postDecisionRoute(req, { params: Promise.resolve({ requestId: '0000000000000000' }) });
      assert.equal(res.status, 401);
      assert.equal(res.headers.get('www-authenticate'), 'Basic realm="aiboss-office"');
    } finally {
      if (prevUser === undefined) delete process.env.PHONGBAN_USER;
      else process.env.PHONGBAN_USER = prevUser;
      if (prevPass === undefined) delete process.env.PHONGBAN_PASS;
      else process.env.PHONGBAN_PASS = prevPass;
    }
  } finally {
    setCurrentUiLanguage('en');
  }
});

test('UI-2g Nit 2: setCurrentUiLanguage updates document.documentElement data-ui-lang and lang live when clientInitialized is active', () => {
  const prevDoc = globalThis.document;
  const attrs = new Map([[UI_LANGUAGE_DATA_ATTR, 'en']]);
  globalThis.document = {
    documentElement: {
      lang: 'en',
      getAttribute: (k) => attrs.get(k) ?? null,
      setAttribute: (k, v) => attrs.set(k, v),
    },
  };
  try {
    markClientInitialized();
    setCurrentUiLanguage('vi');
    assert.equal(globalThis.document.documentElement.getAttribute('data-ui-lang'), 'vi');
    assert.equal(globalThis.document.documentElement.lang, 'vi');

    setCurrentUiLanguage('en');
    assert.equal(globalThis.document.documentElement.getAttribute('data-ui-lang'), 'en');
    assert.equal(globalThis.document.documentElement.lang, 'en');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    setCurrentUiLanguage('en');
  }
});
