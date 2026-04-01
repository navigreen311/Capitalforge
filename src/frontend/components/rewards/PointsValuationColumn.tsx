'use client';

// ============================================================
// PointsValuationColumn — Points valuation display for the
// spend routing table. Shows point count with a subtitle
// indicating cash and travel redemption values based on
// the loyalty program's valuation rates.
// ============================================================

import React from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Cents-per-point valuations for major loyalty programs. */
export const POINT_VALUES: Record<string, { cash: number; travel: number }> = {
  'Amex Membership Rewards': { cash: 0.006, travel: 0.012 },
  'Chase Ultimate Rewards':  { cash: 0.010, travel: 0.020 },
  'Capital One Miles':       { cash: 0.010, travel: 0.018 },
  'Citi ThankYou':           { cash: 0.010, travel: 0.016 },
  'Cash Back':               { cash: 1.000, travel: 1.000 },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PointsValuationColumnProps {
  points: number;
  program: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a dollar value compactly (e.g. "$12.00" or "$1,200.00"). */
function formatDollar(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a point count with commas (e.g. "1,500 pts"). */
function formatPoints(points: number): string {
  return `${new Intl.NumberFormat('en-US').format(points)} pts`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PointsValuationColumn({ points, program }: PointsValuationColumnProps) {
  const rates = POINT_VALUES[program];

  // Fall back to raw point display when program is unrecognised
  if (!rates) {
    return (
      <span className="text-sm font-medium text-zinc-200">
        {formatPoints(points)}
      </span>
    );
  }

  const cashValue = points * rates.cash;
  const travelValue = points * rates.travel;

  return (
    <span className="inline-flex flex-col leading-tight" title={`${program}: ${formatDollar(cashValue)} cash / ${formatDollar(travelValue)} travel`}>
      <span className="text-sm font-medium text-zinc-200">
        {formatPoints(points)}
      </span>
      <span className="text-xs text-zinc-500">
        ({formatDollar(cashValue)} cash / {formatDollar(travelValue)} travel)
      </span>
    </span>
  );
}
