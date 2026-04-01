'use client';

// ============================================================
// SequencingSummary — Header stats and full plan summary for
// the multi-round sequencing section of the optimizer.
// ============================================================

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SequencingRound {
  round: number;
  label: string;
  cards: string[];
  creditMin: number;
  creditMax: number;
  waitDays: number | null;
}

export interface SequencingSummaryProps {
  rounds: SequencingRound[];
  totalMonths: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a number as USD with no decimals: $15,000 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Calculate a future date label from today + cumulative days. */
function getFutureLabel(cumulativeDays: number): string {
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + cumulativeDays);
  return future.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Build the timing description for each round.
 * Round 1 is always "Apply now". Subsequent rounds show
 * the projected date and the wait duration relative to the previous round.
 */
function getRoundTiming(
  roundIndex: number,
  cumulativeDays: number,
  waitDays: number | null,
): string {
  if (roundIndex === 0) return 'Apply now';
  if (waitDays === null) return 'Apply now';

  const dateLabel = getFutureLabel(cumulativeDays);
  const months = Math.round(waitDays / 30);

  if (waitDays < 90) {
    return `${dateLabel} (${waitDays} days)`;
  }
  return `${dateLabel} (${months} month${months !== 1 ? 's' : ''} after R${roundIndex})`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeaderStats({ rounds, totalMonths, totalMin, totalMax, totalWaitMonths }: {
  rounds: SequencingRound[];
  totalMonths: number;
  totalMin: number;
  totalMax: number;
  totalWaitMonths: number;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
        Multi-Round Sequencing
        <span className="ml-2 font-normal text-slate-400">
          — {rounds.length}-round plan over {totalMonths} months
        </span>
      </h3>
      <p className="text-xs text-slate-400">
        Estimated total credit: {formatCurrency(totalMin)}–{formatCurrency(totalMax)}
        <span className="mx-2">|</span>
        Total wait periods: ~{totalWaitMonths} month{totalWaitMonths !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

function PlanTable({ rounds, cumulativeDaysByRound, totalMin, totalMax, totalMonths }: {
  rounds: SequencingRound[];
  cumulativeDaysByRound: number[];
  totalMin: number;
  totalMax: number;
  totalMonths: number;
}) {
  return (
    <div className="mt-6 rounded-lg border border-slate-700 bg-slate-800/60 p-4 font-mono text-sm">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">
        Full Plan Summary
      </p>

      <div className="space-y-1.5 text-slate-300">
        {rounds.map((r, i) => {
          const creditRange = `${formatCurrency(r.creditMin)}–${formatCurrency(r.creditMax)}`;
          const timing = getRoundTiming(i, cumulativeDaysByRound[i], r.waitDays);

          return (
            <div key={r.round} className="flex gap-2">
              <span className="flex-shrink-0 text-slate-500">
                Round {r.round}:
              </span>
              <span className="flex-shrink-0">{creditRange}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">{timing}</span>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="my-3 border-t border-slate-700" aria-hidden="true" />

      {/* Totals */}
      <p className="font-semibold text-slate-200">
        Total Est. Credit: {formatCurrency(totalMin)}–{formatCurrency(totalMax)} over {totalMonths} months
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SequencingSummary({ rounds, totalMonths }: SequencingSummaryProps) {
  // Aggregate credit totals
  const totalMin = rounds.reduce((sum, r) => sum + r.creditMin, 0);
  const totalMax = rounds.reduce((sum, r) => sum + r.creditMax, 0);

  // Compute cumulative wait days for date projection
  const cumulativeDaysByRound: number[] = [];
  let cumDays = 0;
  for (const r of rounds) {
    cumulativeDaysByRound.push(cumDays);
    if (r.waitDays !== null) {
      cumDays += r.waitDays;
    }
  }

  // Total wait in months (approximate)
  const totalWaitMonths = Math.round(cumDays / 30);

  return (
    <div className="rounded-xl bg-slate-900 p-5 shadow-lg">
      <HeaderStats
        rounds={rounds}
        totalMonths={totalMonths}
        totalMin={totalMin}
        totalMax={totalMax}
        totalWaitMonths={totalWaitMonths}
      />

      <PlanTable
        rounds={rounds}
        cumulativeDaysByRound={cumulativeDaysByRound}
        totalMin={totalMin}
        totalMax={totalMax}
        totalMonths={totalMonths}
      />
    </div>
  );
}
