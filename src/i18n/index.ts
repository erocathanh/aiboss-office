'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  type UiLanguage,
  type DefaultUiLanguageMode,
  UI_LANGUAGE_STORAGE_KEY,
  UI_LANGUAGE_COOKIE_KEY,
  UI_LANGUAGE_DATA_ATTR,
  UI_LANGUAGE_CHANGE_EVENT,
  DEFAULT_UI_LANGUAGE_MODE,
  FALLBACK_UI_LANGUAGE,
  dictionaries,
  en,
  vi,
  isUiLanguage,
  parseUiLanguageCookie,
  parseAcceptLanguagePrimaryLocale,
  resolveServerUiLanguage,
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
  formatLocalTimestamp,
} from './core.ts';

export {
  type UiLanguage,
  type DefaultUiLanguageMode,
  UI_LANGUAGE_STORAGE_KEY,
  UI_LANGUAGE_COOKIE_KEY,
  UI_LANGUAGE_DATA_ATTR,
  UI_LANGUAGE_CHANGE_EVENT,
  DEFAULT_UI_LANGUAGE_MODE,
  FALLBACK_UI_LANGUAGE,
  dictionaries,
  en,
  vi,
  isUiLanguage,
  parseUiLanguageCookie,
  parseAcceptLanguagePrimaryLocale,
  resolveServerUiLanguage,
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
  formatLocalTimestamp,
};

const UiLanguageContext = createContext<UiLanguage | null>(null);

export function UiLanguageProvider({
  initialLang,
  children,
}: {
  initialLang: UiLanguage;
  children: React.ReactNode;
}) {
  const normalizedInitial: UiLanguage = isUiLanguage(initialLang)
    ? initialLang
    : FALLBACK_UI_LANGUAGE;
  const [lang, setLangState] = useState<UiLanguage>(normalizedInitial);

  setCurrentUiLanguage(lang);

  useEffect(() => {
    markClientInitialized();
    const resolved = readUiLanguage();
    try {
      const rawStored = window.localStorage?.getItem(UI_LANGUAGE_STORAGE_KEY);
      if (isUiLanguage(rawStored)) {
        saveUiLanguage(rawStored);
      }
    } catch {
      // Ignore storage read errors
    }
    applyUiLanguage(resolved);
    setLangState(resolved);

    const onCustomChange = (event: Event) => {
      const custom = event as CustomEvent<{ lang?: UiLanguage }>;
      const next = isUiLanguage(custom.detail?.lang)
        ? custom.detail.lang
        : readUiLanguage();
      setCurrentUiLanguage(next);
      if (typeof document !== 'undefined' && document.documentElement) {
        if (document.documentElement.getAttribute(UI_LANGUAGE_DATA_ATTR) !== next) {
          document.documentElement.setAttribute(UI_LANGUAGE_DATA_ATTR, next);
        }
        if (document.documentElement.lang !== next) {
          document.documentElement.lang = next;
        }
      }
      setLangState(next);
    };

    const onStorage = (event: StorageEvent) => {
      const synced = syncUiLanguageOnStorageEvent(event);
      if (synced) {
        setLangState(synced);
      }
    };

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
      observer = new MutationObserver(() => {
        const active = getCurrentUiLanguage();
        const el = document.documentElement;
        if (!el) return;
        if (el.getAttribute(UI_LANGUAGE_DATA_ATTR) !== active) {
          el.setAttribute(UI_LANGUAGE_DATA_ATTR, active);
        }
        if (el.lang !== active) {
          el.lang = active;
        }
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [UI_LANGUAGE_DATA_ATTR, 'lang'],
      });
    }

    window.addEventListener(UI_LANGUAGE_CHANGE_EVENT, onCustomChange);
    window.addEventListener('storage', onStorage);
    return () => {
      observer?.disconnect();
      window.removeEventListener(UI_LANGUAGE_CHANGE_EVENT, onCustomChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    setCurrentUiLanguage(lang);
    if (typeof document !== 'undefined' && document.documentElement) {
      if (document.documentElement.getAttribute(UI_LANGUAGE_DATA_ATTR) !== lang) {
        document.documentElement.setAttribute(UI_LANGUAGE_DATA_ATTR, lang);
      }
      if (document.documentElement.lang !== lang) {
        document.documentElement.lang = lang;
      }
    }
  }, [lang]);

  return React.createElement(UiLanguageContext.Provider, { value: lang }, children);
}

export function useT(): {
  lang: UiLanguage;
  setLang: (next: UiLanguage) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
} {
  const contextLang = useContext(UiLanguageContext);
  const [localLang, setLocalLangState] = useState<UiLanguage>(() =>
    contextLang ?? getCurrentUiLanguage(),
  );
  const activeLang: UiLanguage = contextLang ?? localLang;

  useEffect(() => {
    if (contextLang !== null) return;
    const resolved = readUiLanguage();
    markClientInitialized();
    applyUiLanguage(resolved);
    setLocalLangState(resolved);

    const onCustomChange = (event: Event) => {
      const custom = event as CustomEvent<{ lang?: UiLanguage }>;
      const next = isUiLanguage(custom.detail?.lang)
        ? custom.detail.lang
        : readUiLanguage();
      setLocalLangState(next);
    };

    const onStorage = (event: StorageEvent) => {
      const synced = syncUiLanguageOnStorageEvent(event);
      if (synced) {
        setLocalLangState(synced);
      }
    };

    window.addEventListener(UI_LANGUAGE_CHANGE_EVENT, onCustomChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(UI_LANGUAGE_CHANGE_EVENT, onCustomChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [contextLang]);

  const setLang = useCallback((next: UiLanguage) => {
    const saved = saveUiLanguage(next);
    const applied = applyUiLanguage(saved);
    setLocalLangState(applied);
  }, []);

  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return t(key, params, activeLang);
    },
    [activeLang],
  );

  return { lang: activeLang, setLang, t: translate };
}
