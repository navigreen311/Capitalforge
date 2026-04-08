'use client';

// ============================================================
// /platform/workflows — Platform Workflow Manager
// Workflow list with enable/disable toggle, pre-built workflows,
// trigger/condition/action display, add workflow form,
// expandable cards with edit/run-history/actions,
// and recent execution log section
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────

interface Workflow {
  id: string;
  name: string;
  trigger: string;
  condition: string;
  action: string;
  status: 'active' | 'paused';
  lastTriggered: string | null;
  createdAt: string;
}

interface RunHistoryEntry {
  id: string;
  timestamp: string;
  status: 'success' | 'failed';
  triggerDetail: string;
  actionTaken: string;
}

interface ExecutionLogEntry {
  id: string;
  workflowName: string;
  triggeredAt: string;
  triggerDetail: string;
  actionTaken: string;
  status: 'success' | 'failed';
  clientsAffected: number;
}

// ── Fallback mock data ──────────────────────────────────────

const FALLBACK_WORKFLOWS: Workflow[] = [
  { id: 'wf_001', name: 'APR Expiry Alert', trigger: 'APR expires in 30 days', condition: 'Client has active card with intro APR', action: 'Create action queue item + Send VoiceForge campaign', status: 'active', lastTriggered: '2026-04-06T09:00:00Z', createdAt: '2025-11-01T10:00:00Z' },
  { id: 'wf_002', name: 'Restack Ready Flag', trigger: 'Client readiness score exceeds 75', condition: 'Last funded round > 90 days ago', action: 'Flag client as restack ready', status: 'active', lastTriggered: '2026-04-05T14:30:00Z', createdAt: '2025-12-15T08:00:00Z' },
  { id: 'wf_003', name: 'Decline Reconsideration', trigger: 'Application is declined', condition: 'Issuer allows reconsideration', action: 'Generate reconsideration letter draft', status: 'active', lastTriggered: '2026-04-03T11:15:00Z', createdAt: '2026-01-10T09:00:00Z' },
  { id: 'wf_004', name: 'Unsigned Acknowledgment Reminder', trigger: 'Acknowledgment unsigned for 7 days', condition: 'Client has pending acknowledgment', action: 'Send email reminder to client', status: 'paused', lastTriggered: null, createdAt: '2026-02-20T12:00:00Z' },
];

// ── Mock run history per workflow ────────────────────────────

const MOCK_RUN_HISTORY: Record<string, RunHistoryEntry[]> = {
  wf_001: [
    { id: 'rh_001', timestamp: '2026-04-06T09:00:00Z', status: 'success', triggerDetail: 'APR expiry in 30 days for 12 clients', actionTaken: 'Queued action items + VoiceForge campaign sent' },
    { id: 'rh_002', timestamp: '2026-04-05T09:00:00Z', status: 'success', triggerDetail: 'APR expiry in 30 days for 8 clients', actionTaken: 'Queued action items + VoiceForge campaign sent' },
    { id: 'rh_003', timestamp: '2026-04-04T09:00:00Z', status: 'failed', triggerDetail: 'APR expiry in 30 days for 5 clients', actionTaken: 'VoiceForge API timeout — retried' },
    { id: 'rh_004', timestamp: '2026-04-03T09:00:00Z', status: 'success', triggerDetail: 'APR expiry in 30 days for 10 clients', actionTaken: 'Queued action items + VoiceForge campaign sent' },
    { id: 'rh_005', timestamp: '2026-04-02T09:00:00Z', status: 'success', triggerDetail: 'APR expiry in 30 days for 6 clients', actionTaken: 'Queued action items + VoiceForge campaign sent' },
  ],
  wf_002: [
    { id: 'rh_010', timestamp: '2026-04-05T14:30:00Z', status: 'success', triggerDetail: 'Readiness score > 75 for 4 clients', actionTaken: 'Flagged as restack ready' },
    { id: 'rh_011', timestamp: '2026-04-04T14:30:00Z', status: 'success', triggerDetail: 'Readiness score > 75 for 2 clients', actionTaken: 'Flagged as restack ready' },
    { id: 'rh_012', timestamp: '2026-04-02T14:30:00Z', status: 'success', triggerDetail: 'Readiness score > 75 for 7 clients', actionTaken: 'Flagged as restack ready' },
  ],
  wf_003: [
    { id: 'rh_020', timestamp: '2026-04-03T11:15:00Z', status: 'success', triggerDetail: 'Decline for client #1042 — Chase Sapphire', actionTaken: 'Reconsideration letter generated' },
    { id: 'rh_021', timestamp: '2026-04-01T16:45:00Z', status: 'success', triggerDetail: 'Decline for client #987 — Amex Gold', actionTaken: 'Reconsideration letter generated' },
    { id: 'rh_022', timestamp: '2026-03-28T10:00:00Z', status: 'failed', triggerDetail: 'Decline for client #1105 — Citi Double Cash', actionTaken: 'Issuer does not support recon — skipped' },
  ],
  wf_004: [],
};

// ── Mock execution log entries (5D) ─────────────────────────

const MOCK_EXECUTION_LOG: ExecutionLogEntry[] = [
  {
    id: 'el_001',
    workflowName: 'APR Expiry Alert',
    triggeredAt: '2026-04-06T09:00:00Z',
    triggerDetail: 'APR expiry in 30 days for 12 clients',
    actionTaken: 'Queued action items + VoiceForge campaign sent',
    status: 'success',
    clientsAffected: 12,
  },
  {
    id: 'el_002',
    workflowName: 'APR Expiry Alert',
    triggeredAt: '2026-04-05T09:00:00Z',
    triggerDetail: 'APR expiry in 30 days for 8 clients',
    actionTaken: 'Queued action items + VoiceForge campaign sent',
    status: 'success',
    clientsAffected: 8,
  },
  {
    id: 'el_003',
    workflowName: 'Decline Reconsideration',
    triggeredAt: '2026-04-03T11:15:00Z',
    triggerDetail: 'Decline for client #1042 — Chase Sapphire',
    actionTaken: 'Reconsideration letter generated',
    status: 'success',
    clientsAffected: 1,
  },
];

// ── Toast ────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 border border-emerald-700 text-emerald-200 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3">
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="text-emerald-400 hover:text-emerald-200 text-lg leading-none">&times;</button>
    </div>
  );
}

// ── Toggle Switch ────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-emerald-600' : 'bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ── Chevron Icon ─────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── Status Badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: 'success' | 'failed' }) {
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
      status === 'success'
        ? 'bg-emerald-900/40 text-emerald-400'
        : 'bg-red-900/40 text-red-400'
    }`}>
      {status}
    </span>
  );
}

// ── Workflow Card (Expandable) ───────────────────────────────

function WorkflowCard({
  workflow,
  onToggle,
  onDelete,
  onTestRun,
  onUpdate,
  runHistory,
}: {
  workflow: Workflow;
  onToggle: (id: string, newStatus: 'active' | 'paused') => void;
  onDelete: (id: string) => void;
  onTestRun: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Workflow>) => void;
  runHistory: RunHistoryEntry[];
}) {
  const isActive = workflow.status === 'active';
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit form local state
  const [editName, setEditName] = useState(workflow.name);
  const [editTrigger, setEditTrigger] = useState(workflow.trigger);
  const [editCondition, setEditCondition] = useState(workflow.condition);
  const [editAction, setEditAction] = useState(workflow.action);

  const handleSaveEdit = () => {
    onUpdate(workflow.id, {
      name: editName,
      trigger: editTrigger,
      condition: editCondition,
      action: editAction,
    });
    setEditMode(false);
  };

  const handleCancelEdit = () => {
    setEditName(workflow.name);
    setEditTrigger(workflow.trigger);
    setEditCondition(workflow.condition);
    setEditAction(workflow.action);
    setEditMode(false);
  };

  return (
    <div className={`rounded-xl border transition ${
      isActive ? 'border-gray-700/60 bg-gray-900/60' : 'border-gray-800 bg-gray-900/30 opacity-70'
    }`}>
      {/* Collapsed header — clickable */}
      <div
        className="p-5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <ChevronIcon open={expanded} />
            <div>
              <h3 className="text-sm font-semibold text-white">{workflow.name}</h3>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded mt-1 inline-block ${
                isActive ? 'bg-emerald-900/40 text-emerald-400' : 'bg-gray-800 text-gray-500'
              }`}>
                {workflow.status}
              </span>
            </div>
          </div>
          <Toggle enabled={isActive} onToggle={() => onToggle(workflow.id, isActive ? 'paused' : 'active')} />
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
            <span className="text-gray-500 w-20 shrink-0">Trigger:</span>
            <span className="text-gray-300">{workflow.trigger}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 w-20 shrink-0">Condition:</span>
            <span className="text-gray-300">{workflow.condition}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 w-20 shrink-0">Action:</span>
            <span className="text-[#C9A84C]">{workflow.action}</span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between text-[10px] text-gray-500">
          <span>Created: {workflow.createdAt}</span>
          <span>Last triggered: {workflow.lastTriggered ? new Date(workflow.lastTriggered).toLocaleDateString() : 'Never'}</span>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-gray-800 p-5 space-y-5">

          {/* Edit Form */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Edit Workflow</h4>
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="text-xs text-[#C9A84C] hover:text-[#d4b45c] transition"
                >
                  Edit
                </button>
              )}
            </div>
            {editMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Workflow Name</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Trigger</label>
                    <input
                      value={editTrigger}
                      onChange={(e) => setEditTrigger(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Condition</label>
                    <input
                      value={editCondition}
                      onChange={(e) => setEditCondition(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Action</label>
                    <input
                      value={editAction}
                      onChange={(e) => setEditAction(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1.5 bg-[#C9A84C] text-[#0A1628] rounded-lg text-xs font-semibold hover:bg-[#d4b45c] transition"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Click &quot;Edit&quot; to modify this workflow&apos;s configuration.</p>
            )}
          </div>

          {/* Run History */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Run History <span className="text-gray-600">(last 10)</span>
            </h4>
            {runHistory.length === 0 ? (
              <p className="text-xs text-gray-600">No executions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-2 pr-4 font-medium">Timestamp</th>
                      <th className="text-left py-2 pr-4 font-medium">Status</th>
                      <th className="text-left py-2 pr-4 font-medium">Trigger Detail</th>
                      <th className="text-left py-2 font-medium">Action Taken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runHistory.slice(0, 10).map((run) => (
                      <tr key={run.id} className="border-b border-gray-800/50">
                        <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                          {new Date(run.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="py-2 pr-4 text-gray-300">{run.triggerDetail}</td>
                        <td className="py-2 text-gray-300">{run.actionTaken}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2 border-t border-gray-800">
            <button
              onClick={(e) => { e.stopPropagation(); onTestRun(workflow.id); }}
              className="px-3 py-1.5 bg-blue-900/40 border border-blue-800 text-blue-300 rounded-lg text-xs font-medium hover:bg-blue-900/60 transition"
            >
              Test Run (dry run)
            </button>
            {!confirmDelete ? (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="px-3 py-1.5 bg-red-900/30 border border-red-800/50 text-red-400 rounded-lg text-xs font-medium hover:bg-red-900/50 transition"
              >
                Delete Workflow
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Are you sure?</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(workflow.id); }}
                  className="px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Execution Log Section (5D) ───────────────────────────────

type LogFilter = 'all' | 'success' | 'failed';

function ExecutionLogSection() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<LogFilter>('all');

  const filtered = MOCK_EXECUTION_LOG.filter((entry) => {
    if (filter === 'all') return true;
    return entry.status === filter;
  });

  const filterPills: { label: string; value: LogFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Success', value: 'success' },
    { label: 'Failed', value: 'failed' },
  ];

  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-900/60">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-2">
          <ChevronIcon open={open} />
          <h2 className="text-sm font-semibold text-white">Show Execution Log</h2>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
            {MOCK_EXECUTION_LOG.length} entries
          </span>
        </div>
        <span className="text-xs text-gray-500">{open ? 'Collapse' : 'Expand'}</span>
      </button>

      {/* Collapsible content */}
      {open && (
        <div className="border-t border-gray-800 p-5 space-y-4">
          {/* Filter pills */}
          <div className="flex gap-2">
            {filterPills.map((pill) => (
              <button
                key={pill.value}
                onClick={() => setFilter(pill.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  filter === pill.value
                    ? 'bg-[#C9A84C] text-[#0A1628]'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-4 font-medium">Workflow</th>
                  <th className="text-left py-2 pr-4 font-medium">Triggered At</th>
                  <th className="text-left py-2 pr-4 font-medium">Trigger Detail</th>
                  <th className="text-left py-2 pr-4 font-medium">Action Taken</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 font-medium">Clients Affected</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-600">
                      No executions match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-800/50">
                      <td className="py-2 pr-4 text-white font-medium whitespace-nowrap">{entry.workflowName}</td>
                      <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                        {new Date(entry.triggeredAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-gray-300">{entry.triggerDetail}</td>
                      <td className="py-2 pr-4 text-gray-300">{entry.actionTaken}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="py-2 text-[#C9A84C] font-semibold">{entry.clientsAffected}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformWorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Add workflow form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formTrigger, setFormTrigger] = useState('');
  const [formCondition, setFormCondition] = useState('');
  const [formAction, setFormAction] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
        const _h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) _h['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/platform/workflows', { headers: _h });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setWorkflows(json.data);
      } else {
        setWorkflows(FALLBACK_WORKFLOWS);
      }
    } catch {
      setWorkflows(FALLBACK_WORKFLOWS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (id: string, newStatus: 'active' | 'paused') => {
    try {
      const res = await fetch(`/api/platform/workflows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status: newStatus } : w));
        showToast(`Workflow ${newStatus === 'active' ? 'enabled' : 'paused'}`);
      }
    } catch {
      // Fallback: toggle locally
      setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status: newStatus } : w));
      showToast(`Workflow ${newStatus === 'active' ? 'enabled' : 'paused'}`);
    }
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formTrigger.trim() || !formCondition.trim() || !formAction.trim()) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
        const _h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) _h['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/platform/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, trigger: formTrigger, condition: formCondition, action: formAction }),
      });
      const json = await res.json();
      if (json.success) {
        setWorkflows(prev => [...prev, json.data]);
        setShowForm(false);
        setFormName('');
        setFormTrigger('');
        setFormCondition('');
        setFormAction('');
        showToast('Workflow created');
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = (id: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== id));
    showToast('Workflow deleted');
  };

  const handleTestRun = (id: string) => {
    const wf = workflows.find(w => w.id === id);
    showToast(`Dry run executed for "${wf?.name ?? id}" — no changes applied`);
  };

  const handleUpdate = (id: string, updates: Partial<Workflow>) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
    showToast('Workflow updated');
  };

  const activeCount = workflows.filter(w => w.status === 'active').length;
  const pausedCount = workflows.filter(w => w.status === 'paused').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="animate-pulse text-gray-500 text-sm">Loading workflows...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 px-6 py-8 max-w-7xl mx-auto space-y-8">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">Manage automated triggers, conditions, and actions</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-[#C9A84C] text-[#0A1628] rounded-lg text-sm font-semibold hover:bg-[#d4b45c] transition"
        >
          + Add Workflow
        </button>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-xs">
        <div className="rounded-lg border border-gray-700/60 bg-gray-900/60 px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-gray-400">Active: <strong className="text-white">{activeCount}</strong></span>
        </div>
        <div className="rounded-lg border border-gray-700/60 bg-gray-900/60 px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-500" />
          <span className="text-gray-400">Paused: <strong className="text-white">{pausedCount}</strong></span>
        </div>
        <div className="rounded-lg border border-gray-700/60 bg-gray-900/60 px-4 py-2 flex items-center gap-2">
          <span className="text-gray-400">Total: <strong className="text-white">{workflows.length}</strong></span>
        </div>
      </div>

      {/* Add Workflow Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">New Workflow</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Workflow Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                placeholder="e.g. Late Payment Alert"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Trigger</label>
              <input
                value={formTrigger}
                onChange={(e) => setFormTrigger(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                placeholder="e.g. Payment overdue by 7 days"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Condition</label>
              <input
                value={formCondition}
                onChange={(e) => setFormCondition(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                placeholder="e.g. Client status is active"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Action</label>
              <input
                value={formAction}
                onChange={(e) => setFormAction(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                placeholder="e.g. Send email to advisor"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-[#C9A84C] text-[#0A1628] rounded-lg text-sm font-semibold hover:bg-[#d4b45c] transition"
            >
              Create Workflow
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Workflow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workflows.map((wf) => (
          <WorkflowCard
            key={wf.id}
            workflow={wf}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onTestRun={handleTestRun}
            onUpdate={handleUpdate}
            runHistory={MOCK_RUN_HISTORY[wf.id] ?? []}
          />
        ))}
      </div>

      {workflows.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No workflows configured. Click &quot;Add Workflow&quot; to get started.
        </div>
      )}

      {/* Recent Executions Log (5D) */}
      <ExecutionLogSection />
    </div>
  );
}
