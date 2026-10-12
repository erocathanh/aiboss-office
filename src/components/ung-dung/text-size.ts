/**
 * 🔠 Text size module for reading areas — unified English implementation with legacy compatibility.
 * Configured with key 'aiboss-office.text-size' per PM specification.
 */
import {
  TextSize,
  DEFAULT_TEXT_SIZE,
  TEXT_SIZE_STORAGE_KEY,
  isTextSize,
  readTextSize,
  saveTextSize,
  applyTextSize,
} from '@/components/office/text-size';

export type CoChu = 'trung' | 'lon';
export const CO_CHU_MAC_DINH: CoChu = 'trung';
export const KHOA_CO_CHU = TEXT_SIZE_STORAGE_KEY;

export function laCoChu(v: unknown): v is CoChu {
  return v === 'trung' || v === 'lon';
}

export function docCoChu(): CoChu {
  const size = readTextSize();
  return size === 'large' ? 'lon' : 'trung';
}

export function luuCoChu(m: CoChu): void {
  saveTextSize(m === 'lon' ? 'large' : 'medium');
}

export function apDungCoChu(m: CoChu): void {
  applyTextSize(m === 'lon' ? 'large' : 'medium');
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-co-chu', m);
  }
}

export {
  type TextSize,
  DEFAULT_TEXT_SIZE,
  TEXT_SIZE_STORAGE_KEY,
  isTextSize,
  readTextSize,
  saveTextSize,
  applyTextSize,
};
