'use client';

// ============================================================
// EstimatedProgressTimeline — Estimated time to next tier unlock
// Shows projected timelines for Tier 1, 2, and 3 criteria
// with Paydex trajectory and estimated unlock dates
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EstimatedProgressTimelineProps {
  paydex: number | null;
  tradelineCount: number;
  experianBusiness: number | null;
  sbss: number | null;
  businessAgeMonths: number;
}

interface TierEstimate {
  tier: number;
  label: string;
  estimatedDays: number | null;
  criteria: CriterionStatus[];
}

interface CriterionStatus {
  label: string;
  met: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYDEX_TARGET = 80;
const PAYDEX_PTS_PER_MONTH = 3;
const TRADELINE_TARGET = 5;
const DAYS_PER_TRADELINE = 14;
const EXPERIAN_TARGET = 60;
const SBSS_TARGET = 175;
const BUSINESS_AGE_TARGET_MONTHS = 24;

// ---------------------------------------------------------------------------
// Calculation helpers
// ---------------------------------------------------------------------------

function computePaydexDays(paydex: number | null): number | null {
  if (paydex === null) return null;
  if (paydex >= PAYDEX_TARGET) return 0;
  const gap = PAYDEX_TARGET - paydex;
  const months = gap / PAYDEX_PTS_PER_MONTH;
  return Math.ceil(months * 30);
}

function computeTradelineDays(tradelineCount: number): number {
  if (tradelineCount >= TRADELINE_TARGET) return 0;
  const gap = TRADELINE_TARGET - tradelineCount;
  return gap * DAYS_PER_TRADELINE;
}

function computeTier1(paydex: number | null, tradelineCount: number): TierEstimate {
  const paydexMet = paydex !== null && paydex >= PAYDEX_TARGET;
  const tradelineMet = tradelineCount >= TRADELINE_TARGET;

  const paydexDays = computePaydexDays(paydex);
  const tradelineDays = computeTradelineDays(tradelineCount);

  const criteria: CriterionStatus[] = [
    {
      label: `Paydex ${PAYDEX_TARGET}+`,
      met: paydexMet,
      detail: paydexMet
        ? 'Already met'
        : paydex !== null
          ? `${PAYDEX_TARGET - paydex} pts needed at ~${PAYDEX_PTS_PER_MONTH} pts/mo`
          : 'No Paydex score yet',
    },
    {
      label: `${TRADELINE_TARGET}+ tradelines`,
      met: tradelineMet,
      detail: tradelineMet
        ? 'Already met'
        : `${TRADELINE_TARGET - tradelineCount} more needed (~${DAYS_PER_TRADELINE}d each)`,
    },
  ];

  let estimatedDays: number | null = null;
  if (paydexDays !== null) {
    estimatedDays = Math.max(paydexDays, tradelineDays);
  } else {
    estimatedDays = null; // Cannot estimate without Paydex
  }

  if (paydexMet && tradelineMet) estimatedDays = 0;

  return { tier: 1, label: 'Tier 1 Unlock', estimatedDays, criteria };
}

function computeTier2(experianBusiness: number | null): TierEstimate {
  const met = experianBusiness !== null && experianBusiness >= EXPERIAN_TARGET;

  const criteria: CriterionStatus[] = [
    {
      label: `Experian Business ${EXPERIAN_TARGET}+`,
      met,
      detail: met
        ? 'Already met'
        : experianBusiness !== null
          ? `${EXPERIAN_TARGET - experianBusiness} pts below threshold`
          : 'No Experian Business score yet',
    },
  ];

  // Experian Business growth is harder to model; use a rough ~2 pts/month estimate
  let estimatedDays: number | null = null;
  if (met) {
    estimatedDays = 0;
  } else if (experianBusiness !== null) {
    const gap = EXPERIAN_TARGET - experianBusiness;
    estimatedDays = Math.ceil((gap / 2) * 30);
  }

  return { tier: 2, label: 'Tier 2 Unlock', estimatedDays, criteria };
}

function computeTier3(sbss: number | null, businessAgeMonths: number): TierEstimate {
  const ageMet = businessAgeMonths >= BUSINESS_AGE_TARGET_MONTHS;
  const sbssMet = sbss !== null && sbss >= SBSS_TARGET;

  const ageMonthsRemaining = ageMet ? 0 : BUSINESS_AGE_TARGET_MONTHS - businessAgeMonths;
  const ageDaysRemaining = ageMonthsRemaining * 30;

  // SBSS growth: rough ~3 pts/month with active tradeline building
  let sbssDays: number | null = null;
  if (sbssMet) {
    sbssDays = 0;
  } else if (sbss !== null) {
    const gap = SBSS_TARGET - sbss;
    sbssDays = Math.ceil((gap / 3) * 30);
  }

  const criteria: CriterionStatus[] = [
    {
      label: `${BUSINESS_AGE_TARGET_MONTHS / 12}+ years business age`,
      met: ageMet,
      detail: ageMet
        ? 'Already met'
        : `${ageMonthsRemaining} months remaining`,
    },
    {
      label: `SBSS ${SBSS_TARGET}+`,
      met: sbssMet,
      detail: sbssMet
        ? 'Already met'
        : sbss !== null
          ? `${SBSS_TARGET - sbss} pts needed at ~3 pts/mo`
          : 'No SBSS score yet',
    },
  ];

  let estimatedDays: number | null = null;
  if (ageMet && sbssMet) {
    estimatedDays = 0;
  } else if (sbssDays !== null) {
    estimatedDays = Math.max(ageDaysRemaining, sbssDays);
  } else {
    estimatedDays = ageDaysRemaining > 0 ? ageDaysRemaining : null;
  }

  return { tier: 3, label: 'Tier 3 Unlock', estimatedDays, criteria };
}

function formatDays(days: number): string {
  if (days <= 0) return 'Unlocked';
  if (days < 30) return `~${days} days`;
  const months = Math.round(days / 30);
  return months === 1 ? '~1 month' : `~${months} months`;
}

function estimatedDate(days: number): string {
  if (days <= 0) return 'Now';
  const target = new Date();
  target.setDate(target.getDate() + days);
  return target.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Tier badge colors
// ---------------------------------------------------------------------------

function tierBadgeClass(tier: number): string {
  if (tier === 1) return 'bg-blue-900 text-blue-300 border-blue-700';
  if (tier === 2) return 'bg-purple-900 text-purple-300 border-purple-700';
  return 'bg-orange-900 text-orange-300 border-orange-700';
}

// ---------------------------------------------------------------------------
// Coaching data
// ---------------------------------------------------------------------------

interface CoachingItem {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
}

const COACHING_BY_TIER: Record<number, CoachingItem[]> = {
  1: [
    {
      id: 'c1-1',
      title: 'Apply for 2 more Net-30 vendors',
      description: 'You need 5 reporting tradelines to unlock Tier 1. Browse the vendor table above and apply to at least 2 new Net-30 accounts this week.',
      actionLabel: 'View Vendors',
    },
    {
      id: 'c1-2',
      title: 'Pay all outstanding invoices early',
      description: 'Early payments push your Paydex score higher faster. Review open invoices and pay at least 10 days before due date for maximum impact.',
      actionLabel: 'View Tradelines',
    },
    {
      id: 'c1-3',
      title: 'Verify your D&B file is accurate',
      description: 'Log into D&B and confirm your business name, address, SIC code, and employee count are correct. Errors can delay your Paydex scoring.',
      actionLabel: 'Check D&B Profile',
      actionUrl: 'https://www.dnb.com/duns-number/lookup.html',
    },
  ],
  2: [
    {
      id: 'c2-1',
      title: 'Apply for Tier 2 vendors',
      description: 'With your Paydex approaching 80, you can now apply to Tier 2 vendors like Home Depot Pro and Staples Business for higher credit limits.',
      actionLabel: 'View Tier 2 Vendors',
    },
    {
      id: 'c2-2',
      title: 'Pull your Experian Business report',
      description: 'Your Experian Intelliscore needs to reach 60+. Pull a free report to check for errors and verify all tradelines are reporting correctly.',
      actionLabel: 'Check Experian',
      actionUrl: 'https://www.experian.com/small-business/business-credit-report.jsp',
    },
    {
      id: 'c2-3',
      title: 'Ensure consistent bank deposits',
      description: 'Maintain regular business bank deposits of $5,000+/month. Lenders and credit algorithms factor in cash flow stability when scoring.',
    },
  ],
  3: [
    {
      id: 'c3-1',
      title: 'Schedule credit review at SBSS 160',
      description: 'When your SBSS hits 160, schedule a review with your lender to discuss SBA Preferred Lender Program eligibility and expedited processing.',
      actionLabel: 'Set Reminder',
    },
    {
      id: 'c3-2',
      title: 'Prepare financial statements',
      description: 'Tier 3 credit products require formal financials. Prepare your P&L statement, balance sheet, and 2-year tax returns for upcoming applications.',
    },
    {
      id: 'c3-3',
      title: 'Apply for Costco Business Credit',
      description: 'With Paydex 80+ and 5+ tradelines, you qualify for Costco Business Credit (up to $50K limit). This is a strong Tier 3 tradeline that reports to Experian.',
      actionLabel: 'Apply at Costco',
      actionUrl: 'https://www.costco.com/business.html',
    },
  ],
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CoachingCards({ tier }: { tier: number }) {
  const [expanded, setExpanded] = useState(false);
  const items = COACHING_BY_TIER[tier] ?? [];

  if (items.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-semibold text-yellow-500 hover:text-yellow-400 transition-colors"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        Coach this week
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-yellow-900/40 bg-yellow-900/10 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-yellow-300">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{item.description}</p>
                </div>
                {item.actionLabel && (
                  item.actionUrl ? (
                    <a
                      href={item.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-xs font-medium text-yellow-500 hover:text-yellow-400 hover:underline whitespace-nowrap"
                    >
                      {item.actionLabel} &#x2197;
                    </a>
                  ) : (
                    <span className="flex-shrink-0 text-xs font-medium text-yellow-500/60 whitespace-nowrap">
                      {item.actionLabel}
                    </span>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TierRow({ estimate }: { estimate: TierEstimate }) {
  const allMet = estimate.criteria.every((c) => c.met);

  return (
    <div className={`rounded-lg border p-4 transition-colors ${
      allMet
        ? 'border-green-800 bg-green-900/20'
        : 'border-gray-800 bg-gray-900/50'
    }`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${tierBadgeClass(estimate.tier)}`}>
            Tier {estimate.tier}
          </span>
          <h3 className="text-sm font-semibold text-gray-200">{estimate.label}</h3>
        </div>
        <div className="text-right">
          {allMet ? (
            <span className="text-xs bg-green-900 text-green-300 border border-green-700 px-2 py-0.5 rounded font-semibold">
              UNLOCKED
            </span>
          ) : estimate.estimatedDays !== null ? (
            <div>
              <p className="text-sm font-bold text-yellow-400">{formatDays(estimate.estimatedDays)}</p>
              {estimate.estimatedDays > 0 && (
                <p className="text-xs text-gray-500">est. {estimatedDate(estimate.estimatedDays)}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">Cannot estimate yet</p>
          )}
        </div>
      </div>

      {/* Criteria list */}
      <div className="space-y-2">
        {estimate.criteria.map((c) => (
          <div key={c.label} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 flex-shrink-0 ${c.met ? 'text-green-400' : 'text-gray-500'}`}>
              {c.met ? '\u2705' : '\u25CB'}
            </span>
            <div className="flex-1 min-w-0">
              <span className={c.met ? 'text-green-300 font-semibold' : 'text-gray-300'}>
                {c.label}
              </span>
              <span className="text-gray-500 ml-1.5">&mdash; {c.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Coaching Cards */}
      <CoachingCards tier={estimate.tier} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EstimatedProgressTimeline({
  paydex,
  tradelineCount,
  experianBusiness,
  sbss,
  businessAgeMonths,
}: EstimatedProgressTimelineProps) {
  const tier1 = computeTier1(paydex, tradelineCount);
  const tier2 = computeTier2(experianBusiness);
  const tier3 = computeTier3(sbss, businessAgeMonths);

  const paydexDays = computePaydexDays(paydex);
  const hasPaydex = paydex !== null;

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-200 uppercase tracking-wide">
          Estimated Progress Timeline
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Projected timelines based on current scores and typical growth rates
        </p>
      </div>

      {/* Tier estimates */}
      <div className="space-y-3">
        <TierRow estimate={tier1} />
        <TierRow estimate={tier2} />
        <TierRow estimate={tier3} />
      </div>

      {/* Paydex trajectory footer */}
      <div className="mt-5 pt-4 border-t border-gray-800">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0" />
            <span className="text-gray-400">
              Current Paydex trajectory:{' '}
              <span className="text-yellow-400 font-semibold">
                +{PAYDEX_PTS_PER_MONTH} pts/month
              </span>
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {hasPaydex ? (
              paydex >= PAYDEX_TARGET ? (
                <span className="text-green-400 font-semibold">
                  Paydex target reached ({paydex}/{PAYDEX_TARGET})
                </span>
              ) : (
                <>
                  Estimated Paydex {PAYDEX_TARGET}+ by{' '}
                  <span className="text-yellow-400 font-semibold">
                    {estimatedDate(paydexDays!)}
                  </span>
                </>
              )
            ) : (
              <span className="italic">No Paydex score available</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
