import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Shield,
  Timer,
  Info,
  Lock,
} from '@phosphor-icons/react/dist/ssr';
import { DisplaySettingsCard } from '@/components/office/DisplaySettingsCard';
import { DesktopSettingsCard } from '@/components/office/DesktopSettingsCard';
import { CostSettingsCard } from '@/components/office/CostSettingsCard';
import { BudgetSettingsCard } from '@/components/office/BudgetSettingsCard';

interface OfficeConfig {
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

interface DepartmentConfig {
  id: string;
  name: string;
  gates: string[];
}

function loadOfficeConfig(): OfficeConfig {
  try {
    const configPath = path.join(process.cwd(), 'config', 'office.json');
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as OfficeConfig;
  } catch (err) {
    console.error('Failed to read config/office.json', err);
    return {
      version: 1,
      timezone: 'Europe/London',
      timezone_label: 'London',
      working_hours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
      ui_language: 'en',
      language: 'auto',
      progress_marks: [7, 9, 11, 13, 15, 17, 19, 21],
      response_time_working_hours: { incident: 4, routine: 24 },
      last_edited: { at: '2026-10-12T10:19:00Z', by: 'setup' },
    };
  }
}

function loadMarketingGates(): string[] {
  try {
    const deptPath = path.join(process.cwd(), 'departments', 'marketing', 'department.json');
    const content = fs.readFileSync(deptPath, 'utf-8');
    const dept = JSON.parse(content) as DepartmentConfig;
    return dept.gates || [];
  } catch {
    return [
      'ads-account-write',
      'customer-message',
      'publish',
      'delete',
      'customer-page-deploy',
      'crm-bulk-or-edit',
    ];
  }
}

const GATE_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  'ads-account-write': {
    label: 'Ads Account Write',
    desc: 'Creating, updating campaigns, modifying budgets, or altering ad spend accounts.',
  },
  'customer-message': {
    label: 'Customer Message',
    desc: 'Direct outbound message delivery to real clients or external leads.',
  },
  'publish': {
    label: 'Publish Content',
    desc: 'Public deployment of content, social posts, media creatives, or articles.',
  },
  'delete': {
    label: 'Delete Operations',
    desc: 'Destructive deletion of data, contacts, campaigns, or system records.',
  },
  'customer-page-deploy': {
    label: 'Customer Page Deploy',
    desc: 'Deploying or updating public-facing landing pages and web assets.',
  },
  'crm-bulk-or-edit': {
    label: 'CRM Bulk / Edit',
    desc: 'Bulk modification, exporting, or schema editing of customer CRM records.',
  },
};

export default function SettingsPage() {
  const config = loadOfficeConfig();
  const gates = loadMarketingGates();

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="settings-header-left">
          <Link href="/" className="settings-back-btn" title="Back to Office">
            <ArrowLeft size={16} weight="bold" />
            <span>Back to Office</span>
          </Link>
          <div className="settings-title-group">
            <h1 className="settings-title">Office Settings</h1>
            <span className="settings-subtitle">Autonomous Workspace Configuration</span>
          </div>
        </div>
        <div className="settings-header-right">
          <span className="settings-badge-readonly">MVP — Read-only</span>
        </div>
      </header>

      <main className="settings-content">
        <div className="settings-banner">
          <Info size={18} weight="bold" className="settings-banner-icon" />
          <div className="settings-banner-text">
            <strong>Editing arrives in the next version.</strong>
            <span>
              All settings are currently read directly from <code>config/office.json</code> and department manifests.
            </span>
          </div>
        </div>

        <div className="settings-grid">
          {/* Card 1: Display & Typography (Client Preferences) */}
          <DisplaySettingsCard />

          {/* Card: Desktop Shell (Read-only System Indicator) */}
          <DesktopSettingsCard />

          {/* Card: Cost Today / This Month Per Seat (A-2) */}
          <CostSettingsCard />

          {/* Card: Budget Today (A-3) */}
          <BudgetSettingsCard />

          {/* Card 2: Office Schedule & Timezone */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Clock size={20} weight="bold" className="settings-card-icon" />
              <h2>Office Timezone & Schedule</h2>
            </div>
            <div className="settings-card-body">
              <div className="settings-row">
                <span className="settings-label">Office Timezone</span>
                <span className="settings-value">
                  <code>{config.timezone}</code>
                  <span className="settings-tag">{config.timezone_label}</span>
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Working Hours</span>
                <span className="settings-value">
                  {config.working_hours.start} – {config.working_hours.end}
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Working Days</span>
                <span className="settings-value">
                  Mon – Fri <span className="settings-dim">(Days 1–5)</span>
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">UI Language</span>
                <span className="settings-value">
                  <code>{config.ui_language}</code> (English)
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Agent Response Language</span>
                <span className="settings-value">
                  <code>{config.language ?? 'auto'}</code> ({config.language === 'vi' ? 'Vietnamese' : config.language === 'en' ? 'English' : 'Auto / Question language'})
                </span>
              </div>
            </div>
          </section>

          {/* Card 2: Operating Rhythm & SLA */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Timer size={20} weight="bold" className="settings-card-icon" />
              <h2>Operating Rhythm & SLA</h2>
            </div>
            <div className="settings-card-body">
              <div className="settings-row">
                <span className="settings-label">Progress Marks</span>
                <div className="settings-marks-list">
                  {config.progress_marks.map((h) => (
                    <span key={h} className="settings-mark-chip">
                      {h}:00
                    </span>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <span className="settings-label">Response Time (Incident)</span>
                <span className="settings-value highlight-gold">
                  {config.response_time_working_hours.incident}h
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Response Time (Routine)</span>
                <span className="settings-value highlight-gold">
                  {config.response_time_working_hours.routine}h
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Last Edited</span>
                <span className="settings-value settings-dim">
                  {config.last_edited.at} by <code>{config.last_edited.by}</code>
                </span>
              </div>
            </div>
          </section>

          {/* Card 3: Human Approval Gates */}
          <section className="settings-card settings-card-wide">
            <div className="settings-card-header">
              <Shield size={20} weight="bold" className="settings-card-icon-red" />
              <div>
                <h2>Human Approval Gates ({gates.length})</h2>
                <p className="settings-card-subtitle">
                  Autonomous agents pause execution and require explicit human sign-off before performing these actions.
                </p>
              </div>
            </div>
            <div className="settings-gates-grid">
              {gates.map((gateId) => {
                const info = GATE_DESCRIPTIONS[gateId] || {
                  label: gateId,
                  desc: 'Action requiring explicit human confirmation.',
                };
                return (
                  <div key={gateId} className="settings-gate-item">
                    <div className="settings-gate-title">
                      <Lock size={14} weight="bold" className="settings-gate-lock" />
                      <span className="settings-gate-label">{info.label}</span>
                      <code className="settings-gate-code">{gateId}</code>
                    </div>
                    <p className="settings-gate-desc">{info.desc}</p>
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
