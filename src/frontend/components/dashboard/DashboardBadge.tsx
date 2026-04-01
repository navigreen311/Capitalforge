'use client';

// ============================================================
// DashboardBadge — Extended status badge for dashboard views
//
// Handles all standard BadgeStatus values plus dashboard-specific
// statuses: 'blocked' and 'awaiting_ack'.
// ============================================================

export type DashboardBadgeStatus =
  | 'approved'
  | 'pending'
  | 'declined'
  | 'review'
  | 'inactive'
  | 'draft'
  | 'active'
  | 'funded'
  | 'expired'
  | 'processing'
  | 'blocked'
  | 'awaiting_ack';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const STATUS_MAP: Record<DashboardBadgeStatus, StatusConfig> = {
  approved:     { label: 'Approved',      bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  active:       { label: 'Active',        bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  funded:       { label: 'Funded',        bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  pending:      { label: 'Pending',       bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  processing:   { label: 'Processing',    bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
  review:       { label: 'In Review',     bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  draft:        { label: 'Draft',         bg: 'bg-gray-50',     text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  inactive:     { label: 'Inactive',      bg: 'bg-gray-50',     text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  declined:     { label: 'Declined',      bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  expired:      { label: 'Expired',       bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-400' },
  blocked:      { label: 'Blocked',       bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  awaiting_ack: { label: 'Awaiting Ack',  bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
};

interface DashboardBadgeProps {
  status: DashboardBadgeStatus;
  /** Override the display label */
  label?: string;
  className?: string;
}

export function DashboardBadge({ status, label, className = '' }: DashboardBadgeProps) {
  const cfg = STATUS_MAP[status];
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
