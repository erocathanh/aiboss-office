'use client';

import React from 'react';
import { Coins, WarningCircle, CheckCircle } from '@phosphor-icons/react';
import { useT } from '@/i18n';
import type { SeatPeriodCost } from '@/lib/costs-ledger';

export interface CostSettingsCardClientProps {
  periodCosts: SeatPeriodCost[];
  todayFormattedCostUsd: string;
  monthFormattedCostUsd: string;
  totalUnpriced: number;
}

export function CostSettingsCardClient({
  periodCosts,
  todayFormattedCostUsd,
  monthFormattedCostUsd,
  totalUnpriced,
}: CostSettingsCardClientProps) {
  const { t } = useT();

  return (
    <section className="settings-card settings-card-wide">
      <div className="settings-card-header">
        <Coins size={20} weight="bold" className="settings-card-icon" />
        <div>
          <h2>{t('settings.costs.title')}</h2>
          <p className="settings-card-subtitle">
            {t('settings.costs.subtitlePrefix')} <code>operations/data/costs/</code>{' '}
            {t('settings.costs.subtitleSuffix')}
          </p>
        </div>
      </div>

      <div className="settings-card-body">
        <div className="cost-table-container">
          <table className="cost-table">
            <thead>
              <tr>
                <th>{t('settings.costs.colSeat')}</th>
                <th className="cost-num">{t('settings.costs.colCostToday')}</th>
                <th className="cost-num">{t('settings.costs.colCostMonth')}</th>
                <th className="cost-num">{t('settings.costs.colUnpricedRuns')}</th>
              </tr>
            </thead>
            <tbody>
              {periodCosts.map((s) => (
                <tr key={s.seatId}>
                  <td>
                    <code>{s.seatId}</code>
                  </td>
                  <td className="cost-num highlight-gold">{s.formattedCostToday}</td>
                  <td className="cost-num">{s.formattedCostThisMonth}</td>
                  <td className="cost-num">
                    {s.unpricedRunsThisMonth > 0 ? (
                      <span className="cost-badge-unpriced">{s.unpricedRunsThisMonth}</span>
                    ) : (
                      <span className="settings-dim">0</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="cost-total-row">
                <td>
                  <strong>{t('settings.costs.totalDepartment')}</strong>
                </td>
                <td className="cost-num">{todayFormattedCostUsd}</td>
                <td className="cost-num">{monthFormattedCostUsd}</td>
                <td className="cost-num">{totalUnpriced}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {totalUnpriced > 0 ? (
          <div className="unpriced-notice">
            <WarningCircle size={16} weight="bold" />
            <span>
              <strong>{t('settings.costs.unpricedWarningPrefix', { count: totalUnpriced })}</strong>{' '}
              {t('settings.costs.unpricedWarningSuffix')}
            </span>
          </div>
        ) : (
          <div
            className="unpriced-notice"
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              borderColor: 'rgba(34, 197, 94, 0.25)',
              color: '#86efac',
            }}
          >
            <CheckCircle size={16} weight="bold" />
            <span>{t('settings.costs.unpricedZeroNotice')}</span>
          </div>
        )}
      </div>
    </section>
  );
}
