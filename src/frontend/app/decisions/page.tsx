'use client';

// ============================================================
// /decisions — Decision Explainability
// AI decision log table with module source, decision type,
// confidence score, override status. "Why this card" panel.
// "Why not" exclusion reasons. Suitability decision breakdown.
// Override audit trail.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DecisionType = 'recommend' | 'exclude' | 'flag' | 'score' | 'override' | 'escalate';
type OverrideStatus = 'none' | 'human_override' | 'auto_corrected' | 'pending_review';
type ModuleSource =
  | 'suitability_engine'
  | 'credit_model'
  | 'compliance_check'
  | 'card_match'
  | 'risk_scorer'
  | 'fraud_detector';

interface AIDecisionLog {
  id: string;
  timestamp: string;
  businessName: string;
  module: ModuleSource;
  decisionType: DecisionType;
  summary: string;
  confidence: number; // 0–100
  overrideStatus: OverrideStatus;
  overrideBy?: string;
  overrideReason?: string;
  linkedCardId?: string;
}

interface WhyThisCard {
  cardProduct: string;
  issuer: string;
  score: number;
  topReasons: { factor: string; impact: 'high' | 'medium' | 'low'; detail: string }[];
  dataPoints: { label: string; value: string }[];
}

interface WhyNotReason {
  cardProduct: string;
  issuer: string;
  reasons: { code: string; description: string; severity: 'hard_stop' | 'soft_decline' | 'mismatch' }[];
}

interface SuitabilityBreakdown {
  overallScore: number;
  components: { dimension: string; score: number; weight: number; detail: string }[];
  supportingData: { label: string; value: string; source: string }[];
  recommendation: string;
}

interface OverrideAuditEntry {
  id: string;
  timestamp: string;
  decisionId: string;
  originalDecision: string;
  newDecision: string;
  overrideBy: string;
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_LOG: AIDecisionLog[] = [
  { id: 'dec_001', timestamp: '2026-03-31T09:12:00Z', businessName: 'Apex Ventures LLC',       module: 'suitability_engine', decisionType: 'score',     summary: 'Suitability score calculated: 78/100. Band: Good.', confidence: 94, overrideStatus: 'none' },
  { id: 'dec_002', timestamp: '2026-03-31T09:13:00Z', businessName: 'Apex Ventures LLC',       module: 'card_match',         decisionType: 'recommend', summary: 'Chase Ink Business Cash recommended as primary match.', confidence: 88, overrideStatus: 'none', linkedCardId: 'card_chase_ink_cash' },
  { id: 'dec_003', timestamp: '2026-03-31T09:13:30Z', businessName: 'Apex Ventures LLC',       module: 'card_match',         decisionType: 'exclude',   summary: 'Amex Plum Card excluded — spend pattern mismatch.', confidence: 92, overrideStatus: 'none', linkedCardId: 'card_amex_plum' },
  { id: 'dec_004', timestamp: '2026-03-31T09:14:00Z', businessName: 'Summit Capital Group',    module: 'credit_model',       decisionType: 'flag',      summary: 'FICO proximity to floor detected. DTI at 47%.', confidence: 85, overrideStatus: 'pending_review' },
  { id: 'dec_005', timestamp: '2026-03-31T09:15:00Z', businessName: 'Blue Ridge Consulting',   module: 'compliance_check',   decisionType: 'flag',      summary: 'NY AG inquiry match on principal. Legal review triggered.', confidence: 99, overrideStatus: 'none' },
  { id: 'dec_006', timestamp: '2026-03-31T09:16:00Z', businessName: 'NovaTech Solutions Inc.', module: 'risk_scorer',        decisionType: 'score',     summary: 'Risk score 42/100. Category: Moderate. DTI acceptable.', confidence: 80, overrideStatus: 'human_override', overrideBy: 'Ana Reyes', overrideReason: 'Strong revenue trend offsets DTI concern.' },
  { id: 'dec_007', timestamp: '2026-03-31T09:17:00Z', businessName: 'Horizon Retail Partners', module: 'fraud_detector',     decisionType: 'escalate',  summary: 'Bank statement inconsistency detected. Velocity anomaly flagged.', confidence: 76, overrideStatus: 'none' },
  { id: 'dec_008', timestamp: '2026-03-31T09:18:00Z', businessName: 'Pinnacle Freight Corp',   module: 'suitability_engine', decisionType: 'recommend', summary: 'Capital One Spark Cash Plus recommended. Travel category match.', confidence: 91, overrideStatus: 'auto_corrected' },
];

const PLACEHOLDER_WHY_THIS: WhyThisCard = {
  cardProduct: 'Chase Ink Business Cash',
  issuer: 'Chase',
  score: 94,
  topReasons: [
    { factor: 'Spend Category Match',       impact: 'high',   detail: 'Business has >60% office supply and telecom spend — aligns with 5% cashback categories.' },
    { factor: 'Revenue Tier Compatibility', impact: 'high',   detail: 'Annual revenue $2.4M matches Chase Ink preferred range ($500K–$5M).' },
    { factor: 'Credit Profile Fit',         impact: 'medium', detail: 'FICO 742 and 4yr business age exceed Chase underwriting minimum.' },
    { factor: 'Low Personal Inquiry Count', impact: 'medium', detail: '2 inquiries in 12 months — below Chase 5/24 threshold.' },
    { factor: 'Industry Compatibility',     impact: 'low',    detail: 'B2B professional services SIC code has high Chase Ink approval history.' },
  ],
  dataPoints: [
    { label: 'Annual Revenue',       value: '$2,400,000' },
    { label: 'Personal FICO',        value: '742' },
    { label: 'Business Age',         value: '4 yrs 3 mos' },
    { label: 'Inquiries (12 mo)',     value: '2' },
    { label: 'Requested Limit',      value: '$25,000' },
    { label: 'Suitability Score',    value: '78 / 100' },
  ],
};

const PLACEHOLDER_WHY_NOT: WhyNotReason[] = [
  {
    cardProduct: 'Amex Plum Card', issuer: 'Amex',
    reasons: [
      { code: 'SPEND_MISMATCH',    description: 'Plum Card targets import/export businesses; client spend is domestic office/telecom.', severity: 'soft_decline' },
      { code: 'CASH_FLOW_PATTERN', description: 'Amex Plum requires consistent full balance payoff; cash flow analysis shows partial payment history.', severity: 'hard_stop' },
    ],
  },
  {
    cardProduct: 'Citi Business Platinum', issuer: 'Citi',
    reasons: [
      { code: 'CREDIT_THRESHOLD',  description: 'Citi preferred minimum FICO 750+. Current 742 is below soft floor.', severity: 'soft_decline' },
      { code: 'INQUIRY_COUNT',     description: 'Citi internal scoring penalizes 2+ inquiries in 6 months. Client has 2 in 5 months.', severity: 'mismatch' },
    ],
  },
  {
    cardProduct: 'US Bank Business Altitude Connect', issuer: 'US Bank',
    reasons: [
      { code: 'INDUSTRY_MISMATCH', description: 'Product optimized for T&E spend. Client has minimal travel budget.', severity: 'mismatch' },
    ],
  },
];

const PLACEHOLDER_SUITABILITY: SuitabilityBreakdown = {
  overallScore: 78,
  recommendation: 'Client is suitable for a 3-card stack up to $75,000 combined limit. Primary card recommendation: Chase Ink Business Cash. Proceed with conditional approval pending bank statement verification.',
  components: [
    { dimension: 'Credit Quality',       score: 80, weight: 30, detail: 'FICO 742, 4yr history, 2 inquiries — strong.' },
    { dimension: 'Revenue Stability',    score: 85, weight: 25, detail: 'YoY revenue growth 18%. 3-month trend positive.' },
    { dimension: 'Debt Service Ratio',   score: 65, weight: 20, detail: 'DTI 47% — borderline. Monitored.' },
    { dimension: 'Business Maturity',    score: 78, weight: 15, detail: '4+ years operations, documented clients.' },
    { dimension: 'Industry Risk',        score: 90, weight: 10, detail: 'Professional services — low default category.' },
  ],
  supportingData: [
    { label: 'FICO Score',             value: '742',        source: 'Experian pull 2026-03-28' },
    { label: 'Annual Revenue',         value: '$2,400,000', source: 'Bank statement avg (3 mo)' },
    { label: 'Monthly Net Cash Flow',  value: '$42,000',    source: 'Bank statement verified' },
    { label: 'Total Monthly Debt',     value: '$19,740',    source: 'Credit bureau + stated' },
    { label: 'DTI',                    value: '47%',        source: 'Calculated' },
    { label: 'Derogatory Marks',       value: '0',          source: 'All 3 bureaus' },
    { label: 'Bank Account Age',       value: '6 years',    source: 'Bank statement header' },
    { label: 'Avg Monthly Balance',    value: '$88,000',    source: 'Bank statement avg (3 mo)' },
  ],
};

const PLACEHOLDER_OVERRIDE_TRAIL: OverrideAuditEntry[] = [
  {
    id: 'ov_001',
    timestamp: '2026-03-31T10:00:00Z',
    decisionId: 'dec_006',
    originalDecision: 'Risk score 42/100 — Borderline Decline recommendation issued by risk_scorer.',
    newDecision: 'Approved with conditions — DTI compensating factor documented.',
    overrideBy: 'Ana Reyes',
    reason: 'Strong revenue growth trend (18% YoY) and bank account depth ($88K avg) offset DTI concern. DTI borderline, not disqualifying.',
    approvedBy: 'Diana Walsh (Chief Credit Officer)',
    approvedAt: '2026-03-31T10:30:00Z',
  },
  {
    id: 'ov_002',
    timestamp: '2026-03-30T14:00:00Z',
    decisionId: 'dec_008',
    originalDecision: 'Capital One Spark Miles recommended as primary (score: 88).',
    newDecision: 'Capital One Spark Cash Plus promoted to primary — client confirmed no travel program.',
    overrideBy: 'System (auto_corrected)',
    reason: 'Client profile update: travel budget marked $0. Miles card re-ranked below cash card.',
    approvedBy: undefined,
    approvedAt: undefined,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODULE_LABELS: Record<ModuleSource, string> = {
  suitability_engine: 'Suitability Engine',
  credit_model:       'Credit Model',
  compliance_check:   'Compliance Check',
  card_match:         'Card Match',
  risk_scorer:        'Risk Scorer',
  fraud_detector:     'Fraud Detector',
};

const MODULE_COLORS: Record<ModuleSource, string> = {
  suitability_engine: 'bg-blue-900 text-blue-300 border-blue-700',
  credit_model:       'bg-purple-900 text-purple-300 border-purple-700',
  compliance_check:   'bg-orange-900 text-orange-300 border-orange-700',
  card_match:         'bg-teal-900 text-teal-300 border-teal-700',
  risk_scorer:        'bg-yellow-900 text-yellow-300 border-yellow-700',
  fraud_detector:     'bg-red-900 text-red-300 border-red-700',
};

const DECISION_TYPE_CONFIG: Record<DecisionType, { label: string; badgeClass: string }> = {
  recommend: { label: 'Recommend', badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  exclude:   { label: 'Exclude',   badgeClass: 'bg-gray-800 text-gray-400 border-gray-700' },
  flag:      { label: 'Flag',      badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  score:     { label: 'Score',     badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  override:  { label: 'Override',  badgeClass: 'bg-orange-900 text-orange-300 border-orange-700' },
  escalate:  { label: 'Escalate',  badgeClass: 'bg-red-900 text-red-300 border-red-700' },
};

const OVERRIDE_STATUS_CONFIG: Record<OverrideStatus, { label: string; cls: string }> = {
  none:            { label: 'No Override',      cls: 'text-gray-500' },
  human_override:  { label: 'Human Override',   cls: 'text-orange-400 font-semibold' },
  auto_corrected:  { label: 'Auto-Corrected',   cls: 'text-blue-400 font-semibold' },
  pending_review:  { label: 'Pending Review',   cls: 'text-yellow-400 font-semibold' },
};

const SEVERITY_CONFIG = {
  hard_stop:    { label: 'Hard Stop',    cls: 'bg-red-900 text-red-300 border-red-700' },
  soft_decline: { label: 'Soft Decline', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  mismatch:     { label: 'Mismatch',     cls: 'bg-gray-800 text-gray-400 border-gray-700' },
};

const IMPACT_CONFIG = {
  high:   { dot: 'bg-green-400',  label: 'High Impact' },
  medium: { dot: 'bg-yellow-400', label: 'Medium Impact' },
  low:    { dot: 'bg-gray-500',   label: 'Low Impact' },
};

function formatDateTime(iso: string) {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 85 ? 'bg-green-500' : score >= 65 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-300">{score}%</span>
    </div>
  );
}

type DecisionsTab = 'log' | 'why_this' | 'why_not' | 'suitability' | 'overrides';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DecisionsPage() {
  const [activeTab, setActiveTab] = useState<DecisionsTab>('log');
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<ModuleSource | 'all'>('all');
  const [overrideFilter, setOverrideFilter] = useState<OverrideStatus | 'all'>('all');

  const filteredLog = PLACEHOLDER_LOG.filter((d) => {
    const moduleOk = moduleFilter === 'all' || d.module === moduleFilter;
    const overrideOk = overrideFilter === 'all' || d.overrideStatus === overrideFilter;
    return moduleOk && overrideOk;
  });

  const selectedDecision = PLACEHOLDER_LOG.find((d) => d.id === selectedDecisionId);

  const TABS: { id: DecisionsTab; label: string }[] = [
    { id: 'log',         label: 'AI Decision Log' },
    { id: 'why_this',    label: 'Why This Card' },
    { id: 'why_not',     label: 'Why Not' },
    { id: 'suitability', label: 'Suitability Breakdown' },
    { id: 'overrides',   label: 'Override Audit Trail' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Decision Explainability</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            AI decision logs, confidence scores, override tracking, and suitability rationale
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Export Log
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Decisions',   value: PLACEHOLDER_LOG.length,                                                                       valueClass: 'text-white' },
          { label: 'Avg Confidence',    value: `${Math.round(PLACEHOLDER_LOG.reduce((s, d) => s + d.confidence, 0) / PLACEHOLDER_LOG.length)}%`, valueClass: 'text-[#C9A84C]' },
          { label: 'Human Overrides',   value: PLACEHOLDER_LOG.filter((d) => d.overrideStatus === 'human_override').length,                  valueClass: 'text-orange-400' },
          { label: 'Flags / Escalations', value: PLACEHOLDER_LOG.filter((d) => d.decisionType === 'flag' || d.decisionType === 'escalate').length, valueClass: 'text-red-400' },
        ].map(({ label, value, valueClass }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">{label}</p>
            <p className={`text-3xl font-black ${valueClass}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: AI Decision Log */}
      {activeTab === 'log' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value as ModuleSource | 'all')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Modules</option>
              {(Object.keys(MODULE_LABELS) as ModuleSource[]).map((m) => (
                <option key={m} value={m}>{MODULE_LABELS[m]}</option>
              ))}
            </select>
            <select
              value={overrideFilter}
              onChange={(e) => setOverrideFilter(e.target.value as OverrideStatus | 'all')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Override Status</option>
              <option value="none">No Override</option>
              <option value="human_override">Human Override</option>
              <option value="auto_corrected">Auto-Corrected</option>
              <option value="pending_review">Pending Review</option>
            </select>
            <span className="text-xs text-gray-500 self-center">{filteredLog.length} records</span>
          </div>

          {/* Table */}
          <div className="overflow-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Timestamp</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Business</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Module</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Decision</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Summary</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Confidence</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Override</th>
                </tr>
              </thead>
              <tbody>
                {filteredLog.map((d) => {
                  const typeCfg = DECISION_TYPE_CONFIG[d.decisionType];
                  const overrideCfg = OVERRIDE_STATUS_CONFIG[d.overrideStatus];
                  const isSelected = d.id === selectedDecisionId;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDecisionId(d.id === selectedDecisionId ? null : d.id)}
                      className={`border-b border-gray-800 cursor-pointer transition-colors ${isSelected ? 'bg-[#0A1628]' : 'bg-gray-900 hover:bg-gray-800'}`}
                    >
                      <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(d.timestamp)}</td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-semibold text-gray-100 whitespace-nowrap">{d.businessName}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${MODULE_COLORS[d.module]}`}>
                          {MODULE_LABELS[d.module]}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeCfg.badgeClass}`}>
                          {typeCfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400 max-w-xs">{d.summary}</td>
                      <td className="py-3 px-4">
                        <ConfidenceBar score={d.confidence} />
                      </td>
                      <td className={`py-3 px-4 text-xs ${overrideCfg.cls}`}>{overrideCfg.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected decision detail panel */}
          {selectedDecision && (
            <div className="mt-4 rounded-xl border border-[#C9A84C]/30 bg-[#0A1628] p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Decision Detail</p>
                  <p className="text-sm font-semibold text-gray-100">{selectedDecision.businessName} — {MODULE_LABELS[selectedDecision.module]}</p>
                </div>
                <button onClick={() => setSelectedDecisionId(null)} className="text-gray-600 hover:text-gray-300 text-sm">✕</button>
              </div>
              <p className="text-sm text-gray-300 mb-3">{selectedDecision.summary}</p>
              {selectedDecision.overrideStatus !== 'none' && (
                <div className="border-t border-gray-800 pt-3 mt-3">
                  <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1">Override Details</p>
                  <p className="text-xs text-gray-400">
                    <span className="text-gray-300 font-medium">By:</span> {selectedDecision.overrideBy ?? 'System'} ·{' '}
                    <span className="text-gray-300 font-medium">Reason:</span> {selectedDecision.overrideReason ?? 'Auto-correction based on updated profile data.'}
                  </p>
                </div>
              )}
              <div className="border-t border-gray-800 pt-3 mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span>ID: <span className="font-mono text-gray-400">{selectedDecision.id}</span></span>
                <span>{formatDateTime(selectedDecision.timestamp)}</span>
                <ConfidenceBar score={selectedDecision.confidence} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Why This Card */}
      {activeTab === 'why_this' && (
        <div className="space-y-5">
          {/* Card header */}
          <div className="rounded-xl border border-[#C9A84C]/30 bg-[#0A1628] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Primary Recommendation</p>
                <p className="text-xl font-bold text-white">{PLACEHOLDER_WHY_THIS.cardProduct}</p>
                <p className="text-sm text-gray-400">{PLACEHOLDER_WHY_THIS.issuer}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1">Match Score</p>
                <p className="text-4xl font-black text-[#C9A84C]">{PLACEHOLDER_WHY_THIS.score}</p>
                <p className="text-xs text-gray-500">/ 100</p>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
              <div className="h-full rounded-full bg-[#C9A84C]" style={{ width: `${PLACEHOLDER_WHY_THIS.score}%` }} />
            </div>
          </div>

          {/* Top reasons */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Why This Card Was Recommended</p>
            <div className="space-y-4">
              {PLACEHOLDER_WHY_THIS.topReasons.map((r, i) => {
                const impactCfg = IMPACT_CONFIG[r.impact];
                return (
                  <div key={i} className="flex items-start gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full mt-1 flex-shrink-0 ${impactCfg.dot}`} />
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-gray-100">{r.factor}</p>
                        <span className="text-[10px] text-gray-500">{impactCfg.label}</span>
                      </div>
                      <p className="text-xs text-gray-400">{r.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Supporting data points */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Supporting Data Points</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PLACEHOLDER_WHY_THIS.dataPoints.map(({ label, value }) => (
                <div key={label} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-gray-100">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Why Not */}
      {activeTab === 'why_not' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 mb-4">Cards evaluated but excluded from the recommendation set, with machine-generated exclusion rationale.</p>
          {PLACEHOLDER_WHY_NOT.map((item, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center gap-3 mb-4">
                <p className="text-sm font-bold text-gray-100">{item.cardProduct}</p>
                <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
                  {item.issuer}
                </span>
              </div>
              <div className="space-y-3">
                {item.reasons.map((r, j) => {
                  const sevCfg = SEVERITY_CONFIG[r.severity];
                  return (
                    <div key={j} className="flex items-start gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 mt-0.5 ${sevCfg.cls}`}>
                        {sevCfg.label}
                      </span>
                      <div>
                        <p className="text-xs font-mono text-gray-500 mb-0.5">{r.code}</p>
                        <p className="text-xs text-gray-300">{r.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Suitability Breakdown */}
      {activeTab === 'suitability' && (
        <div className="space-y-5">
          {/* Overall score */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-end gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Suitability Score</p>
                <p className="text-5xl font-black text-[#C9A84C]">{PLACEHOLDER_SUITABILITY.overallScore}</p>
                <p className="text-xs text-gray-500">/ 100 — Suitable</p>
              </div>
              <div className="flex-1 pb-1">
                <div className="w-full h-3 rounded-full bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-[#C9A84C]" style={{ width: `${PLACEHOLDER_SUITABILITY.overallScore}%` }} />
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed border-t border-gray-800 pt-4">
              {PLACEHOLDER_SUITABILITY.recommendation}
            </p>
          </div>

          {/* Component breakdown */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Score Components</p>
            <div className="space-y-4">
              {PLACEHOLDER_SUITABILITY.components.map((c) => {
                const barColor = c.score >= 75 ? 'bg-green-500' : c.score >= 55 ? 'bg-yellow-500' : 'bg-red-500';
                const weightedContribution = Math.round((c.score * c.weight) / 100);
                return (
                  <div key={c.dimension}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-200">{c.dimension}</p>
                        <span className="text-[10px] text-gray-600">{c.weight}% weight · +{weightedContribution} pts</span>
                      </div>
                      <span className={`text-sm font-bold ${c.score >= 75 ? 'text-green-400' : c.score >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {c.score}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden mb-1">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${c.score}%` }} />
                    </div>
                    <p className="text-xs text-gray-500">{c.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Supporting data */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Supporting Data</p>
            <div className="space-y-2">
              {PLACEHOLDER_SUITABILITY.supportingData.map(({ label, value, source }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm text-gray-200 font-medium">{label}</p>
                    <p className="text-[10px] text-gray-600">{source}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-100">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Override Audit Trail */}
      {activeTab === 'overrides' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 mb-4">
            Complete audit trail of all human and system overrides to AI decisions. All entries are immutable.
          </p>
          {PLACEHOLDER_OVERRIDE_TRAIL.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-gray-500">{entry.id}</span>
                    <span className="text-[10px] bg-orange-900 text-orange-300 border border-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                      Override
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-300">
                    Decision <span className="font-mono text-gray-500">{entry.decisionId}</span>
                  </p>
                </div>
                <p className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(entry.timestamp)}</p>
              </div>

              {/* Before / After */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bg-red-950/30 border border-red-900 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1">Original Decision</p>
                  <p className="text-xs text-gray-300">{entry.originalDecision}</p>
                </div>
                <div className="bg-green-950/30 border border-green-900 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-green-400 uppercase tracking-wide mb-1">Overridden To</p>
                  <p className="text-xs text-gray-300">{entry.newDecision}</p>
                </div>
              </div>

              {/* Reason */}
              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Override Rationale</p>
                <p className="text-xs text-gray-300">{entry.reason}</p>
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 border-t border-gray-800 pt-3">
                <span>Override by <span className="text-gray-300 font-medium">{entry.overrideBy}</span></span>
                {entry.approvedBy && (
                  <span>Approved by <span className="text-gray-300 font-medium">{entry.approvedBy}</span></span>
                )}
                {entry.approvedAt && (
                  <span>{formatDateTime(entry.approvedAt)}</span>
                )}
                {!entry.approvedBy && (
                  <span className="text-blue-400">System auto-applied — no approval required</span>
                )}
              </div>
            </div>
          ))}

          <div className="p-4 rounded-xl border border-gray-700 bg-gray-900 text-xs text-gray-500">
            All override entries are append-only and retained for 7 years per regulatory requirements. Entries cannot be deleted or modified.
          </div>
        </div>
      )}
    </div>
  );
}
