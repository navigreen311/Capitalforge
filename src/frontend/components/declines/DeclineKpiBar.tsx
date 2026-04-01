'use client';

// ============================================================
// DeclineKpiBar — 5 KPI stat cards for the declines page header
// ============================================================

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeclineKpiBarProps {
  totalDeclines: number;
  reconInReview: number;
  reversed: number;
  eligibleNow: number;
  winRate: number; // percentage
  reconsInitiated: number;
  onStatClick?: (filter: string) => void;
}

interface StatCardConfig {
  key: string;
  label: string;
  textColor: string;
  getValue: (props: DeclineKpiBarProps) => string;
}

// ── Card configuration ──────────────────────────────────────────────────────

const STAT_CARDS: StatCardConfig[] = [
  {
    key: 'total_declines',
    label: 'Total Declines',
    textColor: 'text-white',
    getValue: (p) => p.totalDeclines.toLocaleString(),
  },
  {
    key: 'recon_in_review',
    label: 'Recon In Review',
    textColor: 'text-yellow-400',
    getValue: (p) => p.reconInReview.toLocaleString(),
  },
  {
    key: 'reversed',
    label: 'Reversed',
    textColor: 'text-green-400',
    getValue: (p) => p.reversed.toLocaleString(),
  },
  {
    key: 'eligible_now',
    label: 'Eligible Now',
    textColor: 'text-blue-400',
    getValue: (p) => p.eligibleNow.toLocaleString(),
  },
  {
    key: 'win_rate',
    label: 'Win Rate',
    textColor: 'text-amber-400',
    getValue: (p) => `${p.winRate}% (${p.reversed} of ${p.reconsInitiated})`,
  },
];

// ── DeclineKpiBar ───────────────────────────────────────────────────────────

export function DeclineKpiBar(props: DeclineKpiBarProps) {
  const { onStatClick } = props;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {STAT_CARDS.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => onStatClick?.(card.key)}
          className="bg-gray-900/50 border border-gray-800 rounded-xl p-5
                     text-left transition-colors duration-150
                     hover:bg-gray-800/60 hover:border-gray-700
                     focus:outline-none focus:ring-2 focus:ring-gray-600"
        >
          <p className="text-sm font-medium text-gray-400 mb-1">
            {card.label}
          </p>
          <p className={`text-2xl font-bold tracking-tight ${card.textColor}`}>
            {card.getValue(props)}
          </p>
        </button>
      ))}
    </div>
  );
}
