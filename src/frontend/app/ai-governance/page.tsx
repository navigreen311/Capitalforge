'use client';

// ============================================================
// /ai-governance — AI Governance Dashboard
// Decision log table (module, type, confidence, model version),
// metrics dashboard cards (override rate, avg confidence,
// below-threshold rate, hallucination rate), consistency check
// results, version history timeline, performance comparison.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DecisionType      = 'approval' | 'denial' | 'flag' | 'recommendation' | 'extraction';
type ConsistencyResult = 'pass' | 'warn' | 'fail';

interface DecisionLogEntry {
  id:           string;
  module:       string;
  type:         DecisionType;
  confidence:   number;
  modelVersion: string;
  modelType:    string;
  latencyMs:    number;
  entityName:   string;
  timestamp:    string;
  overridden:   boolean;
  overrideReason?: string;
  overrideDocumented?: boolean;
  flaggedLow:   boolean;
  details:      string;
  inputSnapshot:  string;
  outputSnapshot: string;
}

interface ConsistencyCheck {
  id:          string;
  checkName:   string;
  module:      string;
  runsCompared: number;
  divergence:  number;
  result:      ConsistencyResult;
  lastRun:     string;
  description: string;
  failureDetail?: string;
}

interface ModelVersion {
  version:     string;
  module:      string;
  deployedAt:  string;
  status:      'active' | 'deprecated' | 'testing';
  changes:     string[];
  approvedBy:  string;
  avgConfidence: number;
  overrideRate:  number;
}

interface ModulePerformance {
  module:          string;
  decisions:       number;
  avgConfidence:   number;
  overrideRate:    number;
  belowThreshold:  number;
  status:          'OK' | 'Review';
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const CLIENTS = [
  'All Clients',
  'Apex Ventures LLC',
  'BlueStar Logistics',
  'Crestline Medical LLC',
  'Summit Capital Group',
  'Harbor Street Foods',
];

const DECISION_LOG: DecisionLogEntry[] = [
  {
    id: 'dl_001', module: 'Credit Underwriter', type: 'approval', confidence: 0.92,
    modelVersion: 'v3.2.1', modelType: 'Gradient-Boosted Ensemble', latencyMs: 340,
    entityName: 'Apex Ventures LLC', timestamp: '2026-03-31T10:15:00Z',
    overridden: false, flaggedLow: false,
    details: 'Approved $120K MCA based on 18-month cash flow trend and 720+ credit score.',
    inputSnapshot: 'Revenue: $1.2M/yr, Credit Score: 724, Cash Flow Trend: +12%',
    outputSnapshot: 'Decision: APPROVE, Amount: $120K, Term: 18mo, Risk Tier: B+',
  },
  {
    id: 'dl_002', module: 'KYB Extractor', type: 'extraction', confidence: 0.71,
    modelVersion: 'v2.4.0', modelType: 'NER Transformer', latencyMs: 1240,
    entityName: 'BlueStar Logistics', timestamp: '2026-03-31T09:45:00Z',
    overridden: false, flaggedLow: true,
    details: 'Extracted beneficial ownership from Secretary of State filing. Confidence below 0.75 — manual review triggered.',
    inputSnapshot: 'Document: SOS Filing #2026-BL-4401, Pages: 3, Format: PDF',
    outputSnapshot: 'Owners: J. Martinez (60%), K. Patel (40%), Entity Type: LLC',
  },
  {
    id: 'dl_003', module: 'Credit Underwriter', type: 'denial', confidence: 0.88,
    modelVersion: 'v3.2.1', modelType: 'Gradient-Boosted Ensemble', latencyMs: 290,
    entityName: 'Crestline Medical LLC', timestamp: '2026-03-30T16:30:00Z',
    overridden: true, overrideReason: 'Collateral override — advisor applied manual collateral assessment.',
    overrideDocumented: true, flaggedLow: false,
    details: 'Denial recommended on cash flow grounds. Advisor overrode — collateral override applied.',
    inputSnapshot: 'Revenue: $480K/yr, Credit Score: 658, Cash Flow Trend: -8%',
    outputSnapshot: 'Decision: DENY, Risk Tier: D, Reason: Negative cash flow trend',
  },
  {
    id: 'dl_004', module: 'Compliance Screener', type: 'flag', confidence: 0.95,
    modelVersion: 'v1.8.3', modelType: 'Fuzzy Match + Rules Engine', latencyMs: 85,
    entityName: 'Summit Capital Group', timestamp: '2026-03-30T14:00:00Z',
    overridden: false, flaggedLow: false,
    details: 'OFAC watchlist match flagged for analyst review. High confidence; no false positive indicators.',
    inputSnapshot: 'Entity: Summit Capital Group, Principals: R. Ahmadi, L. Chen',
    outputSnapshot: 'Match: OFAC SDN List, Score: 0.95, Matched Name: Summit Capital Ltd.',
  },
  {
    id: 'dl_005', module: 'Product Recommender', type: 'recommendation', confidence: 0.67,
    modelVersion: 'v1.1.0', modelType: 'Collaborative Filtering + Rules', latencyMs: 520,
    entityName: 'Harbor Street Foods', timestamp: '2026-03-30T11:20:00Z',
    overridden: true, overrideReason: 'Client preference — advisor selected equipment financing.',
    overrideDocumented: false, flaggedLow: true,
    details: 'Recommended SBA 7(a) path. Advisor overrode to equipment financing — client preference.',
    inputSnapshot: 'Revenue: $320K/yr, Industry: Food Service, Need: Equipment',
    outputSnapshot: 'Recommendation: SBA 7(a), Alt: Equipment Financing, Confidence: 67%',
  },
  {
    id: 'dl_006', module: 'Document Classifier', type: 'extraction', confidence: 0.84,
    modelVersion: 'v2.0.1', modelType: 'CNN + OCR Pipeline', latencyMs: 780,
    entityName: 'NovaTech Solutions Inc.', timestamp: '2026-03-29T15:00:00Z',
    overridden: false, flaggedLow: false,
    details: 'Bank statements classified correctly. 3-month average revenue extracted.',
    inputSnapshot: 'Documents: 3 bank statements, Format: PDF, Pages: 12',
    outputSnapshot: 'Type: Bank Statement, Avg Revenue: $89K/mo, Period: Jan-Mar 2026',
  },
  {
    id: 'dl_007', module: 'Credit Underwriter', type: 'approval', confidence: 0.78,
    modelVersion: 'v3.2.1', modelType: 'Gradient-Boosted Ensemble', latencyMs: 310,
    entityName: 'Keystone Retail Co.', timestamp: '2026-03-29T13:45:00Z',
    overridden: false, flaggedLow: false,
    details: 'Approved $85K term loan. Confidence moderate — 2-year thin file.',
    inputSnapshot: 'Revenue: $640K/yr, Credit Score: 698, Time in Business: 2yr',
    outputSnapshot: 'Decision: APPROVE, Amount: $85K, Term: 12mo, Risk Tier: C+',
  },
  {
    id: 'dl_008', module: 'Compliance Screener', type: 'flag', confidence: 0.48,
    modelVersion: 'v1.8.3', modelType: 'Fuzzy Match + Rules Engine', latencyMs: 92,
    entityName: 'Ridgeline Partners LLC', timestamp: '2026-03-28T10:00:00Z',
    overridden: true, overrideReason: 'False positive confirmed after analyst review.',
    overrideDocumented: true, flaggedLow: true,
    details: 'Potential adverse media match. Analyst reviewed — false positive confirmed. Override applied.',
    inputSnapshot: 'Entity: Ridgeline Partners LLC, Principals: M. Torres',
    outputSnapshot: 'Match: Adverse Media, Score: 0.48, Source: Reuters Archive',
  },
];

const CONSISTENCY_CHECKS: ConsistencyCheck[] = [
  {
    id: 'cc_01', checkName: 'Same-input reproducibility',     module: 'Credit Underwriter',
    runsCompared: 50, divergence: 1.2,   result: 'pass', lastRun: '2026-03-31',
    description: 'Run 50 identical inputs — approval outcome consistency across runs.',
  },
  {
    id: 'cc_02', checkName: 'Confidence calibration',         module: 'Credit Underwriter',
    runsCompared: 200, divergence: 3.8,  result: 'warn', lastRun: '2026-03-30',
    description: 'Confidence scores vs actual outcome rates. Divergence approaching warn threshold.',
  },
  {
    id: 'cc_03', checkName: 'Extraction field alignment',     module: 'KYB Extractor',
    runsCompared: 30,  divergence: 0.7,  result: 'pass', lastRun: '2026-03-31',
    description: 'Cross-check extracted fields vs ground truth labeled docs.',
  },
  {
    id: 'cc_04', checkName: 'Watchlist recall rate',          module: 'Compliance Screener',
    runsCompared: 100, divergence: 0.4,  result: 'pass', lastRun: '2026-03-29',
    description: 'OFAC/SDN test set: true positive recall consistency.',
  },
  {
    id: 'cc_05', checkName: 'Prompt drift detection',         module: 'Product Recommender',
    runsCompared: 40,  divergence: 8.6,  result: 'fail', lastRun: '2026-03-28',
    description: 'Output drift vs golden test set detected above 8% threshold. Review prompt version.',
    failureDetail: 'Prompt version v1.1.0-rc2 introduced a system instruction change on 2026-03-25 that shifted product weighting toward SBA products by 14%. Golden test set shows 8.6% output divergence (threshold: 5%). Root cause: updated product catalog embeddings were not re-indexed after prompt change. Recommended action: re-index embeddings and re-run golden test suite.',
  },
  {
    id: 'cc_06', checkName: 'Document classification accuracy', module: 'Document Classifier',
    runsCompared: 80,  divergence: 1.1,  result: 'pass', lastRun: '2026-03-31',
    description: 'Classification label consistency across document type test set.',
  },
];

const VERSION_HISTORY: ModelVersion[] = [
  {
    version: 'v3.2.1', module: 'Credit Underwriter', deployedAt: '2026-03-15',
    status: 'active', approvedBy: 'Marcus Webb', avgConfidence: 86, overrideRate: 12,
    changes: ['Improved cash flow trend weighting', 'Reduced false-positive denial rate by 4%', 'Confidence calibration fix'],
  },
  {
    version: 'v3.1.0', module: 'Credit Underwriter', deployedAt: '2026-02-01',
    status: 'deprecated', approvedBy: 'Alex Morgan', avgConfidence: 81, overrideRate: 18,
    changes: ['Initial thin-file handling', 'Seasonal revenue normalization'],
  },
  {
    version: 'v2.4.0', module: 'KYB Extractor', deployedAt: '2026-03-20',
    status: 'active', approvedBy: 'Sarah Chen', avgConfidence: 78, overrideRate: 8,
    changes: ['Added multi-state filing support', 'Beneficial owner regex improvements'],
  },
  {
    version: 'v1.8.3', module: 'Compliance Screener', deployedAt: '2026-03-01',
    status: 'active', approvedBy: 'Marcus Webb', avgConfidence: 82, overrideRate: 15,
    changes: ['OFAC list refresh March 2026', 'Fuzzy name match threshold tuned to 0.85'],
  },
  {
    version: 'v1.1.0', module: 'Product Recommender', deployedAt: '2026-01-10',
    status: 'testing', approvedBy: 'Alex Morgan', avgConfidence: 68, overrideRate: 32,
    changes: ['New SBA product categories', 'Equity alternative path added'],
  },
  {
    version: 'v2.0.1', module: 'Document Classifier', deployedAt: '2026-02-20',
    status: 'active', approvedBy: 'Sarah Chen', avgConfidence: 84, overrideRate: 6,
    changes: ['Bank statement template v2 support', 'Reduced misclassification on tax transcripts'],
  },
];

const MODULE_PERFORMANCE: ModulePerformance[] = [
  { module: 'Credit Underwriter',   decisions: 1240, avgConfidence: 86, overrideRate: 12, belowThreshold: 8,  status: 'OK' },
  { module: 'KYB Extractor',        decisions: 430,  avgConfidence: 78, overrideRate: 8,  belowThreshold: 18, status: 'Review' },
  { module: 'Compliance Screener',  decisions: 890,  avgConfidence: 82, overrideRate: 15, belowThreshold: 11, status: 'OK' },
  { module: 'Product Recommender',  decisions: 310,  avgConfidence: 68, overrideRate: 32, belowThreshold: 28, status: 'Review' },
  { module: 'Document Classifier',  decisions: 760,  avgConfidence: 84, overrideRate: 6,  belowThreshold: 5,  status: 'OK' },
];

const HALLUCINATION_RATE = 1.4; // percent

const ALL_MODULES = ['all', 'Credit Underwriter', 'KYB Extractor', 'Compliance Screener', 'Product Recommender', 'Document Classifier'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DECISION_TYPE_BADGE: Record<DecisionType, string> = {
  approval:       'bg-emerald-900 text-emerald-300 border-emerald-700',
  denial:         'bg-red-900 text-red-300 border-red-700',
  flag:           'bg-orange-900 text-orange-300 border-orange-700',
  recommendation: 'bg-blue-900 text-blue-300 border-blue-700',
  extraction:     'bg-indigo-900 text-indigo-300 border-indigo-700',
};

const CONSISTENCY_CONFIG: Record<ConsistencyResult, { badge: string; icon: string }> = {
  pass: { badge: 'bg-emerald-900 text-emerald-300 border-emerald-700', icon: '✓' },
  warn: { badge: 'bg-amber-900 text-amber-300 border-amber-700',       icon: '!' },
  fail: { badge: 'bg-red-900 text-red-300 border-red-700',             icon: '✗' },
};

const VERSION_STATUS_BADGE: Record<ModelVersion['status'], string> = {
  active:     'bg-emerald-900 text-emerald-300 border-emerald-700',
  deprecated: 'bg-gray-800 text-gray-500 border-gray-700',
  testing:    'bg-amber-900 text-amber-300 border-amber-700',
};

function fmtTs(iso: string) {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function ConfidenceBar({ value, width = 'w-16' }: { value: number; width?: string }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 65 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className={`${width} bg-gray-800 rounded-full h-1.5`}>
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${pct >= 80 ? 'text-emerald-400' : pct >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
        {pct}%
      </span>
    </div>
  );
}

function ConfidenceBarPct({ value, width = 'w-20' }: { value: number; width?: string }) {
  const color = value >= 80 ? 'bg-emerald-500' : value >= 65 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className={`${width} bg-gray-800 rounded-full h-1.5`}>
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-semibold ${value >= 80 ? 'text-emerald-400' : value >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
        {value}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AiGovernancePage() {
  const [activeTab, setActiveTab]           = useState<'log' | 'consistency' | 'versions'>('log');
  const [activeModule, setActiveModule]     = useState<string>('all');
  const [expandedRows, setExpandedRows]     = useState<Set<string>>(new Set());
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());
  const [selectedClient, setSelectedClient] = useState<string>('All Clients');
  const [toastMessage, setToastMessage]     = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCheck = (id: string) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtered log
  const filteredLog = activeModule === 'all'
    ? DECISION_LOG
    : DECISION_LOG.filter((d) => d.module === activeModule);

  // Metrics
  const totalDecisions     = DECISION_LOG.length;
  const overrideCount      = DECISION_LOG.filter((d) => d.overridden).length;
  const overrideRate       = totalDecisions ? Math.round((overrideCount / totalDecisions) * 100) : 0;
  const avgConfidence      = totalDecisions
    ? Math.round((DECISION_LOG.reduce((s, d) => s + d.confidence, 0) / totalDecisions) * 100)
    : 0;
  const belowThreshold     = DECISION_LOG.filter((d) => d.confidence < 0.75).length;
  const belowThresholdRate = totalDecisions ? Math.round((belowThreshold / totalDecisions) * 100) : 0;

  const consistencyFails  = CONSISTENCY_CHECKS.filter((c) => c.result === 'fail').length;
  const consistencyTotal  = CONSISTENCY_CHECKS.length;

  // Group versions by module
  const versionsByModule = VERSION_HISTORY.reduce<Record<string, ModelVersion[]>>((acc, v) => {
    (acc[v.module] ??= []).push(v);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 relative">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-900 border border-emerald-700 text-emerald-200 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* Client Selector */}
      <div className="mb-6">
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-4 py-2.5 focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] outline-none cursor-pointer"
        >
          {CLIENTS.map((c) => (
            <option key={c} value={c} className="bg-gray-900">{c}</option>
          ))}
        </select>
      </div>

      {/* High Override Rate Alert */}
      {overrideRate > 25 && (
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap px-5 py-4 rounded-xl bg-amber-950/50 border border-amber-700">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm font-semibold text-amber-300">
              High Override Rate Detected — {overrideRate}%
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => showToast('Model review initiated. Compliance team notified.')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-900 border border-amber-700 text-amber-200 hover:bg-amber-800 transition-colors"
            >
              Initiate Model Review
            </button>
            <button
              onClick={() => showToast('Override report download started.')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Download Override Report
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Governance</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Decision audit log, model performance metrics, consistency checks, and version history
          </p>
        </div>
        {consistencyFails > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-900/40 border border-red-700 text-red-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            {consistencyFails} consistency failure{consistencyFails > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Metrics dashboard cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Override Rate',           value: `${overrideRate}%`,       sub: `${overrideCount} of ${totalDecisions} decisions`,  color: overrideRate > 20 ? 'text-amber-400' : 'text-gray-100' },
          { label: 'Avg. Confidence',         value: `${avgConfidence}%`,      sub: 'Across all modules',                                color: avgConfidence >= 80 ? 'text-emerald-400' : avgConfidence >= 65 ? 'text-amber-400' : 'text-red-400' },
          { label: 'Below-Threshold Rate',    value: `${belowThresholdRate}%`, sub: `${belowThreshold} entries < 75% confidence`,        color: belowThresholdRate > 15 ? 'text-amber-400' : 'text-gray-100' },
          { label: 'Hallucination Rate',      value: `${HALLUCINATION_RATE}%`, sub: 'Estimated on test set',                             color: HALLUCINATION_RATE > 2 ? 'text-red-400' : 'text-emerald-400' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-600 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Per-Module Performance Comparison Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">Module Performance Comparison</h2>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/80">
              {['Module', 'Decisions', 'Avg Confidence', 'Override Rate', 'Below Threshold %', 'Status'].map((h) => (
                <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULE_PERFORMANCE.map((m) => (
              <tr key={m.module} className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
                <td className="py-3 px-4">
                  <span className="text-xs bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {m.module}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-gray-200 font-semibold">{m.decisions.toLocaleString()}</td>
                <td className="py-3 px-4">
                  <ConfidenceBarPct value={m.avgConfidence} />
                </td>
                <td className="py-3 px-4">
                  <span className={`text-sm font-semibold ${m.overrideRate > 25 ? 'text-red-400' : 'text-gray-200'}`}>
                    {m.overrideRate}%
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-gray-400">{m.belowThreshold}%</td>
                <td className="py-3 px-4">
                  {m.status === 'OK' ? (
                    <span className="text-xs font-semibold text-emerald-400">OK</span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-400">Review</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['log', 'consistency', 'versions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === t ? 'bg-[#0A1628] text-[#C9A84C]' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {t === 'log' ? 'Decision Log' : t === 'consistency' ? 'Consistency Checks' : 'Version History'}
          </button>
        ))}
      </div>

      {/* ── Decision Log ────────────────────────────────────── */}
      {activeTab === 'log' && (
        <div>
          {/* Module filter chips */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {ALL_MODULES.map((m) => (
              <button
                key={m}
                onClick={() => setActiveModule(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  activeModule === m
                    ? 'bg-[#0A1628] border-[#C9A84C] text-[#C9A84C]'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {m === 'all' ? 'All Modules' : m}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/80">
                  {['Module', 'Type', 'Entity', 'Confidence', 'Model', 'Time', 'Override', ''].map((h) => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLog.map((entry) => (
                  <tbody key={entry.id}>
                    <tr
                      className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition-colors"
                      onClick={() => toggleRow(entry.id)}
                    >
                      <td className="py-3 px-4">
                        <span className="text-xs bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {entry.module}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border capitalize ${DECISION_TYPE_BADGE[entry.type]}`}>
                          {entry.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-200">{entry.entityName}</td>
                      <td className="py-3 px-4">
                        <ConfidenceBar value={entry.confidence} />
                      </td>
                      <td className="py-3 px-4">
                        <code className="text-xs font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{entry.modelVersion}</code>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{fmtTs(entry.timestamp)}</td>
                      <td className="py-3 px-4">
                        {entry.overridden ? (
                          <span className="text-xs text-amber-400 font-semibold">Overridden</span>
                        ) : (
                          <span className="text-xs text-gray-700">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {entry.flaggedLow && <span className="text-red-400 font-bold">&#9888;</span>}
                        {expandedRows.has(entry.id) ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expandedRows.has(entry.id) && (
                      <tr className="border-b border-gray-800 bg-gray-900/60">
                        <td colSpan={8} className="px-6 py-4">
                          {/* Model Info */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                            {[
                              { label: 'Module', val: entry.module },
                              { label: 'Version', val: entry.modelVersion },
                              { label: 'Model Type', val: entry.modelType },
                              { label: 'Confidence', val: `${Math.round(entry.confidence * 100)}%` },
                              { label: 'Latency', val: `${entry.latencyMs}ms` },
                            ].map(({ label, val }) => (
                              <div key={label} className="bg-gray-800/60 rounded-lg px-3 py-2">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                                <p className="text-xs text-gray-200 font-semibold mt-0.5">{val}</p>
                              </div>
                            ))}
                          </div>

                          {/* Input / Output Snapshot */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                            <div className="bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2">
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Input Snapshot</p>
                              <p className="text-xs text-gray-300 font-mono">{entry.inputSnapshot}</p>
                            </div>
                            <div className="bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2">
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Output Snapshot</p>
                              <p className="text-xs text-gray-300 font-mono">{entry.outputSnapshot}</p>
                            </div>
                          </div>

                          {/* Decision Detail */}
                          <p className="text-xs text-gray-400 leading-relaxed mb-3">
                            <span className="font-semibold text-gray-300">Decision detail: </span>
                            {entry.details}
                          </p>

                          {/* Override Record */}
                          {entry.overridden && (
                            <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg px-3 py-2 mb-3">
                              <p className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold mb-1">Override Record</p>
                              <p className="text-xs text-amber-200">{entry.overrideReason || 'No reason documented.'}</p>
                              {!entry.overrideDocumented && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); showToast('Override documentation form opened.'); }}
                                  className="mt-2 px-3 py-1 rounded-lg text-[11px] font-semibold bg-amber-900 border border-amber-700 text-amber-200 hover:bg-amber-800 transition-colors"
                                >
                                  Document Now
                                </button>
                              )}
                            </div>
                          )}

                          {/* Low Confidence Warning */}
                          {entry.confidence < 0.75 && (
                            <div className="bg-red-950/30 border border-red-800/50 rounded-lg px-3 py-2">
                              <p className="text-xs text-red-400 font-semibold mb-1">
                                Low-confidence warning: {Math.round(entry.confidence * 100)}% is below the 75% threshold
                              </p>
                              <button
                                onClick={(e) => { e.stopPropagation(); showToast(`Decision ${entry.id} flagged for human review.`); }}
                                className="mt-1 px-3 py-1 rounded-lg text-[11px] font-semibold bg-red-900 border border-red-700 text-red-200 hover:bg-red-800 transition-colors"
                              >
                                Flag for Human Review
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                ))}
              </tbody>
            </table>
            <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
              Decision log retained 3 years per AI governance policy. All override events include advisor ID for audit trail.
            </div>
          </div>
        </div>
      )}

      {/* ── Consistency Checks ──────────────────────────────── */}
      {activeTab === 'consistency' && (
        <div>
          {/* Header summary */}
          <div className="flex items-center gap-3 mb-4">
            {consistencyFails > 0 ? (
              <span className="text-sm font-semibold text-red-400">
                {consistencyFails} failure{consistencyFails > 1 ? 's' : ''} of {consistencyTotal} checks
              </span>
            ) : (
              <span className="text-sm font-semibold text-emerald-400">
                All {consistencyTotal} checks passing
              </span>
            )}
          </div>

          <div className="space-y-3">
            {CONSISTENCY_CHECKS.map((check) => {
              const cfg = CONSISTENCY_CONFIG[check.result];
              const isExpanded = expandedChecks.has(check.id);
              const isFailed = check.result === 'fail';
              return (
                <div
                  key={check.id}
                  className={`rounded-xl border p-4 ${
                    check.result === 'fail' ? 'border-red-800 bg-red-950/30' :
                    check.result === 'warn' ? 'border-amber-800 bg-amber-950/20' :
                    'border-gray-800 bg-gray-900'
                  } ${isFailed ? 'cursor-pointer' : ''}`}
                  onClick={() => isFailed && toggleCheck(check.id)}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                        {cfg.icon} {check.result.toUpperCase()}
                      </span>
                      <span className="text-xs bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full">
                        {check.module}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 whitespace-nowrap">{fmtDate(check.lastRun)}</span>
                      {isFailed && (
                        <span className="text-xs text-gray-500">{isExpanded ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </div>

                  <p className="font-semibold text-sm text-gray-100 mb-1">{check.checkName}</p>
                  <p className="text-xs text-gray-400 mb-3">{check.description}</p>

                  <div className="flex gap-4 text-xs text-gray-500">
                    <span><span className="text-gray-300 font-semibold">{check.runsCompared}</span> runs compared</span>
                    <span>
                      Divergence:{' '}
                      <span className={`font-semibold ${
                        check.divergence < 3 ? 'text-emerald-400' :
                        check.divergence < 7 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {check.divergence}%
                      </span>
                    </span>
                  </div>

                  {/* Expanded failure detail */}
                  {isFailed && isExpanded && check.failureDetail && (
                    <div className="mt-4 pt-4 border-t border-red-800/50">
                      <p className="text-[10px] text-red-400 uppercase tracking-wide font-semibold mb-2">Failure Detail</p>
                      <p className="text-xs text-gray-300 leading-relaxed mb-4">{check.failureDetail}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); showToast(`Investigation started for "${check.checkName}".`); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-900 border border-red-700 text-red-200 hover:bg-red-800 transition-colors"
                        >
                          Investigate
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); showToast(`Re-running "${check.checkName}"...`); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors"
                        >
                          Re-run
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); showToast(`Auto-fix initiated for "${check.checkName}".`); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-900 border border-amber-700 text-amber-200 hover:bg-amber-800 transition-colors"
                        >
                          Auto-Fix
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Version History ─────────────────────────────────── */}
      {activeTab === 'versions' && (
        <div className="space-y-8">
          {Object.entries(versionsByModule).map(([moduleName, versions]) => (
            <div key={moduleName}>
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <span className="text-xs bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full">
                  {moduleName}
                </span>
              </h3>
              <div className="space-y-3">
                {versions.map((v) => {
                  const isCurrent = v.status === 'active';
                  return (
                    <div
                      key={`${v.module}_${v.version}`}
                      className={`rounded-xl border p-4 ${
                        isCurrent
                          ? 'border-[#C9A84C]/40 bg-[#0A1628]/50'
                          : 'border-gray-800 bg-gray-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-sm font-mono font-bold text-[#C9A84C]">{v.version}</code>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${VERSION_STATUS_BADGE[v.status]}`}>
                            {v.status}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30">
                              CURRENT
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-500">{fmtDate(v.deployedAt)}</p>
                            <p className="text-[11px] text-gray-600">Approved by {v.approvedBy}</p>
                          </div>
                          {!isCurrent && v.status !== 'testing' && (
                            <button
                              onClick={() => showToast(`Rollback to ${v.version} initiated for ${v.module}. Awaiting compliance approval.`)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600 transition-colors whitespace-nowrap"
                            >
                              Rollback to {v.version}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex gap-4 mb-3 text-xs text-gray-500">
                        <span>Avg Confidence: <span className={`font-semibold ${v.avgConfidence >= 80 ? 'text-emerald-400' : v.avgConfidence >= 65 ? 'text-amber-400' : 'text-red-400'}`}>{v.avgConfidence}%</span></span>
                        <span>Override Rate: <span className={`font-semibold ${v.overrideRate > 25 ? 'text-red-400' : 'text-gray-300'}`}>{v.overrideRate}%</span></span>
                      </div>

                      <ul className="space-y-1">
                        {v.changes.map((c) => (
                          <li key={c} className="text-xs text-gray-400 flex items-start gap-1.5">
                            <span className="text-[#C9A84C] mt-0.5 flex-shrink-0">&#8250;</span>
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="p-4 rounded-xl border border-gray-800 bg-gray-900 text-xs text-gray-500">
            All model version changes require compliance officer sign-off before production deployment.
            Version history retained indefinitely for regulatory audit purposes.
          </div>
        </div>
      )}
    </div>
  );
}
