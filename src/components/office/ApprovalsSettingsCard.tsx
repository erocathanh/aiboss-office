'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, ClockCountdown, ShieldCheck, XCircle } from '@phosphor-icons/react';
import type { ApprovalItem, ApprovalStatus } from '@/lib/approvals-ledger';

export interface ApprovalsSettingsCardProps {
  initialApprovals?: ApprovalItem[];
}

function formatRelativeAge(isoTs: string): string {
  const tsMs = Date.parse(isoTs);
  if (Number.isNaN(tsMs)) return '-';
  const diffSec = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function getStatusBadgeStyle(status: ApprovalStatus): {
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
        label: 'APPROVED',
      };
    case 'denied':
      return {
        bg: 'rgba(239, 68, 68, 0.18)',
        color: '#fca5a5',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        label: 'DENIED',
      };
    case 'executed':
      return {
        bg: 'rgba(34, 197, 94, 0.18)',
        color: '#86efac',
        border: '1px solid rgba(34, 197, 94, 0.4)',
        label: 'EXECUTED',
      };
    case 'failed':
      return {
        bg: 'rgba(239, 68, 68, 0.22)',
        color: '#f87171',
        border: '1px solid rgba(239, 68, 68, 0.45)',
        label: 'FAILED',
      };
    case 'expired':
      return {
        bg: 'rgba(148, 163, 184, 0.16)',
        color: '#cbd5e1',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        label: 'EXPIRED',
      };
    default:
      return {
        bg: 'rgba(234, 179, 8, 0.18)',
        color: '#fde047',
        border: '1px solid rgba(234, 179, 8, 0.4)',
        label: 'PENDING',
      };
  }
}

export function ApprovalsSettingsCard({
  initialApprovals,
}: ApprovalsSettingsCardProps = {}) {
  const [approvals, setApprovals] = useState<ApprovalItem[]>(initialApprovals ?? []);
  const [loading, setLoading] = useState(!initialApprovals);
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
      }
    } catch {
      /* ignore transient fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
        setErrorMessage(errData.message || `Decision failed (${res.status}).`);
      }
      await fetchApprovals();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error.');
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
          <h2>Approvals</h2>
          <p className="settings-card-subtitle">
            Action approval ledger connecting guarded tool requests, SHA-256 digests, decisions, and single-use runs
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
              Pending Requests ({pendingItems.length})
            </span>
          </div>

          {loading && pendingItems.length === 0 ? (
            <div style={{ padding: '12px', color: '#94a3b8', fontSize: '13px' }}>
              Loading approvals...
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
              No pending approval requests.
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
                          {item.reason}
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
                        <span>{formatRelativeAge(item.ts)}</span>
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
                      {item.head60}
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
                        sha256: {item.sha256.slice(0, 12)}…
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
                          Approve
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
                          Deny
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
              Decided Ledger ({decidedItems.length})
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
              No decided requests recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {decidedItems.map((item) => {
                const badge = getStatusBadgeStyle(item.status);
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
                        ({item.reason})
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
                      {item.decidedBy && <span>by {item.decidedBy}</span>}
                      {item.expiresAt && item.status === 'approved' && (
                        <span>ttl: {item.expiresAt}</span>
                      )}
                      <span>{formatRelativeAge(item.ts)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
