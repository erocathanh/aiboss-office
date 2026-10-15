'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type UiLanguage,
  type DefaultUiLanguageMode,
  UI_LANGUAGE_STORAGE_KEY,
  UI_LANGUAGE_DATA_ATTR,
  UI_LANGUAGE_CHANGE_EVENT,
  DEFAULT_UI_LANGUAGE_MODE,
  FALLBACK_UI_LANGUAGE,
  dictionaries,
  en,
  vi,
  isUiLanguage,
  resolveSystemUiLanguage,
  readUiLanguage,
  saveUiLanguage,
  notifyDesktopLanguage,
  applyUiLanguage,
  shouldSyncUiLanguageStorageKey,
  syncUiLanguageOnStorageEvent,
  getCurrentUiLanguage,
  markClientInitialized,
  setCurrentUiLanguage,
  lookupTranslationKey,
  interpolateTranslation,
  t,
} from './core.ts';

export {
  type UiLanguage,
  type DefaultUiLanguageMode,
  UI_LANGUAGE_STORAGE_KEY,
  UI_LANGUAGE_DATA_ATTR,
  UI_LANGUAGE_CHANGE_EVENT,
  DEFAULT_UI_LANGUAGE_MODE,
  FALLBACK_UI_LANGUAGE,
  dictionaries,
  en,
  vi,
  isUiLanguage,
  resolveSystemUiLanguage,
  readUiLanguage,
  saveUiLanguage,
  notifyDesktopLanguage,
  applyUiLanguage,
  shouldSyncUiLanguageStorageKey,
  syncUiLanguageOnStorageEvent,
  getCurrentUiLanguage,
  setCurrentUiLanguage,
  lookupTranslationKey,
  interpolateTranslation,
  t,
};

export function useT(): {
  lang: UiLanguage;
  setLang: (next: UiLanguage) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
} {
  const [lang, setLangState] = useState<UiLanguage>(() => getCurrentUiLanguage());

  useEffect(() => {
    const resolved = readUiLanguage();
    markClientInitialized();
    if (resolved !== getCurrentUiLanguage()) {
      applyUiLanguage(resolved);
    } else {
      applyUiLanguage(resolved);
    }
    setLangState(resolved);

    const onCustomChange = (event: Event) => {
      const custom = event as CustomEvent<{ lang?: UiLanguage }>;
      const next = isUiLanguage(custom.detail?.lang)
        ? custom.detail.lang
        : readUiLanguage();
      setLangState(next);
    };

    const onStorage = (event: StorageEvent) => {
      const synced = syncUiLanguageOnStorageEvent(event);
      if (synced) {
        setLangState(synced);
      }
    };

    window.addEventListener(UI_LANGUAGE_CHANGE_EVENT, onCustomChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(UI_LANGUAGE_CHANGE_EVENT, onCustomChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setLang = useCallback((next: UiLanguage) => {
    const saved = saveUiLanguage(next);
    const applied = applyUiLanguage(saved);
    setLangState(applied);
  }, []);

  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return t(key, params, lang);
    },
    [lang],
  );

  return { lang, setLang, t: translate };
}
