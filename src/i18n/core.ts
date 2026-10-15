import { en } from './en.ts';
import { vi } from './vi.ts';

export type TranslationSchema = Record<string, unknown>;
export type UiLanguage = 'en' | 'vi';
export type DefaultUiLanguageMode = 'system' | 'en' | 'vi';

export const UI_LANGUAGE_STORAGE_KEY = 'aiboss-office.ui-language';
export const UI_LANGUAGE_DATA_ATTR = 'data-ui-lang';
export const UI_LANGUAGE_CHANGE_EVENT = 'aiboss-office:ui-language-change';

/**
 * Single constant governing default UI language behavior when localStorage has no saved preference.
 * - 'system': follows navigator.language / Electron app.getLocale() ('vi*' -> 'vi', otherwise FALLBACK_UI_LANGUAGE)
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
  return resolveSystemUiLanguage(rawSystemLocale);
}

export function saveUiLanguage(
  lang: UiLanguage,
  storage?: Pick<Storage, 'setItem'> | null,
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
