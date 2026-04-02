'use client';

// ============================================================
// /offboarding — Offboarding Orchestrator
// Active workflows table (client/tenant), status progress bars,
// data export/deletion status, retention schedule view,
// initiate offboarding modal, exit interview summary panel,
// workflow detail drawer, SLA badges, interview analytics.
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TODAY = new Date('2026-04-02');

const PLACEHOLDER_USERS = ['Sarah Chen', 'Marcus Webb', 'Alex Morgan', 'Priya Patel', 'James Nguyen'];

const PLACEHOLDER_ENTITIES = [
  'Apex Ventures LLC',
  'NovaBridge Capital',
  'Horizon Retail Partners',
  'BlueStar Holdings',
  'Meridian Finance Group',
];

const REASON_TAG_OPTIONS = [
  'Pricing', 'Competitor', 'Business closed', 'Alternative funding',
  'M&A', 'Platform consolidation', 'Personal', 'Regulatory', 'Other',
];

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
  exportDownloaded?: boolean;
}

interface RetentionRule {
  dataClass:      string;
  retentionYears: number;
  legalBasis:     string;
  deleteAfter:    string;
}

interface ExitSummary {
  id:            string;
  entityName:    string;
  type:          OffboardingType;
  npsScore:      number | null;
  reasons:       string[];
  notes:         string;
  completedAt:   string;
  reEngagement?: boolean;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const INITIAL_WORKFLOWS: OffboardingWorkflow[] = [
  {
    id: 'ob_001', type: 'client', entityName: 'Apex Ventures LLC',
    initiatedAt: '2026-03-20', dueDate: '2026-04-20', status: 'in_progress',
    progressPct: 55, exportStep: 'done', deletionStep: 'pending', assignee: 'Sarah Chen',
    dataSteps: [
      { label: 'Consent revocation',      status: 'done'    },
      { label: 'Document export package', status: 'done'    },
      { label: 'PII anonymization',       status: 'running' },
      { label: 'Credit file purge',       status: 'pending' },
      { label: 'Audit log archival',      status: 'pending' },
    ],
  },
  {
    id: 'ob_002', type: 'tenant', entityName: 'NovaBridge Capital (Tenant)',
    initiatedAt: '2026-03-15', dueDate: '2026-04-14', status: 'export_ready',
    progressPct: 75, exportStep: 'done', deletionStep: 'running', assignee: 'Marcus Webb',
    dataSteps: [
      { label: 'Client data export',      status: 'done'    },
      { label: 'API key revocation',      status: 'done'    },
      { label: 'Webhook cleanup',         status: 'done'    },
      { label: 'Database partition wipe', status: 'running' },
      { label: 'DNS / CNAME teardown',    status: 'pending' },
    ],
  },
  {
    id: 'ob_003', type: 'client', entityName: 'Horizon Retail Partners',
    initiatedAt: '2026-03-28', dueDate: '2026-04-05', status: 'pending',
    progressPct: 10, exportStep: 'pending', deletionStep: 'pending', assignee: 'Alex Morgan',
    dataSteps: [
      { label: 'Consent revocation',      status: 'running' },
      { label: 'Document export package', status: 'pending' },
      { label: 'PII anonymization',       status: 'pending' },
      { label: 'Credit file purge',       status: 'pending' },
      { label: 'Audit log archival',      status: 'pending' },
    ],
  },
  {
    id: 'ob_004', type: 'client', entityName: 'Summit Capital Group',
    initiatedAt: '2026-02-10', dueDate: '2026-03-10', status: 'complete',
    progressPct: 100, exportStep: 'done', deletionStep: 'done', assignee: 'Sarah Chen',
    dataSteps: [
      { label: 'Consent revocation',      status: 'done' },
      { label: 'Document export package', status: 'done' },
      { label: 'PII anonymization',       status: 'done' },
      { label: 'Credit file purge',       status: 'done' },
      { label: 'Audit log archival',      status: 'done' },
    ],
  },
];

const INITIAL_RETENTION: RetentionRule[] = [
  { dataClass: 'Loan application records',    retentionYears: 7,  legalBasis: 'ECOA / Reg B',        deleteAfter: '2033-01-01' },
  { dataClass: 'KYB/KYC identity documents',  retentionYears: 5,  legalBasis: 'BSA / AML',           deleteAfter: '2031-06-01' },
  { dataClass: 'Consent & disclosure records', retentionYears: 3,  legalBasis: 'TCPA / state law',    deleteAfter: '2029-01-01' },
  { dataClass: 'Communication transcripts',   retentionYears: 3,  legalBasis: 'CFPB exam readiness', deleteAfter: '2029-06-01' },
  { dataClass: 'Adverse action notices',      retentionYears: 2,  legalBasis: 'FCRA',                deleteAfter: '2028-01-01' },
  { dataClass: 'Billing & fee records',       retentionYears: 7,  legalBasis: 'IRS / state tax',     deleteAfter: '2033-06-01' },
  { dataClass: 'AI decision logs',            retentionYears: 3,  legalBasis: 'Internal governance', deleteAfter: '2029-01-01' },
];

const INITIAL_EXITS: ExitSummary[] = [
  {
    id: 'ex_001', entityName: 'Summit Capital Group', type: 'client', npsScore: 8,
    reasons: ['Alternative funding', 'Business closed'],
    notes: 'Client expressed satisfaction with service but is pivoting strategy. Likely to return in 12-18 months.',
    completedAt: '2026-03-10', reEngagement: true,
  },
  {
    id: 'ex_002', entityName: 'Blue Ridge Consulting', type: 'client', npsScore: 4,
    reasons: ['Pricing', 'Competitor'],
    notes: 'Client cited cost as primary driver. Follow-up offer declined. High churn risk segment.',
    completedAt: '2026-02-18', reEngagement: false,
  },
  {
    id: 'ex_003', entityName: 'OakTree Capital (Tenant)', type: 'tenant', npsScore: null,
    reasons: ['Platform consolidation', 'M&A'],
    notes: 'Tenant offboarding due to acquisition. No service complaints. Data migration completed to acquirer.',
    completedAt: '2026-01-30', reEngagement: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<OffboardingStatus, { label: string; badge: string; bar: string }> = {
  pending:         { label: 'Pending',         badge: 'bg-gray-800 text-gray-400 border-gray-700',         bar: 'bg-gray-600'    },
  in_progress:     { label: 'In Progress',     badge: 'bg-blue-900 text-blue-300 border-blue-700',          bar: 'bg-blue-500'    },
  export_ready:    { label: 'Export Ready',     badge: 'bg-amber-900 text-amber-300 border-amber-700',      bar: 'bg-amber-500'   },
  deletion_queued: { label: 'Deletion Queued',  badge: 'bg-orange-900 text-orange-300 border-orange-700',    bar: 'bg-orange-500'  },
  complete:        { label: 'Complete',         badge: 'bg-emerald-900 text-emerald-300 border-emerald-700', bar: 'bg-emerald-500' },
};

const STEP_CONFIG: Record<DataStepStatus, { dot: string; label: string }> = {
  pending: { dot: 'bg-gray-600',             label: 'Pending' },
  running: { dot: 'bg-blue-400 animate-pulse', label: 'Running' },
  done:    { dot: 'bg-emerald-400',          label: 'Done'    },
  failed:  { dot: 'bg-red-400',             label: 'Failed'  },
};

const TYPE_BADGE: Record<OffboardingType, string> = {
  client: 'bg-indigo-900 text-indigo-300 border-indigo-700',
  tenant: 'bg-purple-900 text-purple-300 border-purple-700',
};

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getSLAInfo(dueDate: string, status: OffboardingStatus) {
  if (status === 'complete') return null;
  const diff = daysBetween(TODAY, new Date(dueDate));
  if (diff < 0) return { label: 'OVERDUE', color: 'bg-red-900 text-red-300 border-red-700', rowClass: 'bg-red-950/30' };
  if (diff <= 7) return { label: 'Due Soon', color: 'bg-red-900 text-red-300 border-red-700', rowClass: 'bg-red-950/20' };
  if (diff <= 14) return { label: 'Due Soon', color: 'bg-amber-900 text-amber-300 border-amber-700', rowClass: '' };
  return null;
}

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-emerald-900 border border-emerald-600 text-emerald-200 text-sm px-4 py-3 rounded-xl shadow-2xl animate-slide-up">
      {message}
    </div>
  );
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

// ---------------------------------------------------------------------------
// Assignee Dropdown (inline)
// ---------------------------------------------------------------------------

function AssigneeDropdown({
  current,
  onSelect,
}: {
  current: string;
  onSelect: (user: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        {current}
        <span className="text-[10px]">&#9660;</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
          {PLACEHOLDER_USERS.map((u) => (
            <button
              key={u}
              onClick={(e) => { e.stopPropagation(); onSelect(u); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors ${
                u === current ? 'text-[#C9A84C] font-semibold' : 'text-gray-300'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowRow
// ---------------------------------------------------------------------------

function WorkflowRow({
  wf,
  onExpand,
  expanded,
  onOpenDrawer,
  onAssigneeChange,
  onDownloadExport,
}: {
  wf: OffboardingWorkflow;
  onExpand: () => void;
  expanded: boolean;
  onOpenDrawer: () => void;
  onAssigneeChange: (user: string) => void;
  onDownloadExport: () => void;
}) {
  const sc = STATUS_CONFIG[wf.status];
  const sla = getSLAInfo(wf.dueDate, wf.status);
  return (
    <>
      <tr
        className={`border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition-colors ${sla?.rowClass ?? ''}`}
        onClick={onOpenDrawer}
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
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.badge}`}>
              {sc.label}
            </span>
            {sla && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${sla.color}`}>
                {sla.label}
              </span>
            )}
          </div>
        </td>
        <td className="py-3 px-4 w-40">
          <ProgressBar pct={wf.progressPct} color={sc.bar} />
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <DataStepBadge status={wf.exportStep} />
            {wf.status === 'export_ready' && !wf.exportDownloaded && (
              <button
                onClick={(e) => { e.stopPropagation(); onDownloadExport(); }}
                className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#C9A84C] text-[#0A1628] hover:bg-[#b8933e] transition-colors"
              >
                Download
              </button>
            )}
            {wf.exportDownloaded && (
              <span className="text-[10px] text-emerald-400 font-semibold">Downloaded</span>
            )}
          </div>
        </td>
        <td className="py-3 px-4">
          <DataStepBadge status={wf.deletionStep} />
        </td>
        <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(wf.initiatedAt)}</td>
        <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(wf.dueDate)}</td>
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <AssigneeDropdown current={wf.assignee} onSelect={onAssigneeChange} />
        </td>
        <td className="py-3 px-4 text-gray-500 text-xs">
          <button onClick={(e) => { e.stopPropagation(); onExpand(); }} className="hover:text-gray-300">
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
        </td>
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

// ---------------------------------------------------------------------------
// Workflow Detail Drawer (640px right slide-over)
// ---------------------------------------------------------------------------

function WorkflowDrawer({
  wf,
  onClose,
  onToast,
}: {
  wf: OffboardingWorkflow;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const sc = STATUS_CONFIG[wf.status];
  const sla = getSLAInfo(wf.dueDate, wf.status);

  const STAGES: { name: string; actions?: { label: string; onClick: () => void }[] }[] = [
    {
      name: 'Data Export',
      actions: [
        { label: 'Download', onClick: () => onToast('Export package downloaded') },
        { label: 'Start', onClick: () => onToast('Export started') },
      ],
    },
    {
      name: 'Anonymization',
      actions: [{ label: 'Run', onClick: () => onToast('Anonymization started') }],
    },
    { name: 'Deletion Queue' },
    { name: 'Retention Hold' },
    {
      name: 'Compliance Sign-off',
      actions: [{ label: 'Approve', onClick: () => onToast('Compliance approved') }],
    },
    { name: 'Closed' },
  ];

  const stageIdx = wf.status === 'complete' ? 5 :
    wf.status === 'deletion_queued' ? 2 :
    wf.status === 'export_ready' ? 1 :
    wf.status === 'in_progress' ? 1 : 0;

  const DOCS = [
    { name: 'Data Export Package.zip', size: '24.3 MB' },
    { name: 'Compliance Checklist.pdf', size: '1.2 MB' },
    { name: 'Audit Trail Report.csv', size: '890 KB' },
  ];

  const ACTIVITY = [
    { ts: 'Mar 28, 2026 14:32', text: 'Workflow created by Sarah Chen' },
    { ts: 'Mar 29, 2026 09:15', text: 'Data export initiated' },
    { ts: 'Mar 30, 2026 11:40', text: 'Export package ready for download' },
    { ts: 'Apr 01, 2026 08:00', text: `Assigned to ${wf.assignee}` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-[640px] bg-gray-900 border-l border-gray-700 overflow-y-auto animate-slide-left">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[wf.type]}`}>{wf.type}</span>
                <h2 className="text-lg font-bold text-white">{wf.entityName}</h2>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className={`font-semibold px-2 py-0.5 rounded-full border ${sc.badge}`}>{sc.label}</span>
                {sla && <span className={`font-bold px-1.5 py-0.5 rounded-full border ${sla.color}`}>{sla.label}</span>}
                <span>{wf.progressPct}% complete</span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>Assignee: <span className="text-gray-300">{wf.assignee}</span></span>
                <span>Initiated: {fmtDate(wf.initiatedAt)}</span>
                <span>Due: {fmtDate(wf.dueDate)}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
          </div>

          {/* 6-Stage Checklist */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Stage Checklist</p>
            <div className="space-y-2">
              {STAGES.map((stage, idx) => {
                const done = idx < stageIdx;
                const active = idx === stageIdx;
                return (
                  <div key={stage.name} className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
                    done ? 'bg-emerald-950/30 border-emerald-800' :
                    active ? 'bg-blue-950/30 border-blue-800' :
                    'bg-gray-800/50 border-gray-700'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                        done ? 'bg-emerald-900 border-emerald-600 text-emerald-300' :
                        active ? 'bg-blue-900 border-blue-600 text-blue-300' :
                        'bg-gray-800 border-gray-600 text-gray-500'
                      }`}>
                        {done ? '\u2713' : idx + 1}
                      </span>
                      <span className={`text-sm ${done ? 'text-emerald-300' : active ? 'text-blue-300' : 'text-gray-500'}`}>
                        {stage.name}
                      </span>
                      {idx === 5 && wf.status === 'complete' && (
                        <span className="text-[10px] text-emerald-400 font-semibold ml-2">Workflow complete</span>
                      )}
                    </div>
                    {stage.actions && active && (
                      <div className="flex gap-2">
                        {stage.actions.map((a) => (
                          <button key={a.label} onClick={a.onClick}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded bg-[#C9A84C] text-[#0A1628] hover:bg-[#b8933e]">
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Documents */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Documents</p>
            <div className="space-y-2">
              {DOCS.map((d) => (
                <div key={d.name} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">&#128196;</span>
                    <span className="text-xs text-gray-200">{d.name}</span>
                  </div>
                  <span className="text-[10px] text-gray-500">{d.size}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Log */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Activity Log</p>
            <div className="space-y-2">
              {ACTIVITY.map((a, i) => (
                <div key={i} className="flex gap-3 text-xs">
                  <span className="text-gray-600 w-36 flex-shrink-0">{a.ts}</span>
                  <span className="text-gray-400">{a.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onToast('Stage advanced')}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors">
              Advance Stage
            </button>
            <button onClick={() => onToast('Workflow reassigned')}
              className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:text-white text-sm transition-colors">
              Reassign
            </button>
            <button onClick={() => onToast('Workflow put on hold')}
              className="px-4 py-2 rounded-lg border border-amber-700 text-amber-400 hover:text-amber-300 text-sm transition-colors">
              Put on Hold
            </button>
            <button onClick={() => { onToast('Workflow closed'); onClose(); }}
              className="px-4 py-2 rounded-lg border border-red-700 text-red-400 hover:text-red-300 text-sm transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exit Interview Detail Drawer (600px)
// ---------------------------------------------------------------------------

function InterviewDrawer({
  interview,
  onClose,
  onToast,
  onUpdate,
}: {
  interview: ExitSummary;
  onClose: () => void;
  onToast: (msg: string) => void;
  onUpdate: (updated: ExitSummary) => void;
}) {
  const [editReasons, setEditReasons] = useState<string[]>(interview.reasons);
  const [notes, setNotes] = useState(interview.notes);
  const [reEngagement, setReEngagement] = useState(interview.reEngagement ?? false);

  const npsLabel = interview.npsScore === null ? 'N/A' :
    interview.npsScore >= 9 ? 'Promoter' : interview.npsScore >= 7 ? 'Passive' : 'Detractor';
  const npsColor = interview.npsScore === null ? 'text-gray-500' :
    interview.npsScore >= 9 ? 'text-emerald-400' : interview.npsScore >= 7 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-[600px] bg-gray-900 border-l border-gray-700 overflow-y-auto animate-slide-left">
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[interview.type]}`}>{interview.type}</span>
                <h2 className="text-lg font-bold text-white">{interview.entityName}</h2>
              </div>
              <span className="text-xs text-gray-500">{fmtDate(interview.completedAt)}</span>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
          </div>

          {/* NPS Ring */}
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-20 h-20 rounded-full border-4 ${
              interview.npsScore === null ? 'border-gray-700' :
              interview.npsScore >= 9 ? 'border-emerald-500' :
              interview.npsScore >= 7 ? 'border-amber-500' : 'border-red-500'
            } flex items-center justify-center`}>
              <div className="text-center">
                <span className={`text-2xl font-black ${npsColor}`}>{interview.npsScore ?? '-'}</span>
                <span className="text-[10px] text-gray-500 block">/10</span>
              </div>
            </div>
            <div>
              <p className={`text-sm font-semibold ${npsColor}`}>{npsLabel}</p>
              <p className="text-xs text-gray-500">Net Promoter Score</p>
            </div>
          </div>

          {/* Editable Reason Tags */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Reason Tags</p>
            <div className="flex flex-wrap gap-2">
              {REASON_TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setEditReasons((prev) =>
                      prev.includes(tag) ? prev.filter((r) => r !== tag) : [...prev, tag]
                    );
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    editReasons.includes(tag)
                      ? 'bg-[#0A1628] text-[#C9A84C] border-[#C9A84C]'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C] resize-none"
            />
          </div>

          {/* Re-engagement toggle */}
          <div className="mb-6 flex items-center justify-between">
            <span className="text-sm text-gray-300">Re-engagement Candidate</span>
            <button
              onClick={() => setReEngagement(!reEngagement)}
              className={`w-10 h-5 rounded-full relative transition-colors ${
                reEngagement ? 'bg-emerald-600' : 'bg-gray-700'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                reEngagement ? 'left-5' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* Linked workflow */}
          <div className="mb-6 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
            <p className="text-xs text-gray-500 mb-1">Linked Workflow</p>
            <p className="text-sm text-blue-400 cursor-pointer hover:underline">
              Offboarding workflow for {interview.entityName}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                onUpdate({ ...interview, reasons: editReasons, notes, reEngagement });
                onToast('Interview updated');
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors"
            >
              Save Changes
            </button>
            <button
              onClick={() => onToast('Interview exported')}
              className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:text-white text-sm transition-colors"
            >
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Initiate Offboarding Modal (expanded)
// ---------------------------------------------------------------------------

function InitiateModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (wf: OffboardingWorkflow) => void;
}) {
  const [type, setType]           = useState<OffboardingType>('client');
  const [entity, setEntity]       = useState('');
  const [entityOpen, setEntityOpen] = useState(false);
  const [reason, setReason]       = useState('');
  const [tags, setTags]           = useState<string[]>([]);
  const [assignee, setAssignee]   = useState(PLACEHOLDER_USERS[0]);
  const [priority, setPriority]   = useState<'standard' | 'expedited'>('standard');
  const [notify, setNotify]       = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const entityRef = useRef<HTMLDivElement>(null);
  const filteredEntities = PLACEHOLDER_ENTITIES.filter((e) =>
    e.toLowerCase().includes(entity.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (entityRef.current && !entityRef.current.contains(e.target as Node)) setEntityOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const submit = () => {
    if (!entity.trim()) return;
    const now = new Date();
    const dueDays = priority === 'expedited' ? 7 : 30;
    const due = new Date(now.getTime() + dueDays * 86400000);
    const wf: OffboardingWorkflow = {
      id: `ob_${Date.now()}`,
      type,
      entityName: entity,
      initiatedAt: now.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      status: 'pending',
      progressPct: 0,
      exportStep: 'pending',
      deletionStep: 'pending',
      assignee,
      dataSteps: [
        { label: 'Consent revocation',      status: 'pending' },
        { label: 'Document export package', status: 'pending' },
        { label: 'PII anonymization',       status: 'pending' },
        { label: 'Credit file purge',       status: 'pending' },
        { label: 'Audit log archival',      status: 'pending' },
      ],
    };
    setSubmitted(true);
    setTimeout(() => { onSubmit(wf); onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
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
                  <button key={t} onClick={() => setType(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      type === t ? 'bg-[#0A1628] border-[#C9A84C] text-[#C9A84C]' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
            </div>

            {/* Entity (searchable dropdown) */}
            <div ref={entityRef} className="relative">
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">{type === 'client' ? 'Client Name' : 'Tenant Name'}</label>
              <input
                value={entity}
                onChange={(e) => { setEntity(e.target.value); setEntityOpen(true); }}
                onFocus={() => setEntityOpen(true)}
                placeholder="Search entities..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C]"
              />
              {entityOpen && filteredEntities.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 max-h-40 overflow-y-auto">
                  {filteredEntities.map((e) => (
                    <button key={e} onClick={() => { setEntity(e); setEntityOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">{e}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Reason Tags (multi-select) */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block font-medium">Reason Tags</label>
              <div className="flex flex-wrap gap-2">
                {REASON_TAG_OPTIONS.map((tag) => (
                  <button key={tag}
                    onClick={() => setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      tags.includes(tag)
                        ? 'bg-[#0A1628] text-[#C9A84C] border-[#C9A84C]'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}
                  >{tag}</button>
                ))}
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Assignee</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]">
                {PLACEHOLDER_USERS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block font-medium">Priority</label>
              <div className="flex gap-3">
                {([
                  { value: 'standard' as const, label: 'Standard (30 days)' },
                  { value: 'expedited' as const, label: 'Expedited (7 days)' },
                ]).map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="priority" checked={priority === opt.value}
                      onChange={() => setPriority(opt.value)}
                      className="accent-[#C9A84C]" />
                    <span className={`text-sm ${priority === opt.value ? 'text-gray-100' : 'text-gray-500'}`}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Notify toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Notify Entity</span>
              <button onClick={() => setNotify(!notify)}
                className={`w-10 h-5 rounded-full relative transition-colors ${notify ? 'bg-emerald-600' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${notify ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Reason / Notes</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="Reason for offboarding (optional)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none" />
            </div>

            <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-700/40 text-xs text-amber-300">
              This will create a staged workflow: export &rarr; anonymization &rarr; deletion, subject to retention schedule.
              {priority === 'expedited' && ' Expedited timeline: 7 days SLA.'}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={submit}
                className="flex-1 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors">
                Create Workflow
              </button>
              <button onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors">
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
// Conduct Exit Interview Modal
// ---------------------------------------------------------------------------

function ConductInterviewModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (ex: ExitSummary) => void;
}) {
  const [entity, setEntity]     = useState('');
  const [entityOpen, setEntityOpen] = useState(false);
  const [date, setDate]         = useState(TODAY.toISOString().slice(0, 10));
  const [nps, setNps]           = useState(5);
  const [tags, setTags]         = useState<string[]>([]);
  const [notes, setNotes]       = useState('');
  const [reEngagement, setReEngagement] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const entityRef = useRef<HTMLDivElement>(null);
  const filtered = PLACEHOLDER_ENTITIES.filter((e) => e.toLowerCase().includes(entity.toLowerCase()));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (entityRef.current && !entityRef.current.contains(e.target as Node)) setEntityOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const npsLabel = nps >= 9 ? 'Promoter' : nps >= 7 ? 'Passive' : 'Detractor';
  const npsColor = nps >= 9 ? 'text-emerald-400' : nps >= 7 ? 'text-amber-400' : 'text-red-400';

  const submit = () => {
    if (!entity.trim()) return;
    const ex: ExitSummary = {
      id: `ex_${Date.now()}`,
      entityName: entity,
      type: 'client',
      npsScore: nps,
      reasons: tags,
      notes,
      completedAt: date,
      reEngagement,
    };
    setSubmitted(true);
    setTimeout(() => { onSubmit(ex); onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Conduct Exit Interview</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        {submitted ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-900 border border-emerald-600 flex items-center justify-center mx-auto mb-3">
              <span className="text-emerald-400 text-xl">&#10003;</span>
            </div>
            <p className="text-sm font-semibold text-emerald-300">Exit interview recorded</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Entity */}
            <div ref={entityRef} className="relative">
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Entity</label>
              <input value={entity} onChange={(e) => { setEntity(e.target.value); setEntityOpen(true); }}
                onFocus={() => setEntityOpen(true)} placeholder="Search entities..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C]" />
              {entityOpen && filtered.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                  {filtered.map((e) => (
                    <button key={e} onClick={() => { setEntity(e); setEntityOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">{e}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]" />
            </div>

            {/* NPS Slider */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">NPS Score</label>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={10} value={nps} onChange={(e) => setNps(Number(e.target.value))}
                  className="flex-1 accent-[#C9A84C]" />
                <span className={`text-lg font-black w-8 text-center ${npsColor}`}>{nps}</span>
              </div>
              <div className="flex justify-between text-[10px] mt-1">
                <span className="text-red-400">Detractor (0-6)</span>
                <span className="text-amber-400">Passive (7-8)</span>
                <span className="text-emerald-400">Promoter (9-10)</span>
              </div>
              <p className={`text-xs font-semibold mt-1 ${npsColor}`}>{npsLabel}</p>
            </div>

            {/* Reason Tags */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block font-medium">Reason Tags</label>
              <div className="flex flex-wrap gap-2">
                {REASON_TAG_OPTIONS.map((tag) => (
                  <button key={tag}
                    onClick={() => setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      tags.includes(tag)
                        ? 'bg-[#0A1628] text-[#C9A84C] border-[#C9A84C]'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}>{tag}</button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Interview notes..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none" />
            </div>

            {/* Re-engagement flag */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Re-engagement Candidate</span>
              <button onClick={() => setReEngagement(!reEngagement)}
                className={`w-10 h-5 rounded-full relative transition-colors ${reEngagement ? 'bg-emerald-600' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${reEngagement ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={submit}
                className="flex-1 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors">
                Submit Interview
              </button>
              <button onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors">
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
// Retention Modals
// ---------------------------------------------------------------------------

function EarlyDeletionModal({ dataClass, onClose, onToast }: { dataClass: string; onClose: () => void; onToast: (m: string) => void }) {
  const [justification, setJustification] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h3 className="text-md font-bold text-white mb-4">Request Early Deletion</h3>
        <p className="text-xs text-gray-400 mb-3">Data class: <span className="text-gray-200">{dataClass}</span></p>
        <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3}
          placeholder="Justification for early deletion..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none mb-4" />
        <div className="flex gap-3">
          <button onClick={() => { onToast(`Early deletion requested for ${dataClass}`); onClose(); }}
            className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-bold transition-colors">
            Submit Request
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AddDataClassModal({ onClose, onAdd }: { onClose: () => void; onAdd: (r: RetentionRule) => void }) {
  const [name, setName]       = useState('');
  const [years, setYears]     = useState(3);
  const [basis, setBasis]     = useState('');
  const [notes, setNotes]     = useState('');

  const submit = () => {
    if (!name.trim()) return;
    const del = new Date(TODAY);
    del.setFullYear(del.getFullYear() + years);
    onAdd({ dataClass: name, retentionYears: years, legalBasis: basis || 'Custom', deleteAfter: del.toISOString().slice(0, 10) });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h3 className="text-md font-bold text-white mb-4">Add Data Class</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block font-medium">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block font-medium">Retention Period (years)</label>
            <input type="number" min={1} max={99} value={years} onChange={(e) => setYears(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block font-medium">Legal Basis</label>
            <input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="e.g. GDPR Art. 17"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block font-medium">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C] resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={submit}
            className="flex-1 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors">
            Add Data Class
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retention Kebab Menu
// ---------------------------------------------------------------------------

function RetentionKebab({ dataClass, onToast, onRequestDeletion }: { dataClass: string; onToast: (m: string) => void; onRequestDeletion: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="text-gray-500 hover:text-gray-300 px-2 py-1">&#8942;</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
          <button onClick={() => { setOpen(false); onRequestDeletion(); }}
            className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-gray-700">
            Request Early Deletion
          </button>
          <button onClick={() => { setOpen(false); onToast(`Retention record exported for ${dataClass}`); }}
            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700">
            Export Retention Record
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exit Interview Analytics Panel
// ---------------------------------------------------------------------------

function InterviewAnalytics({ interviews }: { interviews: ExitSummary[] }) {
  const scored = interviews.filter((e) => e.npsScore !== null);
  const avgNps = scored.length > 0
    ? (scored.reduce((s, e) => s + (e.npsScore ?? 0), 0) / scored.length).toFixed(1)
    : 'N/A';

  const reasonCounts: Record<string, number> = {};
  interviews.forEach((e) => e.reasons.forEach((r) => { reasonCounts[r] = (reasonCounts[r] || 0) + 1; }));
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxCount = topReasons.length > 0 ? topReasons[0][1] : 1;

  const reEngagementCount = interviews.filter((e) => e.reEngagement).length;

  const avgNum = parseFloat(avgNps as string);
  const gaugeColor = isNaN(avgNum) ? 'text-gray-500' : avgNum >= 7 ? 'text-emerald-400' : avgNum >= 5 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* NPS Gauge */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-4">
        <div className={`w-16 h-16 rounded-full border-4 ${
          isNaN(avgNum) ? 'border-gray-700' : avgNum >= 7 ? 'border-emerald-500' : avgNum >= 5 ? 'border-amber-500' : 'border-red-500'
        } flex items-center justify-center`}>
          <span className={`text-xl font-black ${gaugeColor}`}>{avgNps}</span>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg NPS</p>
          <p className={`text-sm font-semibold ${gaugeColor}`}>
            {isNaN(avgNum) ? 'No data' : avgNum >= 7 ? 'Positive' : avgNum >= 5 ? 'Neutral' : 'Needs Attention'}
          </p>
        </div>
      </div>

      {/* Top Churn Reasons */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Top Churn Reasons</p>
        <div className="space-y-2">
          {topReasons.map(([reason, count]) => (
            <div key={reason} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-28 truncate">{reason}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-2">
                <div className="bg-[#C9A84C] h-2 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-500 w-4 text-right">{count}</span>
            </div>
          ))}
          {topReasons.length === 0 && <p className="text-xs text-gray-600">No data yet</p>}
        </div>
      </div>

      {/* Re-engagement */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Re-engagement Candidates</p>
          <p className="text-3xl font-black text-blue-400">{reEngagementCount}</p>
        </div>
        <button className="text-xs text-blue-400 hover:underline">View in CRM &rarr;</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OffboardingPage() {
  const [workflows, setWorkflows]       = useState<OffboardingWorkflow[]>(INITIAL_WORKFLOWS);
  const [retentionRules, setRetentionRules] = useState<RetentionRule[]>(INITIAL_RETENTION);
  const [exitInterviews, setExitInterviews] = useState<ExitSummary[]>(INITIAL_EXITS);

  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [showModal, setShowModal]             = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [activeTab, setActiveTab]             = useState<'workflows' | 'retention' | 'exit'>('workflows');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<string | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Retention modals
  const [earlyDeleteClass, setEarlyDeleteClass] = useState<string | null>(null);
  const [showAddDataClass, setShowAddDataClass] = useState(false);

  const tableEndRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => setToastMsg(msg), []);

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const active    = workflows.filter((w) => w.status !== 'complete');
  const completed = workflows.filter((w) => w.status === 'complete');

  // SLA counts
  const overdue  = workflows.filter((w) => w.status !== 'complete' && daysBetween(TODAY, new Date(w.dueDate)) < 0).length;
  const dueSoon  = workflows.filter((w) => {
    if (w.status === 'complete') return false;
    const d = daysBetween(TODAY, new Date(w.dueDate));
    return d >= 0 && d <= 14;
  }).length;

  const selWf = workflows.find((w) => w.id === selectedWorkflow) ?? null;
  const selEx = exitInterviews.find((e) => e.id === selectedInterview) ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
      {showModal && (
        <InitiateModal
          onClose={() => setShowModal(false)}
          onSubmit={(wf) => {
            setWorkflows((prev) => [...prev, wf]);
            showToast('Offboarding workflow created');
            setActiveTab('workflows');
            setTimeout(() => tableEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
          }}
        />
      )}
      {showInterviewModal && (
        <ConductInterviewModal
          onClose={() => setShowInterviewModal(false)}
          onSubmit={(ex) => {
            setExitInterviews((prev) => [...prev, ex]);
            showToast('Exit interview recorded');
          }}
        />
      )}
      {selWf && (
        <WorkflowDrawer wf={selWf} onClose={() => setSelectedWorkflow(null)} onToast={showToast} />
      )}
      {selEx && (
        <InterviewDrawer
          interview={selEx}
          onClose={() => setSelectedInterview(null)}
          onToast={showToast}
          onUpdate={(updated) => {
            setExitInterviews((prev) => prev.map((e) => e.id === updated.id ? updated : e));
          }}
        />
      )}
      {earlyDeleteClass && (
        <EarlyDeletionModal dataClass={earlyDeleteClass} onClose={() => setEarlyDeleteClass(null)} onToast={showToast} />
      )}
      {showAddDataClass && (
        <AddDataClassModal
          onClose={() => setShowAddDataClass(false)}
          onAdd={(r) => { setRetentionRules((prev) => [...prev, r]); showToast(`Data class "${r.dataClass}" added`); }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Offboarding Orchestrator</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {active.length} active workflow{active.length !== 1 ? 's' : ''} &middot; {completed.length} completed
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'exit' && (
            <button onClick={() => setShowInterviewModal(true)}
              className="px-4 py-2 rounded-lg border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10 text-sm font-bold transition-colors">
              + Conduct Exit Interview
            </button>
          )}
          <button onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors">
            + Initiate Offboarding
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: 'Active',      value: active.length,                                          color: 'text-blue-400'    },
          { label: 'Pending',     value: workflows.filter((w) => w.status === 'pending').length, color: 'text-gray-300'    },
          { label: 'In Progress', value: workflows.filter((w) => w.status === 'in_progress').length, color: 'text-blue-300' },
          { label: 'Completed',   value: completed.length,                                       color: 'text-emerald-400' },
          { label: 'Overdue',     value: overdue,                                                color: overdue > 0 ? 'text-red-400' : 'text-gray-500' },
          { label: 'Due Soon',    value: dueSoon,                                                color: dueSoon > 0 ? 'text-amber-400' : 'text-gray-500' },
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
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === t ? 'bg-[#0A1628] text-[#C9A84C]' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {t === 'workflows' ? 'Active Workflows' : t === 'retention' ? 'Retention Schedule' : 'Exit Interviews'}
          </button>
        ))}
      </div>

      {/* ---- Workflows tab ---- */}
      {activeTab === 'workflows' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                {['Entity', 'Status', 'Progress', 'Export', 'Deletion', 'Initiated', 'Due', 'Assignee', ''].map((h) => (
                  <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
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
                  onOpenDrawer={() => setSelectedWorkflow(wf.id)}
                  onAssigneeChange={(user) => {
                    setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, assignee: user } : w));
                    showToast(`Assignee updated to ${user}`);
                  }}
                  onDownloadExport={() => {
                    setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, exportDownloaded: true } : w));
                    showToast('Export downloaded');
                  }}
                />
              ))}
            </tbody>
          </table>
          <div ref={tableEndRef} />
        </div>
      )}

      {/* ---- Retention Schedule tab ---- */}
      {activeTab === 'retention' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-200">Data Retention Schedule</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">Periods per regulatory requirement</span>
              <button onClick={() => setShowAddDataClass(true)}
                className="px-3 py-1.5 rounded-lg border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10 text-xs font-bold transition-colors">
                + Add Data Class
              </button>
            </div>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                {['Data Class', 'Retention', 'Legal Basis', 'Delete After', ''].map((h) => (
                  <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retentionRules.map((rule) => (
                <tr key={rule.dataClass} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-3 px-4 text-sm text-gray-100 font-medium">{rule.dataClass}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full font-semibold">
                      {rule.retentionYears}yr
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-400">{rule.legalBasis}</td>
                  <td className="py-3 px-4 text-xs text-gray-500">{rule.deleteAfter}</td>
                  <td className="py-3 px-4">
                    <RetentionKebab
                      dataClass={rule.dataClass}
                      onToast={showToast}
                      onRequestDeletion={() => setEarlyDeleteClass(rule.dataClass)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
            Retention periods are enforced automatically at workflow completion. Early deletion requests require compliance officer approval.
          </div>
        </div>
      )}

      {/* ---- Exit Interviews tab ---- */}
      {activeTab === 'exit' && (
        <div>
          {/* Analytics Panel */}
          <InterviewAnalytics interviews={exitInterviews} />

          {/* Interview cards */}
          <div className="space-y-4">
            {exitInterviews.map((ex) => (
              <div
                key={ex.id}
                onClick={() => setSelectedInterview(ex.id)}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 cursor-pointer hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[ex.type]}`}>{ex.type}</span>
                    <p className="text-sm font-semibold text-gray-100">{ex.entityName}</p>
                    {ex.reEngagement && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-900 text-blue-300 border border-blue-700">Re-engage</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {ex.npsScore !== null ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">NPS</span>
                        <span className={`text-lg font-black ${
                          ex.npsScore >= 7 ? 'text-emerald-400' : ex.npsScore >= 5 ? 'text-amber-400' : 'text-red-400'
                        }`}>{ex.npsScore}</span>
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
                    <span key={r} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">{r}</span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 leading-relaxed bg-gray-800/50 rounded-lg px-3 py-2">{ex.notes}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
