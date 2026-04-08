'use client';

// ============================================================
// /platform/workflows — Platform Workflow Manager
// Workflow list with enable/disable toggle, pre-built workflows,
// trigger/condition/action display, add workflow form
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

// ── Fallback mock data ──────────────────────────────────────

const FALLBACK_WORKFLOWS: Workflow[] = [
  { id: 'wf_001', name: 'APR Expiry Alert', trigger: 'APR expires in 30 days', condition: 'Client has active card with intro APR', action: 'Create action queue item + Send VoiceForge campaign', status: 'active', lastTriggered: '2026-04-06T09:00:00Z', createdAt: '2025-11-01T10:00:00Z' },
  { id: 'wf_002', name: 'Restack Ready Flag', trigger: 'Client readiness score exceeds 75', condition: 'Last funded round > 90 days ago', action: 'Flag client as restack ready', status: 'active', lastTriggered: '2026-04-05T14:30:00Z', createdAt: '2025-12-15T08:00:00Z' },
  { id: 'wf_003', name: 'Decline Reconsideration', trigger: 'Application is declined', condition: 'Issuer allows reconsideration', action: 'Generate reconsideration letter draft', status: 'active', lastTriggered: '2026-04-03T11:15:00Z', createdAt: '2026-01-10T09:00:00Z' },
  { id: 'wf_004', name: 'Unsigned Acknowledgment Reminder', trigger: 'Acknowledgment unsigned for 7 days', condition: 'Client has pending acknowledgment', action: 'Send email reminder to client', status: 'paused', lastTriggered: null, createdAt: '2026-02-20T12:00:00Z' },
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
      onClick={onToggle}
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

// ── Workflow Card ─────────────────────────────────────────────

function WorkflowCard({
  workflow,
  onToggle,
}: {
  workflow: Workflow;
  onToggle: (id: string, newStatus: 'active' | 'paused') => void;
}) {
  const isActive = workflow.status === 'active';
  return (
    <div className={`rounded-xl border p-5 transition ${
      isActive ? 'border-gray-700/60 bg-gray-900/60' : 'border-gray-800 bg-gray-900/30 opacity-70'
    }`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{workflow.name}</h3>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded mt-1 inline-block ${
            isActive ? 'bg-emerald-900/40 text-emerald-400' : 'bg-gray-800 text-gray-500'
          }`}>
            {workflow.status}
          </span>
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
        setToast(`Workflow ${newStatus === 'active' ? 'enabled' : 'paused'}`);
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      // ignore
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
        setToast('Workflow created');
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      // ignore
    }
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
          <WorkflowCard key={wf.id} workflow={wf} onToggle={handleToggle} />
        ))}
      </div>

      {workflows.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No workflows configured. Click &quot;Add Workflow&quot; to get started.
        </div>
      )}
    </div>
  );
}
