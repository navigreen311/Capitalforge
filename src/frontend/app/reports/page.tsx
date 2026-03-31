'use client';

// ============================================================
// /reports — Tax reports, portfolio benchmarks, revenue analytics,
// compliance exports
// ============================================================

import { useState } from 'react';

// ── Types ────────────────────────────────────────────────────

type ReportTab = 'tax' | 'portfolio' | 'revenue' | 'compliance';

interface ReportItem {
  id: string;
  name: string;
  description: string;
  period: string;
  status: 'ready' | 'generating' | 'error';
  generatedAt?: string;
  sizeKb?: number;
}

// ── Mock report data ──────────────────────────────────────────

const TAX_REPORTS: ReportItem[] = [
  {
    id: 'tax-163j-2025',
    name: 'IRC §163(j) Interest Limitation Report',
    description: 'Business interest expense deductibility analysis',
    period: 'FY 2025',
    status: 'ready',
    generatedAt: '2026-03-15',
    sizeKb: 248,
  },
  {
    id: 'tax-ye-2025',
    name: 'Year-End Tax Summary',
    description: 'Aggregate fees, interest, and deductible expenses',
    period: 'FY 2025',
    status: 'ready',
    generatedAt: '2026-03-10',
    sizeKb: 185,
  },
  {
    id: 'tax-q1-2026',
    name: 'Q1 2026 Estimated Tax Support',
    description: 'Quarterly funding cost allocation for estimated tax payments',
    period: 'Q1 2026',
    status: 'generating',
  },
  {
    id: 'tax-irc-2024',
    name: 'IRC §163(j) Interest Limitation Report',
    description: 'Business interest expense deductibility analysis',
    period: 'FY 2024',
    status: 'ready',
    generatedAt: '2025-03-18',
    sizeKb: 212,
  },
];

const PORTFOLIO_METRICS = [
  { label: 'Total Deployed Capital',    value: '$14.2M',   change: '+$1.1M',  up: true  },
  { label: 'Avg. Funding per Client',   value: '$96,000',  change: '+$4,200', up: true  },
  { label: 'Portfolio Approval Rate',   value: '68%',      change: '-2pts',   up: false },
  { label: 'Avg. Intro APR Saved',      value: '18.9%',    change: '+0.4pts', up: true  },
  { label: 'Active Credit Stacks',      value: '148',      change: '+6',      up: true  },
  { label: 'Avg. Stack Credit Lines',   value: '4.2',      change: '+0.3',    up: true  },
  { label: 'Avg. Time to Fund',         value: '11 days',  change: '-1 day',  up: true  },
  { label: 'Compliance Score (Avg.)',   value: '84%',      change: '+2pts',   up: true  },
];

const REVENUE_DATA = [
  { month: 'Oct',  revenue: 128_400 },
  { month: 'Nov',  revenue: 142_200 },
  { month: 'Dec',  revenue: 155_800 },
  { month: 'Jan',  revenue: 138_100 },
  { month: 'Feb',  revenue: 161_300 },
  { month: 'Mar',  revenue: 174_600 },
];

const COMPLIANCE_EXPORTS: ReportItem[] = [
  {
    id: 'comp-udap-q1',
    name: 'UDAP Risk Assessment Export',
    description: 'Quarterly UDAP compliance audit with findings',
    period: 'Q1 2026',
    status: 'ready',
    generatedAt: '2026-03-28',
    sizeKb: 320,
  },
  {
    id: 'comp-consent-log',
    name: 'Consent Records Export',
    description: 'Full TCPA / data-sharing consent audit trail',
    period: 'YTD 2026',
    status: 'ready',
    generatedAt: '2026-03-31',
    sizeKb: 512,
  },
  {
    id: 'comp-1071-q1',
    name: 'Section 1071 Fair Lending Report',
    description: 'Small business lending demographic data summary',
    period: 'Q1 2026',
    status: 'ready',
    generatedAt: '2026-03-30',
    sizeKb: 188,
  },
  {
    id: 'comp-adr-2026',
    name: 'Adverse Action Notice Log',
    description: 'All adverse action notices issued YTD',
    period: 'YTD 2026',
    status: 'generating',
  },
];

// ── Helpers ──────────────────────────────────────────────────

const STATUS_STYLES: Record<ReportItem['status'], string> = {
  ready:      'bg-emerald-900 text-emerald-300 border border-emerald-700',
  generating: 'bg-amber-900 text-amber-300 border border-amber-700',
  error:      'bg-red-900 text-red-300 border border-red-700',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ── Report Row ────────────────────────────────────────────────

function ReportRow({ item }: { item: ReportItem }) {
  const [generating, setGenerating] = useState(false);

  const onDownload = () => {
    if (item.status !== 'ready') return;
    // STUB — call /api/businesses/:id/tax/export or similar
    alert(`Downloading ${item.name} (${item.period})…`);
  };

  const onRegenerate = async () => {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 1500));
    setGenerating(false);
  };

  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-850 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className="text-sm font-semibold text-gray-100">{item.name}</p>
          <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded-full">
            {item.period}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[item.status]}`}>
            {item.status}
          </span>
        </div>
        <p className="text-xs text-gray-500">{item.description}</p>
        {item.generatedAt && (
          <p className="text-[11px] text-gray-600 mt-0.5">
            Generated {item.generatedAt} · {item.sizeKb} KB
          </p>
        )}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {item.status === 'ready' && (
          <button
            onClick={onDownload}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
          >
            Download
          </button>
        )}
        <button
          onClick={onRegenerate}
          disabled={generating}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Regenerate'}
        </button>
      </div>
    </div>
  );
}

// ── Simple bar chart (pure CSS) ───────────────────────────────

function RevenueBar({ month, revenue, max }: { month: string; revenue: number; max: number }) {
  const pct = Math.round((revenue / max) * 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-gray-400 font-semibold">{fmt(revenue).replace('$', '$').replace(',000', 'k')}</span>
      <div className="w-10 bg-gray-800 rounded-t overflow-hidden" style={{ height: 120 }}>
        <div
          className="w-full bg-[#C9A84C] rounded-t transition-all duration-500"
          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-500">{month}</span>
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────

function TabBtn({ id, label, active, onClick }: { id: ReportTab; label: string; active: boolean; onClick: (t: ReportTab) => void }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-[#0A1628] text-[#C9A84C]' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('tax');
  const maxRevenue    = Math.max(...REVENUE_DATA.map((d) => d.revenue));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">Tax reports, portfolio benchmarks, revenue analytics, compliance exports</p>
        </div>
        <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
          Schedule Reports
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        <TabBtn id="tax"        label="Tax Reports"         active={tab === 'tax'}        onClick={setTab} />
        <TabBtn id="portfolio"  label="Portfolio Benchmarks" active={tab === 'portfolio'}  onClick={setTab} />
        <TabBtn id="revenue"    label="Revenue Analytics"   active={tab === 'revenue'}    onClick={setTab} />
        <TabBtn id="compliance" label="Compliance Exports"  active={tab === 'compliance'} onClick={setTab} />
      </div>

      {/* ── Tax Reports ─────────────────────────────────────── */}
      {tab === 'tax' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">
            IRC §163(j) reports, year-end summaries, and quarterly tax support packages.
          </p>
          {TAX_REPORTS.map((r) => <ReportRow key={r.id} item={r} />)}
        </section>
      )}

      {/* ── Portfolio Benchmarks ─────────────────────────────── */}
      {tab === 'portfolio' && (
        <section>
          <p className="text-sm text-gray-500 mb-4">
            Key performance metrics across the full client portfolio as of March 31, 2026.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {PORTFOLIO_METRICS.map(({ label, value, change, up }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-white">{value}</p>
                <p className={`text-xs font-medium mt-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {change} vs last period
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Issuer Approval Rate Breakdown</h3>
            <div className="space-y-3">
              {[
                { issuer: 'Chase',          rate: 74, color: 'bg-blue-500' },
                { issuer: 'Amex',           rate: 71, color: 'bg-emerald-500' },
                { issuer: 'Capital One',    rate: 68, color: 'bg-purple-500' },
                { issuer: 'Bank of America',rate: 65, color: 'bg-amber-500' },
                { issuer: 'Citi',           rate: 60, color: 'bg-red-500' },
              ].map(({ issuer, rate, color }) => (
                <div key={issuer} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-28 flex-shrink-0">{issuer}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${rate}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-300 w-8 text-right">{rate}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Revenue Analytics ────────────────────────────────── */}
      {tab === 'revenue' && (
        <section>
          <p className="text-sm text-gray-500 mb-6">Monthly revenue trend — last 6 months.</p>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'MRR (Mar 2026)',      value: '$174,600', sub: '+$13,300 MoM' },
              { label: 'ARR Run-Rate',         value: '$2.1M',   sub: 'Annualized' },
              { label: 'Avg. Revenue/Client',  value: '$1,179',  sub: 'Per active client' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-emerald-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Monthly Revenue (Oct 2025 – Mar 2026)</h3>
            <div className="flex items-end gap-4 justify-center">
              {REVENUE_DATA.map(({ month, revenue }) => (
                <RevenueBar key={month} month={month} revenue={revenue} max={maxRevenue} />
              ))}
            </div>
          </div>

          {/* Revenue breakdown */}
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Revenue Mix (Mar 2026)</h3>
            <div className="space-y-3">
              {[
                { source: 'Program Fees',       amount: '$98,400',  pct: 56 },
                { source: 'Advisory Retainers', amount: '$42,100',  pct: 24 },
                { source: 'Commission Income',  amount: '$24,600',  pct: 14 },
                { source: 'SaaS Subscriptions', amount: '$9,500',   pct: 6  },
              ].map(({ source, amount, pct }) => (
                <div key={source} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-40 flex-shrink-0">{source}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div className="bg-[#C9A84C] h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-300 w-16 text-right">{amount}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Compliance Exports ───────────────────────────────── */}
      {tab === 'compliance' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">
            UDAP assessments, consent audit trails, Section 1071 fair lending reports, and adverse action logs.
          </p>
          {COMPLIANCE_EXPORTS.map((r) => <ReportRow key={r.id} item={r} />)}
          <div className="mt-4 p-4 rounded-xl border border-gray-700 bg-gray-900 text-xs text-gray-500">
            Compliance exports include full audit trail metadata and are suitable for regulatory submissions.
            Exports are retained for 7 years per CFPB record-keeping requirements.
          </div>
        </section>
      )}
    </div>
  );
}
