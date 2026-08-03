'use client';

// ============================================================
// DashboardBadge — status badge for dashboard views
//
// The status-to-appearance lookup lives in
// src/frontend/lib/dashboard-badge-view.ts so it can be tested. It used to be
// an inline `STATUS_MAP[status].label`, which threw on any status without an
// entry — and `cancelled`, a real value on card applications, had none. The
// throw happened during render, so it was not caught by the widget; it
// unwound to the page error boundary and took the whole dashboard with it.
// ============================================================

import {
  resolveBadgeAppearance,
  type DashboardBadgeStatus,
} from '@/lib/dashboard-badge-view';

export type { DashboardBadgeStatus };

interface DashboardBadgeProps {
  /** A status string. Unrecognised values render as themselves, in grey. */
  status: string;
  /** Override the display label */
  label?: string;
  className?: string;
}

export function DashboardBadge({ status, label, className = '' }: DashboardBadgeProps) {
  const cfg = resolveBadgeAppearance(status);
  const displayLabel = label ?? cfg.label;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium border
        text-xs px-2 py-1
        ${cfg.bg} ${cfg.text} ${cfg.border}
        ${className}
      `}
      aria-label={`Status: ${displayLabel}`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`}
        aria-hidden="true"
      />
      {displayLabel}
    </span>
  );
}
