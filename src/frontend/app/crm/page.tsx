'use client';

// ============================================================
// /crm — CRM & Revenue Analytics
// Client pipeline funnel, revenue cards, issuer approval rates,
// advisor performance table, lead sources, follow-ups, churn.
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

const STAGE_CLIENTS: Record<string, { name: string; advisor: string; daysInStage: number }[]> = {
  prospect: [
    { name: 'Liam Torres',     advisor: 'Sarah Chen',      daysInStage: 3 },
    { name: 'Aisha Patel',     advisor: 'Marcus Williams', daysInStage: 7 },
    { name: 'Jordan Mitchell', advisor: 'Priya Nair',      daysInStage: 12 },
    { name: 'Carmen Reyes',    advisor: 'James Okafor',    daysInStage: 1 },
  ],
  onboarding: [
    { name: 'Nathan Brooks',   advisor: 'Sarah Chen',      daysInStage: 5 },
    { name: 'Mei-Ling Zhou',   advisor: 'Derek Simmons',   daysInStage: 14 },
    { name: 'Oliver Grant',    advisor: 'Marcus Williams', daysInStage: 8 },
  ],
  active: [
    { name: 'Sofia Hernandez', advisor: 'Priya Nair',      daysInStage: 42 },
    { name: 'Dylan Carter',    advisor: 'James Okafor',    daysInStage: 31 },
    { name: 'Ava Thompson',    advisor: 'Sarah Chen',      daysInStage: 67 },
    { name: 'Ethan Nakamura',  advisor: 'Marcus Williams', daysInStage: 19 },
  ],
  graduated: [
    { name: 'Isabella Ford',   advisor: 'Sarah Chen',      daysInStage: 120 },
    { name: 'Marcus Lee',      advisor: 'Derek Simmons',   daysInStage: 95 },
    { name: 'Rachel Kim',      advisor: 'Priya Nair',      daysInStage: 145 },
  ],
  churned: [
    { name: 'Trevor Dunn',     advisor: 'James Okafor',    daysInStage: 60 },
    { name: 'Samira Osei',     advisor: 'Derek Simmons',   daysInStage: 34 },
    { name: 'Kevin Morales',   advisor: 'Marcus Williams', daysInStage: 18 },
  ],
};

const REVENUE_CARDS = [
  { label: 'Total Revenue (YTD)',   value: '$900,400',  sub: '+$174,600 in March',   up: true  },
  { label: 'Paid Revenue',          value: '$836,200',  sub: '92.9% collection rate', up: true  },
  { label: 'Pending Revenue',       value: '$64,200',   sub: '28 open invoices',      up: false },
  { label: 'Client NPS',            value: '78',        sub: '+4 vs Q3',              up: true,  gold: true },
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

interface AdvisorRowEnhanced {
  name: string;
  activeClients: number;
  dealsMTD: number;
  approvalRate: number;
  avgDealSize: string;
  feesMTD: string;
  nps: number;
  status: 'Exceeding' | 'On Target' | 'Behind';
}

const ADVISOR_PERFORMANCE_ENHANCED: AdvisorRowEnhanced[] = [
  { name: 'Sarah Chen',      activeClients: 58, dealsMTD: 14, approvalRate: 74, avgDealSize: '$22,300', feesMTD: '$48,200', nps: 91, status: 'Exceeding' },
  { name: 'Marcus Williams', activeClients: 51, dealsMTD: 11, approvalRate: 70, avgDealSize: '$19,800', feesMTD: '$38,600', nps: 84, status: 'On Target' },
  { name: 'James Okafor',    activeClients: 44, dealsMTD: 9,  approvalRate: 67, avgDealSize: '$21,100', feesMTD: '$31,400', nps: 78, status: 'On Target' },
  { name: 'Priya Nair',      activeClients: 39, dealsMTD: 7,  approvalRate: 65, avgDealSize: '$18,400', feesMTD: '$22,100', nps: 88, status: 'Behind' },
];

const LEAD_SOURCES = [
  { source: 'Google Ads',    pct: 34 },
  { source: 'Referrals',     pct: 27 },
  { source: 'Social Media',  pct: 18 },
  { source: 'Direct / SEO',  pct: 14 },
  { source: 'Partner Events', pct: 7 },
];

interface FollowUpClient {
  name: string;
  stage: string;
  lastContact: string;
  daysSince: number;
  type: string;
  advisor: string;
}

const FOLLOW_UP_QUEUE: FollowUpClient[] = [
  { name: 'Jordan Mitchell', stage: 'Prospect',   lastContact: '2026-03-25', daysSince: 7,  type: 'Call',  advisor: 'Priya Nair' },
  { name: 'Mei-Ling Zhou',   stage: 'Onboarding', lastContact: '2026-03-18', daysSince: 14, type: 'Email', advisor: 'Derek Simmons' },
  { name: 'Nathan Brooks',   stage: 'Onboarding', lastContact: '2026-03-30', daysSince: 2,  type: 'Call',  advisor: 'Sarah Chen' },
  { name: 'Carmen Reyes',    stage: 'Prospect',   lastContact: '2026-03-22', daysSince: 10, type: 'SMS',   advisor: 'James Okafor' },
  { name: 'Trevor Dunn',     stage: 'Active',     lastContact: '2026-03-29', daysSince: 3,  type: 'Call',  advisor: 'James Okafor' },
  { name: 'Aisha Patel',     stage: 'Prospect',   lastContact: '2026-03-20', daysSince: 12, type: 'Email', advisor: 'Marcus Williams' },
];

const CHURN_REASONS = [
  { reason: 'Pricing too high',       pct: 32 },
  { reason: 'Slow onboarding',        pct: 23 },
  { reason: 'Competitor switch',      pct: 18 },
  { reason: 'Credit decline',         pct: 15 },
  { reason: 'Personal circumstances', pct: 12 },
];

const RE_ENGAGEMENT = [
  { name: 'Trevor Dunn',   lastActive: 'Jan 2026', reason: 'Pricing',    probability: 68 },
  { name: 'Kevin Morales',  lastActive: 'Feb 2026', reason: 'Competitor', probability: 54 },
  { name: 'Samira Osei',   lastActive: 'Dec 2025', reason: 'Onboarding', probability: 41 },
];

const MONTHLY_REVENUE_ALL = [
  { month: 'Apr',  value: 98_200 },
  { month: 'May',  value: 105_600 },
  { month: 'Jun',  value: 112_300 },
  { month: 'Jul',  value: 119_800 },
  { month: 'Aug',  value: 124_400 },
  { month: 'Sep',  value: 131_900 },
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

function statusColor(status: string): string {
  if (status === 'Exceeding') return 'bg-emerald-500/20 text-emerald-400';
  if (status === 'On Target') return 'bg-amber-500/20 text-amber-400';
  return 'bg-red-500/20 text-red-400';
}

function approvalColor(rate: number): string {
  if (rate >= 70) return 'text-emerald-400';
  if (rate >= 60) return 'text-yellow-400';
  return 'text-red-400';
}

function showToast(msg: string) {
  if (typeof window !== 'undefined') {
    // Simple toast via alert — in production, wire to a toast library
    alert(msg);
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RevenueCard({ label, value, sub, up, gold }: { label: string; value: string; sub: string; up: boolean; gold?: boolean }) {
  return (
    <div className={`rounded-xl border ${gold ? 'border-[#C9A84C]/40' : 'border-gray-800'} bg-gray-900 p-5 flex flex-col gap-2`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${gold ? 'text-[#C9A84C]' : 'text-white'}`}>{value}</p>
      <p className={`text-xs font-medium ${up ? (gold ? 'text-[#C9A84C]' : 'text-emerald-400') : 'text-amber-400'}`}>{sub}</p>
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
        Data sourced from issuer partner APIs — updated daily
      </p>
    </div>
  );
}

function MonthlyRevenueTrend() {
  const [period, setPeriod] = useState<'MTD' | 'QTD' | 'YTD'>('QTD');

  const sliceMap: Record<string, number> = { MTD: 1, QTD: 3, YTD: 12 };
  const data = MONTHLY_REVENUE_ALL.slice(-sliceMap[period]);

  const maxVal = Math.max(...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const CHART_H = 120;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-200">Monthly Revenue Trend</h3>
        <div className="flex gap-1">
          {(['MTD', 'QTD', 'YTD'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                period === p
                  ? 'bg-[#C9A84C] text-[#0A1628]'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {period === 'MTD' ? 'March 2026' : period === 'QTD' ? 'Jan - Mar 2026' : 'Apr 2025 - Mar 2026'}
        {' '}&middot; Total: {fmtCurrency(total)}
      </p>

      {/* Bar chart */}
      <div className="flex items-end gap-3 justify-between" style={{ height: CHART_H + 32 }}>
        {data.map(({ month, value }) => {
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
        Revenue recognized at funding — net of refunds and chargebacks
      </p>
    </div>
  );
}

function LeadSourceChart() {
  const max = Math.max(...LEAD_SOURCES.map((d) => d.pct));
  const colors = ['#C9A84C', '#22c55e', '#3b82f6', '#a855f7', '#f97316'];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Lead Source Breakdown</h3>
      <p className="text-xs text-gray-500 mb-4">Q1 2026 — {FUNNEL_STAGES[0].count} total prospects</p>
      <div className="space-y-3">
        {LEAD_SOURCES.map(({ source, pct }, i) => {
          const barPct = Math.round((pct / max) * 100);
          return (
            <button
              key={source}
              onClick={() => showToast(`Lead Source: ${source} — ${pct}% of pipeline`)}
              className="w-full flex items-center gap-3 group cursor-pointer text-left"
            >
              <span className="text-xs text-gray-400 w-28 flex-shrink-0 group-hover:text-gray-200 transition-colors">{source}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 group-hover:brightness-125"
                  style={{ width: `${barPct}%`, backgroundColor: colors[i] }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-300 w-9 text-right tabular-nums">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AdvisorPerformanceTable() {
  const [sortKey, setSortKey] = useState<keyof AdvisorRowEnhanced>('feesMTD');

  const sorted = [...ADVISOR_PERFORMANCE_ENHANCED].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') {
      return parseFloat(bv.replace(/[^0-9.]/g, '')) - parseFloat(av.replace(/[^0-9.]/g, ''));
    }
    return (bv as number) - (av as number);
  });

  type Col = { key: keyof AdvisorRowEnhanced; label: string; align: 'left' | 'right' | 'center' };
  const COLS: Col[] = [
    { key: 'name',          label: 'Advisor',        align: 'left'   },
    { key: 'activeClients', label: 'Active Clients', align: 'right'  },
    { key: 'dealsMTD',      label: 'Deals MTD',      align: 'right'  },
    { key: 'approvalRate',  label: 'Approval %',     align: 'right'  },
    { key: 'avgDealSize',   label: 'Avg Deal Size',  align: 'right'  },
    { key: 'feesMTD',       label: 'Fees MTD',       align: 'right'  },
    { key: 'nps',           label: 'NPS',            align: 'right'  },
    { key: 'status',        label: 'Status',         align: 'center' },
  ];

  return (
    <div className="rounded-xl border border-gray-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
            {COLS.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-semibold cursor-pointer hover:text-gray-200 transition-colors select-none whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                } ${sortKey === col.key ? 'text-[#C9A84C]' : ''}`}
                onClick={() => setSortKey(col.key)}
              >
                {col.label}
                {sortKey === col.key && <span className="ml-1 opacity-70">&#8595;</span>}
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
              <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{row.activeClients}</td>
              <td className="px-4 py-3 text-right text-gray-300 tabular-nums font-semibold">{row.dealsMTD}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={`font-bold ${approvalColor(row.approvalRate)}`}>{row.approvalRate}%</span>
              </td>
              <td className="px-4 py-3 text-right text-gray-100 tabular-nums">{row.avgDealSize}</td>
              <td className="px-4 py-3 text-right text-gray-100 font-semibold tabular-nums">{row.feesMTD}</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-200">{row.nps}</td>
              <td className="px-4 py-3 text-center">
                <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusColor(row.status)}`}>
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FollowUpQueue() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Follow-Up Due Today</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {FOLLOW_UP_QUEUE.length} clients require outreach &middot; {FOLLOW_UP_QUEUE.filter(c => c.daysSince > 7).length} overdue
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800">
              <th className="px-3 py-2 text-left font-semibold">Client</th>
              <th className="px-3 py-2 text-left font-semibold">Stage</th>
              <th className="px-3 py-2 text-left font-semibold">Last Contact</th>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-left font-semibold">Advisor</th>
              <th className="px-3 py-2 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {FOLLOW_UP_QUEUE.map((client) => {
              const overdue = client.daysSince > 7;
              return (
                <tr
                  key={client.name}
                  className={`transition-colors ${overdue ? 'bg-amber-900/10 hover:bg-amber-900/20' : 'hover:bg-gray-800/50'}`}
                >
                  <td className="px-3 py-2.5 font-medium text-gray-100">
                    <div className="flex items-center gap-2">
                      {overdue && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Overdue" />}
                      {client.name}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-400">{client.stage}</td>
                  <td className="px-3 py-2.5 text-gray-400 tabular-nums">
                    {client.lastContact}
                    <span className={`ml-1.5 text-[11px] ${overdue ? 'text-amber-400 font-semibold' : 'text-gray-600'}`}>
                      ({client.daysSince}d ago)
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-400">{client.type}</td>
                  <td className="px-3 py-2.5 text-gray-400">{client.advisor}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => showToast(`Starting outreach for ${client.name} via ${client.type}`)}
                      className="px-3 py-1 rounded-md bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-[11px] font-semibold transition-colors"
                    >
                      Start Outreach
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChurnAnalysis() {
  const [open, setOpen] = useState(false);
  const maxPct = Math.max(...CHURN_REASONS.map((d) => d.pct));

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left group"
      >
        <div>
          <h3 className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">
            Churn Analysis
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {FUNNEL_STAGES.find(s => s.key === 'churned')?.count} churned clients &middot; Avg tenure 4.2 months
          </p>
        </div>
        <span className={`text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          &#9660;
        </span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-6 border-t border-gray-800 pt-4">
          {/* Reasons breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Top Churn Reasons</h4>
            <div className="space-y-2.5">
              {CHURN_REASONS.map(({ reason, pct }) => {
                const barPct = Math.round((pct / maxPct) * 100);
                return (
                  <div key={reason} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-44 flex-shrink-0">{reason}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-500/70"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-300 w-9 text-right tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6">
            <div className="rounded-lg bg-gray-800/50 p-4 flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Time to Churn</p>
              <p className="text-2xl font-bold text-white mt-1">4.2 <span className="text-sm text-gray-400 font-normal">months</span></p>
            </div>
            <div className="rounded-lg bg-gray-800/50 p-4 flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Churn Rate (Q1)</p>
              <p className="text-2xl font-bold text-red-400 mt-1">3.7<span className="text-sm text-gray-400 font-normal">%</span></p>
            </div>
            <div className="rounded-lg bg-gray-800/50 p-4 flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Revenue at Risk</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">$38.4k</p>
            </div>
          </div>

          {/* Re-engagement */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Re-Engagement Opportunities</h4>
            <div className="space-y-2">
              {RE_ENGAGEMENT.map((client) => (
                <div
                  key={client.name}
                  className="flex items-center justify-between rounded-lg bg-gray-800/30 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-200">{client.name}</p>
                    <p className="text-[11px] text-gray-500">
                      Last active {client.lastActive} &middot; Left due to: {client.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold tabular-nums ${
                      client.probability >= 60 ? 'text-emerald-400' : client.probability >= 50 ? 'text-amber-400' : 'text-gray-400'
                    }`}>
                      {client.probability}% likely
                    </span>
                    <button
                      onClick={() => showToast(`Re-engagement campaign started for ${client.name}`)}
                      className="px-3 py-1 rounded-md border border-gray-700 text-gray-300 text-[11px] font-medium hover:bg-gray-700 transition-colors"
                    >
                      Re-Engage
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

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

      {/* ── Revenue KPI Cards (now 4 including NPS) ───────────── */}
      <section aria-labelledby="revenue-heading">
        <h2 id="revenue-heading" className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Revenue Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {REVENUE_CARDS.map((card) => (
            <RevenueCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      {/* ── Main Grid: Funnel + Lead Sources | Charts ────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Funnel + Lead Sources — 2 cols */}
        <section aria-labelledby="funnel-heading" className="xl:col-span-2 space-y-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 id="funnel-heading" className="text-sm font-semibold text-gray-200 mb-1">
              Client Pipeline Funnel
            </h2>
            <p className="text-xs text-gray-500 mb-5">
              Total: {FUNNEL_STAGES.reduce((s, st) => s + st.count, 0)} clients across all stages
              {selectedStage && (
                <button
                  onClick={() => setSelectedStage(null)}
                  className="ml-2 text-[#C9A84C] hover:underline"
                >
                  Clear filter
                </button>
              )}
            </p>
            <PipelineFunnel
              stages={FUNNEL_STAGES}
              onStageClick={(key: string) => setSelectedStage(selectedStage === key ? null : key)}
              selectedStage={selectedStage}
            />
          </div>

          {/* Stage detail panel */}
          {selectedStage && STAGE_CLIENTS[selectedStage] && (
            <div className="rounded-xl border border-[#C9A84C]/30 bg-gray-900 p-5 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#C9A84C]">
                  {FUNNEL_STAGES.find(s => s.key === selectedStage)?.label} — Clients
                </h3>
                <button
                  onClick={() => setSelectedStage(null)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Close
                </button>
              </div>
              <div className="space-y-2">
                {STAGE_CLIENTS[selectedStage].map((client) => (
                  <div
                    key={client.name}
                    className="flex items-center justify-between rounded-lg bg-gray-800/40 px-4 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-200">{client.name}</p>
                      <p className="text-[11px] text-gray-500">Advisor: {client.advisor}</p>
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums">{client.daysInStage}d in stage</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lead Source Breakdown */}
          <LeadSourceChart />
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
              Click a column header to sort. 4 advisors — March 2026.
            </p>
          </div>
          <button className="text-xs text-[#C9A84C] hover:underline">
            View full leaderboard
          </button>
        </div>
        <AdvisorPerformanceTable />
      </section>

      {/* ── Follow-Up Task Queue ────────────────────────────────── */}
      <section aria-labelledby="followup-heading">
        <h2 id="followup-heading" className="sr-only">Follow-Up Queue</h2>
        <FollowUpQueue />
      </section>

      {/* ── Churn Analysis (Collapsible) ─────────────────────────── */}
      <section aria-labelledby="churn-heading">
        <h2 id="churn-heading" className="sr-only">Churn Analysis</h2>
        <ChurnAnalysis />
      </section>

    </div>
  );
}
