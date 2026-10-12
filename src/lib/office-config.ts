import officeConfigRaw from '../../config/office.json';

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
  last_edited: {
    at: string;
    by: string;
  };
}

export const OFFICE_CONFIG: OfficeConfig = officeConfigRaw as OfficeConfig;

export function getOfficeConfig(): OfficeConfig {
  return OFFICE_CONFIG;
}
