'use client';

// ============================================================
// /training — Training & Certification
// Certification tracks (onboarding / annual / advanced),
// progress bars, completion status, expiry dates.
// Training gaps panel with recommended actions.
// Banned claims library — searchable list with enforcement
// case examples.
// ============================================================

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrackType = 'onboarding' | 'annual' | 'advanced';
type CertStatus = 'complete' | 'in_progress' | 'not_started' | 'expired';

interface Module {
  id: string;
  title: string;
  durationMin: number;
  completed: boolean;
}

interface CertTrack {
  id: string;
  type: TrackType;
  title: string;
  description: string;
  modules: Module[];
  status: CertStatus;
  completedAt?: string;
  expiresAt?: string;
  assignedTo: string[];
}

interface TrainingGap {
  id: string;
  advisorName: string;
  missingTrack: string;
  daysOverdue: number;
  riskLevel: 'critical' | 'high' | 'medium';
  recommendedAction: string;
}

interface BannedClaim {
  id: string;
  claim: string;
  category: string;
  rule: string;
  enforcementCases: EnforcementCase[];
  severity: 'critical' | 'high' | 'medium';
}

interface EnforcementCase {
  authority: string;
  year: number;
  entity: string;
  penalty: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_TRACKS: CertTrack[] = [
  {
    id: 'track_001',
    type: 'onboarding',
    title: 'New Advisor Onboarding',
    description: 'Foundational compliance, UDAP principles, and CapitalForge platform certification. Required within 30 days of hire.',
    modules: [
      { id: 'm_001a', title: 'Introduction to Commercial Lending Compliance', durationMin: 45, completed: true },
      { id: 'm_001b', title: 'UDAP & FTC Guidelines for Financial Products', durationMin: 60, completed: true },
      { id: 'm_001c', title: 'KYB / KYC Procedures', durationMin: 30, completed: true },
      { id: 'm_001d', title: 'Banned Claims & Approved Language', durationMin: 40, completed: true },
      { id: 'm_001e', title: 'Platform Tools & Workflow Certification', durationMin: 25, completed: true },
    ],
    status: 'complete',
    completedAt: '2026-01-15',
    expiresAt: '2027-01-15',
    assignedTo: ['Jordan M.', 'Casey R.', 'Alex T.'],
  },
  {
    id: 'track_002',
    type: 'annual',
    title: 'Annual Compliance Recertification',
    description: 'Mandatory yearly recertification covering regulatory updates, state law changes, and refreshed banned claims library.',
    modules: [
      { id: 'm_002a', title: '2026 Regulatory Updates — SB 1235 & CFDL', durationMin: 50, completed: true },
      { id: 'm_002b', title: 'State Law Changes: CA, NY, TX, FL', durationMin: 40, completed: true },
      { id: 'm_002c', title: 'Banned Claims Library — Annual Refresh', durationMin: 35, completed: false },
      { id: 'm_002d', title: 'TCPA & Consent Management Updates', durationMin: 30, completed: false },
      { id: 'm_002e', title: 'Assessment & Certification Exam', durationMin: 20, completed: false },
    ],
    status: 'in_progress',
    expiresAt: '2026-06-30',
    assignedTo: ['Jordan M.', 'Casey R.', 'Alex T.', 'Morgan P.'],
  },
  {
    id: 'track_003',
    type: 'advanced',
    title: 'Advanced: Commercial Credit Structuring',
    description: 'Deep-dive into complex funding stack compliance, multi-product disclosures, and APR accuracy requirements.',
    modules: [
      { id: 'm_003a', title: 'Multi-Product Funding Stack Compliance', durationMin: 75, completed: false },
      { id: 'm_003b', title: 'APR Calculation & Disclosure Accuracy', durationMin: 60, completed: false },
      { id: 'm_003c', title: 'Suitability Assessment for Commercial Credit', durationMin: 55, completed: false },
      { id: 'm_003d', title: 'Complex Deal Case Studies', durationMin: 90, completed: false },
    ],
    status: 'not_started',
    assignedTo: ['Jordan M.'],
  },
  {
    id: 'track_004',
    type: 'annual',
    title: 'Annual Compliance Recertification — 2025',
    description: 'Prior year annual recertification. Now expired — renewal required.',
    modules: [
      { id: 'm_004a', title: '2025 Regulatory Updates', durationMin: 45, completed: true },
      { id: 'm_004b', title: 'Banned Claims Refresh 2025', durationMin: 30, completed: true },
      { id: 'm_004c', title: 'Assessment & Certification Exam', durationMin: 20, completed: true },
    ],
    status: 'expired',
    completedAt: '2025-04-10',
    expiresAt: '2026-03-01',
    assignedTo: ['Morgan P.'],
  },
];

const PLACEHOLDER_GAPS: TrainingGap[] = [
  {
    id: 'gap_001',
    advisorName: 'Morgan P.',
    missingTrack: 'Annual Compliance Recertification 2026',
    daysOverdue: 31,
    riskLevel: 'critical',
    recommendedAction: 'Suspend client-facing activities until recertification is complete. Immediate enrollment required.',
  },
  {
    id: 'gap_002',
    advisorName: 'Casey R.',
    missingTrack: 'Banned Claims Library — Annual Refresh',
    daysOverdue: 0,
    riskLevel: 'high',
    recommendedAction: 'Assign module within 5 business days. Block script submission access until module is complete.',
  },
  {
    id: 'gap_003',
    advisorName: 'Alex T.',
    missingTrack: 'TCPA & Consent Management Updates',
    daysOverdue: 0,
    riskLevel: 'medium',
    recommendedAction: 'Schedule before next outbound campaign. Review consent logs for recent activity.',
  },
];

const PLACEHOLDER_BANNED_CLAIMS: BannedClaim[] = [
  {
    id: 'bc_001',
    claim: 'Guaranteed approval / guaranteed funding',
    category: 'Approval Language',
    rule: 'UDAP §5 — FTC Act',
    severity: 'critical',
    enforcementCases: [
      { authority: 'CFPB', year: 2023, entity: 'Fast Capital LLC', penalty: '$1.2M', summary: 'Consent order for advertising "guaranteed funding in 24 hours" without substantiation.' },
      { authority: 'FTC', year: 2022, entity: 'EasyFund Partners', penalty: '$870K', summary: 'Civil penalty for deceptive guarantee claims targeting small business borrowers.' },
    ],
  },
  {
    id: 'bc_002',
    claim: '0% APR / Zero interest offers without full disclosure',
    category: 'Rate & APR Claims',
    rule: 'Reg Z / SB 1235 (CA)',
    severity: 'critical',
    enforcementCases: [
      { authority: 'CFPB', year: 2024, entity: 'NovaBridge Capital', penalty: '$2.1M', summary: 'Advertised 0% APR without disclosing revert rate or qualifying conditions. Consent order issued.' },
    ],
  },
  {
    id: 'bc_003',
    claim: 'No credit check / No hard pull',
    category: 'Credit Inquiry Claims',
    rule: 'FCRA §604',
    severity: 'high',
    enforcementCases: [
      { authority: 'CFPB', year: 2023, entity: 'QuickStack Pro', penalty: '$450K', summary: '"No credit check required" used when hard pulls were being performed. FCRA violation.' },
    ],
  },
  {
    id: 'bc_004',
    claim: 'Lowest rates in the market / Best rates guaranteed',
    category: 'Superlative Claims',
    rule: 'FTC Advertising Guides',
    severity: 'high',
    enforcementCases: [
      { authority: 'FTC', year: 2021, entity: 'PrimeRate Connect', penalty: '$330K', summary: 'Unsubstantiated "lowest rates" claim in digital advertising. Warning and fine issued.' },
    ],
  },
  {
    id: 'bc_005',
    claim: 'Pre-approved — you have been selected',
    category: 'Pre-Approval Language',
    rule: 'FCRA §615 — Firm Offer of Credit',
    severity: 'high',
    enforcementCases: [
      { authority: 'CFPB', year: 2022, entity: 'DirectFund Advisors', penalty: '$780K', summary: 'Mass-mailed "pre-approved" offers without a firm offer of credit. FCRA enforcement action.' },
    ],
  },
  {
    id: 'bc_006',
    claim: 'Instant approval / Instant cash',
    category: 'Timing Representations',
    rule: 'UDAP — Materially Misleading Representations',
    severity: 'medium',
    enforcementCases: [
      { authority: 'NY AG', year: 2023, entity: 'SpeedFund Corp.', penalty: '$190K', summary: 'Settlement for "instant approval" claims when average review took 2–3 business days.' },
    ],
  },
  {
    id: 'bc_007',
    claim: 'Risk-free investment / No-risk funding',
    category: 'Risk Disclosures',
    rule: 'UDAP / SEC Advertising Rules',
    severity: 'medium',
    enforcementCases: [
      { authority: 'FTC', year: 2020, entity: 'SafeCapital Group', penalty: '$210K', summary: '"Risk-free" used to describe MCA products. Corrective advertising required.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso?: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const TRACK_TYPE_CONFIG: Record<TrackType, { label: string; color: string }> = {
  onboarding: { label: 'Onboarding',  color: 'bg-blue-900 text-blue-300 border-blue-700' },
  annual:     { label: 'Annual',      color: 'bg-purple-900 text-purple-300 border-purple-700' },
  advanced:   { label: 'Advanced',    color: 'bg-amber-900 text-amber-300 border-amber-700' },
};

const STATUS_CONFIG: Record<CertStatus, { label: string; badge: string; dot: string }> = {
  complete:    { label: 'Complete',     badge: 'bg-green-900 text-green-300 border-green-700',   dot: 'bg-green-400' },
  in_progress: { label: 'In Progress',  badge: 'bg-blue-900 text-blue-300 border-blue-700',      dot: 'bg-blue-400' },
  not_started: { label: 'Not Started',  badge: 'bg-gray-800 text-gray-400 border-gray-600',      dot: 'bg-gray-500' },
  expired:     { label: 'Expired',      badge: 'bg-red-900 text-red-300 border-red-700',          dot: 'bg-red-400' },
};

const GAP_RISK_CONFIG = {
  critical: { badge: 'bg-red-900 text-red-300 border-red-700',        bg: 'bg-red-950/40 border-red-800' },
  high:     { badge: 'bg-orange-900 text-orange-300 border-orange-700', bg: 'bg-orange-950/40 border-orange-800' },
  medium:   { badge: 'bg-yellow-900 text-yellow-300 border-yellow-700', bg: 'bg-yellow-950/40 border-yellow-800' },
};

const CLAIM_SEV_CONFIG = {
  critical: { badge: 'bg-red-900 text-red-300 border-red-700' },
  high:     { badge: 'bg-orange-900 text-orange-300 border-orange-700' },
  medium:   { badge: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ pct, color = '#C9A84C' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function TrackCard({ track }: { track: CertTrack }) {
  const [expanded, setExpanded] = useState(false);
  const completed = track.modules.filter((m) => m.completed).length;
  const total = track.modules.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const status = STATUS_CONFIG[track.status];
  const typeTag = TRACK_TYPE_CONFIG[track.type];
  const expiryDays = daysUntil(track.expiresAt);
  const expiryWarning = expiryDays !== null && expiryDays <= 30 && expiryDays >= 0;
  const barColor = track.status === 'complete' ? '#22c55e' : track.status === 'expired' ? '#ef4444' : '#C9A84C';

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      {/* Header */}
      <button
        className="w-full text-left px-5 py-4"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${typeTag.color}`}>{typeTag.label}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${status.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
            <h3 className="font-semibold text-gray-100 text-sm">{track.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{track.description}</p>
          </div>
          <span className="text-gray-500 text-sm flex-shrink-0 mt-1">{expanded ? '▲' : '▼'}</span>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{completed} / {total} modules</span>
            <span className="text-xs font-bold" style={{ color: barColor }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={barColor} />
        </div>

        {/* Dates */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
          {track.completedAt && <span>Completed {formatDate(track.completedAt)}</span>}
          {track.expiresAt && (
            <span className={expiryWarning ? 'text-yellow-400 font-semibold' : ''}>
              Expires {formatDate(track.expiresAt)}
              {expiryWarning && ` · ${expiryDays}d`}
              {expiryDays !== null && expiryDays < 0 && (
                <span className="text-red-400 font-semibold"> · Expired</span>
              )}
            </span>
          )}
          <span className="text-gray-600">Assigned: {track.assignedTo.join(', ')}</span>
        </div>
      </button>

      {/* Module list */}
      {expanded && (
        <div className="border-t border-gray-800 px-5 py-3 space-y-2">
          {track.modules.map((mod) => (
            <div key={mod.id} className="flex items-center gap-3">
              <span className={`flex-shrink-0 h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                mod.completed
                  ? 'border-green-600 bg-green-900/60 text-green-400'
                  : 'border-gray-700 bg-gray-800 text-gray-600'
              }`}>
                {mod.completed ? '✓' : '○'}
              </span>
              <span className={`flex-1 text-sm ${mod.completed ? 'text-gray-400' : 'text-gray-200'}`}>
                {mod.title}
              </span>
              <span className="text-xs text-gray-600 flex-shrink-0">{mod.durationMin}m</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GapsPanel({ gaps }: { gaps: TrainingGap[] }) {
  if (gaps.length === 0) {
    return (
      <div className="rounded-xl border border-green-800 bg-green-950/30 p-5">
        <p className="text-sm font-semibold text-green-400">No training gaps detected</p>
        <p className="text-xs text-green-600 mt-1">All advisors are current on required certifications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gaps.map((gap) => {
        const cfg = GAP_RISK_CONFIG[gap.riskLevel];
        return (
          <div key={gap.id} className={`rounded-xl border p-4 ${cfg.bg}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-100 text-sm">{gap.advisorName}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${cfg.badge}`}>
                  {gap.riskLevel.charAt(0).toUpperCase() + gap.riskLevel.slice(1)}
                </span>
              </div>
              {gap.daysOverdue > 0 && (
                <span className="text-xs text-red-400 font-semibold flex-shrink-0">
                  {gap.daysOverdue}d overdue
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Missing: <span className="text-gray-200 font-medium">{gap.missingTrack}</span>
            </p>
            <div className="flex items-start gap-2">
              <span className="text-xs text-brand-gold flex-shrink-0 mt-0.5">→</span>
              <p className="text-xs text-gray-300">{gap.recommendedAction}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BannedClaimsLibrary({ claims }: { claims: BannedClaim[] }) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return claims;
    return claims.filter(
      (c) =>
        c.claim.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.rule.toLowerCase().includes(q) ||
        c.enforcementCases.some((e) => e.summary.toLowerCase().includes(q) || e.entity.toLowerCase().includes(q)),
    );
  }, [claims, query]);

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search banned claims, rules, enforcement cases…"
          className="w-full rounded-xl border border-gray-700 bg-gray-900 text-gray-100 text-sm
                     placeholder:text-gray-600 pl-9 pr-4 py-2.5 focus:outline-none
                     focus:border-brand-gold/60 transition-colors"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">⌕</span>
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-3">{filtered.length} of {claims.length} entries</p>

      <div className="space-y-2">
        {filtered.map((claim) => {
          const sev = CLAIM_SEV_CONFIG[claim.severity];
          const isOpen = expandedId === claim.id;

          return (
            <div key={claim.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <button
                className="w-full text-left px-4 py-3"
                onClick={() => setExpandedId(isOpen ? null : claim.id)}
                aria-expanded={isOpen}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${sev.badge}`}>
                        {claim.severity.charAt(0).toUpperCase() + claim.severity.slice(1)}
                      </span>
                      <span className="text-xs text-gray-500 border border-gray-700 bg-gray-800 px-1.5 py-0.5 rounded">
                        {claim.category}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-100">{claim.claim}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{claim.rule}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      {claim.enforcementCases.length} case{claim.enforcementCases.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 px-4 py-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Enforcement Cases
                  </p>
                  {claim.enforcementCases.map((ec, i) => (
                    <div key={i} className="bg-gray-800/60 rounded-lg border border-gray-700 p-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                        <span className="text-xs font-bold text-brand-gold">{ec.authority}</span>
                        <span className="text-xs text-gray-400">{ec.year}</span>
                        <span className="text-xs font-semibold text-gray-300">{ec.entity}</span>
                        <span className="text-xs font-bold text-red-400">{ec.penalty}</span>
                      </div>
                      <p className="text-xs text-gray-400">{ec.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-sm text-gray-500">No claims match &ldquo;{query}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = 'tracks' | 'gaps' | 'library';

export default function TrainingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [trackFilter, setTrackFilter] = useState<TrackType | 'all'>('all');

  const filteredTracks = useMemo(() => {
    if (trackFilter === 'all') return PLACEHOLDER_TRACKS;
    return PLACEHOLDER_TRACKS.filter((t) => t.type === trackFilter);
  }, [trackFilter]);

  const totalModules = PLACEHOLDER_TRACKS.reduce((a, t) => a + t.modules.length, 0);
  const completedModules = PLACEHOLDER_TRACKS.reduce((a, t) => a + t.modules.filter((m) => m.completed).length, 0);
  const expiredCount = PLACEHOLDER_TRACKS.filter((t) => t.status === 'expired').length;
  const gapsCritical = PLACEHOLDER_GAPS.filter((g) => g.riskLevel === 'critical').length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Training &amp; Certification</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {PLACEHOLDER_TRACKS.length} tracks · {completedModules}/{totalModules} modules complete
            {gapsCritical > 0 && (
              <span className="ml-2 text-red-400 font-semibold">⚠ {gapsCritical} critical gap{gapsCritical !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-brand-gold text-brand-navy text-sm font-bold hover:opacity-90 transition-opacity">
          Assign Training
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Tracks',          value: PLACEHOLDER_TRACKS.length,  color: 'text-gray-100' },
          { label: 'Modules Done',    value: `${completedModules}/${totalModules}`, color: 'text-green-400' },
          { label: 'Expired Certs',   value: expiredCount,               color: expiredCount > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Training Gaps',   value: PLACEHOLDER_GAPS.length,    color: PLACEHOLDER_GAPS.length > 0 ? 'text-yellow-400' : 'text-gray-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800">
        {([
          { key: 'tracks',  label: 'Certification Tracks' },
          { key: 'gaps',    label: `Training Gaps${PLACEHOLDER_GAPS.length > 0 ? ` (${PLACEHOLDER_GAPS.length})` : ''}` },
          { key: 'library', label: 'Banned Claims Library' },
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

      {/* Tab: Certification Tracks */}
      {activeTab === 'tracks' && (
        <div>
          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {(['all', 'onboarding', 'annual', 'advanced'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTrackFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  trackFilter === f
                    ? 'bg-brand-navy-700 border-brand-gold text-brand-gold'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {f === 'all' ? 'All Tracks' : TRACK_TYPE_CONFIG[f].label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredTracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))}
          </div>
        </div>
      )}

      {/* Tab: Training Gaps */}
      {activeTab === 'gaps' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              {PLACEHOLDER_GAPS.length} gap{PLACEHOLDER_GAPS.length !== 1 ? 's' : ''} identified across {new Set(PLACEHOLDER_GAPS.map((g) => g.advisorName)).size} advisor{new Set(PLACEHOLDER_GAPS.map((g) => g.advisorName)).size !== 1 ? 's' : ''}
            </p>
          </div>
          <GapsPanel gaps={PLACEHOLDER_GAPS} />
        </div>
      )}

      {/* Tab: Banned Claims Library */}
      {activeTab === 'library' && (
        <div>
          <div className="mb-4">
            <p className="text-sm text-gray-400">
              {PLACEHOLDER_BANNED_CLAIMS.length} banned claims with enforcement case history.
              Click any entry to expand enforcement details.
            </p>
          </div>
          <BannedClaimsLibrary claims={PLACEHOLDER_BANNED_CLAIMS} />
        </div>
      )}
    </div>
  );
}
