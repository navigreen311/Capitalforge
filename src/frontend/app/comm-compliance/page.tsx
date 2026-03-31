'use client';

// ============================================================
// /comm-compliance — Communication Compliance
// Approved scripts library with category filter.
// Banned claims scanner — text input with real-time risk score.
// QA scorecard table per advisor (overall, compliance,
// script adherence, consent capture scores).
// Communication risk trend chart placeholder.
// ============================================================

import { useState, useMemo } from 'react';
import ComplianceScanner from '../../components/modules/compliance-scanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScriptCategory = 'outbound_sales' | 'objection_handling' | 'disclosure' | 'consent' | 'follow_up';

interface ApprovedScript {
  id: string;
  title: string;
  category: ScriptCategory;
  version: string;
  approvedBy: string;
  approvedAt: string;
  body: string;
  tags: string[];
}

interface AdvisorQAScore {
  advisorName: string;
  avatarInitials: string;
  callsReviewed: number;
  overallScore: number;
  complianceScore: number;
  scriptAdherenceScore: number;
  consentCaptureScore: number;
  lastReviewedAt: string;
  trend: 'up' | 'down' | 'flat';
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_SCRIPTS: ApprovedScript[] = [
  {
    id: 'scr_001',
    title: 'Opening Call — Business Funding Introduction',
    category: 'outbound_sales',
    version: '2.3',
    approvedBy: 'Compliance Team',
    approvedAt: '2026-02-15',
    tags: ['outbound', 'cold call', 'introduction'],
    body: `Hello, may I speak with [Owner Name]? Hi [Name], this is [Advisor Name] calling from CapitalForge. I'm reaching out because we help businesses like yours access flexible funding solutions — things like business lines of credit, equipment financing, and working capital. I'm not here to sell you anything today, just to understand if there's a fit. Do you have two minutes to chat about your current funding needs? [Pause for response] Great. Could you tell me a bit about your business and whether you've explored any funding options recently?`,
  },
  {
    id: 'scr_002',
    title: 'Rate & Terms Disclosure Script',
    category: 'disclosure',
    version: '3.1',
    approvedBy: 'Legal & Compliance',
    approvedAt: '2026-03-01',
    tags: ['disclosure', 'APR', 'required'],
    body: `Before we proceed, I'm required to share some important disclosures with you. The annual percentage rate for this offer ranges from [X%] to [Y%] depending on your creditworthiness and selected term. Total repayment amount would be [$ Amount] over [Term] months. There is [no prepayment penalty / a prepayment fee of X%]. This offer is subject to final credit approval and verification of your business documents. Do you have any questions about these terms before we continue?`,
  },
  {
    id: 'scr_003',
    title: 'TCPA Consent Capture — Voice',
    category: 'consent',
    version: '1.8',
    approvedBy: 'Legal & Compliance',
    approvedAt: '2026-01-20',
    tags: ['TCPA', 'consent', 'required', 'voice'],
    body: `Before we wrap up, I need to capture your consent for future contact. By saying yes, you agree that CapitalForge and its partners may contact you at [phone number] using automated dialing systems or pre-recorded messages for informational and marketing purposes. This consent is not required to obtain our services, and you can revoke it at any time by calling [number] or emailing [email]. Do you provide your consent? [Record response clearly: "Yes" or "No"]`,
  },
  {
    id: 'scr_004',
    title: 'Handling the "What Are Your Rates?" Objection',
    category: 'objection_handling',
    version: '1.4',
    approvedBy: 'Compliance Team',
    approvedAt: '2026-02-28',
    tags: ['objection', 'rates', 'APR'],
    body: `Great question — I want to give you an honest answer on that. Our rates are competitive and depend on a few factors: how long you've been in business, your monthly revenue, and your credit profile. Generally, we work with businesses where rates range from [X%] to [Y%] APR. The best way to know your actual rate is to complete a quick application — it's a soft pull only, so it won't affect your credit score. Would you like to take five minutes to find out where you'd qualify?`,
  },
  {
    id: 'scr_005',
    title: 'Follow-Up Call — Application Status Check',
    category: 'follow_up',
    version: '1.1',
    approvedBy: 'Compliance Team',
    approvedAt: '2026-03-10',
    tags: ['follow-up', 'application', 'status'],
    body: `Hi [Name], this is [Advisor Name] from CapitalForge following up on your funding application from [Date]. I wanted to let you know that your application is currently [under review / in the final approval stage] and we expect a decision by [Date]. Is there anything you need from our side, or any questions I can answer while you wait? [If approved:] Great news — your application has been approved for [$ Amount]. I'd love to walk you through your options when you have a few minutes.`,
  },
  {
    id: 'scr_006',
    title: 'Voicemail Script — Compliant Drop',
    category: 'outbound_sales',
    version: '2.0',
    approvedBy: 'Legal & Compliance',
    approvedAt: '2026-02-10',
    tags: ['voicemail', 'outbound', 'TCPA'],
    body: `Hi [Name], this is [Advisor Name] from CapitalForge — our number is [Phone Number]. I'm reaching out about business funding options that may be available to [Business Name]. No obligation to respond. If you're interested in learning more, please call us at [Phone Number] or visit capitalforge.com. This message was intended for [Name], owner of [Business Name]. If you received this in error, please disregard.`,
  },
];

const PLACEHOLDER_QA_SCORES: AdvisorQAScore[] = [
  {
    advisorName: 'Jordan Mitchell',
    avatarInitials: 'JM',
    callsReviewed: 42,
    overallScore: 94,
    complianceScore: 97,
    scriptAdherenceScore: 91,
    consentCaptureScore: 95,
    lastReviewedAt: '2026-03-28',
    trend: 'up',
  },
  {
    advisorName: 'Casey Rivera',
    avatarInitials: 'CR',
    callsReviewed: 38,
    overallScore: 81,
    complianceScore: 84,
    scriptAdherenceScore: 78,
    consentCaptureScore: 80,
    lastReviewedAt: '2026-03-27',
    trend: 'flat',
  },
  {
    advisorName: 'Alex Torres',
    avatarInitials: 'AT',
    callsReviewed: 29,
    overallScore: 73,
    complianceScore: 70,
    scriptAdherenceScore: 75,
    consentCaptureScore: 68,
    lastReviewedAt: '2026-03-25',
    trend: 'down',
  },
  {
    advisorName: 'Morgan Park',
    avatarInitials: 'MP',
    callsReviewed: 51,
    overallScore: 88,
    complianceScore: 90,
    scriptAdherenceScore: 86,
    consentCaptureScore: 92,
    lastReviewedAt: '2026-03-29',
    trend: 'up',
  },
  {
    advisorName: 'Sam Delgado',
    avatarInitials: 'SD',
    callsReviewed: 14,
    overallScore: 62,
    complianceScore: 58,
    scriptAdherenceScore: 64,
    consentCaptureScore: 55,
    lastReviewedAt: '2026-03-20',
    trend: 'down',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<ScriptCategory, { label: string; color: string }> = {
  outbound_sales:    { label: 'Outbound Sales',    color: 'bg-blue-900 text-blue-300 border-blue-700' },
  objection_handling:{ label: 'Objection Handling', color: 'bg-purple-900 text-purple-300 border-purple-700' },
  disclosure:        { label: 'Disclosure',         color: 'bg-amber-900 text-amber-300 border-amber-700' },
  consent:           { label: 'Consent',            color: 'bg-green-900 text-green-300 border-green-700' },
  follow_up:         { label: 'Follow-Up',          color: 'bg-gray-800 text-gray-300 border-gray-600' },
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-400';
  if (score >= 75) return 'text-yellow-400';
  if (score >= 60) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 90) return 'bg-green-900/40';
  if (score >= 75) return 'bg-yellow-900/40';
  if (score >= 60) return 'bg-orange-900/40';
  return 'bg-red-900/40';
}

function MiniScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? '#22c55e' : score >= 75 ? '#eab308' : score >= 60 ? '#f97316' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scripts Library
// ---------------------------------------------------------------------------

function ScriptsLibrary({ scripts }: { scripts: ApprovedScript[] }) {
  const [categoryFilter, setCategoryFilter] = useState<ScriptCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(scripts.map((s) => s.category))) as ScriptCategory[],
    [scripts],
  );

  const filtered = useMemo(() => {
    let list = scripts;
    if (categoryFilter !== 'all') list = list.filter((s) => s.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.body.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [scripts, categoryFilter, searchQuery]);

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scripts by title, keyword, or tag…"
            className="w-full rounded-xl border border-gray-700 bg-gray-900 text-gray-100 text-sm
                       placeholder:text-gray-600 pl-9 pr-4 py-2.5 focus:outline-none
                       focus:border-brand-gold/60 transition-colors"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">⌕</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              categoryFilter === 'all'
                ? 'bg-brand-navy-700 border-brand-gold text-brand-gold'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                categoryFilter === cat
                  ? 'bg-brand-navy-700 border-brand-gold text-brand-gold'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {CATEGORY_CONFIG[cat].label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">{filtered.length} of {scripts.length} scripts</p>

      <div className="space-y-2">
        {filtered.map((script) => {
          const cat = CATEGORY_CONFIG[script.category];
          const isOpen = expandedId === script.id;

          return (
            <div key={script.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <button
                className="w-full text-left px-4 py-3"
                onClick={() => setExpandedId(isOpen ? null : script.id)}
                aria-expanded={isOpen}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${cat.color}`}>
                        {cat.label}
                      </span>
                      <span className="text-xs text-gray-500">v{script.version}</span>
                      {script.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-xs bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm font-semibold text-gray-100">{script.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Approved by {script.approvedBy} · {formatDate(script.approvedAt)}
                    </p>
                  </div>
                  <span className="text-gray-500 text-xs flex-shrink-0 mt-1">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 px-4 py-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Script Body</p>
                  <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{script.body}</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="text-xs text-brand-gold hover:text-brand-gold/80 font-semibold transition-colors">
                      Copy to clipboard →
                    </button>
                    <span className="text-gray-700">·</span>
                    <button className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                      Scan for compliance
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-sm text-gray-500">No scripts match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QA Scorecard Table
// ---------------------------------------------------------------------------

function QAScorecardTable({ scores }: { scores: AdvisorQAScore[] }) {
  const [sortKey, setSortKey] = useState<keyof AdvisorQAScore>('overallScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...scores].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [scores, sortKey, sortDir]);

  const handleSort = (key: keyof AdvisorQAScore) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ colKey, label }: { colKey: keyof AdvisorQAScore; label: string }) => (
    <th
      className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-200 transition-colors select-none whitespace-nowrap"
      onClick={() => handleSort(colKey)}
    >
      {label}
      <span className="ml-1 text-gray-600">
        {sortKey === colKey ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  );

  const TREND_ICON: Record<string, string> = { up: '↑', down: '↓', flat: '→' };
  const TREND_COLOR: Record<string, string> = { up: 'text-green-400', down: 'text-red-400', flat: 'text-gray-400' };

  return (
    <div className="overflow-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm min-w-[700px]">
        <thead className="bg-gray-900 border-b border-gray-800">
          <tr>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Advisor</th>
            <SortHeader colKey="overallScore"          label="Overall" />
            <SortHeader colKey="complianceScore"       label="Compliance" />
            <SortHeader colKey="scriptAdherenceScore"  label="Script Adherence" />
            <SortHeader colKey="consentCaptureScore"   label="Consent Capture" />
            <SortHeader colKey="callsReviewed"         label="Calls Reviewed" />
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Trend</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Review</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.advisorName}
              className={`border-t border-gray-800 transition-colors hover:bg-gray-800/40 ${
                i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/60'
              }`}
            >
              {/* Advisor */}
              <td className="py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 h-8 w-8 rounded-full bg-brand-gold/20 text-brand-gold text-xs font-bold flex items-center justify-center">
                    {row.avatarInitials}
                  </span>
                  <span className="font-semibold text-gray-100 text-sm">{row.advisorName}</span>
                </div>
              </td>

              {/* Overall */}
              <td className="py-3 px-4">
                <div className={`inline-flex items-center justify-center h-8 w-10 rounded-lg text-sm font-black ${scoreBg(row.overallScore)} ${scoreColor(row.overallScore)}`}>
                  {row.overallScore}
                </div>
              </td>

              {/* Compliance */}
              <td className="py-3 px-4"><MiniScoreBar score={row.complianceScore} /></td>

              {/* Script Adherence */}
              <td className="py-3 px-4"><MiniScoreBar score={row.scriptAdherenceScore} /></td>

              {/* Consent Capture */}
              <td className="py-3 px-4"><MiniScoreBar score={row.consentCaptureScore} /></td>

              {/* Calls Reviewed */}
              <td className="py-3 px-4 text-gray-400 text-xs tabular-nums">{row.callsReviewed}</td>

              {/* Trend */}
              <td className="py-3 px-4">
                <span className={`text-sm font-bold ${TREND_COLOR[row.trend]}`}>
                  {TREND_ICON[row.trend]}
                </span>
              </td>

              {/* Last Review */}
              <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">{formatDate(row.lastReviewedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Trend Chart Placeholder
// ---------------------------------------------------------------------------

function RiskTrendChartPlaceholder() {
  // Fake sparkline data for visual structure
  const points = [68, 72, 65, 78, 70, 82, 75, 88, 80, 85, 79, 90];
  const maxVal = 100;
  const w = 600;
  const h = 120;
  const padX = 20;
  const padY = 16;

  const xs = points.map((_, i) => padX + (i / (points.length - 1)) * (w - padX * 2));
  const ys = points.map((p) => h - padY - (p / maxVal) * (h - padY * 2));
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ');
  const areaD = `${pathD} L ${xs[xs.length - 1]} ${h - padY} L ${xs[0]} ${h - padY} Z`;

  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Communication Risk Score Trend
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">6-month rolling average across all reviewed communications</p>
        </div>
        <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-1 rounded">
          Chart placeholder
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" aria-label="Risk trend chart placeholder">
          {/* Grid lines */}
          {[25, 50, 75, 100].map((val) => {
            const y = h - padY - (val / maxVal) * (h - padY * 2);
            return (
              <g key={val}>
                <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="#1f2937" strokeWidth={1} />
                <text x={padX - 4} y={y + 4} fontSize={9} fill="#4b5563" textAnchor="end">{val}</text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaD} fill="#C9A84C" fillOpacity={0.06} />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#C9A84C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points */}
          {xs.map((x, i) => (
            <circle key={i} cx={x} cy={ys[i]} r={3} fill="#C9A84C" />
          ))}

          {/* Month labels */}
          {months.map((m, i) => {
            const segX = padX + ((i * 2 + 1) / (points.length - 1)) * (w - padX * 2);
            return (
              <text key={m} x={segX} y={h - 2} fontSize={10} fill="#6b7280" textAnchor="middle">{m}</text>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-800">
        {[
          { label: 'Avg Risk Score', value: '79', color: 'text-brand-gold' },
          { label: 'Improvement vs Prior Period', value: '+11pts', color: 'text-green-400' },
          { label: 'High-Risk Comms This Month', value: '3', color: 'text-orange-400' },
          { label: 'Scans Completed', value: '214', color: 'text-gray-300' },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col">
            <span className="text-xs text-gray-500">{stat.label}</span>
            <span className={`text-lg font-black ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = 'scripts' | 'scanner' | 'scorecard' | 'trends';

export default function CommCompliancePage() {
  const [activeTab, setActiveTab] = useState<Tab>('scripts');

  const avgScore = Math.round(
    PLACEHOLDER_QA_SCORES.reduce((a, s) => a + s.overallScore, 0) / PLACEHOLDER_QA_SCORES.length,
  );
  const lowScoreCount = PLACEHOLDER_QA_SCORES.filter((s) => s.overallScore < 75).length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Communication Compliance</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {PLACEHOLDER_SCRIPTS.length} approved scripts · {PLACEHOLDER_QA_SCORES.length} advisors scored
            {lowScoreCount > 0 && (
              <span className="ml-2 text-orange-400 font-semibold">
                ⚠ {lowScoreCount} advisor{lowScoreCount !== 1 ? 's' : ''} below threshold
              </span>
            )}
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-brand-gold text-brand-navy text-sm font-bold hover:opacity-90 transition-opacity">
          Submit for QA Review
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Approved Scripts',   value: PLACEHOLDER_SCRIPTS.length, color: 'text-gray-100' },
          { label: 'Team Avg Score',     value: `${avgScore}%`,             color: avgScore >= 85 ? 'text-green-400' : avgScore >= 70 ? 'text-yellow-400' : 'text-red-400' },
          { label: 'Below Threshold',    value: lowScoreCount,              color: lowScoreCount > 0 ? 'text-orange-400' : 'text-gray-400' },
          { label: 'Scans This Month',   value: 214,                        color: 'text-brand-gold' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800 overflow-x-auto">
        {([
          { key: 'scripts',   label: 'Scripts Library' },
          { key: 'scanner',   label: 'Claims Scanner' },
          { key: 'scorecard', label: 'QA Scorecard' },
          { key: 'trends',    label: 'Risk Trends' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-brand-gold text-brand-gold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Scripts Library */}
      {activeTab === 'scripts' && (
        <ScriptsLibrary scripts={PLACEHOLDER_SCRIPTS} />
      )}

      {/* Tab: Claims Scanner */}
      {activeTab === 'scanner' && (
        <div>
          <div className="mb-4">
            <p className="text-sm text-gray-400">
              Paste or type any communication — email, script, or call note — to check it against the banned claims
              library in real time. Violations appear inline with severity ratings and suggested compliant alternatives.
            </p>
          </div>
          <ComplianceScanner
            onScanComplete={(result) => {
              // In production: log scan result to audit trail via API
              void result;
            }}
          />
        </div>
      )}

      {/* Tab: QA Scorecard */}
      {activeTab === 'scorecard' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              Click column headers to sort. Scores below 75 indicate remediation required.
            </p>
            <div className="flex gap-2">
              {[
                { color: 'bg-green-400', label: '≥90 Excellent' },
                { color: 'bg-yellow-400', label: '75–89 Good' },
                { color: 'bg-orange-400', label: '60–74 At Risk' },
                { color: 'bg-red-400', label: '<60 Critical' },
              ].map((leg) => (
                <div key={leg.label} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${leg.color}`} />
                  <span className="text-xs text-gray-500">{leg.label}</span>
                </div>
              ))}
            </div>
          </div>
          <QAScorecardTable scores={PLACEHOLDER_QA_SCORES} />
        </div>
      )}

      {/* Tab: Risk Trends */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          <RiskTrendChartPlaceholder />
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
              Risk Distribution by Category
            </h3>
            <div className="space-y-3">
              {[
                { category: 'Approval Language',   count: 28, pct: 38, color: '#ef4444' },
                { category: 'Rate & APR Claims',   count: 19, pct: 26, color: '#f97316' },
                { category: 'Pre-Approval Language', count: 12, pct: 16, color: '#eab308' },
                { category: 'Timing Claims',        count: 8,  pct: 11, color: '#C9A84C' },
                { category: 'Risk Disclosures',     count: 7,  pct:  9, color: '#6b7280' },
              ].map((row) => (
                <div key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{row.category}</span>
                    <span className="text-gray-500">{row.count} flags ({row.pct}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
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
