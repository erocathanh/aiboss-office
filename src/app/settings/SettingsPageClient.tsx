'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Shield,
  Timer,
  Info,
  Lock,
} from '@phosphor-icons/react';
import { DisplaySettingsCard } from '@/components/office/DisplaySettingsCard';
import { DesktopSettingsCard } from '@/components/office/DesktopSettingsCard';
import { BudgetSettingsCard } from '@/components/office/BudgetSettingsCard';
import { useT, formatLocalTimestamp } from '@/i18n';

export interface OfficeConfigData {
  version: number;
  timezone: string;
  timezone_label: string;
  working_hours: {
    start: string;
    end: string;
    days: number[];
  };
  ui_language: string;
  language?: string;
  progress_marks: number[];
  response_time_working_hours: {
    incident: number;
    routine: number;
  };
  last_edited: {
    at: string;
    by: string;
  };
}

export interface SettingsPageClientProps {
  config: OfficeConfigData;
  effectiveLanguage: string;
  gates: string[];
  approvalsCardSlot?: React.ReactNode;
  costCardSlot: React.ReactNode;
}

const KNOWN_GATE_IDS = new Set([
  'ads-account-write',
  'customer-message',
  'publish',
  'delete',
  'customer-page-deploy',
  'crm-bulk-or-edit',
]);

export function SettingsPageClient({
  config,
  effectiveLanguage,
  gates,
  approvalsCardSlot,
  costCardSlot,
}: SettingsPageClientProps) {
  const { lang, t } = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const agentLanguageLabel =
    effectiveLanguage === 'vi'
      ? `(${t('settings.display.agentLangVietnamese')})`
      : effectiveLanguage === 'en'
      ? `(${t('settings.display.agentLangEnglish')})`
      : `(${t('settings.display.agentLangAuto')})`;

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="settings-header-left">
          <Link
            href="/"
            className="settings-back-btn"
            title={t('settings.header.backToOffice')}
          >
            <ArrowLeft size={16} weight="bold" />
            <span>{t('settings.header.backToOffice')}</span>
          </Link>
          <div className="settings-title-group">
            <h1 className="settings-title">{t('settings.header.title')}</h1>
            <span className="settings-subtitle">{t('settings.header.subtitle')}</span>
          </div>
        </div>
        <div className="settings-header-right">
          <span className="settings-badge-readonly">{t('settings.header.badgeReadonly')}</span>
        </div>
      </header>

      <main className="settings-content">
        <div className="settings-banner">
          <Info size={18} weight="bold" className="settings-banner-icon" />
          <div className="settings-banner-text">
            <strong>{t('settings.banner.title')}</strong>
            <span>
              {t('settings.banner.descriptionPrefix')} <code>config/office.json</code>{' '}
              {t('settings.banner.descriptionSuffix')}
            </span>
          </div>
        </div>

        <div className="settings-grid">
          {/* Card: Approvals Ledger & State Machine (A-4) */}
          {approvalsCardSlot}

          {/* Card 1: Display & Typography (Client Preferences) */}
          <DisplaySettingsCard agentResponseLanguage={effectiveLanguage} />

          {/* Card: Desktop Shell (Read-only System Indicator) */}
          <DesktopSettingsCard />

          {/* Card: Cost Today / This Month Per Seat (A-2) */}
          {costCardSlot}

          {/* Card: Budget Today (A-3) */}
          <BudgetSettingsCard />

          {/* Card 2: Office Schedule & Timezone */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Clock size={20} weight="bold" className="settings-card-icon" />
              <h2>{t('settings.schedule.title')}</h2>
            </div>
            <div className="settings-card-body">
              <div className="settings-row">
                <span className="settings-label">{t('settings.schedule.officeTimezone')}</span>
                <span className="settings-value">
                  <code>{config.timezone}</code>
                  <span className="settings-tag">{config.timezone_label}</span>
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">{t('settings.schedule.workingHours')}</span>
                <span className="settings-value">
                  {config.working_hours.start} – {config.working_hours.end}
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">{t('settings.schedule.workingDays')}</span>
                <span className="settings-value">
                  {t('settings.schedule.monFri')}{' '}
                  <span className="settings-dim">{t('settings.schedule.days1To5')}</span>
                </span>
              </div>
              <div className="settings-row settings-row-ui-language">
                <span className="settings-label">{t('settings.schedule.uiLanguageConfig')}</span>
                <span className="settings-value">
                  <code>{lang}</code>{' '}
                  {lang === 'vi'
                    ? `(${t('settings.display.langVietnamese')})`
                    : `(${t('settings.display.langEnglish')})`}
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">
                  {t('settings.schedule.agentResponseLanguage')}
                </span>
                <span className="settings-value">
                  <code>{effectiveLanguage}</code> {agentLanguageLabel}
                </span>
              </div>
            </div>
          </section>

          {/* Card 2: Operating Rhythm & SLA */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Timer size={20} weight="bold" className="settings-card-icon" />
              <h2>{t('settings.rhythm.title')}</h2>
            </div>
            <div className="settings-card-body">
              <div className="settings-row">
                <span className="settings-label">{t('settings.rhythm.progressMarks')}</span>
                <div className="settings-marks-list">
                  {config.progress_marks.map((h) => (
                    <span key={h} className="settings-mark-chip">
                      {h}:00
                    </span>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <span className="settings-label">{t('settings.rhythm.responseTimeIncident')}</span>
                <span className="settings-value highlight-gold">
                  {config.response_time_working_hours.incident}h
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">{t('settings.rhythm.responseTimeRoutine')}</span>
                <span className="settings-value highlight-gold">
                  {config.response_time_working_hours.routine}h
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">{t('settings.rhythm.lastEdited')}</span>
                <span className="settings-value settings-dim">
                  {formatLocalTimestamp(config.last_edited.at, lang, mounted)} {t('settings.rhythm.byAuthor')}{' '}
                  <code>{config.last_edited.by}</code>
                </span>
              </div>
            </div>
          </section>

          {/* Card 3: Human Approval Gates */}
          <section className="settings-card settings-card-wide">
            <div className="settings-card-header">
              <Shield size={20} weight="bold" className="settings-card-icon-red" />
              <div>
                <h2>{t('settings.gates.title', { count: gates.length })}</h2>
                <p className="settings-card-subtitle">{t('settings.gates.subtitle')}</p>
              </div>
            </div>
            <div className="settings-gates-grid">
              {gates.map((gateId) => {
                const isKnown = KNOWN_GATE_IDS.has(gateId);
                const label = isKnown
                  ? t(`settings.gates.items.${gateId}.label`)
                  : gateId;
                const desc = isKnown
                  ? t(`settings.gates.items.${gateId}.desc`)
                  : t('settings.gates.defaultDesc');
                return (
                  <div key={gateId} className="settings-gate-item">
                    <div className="settings-gate-title">
                      <Lock size={14} weight="bold" className="settings-gate-lock" />
                      <span className="settings-gate-label">{label}</span>
                      <code className="settings-gate-code">{gateId}</code>
                    </div>
                    <p className="settings-gate-desc">{desc}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
