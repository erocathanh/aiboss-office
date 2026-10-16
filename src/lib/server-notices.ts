import {
  t,
  resolveServerUiLanguage,
  UI_LANGUAGE_COOKIE_KEY,
  type UiLanguage,
} from '@/i18n/core';

export type ServerNoticeCode = string;
export type ServerNoticeParams = Record<string, string | number>;

export interface SystemNoticeRef {
  code: ServerNoticeCode;
  params?: ServerNoticeParams;
}

export interface ServerNoticePayload extends SystemNoticeRef {
  text: string;
}

const NOTICE_CODE_ALIASES: Record<string, string> = {
  'run.failed.noDetail': 'run.failedNoDetail',
  'run.failed.interruptedToolUse': 'run.interruptedToolUse',
};

const REQUEST_ID_RE = /"request_id"\s*:\s*"req_[^"]+"/g;
const OAUTH_EXPIRED_RE =
  /oauth session expired|failed to authenticate[^\n]*oauth|authentication_error[^\n]*expired/i;
const NOT_AUTHENTICATED_RE = /not authenticated|unauthor|login/i;
const INTERRUPTED_TOOL_USE_RE =
  /stop_reason=tool_use|ede_diagnostic|tool_use.*without.*tool_result|each [`'"]?tool_use[`'"]? must have a single result/i;

export function normalizeNoticeCode(code: string): string {
  const trimmed = code.trim().replace(/^system\./, '');
  return NOTICE_CODE_ALIASES[trimmed] ?? trimmed;
}

export function prepareNoticeParams(
  code: string,
  params: ServerNoticeParams | undefined,
  translateFn: (key: string, p?: Record<string, string | number>) => string,
): ServerNoticeParams | undefined {
  if (!params) return undefined;
  const normalized = normalizeNoticeCode(code);
  const next: ServerNoticeParams = { ...params };

  if (normalized === 'budget.capped' && !next.periodLabel && typeof next.period === 'string') {
    next.periodLabel =
      next.period === 'hour'
        ? translateFn('system.budget.periodHour')
        : translateFn('system.budget.periodDay');
  }

  if (
    normalized === 'wake.seatNotOpen' &&
    (next.openSlots === undefined || String(next.openSlots).trim() === '')
  ) {
    next.openSlots = translateFn('system.wake.noneOpen');
  }

  return next;
}

export function formatServerNotice(
  code: string,
  params?: ServerNoticeParams,
  lang: UiLanguage = 'en',
): string {
  const normalized = normalizeNoticeCode(code);
  const prepared = prepareNoticeParams(normalized, params, (k, p) => t(k, p, lang));
  return t(`system.${normalized}`, prepared, lang);
}

export function buildServerNotice(
  code: string,
  params?: ServerNoticeParams,
  lang: UiLanguage = 'en',
): ServerNoticePayload {
  const normalized = normalizeNoticeCode(code);
  const cleanParams =
    params && Object.keys(params).length > 0 ? { ...params } : undefined;
  return {
    code: normalized,
    ...(cleanParams ? { params: cleanParams } : {}),
    text: formatServerNotice(normalized, cleanParams, lang),
  };
}

function readCookieFromHeader(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export function resolveRequestUiLanguage(
  req?: {
    headers?: { get(name: string): string | null } | null;
    cookies?: { get(name: string): { value?: string } | undefined } | null;
  } | null,
): UiLanguage {
  if (!req) return 'en';
  const cookieVal =
    req.cookies?.get?.(UI_LANGUAGE_COOKIE_KEY)?.value ??
    readCookieFromHeader(req.headers?.get?.('cookie'), UI_LANGUAGE_COOKIE_KEY);
  const acceptLanguage = req.headers?.get?.('accept-language') ?? null;
  return resolveServerUiLanguage({
    cookieValue: cookieVal,
    acceptLanguage,
  });
}

export function serverNoticeJson(
  req: {
    headers?: { get(name: string): string | null } | null;
    cookies?: { get(name: string): { value?: string } | undefined } | null;
  } | null,
  code: string,
  params?: ServerNoticeParams,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  const lang = resolveRequestUiLanguage(req);
  const notice = buildServerNotice(code, params, lang);
  return Response.json(
    {
      code: notice.code,
      ...(notice.params ? { params: notice.params } : {}),
      text: notice.text,
      loi: notice.text,
      ...(extra ?? {}),
    },
    { status },
  );
}

/**
 * Classifies raw agent / Claude CLI error output into a structured notice
 * with `{ code, params, text }` (no hardcoded Vietnamese strings).
 */
export function classifyAgentError(
  raw: string,
  lang: UiLanguage = 'en',
): ServerNoticePayload {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return buildServerNotice('run.failedNoDetail', undefined, lang);
  }
  if (OAUTH_EXPIRED_RE.test(trimmed)) {
    return buildServerNotice('auth.expired', undefined, lang);
  }
  if (NOT_AUTHENTICATED_RE.test(trimmed)) {
    return buildServerNotice('auth.notAuthenticated', undefined, lang);
  }
  if (INTERRUPTED_TOOL_USE_RE.test(trimmed)) {
    return buildServerNotice('run.interruptedToolUse', undefined, lang);
  }
  return buildServerNotice('run.failed', { detail: trimmed.slice(0, 300) }, lang);
}

/**
 * Resolves a server notice payload on the client using the active UI language `translateFn`.
 * Only translates when a structured `code` is present; raw text without `code` is preserved verbatim.
 */
export function resolveClientNotice(
  input: unknown,
  translateFn: (key: string, params?: Record<string, string | number>) => string,
): { code?: string; params?: ServerNoticeParams; text: string } {
  if (typeof input === 'string') {
    return { text: input };
  }

  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const rawCode = typeof obj.code === 'string' ? obj.code.trim() : '';
    const rawParams =
      obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)
        ? (obj.params as ServerNoticeParams)
        : undefined;

    if (rawCode) {
      const normCode = normalizeNoticeCode(rawCode);
      const prepared = prepareNoticeParams(normCode, rawParams, translateFn);
      const key = `system.${normCode}`;
      const translated = translateFn(key, prepared);
      if (translated !== key) {
        return {
          code: normCode,
          ...(rawParams && Object.keys(rawParams).length > 0 ? { params: rawParams } : {}),
          text: translated,
        };
      }
    }

    const fallbackText =
      (typeof obj.text === 'string' && obj.text) ||
      (typeof obj.thong_diep === 'string' && obj.thong_diep) ||
      (typeof obj.loi === 'string' && obj.loi) ||
      '';

    return { text: fallbackText };
  }

  return { text: '' };
}

function normalizeStringForDedupe(value: string): string {
  return value.replace(REQUEST_ID_RE, '"request_id":"*"').trim();
}

export function normalizeNoticeSignature(item: {
  code?: string;
  params?: ServerNoticeParams;
  chu?: string;
}): string {
  if (item.code) {
    const normCode = normalizeNoticeCode(item.code);
    const entries = Object.entries(item.params ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, typeof v === 'string' ? normalizeStringForDedupe(v) : v]);
    return `code:${normCode}:${JSON.stringify(entries)}`;
  }
  return `text:${normalizeStringForDedupe(item.chu ?? '')}`;
}

export interface DedupeCapableTin {
  ai: 'toi' | 'ho';
  chu: string;
  loi?: boolean;
  dang?: boolean;
  thongBaoHeThong?: SystemNoticeRef;
  soLanLap?: number;
}

/**
 * Collapses consecutive error notices in the same turn that share the same
 * `code` + normalized `params` (or normalized text) into a single bubble with
 * `soLanLap` (`×N`). Also upgrades a preceding synthetic raw OAuth-expired text
 * bubble in the same turn so raw JSON is not duplicated above the translated notice.
 */
export function appendOrDedupeErrorTin<T extends DedupeCapableTin>(
  tinList: readonly T[],
  incoming: T,
): T[] {
  const next = [...tinList];
  const prev = next[next.length - 1];

  if (!prev || prev.ai !== 'ho') {
    next.push(incoming);
    return next;
  }

  // Case 1: Previous bubble is already an error bubble — check signature match
  if (prev.loi) {
    const prevSig = normalizeNoticeSignature({
      code: prev.thongBaoHeThong?.code,
      params: prev.thongBaoHeThong?.params,
      chu: prev.chu,
    });
    const nextSig = normalizeNoticeSignature({
      code: incoming.thongBaoHeThong?.code,
      params: incoming.thongBaoHeThong?.params,
      chu: incoming.chu,
    });
    if (prevSig === nextSig) {
      const prevCount = typeof prev.soLanLap === 'number' && prev.soLanLap >= 1 ? prev.soLanLap : 1;
      const addCount =
        typeof incoming.soLanLap === 'number' && incoming.soLanLap >= 1 ? incoming.soLanLap : 1;
      next[next.length - 1] = {
        ...prev,
        chu: incoming.chu,
        thongBaoHeThong: incoming.thongBaoHeThong ?? prev.thongBaoHeThong,
        soLanLap: prevCount + addCount,
      };
      return next;
    }
  }

  // Case 2: Previous bubble is a synthetic assistant text bubble emitted by Claude CLI
  // for an authentication failure right before the `result` error event.
  if (
    !prev.loi &&
    incoming.thongBaoHeThong?.code === 'auth.expired' &&
    OAUTH_EXPIRED_RE.test(prev.chu) &&
    /^Failed to authenticate\b/i.test(prev.chu.trim())
  ) {
    next[next.length - 1] = {
      ...prev,
      chu: incoming.chu,
      loi: true,
      dang: false,
      thongBaoHeThong: incoming.thongBaoHeThong,
      soLanLap: incoming.soLanLap ?? 1,
    };
    return next;
  }

  next.push(incoming);
  return next;
}
