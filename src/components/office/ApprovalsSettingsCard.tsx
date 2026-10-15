'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, ClockCountdown, ShieldCheck, XCircle } from '@phosphor-icons/react';
import type { ApprovalItem, ApprovalStatus } from '@/lib/approvals-ledger';
import { useT, formatLocalTimestamp } from '@/i18n';

export type ApprovalLoadErrorCode = 'ledger_unreadable' | 'io_error' | 'lock_timeout';

export interface ApprovalsSettingsCardProps {
  initialApprovals?: ApprovalItem[];
  initialError?: ApprovalLoadErrorCode | null;
}

function formatRelativeAge(
  isoTs: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const tsMs = Date.parse(isoTs);
  if (Number.isNaN(tsMs)) return '-';
  const diffSec = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
  if (diffSec < 60) return t('settings.approvals.relativeSecondsAgo', { count: diffSec });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t('settings.approvals.relativeMinutesAgo', { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('settings.approvals.relativeHoursAgo', { count: diffHr });
  const diffDays = Math.floor(diffHr / 24);
  return t('settings.approvals.relativeDaysAgo', { count: diffDays });
}

const LEGACY_H1_REASON_MAP: Array<{ match: RegExp; code: string }> = [
  {
    match: /công cụ mcp|mcp.*gửi dữ liệu ra bên ngoài/i,
    code: 'mcp_external_send',
  },
  {
    match: /tệp cấu hình\s*\(-k\/--config\)|-k\/--config/i,
    code: 'curl_config_flag',
  },
  {
    match: /fetch_page_messages\.py|truy xuất tin nhắn hộp thư/i,
    code: 'inbox_message_fetch',
  },
  {
    match: /graph\.facebook\.com.*\/messages|gửi tin nhắn\s*\(\/messages\)/i,
    code: 'facebook_graph_messages',
  },
  {
    match: /batch request.*graph\.facebook\.com/i,
    code: 'facebook_graph_batch',
  },
  {
    match: /lệnh post gửi tin nhắn\/email|post gửi tin nhắn/i,
    code: 'external_post_send',
  },
  {
    match: /kết nối gửi tin\/email ra dịch vụ bên ngoài/i,
    code: 'external_endpoint_send',
  },
];

function formatApprovalReason(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'guarded_external_action';
  for (const rule of LEGACY_H1_REASON_MAP) {
    if (rule.match.test(trimmed)) {
      return rule.code;
    }
  }
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return 'guarded_external_action';
  }
  return trimmed.slice(0, 200);
}

function formatApprovalHead60(raw: string): string {
  const trimmed = (raw || '').slice(0, 60);
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return trimmed.replace(/[^\x20-\x7E]/g, '?');
  }
  return trimmed;
}

function getStatusBadgeStyle(
  status: ApprovalStatus,
  t: (key: string, params?: Record<string, string | number>) => string,
): {
  bg: string;
  color: string;
  border: string;
  label: string;
} {
  switch (status) {
    case 'approved':
      return {
        bg: 'rgba(56, 189, 248, 0.15)',
        color: '#7dd3fc',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        label: t('settings.approvals.statusApproved'),
      };
    case 'denied':
      return {
        bg: 'rgba(239, 68, 68, 0.18)',
        color: '#fca5a5',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        label: t('settings.approvals.statusDenied'),
      };
    case 'executed':
      return {
        bg: 'rgba(34, 197, 94, 0.18)',
        color: '#86efac',
        border: '1px solid rgba(34, 197, 94, 0.4)',
        label: t('settings.approvals.statusExecuted'),
      };
    case 'failed':
      return {
        bg: 'rgba(239, 68, 68, 0.22)',
        color: '#f87171',
        border: '1px solid rgba(239, 68, 68, 0.45)',
        label: t('settings.approvals.statusFailed'),
      };
    case 'expired':
      return {
        bg: 'rgba(148, 163, 184, 0.16)',
        color: '#cbd5e1',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        label: t('settings.approvals.statusExpired'),
      };
    default:
      return {
        bg: 'rgba(234, 179, 8, 0.18)',
        color: '#fde047',
        border: '1px solid rgba(234, 179, 8, 0.4)',
        label: t('settings.approvals.statusPending'),
      };
  }
}

export function ApprovalsSettingsCard({
  initialApprovals,
  initialError = null,
}: ApprovalsSettingsCardProps = {}) {
  const { t, lang } = useT();
  const [mounted, setMounted] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalItem[]>(initialApprovals ?? []);
  const [loadError, setLoadError] = useState<ApprovalLoadErrorCode | null>(initialError ?? null);
  const [loading, setLoading] = useState(!initialApprovals && !initialError);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals?limit=50', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { approvals?: ApprovalItem[] };
        if (Array.isArray(data.approvals)) {
          setApprovals(data.approvals);
        }
        setLoadError(null);
      } else {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        const code: ApprovalLoadErrorCode =
          errData.error === 'ledger_unreadable' ||
          errData.error === 'lock_timeout' ||
          errData.error === 'io_error'
            ? errData.error
            : 'io_error';
        setLoadError(code);
      }
    } catch {
      setLoadError('io_error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchApprovals();
  }, [fetchApprovals]);

  const handleDecision = async (
    requestId: string,
    decision: 'approved' | 'denied'
  ) => {
    setBusyId(requestId);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(requestId)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        const baseMsg = t('settings.approvals.decisionFailed', { status: res.status });
        const detail =
          typeof errData?.message === 'string' && errData.message.trim()
            ? ` ${errData.message.trim()}`
            : '';
        setErrorMessage(`${baseMsg}${detail}`);
      }
      await fetchApprovals();
    } catch (err: unknown) {
      const baseMsg = t('settings.approvals.networkError');
      const detail =
        err instanceof Error && err.message.trim() ? ` ${err.message.trim()}` : '';
      setErrorMessage(`${baseMsg}${detail}`);
    } finally {
      setBusyId(null);
    }
  };

  const pendingItems = approvals.filter(
    (item) => item.status === 'pending' || item.state === 'requested'
  );
  const decidedItems = approvals.filter(
    (item) => item.status !== 'pending' && item.state !== 'requested'
  );

  return (
    <section
      id="approvals-settings-card"
      className="settings-card settings-card-wide"
      style={{ minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}
    >
      <div className="settings-card-header">
        <ShieldCheck size={20} weight="bold" className="settings-card-icon" />
        <div style={{ minWidth: 0 }}>
          <h2>{t('settings.approvals.title')}</h2>
          <p className="settings-card-subtitle">
            {t('settings.approvals.subtitle')}
          </p>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            marginTop: '12px',
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.16)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            fontSize: '12px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {loadError ? (
        <div
          data-testid="approvals-error-card"
          data-error-code={loadError}
          role="alert"
          style={{
            marginTop: '14px',
            padding: '12px 14px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid rgba(239, 68, 68, 0.42)',
            color: '#fecaca',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '12px',
            fontSize: '13px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <span>{t('settings.approvals.ledgerErrorLabel')}</span>
            <code
              style={{
                fontWeight: 700,
                color: '#fca5a5',
              }}
            >
              {loadError}
            </code>
          </div>
          <button
            type="button"
            data-testid="approvals-retry-btn"
            onClick={() => void fetchApprovals()}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(248, 113, 113, 0.5)',
              background: 'rgba(239, 68, 68, 0.22)',
              color: '#fee2e2',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('settings.approvals.retry')}
          </button>
        </div>
      ) : (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          marginTop: '14px',
        }}
      >
        {/* Pending Requests Section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#fde047',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ClockCountdown size={15} weight="bold" />
              {t('settings.approvals.pendingRequests', { count: pendingItems.length })}
            </span>
          </div>

          {loading && pendingItems.length === 0 ? (
            <div style={{ padding: '12px', color: '#94a3b8', fontSize: '13px' }}>
              {t('settings.approvals.loading')}
            </div>
          ) : pendingItems.length === 0 ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                color: '#94a3b8',
                fontSize: '13px',
              }}
            >
              {t('settings.approvals.noPending')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingItems.map((item) => {
                const isBusy = busyId === item.requestId;
                return (
                  <div
                    key={item.requestId}
                    data-testid={`approval-pending-${item.requestId}`}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(234, 179, 8, 0.06)',
                      border: '1px solid rgba(234, 179, 8, 0.28)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <code
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#f8fafc',
                            background: 'rgba(255, 255, 255, 0.08)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {item.seat}
                        </code>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#38bdf8',
                            background: 'rgba(56, 189, 248, 0.12)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {item.tool}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#cbd5e1',
                            background: 'rgba(255, 255, 255, 0.05)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {item.host}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#fde047',
                            background: 'rgba(234, 179, 8, 0.14)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {formatApprovalReason(item.reason)}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          color: '#94a3b8',
                        }}
                      >
                        <code>{item.requestId}</code>
                        <span>·</span>
                        <span>{formatRelativeAge(item.ts, t)}</span>
                      </div>
                    </div>

                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#e2e8f0',
                        background: 'rgba(15, 23, 42, 0.65)',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {formatApprovalHead60(item.head60)}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginTop: '2px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#94a3b8',
                          fontFamily: 'monospace',
                        }}
                      >
                        {t('settings.approvals.sha256Prefix', {
                          prefix: item.sha256.slice(0, 12),
                        })}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecision(item.requestId, 'approved')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            background: '#0284c7',
                            color: '#ffffff',
                            border: '1px solid #38bdf8',
                          }}
                        >
                          <CheckCircle size={14} weight="bold" />
                          {t('settings.approvals.approve')}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecision(item.requestId, 'denied')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            background: 'rgba(239, 68, 68, 0.18)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.45)',
                          }}
                        >
                          <XCircle size={14} weight="bold" />
                          {t('settings.approvals.deny')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Decided Requests Section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#94a3b8',
              }}
            >
              {t('settings.approvals.decidedLedger', { count: decidedItems.length })}
            </span>
          </div>

          {decidedItems.length === 0 ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                color: '#94a3b8',
                fontSize: '13px',
              }}
            >
              {t('settings.approvals.noDecided')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {decidedItems.map((item) => {
                const badge = getStatusBadgeStyle(item.status, t);
                return (
                  <div
                    key={item.requestId}
                    data-testid={`approval-decided-${item.requestId}`}
                    data-status={item.status}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.color,
                          border: badge.border,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {badge.label}
                      </span>
                      <code
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#e2e8f0',
                        }}
                      >
                        {item.requestId}
                      </code>
                      <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                        {item.seat} · {item.tool} · {item.host}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        ({formatApprovalReason(item.reason)})
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '11px',
                        color: '#94a3b8',
                      }}
                    >
                      {item.decidedBy && (
                        <span>
                          {t('settings.approvals.byActor', {
                            actor:
                              item.decidedBy === 'owner'
                                ? t('settings.approvals.actorOwner')
                                : item.decidedBy === 'localhost'
                                  ? t('settings.approvals.actorLocalhost')
                                  : item.decidedBy,
                          })}
                        </span>
                      )}
                      {item.expiresAt && item.status === 'approved' && (
                        <span>
                          {t('settings.approvals.ttlLabel', {
                            expiresAt: formatLocalTimestamp(item.expiresAt, lang, mounted),
                          })}
                        </span>
                      )}
                      <span>{formatRelativeAge(item.ts, t)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </section>
  );
}
