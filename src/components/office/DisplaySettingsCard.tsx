'use client';

import { useState, useEffect } from 'react';
import { TextAa, Check, Translate } from '@phosphor-icons/react';
import {
  TextSize,
  readTextSize,
  saveTextSize,
  applyTextSize,
  syncTextSizeOnStorageEvent,
  DEFAULT_TEXT_SIZE,
} from './text-size';
import { useT, type UiLanguage } from '@/i18n';

export interface DisplaySettingsCardProps {
  agentResponseLanguage?: string;
}

export function DisplaySettingsCard({
  agentResponseLanguage = 'auto',
}: DisplaySettingsCardProps) {
  const [size, setSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);
  const { lang, setLang, t } = useT();

  useEffect(() => {
    const initial = readTextSize();
    setSize(initial);
    applyTextSize(initial);

    const handleStorage = (e: StorageEvent) => {
      syncTextSizeOnStorageEvent(e, setSize);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleSizeChange = (newSize: TextSize) => {
    setSize(newSize);
    saveTextSize(newSize);
    applyTextSize(newSize);
  };

  const handleLanguageChange = (nextLang: UiLanguage) => {
    setLang(nextLang);
  };

  return (
    <section className="settings-card settings-card-wide display-settings-card">
      <div className="settings-card-header">
        <TextAa size={20} weight="bold" className="settings-card-icon" />
        <div>
          <h2>{t('settings.display.title')}</h2>
          <p className="settings-card-subtitle">{t('settings.display.subtitle')}</p>
        </div>
      </div>
      <div className="settings-card-body">
        <div className="settings-row text-size-row">
          <div>
            <span className="settings-label" style={{ fontWeight: 600, color: 'var(--kem)' }}>
              {t('settings.display.textSizeLabel')}
            </span>
            <div className="settings-dim" style={{ marginTop: 4 }}>
              {t('settings.display.savedOnDevice')}
            </div>
          </div>
          <div
            className="text-size-options"
            role="radiogroup"
            aria-label={t('settings.display.textSizeAria')}
          >
            <button
              type="button"
              className={`text-size-btn ${size === 'large' ? 'active' : ''}`}
              onClick={() => handleSizeChange('large')}
              aria-checked={size === 'large'}
              role="radio"
            >
              {size === 'large' && <Check size={14} weight="bold" className="text-size-check" />}
              <span>{t('settings.display.sizeLarge')}</span>
            </button>
            <button
              type="button"
              className={`text-size-btn ${size === 'medium' ? 'active' : ''}`}
              onClick={() => handleSizeChange('medium')}
              aria-checked={size === 'medium'}
              role="radio"
            >
              {size === 'medium' && <Check size={14} weight="bold" className="text-size-check" />}
              <span>{t('settings.display.sizeMedium')}</span>
            </button>
          </div>
        </div>

        <div className="settings-row text-size-row ui-language-row">
          <div style={{ maxWidth: 520 }}>
            <span
              className="settings-label"
              style={{
                fontWeight: 600,
                color: 'var(--kem)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Translate size={16} weight="bold" style={{ color: 'var(--vang)' }} />
              {t('settings.display.interfaceLanguageLabel')}
            </span>
            <div className="settings-dim" style={{ marginTop: 4 }}>
              {t('settings.display.interfaceLanguageHint')}
            </div>
          </div>
          <div
            className="text-size-options ui-language-options"
            role="radiogroup"
            aria-label={t('settings.display.interfaceLanguageAria')}
          >
            <button
              type="button"
              data-testid="ui-lang-btn-en"
              className={`text-size-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => handleLanguageChange('en')}
              aria-checked={lang === 'en'}
              role="radio"
            >
              {lang === 'en' && <Check size={14} weight="bold" className="text-size-check" />}
              <span>{t('settings.display.langEnglish')}</span>
            </button>
            <button
              type="button"
              data-testid="ui-lang-btn-vi"
              className={`text-size-btn ${lang === 'vi' ? 'active' : ''}`}
              onClick={() => handleLanguageChange('vi')}
              aria-checked={lang === 'vi'}
              role="radio"
            >
              {lang === 'vi' && <Check size={14} weight="bold" className="text-size-check" />}
              <span>{t('settings.display.langVietnamese')}</span>
            </button>
          </div>
        </div>

        <div className="settings-row text-size-row agent-language-summary-row">
          <div style={{ maxWidth: 520 }}>
            <span className="settings-label" style={{ fontWeight: 600, color: 'var(--kem)' }}>
              {t('settings.display.agentResponseLanguageLabel')}
            </span>
            <div className="settings-dim" style={{ marginTop: 4, lineHeight: 1.45 }}>
              {t('settings.display.agentResponseLanguageHint')}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="settings-badge settings-badge-gold">{agentResponseLanguage}</span>
            <code className="settings-code">config/office.json</code>
          </div>
        </div>
      </div>
    </section>
  );
}
