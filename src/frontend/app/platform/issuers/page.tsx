'use client';

// ============================================================
// /platform/issuers — Issuer Directory & Intelligence
// Issuer table grouped by type (banks vs credit unions),
// filter toggle, CU summary stats, expandable detail rows
// with credit union membership metadata.
//
// Features:
// 3A — Enhanced expand: velocity rules list, approval criteria
//      breakdown, decline reasons with %, action buttons
// 3B — DNA Flag detail panel (US Bank): reason, flagged date,
//      decline count, approval window, removal criteria, recommendation
// 3C — Inline SVG sparklines next to approval rate badges
//      (green=up, red=down, gray=flat trend)
// ============================================================

import { useState, useEffect, useMemo } from 'react';

// ── Types ────────────────────────────────────────────────────

interface CuMeta {
  membershipRequirement: string;
  membershipType: 'Open' | 'Restricted';
  joinFee: number;
  bureauPull: string;
}

interface VelocityRule {
  name: string;
  value: string;
  note: string;
}

interface EditableRule {
  id: string;
  name: string;
  value: string;
  severity: 'hard' | 'soft';
  active: boolean;
}

interface ApprovalCriteriaDetail {
  minFICO: number;
  minYears: number;
  minRevenue: number;
}

interface DeclineReason {
  reason: string;
  pct: number;
}

interface DnaDetail {
  reason: string;
  flaggedDate: string;
  declineCount: number;
  approvalRateInWindow: number;
  removalCriteria: string[];
  daysUntilAutoReview: number;
  recommendation: string;
}

interface Issuer {
  id: string;
  name: string;
  logo: string;
  issuerType: 'bank' | 'credit_union';
  velocityRules: string;
  velocityRulesList: VelocityRule[];
  approvalCriteria: string;
  approvalCriteriaDetail: ApprovalCriteriaDetail;
  declineReasons: DeclineReason[];
  totalApps: number;
  approved: number;
  declined: number;
  pending: number;
  approvalRate: number;
  approvalTrend: number[];
  avgCreditLimit: number;
  doNotApply: boolean;
  doNotApplyReason: string | null;
  dnaDetail: DnaDetail | null;
  cuMeta: CuMeta | null;
}

type FilterMode = 'all' | 'banks' | 'credit_unions';

// ── Fallback data when API is unavailable ────────────────────
const FALLBACK_ISSUERS: Issuer[] = [
  {
    id: 'iss_001', name: 'Chase', logo: '🏦', issuerType: 'bank',
    velocityRules: '2/30, 5/24 rule',
    velocityRulesList: [
      { name: '2/30', value: 'Max 2 apps per 30 days', note: 'Hard enforcement' },
      { name: '5/24', value: 'Max 5 new cards in 24 months', note: 'Includes all issuers' },
    ],
    approvalCriteria: 'Min 700 FICO, 1yr+ business',
    approvalCriteriaDetail: { minFICO: 700, minYears: 1, minRevenue: 50000 },
    declineReasons: [
      { reason: 'Too many recent accounts', pct: 38 },
      { reason: 'Insufficient credit history', pct: 24 },
      { reason: 'High utilization', pct: 20 },
      { reason: 'Low revenue', pct: 18 },
    ],
    totalApps: 342, approved: 253, declined: 72, pending: 17,
    approvalRate: 74.0, approvalTrend: [68, 70, 71, 73, 72, 74],
    avgCreditLimit: 28500, doNotApply: false, doNotApplyReason: null, dnaDetail: null, cuMeta: null,
  },
  {
    id: 'iss_002', name: 'Amex', logo: '💳', issuerType: 'bank',
    velocityRules: '1/5 rule, 2/90 for charge cards',
    velocityRulesList: [
      { name: '1/5', value: 'Max 1 credit card per 5 days', note: 'Soft limit' },
      { name: '2/90', value: 'Max 2 charge cards per 90 days', note: 'Charge cards only' },
    ],
    approvalCriteria: 'Min 680 FICO, $25k+ revenue',
    approvalCriteriaDetail: { minFICO: 680, minYears: 2, minRevenue: 25000 },
    declineReasons: [
      { reason: 'Previous Amex default', pct: 32 },
      { reason: 'Too many inquiries', pct: 28 },
      { reason: 'Low stated revenue', pct: 22 },
      { reason: 'Short credit history', pct: 18 },
    ],
    totalApps: 298, approved: 212, declined: 68, pending: 18,
    approvalRate: 71.1, approvalTrend: [65, 67, 69, 70, 71, 71],
    avgCreditLimit: 35000, doNotApply: false, doNotApplyReason: null, dnaDetail: null, cuMeta: null,
  },
  {
    id: 'iss_003', name: 'Capital One', logo: '🏛️', issuerType: 'bank',
    velocityRules: '1/6mo, inquiry-sensitive',
    velocityRulesList: [
      { name: '1/6mo', value: 'Max 1 app per 6 months', note: 'Business cards' },
      { name: 'Inquiry sensitive', value: '< 3 inquiries in 6 months', note: 'All bureaus checked' },
    ],
    approvalCriteria: 'Min 660 FICO, $15k+ revenue',
    approvalCriteriaDetail: { minFICO: 660, minYears: 1, minRevenue: 15000 },
    declineReasons: [
      { reason: 'Too many inquiries', pct: 35 },
      { reason: 'Thin business file', pct: 25 },
      { reason: 'High existing debt', pct: 22 },
      { reason: 'Recent derogatory marks', pct: 18 },
    ],
    totalApps: 264, approved: 180, declined: 72, pending: 12,
    approvalRate: 68.2, approvalTrend: [64, 65, 66, 67, 68, 68],
    avgCreditLimit: 22000, doNotApply: false, doNotApplyReason: null, dnaDetail: null, cuMeta: null,
  },
  {
    id: 'iss_004', name: 'Citi', logo: '🏢', issuerType: 'bank',
    velocityRules: '1/8 rule, 2/65',
    velocityRulesList: [
      { name: '1/8', value: 'Max 1 Citi card per 8 days', note: 'Hard enforcement' },
      { name: '2/65', value: 'Max 2 Citi cards per 65 days', note: 'Applies to all Citi products' },
    ],
    approvalCriteria: 'Min 700 FICO, 5yr+ credit',
    approvalCriteriaDetail: { minFICO: 700, minYears: 5, minRevenue: 30000 },
    declineReasons: [
      { reason: 'Recent Citi applications', pct: 30 },
      { reason: 'Insufficient credit age', pct: 28 },
      { reason: 'High revolving balance', pct: 24 },
      { reason: 'Too many new accounts', pct: 18 },
    ],
    totalApps: 218, approved: 131, declined: 74, pending: 13,
    approvalRate: 60.1, approvalTrend: [62, 61, 60, 59, 60, 60],
    avgCreditLimit: 26000, doNotApply: false, doNotApplyReason: null, dnaDetail: null, cuMeta: null,
  },
  {
    id: 'iss_005', name: 'Bank of America', logo: '🏦', issuerType: 'bank',
    velocityRules: '2/3/4 rule',
    velocityRulesList: [
      { name: '2/3/4', value: '2 cards/30d, 3/12mo, 4/24mo', note: 'Combined personal + business' },
    ],
    approvalCriteria: 'Min 700 FICO, existing BofA preferred',
    approvalCriteriaDetail: { minFICO: 700, minYears: 2, minRevenue: 25000 },
    declineReasons: [
      { reason: 'No existing BofA relationship', pct: 34 },
      { reason: 'Too many recent cards', pct: 26 },
      { reason: 'Low deposit balance', pct: 22 },
      { reason: 'Insufficient revenue', pct: 18 },
    ],
    totalApps: 186, approved: 121, declined: 54, pending: 11,
    approvalRate: 65.1, approvalTrend: [63, 64, 64, 65, 65, 65],
    avgCreditLimit: 24000, doNotApply: false, doNotApplyReason: null, dnaDetail: null, cuMeta: null,
  },
  {
    id: 'iss_006', name: 'US Bank', logo: '🏛️', issuerType: 'bank',
    velocityRules: '0/6 for business cards',
    velocityRulesList: [
      { name: '0/6', value: '0 new biz cards in 6 months', note: 'Very strict — must wait 6mo between apps' },
      { name: '0/12 (biz checking)', value: 'New biz checking required', note: 'Must open 30+ days prior' },
    ],
    approvalCriteria: 'Min 720 FICO, existing relationship',
    approvalCriteriaDetail: { minFICO: 720, minYears: 3, minRevenue: 40000 },
    declineReasons: [
      { reason: 'No US Bank relationship', pct: 40 },
      { reason: 'Recent business card apps', pct: 25 },
      { reason: 'Low FICO score', pct: 20 },
      { reason: 'Thin business credit', pct: 15 },
    ],
    totalApps: 142, approved: 77, declined: 56, pending: 9,
    approvalRate: 54.2, approvalTrend: [61, 59, 57, 56, 55, 54],
    avgCreditLimit: 20000, doNotApply: true, doNotApplyReason: 'Policy change under review',
    dnaDetail: {
      reason: 'Internal policy review — new business card underwriting criteria effective Q1 2026. Approval rates dropped below threshold triggering automatic DNA flag.',
      flaggedDate: '2026-02-15',
      declineCount: 56,
      approvalRateInWindow: 42.1,
      removalCriteria: [
        'Approval rate recovers above 55% for 30 consecutive days',
        'US Bank confirms new underwriting policy is finalized',
        'Manual override by admin after issuer relationship review',
      ],
      daysUntilAutoReview: 18,
      recommendation: 'Hold all US Bank business card applications until auto-review completes on May 3, 2026. Redirect applicants to personal card products or alternative issuers with similar velocity profiles.',
    },
    cuMeta: null,
  },
  {
    id: 'iss_007', name: 'Wells Fargo', logo: '🏦', issuerType: 'bank',
    velocityRules: '1/12 for business cards',
    velocityRulesList: [
      { name: '1/12', value: 'Max 1 business card per 12 months', note: 'Very conservative' },
    ],
    approvalCriteria: 'Min 680 FICO, WF checking required',
    approvalCriteriaDetail: { minFICO: 680, minYears: 2, minRevenue: 20000 },
    declineReasons: [
      { reason: 'No WF checking account', pct: 36 },
      { reason: 'Recent business app', pct: 28 },
      { reason: 'High utilization', pct: 20 },
      { reason: 'Low stated revenue', pct: 16 },
    ],
    totalApps: 158, approved: 95, declined: 52, pending: 11,
    approvalRate: 60.1, approvalTrend: [58, 59, 59, 60, 60, 60],
    avgCreditLimit: 18000, doNotApply: false, doNotApplyReason: null, dnaDetail: null, cuMeta: null,
  },
  {
    id: 'iss_008', name: 'Navy Federal CU', logo: '⚓', issuerType: 'credit_union',
    velocityRules: 'No 5/24 equivalent',
    velocityRulesList: [
      { name: 'No velocity cap', value: 'No hard limit on applications', note: 'Inquiry-based review only' },
    ],
    approvalCriteria: 'Military/DoD affiliation required',
    approvalCriteriaDetail: { minFICO: 650, minYears: 1, minRevenue: 0 },
    declineReasons: [
      { reason: 'Non-eligible membership', pct: 45 },
      { reason: 'Recent delinquency', pct: 30 },
      { reason: 'High DTI ratio', pct: 25 },
    ],
    totalApps: 87, approved: 72, declined: 10, pending: 5,
    approvalRate: 82.8, approvalTrend: [78, 79, 80, 81, 82, 83],
    avgCreditLimit: 32000, doNotApply: false, doNotApplyReason: null, dnaDetail: null,
    cuMeta: { membershipRequirement: 'Military affiliation', membershipType: 'Restricted', joinFee: 0, bureauPull: 'TransUnion' },
  },
  {
    id: 'iss_009', name: 'Alliant CU', logo: '🏦', issuerType: 'credit_union',
    velocityRules: 'No strict velocity rules',
    velocityRulesList: [
      { name: 'No hard cap', value: 'Discretionary review', note: 'Based on overall profile' },
    ],
    approvalCriteria: 'Open membership ($5 donation)',
    approvalCriteriaDetail: { minFICO: 640, minYears: 1, minRevenue: 0 },
    declineReasons: [
      { reason: 'Low FICO score', pct: 40 },
      { reason: 'High existing debt', pct: 35 },
      { reason: 'Recent bankruptcy', pct: 25 },
    ],
    totalApps: 54, approved: 41, declined: 9, pending: 4,
    approvalRate: 75.9, approvalTrend: [72, 73, 74, 75, 75, 76],
    avgCreditLimit: 25000, doNotApply: false, doNotApplyReason: null, dnaDetail: null,
    cuMeta: { membershipRequirement: '$5 Foster Care donation', membershipType: 'Open', joinFee: 5, bureauPull: 'TransUnion' },
  },
  {
    id: 'iss_010', name: 'PenFed CU', logo: '🛡️', issuerType: 'credit_union',
    velocityRules: 'No velocity rules',
    velocityRulesList: [
      { name: 'No restrictions', value: 'Apply any time', note: 'No velocity enforcement' },
    ],
    approvalCriteria: 'Open to anyone ($5 savings)',
    approvalCriteriaDetail: { minFICO: 660, minYears: 1, minRevenue: 0 },
    declineReasons: [
      { reason: 'Insufficient credit history', pct: 38 },
      { reason: 'High utilization', pct: 32 },
      { reason: 'Too many inquiries', pct: 30 },
    ],
    totalApps: 43, approved: 31, declined: 8, pending: 4,
    approvalRate: 72.1, approvalTrend: [70, 71, 71, 72, 72, 72],
    avgCreditLimit: 22000, doNotApply: false, doNotApplyReason: null, dnaDetail: null,
    cuMeta: { membershipRequirement: '$5 savings account', membershipType: 'Open', joinFee: 5, bureauPull: 'Equifax + TransUnion' },
  },
];

// ── Formatting helpers ───────────────────────────────────────

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ── Approval Rate Badge ──────────────────────────────────────

function ApprovalBadge({ rate }: { rate: number }) {
  const color = rate >= 70 ? 'text-emerald-400 bg-emerald-900/40' : rate >= 60 ? 'text-yellow-400 bg-yellow-900/40' : 'text-red-400 bg-red-900/40';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {rate.toFixed(1)}%
    </span>
  );
}

// ── Approval Rate Sparkline (3C) ────────────────────────────

function ApprovalSparkline({ trend }: { trend: number[] }) {
  if (!trend || trend.length < 2) return null;

  const w = 64;
  const h = 20;
  const padding = 2;

  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const range = max - min || 1;

  const points = trend.map((v, i) => {
    const x = padding + (i / (trend.length - 1)) * (w - padding * 2);
    const y = h - padding - ((v - min) / range) * (h - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Determine trend direction: compare average of last 2 vs first 2
  const earlyAvg = (trend[0] + trend[1]) / 2;
  const lateAvg = (trend[trend.length - 2] + trend[trend.length - 1]) / 2;
  const diff = lateAvg - earlyAvg;
  const color = diff > 1 ? '#34d399' : diff < -1 ? '#f87171' : '#9ca3af'; // green / red / gray

  return (
    <svg width={w} height={h} className="inline-block align-middle ml-2" aria-label="Approval rate trend">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {(() => {
        const lastX = padding + ((trend.length - 1) / (trend.length - 1)) * (w - padding * 2);
        const lastY = h - padding - ((trend[trend.length - 1] - min) / range) * (h - padding * 2);
        return <circle cx={lastX} cy={lastY} r="2" fill={color} />;
      })()}
    </svg>
  );
}

// ── DNA Flag Detail Panel (3B) ──────────────────────────────

function DnaFlagDetail({ detail }: { detail: DnaDetail }) {
  return (
    <div className="mt-4 rounded-lg border border-red-700/50 bg-red-950/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/60 text-red-300 uppercase">DNA Flag Active</span>
        <span className="text-xs text-gray-500">Flagged {detail.flaggedDate}</span>
      </div>

      <div>
        <h4 className="text-xs text-red-400 uppercase tracking-wider mb-1 font-semibold">Reason</h4>
        <p className="text-sm text-gray-300">{detail.reason}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 p-3">
          <p className="text-[10px] text-gray-500 uppercase">Flagged Date</p>
          <p className="text-sm font-semibold text-gray-200 mt-0.5">{detail.flaggedDate}</p>
        </div>
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 p-3">
          <p className="text-[10px] text-gray-500 uppercase">Decline Count</p>
          <p className="text-sm font-semibold text-red-400 mt-0.5">{detail.declineCount}</p>
        </div>
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 p-3">
          <p className="text-[10px] text-gray-500 uppercase">Approval Rate (Window)</p>
          <p className="text-sm font-semibold text-red-400 mt-0.5">{detail.approvalRateInWindow}%</p>
        </div>
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 p-3">
          <p className="text-[10px] text-gray-500 uppercase">Days Until Auto-Review</p>
          <p className="text-sm font-semibold text-[#C9A84C] mt-0.5">{detail.daysUntilAutoReview} days</p>
        </div>
      </div>

      <div>
        <h4 className="text-xs text-red-400 uppercase tracking-wider mb-2 font-semibold">Removal Criteria</h4>
        <ol className="space-y-1.5">
          {detail.removalCriteria.map((crit, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-[10px] text-gray-400 font-bold mt-0.5">
                {i + 1}
              </span>
              {crit}
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30 p-3">
        <h4 className="text-xs text-[#C9A84C] uppercase tracking-wider mb-1 font-semibold">Recommendation</h4>
        <p className="text-sm text-gray-300">{detail.recommendation}</p>
      </div>
    </div>
  );
}

// ── Credit Union Expanded Detail ─────────────────────────────

function CuExpandedDetail({ cuMeta }: { cuMeta: CuMeta }) {
  return (
    <div className="mt-4 rounded-lg border border-teal-700/40 bg-teal-900/10 p-4 space-y-3">
      <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider">Credit Union Membership Details</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-xs text-gray-500 uppercase">Membership Requirement</span>
          <p className="text-gray-300 mt-0.5">{cuMeta.membershipRequirement}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Membership Type</span>
          <p className="mt-0.5">
            {cuMeta.membershipType === 'Open' ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/40 text-emerald-400">
                Open — anyone can join
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-900/40 text-amber-400">
                Restricted — specific eligibility required
              </span>
            )}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Join Fee</span>
          <p className="text-gray-300 mt-0.5">
            {cuMeta.joinFee === 0 ? (
              <span className="text-emerald-400 font-medium">Free</span>
            ) : (
              <span className="text-gray-200 font-medium">{money(cuMeta.joinFee)}</span>
            )}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Bureau Pull</span>
          <p className="text-gray-300 mt-0.5 font-medium">{cuMeta.bureauPull}</p>
        </div>
      </div>
      <div className="pt-2 border-t border-teal-800/30">
        <p className="text-xs text-teal-400/80">
          <span className="font-semibold">Velocity Impact: Low</span> — does not affect Chase 5/24 or Amex rules
        </p>
      </div>
    </div>
  );
}

// ── Edit Rules Modal ────────────────────────────────────────

function buildInitialRules(issuer: Issuer): EditableRule[] {
  return issuer.velocityRulesList.map((r, i) => ({
    id: `rule_${i}_${Date.now()}`,
    name: r.name,
    value: r.value,
    severity: r.note.toLowerCase().includes('hard') ? 'hard' as const : 'soft' as const,
    active: true,
  }));
}

function EditRulesModal({ issuer, onClose }: { issuer: Issuer; onClose: () => void }) {
  const [rules, setRules] = useState<EditableRule[]>(() => buildInitialRules(issuer));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const updateRule = (id: string, field: keyof EditableRule, val: string | boolean) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const addRule = () => {
    setRules(prev => [...prev, {
      id: `rule_new_${Date.now()}`,
      name: '',
      value: '',
      severity: 'soft',
      active: true,
    }]);
  };

  const deleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    setDeleteConfirm(null);
  };

  const handleSave = async () => {
    setSaving(true);
    // Mock POST
    await new Promise(res => setTimeout(res, 600));
    setSaving(false);
    setToast(`Rules updated for ${issuer.name}`);
    setTimeout(() => {
      setToast(null);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-gray-700/60 bg-[#0F1D32] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast */}
        {toast && (
          <div className="absolute top-4 right-4 z-10 px-4 py-2 rounded-lg bg-emerald-900/60 border border-emerald-700/50 text-emerald-400 text-sm font-medium animate-pulse">
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Edit Rules — {issuer.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage velocity and approval rules for this issuer</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition text-xl leading-none">&times;</button>
        </div>

        {/* Rules List */}
        <div className="px-6 py-4 space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No rules defined. Click &quot;+ Add Rule&quot; to create one.</p>
          )}
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg bg-gray-800/50 border border-gray-700/40 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Rule Name</label>
                  <input
                    type="text"
                    value={rule.name}
                    onChange={(e) => updateRule(rule.id, 'name', e.target.value)}
                    placeholder="e.g. 5/24"
                    className="w-full rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 px-3 py-2 placeholder:text-gray-600 focus:outline-none focus:border-[#C9A84C]/60"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Value / Description</label>
                  <input
                    type="text"
                    value={rule.value}
                    onChange={(e) => updateRule(rule.id, 'value', e.target.value)}
                    placeholder="e.g. Max 5 new cards in 24 months"
                    className="w-full rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 px-3 py-2 placeholder:text-gray-600 focus:outline-none focus:border-[#C9A84C]/60"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  {/* Severity Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 uppercase">Severity:</span>
                    <button
                      onClick={() => updateRule(rule.id, 'severity', rule.severity === 'hard' ? 'soft' : 'hard')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        rule.severity === 'hard'
                          ? 'bg-red-900/40 text-red-400 border border-red-700/50'
                          : 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/50'
                      }`}
                    >
                      {rule.severity === 'hard' ? 'Hard' : 'Soft'}
                    </button>
                  </div>
                  {/* Active Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 uppercase">Active:</span>
                    <button
                      onClick={() => updateRule(rule.id, 'active', !rule.active)}
                      className={`relative w-10 h-5 rounded-full transition ${
                        rule.active ? 'bg-emerald-600' : 'bg-gray-700'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        rule.active ? 'left-[22px]' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
                {/* Delete */}
                {deleteConfirm === rule.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400">Delete this rule?</span>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="px-2 py-1 rounded text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700/50 hover:bg-red-900/80 transition"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 rounded text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(rule.id)}
                    className="text-xs text-red-400/60 hover:text-red-400 transition"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={addRule}
            className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-700 transition"
          >
            + Add Rule
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#C9A84C] text-sm font-semibold hover:bg-[#C9A84C]/30 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Expandable Issuer Row ────────────────────────────────────

function IssuerRow({ issuer }: { issuer: Issuer }) {
  const [expanded, setExpanded] = useState(false);
  const [showEditRules, setShowEditRules] = useState(false);

  return (
    <>
      <tr
        className="border-t border-gray-800 hover:bg-gray-800/40 transition cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">{issuer.logo}</span>
            <div>
              <span className="text-gray-200 font-medium">{issuer.name}</span>
              {issuer.doNotApply && (
                <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/60 text-red-300 uppercase">
                  DNA
                </span>
              )}
              {issuer.issuerType === 'credit_union' && issuer.cuMeta?.membershipType === 'Open' && (
                <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-teal-900/60 text-teal-300 uppercase">
                  Open Membership
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <ApprovalBadge rate={issuer.approvalRate} />
          <ApprovalSparkline trend={issuer.approvalTrend} />
        </td>
        <td className="px-4 py-3 text-right text-gray-400">{issuer.totalApps}</td>
        <td className="px-4 py-3 text-right text-emerald-400">{issuer.approved}</td>
        <td className="px-4 py-3 text-right text-red-400">{issuer.declined}</td>
        <td className="px-4 py-3 text-right text-gray-300">{money(issuer.avgCreditLimit)}</td>
        <td className="px-4 py-3 text-center">
          <span className={`text-gray-500 transition-transform inline-block ${expanded ? 'rotate-180' : ''}`}>
            &#9662;
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-900/40">
          <td colSpan={7} className="px-6 py-4 space-y-4">
            {/* Velocity Rules List (3A) */}
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">Velocity Rules</h4>
              {issuer.velocityRulesList.length > 0 ? (
                <div className="space-y-1.5">
                  {issuer.velocityRulesList.map((rule, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg bg-gray-800/50 border border-gray-700/40 px-3 py-2">
                      <span className="text-xs font-bold text-[#C9A84C] whitespace-nowrap mt-0.5">{rule.name}</span>
                      <span className="text-sm text-gray-300">{rule.value}</span>
                      <span className="ml-auto text-xs text-gray-500 italic whitespace-nowrap">{rule.note}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">{issuer.velocityRules}</p>
              )}
            </div>

            {/* Approval Criteria (3A) */}
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">Approval Criteria</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-gray-800/50 border border-gray-700/40 p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Min FICO</p>
                  <p className="text-lg font-bold text-white mt-0.5">{issuer.approvalCriteriaDetail.minFICO}</p>
                </div>
                <div className="rounded-lg bg-gray-800/50 border border-gray-700/40 p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Min Years</p>
                  <p className="text-lg font-bold text-white mt-0.5">{issuer.approvalCriteriaDetail.minYears}yr+</p>
                </div>
                <div className="rounded-lg bg-gray-800/50 border border-gray-700/40 p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Min Revenue</p>
                  <p className="text-lg font-bold text-white mt-0.5">
                    {issuer.approvalCriteriaDetail.minRevenue > 0 ? money(issuer.approvalCriteriaDetail.minRevenue) : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Common Decline Reasons (3A) */}
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">Common Decline Reasons</h4>
              <div className="space-y-1.5">
                {issuer.declineReasons.map((dr, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm text-gray-300">{dr.reason}</span>
                        <span className="text-xs font-semibold text-red-400">{dr.pct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-500/60"
                          style={{ width: `${dr.pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Application Stats */}
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Application Stats</h4>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>Total: <strong className="text-white">{issuer.totalApps}</strong></span>
                <span>Approved: <strong className="text-emerald-400">{issuer.approved}</strong></span>
                <span>Declined: <strong className="text-red-400">{issuer.declined}</strong></span>
                <span>Pending: <strong className="text-yellow-400">{issuer.pending}</strong></span>
              </div>
            </div>

            {/* DNA Flag Detail (3B) */}
            {issuer.doNotApply && issuer.dnaDetail && (
              <DnaFlagDetail detail={issuer.dnaDetail} />
            )}

            {/* Credit Union Detail */}
            {issuer.issuerType === 'credit_union' && issuer.cuMeta && (
              <CuExpandedDetail cuMeta={issuer.cuMeta} />
            )}

            {/* Action Buttons (3A) */}
            <div className="pt-2 border-t border-gray-800 flex items-center gap-3">
              <a
                href="/platform/applications"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#C9A84C] text-sm font-medium hover:bg-[#C9A84C]/30 transition"
              >
                View Applications
                <span aria-hidden="true">&rarr;</span>
              </a>
              <button
                onClick={(e) => { e.stopPropagation(); setShowEditRules(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-700 hover:text-white transition"
              >
                Edit Rules
              </button>
            </div>
          </td>
        </tr>
      )}

      {/* Edit Rules Modal */}
      {showEditRules && (
        <EditRulesModal issuer={issuer} onClose={() => setShowEditRules(false)} />
      )}
    </>
  );
}

// ── Section Header ───────────────────────────────────────────

function SectionHeader({ title, accentColor, count }: { title: string; accentColor: string; count: number }) {
  return (
    <tr>
      <td colSpan={7} className="px-0 pt-6 pb-2">
        <div className={`flex items-center gap-3 border-l-4 pl-4 ${accentColor}`}>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <span className="text-xs text-gray-500 font-medium">({count})</span>
        </div>
      </td>
    </tr>
  );
}

// ── Filter Toggle ────────────────────────────────────────────

function FilterToggle({ mode, onChange }: { mode: FilterMode; onChange: (m: FilterMode) => void }) {
  const options: { value: FilterMode; label: string }[] = [
    { value: 'all', label: 'Show All' },
    { value: 'banks', label: 'Show Banks Only' },
    { value: 'credit_unions', label: 'Show Credit Unions Only' },
  ];

  return (
    <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition ${
            mode === opt.value
              ? 'bg-[#C9A84C]/20 border-[#C9A84C] text-[#C9A84C]'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformIssuersPage() {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDnaOnly, setShowDnaOnly] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  useEffect(() => {
    async function load() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
        const _h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) _h['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/platform/issuers', { headers: _h });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setIssuers(json.data);
        } else {
          setIssuers(FALLBACK_ISSUERS);
        }
      } catch {
        setIssuers(FALLBACK_ISSUERS);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Derived data
  const banks = useMemo(() => issuers.filter(i => i.issuerType === 'bank'), [issuers]);
  const creditUnions = useMemo(() => issuers.filter(i => i.issuerType === 'credit_union'), [issuers]);

  const filtered = useMemo(() => {
    let list = issuers;
    if (filterMode === 'banks') list = banks;
    else if (filterMode === 'credit_unions') list = creditUnions;
    if (showDnaOnly) list = list.filter(i => i.doNotApply);
    return list;
  }, [issuers, banks, creditUnions, filterMode, showDnaOnly]);

  const filteredBanks = useMemo(() => filtered.filter(i => i.issuerType === 'bank'), [filtered]);
  const filteredCUs = useMemo(() => filtered.filter(i => i.issuerType === 'credit_union'), [filtered]);

  const dnaCount = issuers.filter(i => i.doNotApply).length;

  // CU summary stats
  const cuCount = creditUnions.length;
  const cuAvgApproval = cuCount > 0
    ? (creditUnions.reduce((s, i) => s + i.approvalRate, 0) / cuCount)
    : 0;
  const cuAvgLimit = cuCount > 0
    ? Math.round(creditUnions.reduce((s, i) => s + i.avgCreditLimit, 0) / cuCount)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="animate-pulse text-gray-500 text-sm">Loading issuer data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Issuer Directory</h1>
          <p className="text-sm text-gray-500 mt-1">Velocity rules, approval criteria, and application history by issuer</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FilterToggle mode={filterMode} onChange={setFilterMode} />
          {dnaCount > 0 && (
            <button
              onClick={() => setShowDnaOnly(!showDnaOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                showDnaOnly
                  ? 'bg-red-900/40 border-red-700 text-red-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {showDnaOnly ? 'Show All' : `DNA Flags (${dnaCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Issuers</p>
          <p className="text-2xl font-bold text-white mt-1">{issuers.length}</p>
        </div>
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Applications</p>
          <p className="text-2xl font-bold text-white mt-1">
            {issuers.reduce((s, i) => s + i.totalApps, 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/5 p-4">
          <p className="text-xs text-gray-500 uppercase">Avg Approval Rate</p>
          <p className="text-2xl font-bold text-[#C9A84C] mt-1">
            {issuers.length > 0
              ? (issuers.reduce((s, i) => s + i.approvalRate, 0) / issuers.length).toFixed(1)
              : '0'}%
          </p>
        </div>
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase">DNA Flags</p>
          <p className={`text-2xl font-bold mt-1 ${dnaCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {dnaCount}
          </p>
        </div>
        {/* Credit Union Summary Card */}
        <div className="rounded-xl border border-teal-600/40 bg-teal-900/10 p-4">
          <p className="text-xs text-teal-400 uppercase font-semibold">Credit Unions</p>
          <p className="text-lg font-bold text-white mt-1">{cuCount} CUs</p>
          <div className="flex flex-col gap-0.5 mt-1 text-xs text-gray-400">
            <span>Avg Approval: <strong className="text-teal-400">{cuAvgApproval.toFixed(1)}%</strong></span>
            <span>Avg Limit: <strong className="text-teal-400">{money(cuAvgLimit)}</strong></span>
          </div>
        </div>
      </div>

      {/* Issuer Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-700/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase">
              <th className="text-left px-4 py-3">Issuer</th>
              <th className="text-right px-4 py-3">Approval Rate</th>
              <th className="text-right px-4 py-3">Total Apps</th>
              <th className="text-right px-4 py-3">Approved</th>
              <th className="text-right px-4 py-3">Declined</th>
              <th className="text-right px-4 py-3">Avg Limit</th>
              <th className="text-center px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {/* Major Banks Section */}
            {filteredBanks.length > 0 && (
              <>
                <SectionHeader title="Major Banks" accentColor="border-[#C9A84C]" count={filteredBanks.length} />
                {filteredBanks.map((issuer) => (
                  <IssuerRow key={issuer.id} issuer={issuer} />
                ))}
              </>
            )}

            {/* Credit Unions Section */}
            {filteredCUs.length > 0 && (
              <>
                <SectionHeader title="Credit Unions" accentColor="border-teal-500" count={filteredCUs.length} />
                {filteredCUs.map((issuer) => (
                  <IssuerRow key={issuer.id} issuer={issuer} />
                ))}
              </>
            )}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">No issuers match the current filter.</div>
        )}
      </div>
    </div>
  );
}
