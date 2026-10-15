/**
 * Pure utility functions for the Claude-mobile-style chat composer (UI-3):
 * 1. Auto-height calculation up to 10 lines based on computed line-height + vertical padding.
 * 2. Cursor-aware text insertion for Web Speech API transcripts (start, middle, end, selection).
 * 3. Runtime support detection for Web Speech API (excluding Electron shell without speech backend).
 */

export interface ComposerMetricsInput {
  scrollHeight?: number;
  lineCount?: number;
  lineHeightPx?: number;
  fontSizePx?: number;
  paddingTopPx?: number;
  paddingBottomPx?: number;
  borderTopPx?: number;
  borderBottomPx?: number;
  maxLines?: number;
}

export interface ComposerMetricsResult {
  heightPx: number;
  minHeightPx: number;
  maxHeightPx: number;
  lineHeightPx: number;
  verticalPaddingPx: number;
  overflowY: 'hidden' | 'auto';
  isCapped: boolean;
}

export function resolveEffectiveLineHeight(
  lineHeightPx?: number,
  fontSizePx: number = 16,
): number {
  const safeFont = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 16;
  if (typeof lineHeightPx === 'number' && Number.isFinite(lineHeightPx) && lineHeightPx > 0) {
    return lineHeightPx;
  }
  return safeFont * 1.4;
}

export function computeComposerMetrics(input: ComposerMetricsInput): ComposerMetricsResult {
  const maxLines =
    typeof input.maxLines === 'number' && input.maxLines > 0 ? input.maxLines : 10;
  const lineHeightPx = resolveEffectiveLineHeight(input.lineHeightPx, input.fontSizePx ?? 16);
  const paddingTop = Number.isFinite(input.paddingTopPx) ? (input.paddingTopPx as number) : 0;
  const paddingBottom = Number.isFinite(input.paddingBottomPx)
    ? (input.paddingBottomPx as number)
    : 0;
  const borderTop = Number.isFinite(input.borderTopPx) ? (input.borderTopPx as number) : 0;
  const borderBottom = Number.isFinite(input.borderBottomPx) ? (input.borderBottomPx as number) : 0;
  const verticalPaddingPx = paddingTop + paddingBottom + borderTop + borderBottom;

  const minHeightPx = Math.round(lineHeightPx + verticalPaddingPx);
  const maxHeightPx = Math.round(maxLines * lineHeightPx + verticalPaddingPx);

  const effectiveLines =
    typeof input.lineCount === 'number' && input.lineCount > 0 ? input.lineCount : 1;
  const rawScrollHeight =
    typeof input.scrollHeight === 'number' && Number.isFinite(input.scrollHeight) && input.scrollHeight > 0
      ? input.scrollHeight
      : Math.round(effectiveLines * lineHeightPx + verticalPaddingPx);

  const clampedScroll = Math.max(Math.round(rawScrollHeight), minHeightPx);
  const isCapped = clampedScroll > maxHeightPx;
  const heightPx = Math.min(clampedScroll, maxHeightPx);
  const overflowY: 'hidden' | 'auto' = isCapped ? 'auto' : 'hidden';

  return {
    heightPx,
    minHeightPx,
    maxHeightPx,
    lineHeightPx,
    verticalPaddingPx,
    overflowY,
    isCapped,
  };
}

export interface InsertAtCursorResult {
  value: string;
  cursor: number;
}

/**
 * Inserts `textToInsert` into `currentValue` at `[selectionStart, selectionEnd]`.
 * - Preserves text before `selectionStart` and after `selectionEnd`.
 * - Adds a single separating space before/after when adjacent characters are non-whitespace
 *   (and after-character is not closing punctuation).
 * - Returns the updated value and the new cursor position right after the inserted text.
 */
export function insertTextAtCursor(
  currentValue: string,
  textToInsert: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
): InsertAtCursorResult {
  const safeCurrent = typeof currentValue === 'string' ? currentValue : '';
  const trimmed = (typeof textToInsert === 'string' ? textToInsert : '').trim();
  const len = safeCurrent.length;

  const rawStart =
    typeof selectionStart === 'number' && Number.isFinite(selectionStart) ? selectionStart : len;
  const rawEnd =
    typeof selectionEnd === 'number' && Number.isFinite(selectionEnd) ? selectionEnd : rawStart;

  const start = Math.max(0, Math.min(len, Math.min(rawStart, rawEnd)));
  const end = Math.max(start, Math.min(len, Math.max(rawStart, rawEnd)));

  if (!trimmed) {
    return { value: safeCurrent, cursor: end };
  }

  const before = safeCurrent.slice(0, start);
  const after = safeCurrent.slice(end);

  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const needsTrailingSpace =
    after.length > 0 && !/^\s/.test(after) && !/^[.,!?;:)\]}]/.test(after);

  const prefix = needsLeadingSpace ? ' ' : '';
  const suffix = needsTrailingSpace ? ' ' : '';
  const inserted = `${prefix}${trimmed}`;
  const nextValue = `${before}${inserted}${suffix}${after}`;
  const nextCursor = before.length + inserted.length;

  return {
    value: nextValue,
    cursor: nextCursor,
  };
}

export function isSpeechRecognitionSupported(env?: {
  hasSpeechApi?: boolean;
  userAgent?: string;
  hasDesktopBridge?: boolean;
}): boolean {
  if (env) {
    if (env.hasDesktopBridge) return false;
    if (typeof env.userAgent === 'string' && /Electron\//i.test(env.userAgent)) return false;
    return Boolean(env.hasSpeechApi);
  }
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    aibossDesktop?: unknown;
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  if (win.aibossDesktop) return false;
  if (typeof navigator !== 'undefined' && /Electron\//i.test(navigator.userAgent || '')) {
    return false;
  }
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}
