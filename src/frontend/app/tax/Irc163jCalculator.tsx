'use client';

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxDocument {
  id: string;
  type: string;
  taxYear: number;
  status: 'Generated';
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Irc163jCalculator({
  year,
  onGenerateDocument,
}: {
  year: number;
  onGenerateDocument: (doc: TaxDocument) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ati, setAti] = useState<string>('');
  const [totalInterestExpense, setTotalInterestExpense] = useState<string>('');
  const [businessInterestIncome, setBusinessInterestIncome] = useState<string>('');

  const calc = useMemo(() => {
    const atiVal = parseFloat(ati.replace(/,/g, '')) || 0;
    const expenseVal = parseFloat(totalInterestExpense.replace(/,/g, '')) || 0;
    const incomeVal = parseFloat(businessInterestIncome.replace(/,/g, '')) || 0;

    const atiLimitation = Math.round(atiVal * 0.3);
    const netBusinessInterestExpense = Math.max(0, expenseVal - incomeVal);
    const deductibleAmount = Math.min(netBusinessInterestExpense, atiLimitation + incomeVal);
    const disallowedCarryForward = Math.max(0, netBusinessInterestExpense - atiLimitation);
    const withinLimit = netBusinessInterestExpense <= atiLimitation;

    return {
      atiLimitation,
      netBusinessInterestExpense,
      deductibleAmount,
      disallowedCarryForward,
      withinLimit,
      hasValues: atiVal > 0 || expenseVal > 0 || incomeVal > 0,
    };
  }, [ati, totalInterestExpense, businessInterestIncome]);

  function handleGenerateSummary() {
    const doc: TaxDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'IRC §163(j) Summary',
      taxYear: year,
      status: 'Generated',
      generatedAt: new Date().toISOString(),
    };
    onGenerateDocument(doc);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#C9A84C] uppercase tracking-wide">
            IRC &#167;163(j) Calculator
          </span>
          <span className="text-[10px] font-semibold bg-blue-900 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Interactive
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-5">
          <p className="text-xs text-gray-500 mb-4">
            Enter your figures below to calculate the IRC &#167;163(j) business interest expense
            limitation. The limitation is 30% of Adjusted Taxable Income (ATI).
          </p>

          {/* Input fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            {/* ATI */}
            <label className="block">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                Adjusted Taxable Income (ATI)
              </span>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="text"
                  value={ati}
                  onChange={(e) => setAti(e.target.value.replace(/[^0-9,.]/g, ''))}
                  placeholder="0"
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-[#C9A84C] placeholder-gray-600 transition-colors"
                />
              </div>
            </label>

            {/* Total Business Interest Expense */}
            <label className="block">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                Total Business Interest Expense
              </span>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="text"
                  value={totalInterestExpense}
                  onChange={(e) => setTotalInterestExpense(e.target.value.replace(/[^0-9,.]/g, ''))}
                  placeholder="0"
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-[#C9A84C] placeholder-gray-600 transition-colors"
                />
              </div>
            </label>

            {/* Business Interest Income */}
            <label className="block">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                Business Interest Income
              </span>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="text"
                  value={businessInterestIncome}
                  onChange={(e) => setBusinessInterestIncome(e.target.value.replace(/[^0-9,.]/g, ''))}
                  placeholder="0"
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-[#C9A84C] placeholder-gray-600 transition-colors"
                />
              </div>
            </label>
          </div>

          {/* Results */}
          {calc.hasValues && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                    30% ATI Limitation
                  </p>
                  <p className="text-lg font-black mt-1 text-blue-400">
                    {fmtCurrency(calc.atiLimitation)}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                    Net Business Interest Expense
                  </p>
                  <p className="text-lg font-black mt-1 text-gray-100">
                    {fmtCurrency(calc.netBusinessInterestExpense)}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                    Deductible Amount
                  </p>
                  <p className={`text-lg font-black mt-1 ${calc.withinLimit ? 'text-emerald-400' : 'text-emerald-400'}`}>
                    {fmtCurrency(calc.deductibleAmount)}
                  </p>
                </div>

                <div className={`rounded-lg px-3 py-3 ${
                  calc.disallowedCarryForward > 0
                    ? 'bg-red-950/40 border border-red-800'
                    : 'bg-gray-800 border border-gray-700'
                }`}>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                    Disallowed / Carried Forward
                  </p>
                  <p className={`text-lg font-black mt-1 ${
                    calc.disallowedCarryForward > 0 ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    {fmtCurrency(calc.disallowedCarryForward)}
                  </p>
                </div>
              </div>

              {/* Status indicator */}
              <div className={`rounded-lg px-3 py-2.5 text-xs mb-4 ${
                calc.withinLimit
                  ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
                  : 'bg-red-950/40 border border-red-800 text-red-300'
              }`}>
                {calc.withinLimit ? (
                  <>
                    <span className="font-semibold">Within Limit:</span> Your net business interest
                    expense of {fmtCurrency(calc.netBusinessInterestExpense)} is within the 30% ATI
                    limitation of {fmtCurrency(calc.atiLimitation)}. The full amount is deductible.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Over Limit:</span> Your net business interest
                    expense of {fmtCurrency(calc.netBusinessInterestExpense)} exceeds the 30% ATI
                    limitation of {fmtCurrency(calc.atiLimitation)}. {fmtCurrency(calc.disallowedCarryForward)} will
                    be disallowed and carried forward to the next tax year per IRC &#167;163(j)(2).
                  </>
                )}
              </div>

              {/* Generate button */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handleGenerateSummary}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[#C9A84C] text-gray-950 hover:bg-[#d4b65e] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generate &#167;163(j) Summary Document &#10022;
                </button>
              </div>
            </>
          )}

          {/* Disclaimer */}
          <div className="mt-4 rounded-lg bg-gray-800/60 border border-gray-700/50 px-3 py-2.5">
            <p className="text-[11px] text-gray-500 italic">
              This is an estimate only. Consult a qualified tax advisor for accurate IRC &#167;163(j)
              calculations specific to your tax situation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
