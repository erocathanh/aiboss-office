'use client';

import React, { useEffect, useState } from 'react';
import { CurrencyDollar, ShieldWarning } from '@phosphor-icons/react';
import { formatNanodollars } from '@/lib/money-format';
import type { BudgetStatus } from '@/lib/budget-ledger';

export interface BudgetSettingsCardProps {
  initialOfficeStatus?: BudgetStatus | null;
  initialSeatStatuses?: BudgetStatus[];
}

export function BudgetSettingsCard({
  initialOfficeStatus,
  initialSeatStatuses,
}: BudgetSettingsCardProps = {}) {
  const [officeStatus, setOfficeStatus] = useState<BudgetStatus | null>(initialOfficeStatus ?? null);
  const [seatStatuses, setSeatStatuses] = useState<BudgetStatus[]>(initialSeatStatuses ?? []);
  const [loading, setLoading] = useState(!initialOfficeStatus);

  useEffect(() => {
    if (initialOfficeStatus) return;
    async function loadBudget() {
      try {
        const offRes = await fetch('/api/budget');
        if (offRes.ok) {
          const offData: BudgetStatus = await offRes.json();
          setOfficeStatus(offData);
        }

        const seats = [
          'marketing-lead',
          'content-writer',
          'social-community',
          'email-crm',
          'paid-media',
          'video-creative',
          'funnel-offer',
          'reviewer',
        ];

        const seatResults: BudgetStatus[] = [];
        for (const seat of seats) {
          const sRes = await fetch(`/api/budget?seat=${seat}`);
          if (sRes.ok) {
            const sData: BudgetStatus = await sRes.json();
            seatResults.push(sData);
          }
        }
        setSeatStatuses(seatResults);
      } catch {
        /* ignore fetch errors */
      } finally {
        setLoading(false);
      }
    }

    loadBudget();
  }, []);

  if (loading || !officeStatus) {
    return (
      <section id="budget-today-card" className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <CurrencyDollar size={20} weight="bold" className="settings-card-icon" />
            Budget Today
          </div>
        </div>
        <div style={{ padding: '16px', color: '#94a3b8', fontSize: 'calc(13px * var(--text-scale, 1))' }}>
          Loading budget status...
        </div>
      </section>
    );
  }

  return (
    <section id="budget-today-card" className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-title">
          <CurrencyDollar size={20} weight="bold" className="settings-card-icon" />
          Budget Today
        </div>
        <div className="settings-card-subtitle">
          Real-time daily budget caps, pre-dispatch holds, and spent tracking
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
        {/* Office Overall Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderRadius: '8px',
            background:
              officeStatus.state === 'exceeded'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(255, 255, 255, 0.04)',
            border:
              officeStatus.state === 'exceeded'
                ? '1px solid rgba(239, 68, 68, 0.4)'
                : '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div>
            <div style={{ fontSize: 'calc(13px * var(--text-scale, 1))', fontWeight: 600, color: '#f1f5f9' }}>
              Office Total Capacity
            </div>
            <div style={{ fontSize: 'calc(12px * var(--text-scale, 1))', color: '#94a3b8', marginTop: '2px' }}>
              Spent: {formatNanodollars(officeStatus.spentNanodollars)} · Held:{' '}
              {formatNanodollars(officeStatus.heldNanodollars)}
              {officeStatus.unpricedRuns > 0 &&
                ` · Pending: ${formatNanodollars(officeStatus.unpricedEstimateNanodollars)}`}
              {' · Cap: '}
              {officeStatus.state === 'config_error'
                ? 'Configuration error'
                : officeStatus.capNanodollars
                ? formatNanodollars(officeStatus.capNanodollars)
                : 'No cap set'}
            </div>
          </div>
          <div>
            {officeStatus.state === 'config_error' ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                }}
              >
                <ShieldWarning size={14} weight="bold" /> Configuration error
              </span>
            ) : officeStatus.state === 'exceeded' ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                }}
              >
                <ShieldWarning size={14} weight="bold" /> Office Cap Exceeded
              </span>
            ) : officeStatus.capNanodollars === null ? (
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#94a3b8',
                }}
              >
                No cap set
              </span>
            ) : (
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'rgba(34, 197, 94, 0.1)',
                  color: '#86efac',
                }}
              >
                Remaining: {formatNanodollars(officeStatus.remainingNanodollars ?? '0')}
              </span>
            )}
          </div>
        </div>

        {/* Per-Seat Budget Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {seatStatuses.map((st) => {
            const isConfigError = st.state === 'config_error';
            const isExceeded = st.state === 'exceeded';
            const isWarning = st.state === 'warning';
            const isUnlimited = st.capNanodollars === null && !isConfigError;

            // Total committed matches API: spent + held + unpricedEstimate
            const committedBig = BigInt(
              st.committedNanodollars ??
                (
                  BigInt(st.spentNanodollars) +
                  BigInt(st.heldNanodollars) +
                  BigInt(st.unpricedEstimateNanodollars ?? '0')
                ).toString()
            );

            let percent = 0;
            if (!isUnlimited && !isConfigError && st.capNanodollars) {
              const capBig = BigInt(st.capNanodollars);
              if (capBig > 0n) {
                percent = Math.min(100, Math.round(Number((committedBig * 100n) / capBig)));
              }
            }

            return (
              <div
                key={st.seat ?? 'unknown'}
                style={{
                  padding: '12px 14px',
                  borderRadius: '6px',
                  background: (isExceeded || isConfigError)
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(255, 255, 255, 0.02)',
                  border: (isExceeded || isConfigError)
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : '1px solid rgba(255, 255, 255, 0.06)',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Row Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code
                      style={{
                        fontWeight: 600,
                        fontSize: 'calc(13px * var(--text-scale, 1))',
                        color: (isExceeded || isConfigError) ? '#fca5a5' : '#e2e8f0',
                      }}
                    >
                      {st.seat}
                    </code>
                    {isConfigError && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                        }}
                      >
                        CONFIGURATION ERROR
                      </span>
                    )}
                    {isExceeded && !isConfigError && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#ef4444',
                          color: '#ffffff',
                        }}
                      >
                        EXCEEDED
                      </span>
                    )}
                    {isWarning && !isConfigError && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(234, 179, 8, 0.2)',
                          color: '#fde047',
                          border: '1px solid rgba(234, 179, 8, 0.4)',
                        }}
                      >
                        WARNING (&gt;80%)
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 'calc(12px * var(--text-scale, 1))',
                      color: (isExceeded || isConfigError) ? '#fca5a5' : '#94a3b8',
                      fontFamily: 'monospace',
                    }}
                  >
                    <span>Spent: {formatNanodollars(st.spentNanodollars)}</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <span>Held: {formatNanodollars(st.heldNanodollars)}</span>
                    {st.unpricedRuns > 0 && (
                      <>
                        <span style={{ margin: '0 6px' }}>·</span>
                        <span>Pending: {formatNanodollars(st.unpricedEstimateNanodollars)}</span>
                      </>
                    )}
                    <span style={{ margin: '0 6px' }}>/</span>
                    <span style={{ fontWeight: 600, color: (isExceeded || isConfigError) ? '#ef4444' : '#f8fafc' }}>
                      {isConfigError
                        ? 'Configuration error'
                        : st.capNanodollars
                        ? formatNanodollars(st.capNanodollars)
                        : 'No cap set'}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: isUnlimited ? '0%' : (isConfigError ? '100%' : `${percent}%`),
                      height: '100%',
                      borderRadius: '3px',
                      background: (isExceeded || isConfigError)
                        ? '#ef4444'
                        : isWarning
                        ? '#eab308'
                        : '#38bdf8',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
