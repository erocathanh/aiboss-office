import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { Coins, WarningCircle, CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { getCostsAggregation, getSeatPeriodCosts } from '@/lib/costs-ledger';

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

export function CostSettingsCard() {
  const seats = loadSeats();
  const periodCosts = getSeatPeriodCosts(seats);
  const overall = getCostsAggregation();

  const totalUnpriced = overall.summary.unpricedRuns;

  // Format totals
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];

  const todayAgg = getCostsAggregation({ from: `${todayStr}T00:00:00.000Z` });
  const monthAgg = getCostsAggregation({ from: `${startOfMonth}T00:00:00.000Z` });

  return (
    <section className="settings-card settings-card-wide">
      <div className="settings-card-header">
        <Coins size={20} weight="bold" className="settings-card-icon" />
        <div>
          <h2>Cost Today / This Month Per Seat</h2>
          <p className="settings-card-subtitle">
            Model usage receipt accounting stored in <code>operations/data/costs/</code> with integer nanodollar arithmetic.
          </p>
        </div>
      </div>

      <div className="settings-card-body">
        <div className="cost-table-container">
          <table className="cost-table">
            <thead>
              <tr>
                <th>Seat</th>
                <th className="cost-num">Cost Today</th>
                <th className="cost-num">Cost This Month</th>
                <th className="cost-num">Unpriced Runs</th>
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
                  <strong>Total Department</strong>
                </td>
                <td className="cost-num">{todayAgg.summary.formattedCostUsd}</td>
                <td className="cost-num">{monthAgg.summary.formattedCostUsd}</td>
                <td className="cost-num">{totalUnpriced}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {totalUnpriced > 0 ? (
          <div className="unpriced-notice">
            <WarningCircle size={16} weight="bold" />
            <span>
              <strong>Unpriced runs: {totalUnpriced}</strong> — total_cost_usd was not declared by the provider; token usage was recorded without fabricated prices.
            </span>
          </div>
        ) : (
          <div className="unpriced-notice" style={{ background: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.25)', color: '#86efac' }}>
            <CheckCircle size={16} weight="bold" />
            <span>Unpriced runs: 0 — All recorded runs have exact monetary accounting.</span>
          </div>
        )}
      </div>
    </section>
  );
}
