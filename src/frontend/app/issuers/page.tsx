'use client';

// ============================================================
// /issuers — Issuer Relationship Management
// Sections:
//   1. Issuer contact directory table (banker name, recon line,
//      relationship score gauge)
//   2. Reconsideration outcomes by issuer (success rate bar)
//   3. Approval trends per issuer (monthly trend indicator)
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrendDirection = 'improving' | 'declining' | 'stable';

interface IssuerContact {
  id: string;
  issuer: string;
  bankerName: string;
  bankerPhone: string;
  reconsiderationLine: string;
  reconsiderationHours: string;
  relationshipScore: number; // 0–100
  tier: 'platinum' | 'gold' | 'silver' | 'standard';
  lastContact: string;
}

interface IssuerOutcome {
  issuer: string;
  totalRecons: number;
  successful: number;
  avgResponseDays: number;
}

interface IssuerTrend {
  issuer: string;
  approvalRateLast3Mo: number[];   // [3mo_ago, 2mo_ago, last_mo]
  trend: TrendDirection;
  currentRate: number;
  deltaPoints: number;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const ISSUER_CONTACTS: IssuerContact[] = [
  {
    id: 'iss_001', issuer: 'Chase', bankerName: 'Derek Holloway',
    bankerPhone: '1-800-453-9719', reconsiderationLine: '1-888-270-2127',
    reconsiderationHours: 'Mon–Fri 8am–9pm ET', relationshipScore: 88,
    tier: 'platinum', lastContact: '2026-03-29',
  },
  {
    id: 'iss_002', issuer: 'American Express', bankerName: 'Linda Farrow',
    bankerPhone: '1-800-528-4800', reconsiderationLine: '1-800-567-1083',
    reconsiderationHours: 'Mon–Fri 9am–8pm ET', relationshipScore: 74,
    tier: 'gold', lastContact: '2026-03-25',
  },
  {
    id: 'iss_003', issuer: 'Capital One', bankerName: 'James Patel',
    bankerPhone: '1-877-383-4802', reconsiderationLine: '1-800-625-7866',
    reconsiderationHours: '24/7', relationshipScore: 61,
    tier: 'silver', lastContact: '2026-03-20',
  },
  {
    id: 'iss_004', issuer: 'Citi', bankerName: 'Michelle Torres',
    bankerPhone: '1-800-695-5171', reconsiderationLine: '1-800-695-5171',
    reconsiderationHours: 'Mon–Fri 8am–10pm ET', relationshipScore: 55,
    tier: 'silver', lastContact: '2026-03-15',
  },
  {
    id: 'iss_005', issuer: 'Bank of America', bankerName: 'Robert Kim',
    bankerPhone: '1-888-287-4637', reconsiderationLine: '1-800-481-8277',
    reconsiderationHours: 'Mon–Fri 8am–11pm ET', relationshipScore: 47,
    tier: 'standard', lastContact: '2026-03-10',
  },
  {
    id: 'iss_006', issuer: 'US Bank', bankerName: 'Angela Reed',
    bankerPhone: '1-800-872-2657', reconsiderationLine: '1-800-685-7680',
    reconsiderationHours: 'Mon–Fri 8am–8pm CT', relationshipScore: 69,
    tier: 'gold', lastContact: '2026-03-22',
  },
  {
    id: 'iss_007', issuer: 'Wells Fargo', bankerName: 'Tom Bryant',
    bankerPhone: '1-800-225-5935', reconsiderationLine: '1-800-869-3557',
    reconsiderationHours: 'Mon–Fri 7am–11pm ET', relationshipScore: 38,
    tier: 'standard', lastContact: '2026-02-28',
  },
];

const ISSUER_OUTCOMES: IssuerOutcome[] = [
  { issuer: 'Chase',            totalRecons: 14, successful: 10, avgResponseDays: 2 },
  { issuer: 'American Express', totalRecons: 11, successful: 7,  avgResponseDays: 3 },
  { issuer: 'Capital One',      totalRecons: 8,  successful: 4,  avgResponseDays: 5 },
  { issuer: 'Citi',             totalRecons: 9,  successful: 3,  avgResponseDays: 7 },
  { issuer: 'Bank of America',  totalRecons: 6,  successful: 2,  avgResponseDays: 6 },
  { issuer: 'US Bank',          totalRecons: 5,  successful: 3,  avgResponseDays: 4 },
  { issuer: 'Wells Fargo',      totalRecons: 4,  successful: 1,  avgResponseDays: 9 },
];

const ISSUER_TRENDS: IssuerTrend[] = [
  { issuer: 'Chase',            approvalRateLast3Mo: [71, 74, 79], trend: 'improving', currentRate: 79, deltaPoints: 8  },
  { issuer: 'American Express', approvalRateLast3Mo: [68, 66, 65], trend: 'declining', currentRate: 65, deltaPoints: -3 },
  { issuer: 'Capital One',      approvalRateLast3Mo: [58, 58, 59], trend: 'stable',    currentRate: 59, deltaPoints: 1  },
  { issuer: 'Citi',             approvalRateLast3Mo: [62, 55, 50], trend: 'declining', currentRate: 50, deltaPoints: -12 },
  { issuer: 'Bank of America',  approvalRateLast3Mo: [44, 47, 51], trend: 'improving', currentRate: 51, deltaPoints: 7  },
  { issuer: 'US Bank',          approvalRateLast3Mo: [70, 69, 71], trend: 'stable',    currentRate: 71, deltaPoints: 1  },
  { issuer: 'Wells Fargo',      approvalRateLast3Mo: [40, 38, 36], trend: 'declining', currentRate: 36, deltaPoints: -4 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 80) return '#10B981'; // green
  if (score >= 60) return '#C9A84C'; // gold
  if (score >= 40) return '#F59E0B'; // amber
  return '#EF4444';                  // red
}

function tierBadge(tier: IssuerContact['tier']): string {
  const map: Record<IssuerContact['tier'], string> = {
    platinum: 'bg-indigo-900 text-indigo-300 border-indigo-700',
    gold:     'bg-yellow-900 text-yellow-300 border-yellow-700',
    silver:   'bg-gray-700 text-gray-300 border-gray-600',
    standard: 'bg-gray-800 text-gray-500 border-gray-700',
  };
  return map[tier];
}

function trendIcon(trend: TrendDirection): { icon: string; cls: string } {
  if (trend === 'improving') return { icon: '↑', cls: 'text-green-400' };
  if (trend === 'declining') return { icon: '↓', cls: 'text-red-400' };
  return { icon: '→', cls: 'text-yellow-400' };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RelationshipGauge({ score }: { score: number }) {
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const filled = (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <div className="flex items-center gap-2">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-label={`Relationship score ${score}`}>
        <circle cx="22" cy="22" r={radius} fill="none" stroke="#374151" strokeWidth="5" />
        <circle
          cx="22" cy="22" r={radius}
          fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
        <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: '9px', fontWeight: 700, fill: '#F9FAFB' }}>
          {score}
        </text>
      </svg>
    </div>
  );
}

function MiniSparkbar({ values }: { values: number[] }) {
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-2 rounded-sm bg-blue-600 opacity-70"
          style={{ height: `${(v / max) * 24}px` }}
          title={`${v}%`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IssuersPage() {
  const [contactSearch, setContactSearch] = useState('');
  const [selectedTier, setSelectedTier] = useState<string>('all');

  const filteredContacts = ISSUER_CONTACTS.filter((c) => {
    const matchSearch = !contactSearch ||
      c.issuer.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.bankerName.toLowerCase().includes(contactSearch.toLowerCase());
    const matchTier = selectedTier === 'all' || c.tier === selectedTier;
    return matchSearch && matchTier;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Issuer Relationships</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {ISSUER_CONTACTS.length} issuers tracked · banker contacts, recon lines & approval intelligence
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm font-semibold text-white transition-colors">
          + Add Issuer Contact
        </button>
      </div>

      {/* ── Section 1: Contact Directory ─────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-semibold text-gray-200">Contact Directory</h2>
          <div className="flex gap-2 flex-wrap">
            {/* Tier filter */}
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-600"
            >
              <option value="all">All Tiers</option>
              <option value="platinum">Platinum</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="standard">Standard</option>
            </select>
            <input
              type="text"
              placeholder="Search issuer or banker…"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-600 w-52"
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Issuer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Banker Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Direct Line</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Recon Line</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Hours</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tier</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Relationship</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredContacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-900/60 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-white">{c.issuer}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{c.bankerName}</td>
                  <td className="px-4 py-3">
                    <a href={`tel:${c.bankerPhone}`} className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline">
                      {c.bankerPhone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`tel:${c.reconsiderationLine}`} className="font-mono text-xs text-yellow-400 hover:text-yellow-300 hover:underline">
                      {c.reconsiderationLine}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{c.reconsiderationHours}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border uppercase ${tierBadge(c.tier)}`}>
                      {c.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex justify-center">
                    <RelationshipGauge score={c.relationshipScore} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.lastContact}</td>
                </tr>
              ))}
              {filteredContacts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-600 text-sm">
                    No issuers match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 2 & 3 side-by-side ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Section 2: Reconsideration Outcomes */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">Reconsideration Outcomes</h2>
          <p className="text-xs text-gray-500 mb-5">Success rate by issuer · all-time recon attempts</p>

          <div className="space-y-4">
            {ISSUER_OUTCOMES.sort((a, b) => (b.successful / b.totalRecons) - (a.successful / a.totalRecons)).map((o) => {
              const rate = Math.round((o.successful / o.totalRecons) * 100);
              const barColor = rate >= 70 ? 'bg-green-600' : rate >= 45 ? 'bg-yellow-600' : 'bg-red-700';
              return (
                <div key={o.issuer}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-200">{o.issuer}</span>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{o.successful}/{o.totalRecons} approved</span>
                      <span className="text-gray-600">·</span>
                      <span>avg {o.avgResponseDays}d</span>
                      <span className={`font-bold text-sm ${rate >= 70 ? 'text-green-400' : rate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {rate}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary row */}
          <div className="mt-6 pt-4 border-t border-gray-800 flex gap-6 text-xs text-gray-400">
            <div>
              <p className="text-gray-500">Total Recons</p>
              <p className="text-white font-bold text-base mt-0.5">
                {ISSUER_OUTCOMES.reduce((s, o) => s + o.totalRecons, 0)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Total Approved</p>
              <p className="text-green-400 font-bold text-base mt-0.5">
                {ISSUER_OUTCOMES.reduce((s, o) => s + o.successful, 0)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Blended Rate</p>
              <p className="text-yellow-400 font-bold text-base mt-0.5">
                {Math.round(
                  (ISSUER_OUTCOMES.reduce((s, o) => s + o.successful, 0) /
                    ISSUER_OUTCOMES.reduce((s, o) => s + o.totalRecons, 0)) * 100
                )}%
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Approval Trends */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">Approval Trends</h2>
          <p className="text-xs text-gray-500 mb-5">Monthly approval rate per issuer · last 3 months</p>

          <div className="space-y-3">
            {ISSUER_TRENDS.sort((a, b) => b.currentRate - a.currentRate).map((t) => {
              const { icon, cls } = trendIcon(t.trend);
              const deltaDisplay = t.deltaPoints > 0 ? `+${t.deltaPoints}pts` : `${t.deltaPoints}pts`;
              const trendBg = t.trend === 'improving'
                ? 'bg-green-900/30 border-green-800'
                : t.trend === 'declining'
                  ? 'bg-red-900/30 border-red-900'
                  : 'bg-yellow-900/20 border-yellow-900';

              return (
                <div key={t.issuer} className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${trendBg}`}>
                  {/* Issuer name */}
                  <div className="w-36 flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-100">{t.issuer}</p>
                  </div>

                  {/* Sparkbars */}
                  <div className="flex-1">
                    <MiniSparkbar values={t.approvalRateLast3Mo} />
                  </div>

                  {/* Current rate */}
                  <div className="text-right flex-shrink-0 w-16">
                    <p className="text-base font-bold text-white">{t.currentRate}%</p>
                    <p className="text-xs text-gray-500">current</p>
                  </div>

                  {/* Trend indicator */}
                  <div className={`flex items-center gap-1 flex-shrink-0 w-24 justify-end ${cls}`}>
                    <span className="text-lg font-bold leading-none">{icon}</span>
                    <div className="text-right">
                      <p className="text-xs font-semibold">{t.trend}</p>
                      <p className="text-xs opacity-70">{deltaDisplay}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-gray-600">
            Sparkbars show: 3 months ago → 2 months ago → last month. Rate = approvals ÷ submissions.
          </p>
        </section>
      </div>
    </div>
  );
}
