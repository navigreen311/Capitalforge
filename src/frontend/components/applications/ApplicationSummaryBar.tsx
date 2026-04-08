'use client';

// ============================================================
// ApplicationSummaryBar — Clickable pipeline stat chips.
// Active chip gets gold highlight; click again to clear.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApplicationSummary {
  id: string;
  status: string;
  approved: number | null;
  requested?: number;
  apr_days_remaining: number;
  consent_status: string;
  acknowledgment_status: string;
  days_in_stage?: number;
}

export type ApplicationFilterType =
  | 'total'
  | 'pipeline_value'
  | 'approved_value'
  | 'avg_time'
  | 'approval_rate'
  | 'needs_action';

interface ApplicationSummaryBarProps {
  applications: ApplicationSummary[];
  activeFilter: ApplicationFilterType | null;
  onFilterClick: (filterType: ApplicationFilterType | null) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ApplicationSummaryBar({
  applications,
  activeFilter,
  onFilterClick,
}: ApplicationSummaryBarProps) {
  const total = applications.length;

  const approvedApps = applications.filter((a) => a.status === 'approved');
  const approvedCount = approvedApps.length;
  const totalApproved = approvedApps.reduce((sum, a) => sum + (a.approved ?? 0), 0);

  const pipelineValue = applications.reduce(
    (sum, a) => sum + (a.approved ?? a.requested ?? 0),
    0,
  );

  const decidedApps = applications.filter(
    (a) => a.status === 'approved' || a.status === 'declined',
  );
  const approvalRate =
    decidedApps.length > 0 ? (approvedCount / decidedApps.length) * 100 : 0;

  const avgTime =
    applications.length > 0
      ? applications.reduce((sum, a) => sum + (a.days_in_stage ?? 0), 0) / applications.length
      : 0;

  const needsAction = applications.filter(
    (a) =>
      a.consent_status === 'pending_consent' ||
      a.consent_status === 'pending' ||
      a.consent_status === 'missing' ||
      (a.status === 'draft' && a.acknowledgment_status !== 'completed'),
  ).length;

  const chips: { key: ApplicationFilterType; label: string; value: string }[] = [
    { key: 'total',          label: 'Total',          value: total.toLocaleString() },
    { key: 'pipeline_value', label: 'Pipeline Value', value: formatCurrency(pipelineValue) },
    { key: 'approved_value', label: 'Approved',       value: formatCurrency(totalApproved) },
    { key: 'avg_time',       label: 'Avg Time',       value: `${avgTime.toFixed(1)}d` },
    { key: 'approval_rate',  label: 'Approval Rate',  value: `${approvalRate.toFixed(0)}%` },
    { key: 'needs_action',   label: 'Needs Action',   value: needsAction.toLocaleString() },
  ];

  function handleClick(key: ApplicationFilterType) {
    onFilterClick(activeFilter === key ? null : key);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isActive = activeFilter === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => handleClick(chip.key)}
            className={[
              'inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border transition-all duration-150',
              isActive
                ? 'bg-brand-gold/20 text-brand-gold border-brand-gold shadow-sm'
                : 'bg-white text-gray-600 border-surface-border hover:border-brand-gold/40 hover:shadow-card',
            ].join(' ')}
          >
            {chip.label}: {chip.value}
          </button>
        );
      })}
      {activeFilter && (
        <button
          type="button"
          onClick={() => onFilterClick(null)}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 transition-colors"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}
