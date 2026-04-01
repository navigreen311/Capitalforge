'use client';

// ============================================================
// ApplicationSummaryBar — 6 clickable KPI stats for the
// applications pipeline overview.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApplicationSummary {
  id: string;
  status: string;
  approved: number | null;
  apr_days_remaining: number;
  consent_status: string;
  acknowledgment_status: string;
}

export type ApplicationFilterType =
  | 'total'
  | 'approved'
  | 'funded'
  | 'approval_rate'
  | 'avg_days'
  | 'needs_action';

interface ApplicationSummaryBarProps {
  applications: ApplicationSummary[];
  onFilterClick: (filterType: ApplicationFilterType) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ApplicationSummaryBar({ applications, onFilterClick }: ApplicationSummaryBarProps) {
  const total = applications.length;
  const approvedApps = applications.filter((a) => a.status === 'approved');
  const approvedCount = approvedApps.length;
  const totalFunded = approvedApps.reduce((sum, a) => sum + (a.approved ?? 0), 0);

  const decidedApps = applications.filter((a) => a.status === 'approved' || a.status === 'declined');
  const approvalRate = decidedApps.length > 0
    ? (approvedCount / decidedApps.length) * 100
    : 0;

  const appsWithDecision = applications.filter(
    (a) => (a.status === 'approved' || a.status === 'declined') && a.apr_days_remaining != null,
  );
  const avgDaysToDecision = appsWithDecision.length > 0
    ? Math.round(appsWithDecision.reduce((sum, a) => sum + a.apr_days_remaining, 0) / appsWithDecision.length)
    : 0;

  const needsAction = applications.filter(
    (a) =>
      a.consent_status === 'pending_consent' ||
      (a.status === 'draft' && a.acknowledgment_status !== 'completed'),
  ).length;

  const stats: { key: ApplicationFilterType; label: string; value: string }[] = [
    { key: 'total',         label: 'Total',              value: total.toLocaleString() },
    { key: 'approved',      label: 'Approved',           value: approvedCount.toLocaleString() },
    { key: 'funded',        label: 'Total Funded',       value: formatCurrency(totalFunded) },
    { key: 'approval_rate', label: 'Approval Rate',      value: `${approvalRate.toFixed(1)}%` },
    { key: 'avg_days',      label: 'Avg Days to Decision', value: `${avgDaysToDecision}` },
    { key: 'needs_action',  label: 'Needs Action',       value: needsAction.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat) => (
        <button
          key={stat.key}
          type="button"
          onClick={() => onFilterClick(stat.key)}
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
