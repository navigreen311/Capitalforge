'use client';

// ============================================================
// FollowUpTracker — follow-up date display for decline table
// rows. Shows overdue / due-today / upcoming states with
// color-coded text. Compact dark-theme inline component.
// ============================================================

// ── Types ────────────────────────────────────────────────────

export interface FollowUpTrackerProps {
  reconStatus: string;
  letterSentDate: string | null;
  followUpDate: string | null;
}

// ── Helpers ──────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / msPerDay);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ────────────────────────────────────────────────

export function FollowUpTracker({
  reconStatus,
  letterSentDate,
  followUpDate,
}: FollowUpTrackerProps) {
  // Statuses where follow-up tracking is not applicable
  const inactiveStatuses = ['not_started', 'denied', 'approved'];

  if (inactiveStatuses.includes(reconStatus)) {
    return <span className="text-xs text-gray-500">&mdash;</span>;
  }

  // Active statuses: in_review, scheduled
  if (!followUpDate) {
    return <span className="text-xs text-gray-500 italic">No date set</span>;
  }

  const today = new Date();
  const target = new Date(followUpDate + 'T00:00:00');
  const daysUntil = daysBetween(today, target);

  let textColor: string;
  let label: string;

  if (daysUntil < 0) {
    // Overdue
    textColor = 'text-red-400';
    label = `Overdue — ${formatShortDate(followUpDate)}`;
  } else if (daysUntil === 0) {
    // Due today
    textColor = 'text-red-400';
    label = 'Due Today';
  } else if (daysUntil <= 3) {
    // Within 3 days
    textColor = 'text-amber-400';
    label = `${formatShortDate(followUpDate)} (${daysUntil}d)`;
  } else {
    // Further out
    textColor = 'text-gray-400';
    label = `${formatShortDate(followUpDate)} (${daysUntil}d)`;
  }

  // Calculate days since letter was sent
  const sentSubtitle =
    letterSentDate != null
      ? (() => {
          const sent = new Date(letterSentDate + 'T00:00:00');
          const daysSinceSent = daysBetween(sent, today);
          return daysSinceSent >= 0 ? `sent ${daysSinceSent}d ago` : null;
        })()
      : null;

  return (
    <span className="inline-flex flex-col leading-tight">
      <span className={`text-xs font-medium ${textColor}`}>{label}</span>
      {sentSubtitle && (
        <span className="text-[10px] text-gray-500">{sentSubtitle}</span>
      )}
    </span>
  );
}
