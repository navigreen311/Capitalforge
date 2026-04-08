'use client';

// ============================================================
// /platform/workflows — Platform Workflow Manager
// Workflow list with enable/disable toggle, pre-built workflows,
// trigger/condition/action display, structured add workflow form
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';

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

// ── Trigger / Condition / Action definitions ────────────────

type TriggerKey =
  | 'apr_expires'
  | 'readiness_score_exceeds'
  | 'application_declined'
  | 'ack_unsigned'
  | 'payment_missed'
  | 'utilization_exceeds'
  | 'round_completed'
  | 'hardship_added'
  | 'referral_converted'
  | 'compliance_failed';

interface TriggerDef {
  key: TriggerKey;
  label: string;
  /** If set, the trigger accepts an N-value parameter */
  nParam?: { label: string; placeholder: string; defaultValue: string; suffix?: string };
  /** Template for constructing the trigger string. {n} is replaced with N-value */
  template: string;
  /** Context-sensitive conditions offered for this trigger */
  conditions: string[];
  /** Default condition index */
  defaultConditionIdx: number;
  /** Suggested workflow name */
  defaultName: string;
  /** Suggested action key */
  defaultAction: string;
}

const TRIGGERS: TriggerDef[] = [
  {
    key: 'apr_expires',
    label: 'APR expires',
    nParam: { label: 'Days before expiry', placeholder: '30', defaultValue: '30', suffix: 'days' },
    template: 'APR expires in {n} days',
    conditions: [
      'Client has active card with intro APR',
      'Client has active balance transfer',
      'Client has any open tradeline',
    ],
    defaultConditionIdx: 0,
    defaultName: 'APR Expiry Alert',
    defaultAction: 'action_queue',
  },
  {
    key: 'readiness_score_exceeds',
    label: 'Readiness score exceeds',
    nParam: { label: 'Score threshold', placeholder: '75', defaultValue: '75' },
    template: 'Client readiness score exceeds {n}',
    conditions: [
      'Last funded round > 90 days ago',
      'Client has no pending applications',
      'All tradelines in good standing',
    ],
    defaultConditionIdx: 0,
    defaultName: 'Restack Ready Flag',
    defaultAction: 'flag_client',
  },
  {
    key: 'application_declined',
    label: 'Application declined',
    template: 'Application is declined',
    conditions: [
      'Issuer allows reconsideration',
      'Client has alternative issuer options',
      'Decline reason is addressable',
    ],
    defaultConditionIdx: 0,
    defaultName: 'Decline Reconsideration',
    defaultAction: 'generate_document',
  },
  {
    key: 'ack_unsigned',
    label: 'Acknowledgment unsigned',
    nParam: { label: 'Days overdue', placeholder: '7', defaultValue: '7', suffix: 'days' },
    template: 'Acknowledgment unsigned for {n} days',
    conditions: [
      'Client has pending acknowledgment',
      'Client is in active onboarding',
      'No prior reminder sent in last 48h',
    ],
    defaultConditionIdx: 0,
    defaultName: 'Unsigned Ack Reminder',
    defaultAction: 'email_client',
  },
  {
    key: 'payment_missed',
    label: 'Payment missed',
    nParam: { label: 'Days overdue', placeholder: '7', defaultValue: '7', suffix: 'days' },
    template: 'Payment missed by {n} days',
    conditions: [
      'Client status is active',
      'Balance exceeds minimum threshold',
      'No hardship plan in effect',
    ],
    defaultConditionIdx: 0,
    defaultName: 'Late Payment Alert',
    defaultAction: 'email_advisor',
  },
  {
    key: 'utilization_exceeds',
    label: 'Utilization exceeds',
    nParam: { label: 'Utilization %', placeholder: '30', defaultValue: '30', suffix: '%' },
    template: 'Credit utilization exceeds {n}%',
    conditions: [
      'Client is in active funding round',
      'Client has credit score goal',
      'Tradeline age > 6 months',
    ],
    defaultConditionIdx: 0,
    defaultName: 'High Utilization Warning',
    defaultAction: 'action_queue',
  },
  {
    key: 'round_completed',
    label: 'Round completed',
    template: 'Funding round is completed',
    conditions: [
      'All tradelines funded and verified',
      'Client has remaining credit capacity',
      'No outstanding compliance items',
    ],
    defaultConditionIdx: 0,
    defaultName: 'Round Completion Follow-up',
    defaultAction: 'slack',
  },
  {
    key: 'hardship_added',
    label: 'Hardship added',
    template: 'Hardship plan is added to client',
    conditions: [
      'Client has active tradelines',
      'Client has upcoming payments',
      'No prior hardship on file',
    ],
    defaultConditionIdx: 0,
    defaultName: 'Hardship Notification',
    defaultAction: 'email_advisor',
  },
  {
    key: 'referral_converted',
    label: 'Referral converted',
    template: 'Referral converts to funded client',
    conditions: [
      'Referrer is active client',
      'Referral completed first round',
      'Referral passed compliance check',
    ],
    defaultConditionIdx: 0,
    defaultName: 'Referral Reward Trigger',
    defaultAction: 'action_queue',
  },
  {
    key: 'compliance_failed',
    label: 'Compliance failed',
    template: 'Compliance check fails',
    conditions: [
      'Client has pending applications',
      'Client is in active round',
      'Failure is blocking-level severity',
    ],
    defaultConditionIdx: 0,
    defaultName: 'Compliance Failure Alert',
    defaultAction: 'compliance_task',
  },
];

interface ActionDef {
  key: string;
  label: string;
}

const ACTIONS: ActionDef[] = [
  { key: 'action_queue', label: 'Create action queue item' },
  { key: 'voiceforge', label: 'Send VoiceForge campaign' },
  { key: 'email_client', label: 'Email client' },
  { key: 'email_advisor', label: 'Email advisor' },
  { key: 'generate_document', label: 'Generate document' },
  { key: 'flag_client', label: 'Flag client' },
  { key: 'compliance_task', label: 'Create compliance task' },
  { key: 'docusign', label: 'Send DocuSign envelope' },
  { key: 'slack', label: 'Send Slack notification' },
  { key: 'webhook', label: 'Fire webhook' },
];

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

// ── Styled Select ────────────────────────────────────────────

function FormSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C] appearance-none"
      >
        <option value="" disabled>{placeholder ?? 'Select...'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
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
  const [formTriggerKey, setFormTriggerKey] = useState('');
  const [formNValue, setFormNValue] = useState('');
  const [formCondition, setFormCondition] = useState('');
  const [formAction, setFormAction] = useState('');

  const selectedTrigger = useMemo(
    () => TRIGGERS.find((t) => t.key === formTriggerKey) ?? null,
    [formTriggerKey],
  );

  const conditionOptions = useMemo(
    () => selectedTrigger?.conditions.map((c) => ({ value: c, label: c })) ?? [],
    [selectedTrigger],
  );

  // When trigger changes, auto-populate defaults
  const handleTriggerChange = useCallback((key: string) => {
    setFormTriggerKey(key);
    const def = TRIGGERS.find((t) => t.key === key);
    if (def) {
      setFormName(def.defaultName);
      setFormCondition(def.conditions[def.defaultConditionIdx]);
      setFormAction(def.defaultAction);
      setFormNValue(def.nParam?.defaultValue ?? '');
    } else {
      setFormCondition('');
      setFormAction('');
      setFormNValue('');
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

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

  // ── 5A: Optimistic toggle with mock PATCH ─────────────────
  const handleToggle = useCallback(async (id: string, newStatus: 'active' | 'paused') => {
    // Optimistic update — immediately reflect in UI
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, status: newStatus } : w)));
    const label = newStatus === 'active' ? 'activated' : 'paused';
    showToast(`Workflow ${label}`);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      const _h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) _h['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/platform/workflows/${id}`, {
        method: 'PATCH',
        headers: _h,
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) {
        // Revert on server failure
        const revertStatus = newStatus === 'active' ? 'paused' : 'active';
        setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, status: revertStatus } : w)));
        showToast('Failed to update workflow — reverted');
      }
    } catch {
      // Mock API: treat network error as success (mock mode)
      // In production this would revert the optimistic update
    }
  }, [showToast]);

  // ── Build trigger string from form state ───────────────────
  const buildTriggerString = useCallback((): string => {
    if (!selectedTrigger) return '';
    if (selectedTrigger.nParam) {
      return selectedTrigger.template.replace('{n}', formNValue || selectedTrigger.nParam.defaultValue);
    }
    return selectedTrigger.template;
  }, [selectedTrigger, formNValue]);

  const handleCreate = useCallback(async () => {
    const triggerStr = buildTriggerString();
    const actionLabel = ACTIONS.find((a) => a.key === formAction)?.label ?? formAction;
    if (!formName.trim() || !triggerStr || !formCondition || !formAction) return;

    const newWorkflow: Workflow = {
      id: `wf_${Date.now()}`,
      name: formName.trim(),
      trigger: triggerStr,
      condition: formCondition,
      action: actionLabel,
      status: 'active',
      lastTriggered: null,
      createdAt: new Date().toISOString(),
    };

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      const _h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) _h['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/platform/workflows', {
        method: 'POST',
        headers: _h,
        body: JSON.stringify({ name: newWorkflow.name, trigger: newWorkflow.trigger, condition: newWorkflow.condition, action: newWorkflow.action }),
      });
      const json = await res.json();
      if (json.success) {
        setWorkflows((prev) => [...prev, json.data]);
      } else {
        // Fallback: add locally
        setWorkflows((prev) => [...prev, newWorkflow]);
      }
    } catch {
      // Mock mode: add locally
      setWorkflows((prev) => [...prev, newWorkflow]);
    }

    setShowForm(false);
    setFormName('');
    setFormTriggerKey('');
    setFormNValue('');
    setFormCondition('');
    setFormAction('');
    showToast('Workflow created');
  }, [formName, formCondition, formAction, buildTriggerString, showToast]);

  const activeCount = workflows.filter((w) => w.status === 'active').length;
  const pausedCount = workflows.filter((w) => w.status === 'paused').length;

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

      {/* ── Structured Add Workflow Form (5B) ───────────────── */}
      {showForm && (
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">New Workflow</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Trigger dropdown */}
            <FormSelect
              label="Trigger"
              value={formTriggerKey}
              onChange={handleTriggerChange}
              options={TRIGGERS.map((t) => ({ value: t.key, label: t.label }))}
              placeholder="Select a trigger..."
            />

            {/* N-value input (conditional) */}
            {selectedTrigger?.nParam ? (
              <div>
                <label className="text-xs text-gray-400 block mb-1">{selectedTrigger.nParam.label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formNValue}
                    onChange={(e) => setFormNValue(e.target.value)}
                    placeholder={selectedTrigger.nParam.placeholder}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                  />
                  {selectedTrigger.nParam.suffix && (
                    <span className="text-xs text-gray-500 shrink-0">{selectedTrigger.nParam.suffix}</span>
                  )}
                </div>
              </div>
            ) : (
              /* Spacer to keep grid alignment when no N-param */
              <div />
            )}

            {/* Workflow Name */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Workflow Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                placeholder="e.g. Late Payment Alert"
              />
            </div>

            {/* Condition dropdown (context-sensitive) */}
            <FormSelect
              label="Condition"
              value={formCondition}
              onChange={setFormCondition}
              options={conditionOptions}
              placeholder={selectedTrigger ? 'Select a condition...' : 'Select a trigger first'}
            />

            {/* Action dropdown */}
            <FormSelect
              label="Action"
              value={formAction}
              onChange={setFormAction}
              options={ACTIONS.map((a) => ({ value: a.key, label: a.label }))}
              placeholder="Select an action..."
            />
          </div>

          {/* Preview */}
          {selectedTrigger && (
            <div className="rounded-lg bg-gray-800/60 border border-gray-700/40 px-4 py-3 text-xs space-y-1">
              <p className="text-gray-500 font-medium uppercase tracking-wide text-[10px] mb-2">Preview</p>
              <p><span className="text-gray-500">When:</span> <span className="text-gray-300">{buildTriggerString()}</span></p>
              <p><span className="text-gray-500">If:</span> <span className="text-gray-300">{formCondition || '—'}</span></p>
              <p><span className="text-gray-500">Then:</span> <span className="text-[#C9A84C]">{ACTIONS.find((a) => a.key === formAction)?.label || '—'}</span></p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={!formName.trim() || !formTriggerKey || !formCondition || !formAction}
              className="px-4 py-2 bg-[#C9A84C] text-[#0A1628] rounded-lg text-sm font-semibold hover:bg-[#d4b45c] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create Workflow
            </button>
            <button
              onClick={() => { setShowForm(false); setFormTriggerKey(''); setFormNValue(''); setFormCondition(''); setFormAction(''); setFormName(''); }}
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
