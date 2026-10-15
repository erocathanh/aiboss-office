import fs from 'node:fs';
import path from 'node:path';
import { CostSettingsCard } from '@/components/office/CostSettingsCard';
import {
  ApprovalsSettingsCard,
  type ApprovalLoadErrorCode,
} from '@/components/office/ApprovalsSettingsCard';
import {
  ApprovalIoError,
  ApprovalLedgerUnreadableError,
  ApprovalLockTimeoutError,
  getApprovals,
  type ApprovalItem,
} from '@/lib/approvals-ledger';
import { getAgentLanguage } from '@/lib/office-config';
import { SettingsPageClient, type OfficeConfigData } from './SettingsPageClient';

export const dynamic = 'force-dynamic';

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
  let initialApprovals: ApprovalItem[] | undefined = undefined;
  let initialApprovalsError: ApprovalLoadErrorCode | null = null;
  try {
    initialApprovals = getApprovals({ limit: 50 }).approvals;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (err instanceof ApprovalLockTimeoutError || code === 'lock_timeout') {
      initialApprovalsError = 'lock_timeout';
    } else if (
      err instanceof ApprovalLedgerUnreadableError ||
      code === 'ledger_unreadable'
    ) {
      initialApprovalsError = 'ledger_unreadable';
    } else if (err instanceof ApprovalIoError || code === 'io_error') {
      initialApprovalsError = 'io_error';
    } else {
      initialApprovalsError = 'io_error';
    }
  }

  return (
    <SettingsPageClient
      config={config}
      effectiveLanguage={effectiveLanguage}
      gates={gates}
      approvalsCardSlot={
        <ApprovalsSettingsCard
          initialApprovals={initialApprovals}
          initialError={initialApprovalsError}
        />
      }
      costCardSlot={<CostSettingsCard />}
    />
  );
}
