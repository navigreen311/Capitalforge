'use client';

// ============================================================
// /crm — CRM & Revenue Analytics
// Client pipeline funnel, revenue cards, issuer approval rates,
// advisor performance table, monthly revenue trend.
// ============================================================

import { useState } from 'react';
import PipelineFunnel, { type FunnelStage } from '@/components/modules/pipeline-funnel';

// ─── Mock data ────────────────────────────────────────────────────────────────

const FUNNEL_STAGES: FunnelStage[] = [
  { key: 'prospect',   label: 'Prospect',   count: 214, description: 'Initial inquiry / lead capture' },
  { key: 'onboarding', label: 'Onboarding', count: 147, description: 'Documents & credit submitted' },
  { key: 'active',     label: 'Active',     count: 148, description: 'Funded & in program' },
  { key: 'graduated',  label: 'Graduated',  count: 63,  description: 'Completed program successfully' },
  { key: 'churned',    label: 'Churned',    count: 22,  description: 'Cancelled or declined' },
];

const REVENUE_CARDS = [
  { label: 'Total Revenue (YTD)',   value: '$900,400',  sub: '+$174,600 in March',   up: true  },
  { label: 'Paid Revenue',          value: '$836,200',  sub: '92.9% collection rate', up: true  },
  { label: 'Pending Revenue',       value: '$64,200',   sub: '28 open invoices',      up: false },
];

const ISSUER_APPROVAL = [
  { issuer: 'Chase',           rate: 74 },
  { issuer: 'Amex',            rate: 71 },
  { issuer: 'Capital One',     rate: 68 },
  { issuer: 'Bank of America', rate: 65 },
  { issuer: 'Citi',            rate: 60 },
  { issuer: 'Discover',        rate: 57 },
  { issuer: 'US Bank',         rate: 54 },
];

interface AdvisorRow {
  name: string;
  pipeline: number;
  revenue: string;
  approvalRate: number;
  qaScore: number;
}

const ADVISOR_PERFORMANCE: AdvisorRow[] = [
  { name: 'Sarah Chen',       pipeline: 58, revenue: '$312,400', approvalRate: 74, qaScore: 96 },
  { name: 'Marcus Williams',  pipeline: 51, revenue: '$284,100', approvalRate: 70, qaScore: 91 },
  { name: 'James Okafor',     pipeline: 44, revenue: '$248,700', approvalRate: 67, qaScore: 88 },
  { name: 'Priya Nair',       pipeline: 39, revenue: '$186,200', approvalRate: 65, qaScore: 93 },
  { name: 'Derek Simmons',    pipeline: 33, revenue: '$142,600', approvalRate: 61, qaScore: 85 },
];

const MONTHLY_REVENUE = [
  { month: 'Oct',  value: 128_400 },
  { month: 'Nov',  value: 142_200 },
  { month: 'Dec',  value: 155_800 },
  { month: 'Jan',  value: 138_100 },
  { month: 'Feb',  value: 161_300 },
  { month: 'Mar',  value: 174_600 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

function qaColor(score: number): string {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 80) return 'text-yellow-400';
  return 'text-red-400';
}

function approvalColor(rate: number): string {
  if (rate >= 70) return 'text-emerald-400';
  if (rate >= 60) return 'text-yellow-400';
  return 'text-red-400';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RevenueCard({ label, value, sub, up }: { label: string; value: string; sub: string; up: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col gap-2">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
      <p className={`text-xs font-medium ${up ? 'text-emerald-400' : 'text-amber-400'}`}>{sub}</p>
    </div>
  );
}

function IssuerApprovalChart() {
  const max = Math.max(...ISSUER_APPROVAL.map((d) => d.rate));
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Approval Rate by Issuer</h3>
      <p className="text-xs text-gray-500 mb-4">Portfolio-wide, Q1 2026</p>
      <div className="space-y-3">
        {ISSUER_APPROVAL.map(({ issuer, rate }) => {
          const barPct = Math.round((rate / max) * 100);
          const barColor = rate >= 70 ? '#22c55e' : rate >= 62 ? '#C9A84C' : '#ef4444';
          return (
            <div key={issuer} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-32 flex-shrink-0">{issuer}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barPct}%`, backgroundColor: barColor }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-300 w-9 text-right tabular-nums">{rate}%</span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-600 mt-4">
        Placeholder — connect to /api/analytics/issuer-approval-rates
      </p>
    </div>
  );
}

function MonthlyRevenueTrend() {
  const maxVal = Math.max(...MONTHLY_REVENUE.map((d) => d.value));
  const CHART_H = 120;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Monthly Revenue Trend</h3>
      <p className="text-xs text-gray-500 mb-4">Oct 2025 – Mar 2026</p>

      {/* Bar chart */}
      <div className="flex items-end gap-3 justify-between" style={{ height: CHART_H + 32 }}>
        {MONTHLY_REVENUE.map(({ month, value }) => {
          const barH = Math.round((value / maxVal) * CHART_H);
          return (
            <div key={month} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] text-gray-500 tabular-nums">{fmtCurrency(value)}</span>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: barH,
                  background: 'linear-gradient(to top, #0A1628, #C9A84C)',
                  minHeight: 4,
                }}
              />
              <span className="text-[11px] text-gray-500 mt-1">{month}</span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-600 mt-2">
        Placeholder — connect to /api/analytics/monthly-revenue
      </p>
    </div>
  );
}

function AdvisorTable() {
  const [sortKey, setSortKey] = useState<keyof AdvisorRow>('revenue');

  const sorted = [...ADVISOR_PERFORMANCE].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') {
      // Revenue strings — strip non-numeric for sort
      return parseFloat(bv.replace(/[^0-9.]/g, '')) - parseFloat(av.replace(/[^0-9.]/g, ''));
    }
    return (bv as number) - (av as number);
  });

  type Col = { key: keyof AdvisorRow; label: string; align: 'left' | 'right' };
  const COLS: Col[] = [
    { key: 'name',         label: 'Advisor',       align: 'left'  },
    { key: 'pipeline',     label: 'Pipeline',      align: 'right' },
    { key: 'revenue',      label: 'Revenue',       align: 'right' },
    { key: 'approvalRate', label: 'Approval %',    align: 'right' },
    { key: 'qaScore',      label: 'QA Score',      align: 'right' },
  ];

  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
            {COLS.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-semibold cursor-pointer hover:text-gray-200 transition-colors select-none ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                } ${sortKey === col.key ? 'text-[#C9A84C]' : ''}`}
                onClick={() => setSortKey(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 opacity-70">↓</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {sorted.map((row, i) => (
            <tr key={row.name} className="bg-gray-950 hover:bg-gray-900 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-100">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold flex-shrink-0"
                    style={{ backgroundColor: i === 0 ? '#C9A84C22' : '#1f2937', color: i === 0 ? '#C9A84C' : '#9ca3af' }}
                  >
                    {i + 1}
                  </span>
                  {row.name}
                </div>
              </td>
              <td className="px-4 py-3 text-right text-gray-300 tabular-nums font-semibold">{row.pipeline}</td>
              <td className="px-4 py-3 text-right text-gray-100 font-semibold tabular-nums">{row.revenue}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={`font-bold ${approvalColor(row.approvalRate)}`}>{row.approvalRate}%</span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={`font-bold ${qaColor(row.qaScore)}`}>{row.qaScore}</span>
                <span className="text-gray-600 text-xs"> / 100</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CRMPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM & Revenue Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Client pipeline, revenue performance, and advisor metrics — Q1 2026
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Export CSV
          </button>
          <button className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
            + Add Prospect
          </button>
        </div>
      </div>

      {/* ── Revenue KPI Cards ────────────────────────────────────── */}
      <section aria-labelledby="revenue-heading">
        <h2 id="revenue-heading" className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Revenue Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {REVENUE_CARDS.map((card) => (
            <RevenueCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      {/* ── Main Grid: Funnel + Charts ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Funnel — 2 cols */}
        <section aria-labelledby="funnel-heading" className="xl:col-span-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 h-full">
            <h2 id="funnel-heading" className="text-sm font-semibold text-gray-200 mb-1">
              Client Pipeline Funnel
            </h2>
            <p className="text-xs text-gray-500 mb-5">
              Total: {FUNNEL_STAGES.reduce((s, st) => s + st.count, 0)} clients across all stages
            </p>
            <PipelineFunnel stages={FUNNEL_STAGES} />
          </div>
        </section>

        {/* Issuer approval + Revenue trend — 3 cols stacked */}
        <div className="xl:col-span-3 space-y-6">
          <IssuerApprovalChart />
          <MonthlyRevenueTrend />
        </div>
      </div>

      {/* ── Advisor Performance Table ────────────────────────────── */}
      <section aria-labelledby="advisor-heading">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 id="advisor-heading" className="text-sm font-semibold text-gray-200">
              Advisor Performance
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Click a column header to sort. QA score out of 100.
            </p>
          </div>
          <button className="text-xs text-[#C9A84C] hover:underline">
            View full leaderboard
          </button>
        </div>
        <AdvisorTable />
      </section>

    </div>
  );
}
