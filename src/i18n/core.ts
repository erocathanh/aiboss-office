import { en } from './en.ts';
import { vi } from './vi.ts';

export type TranslationSchema = Record<string, unknown>;
export type UiLanguage = 'en' | 'vi';
export type DefaultUiLanguageMode = 'system' | 'en' | 'vi';

export const UI_LANGUAGE_STORAGE_KEY = 'aiboss-office.ui-language';
export const UI_LANGUAGE_COOKIE_KEY = 'aiboss-office.ui-language';
export const UI_LANGUAGE_DATA_ATTR = 'data-ui-lang';
export const UI_LANGUAGE_CHANGE_EVENT = 'aiboss-office:ui-language-change';

/**
 * Single constant governing default UI language behavior when localStorage/cookie has no saved preference.
 * - 'system': follows Accept-Language / navigator.language / Electron app.getLocale() ('vi*' -> 'vi', otherwise FALLBACK_UI_LANGUAGE)
 * - 'en' | 'vi': forces a fixed default language across the entire application
 */
export const DEFAULT_UI_LANGUAGE_MODE: DefaultUiLanguageMode = 'system';
export const FALLBACK_UI_LANGUAGE: UiLanguage = 'en';

export const dictionaries: Record<UiLanguage, TranslationSchema> = {
  en,
  vi,
};

export { en, vi };

let currentLanguageState: UiLanguage = FALLBACK_UI_LANGUAGE;
let clientInitialized = false;

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === 'en' || value === 'vi';
}

export function parseUiLanguageCookie(
  cookieHeaderOrValue?: string | null,
): UiLanguage | null {
  if (!cookieHeaderOrValue || typeof cookieHeaderOrValue !== 'string') {
    return null;
  }
  const trimmed = cookieHeaderOrValue.trim();
  if (isUiLanguage(trimmed)) {
    return trimmed;
  }
  const pairs = trimmed.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    if (name === UI_LANGUAGE_COOKIE_KEY) {
      try {
        const decoded = decodeURIComponent(val);
        if (isUiLanguage(decoded)) return decoded;
      } catch {
        if (isUiLanguage(val)) return val;
      }
    }
  }
  return null;
}

export function parseAcceptLanguagePrimaryLocale(
  acceptLanguage?: string | null,
): string {
  if (typeof acceptLanguage !== 'string' || !acceptLanguage.trim()) {
    return '';
  }
  const parts = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tagRaw, ...params] = part.trim().split(';');
      const tag = (tagRaw || '').trim();
      let q = 1.0;
      for (const p of params) {
        const [k, v] = p.trim().split('=');
        if (k?.trim().toLowerCase() === 'q' && v !== undefined) {
          const parsed = Number.parseFloat(v.trim());
          if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            q = parsed;
          }
        }
      }
      return { tag, q, index };
    })
    .filter((item) => item.tag.length > 0 && item.q > 0);
  if (parts.length === 0) return '';
  parts.sort((a, b) => (b.q !== a.q ? b.q - a.q : a.index - b.index));
  return parts[0].tag;
}

/**
 * Resolves the UI language on the server for SSR:
 * 1. Explicit cookie (`aiboss-office.ui-language` = 'en' | 'vi')
 * 2. Fixed mode override ('en' | 'vi') when DEFAULT_UI_LANGUAGE_MODE is not 'system'
 * 3. Request Accept-Language header ('vi*' -> 'vi', otherwise FALLBACK_UI_LANGUAGE)
 * 4. FALLBACK_UI_LANGUAGE ('en')
 */
export function resolveServerUiLanguage(options?: {
  cookieValue?: string | null;
  acceptLanguage?: string | null;
  modeOverride?: DefaultUiLanguageMode;
}): UiLanguage {
  const fromCookie = parseUiLanguageCookie(options?.cookieValue);
  if (fromCookie) {
    return fromCookie;
  }
  const mode = options?.modeOverride ?? DEFAULT_UI_LANGUAGE_MODE;
  if (mode === 'en' || mode === 'vi') {
    return mode;
  }
  const primaryLocale = parseAcceptLanguagePrimaryLocale(options?.acceptLanguage);
  if (primaryLocale.trim().toLowerCase().startsWith('vi')) {
    return 'vi';
  }
  return FALLBACK_UI_LANGUAGE;
}

/**
 * Resolves the default UI language when no preference is stored in localStorage.
 * Controlled by DEFAULT_UI_LANGUAGE_MODE so policy changes require editing only one constant.
 */
export function resolveSystemUiLanguage(
  rawLocale?: string | null,
  modeOverride: DefaultUiLanguageMode = DEFAULT_UI_LANGUAGE_MODE,
): UiLanguage {
  if (modeOverride === 'en' || modeOverride === 'vi') {
    return modeOverride;
  }
  const candidate =
    typeof rawLocale === 'string'
      ? rawLocale
      : typeof navigator !== 'undefined' && typeof navigator.language === 'string'
        ? navigator.language
        : '';
  if (candidate.trim().toLowerCase().startsWith('vi')) {
    return 'vi';
  }
  return FALLBACK_UI_LANGUAGE;
}

export function readUiLanguage(
  storage?: Pick<Storage, 'getItem'> | null,
  rawSystemLocale?: string | null,
  doc?: {
    documentElement?: {
      getAttribute?: (k: string) => string | null;
    };
  } | null,
): UiLanguage {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : typeof globalThis !== 'undefined' && 'localStorage' in globalThis
          ? (globalThis as unknown as { localStorage?: Pick<Storage, 'getItem'> }).localStorage ?? null
          : null;
  try {
    const raw = targetStorage?.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (isUiLanguage(raw)) return raw;
  } catch {
    // Ignore storage read errors in restricted environments
  }

  if (rawSystemLocale === undefined && DEFAULT_UI_LANGUAGE_MODE === 'system') {
    const targetDoc =
      doc !== undefined ? doc : typeof document !== 'undefined' ? document : null;
    const domAttr = targetDoc?.documentElement?.getAttribute?.(UI_LANGUAGE_DATA_ATTR);
    if (isUiLanguage(domAttr)) {
      return domAttr;
    }
  }

  return resolveSystemUiLanguage(rawSystemLocale);
}

export function saveUiLanguage(
  lang: UiLanguage,
  storage?: Pick<Storage, 'setItem'> | null,
  doc?: { cookie?: string } | null,
): UiLanguage {
  const normalized: UiLanguage = isUiLanguage(lang) ? lang : FALLBACK_UI_LANGUAGE;
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : typeof globalThis !== 'undefined' && 'localStorage' in globalThis
          ? (globalThis as unknown as { localStorage?: Pick<Storage, 'setItem'> }).localStorage ?? null
          : null;
  try {
    targetStorage?.setItem(UI_LANGUAGE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage write errors in restricted environments
  }

  const targetDoc =
    doc !== undefined ? doc : typeof document !== 'undefined' ? document : null;
  if (targetDoc && 'cookie' in targetDoc) {
    try {
      targetDoc.cookie = `${UI_LANGUAGE_COOKIE_KEY}=${normalized}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      // Ignore cookie write errors in restricted environments
    }
  }
  return normalized;
}

export function notifyDesktopLanguage(lang: UiLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    const bridge = (window as unknown as {
      aibossDesktop?: { setLanguage?: (language: UiLanguage) => unknown };
    }).aibossDesktop;
    if (bridge && typeof bridge.setLanguage === 'function') {
      void bridge.setLanguage(lang);
    }
  } catch {
    // Ignore Electron bridge errors on web
  }
}

export function applyUiLanguage(
  lang: UiLanguage,
  doc?: {
    documentElement?: {
      setAttribute?: (k: string, v: string) => void;
      lang?: string;
    };
  } | null,
): UiLanguage {
  const normalized: UiLanguage = isUiLanguage(lang) ? lang : FALLBACK_UI_LANGUAGE;
  currentLanguageState = normalized;

  const targetDoc =
    doc !== undefined ? doc : typeof document !== 'undefined' ? document : null;
  if (targetDoc?.documentElement) {
    targetDoc.documentElement.setAttribute?.(UI_LANGUAGE_DATA_ATTR, normalized);
    targetDoc.documentElement.lang = normalized;
  }
  if (targetDoc && 'title' in targetDoc) {
    const winTitle = lookupTranslationKey(
      dictionaries[normalized] as unknown as Record<string, unknown>,
      'electron.windowTitle',
    );
    if (typeof winTitle === 'string') {
      (targetDoc as { title?: string }).title = winTitle;
    }
  }

  if (doc === undefined && typeof window !== 'undefined') {
    notifyDesktopLanguage(normalized);
    try {
      window.dispatchEvent(
        new CustomEvent(UI_LANGUAGE_CHANGE_EVENT, { detail: { lang: normalized } }),
      );
    } catch {
      // Ignore event dispatch errors in non-DOM test environments
    }
  }

  return normalized;
}

export function shouldSyncUiLanguageStorageKey(
  key: string | null | undefined,
): boolean {
  return key === UI_LANGUAGE_STORAGE_KEY || key === null;
}

export function syncUiLanguageOnStorageEvent(
  event: { key?: string | null; newValue?: string | null },
  doc?: {
    documentElement?: {
      setAttribute?: (k: string, v: string) => void;
      lang?: string;
    };
  } | null,
): UiLanguage | null {
  if (!shouldSyncUiLanguageStorageKey(event?.key)) {
    return null;
  }
  const next: UiLanguage = isUiLanguage(event?.newValue)
    ? event.newValue
    : readUiLanguage();
  return applyUiLanguage(next, doc);
}

export function getCurrentUiLanguage(): UiLanguage {
  if (typeof window !== 'undefined' && !clientInitialized) {
    clientInitialized = true;
    const domAttr =
      typeof document !== 'undefined'
        ? document.documentElement?.getAttribute?.(UI_LANGUAGE_DATA_ATTR)
        : null;
    if (isUiLanguage(domAttr)) {
      currentLanguageState = domAttr;
    } else {
      currentLanguageState = readUiLanguage();
    }
  }
  return currentLanguageState;
}

export function markClientInitialized(): void {
  clientInitialized = true;
}

export function setCurrentUiLanguage(lang: UiLanguage): UiLanguage {
  const normalized: UiLanguage = isUiLanguage(lang) ? lang : FALLBACK_UI_LANGUAGE;
  currentLanguageState = normalized;
  return normalized;
}

export function lookupTranslationKey(
  dict: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!key || typeof key !== 'string') return undefined;
  const parts = key.split('.');
  let cursor: unknown = dict;
  for (const part of parts) {
    if (cursor && typeof cursor === 'object' && part in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

export function interpolateTranslation(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token: string) => {
    if (Object.prototype.hasOwnProperty.call(params, token)) {
      const val = params[token];
      return val === undefined || val === null ? '' : String(val);
    }
    return match;
  });
}

/**
 * Translates a dot-separated key using the active (or overridden) UI language.
 * Missing keys log a console.warn and return the raw key string so rendering never crashes.
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
  langOverride?: UiLanguage,
): string {
  const activeLang: UiLanguage = isUiLanguage(langOverride)
    ? langOverride
    : getCurrentUiLanguage();
  const primaryDict = dictionaries[activeLang] as unknown as Record<string, unknown>;
  const found = lookupTranslationKey(primaryDict, key);
  if (typeof found === 'string') {
    return interpolateTranslation(found, params);
  }
  console.warn(`[i18n] Missing translation key: "${key}" (lang="${activeLang}")`);
  return key;
}

/**
 * Formats an ISO timestamp into a readable date/time string in the current UI language.
 * When `mounted` is false (during SSR / initial hydration), uses UTC deterministically
 * so server and client markup match without React #418 hydration warnings.
 */
export function formatLocalTimestamp(
  iso: string,
  lang: UiLanguage = currentLanguageState,
  mounted = true,
): string {
  if (!iso || typeof iso !== 'string') return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const locale = lang === 'vi' ? 'vi-VN' : 'en-GB';
    const opts: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(mounted ? {} : { timeZone: 'UTC' }),
    };
    return d.toLocaleString(locale, opts);
  } catch {
    return iso;
  }
}
