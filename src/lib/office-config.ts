import fs from 'node:fs';
import path from 'node:path';
import officeConfigRaw from '../../config/office.json';

import { MAX_MONEY_UNITS } from './money';

export interface SeatBudgetConfig {
  dailyCapNanodollars: string | null;
  hardStop?: boolean;
  hasConfigError?: boolean;
  configError?: string;
}

export interface OfficeBudgetConfig {
  currency: string;
  defaultRunEstimateNanodollars: string;
  office: {
    dailyCapNanodollars: string | null;
    hardStop: boolean;
    hasConfigError?: boolean;
    configError?: string;
  };
  seats: Record<string, SeatBudgetConfig>;
  configErrors?: string[];
}

export interface OfficeApprovalsConfig {
  ttlMinutes: number;
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
  approvals?: OfficeApprovalsConfig;
  last_edited: {
    at: string;
    by: string;
  };
}

/**
 * Checks if a value is a valid unsigned integer string representing nanodollars.
 * Must be a non-empty string consisting only of ASCII digits, without negative sign or decimals,
 * and within MAX_MONEY_UNITS.
 */
export function isValidNanodollarsString(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  if (!/^(0|[1-9][0-9]*)$/.test(s)) return false;
  try {
    const b = BigInt(s);
    return b >= 0n && b <= MAX_MONEY_UNITS;
  } catch {
    return false;
  }
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
  if (isValidNanodollarsString(val)) return (val as string).trim();
  return undefined; // Invalid garbage or exceeds MAX_MONEY_UNITS
}

/**
 * Validates a default run estimate value.
 * Returns string if valid unsigned integer string, or undefined if invalid.
 */
export function validateRunEstimate(val: unknown): string | undefined {
  if (isValidNanodollarsString(val)) return (val as string).trim();
  return undefined;
}

/**
 * Sanitize and validate raw budget config from JSON.
 * Preserves validation errors so callers can fail closed instead of silently treating invalid caps as unlimited.
 */
export function sanitizeBudgetConfig(raw?: unknown): OfficeBudgetConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  const configErrors: string[] = [];

  let defaultEstimate = '700000000';
  if (b.defaultRunEstimateNanodollars !== undefined && b.defaultRunEstimateNanodollars !== null) {
    if (isValidNanodollarsString(b.defaultRunEstimateNanodollars)) {
      defaultEstimate = (b.defaultRunEstimateNanodollars as string).trim();
    } else {
      configErrors.push('Invalid defaultRunEstimateNanodollars: must be unsigned integer <= MAX_MONEY_UNITS');
    }
  }

  const officeRaw = (b.office && typeof b.office === 'object' ? b.office : {}) as Record<string, unknown>;
  let officeCap: string | null = null;
  let officeHasError = false;
  let officeError: string | undefined;

  if (officeRaw.dailyCapNanodollars !== undefined && officeRaw.dailyCapNanodollars !== null) {
    const validated = validateDailyCap(officeRaw.dailyCapNanodollars);
    if (validated !== undefined) {
      officeCap = validated;
    } else {
      officeHasError = true;
      officeError = 'Invalid office.dailyCapNanodollars: must be unsigned integer <= MAX_MONEY_UNITS';
      configErrors.push(officeError);
    }
  }

  const officeConfig = {
    dailyCapNanodollars: officeCap,
    hardStop: typeof officeRaw.hardStop === 'boolean' ? officeRaw.hardStop : true,
    ...(officeHasError ? { hasConfigError: true, configError: officeError } : {}),
  };

  const seats: Record<string, SeatBudgetConfig> = {};
  if (b.seats && typeof b.seats === 'object') {
    for (const [seatSlug, seatRaw] of Object.entries(b.seats as Record<string, unknown>)) {
      if (seatRaw && typeof seatRaw === 'object') {
        const s = seatRaw as Record<string, unknown>;
        let seatCap: string | null = null;
        let seatHasError = false;
        let seatError: string | undefined;

        if (s.dailyCapNanodollars !== undefined && s.dailyCapNanodollars !== null) {
          const validated = validateDailyCap(s.dailyCapNanodollars);
          if (validated !== undefined) {
            seatCap = validated;
          } else {
            seatHasError = true;
            seatError = `Invalid seats.${seatSlug}.dailyCapNanodollars: must be unsigned integer <= MAX_MONEY_UNITS`;
            configErrors.push(seatError);
          }
        }

        seats[seatSlug] = {
          dailyCapNanodollars: seatCap,
          hardStop: typeof s.hardStop === 'boolean' ? s.hardStop : true,
          ...(seatHasError ? { hasConfigError: true, configError: seatError } : {}),
        };
      }
    }
  }

  return {
    currency: typeof b.currency === 'string' && b.currency ? b.currency : 'USD',
    defaultRunEstimateNanodollars: defaultEstimate,
    office: officeConfig,
    seats,
    ...(configErrors.length > 0 ? { configErrors } : {}),
  };
}

export function sanitizeApprovalsConfig(raw?: unknown): OfficeApprovalsConfig {
  if (!raw || typeof raw !== 'object') {
    return { ttlMinutes: 60 };
  }
  const a = raw as Record<string, unknown>;
  const ttl = a.ttlMinutes;
  if (typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0) {
    return { ttlMinutes: ttl };
  }
  return { ttlMinutes: 60 };
}

export const OFFICE_CONFIG: OfficeConfig = {
  ...(officeConfigRaw as OfficeConfig),
  budget: sanitizeBudgetConfig((officeConfigRaw as Record<string, unknown>).budget),
  approvals: sanitizeApprovalsConfig((officeConfigRaw as Record<string, unknown>).approvals),
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
          approvals: sanitizeApprovalsConfig(parsed.approvals),
        } as OfficeConfig;
      }
    }
  } catch {
    /* fallback */
  }
  return OFFICE_CONFIG;
}
