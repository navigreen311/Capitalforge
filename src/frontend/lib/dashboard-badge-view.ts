// ============================================================
// Resolving a status string to the badge's appearance
//
// DashboardBadge did `STATUS_MAP[status].label`. `cancelled` is a real value
// on a card application and was not in the map, so the lookup returned
// undefined and reading `.label` threw. A throw during render is not caught by
// the widget that contains it — it unwinds to the page error boundary — so a
// single unrecognised string in one table cell replaced the whole dashboard
// with "Something Went Wrong".
//
// It stayed hidden because the seeded data had no cancelled application. It
// appeared only after something cancelled one, which is why the browser suite
// passed on a fresh database and failed on a database it had been running
// against.
//
// An unknown status renders as itself, in grey. Mapping it onto the nearest
// known status would be this component deciding what an application it does
// not recognise is doing.
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
  | 'cancelled'
  | 'awaiting_ack';

export interface BadgeAppearance {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
  /** True when the status had no entry and is being shown as recorded. */
  unmapped: boolean;
}

const STATUS_MAP: Record<DashboardBadgeStatus, Omit<BadgeAppearance, 'unmapped'>> = {
  approved:     { label: 'Approved',      bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  active:       { label: 'Active',        bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  funded:       { label: 'Funded',        bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  pending:      { label: 'Pending',       bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  processing:   { label: 'Processing',    bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
  review:       { label: 'In Review',     bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  draft:        { label: 'Draft',         bg: 'bg-gray-50',     text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  inactive:     { label: 'Inactive',      bg: 'bg-gray-50',     text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  cancelled:    { label: 'Cancelled',     bg: 'bg-gray-50',     text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  declined:     { label: 'Declined',      bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  expired:      { label: 'Expired',       bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-400' },
  blocked:      { label: 'Blocked',       bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  awaiting_ack: { label: 'Awaiting Ack',  bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
};

/** Every status this badge has an entry for. */
export const KNOWN_BADGE_STATUSES = Object.keys(STATUS_MAP) as DashboardBadgeStatus[];

/**
 * Never throws, and never returns undefined. Any string is renderable.
 */
export function resolveBadgeAppearance(status: string): BadgeAppearance {
  const known = STATUS_MAP[status as DashboardBadgeStatus];
  if (known !== undefined) return { ...known, unmapped: false };

  return {
    // Shown as recorded, with underscores opened up so `awaiting_ack` reads as
    // words rather than as an identifier.
    label: status.replace(/_/g, ' ').trim() || 'Unknown',
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-gray-200',
    dot: 'bg-gray-400',
    unmapped: true,
  };
}
