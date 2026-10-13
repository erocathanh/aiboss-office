import fs from 'node:fs';
import path from 'node:path';
import officeConfigRaw from '../../config/office.json';

export interface SeatBudgetConfig {
  dailyCapNanodollars: string | null;
  hardStop?: boolean;
}

export interface OfficeBudgetConfig {
  currency: string;
  defaultRunEstimateNanodollars: string;
  office: {
    dailyCapNanodollars: string | null;
    hardStop: boolean;
  };
  seats: Record<string, SeatBudgetConfig>;
}

export interface OfficeConfig {
  version: number;
  timezone: string;
  timezone_label: string;
  working_hours: {
    start: string;
    end: string;
    days: number[];
  };
  ui_language: string;
  progress_marks: number[];
  response_time_working_hours: {
    incident: number;
    routine: number;
  };
  budget?: OfficeBudgetConfig;
  last_edited: {
    at: string;
    by: string;
  };
}

export const OFFICE_CONFIG: OfficeConfig = officeConfigRaw as OfficeConfig;

export function getOfficeConfig(): OfficeConfig {
  try {
    const configPath = path.join(process.cwd(), 'config', 'office.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OfficeConfig;
    }
  } catch {
    /* fallback */
  }
  return OFFICE_CONFIG;
}

