'use client';

// ============================================================
// PointsBalancePanel — Card strip showing points balance,
// estimated dollar value, best redemption tip, and a
// "Redeem Now" link per card. Warns if a card marked for
// cancellation still has unredeemed points.
// ============================================================

import React from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PointsBalanceCard {
  id: string;
  program: string;
  cardName: string;
  /** Raw points balance (or dollar amount for cash-back). */
  balance: number;
  /** Whether balance is already in dollars (cash-back programs). */
  isCash: boolean;
  /** Estimated dollar value based on best redemption. */
  estimatedValue: number;
  /** Short redemption tip text. */
  redemptionTip: string;
  /** True when the underlying card is marked for cancellation. */
  markedForCancellation?: boolean;
}

export interface PointsBalancePanelProps {
  cards: PointsBalanceCard[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDollars(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPoints(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

// ─── Placeholder data ────────────────────────────────────────────────────────

export const POINTS_BALANCE_PLACEHOLDER: PointsBalanceCard[] = [
  {
    id: 'pb-01',
    program: 'Amex Membership Rewards',
    cardName: 'Amex Business Platinum',
    balance: 124580,
    isCash: false,
    estimatedValue: 2491,
    redemptionTip: 'Transfer to airline partners for 2cpp+ value',
    markedForCancellation: false,
  },
  {
    id: 'pb-02',
    program: 'Chase Ultimate Rewards',
    cardName: 'Chase Ink Preferred',
    balance: 87420,
    isCash: false,
    estimatedValue: 1748,
    redemptionTip: 'Book travel via Chase portal at 1.25cpp or transfer to Hyatt',
    markedForCancellation: false,
  },
  {
    id: 'pb-03',
    program: 'Capital One Cash Back',
    cardName: 'Capital One Spark Cash+',
    balance: 984,
    isCash: true,
    estimatedValue: 984,
    redemptionTip: 'Redeem as statement credit or direct deposit',
    markedForCancellation: false,
  },
  {
    id: 'pb-04',
    program: 'Wells Fargo Rewards',
    cardName: 'Wells Fargo Bus. Elite',
    balance: 4200,
    isCash: false,
    estimatedValue: 42,
    redemptionTip: 'Redeem points before cancellation — value drops after close',
    markedForCancellation: true,
  },
];

// ─── Single card sub-component ───────────────────────────────────────────────

function BalanceCard({ card }: { card: PointsBalanceCard }) {
  const atRisk = card.markedForCancellation && card.estimatedValue > 0;

  return (
    <div
      className={`relative flex flex-col justify-between rounded-xl border p-5
                  bg-gray-900 transition-colors duration-100 hover:bg-white/[0.04]
                  ${atRisk
                    ? 'border-red-500/60 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]'
                    : 'border-gray-700/50'}`}
    >
      {/* At-risk badge */}
      {atRisk && (
        <div className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full
                        bg-red-500/10 border border-red-500/30 px-2.5 py-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">
            At Risk
          </span>
        </div>
      )}

      {/* Program name */}
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {card.program}
      </p>

      {/* Balance display */}
      <div className="mb-1">
        <p className="text-2xl font-bold text-gray-100 leading-tight">
          {card.isCash
            ? formatDollars(card.balance)
            : `${formatPoints(card.balance)} pts`}
        </p>
        {!card.isCash && (
          <p className="text-sm text-gray-400 mt-0.5">
            {formatDollars(card.estimatedValue)} estimated value
          </p>
        )}
        {card.isCash && (
          <p className="text-sm text-gray-400 mt-0.5">
            Cash back balance
          </p>
        )}
      </div>

      {/* Redemption tip */}
      <div className="mt-3 rounded-lg bg-white/[0.03] border border-gray-700/40 px-3 py-2">
        <p className="text-xs text-gray-400 leading-relaxed">
          <span className="font-semibold text-brand-gold">Tip:</span>{' '}
          {card.redemptionTip}
        </p>
      </div>

      {/* Redeem link */}
      <div className="mt-4">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-semibold
                     text-brand-gold hover:text-brand-gold/80
                     transition-colors duration-150"
          onClick={() => {
            // Placeholder — will navigate to issuer redemption portal
          }}
        >
          Redeem Now
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PointsBalancePanel({
  cards = POINTS_BALANCE_PLACEHOLDER,
}: PointsBalancePanelProps) {
  const totalValue = cards.reduce((sum, c) => sum + c.estimatedValue, 0);
  const atRiskCount = cards.filter((c) => c.markedForCancellation && c.estimatedValue > 0).length;

  return (
    <section aria-label="Points Balance">
      <div className="space-y-4">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-100">
              Points &amp; Cash Back Balances
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {cards.length} program{cards.length !== 1 ? 's' : ''} &middot;{' '}
              {formatDollars(totalValue)} total estimated value
            </p>
          </div>

          {atRiskCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10
                             border border-red-500/30 px-3 py-1 text-xs font-semibold text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {atRiskCount} at risk
            </span>
          )}
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => (
            <BalanceCard key={card.id} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}
