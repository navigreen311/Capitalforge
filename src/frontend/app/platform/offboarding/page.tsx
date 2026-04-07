'use client';

// ============================================================
// /platform/offboarding — Offboarding Management
// Request table, new offboarding form, data deletion checklist,
// 30-day retention hold indicator, status workflow.
// ============================================================

import { useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────

type OffboardingStatus = 'requested' | 'retention_hold' | 'deleting' | 'completed';
type OffboardingReason = 'graduated' | 'requested' | 'non-payment' | 'compliance';

interface DeletionChecklist {
  documents: boolean;
  events: boolean;
  creditData: boolean;
  achRecords: boolean;
}

interface OffboardingRequest {
  id: string;
  businessName: string;
  businessId: string;
  reason: OffboardingReason;
  requestedDate: string;
  deletionDate: string;
  status: OffboardingStatus;
  checklist: DeletionChecklist;
  notes: string;
}

// ── Mock Data ────────────────────────────────────────────────

const MOCK_BUSINESSES = [
  { id: 'biz-001', name: 'Apex Ventures LLC' },
  { id: 'biz-002', name: 'NovaBridge Capital' },
  { id: 'biz-003', name: 'Horizon Retail Partners' },
  { id: 'biz-004', name: 'BlueStar Holdings' },
  { id: 'biz-005', name: 'Meridian Finance Group' },
];

const INITIAL_REQUESTS: OffboardingRequest[] = [
  {
    id: 'off-001',
    businessName: 'SilverPeak Solutions',
    businessId: 'biz-010',
    reason: 'graduated',
    requestedDate: '2026-03-15',
    deletionDate: '2026-04-14',
    status: 'retention_hold',
    checklist: { documents: false, events: false, creditData: false, achRecords: false },
    notes: 'Client successfully funded, graduating from program.',
  },
  {
    id: 'off-002',
    businessName: 'Ironclad Industries',
    businessId: 'biz-011',
    reason: 'non-payment',
    requestedDate: '2026-03-01',
    deletionDate: '2026-03-31',
    status: 'deleting',
    checklist: { documents: true, events: true, creditData: false, achRecords: false },
    notes: '90 days past due. Final notice sent.',
  },
  {
    id: 'off-003',
    businessName: 'Coastal Commerce LLC',
    businessId: 'biz-012',
    reason: 'requested',
    requestedDate: '2026-02-20',
    deletionDate: '2026-03-22',
    status: 'completed',
    checklist: { documents: true, events: true, creditData: true, achRecords: true },
    notes: 'Client requested voluntary exit.',
  },
  {
    id: 'off-004',
    businessName: 'RedLine Logistics',
    businessId: 'biz-013',
    reason: 'compliance',
    requestedDate: '2026-04-01',
    deletionDate: '2026-05-01',
    status: 'requested',
    checklist: { documents: false, events: false, creditData: false, achRecords: false },
    notes: 'Multiple compliance violations. Escalated by risk team.',
  },
  {
    id: 'off-005',
    businessName: 'GreenField Organics',
    businessId: 'biz-014',
    reason: 'graduated',
    requestedDate: '2026-03-25',
    deletionDate: '2026-04-24',
    status: 'retention_hold',
    checklist: { documents: false, events: false, creditData: false, achRecords: false },
    notes: 'Successfully funded. 30-day retention hold active.',
  },
];

// ── Helpers ──────────────────────────────────────────────────

const STATUS_STEPS: OffboardingStatus[] = ['requested', 'retention_hold', 'deleting', 'completed'];

const STATUS_LABELS: Record<OffboardingStatus, string> = {
  requested: 'Requested',
  retention_hold: 'Retention Hold',
  deleting: 'Deleting',
  completed: 'Completed',
};

const STATUS_COLORS: Record<OffboardingStatus, string> = {
  requested: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  retention_hold: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  deleting: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const REASON_LABELS: Record<OffboardingReason, string> = {
  graduated: 'Graduated',
  requested: 'Client Requested',
  'non-payment': 'Non-Payment',
  compliance: 'Compliance',
};

const REASON_COLORS: Record<OffboardingReason, string> = {
  graduated: 'text-emerald-400',
  requested: 'text-blue-400',
  'non-payment': 'text-orange-400',
  compliance: 'text-red-400',
};

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date('2026-04-07');
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Components ───────────────────────────────────────────────

function StatusWorkflow({ status }: { status: OffboardingStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                isComplete
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                    ? 'bg-[#C9A84C] text-[#0A1628]'
                    : 'bg-gray-700 text-gray-500'
              }`}
            >
              {isComplete ? '\u2713' : idx + 1}
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`w-6 h-0.5 ${idx < currentIdx ? 'bg-emerald-500' : 'bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChecklistItem({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <label className={`flex items-center gap-3 py-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-4 h-4 rounded border-gray-600 bg-[#111c33] text-[#C9A84C] focus:ring-[#C9A84C]/50"
      />
      <span className={`text-sm ${checked ? 'text-emerald-400 line-through' : 'text-gray-300'}`}>{label}</span>
      {checked && <span className="text-xs text-emerald-400">Deleted</span>}
    </label>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformOffboardingPage() {
  const [requests, setRequests] = useState<OffboardingRequest[]>(INITIAL_REQUESTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OffboardingStatus | 'all'>('all');

  // New request form state
  const [formBizId, setFormBizId] = useState('');
  const [formReason, setFormReason] = useState<OffboardingReason>('requested');
  const [formDate, setFormDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const filteredRequests = statusFilter === 'all' ? requests : requests.filter((r) => r.status === statusFilter);

  const handleCreateRequest = useCallback(() => {
    if (!formBizId) return;
    const biz = MOCK_BUSINESSES.find((b) => b.id === formBizId);
    if (!biz) return;

    const deletionDate = formDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const newReq: OffboardingRequest = {
      id: `off-${String(requests.length + 1).padStart(3, '0')}`,
      businessName: biz.name,
      businessId: biz.id,
      reason: formReason,
      requestedDate: new Date().toISOString().slice(0, 10),
      deletionDate,
      status: 'requested',
      checklist: { documents: false, events: false, creditData: false, achRecords: false },
      notes: formNotes,
    };

    setRequests((prev) => [newReq, ...prev]);
    setShowForm(false);
    setFormBizId('');
    setFormReason('requested');
    setFormDate('');
    setFormNotes('');
  }, [formBizId, formReason, formDate, formNotes, requests.length]);

  const advanceStatus = useCallback(
    (id: string) => {
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const idx = STATUS_STEPS.indexOf(r.status);
          if (idx >= STATUS_STEPS.length - 1) return r;
          return { ...r, status: STATUS_STEPS[idx + 1] };
        }),
      );
    },
    [],
  );

  const toggleChecklist = useCallback(
    (id: string, key: keyof DeletionChecklist) => {
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          return { ...r, checklist: { ...r.checklist, [key]: !r.checklist[key] } };
        }),
      );
    },
    [],
  );

  // Counts
  const counts = {
    all: requests.length,
    requested: requests.filter((r) => r.status === 'requested').length,
    retention_hold: requests.filter((r) => r.status === 'retention_hold').length,
    deleting: requests.filter((r) => r.status === 'deleting').length,
    completed: requests.filter((r) => r.status === 'completed').length,
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Offboarding Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage client offboarding requests, data deletion, and retention holds.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-5 py-2.5 bg-[#C9A84C] text-[#0A1628] font-semibold rounded-lg hover:bg-[#b8993f] transition"
        >
          New Offboarding Request
        </button>
      </div>

      {/* New Request Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">New Offboarding Request</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1">Select Business</label>
                <select
                  value={formBizId}
                  onChange={(e) => setFormBizId(e.target.value)}
                  className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C]"
                >
                  <option value="">-- Choose a business --</option>
                  {MOCK_BUSINESSES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1">Reason</label>
                <select
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value as OffboardingReason)}
                  className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C]"
                >
                  <option value="graduated">Graduated</option>
                  <option value="requested">Client Requested</option>
                  <option value="non-payment">Non-Payment</option>
                  <option value="compliance">Compliance</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1">Scheduled Deletion Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C]"
                />
                <p className="text-xs text-gray-500 mt-1">Leave blank for 30-day default retention hold.</p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C] resize-none"
                  placeholder="Additional context..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRequest}
                disabled={!formBizId}
                className="px-5 py-2 bg-[#C9A84C] text-[#0A1628] font-semibold text-sm rounded-lg hover:bg-[#b8993f] transition disabled:opacity-50"
              >
                Create Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {(['all', ...STATUS_STEPS] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-xs font-medium rounded-lg border whitespace-nowrap transition ${
              statusFilter === s
                ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                : 'border-gray-700/50 text-gray-400 hover:border-gray-600'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]} ({counts[s]})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Request Table */}
        <div className="lg:col-span-2">
          <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left text-xs text-gray-500 font-medium p-4">Business</th>
                  <th className="text-left text-xs text-gray-500 font-medium p-4">Reason</th>
                  <th className="text-left text-xs text-gray-500 font-medium p-4">Requested</th>
                  <th className="text-left text-xs text-gray-500 font-medium p-4">Status</th>
                  <th className="text-center text-xs text-gray-500 font-medium p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`border-b border-gray-700/30 cursor-pointer transition hover:bg-[#111c33] ${
                      selectedId === r.id ? 'bg-[#111c33]' : ''
                    }`}
                  >
                    <td className="p-4 text-gray-200 font-medium">{r.businessName}</td>
                    <td className="p-4">
                      <span className={`text-xs font-medium ${REASON_COLORS[r.reason]}`}>
                        {REASON_LABELS[r.reason]}
                      </span>
                    </td>
                    <td className="p-4 text-gray-400">{r.requestedDate}</td>
                    <td className="p-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full border ${STATUS_COLORS[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {r.status !== 'completed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            advanceStatus(r.id);
                          }}
                          className="text-xs text-[#C9A84C] hover:text-[#b8993f] font-medium"
                        >
                          Advance
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No offboarding requests match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-1">
          {selected ? (
            <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-5 space-y-5">
              <div>
                <h3 className="text-base font-bold text-white">{selected.businessName}</h3>
                <p className="text-xs text-gray-400 mt-1">{selected.id}</p>
              </div>

              {/* Status Workflow */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Status Workflow</p>
                <StatusWorkflow status={selected.status} />
                <div className="flex gap-2 mt-2">
                  {STATUS_STEPS.map((step, idx) => (
                    <span key={step} className="text-[10px] text-gray-500 flex-1 text-center">
                      {STATUS_LABELS[step]}
                    </span>
                  ))}
                </div>
              </div>

              {/* 30-Day Retention Hold Indicator */}
              {selected.status === 'retention_hold' && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-xs font-semibold text-yellow-400">30-Day Retention Hold Active</p>
                  <p className="text-xs text-yellow-400/70 mt-1">
                    {daysUntil(selected.deletionDate) > 0
                      ? `${daysUntil(selected.deletionDate)} days remaining until scheduled deletion`
                      : 'Retention period expired -- ready to proceed'}
                  </p>
                  <div className="mt-2 h-1.5 bg-yellow-500/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, ((30 - daysUntil(selected.deletionDate)) / 30) * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Reason & Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Reason</p>
                  <p className={`text-sm font-medium ${REASON_COLORS[selected.reason]}`}>
                    {REASON_LABELS[selected.reason]}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Deletion Date</p>
                  <p className="text-sm text-gray-200">{selected.deletionDate}</p>
                </div>
              </div>

              {/* Notes */}
              {selected.notes && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-300">{selected.notes}</p>
                </div>
              )}

              {/* Data Deletion Checklist */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
                  Data Deletion Checklist
                </p>
                <div className="bg-[#111c33] rounded-lg p-3 space-y-1">
                  <ChecklistItem
                    label="Documents & Files"
                    checked={selected.checklist.documents}
                    onChange={() => toggleChecklist(selected.id, 'documents')}
                    disabled={selected.status === 'completed' || selected.status === 'requested'}
                  />
                  <ChecklistItem
                    label="Ledger Events"
                    checked={selected.checklist.events}
                    onChange={() => toggleChecklist(selected.id, 'events')}
                    disabled={selected.status === 'completed' || selected.status === 'requested'}
                  />
                  <ChecklistItem
                    label="Credit Data & Scores"
                    checked={selected.checklist.creditData}
                    onChange={() => toggleChecklist(selected.id, 'creditData')}
                    disabled={selected.status === 'completed' || selected.status === 'requested'}
                  />
                  <ChecklistItem
                    label="ACH Records"
                    checked={selected.checklist.achRecords}
                    onChange={() => toggleChecklist(selected.id, 'achRecords')}
                    disabled={selected.status === 'completed' || selected.status === 'requested'}
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                  Checklist items can only be marked during Retention Hold or Deleting phases.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-8 text-center">
              <p className="text-gray-500 text-sm">Select a request to view details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
