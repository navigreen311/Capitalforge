'use client';

import { useMemo } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BalanceTransferPanelProps {
  card: string;
  issuer: string;
  balance: number;
  currentApr: number;
  isOpen: boolean;
  onClose: () => void;
}

interface TransferOption {
  id: string;
  cardName: string;
  issuer: string;
  introApr: number;
  introPeriodMonths: number;
  transferFeePercent: number;
  postIntroApr: number;
}

// ─── Placeholder transfer options ───────────────────────────────────────────

const TRANSFER_OPTIONS: TransferOption[] = [
  {
    id: 'bt_001',
    cardName: 'Citi Simplicity',
    issuer: 'Citi',
    introApr: 0,
    introPeriodMonths: 21,
    transferFeePercent: 3,
    postIntroApr: 19.24,
  },
  {
    id: 'bt_002',
    cardName: 'Wells Fargo Reflect',
    issuer: 'Wells Fargo',
    introApr: 0,
    introPeriodMonths: 21,
    transferFeePercent: 5,
    postIntroApr: 17.49,
  },
  {
    id: 'bt_003',
    cardName: 'BankAmericard',
    issuer: 'Bank of America',
    introApr: 0,
    introPeriodMonths: 18,
    transferFeePercent: 3,
    postIntroApr: 16.49,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function computeMonthlyInterest(balance: number, apr: number): number {
  return (balance * (apr / 100)) / 12;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BalanceTransferPanel({
  card,
  issuer,
  balance,
  currentApr,
  isOpen,
  onClose,
}: BalanceTransferPanelProps) {
  const currentMonthlyInterest = useMemo(
    () => computeMonthlyInterest(balance, currentApr),
    [balance, currentApr],
  );

  if (!isOpen) return null;

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-xl border border-gray-700 bg-gray-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-100">
              Balance Transfer Options
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {card} &middot; {issuer} &middot; {fmt(balance)} @ {currentApr}% APR
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
            aria-label="Close panel"
          >
            &#10005;
          </button>
        </div>

        {/* Current cost summary */}
        <div className="border-b border-gray-800 px-5 py-3">
          <p className="text-xs text-gray-500">
            Current monthly interest cost:{' '}
            <span className="font-semibold text-red-400">
              {fmt(currentMonthlyInterest)}
            </span>
          </p>
        </div>

        {/* Transfer options */}
        <div className="max-h-[420px] overflow-y-auto px-5 py-4 space-y-3">
          {TRANSFER_OPTIONS.map((opt) => {
            const transferFee = balance * (opt.transferFeePercent / 100);
            const monthlySavings = currentMonthlyInterest; // 0% intro means full savings
            const totalSavingsInPeriod = monthlySavings * opt.introPeriodMonths;
            const netBenefit = totalSavingsInPeriod - transferFee;

            return (
              <div
                key={opt.id}
                className="rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-600 transition-colors"
              >
                {/* Card header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-100">{opt.cardName}</p>
                    <p className="text-xs text-gray-500">{opt.issuer}</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                    {opt.introApr}% intro APR
                  </span>
                </div>

                {/* Details grid */}
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="text-gray-500">Intro period</span>
                    <p className="font-medium text-gray-300">
                      {opt.introPeriodMonths} months
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Transfer fee ({opt.transferFeePercent}%)</span>
                    <p className="font-medium text-gray-300">{fmt(transferFee)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Monthly savings</span>
                    <p className="font-medium text-emerald-400">{fmt(monthlySavings)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Post-intro APR</span>
                    <p className="font-medium text-gray-300">{opt.postIntroApr}%</p>
                  </div>
                </div>

                {/* Net benefit */}
                <div className="mt-3 flex items-center justify-between rounded-md bg-gray-950 px-3 py-2">
                  <span className="text-xs text-gray-500">
                    Net benefit after fee ({opt.introPeriodMonths} mo)
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      netBenefit >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {netBenefit >= 0 ? '+' : ''}
                    {fmt(netBenefit)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-5 py-3">
          <p className="text-[11px] text-gray-600">
            Estimates are for illustration only. Actual rates and fees may vary by issuer and
            creditworthiness.
          </p>
        </div>
      </div>
    </div>
  );
}
