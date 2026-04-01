'use client';

// ============================================================
// /tax — Tax Reporting Center
// IRC §163(j) deductibility summary card, year-end fee
// summary table by card, business-purpose substantiation
// score gauge, export buttons (CSV/JSON/PDF), year selector.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExportFormat = 'csv' | 'json' | 'pdf';

interface Card163jSummary {
  cardName: string;
  issuer: string;
  last4: string;
  totalInterest: number;
  deductibleAmount: number;
  nonDeductibleAmount: number;
  limitationApplied: boolean;
  atiBasis: number;       // ATI = Adjusted Taxable Income basis used
}

interface CardFeeSummary {
  cardName: string;
  issuer: string;
  last4: string;
  annualFee: number;
  lateFees: number;
  foreignTransactionFees: number;
  otherFees: number;
  totalFees: number;
  deductible: boolean;
}

interface SubstantiationItem {
  category: string;
  totalTransactions: number;
  substantiated: number;
  score: number;       // 0-100
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const DATA_BY_YEAR: Record<
  number,
  {
    cards163j: Card163jSummary[];
    cardFees: CardFeeSummary[];
    substantiation: SubstantiationItem[];
    atiLimit: number;
    totalInterest: number;
    totalDeductible: number;
    carryforwardAmount: number;
  }
> = {
  2025: {
    atiLimit: pct30_ati(2_840_000),
    totalInterest: 92_400,
    totalDeductible: 78_200,
    carryforwardAmount: 14_200,
    cards163j: [
      { cardName: 'Ink Business Preferred', issuer: 'Chase',          last4: '4821', totalInterest: 28_400, deductibleAmount: 24_100, nonDeductibleAmount: 4_300,  limitationApplied: true,  atiBasis: 2_840_000 },
      { cardName: 'Business Platinum',      issuer: 'Amex',           last4: '9034', totalInterest: 34_600, deductibleAmount: 29_400, nonDeductibleAmount: 5_200,  limitationApplied: true,  atiBasis: 2_840_000 },
      { cardName: 'Spark Cash Plus',        issuer: 'Capital One',    last4: '7712', totalInterest: 14_200, deductibleAmount: 12_800, nonDeductibleAmount: 1_400,  limitationApplied: false, atiBasis: 2_840_000 },
      { cardName: 'Business Advantage',     issuer: 'Bank of America', last4: '3390', totalInterest: 9_640,  deductibleAmount: 7_400,  nonDeductibleAmount: 2_240,  limitationApplied: false, atiBasis: 2_840_000 },
      { cardName: 'Business AAdvantage',    issuer: 'Citi',           last4: '5521', totalInterest: 5_560,  deductibleAmount: 4_500,  nonDeductibleAmount: 1_060,  limitationApplied: false, atiBasis: 2_840_000 },
    ],
    cardFees: [
      { cardName: 'Ink Business Preferred', issuer: 'Chase',          last4: '4821', annualFee: 95,   lateFees: 0,   foreignTransactionFees: 0,   otherFees: 0,   totalFees: 95,   deductible: true  },
      { cardName: 'Business Platinum',      issuer: 'Amex',           last4: '9034', annualFee: 695,  lateFees: 0,   foreignTransactionFees: 120, otherFees: 0,   totalFees: 815,  deductible: true  },
      { cardName: 'Spark Cash Plus',        issuer: 'Capital One',    last4: '7712', annualFee: 150,  lateFees: 39,  foreignTransactionFees: 0,   otherFees: 0,   totalFees: 189,  deductible: false },
      { cardName: 'Business Advantage',     issuer: 'Bank of America', last4: '3390', annualFee: 0,    lateFees: 0,   foreignTransactionFees: 0,   otherFees: 45,  totalFees: 45,   deductible: true  },
      { cardName: 'Business AAdvantage',    issuer: 'Citi',           last4: '5521', annualFee: 99,   lateFees: 0,   foreignTransactionFees: 55,  otherFees: 0,   totalFees: 154,  deductible: true  },
    ],
    substantiation: [
      { category: 'Travel',              totalTransactions: 48,  substantiated: 46, score: 96 },
      { category: 'Software/SaaS',       totalTransactions: 124, substantiated: 124, score: 100 },
      { category: 'Meals & Entertainment', totalTransactions: 62, substantiated: 41, score: 66 },
      { category: 'Office Supplies',     totalTransactions: 35,  substantiated: 33, score: 94 },
      { category: 'Shipping',            totalTransactions: 19,  substantiated: 14, score: 74 },
      { category: 'Advertising',         totalTransactions: 27,  substantiated: 22, score: 81 },
    ],
  },
  2024: {
    atiLimit: pct30_ati(2_540_000),
    totalInterest: 74_800,
    totalDeductible: 68_200,
    carryforwardAmount: 6_600,
    cards163j: [
      { cardName: 'Ink Business Preferred', issuer: 'Chase',          last4: '4821', totalInterest: 22_000, deductibleAmount: 20_400, nonDeductibleAmount: 1_600,  limitationApplied: false, atiBasis: 2_540_000 },
      { cardName: 'Business Platinum',      issuer: 'Amex',           last4: '9034', totalInterest: 28_100, deductibleAmount: 24_900, nonDeductibleAmount: 3_200,  limitationApplied: true,  atiBasis: 2_540_000 },
      { cardName: 'Spark Cash Plus',        issuer: 'Capital One',    last4: '7712', totalInterest: 12_400, deductibleAmount: 12_400, nonDeductibleAmount: 0,      limitationApplied: false, atiBasis: 2_540_000 },
      { cardName: 'Business Advantage',     issuer: 'Bank of America', last4: '3390', totalInterest: 8_100,  deductibleAmount: 7_200,  nonDeductibleAmount: 900,    limitationApplied: false, atiBasis: 2_540_000 },
      { cardName: 'Business AAdvantage',    issuer: 'Citi',           last4: '5521', totalInterest: 4_200,  deductibleAmount: 3_300,  nonDeductibleAmount: 900,    limitationApplied: false, atiBasis: 2_540_000 },
    ],
    cardFees: [
      { cardName: 'Ink Business Preferred', issuer: 'Chase',          last4: '4821', annualFee: 95,   lateFees: 0,   foreignTransactionFees: 0,   otherFees: 0,   totalFees: 95,   deductible: true  },
      { cardName: 'Business Platinum',      issuer: 'Amex',           last4: '9034', annualFee: 695,  lateFees: 0,   foreignTransactionFees: 80,  otherFees: 0,   totalFees: 775,  deductible: true  },
      { cardName: 'Spark Cash Plus',        issuer: 'Capital One',    last4: '7712', annualFee: 150,  lateFees: 0,   foreignTransactionFees: 0,   otherFees: 0,   totalFees: 150,  deductible: false },
      { cardName: 'Business Advantage',     issuer: 'Bank of America', last4: '3390', annualFee: 0,    lateFees: 0,   foreignTransactionFees: 0,   otherFees: 30,  totalFees: 30,   deductible: true  },
      { cardName: 'Business AAdvantage',    issuer: 'Citi',           last4: '5521', annualFee: 99,   lateFees: 39,  foreignTransactionFees: 42,  otherFees: 0,   totalFees: 180,  deductible: true  },
    ],
    substantiation: [
      { category: 'Travel',              totalTransactions: 42,  substantiated: 38, score: 90 },
      { category: 'Software/SaaS',       totalTransactions: 108, substantiated: 108, score: 100 },
      { category: 'Meals & Entertainment', totalTransactions: 55, substantiated: 32, score: 58 },
      { category: 'Office Supplies',     totalTransactions: 29,  substantiated: 25, score: 86 },
      { category: 'Shipping',            totalTransactions: 16,  substantiated: 10, score: 63 },
      { category: 'Advertising',         totalTransactions: 22,  substantiated: 17, score: 77 },
    ],
  },
};

function pct30_ati(ati: number) { return Math.round(ati * 0.3); }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function scoreColor(score: number): string {
  if (score >= 90) return '#22c55e';
  if (score >= 75) return '#eab308';
  if (score >= 60) return '#f97316';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Strong';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Moderate';
  return 'Weak';
}

const AVAILABLE_YEARS = [2025, 2024];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section163jCard({
  total, deductible, nonDeductible, carryforward, atiLimit,
}: {
  total: number; deductible: number; nonDeductible: number; carryforward: number; atiLimit: number;
}) {
  const deductiblePct = total > 0 ? Math.round((deductible / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-[#C9A84C]/40 bg-[#0A1628] p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-[#C9A84C] uppercase tracking-wide">IRC §163(j) Summary</h2>
          <p className="text-xs text-gray-500 mt-0.5">Business interest expense deductibility</p>
        </div>
        <span className="text-[10px] font-semibold bg-blue-900 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
          30% ATI Limit
        </span>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Interest',      value: fmtCurrency(total),        color: 'text-gray-100' },
          { label: 'Deductible',          value: fmtCurrency(deductible),   color: 'text-emerald-400' },
          { label: 'Non-Deductible',      value: fmtCurrency(nonDeductible), color: nonDeductible > 0 ? 'text-red-400' : 'text-gray-500' },
          { label: 'Carryforward',        value: fmtCurrency(carryforward), color: carryforward > 0 ? 'text-yellow-400' : 'text-gray-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
            <p className={`text-lg font-black mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ATI limit bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">Deductible Interest vs. 30% ATI Limit</span>
          <span className="text-xs font-semibold text-gray-300">
            {fmtCurrency(deductible)} / {fmtCurrency(atiLimit)}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#C9A84C] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.round((deductible / atiLimit) * 100))}%` }}
          />
        </div>
        <p className="text-[11px] text-gray-600 mt-1">
          {fmtPct(deductible, atiLimit)} of ATI limit utilized · ATI basis {fmtCurrency(atiLimit / 0.3)}
        </p>
      </div>

      {/* Deductible breakdown bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">Deductible Ratio</span>
          <span className="text-xs font-semibold text-emerald-400">{deductiblePct}% deductible</span>
        </div>
        <div className="h-2 rounded-full bg-gray-800 overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${deductiblePct}%` }} />
          <div className="h-full bg-red-700 transition-all duration-500" style={{ width: `${100 - deductiblePct}%` }} />
        </div>
      </div>

      {carryforward > 0 && (
        <div className="mt-4 rounded-lg bg-yellow-950/50 border border-yellow-800 px-3 py-2.5 text-xs text-yellow-300">
          <span className="font-semibold">Carryforward Notice:</span> {fmtCurrency(carryforward)} of non-deductible
          business interest carries forward to the next tax year per IRC §163(j)(2).
        </div>
      )}
    </div>
  );
}

function SubstantiationGauge({ items }: { items: SubstantiationItem[] }) {
  const overall = items.length
    ? Math.round(items.reduce((acc, i) => acc + i.score, 0) / items.length)
    : 0;

  const color = scoreColor(overall);
  const size = 120;
  const radius = 44;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - overall / 100);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-4">
        Business-Purpose Substantiation
      </h2>

      <div className="flex items-start gap-6 flex-wrap">
        {/* Gauge */}
        <div className="flex flex-col items-center">
          <svg width={size} height={size} aria-label={`Substantiation score ${overall}`}>
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={10} />
            <circle
              cx={cx} cy={cy} r={radius} fill="none"
              stroke={color} strokeWidth={10} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={24} fontWeight="900" fill={color}>{overall}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#6b7280">/ 100</text>
          </svg>
          <p className="text-xs font-semibold mt-1" style={{ color }}>{scoreLabel(overall)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Overall Score</p>
        </div>

        {/* Per-category breakdown */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {items.map(({ category, totalTransactions, substantiated, score }) => (
            <div key={category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300 font-medium truncate">{category}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-gray-500">
                    {substantiated}/{totalTransactions}
                  </span>
                  <span
                    className="text-[10px] font-bold w-8 text-right"
                    style={{ color: scoreColor(score) }}
                  >
                    {score}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {overall < 75 && (
        <div className="mt-4 rounded-lg bg-orange-950/40 border border-orange-800 px-3 py-2.5 text-xs text-orange-300">
          <span className="font-semibold">IRS Audit Risk:</span> Substantiation below 75% increases audit exposure.
          Improve business-purpose documentation for Meals &amp; Entertainment and Shipping categories.
        </div>
      )}
    </div>
  );
}

function ExportButtons({ year }: { year: number }) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  async function handleExport(fmt: ExportFormat) {
    setExporting(fmt);
    await new Promise((r) => setTimeout(r, 1200));
    setExporting(null);
    alert(`Exported FY ${year} tax report as ${fmt.toUpperCase()} — stub`);
  }

  const formats: { fmt: ExportFormat; label: string; icon: string }[] = [
    { fmt: 'csv',  label: 'CSV',  icon: 'C' },
    { fmt: 'json', label: 'JSON', icon: 'J' },
    { fmt: 'pdf',  label: 'PDF',  icon: 'P' },
  ];

  return (
    <div className="flex items-center gap-2">
      {formats.map(({ fmt, label, icon }) => (
        <button
          key={fmt}
          onClick={() => handleExport(fmt)}
          disabled={exporting !== null}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-gray-700 bg-gray-900 text-gray-300 hover:text-[#C9A84C] hover:border-[#C9A84C] transition-colors disabled:opacity-50"
        >
          <span
            className="h-4 w-4 rounded text-[9px] font-black flex items-center justify-center bg-gray-800 text-gray-400"
            aria-hidden
          >
            {icon}
          </span>
          {exporting === fmt ? 'Exporting…' : `Export ${label}`}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TaxPage() {
  const [year, setYear] = useState<number>(2025);
  const data = DATA_BY_YEAR[year];

  const totalFees = data.cardFees.reduce((acc, c) => acc + c.totalFees, 0);
  const deductibleFees = data.cardFees.filter((c) => c.deductible).reduce((acc, c) => acc + c.totalFees, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tax Reporting Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            IRC §163(j) deductibility · fee summaries · substantiation scores
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Year selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="year-select" className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
              Tax Year
            </label>
            <select
              id="year-select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-gray-900 border border-gray-700 text-gray-200 text-sm font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#C9A84C] transition-colors cursor-pointer"
            >
              {AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>FY {y}</option>
              ))}
            </select>
          </div>

          <ExportButtons year={year} />
        </div>
      </div>

      {/* §163(j) Summary card */}
      <div className="mb-6">
        <Section163jCard
          total={data.totalInterest}
          deductible={data.totalDeductible}
          nonDeductible={data.totalInterest - data.totalDeductible}
          carryforward={data.carryforwardAmount}
          atiLimit={data.atiLimit}
        />
      </div>

      {/* §163(j) per-card breakdown */}
      <div className="rounded-xl border border-gray-800 overflow-hidden mb-6">
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">
            Interest Deductibility by Card
          </h2>
          <span className="text-[10px] text-gray-600">FY {year}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-950 border-b border-gray-800">
              <th className="text-left px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Card</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Total Interest</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Deductible</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Non-Deductible</th>
              <th className="text-left px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Limitation</th>
              <th className="px-4 py-2.5 hidden sm:table-cell" />
            </tr>
          </thead>
          <tbody>
            {data.cards163j.map((card, i) => (
              <tr
                key={card.last4}
                className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900'}`}
              >
                <td className="px-4 py-3">
                  <p className="text-gray-200 font-semibold text-xs">{card.cardName}</p>
                  <p className="text-[10px] text-gray-500">
                    {card.issuer} ···{card.last4}
                  </p>
                </td>
                <td className="px-4 py-3 text-right text-gray-300 font-medium">
                  {fmtCurrency(card.totalInterest)}
                </td>
                <td className="px-4 py-3 text-right text-emerald-400 font-semibold">
                  {fmtCurrency(card.deductibleAmount)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={card.nonDeductibleAmount > 0 ? 'text-red-400 font-semibold' : 'text-gray-600'}>
                    {fmtCurrency(card.nonDeductibleAmount)}
                  </span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {card.limitationApplied ? (
                    <span className="text-[10px] font-bold bg-orange-900 text-orange-300 border border-orange-700 px-1.5 py-0.5 rounded-full">
                      Applied
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-600">None</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {/* Deductible ratio bar */}
                  <div className="w-20">
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: `${card.totalInterest > 0 ? Math.round((card.deductibleAmount / card.totalInterest) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-0.5 text-right">
                      {card.totalInterest > 0 ? Math.round((card.deductibleAmount / card.totalInterest) * 100) : 0}%
                    </p>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-900">
              <td className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</td>
              <td className="px-4 py-3 text-right font-bold text-gray-100">{fmtCurrency(data.totalInterest)}</td>
              <td className="px-4 py-3 text-right font-bold text-emerald-400">{fmtCurrency(data.totalDeductible)}</td>
              <td className="px-4 py-3 text-right font-bold text-red-400">{fmtCurrency(data.totalInterest - data.totalDeductible)}</td>
              <td colSpan={2} className="hidden sm:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Year-end fee summary */}
      <div className="rounded-xl border border-gray-800 overflow-hidden mb-6">
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Year-End Fee Summary</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {fmtCurrency(deductibleFees)} deductible of {fmtCurrency(totalFees)} total
            </span>
            <span className="text-[10px] text-gray-600">FY {year}</span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-950 border-b border-gray-800">
              <th className="text-left px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Card</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Annual</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Late</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Foreign Tx</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Other</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Total Fees</th>
              <th className="text-left px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Deductible</th>
            </tr>
          </thead>
          <tbody>
            {data.cardFees.map((card, i) => (
              <tr
                key={card.last4}
                className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900'}`}
              >
                <td className="px-4 py-3">
                  <p className="text-gray-200 font-semibold text-xs">{card.cardName}</p>
                  <p className="text-[10px] text-gray-500">{card.issuer} ···{card.last4}</p>
                </td>
                <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                  {card.annualFee > 0 ? fmtCurrency(card.annualFee) : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <span className={card.lateFees > 0 ? 'text-red-400 font-semibold' : 'text-gray-700'}>
                    {card.lateFees > 0 ? fmtCurrency(card.lateFees) : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                  {card.foreignTransactionFees > 0 ? fmtCurrency(card.foreignTransactionFees) : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                  {card.otherFees > 0 ? fmtCurrency(card.otherFees) : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-100">{fmtCurrency(card.totalFees)}</td>
                <td className="px-4 py-3">
                  {card.deductible ? (
                    <span className="text-[10px] font-bold bg-emerald-900 text-emerald-300 border border-emerald-700 px-1.5 py-0.5 rounded-full">
                      Yes
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded-full">
                      No
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-900">
              <td className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</td>
              <td colSpan={4} className="hidden sm:table-cell" />
              <td className="px-4 py-3 text-right font-bold text-gray-100">{fmtCurrency(totalFees)}</td>
              <td className="px-4 py-3">
                <span className="text-xs text-emerald-400 font-semibold">{fmtCurrency(deductibleFees)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Substantiation score gauge */}
      <SubstantiationGauge items={data.substantiation} />

      {/* Footer note */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-xs text-gray-500">
        <span className="font-semibold text-gray-400">Disclaimer:</span> This report is generated from
        imported statement data and is intended to support tax preparation. Consult a qualified CPA or tax
        counsel before filing. IRC §163(j) computations are based on estimated ATI and may differ from
        final return calculations.
      </div>
    </div>
  );
}
