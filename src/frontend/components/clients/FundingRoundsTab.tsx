'use client';

// ============================================================
// FundingRoundsTab — Client detail page tab showing funding
// round progress, cards breakdown, economics, and history.
// ============================================================

import React, { useState } from 'react';
import { SectionCard } from '@/components/ui/card';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FundingRoundsTabProps {
  clientId: string;
  clientName: string;
  readinessScore: number;
}

interface CardInRound {
  name: string;
  issuer: string;
  limit: number;
  status: 'approved' | 'draft' | 'submitted';
  statusIcon: string;
  statusLabel: string;
  aprDaysRemaining: number | null;
}

// ─── Placeholder Data ───────────────────────────────────────────────────────

const CURRENT_ROUND = {
  roundNumber: 1,
  roundId: 'FR-018',
  startDate: 'Jan 15, 2026',
  targetClose: 'Apr 30, 2026',
  advisor: 'Sarah Chen',
  achieved: 105_000,
  target: 150_000,
  cardsApproved: 3,
  cardsTarget: 5,
};

const CARDS_IN_ROUND: CardInRound[] = [
  {
    name: 'Ink Bus. Pref.',
    issuer: 'Chase',
    limit: 45_000,
    status: 'approved',
    statusIcon: '\u2705',
    statusLabel: 'Appvd',
    aprDaysRemaining: 49,
  },
  {
    name: 'Ink Bus. Cash',
    issuer: 'Chase',
    limit: 25_000,
    status: 'draft',
    statusIcon: '\uD83D\uDCDD',
    statusLabel: 'Draft',
    aprDaysRemaining: null,
  },
  {
    name: 'Bus. Adv. Cash',
    issuer: 'BofA',
    limit: 35_000,
    status: 'submitted',
    statusIcon: '\uD83D\uDD04',
    statusLabel: 'Submt',
    aprDaysRemaining: null,
  },
];

const ROUND_ECONOMICS = {
  programFee: 4_750,
  programFeePaidDate: 'Jan 15, 2026',
  fundingFee: 1_800,
  totalProjectedCost: 6_550,
  netUsableCapital: 98_450,
  effectiveCostRate: 6.25,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

function progressColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function aprExpiryDisplay(days: number | null): React.ReactNode {
  if (days === null) {
    return <span className="text-gray-400">&mdash;</span>;
  }

  let colorClass = 'text-green-600';
  if (days < 15) {
    colorClass = 'text-red-500 font-semibold';
  } else if (days < 60) {
    colorClass = 'text-amber-500 font-semibold';
  }

  return <span className={`text-sm tabular-nums ${colorClass}`}>{days}d left</span>;
}

function statusBadgeStyle(status: CardInRound['status']): string {
  switch (status) {
    case 'approved':
      return 'bg-green-50 text-green-700';
    case 'draft':
      return 'bg-gray-100 text-gray-600';
    case 'submitted':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar({ pct, achieved, target }: { pct: number; achieved: number; target: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">
          {formatCurrency(achieved)} / {formatCurrency(target)}
        </span>
        <span className="tabular-nums text-gray-500">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100">
        <div
          className={`h-2.5 rounded-full transition-all ${progressColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FundingRoundsTab({ clientId, clientName, readinessScore }: FundingRoundsTabProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const canStartRound2 = readinessScore >= 75;
  const progressPct = Math.round((CURRENT_ROUND.achieved / CURRENT_ROUND.target) * 100);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Funding Rounds</h2>
        <div className="relative">
          <button
            disabled={!canStartRound2}
            onMouseEnter={() => !canStartRound2 && setTooltipVisible(true)}
            onMouseLeave={() => setTooltipVisible(false)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              canStartRound2
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            + Start Round 2
          </button>
          {tooltipVisible && !canStartRound2 && (
            <div className="absolute right-0 top-full mt-2 z-10 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
              Client must reach Readiness Score 75+ before starting Round 2
              <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 bg-gray-900" />
            </div>
          )}
        </div>
      </div>

      {/* ── Current Round Card ──────────────────────────────────────────────── */}
      <SectionCard
        title={`Round ${CURRENT_ROUND.roundNumber}`}
        subtitle={CURRENT_ROUND.roundId}
        action={
          <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
            In Progress
          </span>
        }
      >
        <div className="space-y-4">
          {/* Metadata row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Start Date</p>
              <p className="font-medium text-gray-900">{CURRENT_ROUND.startDate}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Target Close</p>
              <p className="font-medium text-gray-900">{CURRENT_ROUND.targetClose}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Assigned Advisor</p>
              <p className="font-medium text-gray-900">{CURRENT_ROUND.advisor}</p>
            </div>
          </div>

          {/* Progress bar */}
          <ProgressBar
            pct={progressPct}
            achieved={CURRENT_ROUND.achieved}
            target={CURRENT_ROUND.target}
          />

          {/* Cards approved summary */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Cards approved:</span>
            <span className="font-semibold text-gray-900">
              {CURRENT_ROUND.cardsApproved}
            </span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500">Target: {CURRENT_ROUND.cardsTarget}</span>
          </div>
        </div>
      </SectionCard>

      {/* ── Cards in This Round ─────────────────────────────────────────────── */}
      <SectionCard title="Cards in This Round" flushBody>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Card</th>
                <th className="px-6 py-3">Issuer</th>
                <th className="px-6 py-3 text-right">Limit</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">APR Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {CARDS_IN_ROUND.map((card) => (
                <tr key={card.name} className="hover:bg-gray-50/50">
                  <td className="px-6 py-3 font-medium text-gray-900">{card.name}</td>
                  <td className="px-6 py-3 text-gray-600">{card.issuer}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                    {formatCurrency(card.limit)}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusBadgeStyle(card.status)}`}
                    >
                      {card.statusIcon} {card.statusLabel}
                    </span>
                  </td>
                  <td className="px-6 py-3">{aprExpiryDisplay(card.aprDaysRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Round Economics ──────────────────────────────────────────────────── */}
      <SectionCard title="Round Economics">
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Program Fee</dt>
            <dd className="font-medium text-gray-900">
              {formatCurrency(ROUND_ECONOMICS.programFee)}{' '}
              <span className="text-xs text-gray-400">(paid {ROUND_ECONOMICS.programFeePaidDate})</span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">% of Funding Fee</dt>
            <dd className="font-medium text-gray-900">
              {formatCurrency(ROUND_ECONOMICS.fundingFee)}{' '}
              <span className="text-xs text-amber-500">(pending &mdash; on approval)</span>
            </dd>
          </div>
          <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
            <dt className="text-gray-500">Total Projected Cost</dt>
            <dd className="font-semibold text-gray-900">
              {formatCurrency(ROUND_ECONOMICS.totalProjectedCost)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Net Usable Capital</dt>
            <dd className="font-semibold text-gray-900">
              {formatCurrency(ROUND_ECONOMICS.netUsableCapital)}{' '}
              <span className="text-xs text-gray-400">(after fees)</span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Effective Cost Rate</dt>
            <dd className="font-semibold text-gray-900">{ROUND_ECONOMICS.effectiveCostRate}%</dd>
          </div>
        </dl>
      </SectionCard>

      {/* ── Previous Rounds ─────────────────────────────────────────────────── */}
      <SectionCard title="Previous Rounds">
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">
            This is the first round for this client.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
