'use client';

// ============================================================
// StackSummaryPanel — Combined stack estimate summary shown
// after card recommendations. Displays aggregated credit
// estimates, APR windows, fees, and net usable capital.
// ============================================================

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StackSummaryPanelProps {
  cardsRecommended: number;
  cardNames: string[];
  creditMin: number;
  creditMax: number;
  introAprExpMin: string; // ISO date
  introAprExpMax: string; // ISO date
  programFeeEstimate: number;
  netCapitalMin: number;
  netCapitalMax: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number as US currency (e.g. $15,000). */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Calculate the number of whole months between today and a future ISO date.
 * Returns at least 1 if the date is in the future.
 */
function monthsUntil(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth());
  return Math.max(months, 0);
}

/** Format an ISO date as "MMM YYYY" (e.g. "May 2027"). */
function formatMonthYear(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StackSummaryPanel({
  cardsRecommended,
  cardNames,
  creditMin,
  creditMax,
  introAprExpMin,
  introAprExpMax,
  programFeeEstimate,
  netCapitalMin,
  netCapitalMax,
}: StackSummaryPanelProps) {
  const durationMin = monthsUntil(introAprExpMin);
  const durationMax = monthsUntil(introAprExpMax);

  const expiryMin = formatMonthYear(introAprExpMin);
  const expiryMax = formatMonthYear(introAprExpMax);

  const cardList = cardNames.join(' + ');

  // Build duration string — collapse to single value when min === max
  const durationStr =
    durationMin === durationMax
      ? `${durationMin} months`
      : `${durationMin}\u2013${durationMax} months`;

  // Build expiry string — collapse when identical
  const expiryStr =
    expiryMin === expiryMax ? expiryMin : `${expiryMin}\u2013${expiryMax}`;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-5">
      {/* Header */}
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
        Round 1 Stack Summary
      </h3>

      {/* Summary rows */}
      <dl className="space-y-3 text-sm">
        <Row
          label="Cards recommended"
          value={`${cardsRecommended} (${cardList})`}
        />
        <Row
          label="Combined credit estimate"
          value={`${formatCurrency(creditMin)}\u2013${formatCurrency(creditMax)}`}
        />
        <Row label="Total intro APR duration" value={durationStr} />
        <Row
          label="If applied today, APR windows expire"
          value={expiryStr}
        />
        <Row
          label="Program fee estimate"
          value={formatCurrency(programFeeEstimate)}
        />
        <Row
          label="Net usable capital"
          value={`${formatCurrency(netCapitalMin)}\u2013${formatCurrency(netCapitalMax)} (after estimated fees)`}
          highlight
        />
      </dl>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-gray-400">{label}:</dt>
      <dd
        className={
          highlight
            ? 'font-semibold text-emerald-400'
            : 'font-medium text-gray-100'
        }
      >
        {value}
      </dd>
    </div>
  );
}
