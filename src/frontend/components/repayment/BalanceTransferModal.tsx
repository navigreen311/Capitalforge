'use client';

// ============================================================
// BalanceTransferModal — Full-featured balance transfer recommender.
//
// Displays: current card balance/APR/monthly interest cost,
// table of 3 eligible transfer cards with fees, promo periods,
// net savings calculation, and "Apply for Transfer Card" CTA.
// ============================================================

import { useMemo } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface BalanceTransferModalProps {
  card: string;
  issuer: string;
  balance: number;
  currentApr: number;
  isOpen: boolean;
  onClose: () => void;
  onApply?: (transferCardId: string) => void;
}

interface TransferCard {
  id: string;
  cardName: string;
  issuer: string;
  transferApr: number;
  transferFeePercent: number;
  promoPeriodMonths: number;
  postPromoApr: number;
}

// ── Placeholder eligible transfer cards ─────────────────────────────────────

const ELIGIBLE_TRANSFER_CARDS: TransferCard[] = [
  {
    id: 'tc_001',
    cardName: 'Citi Simplicity for Business',
    issuer: 'Citi',
    transferApr: 0,
    transferFeePercent: 3,
    promoPeriodMonths: 21,
    postPromoApr: 19.24,
  },
  {
    id: 'tc_002',
    cardName: 'Wells Fargo Reflect',
    issuer: 'Wells Fargo',
    transferApr: 0,
    transferFeePercent: 5,
    promoPeriodMonths: 21,
    postPromoApr: 17.49,
  },
  {
    id: 'tc_003',
    cardName: 'BankAmericard Business',
    issuer: 'Bank of America',
    transferApr: 0,
    transferFeePercent: 3,
    promoPeriodMonths: 18,
    postPromoApr: 16.49,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDetailed(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function monthlyInterestCost(balance: number, apr: number): number {
  return (balance * (apr / 100)) / 12;
}

// ── Component ───────────────────────────────────────────────────────────────

export function BalanceTransferModal({
  card,
  issuer,
  balance,
  currentApr,
  isOpen,
  onClose,
  onApply,
}: BalanceTransferModalProps) {
  const currentMonthly = useMemo(
    () => monthlyInterestCost(balance, currentApr),
    [balance, currentApr],
  );

  if (!isOpen) return null;

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Modal container */}
      <div className="relative w-full max-w-2xl mx-4 rounded-xl border border-gray-700 bg-gray-950 shadow-2xl max-h-[90vh] flex flex-col">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Balance Transfer Recommender</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Find the best transfer option for your card
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
            aria-label="Close modal"
          >
            &#10005;
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Current card summary */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">
              Current Card
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">Card</p>
                <p className="text-sm font-medium text-gray-100">{card}</p>
                <p className="text-xs text-gray-500">{issuer}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Balance</p>
                <p className="text-sm font-bold text-white">{fmt(balance)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">APR</p>
                <p className="text-sm font-bold text-red-400">{currentApr}%</p>
              </div>
            </div>
            <div className="mt-3 rounded-md bg-gray-950 px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">Monthly interest cost</span>
              <span className="text-sm font-bold text-red-400">{fmtDetailed(currentMonthly)}/mo</span>
            </div>
          </div>

          {/* Eligible transfer cards table */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">
              Eligible Transfer Cards
            </p>
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-semibold">Card</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Transfer APR</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Transfer Fee</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Promo Period</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Net Savings</th>
                    <th className="text-center px-4 py-2.5 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {ELIGIBLE_TRANSFER_CARDS.map((tc) => {
                    const transferFee = balance * (tc.transferFeePercent / 100);
                    // During promo, monthly savings = full current interest (since transfer APR is 0%)
                    const interestSavedInPromo = currentMonthly * tc.promoPeriodMonths;
                    const netSavings = interestSavedInPromo - transferFee;

                    return (
                      <tr
                        key={tc.id}
                        className="bg-[#0A1628] hover:bg-gray-900/50 transition-colors"
                      >
                        {/* Card name */}
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-100">{tc.cardName}</p>
                          <p className="text-xs text-gray-500">{tc.issuer}</p>
                        </td>

                        {/* Transfer APR */}
                        <td className="px-4 py-3 text-right">
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                            {tc.transferApr}%
                          </span>
                        </td>

                        {/* Transfer fee */}
                        <td className="px-4 py-3 text-right">
                          <p className="text-gray-200 font-medium">{fmt(transferFee)}</p>
                          <p className="text-xs text-gray-500">({tc.transferFeePercent}%)</p>
                        </td>

                        {/* Promo period */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-gray-200 font-medium">{tc.promoPeriodMonths} months</span>
                        </td>

                        {/* Net savings */}
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`text-sm font-bold ${
                              netSavings >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {netSavings >= 0 ? '+' : ''}{fmt(netSavings)}
                          </span>
                        </td>

                        {/* Apply button */}
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => onApply?.(tc.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#C9A84C] px-3 py-1.5 text-xs font-semibold text-[#0A1628] hover:bg-[#D4B85D] transition-colors"
                          >
                            Apply &rarr;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Savings summary */}
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-4">
            <p className="text-xs text-emerald-400 font-semibold mb-1">Best Option</p>
            {(() => {
              const best = ELIGIBLE_TRANSFER_CARDS.reduce((best, tc) => {
                const fee = balance * (tc.transferFeePercent / 100);
                const savings = currentMonthly * tc.promoPeriodMonths - fee;
                const bestFee = balance * (best.transferFeePercent / 100);
                const bestSavings = currentMonthly * best.promoPeriodMonths - bestFee;
                return savings > bestSavings ? tc : best;
              });
              const bestFee = balance * (best.transferFeePercent / 100);
              const bestNet = currentMonthly * best.promoPeriodMonths - bestFee;
              return (
                <p className="text-sm text-gray-300">
                  Transfer to <span className="font-semibold text-white">{best.cardName}</span> to
                  save an estimated{' '}
                  <span className="font-bold text-emerald-400">{fmt(bestNet)}</span> over{' '}
                  {best.promoPeriodMonths} months at {best.transferApr}% intro APR.
                </p>
              );
            })()}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="border-t border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-gray-600">
            Estimates are for illustration only. Actual rates and fees may vary.
          </p>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
