'use client';

// ============================================================
// /portfolio — Portfolio Benchmarking
// Approval rate benchmarks, promo survival rates, complaint rates,
// cohort profitability, portfolio risk heatmap (issuer × FICO).
// ============================================================

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type BenchmarkTab = 'approval' | 'promo' | 'complaints' | 'cohorts' | 'heatmap';

// ─── Mock data ────────────────────────────────────────────────────────────────

// Approval rate benchmarks
const ISSUER_APPROVAL = [
  { issuer: 'Chase',           rate: 74, industry: 72, delta: +2  },
  { issuer: 'Amex',            rate: 71, industry: 69, delta: +2  },
  { issuer: 'Capital One',     rate: 68, industry: 65, delta: +3  },
  { issuer: 'Bank of America', rate: 65, industry: 66, delta: -1  },
  { issuer: 'Citi',            rate: 60, industry: 63, delta: -3  },
  { issuer: 'Discover',        rate: 57, industry: 58, delta: -1  },
  { issuer: 'US Bank',         rate: 54, industry: 55, delta: -1  },
];

const INDUSTRY_APPROVAL = [
  { industry: 'Technology',          rate: 78 },
  { industry: 'Healthcare',          rate: 74 },
  { industry: 'Professional Services',rate: 72 },
  { industry: 'E-Commerce',          rate: 69 },
  { industry: 'Food & Beverage',     rate: 64 },
  { industry: 'Construction',        rate: 61 },
  { industry: 'Retail',              rate: 58 },
  { industry: 'Transportation',      rate: 55 },
];

const FICO_APPROVAL = [
  { band: '750+',    rate: 91, count: 34 },
  { band: '720–749', rate: 84, count: 52 },
  { band: '700–719', rate: 76, count: 41 },
  { band: '680–699', rate: 65, count: 38 },
  { band: '660–679', rate: 52, count: 22 },
  { band: '640–659', rate: 38, count: 14 },
  { band: 'Below 640', rate: 19, count: 8 },
];

// Promo survival rates (% still in promo APR at 6 and 12 months)
const PROMO_SURVIVAL = [
  { issuer: 'Chase',           m6: 88, m12: 72, avgTerm: 15 },
  { issuer: 'Amex',            m6: 85, m12: 69, avgTerm: 14 },
  { issuer: 'Capital One',     m6: 82, m12: 65, avgTerm: 15 },
  { issuer: 'Bank of America', m6: 79, m12: 61, avgTerm: 12 },
  { issuer: 'Citi',            m6: 76, m12: 58, avgTerm: 18 },
  { issuer: 'Discover',        m6: 73, m12: 54, avgTerm: 14 },
];

// Complaint rates
const VENDOR_COMPLAINTS = [
  { name: 'DocuSign',        rate: 0.4, total: 3  },
  { name: 'Experian',        rate: 1.2, total: 9  },
  { name: 'Equifax',         rate: 1.8, total: 14 },
  { name: 'TransUnion',      rate: 1.1, total: 8  },
  { name: 'Plaid',           rate: 0.6, total: 5  },
];

const ADVISOR_COMPLAINTS = [
  { name: 'Sarah Chen',      rate: 0.8, total: 2  },
  { name: 'Marcus Williams', rate: 2.1, total: 5  },
  { name: 'James Okafor',    rate: 1.4, total: 3  },
  { name: 'Priya Nair',      rate: 0.5, total: 1  },
  { name: 'Derek Simmons',   rate: 3.2, total: 6  },
];

const CHANNEL_COMPLAINTS = [
  { channel: 'Direct Referral', rate: 0.7, total: 8   },
  { channel: 'Organic Web',     rate: 1.1, total: 12  },
  { channel: 'Partner Network', rate: 0.9, total: 11  },
  { channel: 'Paid Social',     rate: 2.4, total: 18  },
  { channel: 'Cold Outreach',   rate: 3.8, total: 24  },
];

// Cohort profitability by quarter
interface CohortRow {
  quarter: string;
  clients: number;
  revenue: string;
  cogs: string;
  grossMargin: number;
  ltv: string;
}

const COHORT_PROFITABILITY: CohortRow[] = [
  { quarter: 'Q2 2025', clients: 38, revenue: '$198,400', cogs: '$62,200', grossMargin: 69, ltv: '$8,400' },
  { quarter: 'Q3 2025', clients: 44, revenue: '$234,100', cogs: '$71,400', grossMargin: 70, ltv: '$8,900' },
  { quarter: 'Q4 2025', clients: 51, revenue: '$286,800', cogs: '$84,600', grossMargin: 71, ltv: '$9,100' },
  { quarter: 'Q1 2026', clients: 58, revenue: '$312,400', cogs: '$88,900', grossMargin: 72, ltv: '$9,600' },
];

// Risk heatmap — issuers × FICO bands
const HEATMAP_ISSUERS = ['Chase', 'Amex', 'Cap One', 'BofA', 'Citi', 'Discover'];
const HEATMAP_FICO_BANDS = ['750+', '720–749', '700–719', '680–699', '660–679', '<660'];

// Risk score 0–100 (higher = more risk/delinquency exposure)
const HEATMAP_DATA: number[][] = [
  //Chase  Amex  CapOne  BofA  Citi  Discover
  [  8,    10,    12,    14,    18,    22  ],  // 750+
  [ 14,    16,    19,    22,    26,    31  ],  // 720-749
  [ 21,    24,    28,    33,    38,    44  ],  // 700-719
  [ 31,    35,    41,    47,    54,    61  ],  // 680-699
  [ 44,    50,    57,    64,    71,    78  ],  // 660-679
  [ 62,    68,    75,    81,    87,    93  ],  // <660
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rateColor(rate: number, inverse = false): string {
  const high = inverse ? 'text-red-400' : 'text-emerald-400';
  const med  = 'text-yellow-400';
  const low  = inverse ? 'text-emerald-400' : 'text-red-400';
  if (rate >= 70) return high;
  if (rate >= 55) return med;
  return low;
}

function deltaLabel(delta: number) {
  if (delta > 0) return <span className="text-emerald-400 text-xs font-semibold">+{delta}pts</span>;
  if (delta < 0) return <span className="text-red-400 text-xs font-semibold">{delta}pts</span>;
  return <span className="text-gray-500 text-xs">—</span>;
}

/** Map 0–100 risk score to a heatmap color (low risk = navy, high risk = red) */
function heatColor(score: number): { bg: string; text: string } {
  if (score <= 15)  return { bg: 'bg-[#0A1628]',       text: 'text-blue-300'  };
  if (score <= 30)  return { bg: 'bg-[#1e3a5f]',       text: 'text-blue-200'  };
  if (score <= 45)  return { bg: 'bg-[#4a5568]',       text: 'text-gray-200'  };
  if (score <= 60)  return { bg: 'bg-amber-800',        text: 'text-amber-200' };
  if (score <= 75)  return { bg: 'bg-orange-700',       text: 'text-orange-100'};
  return             { bg: 'bg-red-800',                text: 'text-red-100'   };
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({
  id, label, active, onClick,
}: { id: BenchmarkTab; label: string; active: boolean; onClick: (t: BenchmarkTab) => void }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
        active
          ? 'bg-[#0A1628] text-[#C9A84C]'
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function ApprovalBenchmarks() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Portfolio approval rates vs. industry benchmarks. Delta shows your performance above/below industry average.
      </p>

      {/* Issuer benchmarks */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">By Issuer</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-semibold">Issuer</th>
              <th className="text-right px-5 py-3 font-semibold">Our Rate</th>
              <th className="text-right px-5 py-3 font-semibold">Industry Avg</th>
              <th className="text-right px-5 py-3 font-semibold">Delta</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {ISSUER_APPROVAL.map((row) => (
              <tr key={row.issuer} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-100">{row.issuer}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold tabular-nums ${rateColor(row.rate)}`}>{row.rate}%</span>
                </td>
                <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{row.industry}%</td>
                <td className="px-5 py-3 text-right">{deltaLabel(row.delta)}</td>
                <td className="px-5 py-3">
                  <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden ml-auto">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.rate}%`,
                        backgroundColor: row.delta >= 0 ? '#22c55e' : '#ef4444',
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Industry benchmarks */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-200">By Industry</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Industry</th>
                <th className="text-right px-5 py-3 font-semibold">Rate</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {INDUSTRY_APPROVAL.map((row) => (
                <tr key={row.industry} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-5 py-3 text-gray-300 text-xs">{row.industry}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-bold text-xs tabular-nums ${rateColor(row.rate)}`}>{row.rate}%</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden ml-auto">
                      <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${row.rate}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FICO band benchmarks */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-200">By FICO Band</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">FICO Band</th>
                <th className="text-right px-5 py-3 font-semibold">Rate</th>
                <th className="text-right px-5 py-3 font-semibold">Clients</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {FICO_APPROVAL.map((row) => (
                <tr key={row.band} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-5 py-3 text-gray-300 text-xs font-mono">{row.band}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-bold text-xs tabular-nums ${rateColor(row.rate)}`}>{row.rate}%</span>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-400 tabular-nums text-xs">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PromoSurvival() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Percentage of clients still within promotional APR period at 6 and 12 months post-funding.
      </p>
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-semibold">Issuer</th>
              <th className="text-right px-5 py-3 font-semibold">Avg Promo Term</th>
              <th className="text-right px-5 py-3 font-semibold">Survival @ 6mo</th>
              <th className="text-right px-5 py-3 font-semibold">Survival @ 12mo</th>
              <th className="px-5 py-3 hidden md:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {PROMO_SURVIVAL.map((row) => (
              <tr key={row.issuer} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-100">{row.issuer}</td>
                <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{row.avgTerm} mo</td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold tabular-nums ${rateColor(row.m6)}`}>{row.m6}%</span>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold tabular-nums ${rateColor(row.m12)}`}>{row.m12}%</span>
                </td>
                <td className="px-5 py-3 hidden md:table-cell">
                  {/* Dual progress bar */}
                  <div className="w-28 ml-auto space-y-1">
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${row.m6}%` }} />
                    </div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${row.m12}%` }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-gray-800 flex gap-4 text-[10px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 bg-blue-500 rounded-full inline-block" />
            6-month survival
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 bg-[#C9A84C] rounded-full inline-block" />
            12-month survival
          </span>
        </div>
      </div>
    </div>
  );
}

function ComplaintRates() {
  type ComplaintDimension = 'vendor' | 'advisor' | 'channel';
  const [dim, setDim] = useState<ComplaintDimension>('vendor');

  const data =
    dim === 'vendor'  ? VENDOR_COMPLAINTS.map((d) => ({ name: d.name,    rate: d.rate, total: d.total })) :
    dim === 'advisor' ? ADVISOR_COMPLAINTS.map((d) => ({ name: d.name,   rate: d.rate, total: d.total })) :
                        CHANNEL_COMPLAINTS.map((d) => ({ name: d.channel, rate: d.rate, total: d.total }));

  const maxRate = Math.max(...data.map((d) => d.rate));

  function complaintRateColor(r: number) {
    if (r <= 1.0) return 'text-emerald-400';
    if (r <= 2.5) return 'text-yellow-400';
    return 'text-red-400';
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">Complaint rate per 100 active clients by dimension.</p>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['vendor', 'advisor', 'channel'] as ComplaintDimension[]).map((d) => (
            <button
              key={d}
              onClick={() => setDim(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                dim === d ? 'bg-[#0A1628] text-[#C9A84C]' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-semibold capitalize">{dim}</th>
              <th className="text-right px-5 py-3 font-semibold">Rate / 100</th>
              <th className="text-right px-5 py-3 font-semibold">Total</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {data.sort((a, b) => a.rate - b.rate).map((row) => (
              <tr key={row.name} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-5 py-3 text-gray-100 font-medium">{row.name}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold tabular-nums ${complaintRateColor(row.rate)}`}>{row.rate}</span>
                </td>
                <td className="px-5 py-3 text-right text-gray-400 tabular-nums text-xs">{row.total}</td>
                <td className="px-5 py-3">
                  <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden ml-auto">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((row.rate / maxRate) * 100)}%`,
                        backgroundColor: row.rate <= 1.0 ? '#22c55e' : row.rate <= 2.5 ? '#eab308' : '#ef4444',
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CohortProfitability() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Revenue, gross margin, and estimated client lifetime value by onboarding cohort quarter.
      </p>
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-semibold">Cohort</th>
              <th className="text-right px-5 py-3 font-semibold">Clients</th>
              <th className="text-right px-5 py-3 font-semibold">Revenue</th>
              <th className="text-right px-5 py-3 font-semibold">COGS</th>
              <th className="text-right px-5 py-3 font-semibold">Gross Margin</th>
              <th className="text-right px-5 py-3 font-semibold">Est. LTV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {COHORT_PROFITABILITY.map((row) => (
              <tr key={row.quarter} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-5 py-3 font-semibold text-gray-100">{row.quarter}</td>
                <td className="px-5 py-3 text-right text-gray-300 tabular-nums">{row.clients}</td>
                <td className="px-5 py-3 text-right text-gray-100 font-semibold tabular-nums">{row.revenue}</td>
                <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{row.cogs}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold tabular-nums ${rateColor(row.grossMargin)}`}>{row.grossMargin}%</span>
                  <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden ml-auto mt-1">
                    <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${row.grossMargin}%` }} />
                  </div>
                </td>
                <td className="px-5 py-3 text-right text-emerald-400 font-semibold tabular-nums">{row.ltv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-600">
        Placeholder — connect to /api/analytics/cohort-profitability
      </p>
    </div>
  );
}

function RiskHeatmap() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Delinquency risk exposure score (0–100) by issuer and FICO band.
        Darker red indicates higher risk concentration.
      </p>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left pr-4 pb-3 text-gray-500 font-semibold whitespace-nowrap w-24">
                FICO \ Issuer
              </th>
              {HEATMAP_ISSUERS.map((issuer) => (
                <th
                  key={issuer}
                  className="text-center px-2 pb-3 text-gray-400 font-semibold whitespace-nowrap"
                >
                  {issuer}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEATMAP_FICO_BANDS.map((band, rowIdx) => (
              <tr key={band}>
                <td className="pr-4 py-1.5 text-gray-400 font-mono whitespace-nowrap">{band}</td>
                {HEATMAP_ISSUERS.map((issuer, colIdx) => {
                  const score = HEATMAP_DATA[rowIdx][colIdx];
                  const { bg, text } = heatColor(score);
                  return (
                    <td key={issuer} className="px-1 py-1">
                      <div
                        className={`rounded-md text-center py-2 px-1 font-bold tabular-nums ${bg} ${text}`}
                        title={`${band} × ${issuer}: risk score ${score}`}
                      >
                        {score}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-gray-400">
        <span className="font-semibold text-gray-300">Risk Score:</span>
        {[
          { label: '0–15 Very Low',  bg: 'bg-[#0A1628]' },
          { label: '16–30 Low',      bg: 'bg-[#1e3a5f]' },
          { label: '31–45 Moderate', bg: 'bg-[#4a5568]' },
          { label: '46–60 Elevated', bg: 'bg-amber-800'  },
          { label: '61–75 High',     bg: 'bg-orange-700' },
          { label: '76–100 Critical',bg: 'bg-red-800'    },
        ].map(({ label, bg }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm inline-block ${bg}`} />
            {label}
          </span>
        ))}
      </div>

      <p className="text-[10px] text-gray-600">
        Placeholder — connect to /api/analytics/risk-heatmap
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [tab, setTab] = useState<BenchmarkTab>('approval');

  const TABS: { id: BenchmarkTab; label: string }[] = [
    { id: 'approval',    label: 'Approval Rates'     },
    { id: 'promo',       label: 'Promo Survival'     },
    { id: 'complaints',  label: 'Complaint Rates'    },
    { id: 'cohorts',     label: 'Cohort Profitability'},
    { id: 'heatmap',     label: 'Risk Heatmap'       },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio Benchmarking</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Approval benchmarks, promo survival, complaint rates, cohort profitability, and risk exposure — Q1 2026
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
          Export Report
        </button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label }) => (
          <TabBtn key={id} id={id} label={label} active={tab === id} onClick={setTab} />
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      {tab === 'approval'   && <ApprovalBenchmarks />}
      {tab === 'promo'      && <PromoSurvival />}
      {tab === 'complaints' && <ComplaintRates />}
      {tab === 'cohorts'    && <CohortProfitability />}
      {tab === 'heatmap'    && <RiskHeatmap />}

    </div>
  );
}
