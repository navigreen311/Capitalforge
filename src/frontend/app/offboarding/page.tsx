'use client';

// ============================================================
// /offboarding — Offboarding Orchestrator
// Active workflows table (client/tenant), status progress bars,
// data export/deletion status, retention schedule view,
// initiate offboarding modal, exit interview summary panel.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OffboardingType   = 'client' | 'tenant';
type OffboardingStatus = 'pending' | 'in_progress' | 'export_ready' | 'deletion_queued' | 'complete';
type DataStepStatus    = 'pending' | 'running' | 'done' | 'failed';

interface DataStep {
  label:  string;
  status: DataStepStatus;
}

interface OffboardingWorkflow {
  id:          string;
  type:        OffboardingType;
  entityName:  string;
  initiatedAt: string;
  dueDate:     string;
  status:      OffboardingStatus;
  progressPct: number;
  exportStep:  DataStepStatus;
  deletionStep: DataStepStatus;
  dataSteps:   DataStep[];
  assignee:    string;
}

interface RetentionRule {
  dataClass:     string;
  retentionYears: number;
  legalBasis:    string;
  deleteAfter:   string;
}

interface ExitSummary {
  entityName:  string;
  type:        OffboardingType;
  npsScore:    number | null;
  reasons:     string[];
  notes:       string;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_WORKFLOWS: OffboardingWorkflow[] = [
  {
    id: 'ob_001',
    type: 'client',
    entityName: 'Apex Ventures LLC',
    initiatedAt: '2026-03-20',
    dueDate: '2026-04-20',
    status: 'in_progress',
    progressPct: 55,
    exportStep: 'done',
    deletionStep: 'pending',
    assignee: 'Sarah Chen',
    dataSteps: [
      { label: 'Consent revocation',      status: 'done'    },
      { label: 'Document export package', status: 'done'    },
      { label: 'PII anonymization',       status: 'running' },
      { label: 'Credit file purge',       status: 'pending' },
      { label: 'Audit log archival',      status: 'pending' },
    ],
  },
  {
    id: 'ob_002',
    type: 'tenant',
    entityName: 'NovaBridge Capital (Tenant)',
    initiatedAt: '2026-03-15',
    dueDate: '2026-04-15',
    status: 'export_ready',
    progressPct: 75,
    exportStep: 'done',
    deletionStep: 'running',
    assignee: 'Marcus Webb',
    dataSteps: [
      { label: 'Client data export',     status: 'done'    },
      { label: 'API key revocation',     status: 'done'    },
      { label: 'Webhook cleanup',        status: 'done'    },
      { label: 'Database partition wipe', status: 'running' },
      { label: 'DNS / CNAME teardown',   status: 'pending' },
    ],
  },
  {
    id: 'ob_003',
    type: 'client',
    entityName: 'Horizon Retail Partners',
    initiatedAt: '2026-03-28',
    dueDate: '2026-04-28',
    status: 'pending',
    progressPct: 10,
    exportStep: 'pending',
    deletionStep: 'pending',
    assignee: 'Alex Morgan',
    dataSteps: [
      { label: 'Consent revocation',      status: 'running' },
      { label: 'Document export package', status: 'pending' },
      { label: 'PII anonymization',       status: 'pending' },
      { label: 'Credit file purge',       status: 'pending' },
      { label: 'Audit log archival',      status: 'pending' },
    ],
  },
  {
    id: 'ob_004',
    type: 'client',
    entityName: 'Summit Capital Group',
    initiatedAt: '2026-02-10',
    dueDate: '2026-03-10',
    status: 'complete',
    progressPct: 100,
    exportStep: 'done',
    deletionStep: 'done',
    assignee: 'Sarah Chen',
    dataSteps: [
      { label: 'Consent revocation',      status: 'done' },
      { label: 'Document export package', status: 'done' },
      { label: 'PII anonymization',       status: 'done' },
      { label: 'Credit file purge',       status: 'done' },
      { label: 'Audit log archival',      status: 'done' },
    ],
  },
];

const RETENTION_RULES: RetentionRule[] = [
  { dataClass: 'Loan application records',    retentionYears: 7,  legalBasis: 'ECOA / Reg B',           deleteAfter: '2033-01-01' },
  { dataClass: 'KYB/KYC identity documents',  retentionYears: 5,  legalBasis: 'BSA / AML',              deleteAfter: '2031-06-01' },
  { dataClass: 'Consent & disclosure records', retentionYears: 3, legalBasis: 'TCPA / state law',       deleteAfter: '2029-01-01' },
  { dataClass: 'Communication transcripts',   retentionYears: 3,  legalBasis: 'CFPB exam readiness',    deleteAfter: '2029-06-01' },
  { dataClass: 'Adverse action notices',      retentionYears: 2,  legalBasis: 'FCRA',                   deleteAfter: '2028-01-01' },
  { dataClass: 'Billing & fee records',       retentionYears: 7,  legalBasis: 'IRS / state tax',        deleteAfter: '2033-06-01' },
  { dataClass: 'AI decision logs',            retentionYears: 3,  legalBasis: 'Internal governance',    deleteAfter: '2029-01-01' },
];

const EXIT_SUMMARIES: ExitSummary[] = [
  {
    entityName:  'Summit Capital Group',
    type:        'client',
    npsScore:    8,
    reasons:     ['Found alternative funding solution', 'Business closed credit-stacking program'],
    notes:       'Client expressed satisfaction with service but is pivoting strategy. Likely to return in 12–18 months.',
    completedAt: '2026-03-10',
  },
  {
    entityName:  'Blue Ridge Consulting',
    type:        'client',
    npsScore:    4,
    reasons:     ['Pricing concerns', 'Competitor offer'],
    notes:       'Client cited cost as primary driver. Follow-up offer declined. High churn risk segment.',
    completedAt: '2026-02-18',
  },
  {
    entityName:  'OakTree Capital (Tenant)',
    type:        'tenant',
    npsScore:    null,
    reasons:     ['Platform consolidation', 'M&A — acquired by larger firm'],
    notes:       'Tenant offboarding due to acquisition. No service complaints. Data migration completed to acquirer.',
    completedAt: '2026-01-30',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<OffboardingStatus, { label: string; badge: string; bar: string }> = {
  pending:          { label: 'Pending',         badge: 'bg-gray-800 text-gray-400 border-gray-700',          bar: 'bg-gray-600'    },
  in_progress:      { label: 'In Progress',     badge: 'bg-blue-900 text-blue-300 border-blue-700',           bar: 'bg-blue-500'    },
  export_ready:     { label: 'Export Ready',    badge: 'bg-amber-900 text-amber-300 border-amber-700',        bar: 'bg-amber-500'   },
  deletion_queued:  { label: 'Deletion Queued', badge: 'bg-orange-900 text-orange-300 border-orange-700',     bar: 'bg-orange-500'  },
  complete:         { label: 'Complete',        badge: 'bg-emerald-900 text-emerald-300 border-emerald-700',  bar: 'bg-emerald-500' },
};

const STEP_CONFIG: Record<DataStepStatus, { dot: string; label: string }> = {
  pending: { dot: 'bg-gray-600',    label: 'Pending' },
  running: { dot: 'bg-blue-400 animate-pulse', label: 'Running' },
  done:    { dot: 'bg-emerald-400', label: 'Done'    },
  failed:  { dot: 'bg-red-400',    label: 'Failed'  },
};

const TYPE_BADGE: Record<OffboardingType, string> = {
  client: 'bg-indigo-900 text-indigo-300 border-indigo-700',
  tenant: 'bg-purple-900 text-purple-300 border-purple-700',
};

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

function DataStepBadge({ status }: { status: DataStepStatus }) {
  const cfg = STEP_CONFIG[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function WorkflowRow({ wf, onExpand, expanded }: { wf: OffboardingWorkflow; onExpand: () => void; expanded: boolean }) {
  const sc = STATUS_CONFIG[wf.status];
  return (
    <>
      <tr
        className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition-colors"
        onClick={onExpand}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[wf.type]}`}>
              {wf.type}
            </span>
            <span className="text-sm font-medium text-gray-100">{wf.entityName}</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.badge}`}>
            {sc.label}
          </span>
        </td>
        <td className="py-3 px-4 w-40">
          <ProgressBar pct={wf.progressPct} color={sc.bar} />
        </td>
        <td className="py-3 px-4">
          <DataStepBadge status={wf.exportStep} />
        </td>
        <td className="py-3 px-4">
          <DataStepBadge status={wf.deletionStep} />
        </td>
        <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(wf.initiatedAt)}</td>
        <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(wf.dueDate)}</td>
        <td className="py-3 px-4 text-xs text-gray-400">{wf.assignee}</td>
        <td className="py-3 px-4 text-gray-500 text-xs">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-800 bg-gray-900/60">
          <td colSpan={9} className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Data Processing Steps</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {wf.dataSteps.map((step) => {
                const cfg = STEP_CONFIG[step.status];
                return (
                  <div key={step.label} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <span className="text-xs text-gray-300">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Initiate Offboarding Modal
function InitiateModal({ onClose }: { onClose: () => void }) {
  const [type, setType]       = useState<OffboardingType>('client');
  const [entity, setEntity]   = useState('');
  const [reason, setReason]   = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    if (!entity.trim()) return;
    setSubmitted(true);
    setTimeout(onClose, 1400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Initiate Offboarding</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        {submitted ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-900 border border-emerald-600 flex items-center justify-center mx-auto mb-3">
              <span className="text-emerald-400 text-xl">&#10003;</span>
            </div>
            <p className="text-sm font-semibold text-emerald-300">Offboarding workflow created</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Type selector */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block font-medium uppercase tracking-wide">Offboarding Type</label>
              <div className="flex gap-2">
                {(['client', 'tenant'] as OffboardingType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      type === t
                        ? 'bg-[#0A1628] border-[#C9A84C] text-[#C9A84C]'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">
                {type === 'client' ? 'Client Name' : 'Tenant Name'}
              </label>
              <input
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder={type === 'client' ? 'e.g. Apex Ventures LLC' : 'e.g. NovaBridge Capital'}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Reason / Notes</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Reason for offboarding (optional)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none"
              />
            </div>

            <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-700/40 text-xs text-amber-300">
              This will create a staged workflow: export &rarr; anonymization &rarr; deletion, subject to retention schedule.
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={submit}
                className="flex-1 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors"
              >
                Create Workflow
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OffboardingPage() {
  const [workflows] = useState<OffboardingWorkflow[]>(PLACEHOLDER_WORKFLOWS);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [showModal, setShowModal]         = useState(false);
  const [activeTab, setActiveTab]         = useState<'workflows' | 'retention' | 'exit'>('workflows');

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const active    = workflows.filter((w) => w.status !== 'complete');
  const completed = workflows.filter((w) => w.status === 'complete');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {showModal && <InitiateModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Offboarding Orchestrator</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {active.length} active workflow{active.length !== 1 ? 's' : ''} &middot; {completed.length} completed
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors"
        >
          + Initiate Offboarding
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active',    value: active.length,                                          color: 'text-blue-400'    },
          { label: 'Pending',   value: workflows.filter((w) => w.status === 'pending').length, color: 'text-gray-300'    },
          { label: 'In Progress', value: workflows.filter((w) => w.status === 'in_progress').length, color: 'text-blue-300' },
          { label: 'Completed', value: completed.length,                                       color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['workflows', 'retention', 'exit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === t ? 'bg-[#0A1628] text-[#C9A84C]' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {t === 'workflows' ? 'Active Workflows' : t === 'retention' ? 'Retention Schedule' : 'Exit Interviews'}
          </button>
        ))}
      </div>

      {/* ── Workflows tab ───────────────────────────────────── */}
      {activeTab === 'workflows' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                {['Entity', 'Status', 'Progress', 'Export', 'Deletion', 'Initiated', 'Due', 'Assignee', ''].map((h) => (
                  <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <WorkflowRow
                  key={wf.id}
                  wf={wf}
                  expanded={expandedId === wf.id}
                  onExpand={() => toggle(wf.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Retention Schedule tab ─────────────────────────── */}
      {activeTab === 'retention' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-200">Data Retention Schedule</p>
            <span className="text-xs text-gray-500">Periods per regulatory requirement</span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                {['Data Class', 'Retention', 'Legal Basis', 'Delete After'].map((h) => (
                  <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RETENTION_RULES.map((rule) => (
                <tr key={rule.dataClass} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-3 px-4 text-sm text-gray-100 font-medium">{rule.dataClass}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full font-semibold">
                      {rule.retentionYears}yr
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-400">{rule.legalBasis}</td>
                  <td className="py-3 px-4 text-xs text-gray-500">{rule.deleteAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
            Retention periods are enforced automatically at workflow completion. Early deletion requests require compliance officer approval.
          </div>
        </div>
      )}

      {/* ── Exit Interviews tab ─────────────────────────────── */}
      {activeTab === 'exit' && (
        <div className="space-y-4">
          {EXIT_SUMMARIES.map((ex) => (
            <div key={ex.entityName} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[ex.type]}`}>
                    {ex.type}
                  </span>
                  <p className="text-sm font-semibold text-gray-100">{ex.entityName}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {ex.npsScore !== null ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">NPS</span>
                      <span className={`text-lg font-black ${
                        ex.npsScore >= 7 ? 'text-emerald-400' : ex.npsScore >= 5 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {ex.npsScore}
                      </span>
                      <span className="text-xs text-gray-600">/10</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-600">No NPS score</span>
                  )}
                  <span className="text-xs text-gray-600">{fmtDate(ex.completedAt)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {ex.reasons.map((r) => (
                  <span key={r} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">
                    {r}
                  </span>
                ))}
              </div>

              <p className="text-xs text-gray-400 leading-relaxed bg-gray-800/50 rounded-lg px-3 py-2">
                {ex.notes}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
