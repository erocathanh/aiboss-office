/**
 * Text size scaling for reading areas — two levels, remembered per device.
 * Level is set on <html> via 'data-text-size' attribute.
 * CSS reads this attribute to scale reading typography with --text-scale / --ti-le-chu.
 */
export type TextSize = 'medium' | 'large';

export const DEFAULT_TEXT_SIZE: TextSize = 'large';
export const TEXT_SIZE_STORAGE_KEY = 'aiboss-office.text-size';

export function isTextSize(v: unknown): v is TextSize {
  return v === 'medium' || v === 'large';
}

export function readTextSize(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    return isTextSize(v) ? v : DEFAULT_TEXT_SIZE;
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}

export function saveTextSize(size: TextSize): void {
  try {
    localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    /* private browsing fallback */
  }
}

export function applyTextSize(size: TextSize): void {
  if (typeof document === 'undefined') return;
  const normalized: TextSize = isTextSize(size) ? size : DEFAULT_TEXT_SIZE;
  document.documentElement.setAttribute('data-text-size', normalized);
  document.documentElement.setAttribute('data-co-chu', normalized === 'large' ? 'lon' : 'vua');
}

export function shouldSyncTextSizeStorageKey(key: string | null): boolean {
  return key === null || key === TEXT_SIZE_STORAGE_KEY;
}

export function syncTextSizeOnStorageEvent(
  event: { key: string | null },
  onSync?: (size: TextSize) => void
): TextSize | null {
  if (!shouldSyncTextSizeStorageKey(event.key)) return null;
  const next = readTextSize();
  applyTextSize(next);
  if (onSync) onSync(next);
  return next;
}

