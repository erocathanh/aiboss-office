import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { Vault, ShieldWarning } from '@phosphor-icons/react/dist/ssr';
import { getBudgetStatus } from '@/lib/budget-ledger';
import { formatNanodollars } from '@/lib/costs-ledger';

interface DepartmentConfig {
  id: string;
  name: string;
  seats: string[];
}

function loadSeats(): string[] {
  try {
    const deptPath = path.join(process.cwd(), 'departments', 'marketing', 'department.json');
    const content = fs.readFileSync(deptPath, 'utf-8');
    const dept = JSON.parse(content) as DepartmentConfig;
    return dept.seats || [];
  } catch {
    return [
      'marketing-lead',
      'content-writer',
      'social-community',
      'email-crm',
      'paid-media',
      'video-creative',
      'funnel-offer',
      'reviewer',
    ];
  }
}

export function BudgetSettingsCard() {
  const seats = loadSeats();
  const officeStatus = getBudgetStatus();
  const seatStatuses = seats.map((seatId) => getBudgetStatus(seatId));

  return (
    <section className="settings-card settings-card-wide" id="budget-today-card">
      <div className="settings-card-header">
        <Vault size={20} weight="bold" className="settings-card-icon" />
        <div>
          <h2>Budget Today</h2>
          <p className="settings-card-subtitle">
            Pre-execution budget reservations (holds), daily spend caps, and hard-stop enforcement per seat.
          </p>
        </div>
      </div>

      <div className="settings-card-body">
        {/* Office Summary Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            marginBottom: '16px',
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
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
              Office Total Capacity
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Spent: {formatNanodollars(officeStatus.spentNanodollars)} · Held:{' '}
              {formatNanodollars(officeStatus.heldNanodollars)} · Cap:{' '}
              {officeStatus.capNanodollars
                ? formatNanodollars(officeStatus.capNanodollars)
                : 'No cap set'}
            </div>
          </div>
          <div>
            {officeStatus.state === 'exceeded' ? (
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
            const isExceeded = st.state === 'exceeded';
            const isWarning = st.state === 'warning';
            const isUnlimited = st.capNanodollars === null;

            const spentBig = BigInt(st.spentNanodollars);
            const heldBig = BigInt(st.heldNanodollars);
            const usedBig = spentBig + heldBig;

            let percent = 0;
            if (!isUnlimited && st.capNanodollars) {
              const capBig = BigInt(st.capNanodollars);
              if (capBig > 0n) {
                percent = Math.min(100, Math.round(Number((usedBig * 100n) / capBig)));
              }
            }

            return (
              <div
                key={st.seat ?? 'unknown'}
                style={{
                  padding: '12px 14px',
                  borderRadius: '6px',
                  background: isExceeded
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(255, 255, 255, 0.02)',
                  border: isExceeded
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
                        fontSize: '13px',
                        color: isExceeded ? '#fca5a5' : '#e2e8f0',
                      }}
                    >
                      {st.seat}
                    </code>
                    {isExceeded && (
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
                    {isWarning && (
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
                      fontSize: '12px',
                      color: isExceeded ? '#fca5a5' : '#94a3b8',
                      fontFamily: 'monospace',
                    }}
                  >
                    <span>Spent: {formatNanodollars(st.spentNanodollars)}</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <span>Held: {formatNanodollars(st.heldNanodollars)}</span>
                    <span style={{ margin: '0 6px' }}>/</span>
                    <span style={{ fontWeight: 600, color: isExceeded ? '#ef4444' : '#f8fafc' }}>
                      {st.capNanodollars ? formatNanodollars(st.capNanodollars) : 'No cap set'}
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
                      width: isUnlimited ? '0%' : `${percent}%`,
                      height: '100%',
                      borderRadius: '3px',
                      background: isExceeded
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
