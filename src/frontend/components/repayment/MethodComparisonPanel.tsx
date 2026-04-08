'use client';

// ============================================================
// MethodComparisonPanel — Side-by-side comparison of Avalanche
// vs Snowball payoff strategies below the repayment plans table.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface MethodStats {
  totalInterest: number;
  months: number;
  savesVsMinimum: number;
}

export interface MethodComparisonPanelProps {
  method: 'avalanche' | 'snowball';
  avalanche: MethodStats;
  snowball: MethodStats;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const METHOD_META: Record<'avalanche' | 'snowball', { label: string; description: string }> = {
  avalanche: {
    label: 'Avalanche',
    description: 'Highest APR paid first \u2014 minimizes total interest',
  },
  snowball: {
    label: 'Snowball',
    description: 'Smallest balance paid first \u2014 builds momentum',
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export function MethodComparisonPanel({ method, avalanche, snowball }: MethodComparisonPanelProps) {
  const methods: Array<{ key: 'avalanche' | 'snowball'; stats: MethodStats }> = [
    { key: 'avalanche', stats: avalanche },
    { key: 'snowball', stats: snowball },
  ];

  // 5F: Calculate delta between strategies
  const interestDelta = Math.abs(avalanche.totalInterest - snowball.totalInterest);
  const monthsDelta = Math.abs(avalanche.months - snowball.months);
  const avalancheWins = avalanche.totalInterest < snowball.totalInterest;
  const winner = avalancheWins ? 'Avalanche' : 'Snowball';

  return (
    <div className="space-y-4">
      {/* 5F: Savings delta comparison banner */}
      {interestDelta > 0 && (
        <div className="rounded-xl border-2 border-[#C9A84C]/40 bg-[#C9A84C]/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/40 flex items-center justify-center flex-shrink-0">
              <span className="text-[#C9A84C] text-lg font-bold">&#916;</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Choosing <span className="text-[#C9A84C]">{winner}</span> saves you{' '}
                <span className="text-[#C9A84C]">{formatCurrency(interestDelta)}</span> more
                {monthsDelta > 0 && (
                  <> and pays off <span className="text-[#C9A84C]">{monthsDelta} month{monthsDelta > 1 ? 's' : ''} faster</span></>
                )} vs {avalancheWins ? 'Snowball' : 'Avalanche'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Based on current balances, APRs, and allocated payment amounts
              </p>
            </div>
          </div>
        </div>
      )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {methods.map(({ key, stats }) => {
        const isActive = key === method;
        const meta = METHOD_META[key];

        return (
          <div
            key={key}
            className={`
              rounded-xl border-2 p-4 transition-all duration-150
              bg-brand-navy-900 text-gray-100
              ${isActive
                ? 'border-brand-gold shadow-card-hover'
                : 'border-brand-navy-700 opacity-80'}
            `}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold tracking-wide text-white">
                {meta.label}
              </h3>
              {isActive && (
                <span className="inline-flex items-center rounded-full bg-brand-gold/20 px-2 py-0.5 text-2xs font-semibold text-brand-gold">
                  Currently selected
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-xs text-gray-400 mb-4">{meta.description}</p>

            {/* Stats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Total Interest</span>
                <span className="text-sm font-bold text-white">
                  {formatCurrency(stats.totalInterest)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Months to Payoff</span>
                <span className="text-sm font-bold text-white">
                  {stats.months}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Savings vs Minimum</span>
                <span className="text-sm font-bold text-emerald-400">
                  {formatCurrency(stats.savesVsMinimum)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
