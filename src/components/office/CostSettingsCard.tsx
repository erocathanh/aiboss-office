import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { getCostsAggregation, getSeatPeriodCosts } from '@/lib/costs-ledger';
import { CostSettingsCardClient } from './CostSettingsCardClient';

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

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .split('T')[0];

  const todayAgg = getCostsAggregation({ from: `${todayStr}T00:00:00.000Z` });
  const monthAgg = getCostsAggregation({ from: `${startOfMonth}T00:00:00.000Z` });

  return (
    <CostSettingsCardClient
      periodCosts={periodCosts}
      todayFormattedCostUsd={todayAgg.summary.formattedCostUsd}
      monthFormattedCostUsd={monthAgg.summary.formattedCostUsd}
      totalUnpriced={totalUnpriced}
    />
  );
}
