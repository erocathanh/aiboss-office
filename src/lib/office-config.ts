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

/**
 * Checks if a value is a valid unsigned integer string representing nanodollars.
 * Must be a non-empty string consisting only of ASCII digits, without negative sign or decimals.
 */
export function isValidNanodollarsString(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  return /^(0|[1-9][0-9]*)$/.test(val.trim());
}

/**
 * Validates a daily cap value.
 * Returns:
 * - null if explicitly null or undefined (unlimited cap)
 * - string if valid unsigned integer string
 * - undefined if invalid / garbage (distinguishing valid null from invalid junk)
 */
export function validateDailyCap(val: unknown): string | null | undefined {
  if (val === null || val === undefined) return null;
  if (isValidNanodollarsString(val)) return val.trim();
  return undefined; // Invalid garbage
}

/**
 * Validates a default run estimate value.
 * Returns string if valid unsigned integer string, or undefined if invalid.
 */
export function validateRunEstimate(val: unknown): string | undefined {
  if (isValidNanodollarsString(val)) return val.trim();
  return undefined;
}

/**
 * Sanitize and validate raw budget config from JSON.
 * Ensures numbers are valid nanodollars strings and distinguishes null (unlimited) from invalid garbage.
 */
export function sanitizeBudgetConfig(raw?: unknown): OfficeBudgetConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;

  const defaultEstimate = validateRunEstimate(b.defaultRunEstimateNanodollars) ?? '700000000';

  const officeRaw = (b.office && typeof b.office === 'object' ? b.office : {}) as Record<string, unknown>;
  const officeCap = validateDailyCap(officeRaw.dailyCapNanodollars);
  const officeConfig = {
    dailyCapNanodollars: officeCap === undefined ? null : officeCap,
    hardStop: typeof officeRaw.hardStop === 'boolean' ? officeRaw.hardStop : true,
  };

  const seats: Record<string, SeatBudgetConfig> = {};
  if (b.seats && typeof b.seats === 'object') {
    for (const [seatSlug, seatRaw] of Object.entries(b.seats as Record<string, unknown>)) {
      if (seatRaw && typeof seatRaw === 'object') {
        const s = seatRaw as Record<string, unknown>;
        const seatCap = validateDailyCap(s.dailyCapNanodollars);
        seats[seatSlug] = {
          dailyCapNanodollars: seatCap === undefined ? null : seatCap,
          hardStop: typeof s.hardStop === 'boolean' ? s.hardStop : true,
        };
      }
    }
  }

  return {
    currency: typeof b.currency === 'string' && b.currency ? b.currency : 'USD',
    defaultRunEstimateNanodollars: defaultEstimate,
    office: officeConfig,
    seats,
  };
}

export const OFFICE_CONFIG: OfficeConfig = {
  ...(officeConfigRaw as OfficeConfig),
  budget: sanitizeBudgetConfig((officeConfigRaw as Record<string, unknown>).budget),
};

export function getOfficeConfigPath(): string {
  if (process.env.AIBOSS_OFFICE_CONFIG_PATH) {
    return process.env.AIBOSS_OFFICE_CONFIG_PATH;
  }
  if (process.env.AIBOSS_CONFIG_DIR) {
    return path.join(process.env.AIBOSS_CONFIG_DIR, 'office.json');
  }
  return path.join(process.cwd(), 'config', 'office.json');
}

export function getOfficeConfig(): OfficeConfig {
  try {
    const configPath = getOfficeConfigPath();
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        return {
          ...parsed,
          budget: sanitizeBudgetConfig(parsed.budget),
        } as OfficeConfig;
      }
    }
  } catch {
    /* fallback */
  }
  return OFFICE_CONFIG;
}
