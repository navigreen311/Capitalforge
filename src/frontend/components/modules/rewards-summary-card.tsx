'use client';

// ============================================================
// RewardsSummaryCard — total rewards earned, net benefit after
// fees, and best card per spend category with reward rate.
// ============================================================

import React from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CategoryBestCard {
  category: string;
  cardName: string;
  rewardRate: number;   // e.g. 0.03 = 3 %
  rewardType: string;   // e.g. "cash back", "points", "miles"
  iconCode: string;     // 2-char icon abbreviation
}

export interface RewardsSummaryCardProps {
  totalRewardsEarned: number;   // dollars
  totalAnnualFees: number;      // dollars
  categoryCards: CategoryBestCard[];
  /** Optional additional CSS classes */
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDollars(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// ─── Icon colour mapping by category ─────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, { bg: string; text: string }> = {
  Travel:       { bg: 'bg-blue-100',    text: 'text-blue-700' },
  Dining:       { bg: 'bg-orange-100',  text: 'text-orange-700' },
  Office:       { bg: 'bg-purple-100',  text: 'text-purple-700' },
  Fuel:         { bg: 'bg-amber-100',   text: 'text-amber-700' },
  Advertising:  { bg: 'bg-teal-100',    text: 'text-teal-700' },
  Utilities:    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  Shipping:     { bg: 'bg-indigo-100',  text: 'text-indigo-700' },
  General:      { bg: 'bg-gray-100',    text: 'text-gray-600' },
};

function categoryColour(category: string) {
  return CATEGORY_COLOURS[category] ?? CATEGORY_COLOURS['General'];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricBlock({
  label,
  value,
  valueClass = 'text-gray-900',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold tracking-tight leading-none ${valueClass}`}>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RewardsSummaryCard({
  totalRewardsEarned,
  totalAnnualFees,
  categoryCards,
  className = '',
}: RewardsSummaryCardProps) {
  const netBenefit = totalRewardsEarned - totalAnnualFees;
  const netPositive = netBenefit >= 0;

  return (
    <div
      className={`bg-white rounded-xl border border-surface-border shadow-card overflow-hidden ${className}`}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-surface-border">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Rewards Summary</h3>
          <p className="text-xs text-gray-500 mt-0.5">Annualised across all corporate cards</p>
        </div>
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg
                     bg-brand-navy/5 text-brand-navy text-xs font-bold"
          aria-hidden="true"
        >
          RW
        </span>
      </div>

      {/* ── KPI row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-surface-border border-b border-surface-border">
        <div className="px-5 py-4">
          <MetricBlock
            label="Total Rewards Earned"
            value={formatDollars(totalRewardsEarned)}
            valueClass="text-emerald-600"
          />
        </div>
        <div className="px-5 py-4">
          <MetricBlock
            label="Total Annual Fees"
            value={formatDollars(totalAnnualFees)}
            valueClass="text-red-500"
          />
        </div>
        <div className="px-5 py-4">
          <MetricBlock
            label="Net Benefit"
            value={formatDollars(netBenefit)}
            valueClass={netPositive ? 'text-emerald-600' : 'text-red-500'}
          />
          <p
            className={`text-xs font-medium mt-1 ${
              netPositive ? 'text-emerald-600' : 'text-red-500'
            }`}
          >
            {netPositive ? '↑ Ahead of fees' : '↓ Fees exceed rewards'}
          </p>
        </div>
      </div>

      {/* ── Best card per category ───────────────────────────── */}
      <div className="p-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Best Card by Spend Category
        </p>
        <div className="space-y-2">
          {categoryCards.map((item) => {
            const { bg, text } = categoryColour(item.category);
            return (
              <div
                key={item.category}
                className="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface-overlay
                           hover:bg-gray-50 transition-colors duration-100"
              >
                {/* Category icon */}
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg
                               text-[10px] font-bold flex-shrink-0 ${bg} ${text}`}
                  aria-hidden="true"
                >
                  {item.iconCode}
                </span>

                {/* Category + card name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 leading-tight truncate">
                    {item.category}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{item.cardName}</p>
                </div>

                {/* Rate badge */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-bold text-brand-navy leading-tight">
                    {formatRate(item.rewardRate)}
                  </p>
                  <p className="text-[10px] text-gray-400">{item.rewardType}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
