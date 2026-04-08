'use client';

// ============================================================
// /portfolio — Portfolio Benchmarking
// Approval rate benchmarks, promo survival rates, complaint rates,
// cohort profitability, portfolio risk heatmap (issuer × FICO).
// ============================================================

import { useState, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type BenchmarkTab = 'approval' | 'promo' | 'complaints' | 'cohorts' | 'heatmap';
type Quarter = 'q1-2026' | 'q4-2025' | 'q3-2025' | 'q2-2025';

/** Multiplier offsets per quarter to create mock data variation */
const QUARTER_FACTORS: Record<Quarter, { rate: number; count: number; cost: number; risk: number }> = {
  'q1-2026': { rate: 1.00, count: 1.00, cost: 1.00, risk: 1.00 },
  'q4-2025': { rate: 0.97, count: 0.92, cost: 0.95, risk: 1.04 },
  'q3-2025': { rate: 0.94, count: 0.85, cost: 0.90, risk: 1.08 },
  'q2-2025': { rate: 0.90, count: 0.78, cost: 0.86, risk: 1.12 },
};

const QUARTER_LABELS: Record<Quarter, string> = {
  'q1-2026': 'Q1 2026',
  'q4-2025': 'Q4 2025',
  'q3-2025': 'Q3 2025',
  'q2-2025': 'Q2 2025',
};

const QUARTER_UPDATED: Record<Quarter, string> = {
  'q1-2026': 'Mar 31, 2026',
  'q4-2025': 'Dec 31, 2025',
  'q3-2025': 'Sep 30, 2025',
  'q2-2025': 'Jun 30, 2025',
};

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

// At-risk promo tiers
const PROMO_AT_RISK = [
  { tier: '0–15 days',  count: 12, exposure: '$284,000' },
  { tier: '16–30 days', count: 8,  exposure: '$196,500' },
  { tier: '31–60 days', count: 5,  exposure: '$118,200' },
];

// Avg days to payoff by issuer
const PROMO_PAYOFF_DAYS = [
  { issuer: 'Chase',       days: 142 },
  { issuer: 'Amex',        days: 128 },
  { issuer: 'Capital One', days: 155 },
  { issuer: 'Citi',        days: 168 },
  { issuer: 'Discover',    days: 134 },
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

// Complaint type breakdown
const COMPLAINT_TYPES = [
  { type: 'Billing Dispute',       count: 14, pct: 33 },
  { type: 'Service Delay',         count: 9,  pct: 21 },
  { type: 'Documentation Error',   count: 8,  pct: 19 },
  { type: 'Unauthorized Activity', count: 7,  pct: 17 },
  { type: 'Communication Issue',   count: 4,  pct: 10 },
];

// Complaint trend (6 months)
const COMPLAINT_TREND = [
  { month: 'Oct', count: 8  },
  { month: 'Nov', count: 11 },
  { month: 'Dec', count: 6  },
  { month: 'Jan', count: 9  },
  { month: 'Feb', count: 7  },
  { month: 'Mar', count: 5  },
];

// Cohort profitability by quarter
interface CohortRow {
  quarter: string;
  clients: number;
  revenue: string;
  cogs: string;
  grossMargin: number;
  ltv: string;
  retention6m: number;
  retention12m: number;
}

const COHORT_PROFITABILITY: CohortRow[] = [
  { quarter: 'Q2 2025', clients: 38, revenue: '$198,400', cogs: '$62,200', grossMargin: 69, ltv: '$8,400', retention6m: 82, retention12m: 68 },
  { quarter: 'Q3 2025', clients: 44, revenue: '$234,100', cogs: '$71,400', grossMargin: 70, ltv: '$8,900', retention6m: 85, retention12m: 71 },
  { quarter: 'Q4 2025', clients: 51, revenue: '$286,800', cogs: '$84,600', grossMargin: 71, ltv: '$9,100', retention6m: 87, retention12m: 74 },
  { quarter: 'Q1 2026', clients: 58, revenue: '$312,400', cogs: '$88,900', grossMargin: 72, ltv: '$9,600', retention6m: 89, retention12m: 0  },
];

// LTV by tier
const LTV_TIERS = [
  { tier: '<$50K',      revenue: '$4,200',  avgLength: '8 mo',  margin: 58 },
  { tier: '$50–100K',   revenue: '$7,800',  avgLength: '14 mo', margin: 65 },
  { tier: '$100–200K',  revenue: '$12,400', avgLength: '22 mo', margin: 71 },
  { tier: '$200K+',     revenue: '$18,600', avgLength: '30 mo', margin: 78 },
];

// Risk heatmap — issuers × FICO bands (with US Bank added)
const HEATMAP_ISSUERS = ['Chase', 'Amex', 'Cap One', 'BofA', 'Citi', 'Discover', 'US Bank'];
const HEATMAP_FICO_BANDS = ['750+', '720–749', '700–719', '680–699', '660–679', '<660'];

// Risk score 0–100 (higher = more risk/delinquency exposure)
const HEATMAP_DATA: number[][] = [
  //Chase  Amex  CapOne  BofA  Citi  Discover  USBank
  [  8,    10,    12,    14,    18,    22,    20  ],  // 750+
  [ 14,    16,    19,    22,    26,    31,    28  ],  // 720-749
  [ 21,    24,    28,    33,    38,    44,    36  ],  // 700-719
  [ 31,    35,    41,    47,    54,    61,    52  ],  // 680-699
  [ 44,    50,    57,    64,    71,    78,    68  ],  // 660-679
  [ 62,    68,    75,    81,    87,    93,    79  ],  // <660
];

// Heatmap drilldown placeholder clients
const HEATMAP_DRILLDOWN_CLIENTS: Record<string, { name: string; fico: number; balance: string }[]> = {
  default: [
    { name: 'Acme Corp',       fico: 712, balance: '$145,000' },
    { name: 'BlueLine LLC',    fico: 698, balance: '$89,500'  },
    { name: 'Vertex Partners', fico: 725, balance: '$212,000' },
  ],
};

// Quarter selector options
const QUARTER_OPTIONS: { value: Quarter; label: string }[] = [
  { value: 'q1-2026', label: 'Q1 2026' },
  { value: 'q4-2025', label: 'Q4 2025' },
  { value: 'q3-2025', label: 'Q3 2025' },
  { value: 'q2-2025', label: 'Q2 2025' },
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

function showToast(message: string) {
  if (typeof window !== 'undefined') {
    alert(message);
  }
}

/** Apply a quarter factor to a numeric value, clamping to 0–100 when isPercent */
function applyFactor(base: number, factor: number, isPercent = false): number {
  const v = Math.round(base * factor);
  return isPercent ? Math.min(100, Math.max(0, v)) : Math.max(0, v);
}

/** Scale a dollar string like "$198,400" by a factor */
function scaleDollar(str: string, factor: number): string {
  const num = parseFloat(str.replace(/[$,]/g, ''));
  const scaled = Math.round(num * factor);
  return '$' + scaled.toLocaleString('en-US');
}

// ─── SLA Compliance data ─────────────────────────────────────────────────────
const SLA_COMPLIANCE = [
  { metric: 'Acknowledgment within 24h', target: 100, actual: 97 },
  { metric: 'Resolution within 5 days',  target: 90,  actual: 86 },
  { metric: 'Escalation within 48h',     target: 100, actual: 100 },
  { metric: 'Client follow-up within 7d',target: 95,  actual: 91 },
];

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

function ApprovalBenchmarks({ quarter }: { quarter: Quarter }) {
  const f = QUARTER_FACTORS[quarter];
  const issuerData = useMemo(() => ISSUER_APPROVAL.map((row) => {
    const rate = applyFactor(row.rate, f.rate, true);
    return { ...row, rate, delta: rate - row.industry };
  }), [f.rate]);
  const industryData = useMemo(() => INDUSTRY_APPROVAL.map((row) => ({
    ...row, rate: applyFactor(row.rate, f.rate, true),
  })), [f.rate]);
  const ficoData = useMemo(() => FICO_APPROVAL.map((row) => ({
    ...row,
    rate: applyFactor(row.rate, f.rate, true),
    count: applyFactor(row.count, f.count),
  })), [f.rate, f.count]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          Portfolio approval rates vs. industry benchmarks. Delta shows your performance above/below industry average.
        </p>
        <p className="text-xs italic text-gray-600 mt-1">
          Industry benchmarks sourced from SBFE Q4 2025 | Updated {QUARTER_UPDATED[quarter]}
        </p>
      </div>

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
            {issuerData.map((row) => (
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
              {industryData.map((row) => (
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
              {ficoData.map((row) => (
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

      {/* Approval Rate by Issuer Type */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Approval Rate by Issuer Type</h3>
        </div>
        <div className="p-5 space-y-4">
          {/* Credit Unions */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-300">Credit Unions</span>
              <span className="font-bold text-emerald-400 tabular-nums">71%</span>
            </div>
            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '71%' }} />
            </div>
          </div>
          {/* Major Banks */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-300">Major Banks</span>
              <span className="font-bold text-blue-400 tabular-nums">65%</span>
            </div>
            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: '65%' }} />
            </div>
          </div>
          {/* Combined */}
          <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-800">
            <span className="text-gray-400">All Issuers (Combined)</span>
            <span className="font-bold text-gray-200 tabular-nums">67%</span>
          </div>
          <p className="text-xs text-teal-400 italic">
            CU approval rate exceeds bank rate by 6 percentage points
          </p>
        </div>
      </div>
    </div>
  );
}

function PromoSurvival({ quarter }: { quarter: Quarter }) {
  const f = QUARTER_FACTORS[quarter];
  const survivalData = useMemo(() => PROMO_SURVIVAL.map((row) => ({
    ...row,
    m6: applyFactor(row.m6, f.rate, true),
    m12: applyFactor(row.m12, f.rate, true),
  })), [f.rate]);
  const atRiskData = useMemo(() => PROMO_AT_RISK.map((row) => ({
    ...row,
    count: applyFactor(row.count, f.count),
    exposure: scaleDollar(row.exposure, f.cost),
  })), [f.count, f.cost]);
  const payoffData = useMemo(() => PROMO_PAYOFF_DAYS.map((row) => ({
    ...row,
    days: applyFactor(row.days, 2 - f.rate), // inverse: older quarters had longer payoffs
  })), [f.rate]);
  const heroRate = applyFactor(74, f.rate, true);
  const maxDays = Math.max(...payoffData.map((d) => d.days));

  return (
    <div className="space-y-6">
      {/* Hero metric */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Promo Survival Rate</p>
        <p className="text-5xl font-extrabold text-[#C9A84C] tabular-nums">{heroRate}%</p>
        <p className="text-xs text-gray-500 mt-1">of clients remain within promo APR at 12 months ({QUARTER_LABELS[quarter]})</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* At-risk panel */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-200">At-Risk Promos</h3>
            <p className="text-xs text-gray-500 mt-0.5">Clients nearing promo expiration</p>
          </div>
          <div className="divide-y divide-gray-800">
            {atRiskData.map((tier) => (
              <div key={tier.tier} className="px-5 py-4 flex items-center justify-between bg-gray-950">
                <div>
                  <p className="text-sm font-medium text-gray-100">{tier.tier}</p>
                  <p className="text-xs text-gray-500">{tier.count} clients</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-400 tabular-nums">{tier.exposure}</p>
                  <p className="text-[10px] text-gray-500">exposure</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Avg days to payoff by issuer — horizontal bars */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-200">Avg Days to Payoff by Issuer</h3>
          </div>
          <div className="p-5 space-y-3">
            {payoffData.map((row) => (
              <div key={row.issuer}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-300">{row.issuer}</span>
                  <span className="text-gray-400 tabular-nums">{row.days} days</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.round((row.days / maxDays) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Survival table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Survival Rates by Issuer</h3>
        </div>
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
            {survivalData.map((row) => (
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

function ComplaintRates({ quarter }: { quarter: Quarter }) {
  type ComplaintDimension = 'vendor' | 'advisor' | 'channel';
  const [dim, setDim] = useState<ComplaintDimension>('vendor');
  const f = QUARTER_FACTORS[quarter];

  const scaleComplaint = useCallback((d: { name?: string; channel?: string; rate: number; total: number }) => ({
    name: d.name || d.channel || '',
    rate: Math.round(d.rate * f.risk * 10) / 10,
    total: applyFactor(d.total, f.risk),
  }), [f.risk]);

  const data =
    dim === 'vendor'  ? VENDOR_COMPLAINTS.map((d) => scaleComplaint({ name: d.name, rate: d.rate, total: d.total })) :
    dim === 'advisor' ? ADVISOR_COMPLAINTS.map((d) => scaleComplaint({ name: d.name, rate: d.rate, total: d.total })) :
                        CHANNEL_COMPLAINTS.map((d) => scaleComplaint({ name: d.channel, rate: d.rate, total: d.total }));

  const typeData = useMemo(() => COMPLAINT_TYPES.map((t) => ({
    ...t, count: applyFactor(t.count, f.risk),
  })), [f.risk]);

  const trendData = useMemo(() => COMPLAINT_TREND.map((t) => ({
    ...t, count: applyFactor(t.count, f.risk),
  })), [f.risk]);

  const slaData = useMemo(() => SLA_COMPLIANCE.map((s) => ({
    ...s, actual: applyFactor(s.actual, f.rate, true),
  })), [f.rate]);

  const maxRate = Math.max(...data.map((d) => d.rate));
  const maxTypeCount = Math.max(...typeData.map((t) => t.count));
  const maxTrendCount = Math.max(...trendData.map((t) => t.count));
  const totalQTD = typeData.reduce((s, t) => s + t.count, 0);

  function complaintRateColor(r: number) {
    if (r <= 1.0) return 'text-emerald-400';
    if (r <= 2.5) return 'text-yellow-400';
    return 'text-red-400';
  }

  return (
    <div className="space-y-6">
      {/* Summary metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Complaints MTD', value: String(applyFactor(5, f.risk)),    color: 'text-emerald-400' },
          { label: 'Total Complaints QTD', value: String(totalQTD),                  color: 'text-yellow-400'  },
          { label: 'Rate / 100 Clients',   value: `${(Math.round(1.4 * f.risk * 10) / 10).toFixed(1)}`, color: 'text-gray-100' },
          { label: 'SLA Compliance',        value: `${slaData.reduce((s, d) => s + (d.actual >= d.target ? 1 : 0), 0)}/${slaData.length}`, color: slaData.every(d => d.actual >= d.target) ? 'text-emerald-400' : 'text-yellow-400' },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{m.label}</p>
            <p className={`text-2xl font-extrabold tabular-nums ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Complaint type breakdown */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Complaint Type Breakdown</h3>
        </div>
        <div className="p-5 space-y-3">
          {typeData.map((ct) => (
            <div key={ct.type}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-300">{ct.type}</span>
                <span className="text-gray-400 tabular-nums">{ct.count} ({ct.pct}%)</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#C9A84C] rounded-full"
                  style={{ width: `${Math.round((ct.count / maxTypeCount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resolution stats */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-200">Resolution Statistics</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Avg Resolution Time</span>
              <span className="text-lg font-bold text-gray-100 tabular-nums">4.2 days</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Open</p>
                <p className="text-xl font-bold text-yellow-400 tabular-nums">3</p>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Closed</p>
                <p className="text-xl font-bold text-emerald-400 tabular-nums">12</p>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Escalated</p>
                <p className="text-xl font-bold text-red-400 tabular-nums">1</p>
              </div>
            </div>
          </div>
        </div>

        {/* Regulatory escalation tracker */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-200">Regulatory Escalation Tracker</h3>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: 'CFPB Escalations',      count: 0 },
              { label: 'State AG Complaints',    count: 0 },
              { label: 'OCC Referrals',          count: 0 },
              { label: 'FDIC Inquiries',         count: 0 },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{r.label}</span>
                <span className={`text-sm font-bold tabular-nums ${r.count === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.count}
                </span>
              </div>
            ))}
            <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-800/40">
              <p className="text-xs text-emerald-400 font-medium">All clear — no regulatory escalations this period</p>
            </div>
          </div>
        </div>
      </div>

      {/* SLA Compliance */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">SLA Compliance</h3>
          <p className="text-xs text-gray-500 mt-0.5">Service level targets vs actual performance</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-semibold">Metric</th>
              <th className="text-right px-5 py-3 font-semibold">Target</th>
              <th className="text-right px-5 py-3 font-semibold">Actual</th>
              <th className="text-right px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {slaData.map((row) => (
              <tr key={row.metric} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-5 py-3 text-gray-300 text-xs">{row.metric}</td>
                <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{row.target}%</td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold tabular-nums ${row.actual >= row.target ? 'text-emerald-400' : 'text-red-400'}`}>
                    {row.actual}%
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    row.actual >= row.target
                      ? 'bg-emerald-900/30 text-emerald-400'
                      : 'bg-red-900/30 text-red-400'
                  }`}>
                    {row.actual >= row.target ? 'Met' : 'Missed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 6-month trend */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">6-Month Complaint Trend</h3>
        </div>
        <div className="p-5">
          <div className="flex items-end gap-3 h-32">
            {trendData.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-400 tabular-nums">{m.count}</span>
                <div className="w-full bg-gray-800 rounded-t-md overflow-hidden" style={{ height: '100%' }}>
                  <div
                    className="w-full bg-[#C9A84C] rounded-t-md mt-auto"
                    style={{
                      height: `${Math.round((m.count / maxTrendCount) * 100)}%`,
                      marginTop: `${100 - Math.round((m.count / maxTrendCount) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By-dimension table */}
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

function CohortProfitability({ quarter }: { quarter: Quarter }) {
  const f = QUARTER_FACTORS[quarter];
  const cohortData = useMemo(() => COHORT_PROFITABILITY.map((row) => ({
    ...row,
    clients: applyFactor(row.clients, f.count),
    revenue: scaleDollar(row.revenue, f.count * f.rate),
    cogs: scaleDollar(row.cogs, f.count * f.cost),
    grossMargin: applyFactor(row.grossMargin, f.rate, true),
    ltv: scaleDollar(row.ltv, f.rate),
    retention6m: applyFactor(row.retention6m, f.rate, true),
    retention12m: row.retention12m > 0 ? applyFactor(row.retention12m, f.rate, true) : 0,
  })), [f]);
  const ltvData = useMemo(() => LTV_TIERS.map((t) => ({
    ...t,
    revenue: scaleDollar(t.revenue, f.rate),
    margin: applyFactor(t.margin, f.rate, true),
  })), [f.rate]);
  const heroRate = applyFactor(62, f.rate, true);

  // Grouped bar chart data: Revenue vs Cost vs Net per cohort
  const barChartData = useMemo(() => cohortData.map((row) => {
    const rev = parseFloat(row.revenue.replace(/[$,]/g, ''));
    const cost = parseFloat(row.cogs.replace(/[$,]/g, ''));
    return { quarter: row.quarter, revenue: rev, cost, net: rev - cost };
  }), [cohortData]);
  const barMax = Math.max(...barChartData.map((d) => d.revenue));

  return (
    <div className="space-y-6">
      {/* Fee retention rate hero */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Fee Retention Rate</p>
        <p className="text-5xl font-extrabold text-[#C9A84C] tabular-nums">{heroRate}%</p>
        <p className="text-xs text-gray-500 mt-1">of enrolled clients maintain fee-generating activity at 12 months ({QUARTER_LABELS[quarter]})</p>
      </div>

      {/* Grouped bar chart: Revenue vs Cost vs Net */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Revenue vs Cost vs Net by Cohort</h3>
        </div>
        <div className="p-5">
          <div className="space-y-4">
            {barChartData.map((row) => (
              <div key={row.quarter}>
                <p className="text-xs text-gray-400 mb-1.5 font-medium">{row.quarter}</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-14 text-right">Revenue</span>
                    <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded" style={{ width: `${Math.round((row.revenue / barMax) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-emerald-400 tabular-nums w-16 text-right">${Math.round(row.revenue / 1000)}K</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-14 text-right">Cost</span>
                    <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                      <div className="h-full bg-red-500 rounded" style={{ width: `${Math.round((row.cost / barMax) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-red-400 tabular-nums w-16 text-right">${Math.round(row.cost / 1000)}K</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-14 text-right">Net</span>
                    <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                      <div className="h-full bg-[#C9A84C] rounded" style={{ width: `${Math.round((row.net / barMax) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-[#C9A84C] tabular-nums w-16 text-right">${Math.round(row.net / 1000)}K</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-emerald-500 rounded inline-block" />Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-red-500 rounded inline-block" />Cost</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-[#C9A84C] rounded inline-block" />Net</span>
          </div>
        </div>
      </div>

      {/* LTV by tier */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">LTV by Client Tier</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-semibold">Tier</th>
              <th className="text-right px-5 py-3 font-semibold">Est. Revenue</th>
              <th className="text-right px-5 py-3 font-semibold">Avg Engagement</th>
              <th className="text-right px-5 py-3 font-semibold">Gross Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {ltvData.map((t) => (
              <tr key={t.tier} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-100 font-mono text-xs">{t.tier}</td>
                <td className="px-5 py-3 text-right text-emerald-400 font-semibold tabular-nums">{t.revenue}</td>
                <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{t.avgLength}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold tabular-nums ${rateColor(t.margin)}`}>{t.margin}%</span>
                  <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden ml-auto mt-1">
                    <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${t.margin}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cohort table with retention */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Cohort Performance</h3>
          <p className="text-xs text-gray-500 mt-0.5">Revenue, margin, and retention by onboarding quarter</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Cohort</th>
                <th className="text-right px-5 py-3 font-semibold">Clients</th>
                <th className="text-right px-5 py-3 font-semibold">Revenue</th>
                <th className="text-right px-5 py-3 font-semibold">COGS</th>
                <th className="text-right px-5 py-3 font-semibold">Gross Margin</th>
                <th className="text-right px-5 py-3 font-semibold">Est. LTV</th>
                <th className="text-right px-5 py-3 font-semibold">Ret. @ 6M</th>
                <th className="text-right px-5 py-3 font-semibold">Ret. @ 12M</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {cohortData.map((row) => (
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
                  <td className="px-5 py-3 text-right">
                    <span className={`font-bold tabular-nums ${rateColor(row.retention6m)}`}>{row.retention6m}%</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.retention12m > 0 ? (
                      <span className={`font-bold tabular-nums ${rateColor(row.retention12m)}`}>{row.retention12m}%</span>
                    ) : (
                      <span className="text-gray-600 text-xs">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-gray-600">
        Placeholder — connect to /api/analytics/cohort-profitability
      </p>
    </div>
  );
}

function RiskHeatmap({ quarter }: { quarter: Quarter }) {
  const f = QUARTER_FACTORS[quarter];
  const [drilldown, setDrilldown] = useState<{ band: string; issuer: string; score: number } | null>(null);

  const heatmapScores = useMemo(() => HEATMAP_DATA.map((row) =>
    row.map((score) => Math.min(100, Math.max(0, Math.round(score * f.risk))))
  ), [f.risk]);

  function handleCellClick(band: string, issuer: string, score: number) {
    setDrilldown({ band, issuer, score });
  }

  function closeDrilldown() {
    setDrilldown(null);
  }

  const drilldownClients = HEATMAP_DRILLDOWN_CLIENTS.default;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Delinquency risk exposure score (0–100) by issuer and FICO band.
        Darker red indicates higher risk concentration. Click any cell to drill down.
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
                  const score = heatmapScores[rowIdx][colIdx];
                  const { bg, text } = heatColor(score);
                  const isSelected = drilldown?.band === band && drilldown?.issuer === issuer;
                  return (
                    <td key={issuer} className="px-1 py-1">
                      <button
                        onClick={() => handleCellClick(band, issuer, score)}
                        className={`w-full rounded-md text-center py-2 px-1 font-bold tabular-nums ${bg} ${text} transition-all hover:ring-2 hover:ring-[#C9A84C]/50 cursor-pointer ${
                          isSelected ? 'ring-2 ring-[#C9A84C]' : ''
                        }`}
                        title={`${band} x ${issuer}: risk score ${score} — click to drill down`}
                      >
                        {score}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drilldown panel */}
      {drilldown && (
        <div className="rounded-xl border border-[#C9A84C]/40 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">
                Segment: {drilldown.band} FICO x {drilldown.issuer}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Risk score: <span className="font-bold text-gray-300">{drilldown.score}</span>
              </p>
            </div>
            <button
              onClick={closeDrilldown}
              className="text-gray-500 hover:text-gray-300 text-lg px-2"
              title="Close"
            >
              x
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Client</th>
                <th className="text-right px-5 py-3 font-semibold">FICO</th>
                <th className="text-right px-5 py-3 font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {drilldownClients.map((c) => (
                <tr key={c.name} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-5 py-3 text-gray-100 font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{c.fico}</td>
                  <td className="px-5 py-3 text-right text-gray-300 font-semibold tabular-nums">{c.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-gray-800">
            <button
              onClick={() => showToast('Segment export started — CSV will be emailed shortly.')}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] text-gray-950 text-xs font-semibold hover:bg-[#b8963f] transition-colors"
            >
              Export this segment
            </button>
          </div>
        </div>
      )}

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
  const [quarter, setQuarter] = useState<Quarter>('q1-2026');

  const TABS: { id: BenchmarkTab; label: string }[] = [
    { id: 'approval',    label: 'Approval Rates'     },
    { id: 'promo',       label: 'Promo Survival'     },
    { id: 'complaints',  label: 'Complaint Rates'    },
    { id: 'cohorts',     label: 'Cohort Profitability'},
    { id: 'heatmap',     label: 'Risk Heatmap'       },
  ];

  // ── Export Report handler ──────────────────────────────────
  const handleExport = useCallback(() => {
    const f = QUARTER_FACTORS[quarter];
    const qLabel = QUARTER_LABELS[quarter];
    const approvalRate = applyFactor(67, f.rate, true);
    const promoRate = applyFactor(74, f.rate, true);
    const totalComplaints = COMPLAINT_TYPES.reduce((s, t) => s + applyFactor(t.count, f.risk), 0);
    const feeRetention = applyFactor(62, f.rate, true);
    const avgRisk = Math.round(
      HEATMAP_DATA.flat().reduce((s, v) => s + Math.min(100, Math.round(v * f.risk)), 0) /
      HEATMAP_DATA.flat().length
    );

    const report = [
      `CapitalForge — Portfolio Benchmarking Report`,
      `Period: ${qLabel}`,
      `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      ``,
      `=== SUMMARY KPIs ===`,
      `  Avg Readiness Score:     ${applyFactor(72, f.rate)}/100`,
      `  Overall Approval Rate:   ${approvalRate}%`,
      `  Avg Funding / Client:    ${scaleDollar('$148,000', f.rate)}`,
      `  Total Businesses:        ${applyFactor(247, f.count)}`,
      ``,
      `=== APPROVAL RATES ===`,
      `  Overall Approval Rate:   ${approvalRate}%`,
      ...ISSUER_APPROVAL.map((row) => {
        const rate = applyFactor(row.rate, f.rate, true);
        return `  ${row.issuer.padEnd(20)} ${rate}% (industry avg: ${row.industry}%, delta: ${rate - row.industry >= 0 ? '+' : ''}${rate - row.industry}pts)`;
      }),
      ``,
      `=== PROMO SURVIVAL ===`,
      `  Promo Survival Rate (12mo): ${promoRate}%`,
      ...PROMO_SURVIVAL.map((row) => {
        const m6 = applyFactor(row.m6, f.rate, true);
        const m12 = applyFactor(row.m12, f.rate, true);
        return `  ${row.issuer.padEnd(20)} 6mo: ${m6}%, 12mo: ${m12}%`;
      }),
      ``,
      `=== COMPLAINT RATES ===`,
      `  Total Complaints (QTD):  ${totalComplaints}`,
      `  Complaint Rate / 100:    ${(Math.round(1.4 * f.risk * 10) / 10).toFixed(1)}`,
      `  SLA Compliance:`,
      ...SLA_COMPLIANCE.map((s) => {
        const actual = applyFactor(s.actual, f.rate, true);
        return `    ${s.metric.padEnd(30)} Target: ${s.target}%  Actual: ${actual}%  ${actual >= s.target ? 'MET' : 'MISSED'}`;
      }),
      ``,
      `=== COHORT PROFITABILITY ===`,
      `  Fee Retention Rate:      ${feeRetention}%`,
      ...COHORT_PROFITABILITY.map((row) => {
        const rev = scaleDollar(row.revenue, f.count * f.rate);
        const cost = scaleDollar(row.cogs, f.count * f.cost);
        return `  ${row.quarter.padEnd(10)} Clients: ${applyFactor(row.clients, f.count)}, Revenue: ${rev}, COGS: ${cost}, Margin: ${applyFactor(row.grossMargin, f.rate, true)}%`;
      }),
      ``,
      `=== RISK HEATMAP ===`,
      `  Avg Risk Score:          ${avgRisk}/100`,
      `  Issuers tracked:        ${HEATMAP_ISSUERS.length}`,
      `  FICO bands:             ${HEATMAP_FICO_BANDS.length}`,
      ``,
      `--- END OF REPORT ---`,
    ].join('\n');

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-report-${quarter}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [quarter]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio Benchmarking</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Approval benchmarks, promo survival, complaint rates, cohort profitability, and risk exposure — {QUARTER_LABELS[quarter]}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value as Quarter)}
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-1 focus:ring-[#C9A84C] appearance-none cursor-pointer pr-8"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M3 5l3 3 3-3'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
              }}
            >
              {QUARTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-gray-600 whitespace-nowrap">Last updated: {QUARTER_UPDATED[quarter]}</span>
          </div>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Export Report
          </button>
        </div>
      </div>

      {/* ── Portfolio KPIs ─────────────────────────────────────── */}
      {(() => {
        const qf = QUARTER_FACTORS[quarter];
        const readiness = applyFactor(72, qf.rate);
        const approval = applyFactor(67, qf.rate, true);
        const funding = Math.round(148 * qf.rate);
        const businesses = applyFactor(247, qf.count);
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Avg Readiness Score</p>
              <p className="text-2xl font-black text-[#C9A84C]">{readiness}<span className="text-sm font-semibold text-gray-500">/100</span></p>
              <p className="text-[10px] text-gray-500 mt-1">Platform avg: 68</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Approval Rate</p>
              <p className="text-2xl font-black text-emerald-400">{approval}%</p>
              <p className="text-[10px] text-gray-500 mt-1">Platform avg: 62%</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Avg Funding / Client</p>
              <p className="text-2xl font-black text-blue-400">${funding}K</p>
              <p className="text-[10px] text-gray-500 mt-1">Platform avg: $125K</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Businesses</p>
              <p className="text-2xl font-black text-gray-100">{businesses}</p>
              <p className="text-[10px] text-gray-500 mt-1">+{applyFactor(12, qf.count)} this month</p>
            </div>
          </div>
        );
      })()}

      {/* ── Risk Distribution & Benchmark KPIs ─────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Risk Distribution Donut */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">Risk Distribution</h3>
          <div className="flex items-center gap-6">
            {/* CSS Donut Chart */}
            <div className="relative w-32 h-32 shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#111827" strokeWidth="3.8" />
                {/* Low: 142/247 = 57.5% */}
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="3.8"
                  strokeDasharray="57.5 42.5" strokeDashoffset="0" />
                {/* Medium: 68/247 = 27.5% */}
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f59e0b" strokeWidth="3.8"
                  strokeDasharray="27.5 72.5" strokeDashoffset="-57.5" />
                {/* High: 28/247 = 11.3% */}
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f97316" strokeWidth="3.8"
                  strokeDasharray="11.3 88.7" strokeDashoffset="-85" />
                {/* Critical: 9/247 = 3.6% */}
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ef4444" strokeWidth="3.8"
                  strokeDasharray="3.6 96.4" strokeDashoffset="-96.3" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-white">247</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /><span className="text-gray-300">Low: <strong className="text-emerald-400">142</strong></span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /><span className="text-gray-300">Medium: <strong className="text-yellow-400">68</strong></span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /><span className="text-gray-300">High: <strong className="text-orange-400">28</strong></span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /><span className="text-gray-300">Critical: <strong className="text-red-400">9</strong></span></div>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-3">Risk levels from compliance checks across all businesses</p>
        </div>

        {/* Benchmark Indicators */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">Benchmark Indicators</h3>
          <div className="space-y-3">
            {[
              { label: 'Readiness Score', yours: 72, avg: 68, unit: '' },
              { label: 'Approval Rate', yours: 67, avg: 62, unit: '%' },
              { label: 'Avg Funding', yours: 148, avg: 125, unit: 'K' },
              { label: 'Avg FICO', yours: 714, avg: 698, unit: '' },
              { label: 'CU Mix', yours: 22, avg: 18, unit: '%' },
            ].map(({ label, yours, avg, unit }) => {
              const delta = yours - avg;
              const pct = Math.round((yours / (avg * 1.5)) * 100);
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{label}</span>
                    <span className={delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {yours}{unit} ({delta >= 0 ? '+' : ''}{delta}{unit} vs avg)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden relative">
                    <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                    {/* Platform avg marker */}
                    <div
                      className="absolute top-0 h-full w-0.5 bg-gray-400"
                      style={{ left: `${Math.round((avg / (avg * 1.5)) * 100)}%` }}
                      title={`Platform avg: ${avg}${unit}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-3">Dashed line indicates platform average (static reference)</p>
        </div>
      </div>

      {/* ── Original KPI Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Overall Approval</p>
          <p className="text-2xl font-black text-emerald-400">67%</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Active Issuers</p>
          <p className="text-2xl font-black text-gray-100">7</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Avg FICO</p>
          <p className="text-2xl font-black text-blue-400">714</p>
        </div>
        {/* CU vs Bank Mix */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">CU vs Bank Mix</p>
          <p className="text-2xl font-black text-teal-400">CU Mix: 22%</p>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full flex">
              <div className="h-full bg-teal-500" style={{ width: '22%' }} />
              <div className="h-full bg-blue-500" style={{ width: '78%' }} />
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Target: 20-30%</p>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label }) => (
          <TabBtn key={id} id={id} label={label} active={tab === id} onClick={setTab} />
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      {tab === 'approval'   && <ApprovalBenchmarks quarter={quarter} />}
      {tab === 'promo'      && <PromoSurvival quarter={quarter} />}
      {tab === 'complaints' && <ComplaintRates quarter={quarter} />}
      {tab === 'cohorts'    && <CohortProfitability quarter={quarter} />}
      {tab === 'heatmap'    && <RiskHeatmap quarter={quarter} />}

    </div>
  );
}
