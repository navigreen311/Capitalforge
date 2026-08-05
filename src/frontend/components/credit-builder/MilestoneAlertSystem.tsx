// ============================================================
// MilestoneAlertSystem — Dismissible alert/toast stack for
// credit-builder milestones (Paydex 80, 5 tradelines, etc.)
// ============================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// The rule for when a milestone has been reached lives in lib/credit-milestones
// so it can be tested without rendering. Re-exported here because the page and
// the barrel already import it from this module.
export { checkMilestones } from '@/lib/credit-milestones';
export type { MilestoneAlert, ProgressData } from '@/lib/credit-milestones';

import type { MilestoneAlert } from '@/lib/credit-milestones';

export interface MilestoneAlertSystemProps {
  alerts: MilestoneAlert[];
  onDismiss: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const alertStyles: Record<MilestoneAlert['type'], { border: string; bg: string; icon: string; iconColor: string }> = {
  success: {
    border: 'border-green-600/40',
    bg: 'bg-green-950/40',
    icon: '\u2705',
    iconColor: 'text-green-400',
  },
  info: {
    border: 'border-blue-600/40',
    bg: 'bg-blue-950/40',
    icon: '\u2139\uFE0F',
    iconColor: 'text-blue-400',
  },
  warning: {
    border: 'border-amber-600/40',
    bg: 'bg-amber-950/40',
    icon: '\u26A0\uFE0F',
    iconColor: 'text-amber-400',
  },
};

// ---------------------------------------------------------------------------
// AlertCard sub-component
// ---------------------------------------------------------------------------

interface AlertCardProps {
  alert: MilestoneAlert;
  onDismiss: (id: string) => void;
}

function AlertCard({ alert, onDismiss }: AlertCardProps) {
  const styles = alertStyles[alert.type];

  return (
    <div
      role="alert"
      className={`relative flex items-start gap-3 rounded-xl border ${styles.border} ${styles.bg} p-4`}
    >
      {/* Icon */}
      <span className={`mt-0.5 text-lg ${styles.iconColor}`} aria-hidden="true">
        {styles.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-100">{alert.title}</p>
        <p className="text-sm text-gray-400 mt-0.5">{alert.message}</p>

        {alert.action && (
          <a
            href={alert.action.url}
            className="inline-block mt-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            {alert.action.label}
          </a>
        )}
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => onDismiss(alert.id)}
        className="flex-shrink-0 rounded-md p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        aria-label={`Dismiss ${alert.title}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MilestoneAlertSystem({ alerts, onDismiss }: MilestoneAlertSystemProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 mb-6">
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
