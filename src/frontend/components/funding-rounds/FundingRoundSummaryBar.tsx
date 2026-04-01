'use client';

// ============================================================
// FundingRoundSummaryBar — 6 clickable KPI stats for the
// funding rounds list page overview.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface FundingRoundSummaryBarProps {
  activeCount: number;
  totalObtained: number;
  expiringAprCount: number;
  approvalRate: number;
  atRiskInterest: number;
  feesEarned: number;
  onStatClick?: (filter: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function FundingRoundSummaryBar({
  activeCount,
  totalObtained,
  expiringAprCount,
  approvalRate,
  atRiskInterest,
  feesEarned,
  onStatClick,
}: FundingRoundSummaryBarProps) {
  const stats: { key: string; label: string; value: string }[] = [
    { key: 'active',           label: 'Active',                    value: `${activeCount.toLocaleString()} active` },
    { key: 'obtained',         label: 'Total Obtained',            value: formatCurrency(totalObtained) },
    { key: 'expiring_apr',     label: 'APRs Expiring <30d',        value: `⚠️ ${expiringAprCount}` },
    { key: 'approval_rate',    label: 'Approval Rate',             value: `${approvalRate.toFixed(1)}%` },
    { key: 'at_risk_interest', label: 'At-Risk Interest',          value: formatCurrency(atRiskInterest) },
    { key: 'fees_earned',      label: 'Fees Earned',               value: formatCurrency(feesEarned) },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat) => (
        <button
          key={stat.key}
          type="button"
          onClick={() => onStatClick?.(stat.key)}
          className="bg-white rounded-xl border border-surface-border shadow-card p-4
                     hover:shadow-card-hover hover:border-brand-gold/40
                     transition-all duration-150 text-left group"
        >
          <p className="text-xs font-medium text-gray-500 group-hover:text-gray-700 mb-1">
            {stat.label}
          </p>
          <p className="text-xl font-bold tracking-tight text-gray-900 leading-none">
            {stat.value}
          </p>
        </button>
      ))}
    </div>
  );
}
