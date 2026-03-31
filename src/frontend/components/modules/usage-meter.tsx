'use client';

// ============================================================
// UsageMeter — SaaS usage progress bar with overage warnings.
// - Progress bar: current vs limit
// - Warning state at >= 80% (amber)
// - Blocked state at >= 100% (red)
// - Plan name + upgrade CTA
// ============================================================

interface UsageMeterProps {
  planName: string;
  metricLabel: string;   // e.g. "API Calls", "Seats", "Transactions"
  current: number;
  limit: number;
  unit?: string;         // e.g. "calls", "seats" — shown after numbers
  onUpgrade?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getPct(current: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(Math.round((current / limit) * 100), 100);
}

interface StatusConfig {
  barClass: string;
  trackClass: string;
  labelClass: string;
  badgeClass: string;
  badgeLabel: string;
  showWarning: boolean;
}

function getStatus(pct: number): StatusConfig {
  if (pct >= 100) {
    return {
      barClass: 'bg-red-500',
      trackClass: 'bg-red-950',
      labelClass: 'text-red-400',
      badgeClass: 'bg-red-900 text-red-300 border-red-700',
      badgeLabel: 'BLOCKED',
      showWarning: true,
    };
  }
  if (pct >= 80) {
    return {
      barClass: 'bg-amber-500',
      trackClass: 'bg-amber-950',
      labelClass: 'text-amber-400',
      badgeClass: 'bg-amber-900 text-amber-300 border-amber-700',
      badgeLabel: 'OVERAGE RISK',
      showWarning: true,
    };
  }
  return {
    barClass: 'bg-[#C9A84C]',
    trackClass: 'bg-gray-800',
    labelClass: 'text-green-400',
    badgeClass: '',
    badgeLabel: '',
    showWarning: false,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UsageMeter({
  planName,
  metricLabel,
  current,
  limit,
  unit = '',
  onUpgrade,
  className = '',
}: UsageMeterProps) {
  const pct = getPct(current, limit);
  const status = getStatus(pct);
  const isBlocked = pct >= 100;

  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-900 p-4 ${className}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
            {metricLabel}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#C9A84C] bg-[#0A1628] border border-[#C9A84C]/30 px-2 py-0.5 rounded">
              {planName}
            </span>
            {status.showWarning && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${status.badgeClass}`}>
                {status.badgeLabel}
              </span>
            )}
          </div>
        </div>

        {/* Upgrade CTA */}
        <button
          onClick={onUpgrade}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 transition-colors whitespace-nowrap flex-shrink-0"
        >
          {isBlocked ? 'Unblock Now' : 'Upgrade Plan'}
        </button>
      </div>

      {/* Progress bar */}
      <div className={`w-full h-3 rounded-full overflow-hidden ${status.trackClass}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${status.barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Footer — usage numbers */}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-gray-400">
          <span className={`font-bold ${status.labelClass}`}>
            {formatNum(current)}{unit ? ` ${unit}` : ''}
          </span>
          {' '}<span className="text-gray-600">of</span>{' '}
          <span className="text-gray-300 font-medium">
            {formatNum(limit)}{unit ? ` ${unit}` : ''}
          </span>
        </p>
        <p className={`text-xs font-bold tabular-nums ${status.labelClass}`}>
          {pct}%
        </p>
      </div>

      {/* Blocked message */}
      {isBlocked && (
        <div className="mt-3 rounded-lg bg-red-950 border border-red-800 px-3 py-2">
          <p className="text-xs text-red-300 font-semibold">
            Usage limit reached. New requests are being blocked.
            Upgrade your plan to restore access immediately.
          </p>
        </div>
      )}

      {/* Overage warning (not blocked) */}
      {status.showWarning && !isBlocked && (
        <div className="mt-3 rounded-lg bg-amber-950 border border-amber-800 px-3 py-2">
          <p className="text-xs text-amber-300 font-semibold">
            Approaching limit — {100 - pct}% remaining. Upgrade to avoid service interruption.
          </p>
        </div>
      )}
    </div>
  );
}
