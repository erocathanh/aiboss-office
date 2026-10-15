import fs from 'node:fs';
import path from 'node:path';
import { CostSettingsCard } from '@/components/office/CostSettingsCard';
import { getAgentLanguage } from '@/lib/office-config';
import { SettingsPageClient, type OfficeConfigData } from './SettingsPageClient';

interface DepartmentConfig {
  id: string;
  name: string;
  gates: string[];
}

function loadOfficeConfig(): OfficeConfigData {
  try {
    const configPath = path.join(process.cwd(), 'config', 'office.json');
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as OfficeConfigData;
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

export default function SettingsPage() {
  const config = loadOfficeConfig();
  const effectiveLanguage = getAgentLanguage(config);
  const gates = loadMarketingGates();

  return (
    <SettingsPageClient
      config={config}
      effectiveLanguage={effectiveLanguage}
      gates={gates}
      costCardSlot={<CostSettingsCard />}
    />
  );
}
