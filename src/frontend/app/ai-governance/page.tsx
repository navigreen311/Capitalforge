'use client';

// ============================================================
// /ai-governance — AI Governance Dashboard
// Decision log table (module, type, confidence, model version),
// metrics dashboard cards (override rate, avg confidence,
// below-threshold rate, hallucination rate), consistency check
// results, version history timeline.
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
  entityName:   string;
  timestamp:    string;
  overridden:   boolean;
  flaggedLow:   boolean;
  details:      string;
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
}

interface ModelVersion {
  version:     string;
  module:      string;
  deployedAt:  string;
  status:      'active' | 'deprecated' | 'testing';
  changes:     string[];
  approvedBy:  string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const DECISION_LOG: DecisionLogEntry[] = [
  {
    id: 'dl_001', module: 'Credit Underwriter', type: 'approval', confidence: 0.92,
    modelVersion: 'v3.2.1', entityName: 'Apex Ventures LLC', timestamp: '2026-03-31T10:15:00Z',
    overridden: false, flaggedLow: false,
    details: 'Approved $120K MCA based on 18-month cash flow trend and 720+ credit score.',
  },
  {
    id: 'dl_002', module: 'KYB Extractor', type: 'extraction', confidence: 0.71,
    modelVersion: 'v2.4.0', entityName: 'BlueStar Logistics', timestamp: '2026-03-31T09:45:00Z',
    overridden: false, flaggedLow: true,
    details: 'Extracted beneficial ownership from Secretary of State filing. Confidence below 0.75 — manual review triggered.',
  },
  {
    id: 'dl_003', module: 'Credit Underwriter', type: 'denial', confidence: 0.88,
    modelVersion: 'v3.2.1', entityName: 'Crestline Medical LLC', timestamp: '2026-03-30T16:30:00Z',
    overridden: true, flaggedLow: false,
    details: 'Denial recommended on cash flow grounds. Advisor overrode — collateral override applied.',
  },
  {
    id: 'dl_004', module: 'Compliance Screener', type: 'flag', confidence: 0.95,
    modelVersion: 'v1.8.3', entityName: 'Summit Capital Group', timestamp: '2026-03-30T14:00:00Z',
    overridden: false, flaggedLow: false,
    details: 'OFAC watchlist match flagged for analyst review. High confidence; no false positive indicators.',
  },
  {
    id: 'dl_005', module: 'Product Recommender', type: 'recommendation', confidence: 0.67,
    modelVersion: 'v1.1.0', entityName: 'Harbor Street Foods', timestamp: '2026-03-30T11:20:00Z',
    overridden: true, flaggedLow: true,
    details: 'Recommended SBA 7(a) path. Advisor overrode to equipment financing — client preference.',
  },
  {
    id: 'dl_006', module: 'Document Classifier', type: 'extraction', confidence: 0.84,
    modelVersion: 'v2.0.1', entityName: 'NovaTech Solutions Inc.', timestamp: '2026-03-29T15:00:00Z',
    overridden: false, flaggedLow: false,
    details: 'Bank statements classified correctly. 3-month average revenue extracted.',
  },
  {
    id: 'dl_007', module: 'Credit Underwriter', type: 'approval', confidence: 0.78,
    modelVersion: 'v3.2.1', entityName: 'Keystone Retail Co.', timestamp: '2026-03-29T13:45:00Z',
    overridden: false, flaggedLow: false,
    details: 'Approved $85K term loan. Confidence moderate — 2-year thin file.',
  },
  {
    id: 'dl_008', module: 'Compliance Screener', type: 'flag', confidence: 0.48,
    modelVersion: 'v1.8.3', entityName: 'Ridgeline Partners LLC', timestamp: '2026-03-28T10:00:00Z',
    overridden: true, flaggedLow: true,
    details: 'Potential adverse media match. Analyst reviewed — false positive confirmed. Override applied.',
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
    status: 'active', approvedBy: 'Marcus Webb',
    changes: ['Improved cash flow trend weighting', 'Reduced false-positive denial rate by 4%', 'Confidence calibration fix'],
  },
  {
    version: 'v3.1.0', module: 'Credit Underwriter', deployedAt: '2026-02-01',
    status: 'deprecated', approvedBy: 'Alex Morgan',
    changes: ['Initial thin-file handling', 'Seasonal revenue normalization'],
  },
  {
    version: 'v2.4.0', module: 'KYB Extractor', deployedAt: '2026-03-20',
    status: 'active', approvedBy: 'Sarah Chen',
    changes: ['Added multi-state filing support', 'Beneficial owner regex improvements'],
  },
  {
    version: 'v1.8.3', module: 'Compliance Screener', deployedAt: '2026-03-01',
    status: 'active', approvedBy: 'Marcus Webb',
    changes: ['OFAC list refresh March 2026', 'Fuzzy name match threshold tuned to 0.85'],
  },
  {
    version: 'v1.1.0', module: 'Product Recommender', deployedAt: '2026-01-10',
    status: 'testing', approvedBy: 'Alex Morgan',
    changes: ['New SBA product categories', 'Equity alternative path added'],
  },
  {
    version: 'v2.0.1', module: 'Document Classifier', deployedAt: '2026-02-20',
    status: 'active', approvedBy: 'Sarah Chen',
    changes: ['Bank statement template v2 support', 'Reduced misclassification on tax transcripts'],
  },
];

const HALLUCINATION_RATE = 1.4; // percent

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

function ConfidenceBar({ value }: { value: number }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 65 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${pct >= 80 ? 'text-emerald-400' : pct >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AiGovernancePage() {
  const [activeTab, setActiveTab]     = useState<'log' | 'consistency' | 'versions'>('log');
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const modules = Array.from(new Set(DECISION_LOG.map((d) => d.module)));

  const filteredLog = moduleFilter === 'all'
    ? DECISION_LOG
    : DECISION_LOG.filter((d) => d.module === moduleFilter);

  // Metrics
  const totalDecisions     = DECISION_LOG.length;
  const overrideCount      = DECISION_LOG.filter((d) => d.overridden).length;
  const overrideRate       = totalDecisions ? Math.round((overrideCount / totalDecisions) * 100) : 0;
  const avgConfidence      = totalDecisions
    ? Math.round((DECISION_LOG.reduce((s, d) => s + d.confidence, 0) / totalDecisions) * 100)
    : 0;
  const belowThreshold     = DECISION_LOG.filter((d) => d.confidence < 0.75).length;
  const belowThresholdRate = totalDecisions ? Math.round((belowThreshold / totalDecisions) * 100) : 0;

  const consistencyFails = CONSISTENCY_CHECKS.filter((c) => c.result === 'fail').length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
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
          {/* Module filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {['all', ...modules].map((m) => (
              <button
                key={m}
                onClick={() => setModuleFilter(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  moduleFilter === m
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
                  <>
                    <tr
                      key={entry.id}
                      className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition-colors"
                      onClick={() => setExpandedId((prev) => prev === entry.id ? null : entry.id)}
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
                        {expandedId === entry.id ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expandedId === entry.id && (
                      <tr key={`${entry.id}_exp`} className="border-b border-gray-800 bg-gray-900/60">
                        <td colSpan={8} className="px-6 py-3">
                          <p className="text-xs text-gray-400 leading-relaxed">
                            <span className="font-semibold text-gray-300">Decision detail: </span>
                            {entry.details}
                          </p>
                          {entry.flaggedLow && (
                            <p className="text-xs text-red-400 mt-1.5">
                              Low-confidence flag: confidence {Math.round(entry.confidence * 100)}% is below the 75% threshold — manual review recommended.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
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
        <div className="space-y-3">
          {CONSISTENCY_CHECKS.map((check) => {
            const cfg = CONSISTENCY_CONFIG[check.result];
            return (
              <div
                key={check.id}
                className={`rounded-xl border p-4 ${
                  check.result === 'fail' ? 'border-red-800 bg-red-950/30' :
                  check.result === 'warn' ? 'border-amber-800 bg-amber-950/20' :
                  'border-gray-800 bg-gray-900'
                }`}
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
                  <span className="text-xs text-gray-600 whitespace-nowrap">{fmtDate(check.lastRun)}</span>
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
              </div>
            );
          })}
        </div>
      )}

      {/* ── Version History ─────────────────────────────────── */}
      {activeTab === 'versions' && (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-6 bottom-6 w-px bg-gray-800" />

          <div className="space-y-6">
            {VERSION_HISTORY.map((v, idx) => (
              <div key={`${v.module}_${v.version}`} className="relative flex gap-5">
                {/* Timeline dot */}
                <div className={`relative z-10 mt-4 flex-shrink-0 w-3 h-3 rounded-full border-2 border-gray-950 ${
                  v.status === 'active' ? 'bg-emerald-400' :
                  v.status === 'testing' ? 'bg-amber-400' : 'bg-gray-600'
                }`} />

                <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-mono font-bold text-[#C9A84C]">{v.version}</code>
                      <span className="text-xs bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full">
                        {v.module}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${VERSION_STATUS_BADGE[v.status]}`}>
                        {v.status}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500">{fmtDate(v.deployedAt)}</p>
                      <p className="text-[11px] text-gray-600">Approved by {v.approvedBy}</p>
                    </div>
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
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 rounded-xl border border-gray-800 bg-gray-900 text-xs text-gray-500">
            All model version changes require compliance officer sign-off before production deployment.
            Version history retained indefinitely for regulatory audit purposes.
          </div>
        </div>
      )}
    </div>
  );
}
