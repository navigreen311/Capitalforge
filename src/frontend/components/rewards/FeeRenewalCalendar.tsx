'use client';

// ============================================================
// FeeRenewalCalendar — Annual fee renewal calendar showing
// upcoming fee dates sorted by renewal date, with color-coded
// action recommendations (keep / cancel / review).
// ============================================================

import React from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeeRenewalCard {
  card: string;
  issuer: string;
  renewalDate: string;
  annualFee: number;
  recommendation: 'keep' | 'cancel' | 'review';
}

export interface FeeRenewalCalendarProps {
  cards: FeeRenewalCard[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDollars(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sortByRenewalDate(cards: FeeRenewalCard[]): FeeRenewalCard[] {
  return [...cards].sort(
    (a, b) => new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime(),
  );
}

// ─── Recommendation config ──────────────────────────────────────────────────

const RECOMMENDATION_CONFIG: Record<
  FeeRenewalCard['recommendation'],
  { label: (dateStr: string) => string; textClass: string; bgClass: string; dotClass: string }
> = {
  keep: {
    label: () => 'Keep',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-400/10',
    dotClass: 'bg-emerald-400',
  },
  cancel: {
    label: (dateStr: string) => `Cancel before ${formatDate(dateStr)}`,
    textClass: 'text-red-400',
    bgClass: 'bg-red-400/10',
    dotClass: 'bg-red-400',
  },
  review: {
    label: () => 'Consider fee waiver',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-400/10',
    dotClass: 'bg-amber-400',
  },
};

// ─── Placeholder data ────────────────────────────────────────────────────────

const PLACEHOLDER_CARDS: FeeRenewalCard[] = [
  {
    card: 'Active Cash',
    issuer: 'Wells Fargo',
    renewalDate: '2026-04-15',
    annualFee: 125,
    recommendation: 'cancel',
  },
  {
    card: 'Double Cash',
    issuer: 'Citi',
    renewalDate: '2026-05-01',
    annualFee: 99,
    recommendation: 'review',
  },
  {
    card: 'Ink Business Preferred',
    issuer: 'Chase',
    renewalDate: '2026-06-30',
    annualFee: 95,
    recommendation: 'keep',
  },
];

// ─── Row sub-component ──────────────────────────────────────────────────────

function RenewalRow({ item }: { item: FeeRenewalCard }) {
  const config = RECOMMENDATION_CONFIG[item.recommendation];
  const actionLabel = config.label(item.renewalDate);

  return (
    <div
      className="flex items-center gap-4 py-3 px-4 rounded-lg bg-white/[0.03]
                 hover:bg-white/[0.06] transition-colors duration-100"
    >
      {/* Status dot */}
      <span
        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.dotClass}`}
        aria-hidden="true"
      />

      {/* Card name & issuer */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100 leading-tight truncate">
          {item.card}
        </p>
        <p className="text-xs text-gray-500 truncate">{item.issuer}</p>
      </div>

      {/* Renewal date */}
      <div className="flex-shrink-0 text-right w-28">
        <p className="text-sm text-gray-300">{formatDate(item.renewalDate)}</p>
      </div>

      {/* Fee amount */}
      <div className="flex-shrink-0 text-right w-20">
        <p className="text-sm font-semibold text-gray-100">
          {formatDollars(item.annualFee)}
        </p>
      </div>

      {/* Action label */}
      <div className="flex-shrink-0 w-44 text-right">
        <span
          className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md
                      ${config.textClass} ${config.bgClass}`}
        >
          {actionLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function FeeRenewalCalendar({ cards = PLACEHOLDER_CARDS }: FeeRenewalCalendarProps) {
  const sorted = sortByRenewalDate(cards);
  const totalFees = sorted.reduce((sum, c) => sum + c.annualFee, 0);

  return (
    <section aria-label="Annual Fee Renewal Calendar">
      <div className="bg-gray-900 rounded-xl border border-gray-700/50 shadow-card overflow-hidden">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-700/50">
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Annual Fee Renewal Calendar
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {sorted.length} card{sorted.length !== 1 ? 's' : ''} &middot;{' '}
              {formatDollars(totalFees)} total annual fees
            </p>
          </div>
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg
                       bg-gray-700/40 text-gray-400 text-xs font-bold"
            aria-hidden="true"
          >
            FC
          </span>
        </div>

        {/* ── Column headers ───────────────────────────────────── */}
        <div className="flex items-center gap-4 px-4 py-2 mx-2 mt-2 text-[10px] font-semibold
                        text-gray-500 uppercase tracking-wider">
          <span className="w-2.5" />
          <span className="flex-1">Card</span>
          <span className="w-28 text-right">Renewal Date</span>
          <span className="w-20 text-right">Fee</span>
          <span className="w-44 text-right">Action</span>
        </div>

        {/* ── Card rows ────────────────────────────────────────── */}
        <div className="px-2 pb-4 space-y-1">
          {sorted.map((item) => (
            <RenewalRow key={`${item.issuer}-${item.card}-${item.renewalDate}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
