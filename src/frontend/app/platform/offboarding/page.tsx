'use client';

// ============================================================
// /platform/offboarding — Offboarding Management
// Request table, new offboarding form, data deletion checklist,
// 30-day retention hold indicator, status workflow.
// Case detail panel with advance-stage workflow.
// ============================================================

import { useState, useCallback, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────

type OffboardingStatus = 'requested' | 'retention_hold' | 'deleting' | 'completed';
type OffboardingReason = 'graduated' | 'requested' | 'non-payment' | 'compliance';

interface AuditEntry {
  timestamp: string;
  action: string;
  recordCount?: number;
  status: 'deleted' | 'retained';
  retentionReason?: string;
}

interface DeletionChecklist {
  clientProfile: boolean;
  applications: boolean;
  documents: boolean;
  consent: boolean;
  financial: boolean;
  communications: boolean;
}

interface RetainedItem {
  label: string;
  reason: 'legal_hold' | 'regulatory';
}

interface ActivityEvent {
  timestamp: string;
  action: string;
  user: string;
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
  retainedItems: RetainedItem[];
  activityLog: ActivityEvent[];
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

const EMPTY_CHECKLIST: DeletionChecklist = {
  clientProfile: false,
  applications: false,
  documents: false,
  consent: false,
  financial: false,
  communications: false,
};

const CHECKLIST_LABELS: Record<keyof DeletionChecklist, string> = {
  clientProfile: 'Client Profile',
  applications: 'Applications',
  documents: 'Documents',
  consent: 'Consent Records',
  financial: 'Financial Data',
  communications: 'Communications',
};

const INITIAL_REQUESTS: OffboardingRequest[] = [
  {
    id: 'off-001',
    businessName: 'SilverPeak Solutions',
    businessId: 'biz-010',
    reason: 'graduated',
    requestedDate: '2026-03-15',
    deletionDate: '2026-04-14',
    status: 'retention_hold',
    checklist: { ...EMPTY_CHECKLIST },
    retainedItems: [
      { label: 'Tax filings (IRS 7-year hold)', reason: 'regulatory' },
      { label: 'Loan agreement records', reason: 'legal_hold' },
    ],
    activityLog: [
      { timestamp: '2026-03-15 09:12', action: 'Offboarding request created', user: 'Sarah Chen' },
      { timestamp: '2026-03-15 14:30', action: 'Status advanced to Retention Hold', user: 'System' },
      { timestamp: '2026-03-20 10:05', action: 'Retention hold acknowledged by compliance', user: 'Mark Liu' },
    ],
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
    checklist: { clientProfile: false, applications: false, documents: true, consent: true, financial: false, communications: false },
    retainedItems: [
      { label: 'Outstanding debt records', reason: 'legal_hold' },
    ],
    activityLog: [
      { timestamp: '2026-03-01 11:00', action: 'Offboarding request created', user: 'James Wright' },
      { timestamp: '2026-03-01 11:05', action: 'Status advanced to Retention Hold', user: 'James Wright' },
      { timestamp: '2026-03-15 08:00', action: 'Retention period expired', user: 'System' },
      { timestamp: '2026-03-15 08:01', action: 'Status advanced to Deleting', user: 'System' },
    ],
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
    checklist: { clientProfile: true, applications: true, documents: true, consent: true, financial: true, communications: true },
    retainedItems: [],
    activityLog: [
      { timestamp: '2026-02-20 15:20', action: 'Offboarding request created', user: 'Sarah Chen' },
      { timestamp: '2026-02-20 15:25', action: 'Status advanced to Retention Hold', user: 'Sarah Chen' },
      { timestamp: '2026-03-10 09:00', action: 'Status advanced to Deleting', user: 'Mark Liu' },
      { timestamp: '2026-03-22 00:00', action: 'All data deleted. Status set to Completed.', user: 'System' },
    ],
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
    checklist: { ...EMPTY_CHECKLIST },
    retainedItems: [
      { label: 'KYC/AML audit trail', reason: 'regulatory' },
      { label: 'Compliance violation reports', reason: 'regulatory' },
      { label: 'Legal correspondence', reason: 'legal_hold' },
    ],
    activityLog: [
      { timestamp: '2026-04-01 10:30', action: 'Offboarding request created', user: 'Risk Team' },
      { timestamp: '2026-04-01 10:35', action: 'Compliance flag raised — review required', user: 'System' },
    ],
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
    checklist: { ...EMPTY_CHECKLIST },
    retainedItems: [
      { label: 'SBA loan documentation', reason: 'regulatory' },
    ],
    activityLog: [
      { timestamp: '2026-03-25 13:00', action: 'Offboarding request created', user: 'Sarah Chen' },
      { timestamp: '2026-03-25 13:10', action: 'Status advanced to Retention Hold', user: 'Sarah Chen' },
    ],
    notes: 'Successfully funded. 30-day retention hold active.',
  },
];

const MOCK_AUDIT_LOGS: Record<string, AuditEntry[]> = {
  'off-002': [
    { timestamp: '2026-03-31T09:00:00Z', action: 'Client profile archived', status: 'deleted' },
    { timestamp: '2026-03-31T09:01:12Z', action: 'Documents deleted', recordCount: 23, status: 'deleted' },
    { timestamp: '2026-03-31T09:01:45Z', action: 'Ledger events deleted', recordCount: 147, status: 'deleted' },
    { timestamp: '2026-03-31T09:02:30Z', action: 'ACH records RETAINED', recordCount: 5, status: 'retained', retentionReason: 'Pending dispute resolution' },
    { timestamp: '2026-03-31T09:03:00Z', action: 'Credit data RETAINED', recordCount: 3, status: 'retained', retentionReason: 'Regulatory 7-year hold' },
  ],
  'off-003': [
    { timestamp: '2026-03-22T10:00:00Z', action: 'Client profile deleted', status: 'deleted' },
    { timestamp: '2026-03-22T10:01:05Z', action: 'Documents deleted', recordCount: 15, status: 'deleted' },
    { timestamp: '2026-03-22T10:01:30Z', action: 'Ledger events deleted', recordCount: 89, status: 'deleted' },
    { timestamp: '2026-03-22T10:02:00Z', action: 'Credit data deleted', recordCount: 4, status: 'deleted' },
    { timestamp: '2026-03-22T10:02:20Z', action: 'ACH records deleted', recordCount: 12, status: 'deleted' },
    { timestamp: '2026-03-22T10:03:00Z', action: 'Applications deleted', recordCount: 8, status: 'deleted' },
    { timestamp: '2026-03-22T10:03:30Z', action: 'Financial records RETAINED', recordCount: 6, status: 'retained', retentionReason: 'Legal hold - active litigation' },
    { timestamp: '2026-03-22T10:04:00Z', action: 'Tax documents RETAINED', recordCount: 3, status: 'retained', retentionReason: 'IRS 7-year retention requirement' },
  ],
};

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

// ── Toast Component ─────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'info' | 'warning' | 'danger'; onClose: () => void }) {
  const colors = {
    success: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    info: 'bg-blue-500/20 border-blue-500/40 text-blue-300',
    warning: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
    danger: 'bg-red-500/20 border-red-500/40 text-red-300',
  };

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-6 right-6 z-[100] px-5 py-3 rounded-lg border text-sm font-medium shadow-lg ${colors[type]} animate-fade-in`}>
      {message}
    <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-4">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 text-white/70 hover:text-white">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Confirmation Modal ──────────────────────────────────────

function ConfirmationModal({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl w-full max-w-md p-6">
        <h2 className={`text-lg font-bold mb-2 ${danger ? 'text-red-400' : 'text-white'}`}>{title}</h2>
        <p className="text-sm text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition ${
              danger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-[#C9A84C] text-[#0A1628] hover:bg-[#b8993f]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
function AuditLog({ requestId, businessName }: { requestId: string; businessName: string }) {
  const entries = MOCK_AUDIT_LOGS[requestId];
  if (!entries || entries.length === 0) {
    return (
      <div className="bg-[#111c33] rounded-lg p-4 text-center">
        <p className="text-xs text-gray-500">No audit log entries available for this request.</p>
      </div>
    );
  }

  const deletedCount = entries.filter((e) => e.status === 'deleted').length;
  const retainedCount = entries.filter((e) => e.status === 'retained').length;
  const totalDeletedRecords = entries
    .filter((e) => e.status === 'deleted')
    .reduce((sum, e) => sum + (e.recordCount ?? 0), 0);
  const totalRetainedRecords = entries
    .filter((e) => e.status === 'retained')
    .reduce((sum, e) => sum + (e.recordCount ?? 0), 0);
  const retentionReasons = [...new Set(entries.filter((e) => e.retentionReason).map((e) => e.retentionReason!))];

  const handleDownloadCertificate = () => {
    const lines = [
      '========================================',
      '   DATA DELETION CERTIFICATE',
      '========================================',
      '',
      `Business:      ${businessName}`,
      `Request ID:    ${requestId}`,
      `Generated:     ${new Date().toISOString()}`,
      '',
      '--- DELETION SUMMARY ---',
      `Total actions deleted:   ${deletedCount}`,
      `Total records deleted:   ${totalDeletedRecords}`,
      `Total actions retained:  ${retainedCount}`,
      `Total records retained:  ${totalRetainedRecords}`,
      '',
      '--- AUDIT LOG ---',
      ...entries.map(
        (e) =>
          `[${new Date(e.timestamp).toLocaleString()}] ${e.action}${e.recordCount ? ` (${e.recordCount} records)` : ''} — ${e.status.toUpperCase()}${e.retentionReason ? ` | Reason: ${e.retentionReason}` : ''}`,
      ),
      '',
    ];

    if (retentionReasons.length > 0) {
      lines.push('--- RETENTION REASONS ---');
      retentionReasons.forEach((r) => lines.push(`  - ${r}`));
      lines.push('');
    }

    lines.push('========================================');
    lines.push('This certificate was generated automatically.');
    lines.push('Retain for compliance and audit purposes.');
    lines.push('========================================');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deletion-certificate-${requestId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Entries */}
      <div className="bg-[#111c33] rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
        {entries.map((entry, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs">
            <span className="text-gray-500 whitespace-nowrap flex-shrink-0">
              {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span
              className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
                entry.status === 'deleted' ? 'bg-red-400' : 'bg-emerald-400'
              }`}
            />
            <span className={entry.status === 'deleted' ? 'text-red-400' : 'text-emerald-400'}>
              {entry.action}
              {entry.recordCount != null && (
                <span className="text-gray-500"> ({entry.recordCount} records)</span>
              )}
              {entry.retentionReason && (
                <span className="text-gray-500 italic"> — {entry.retentionReason}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-red-400">{totalDeletedRecords}</p>
          <p className="text-[10px] text-red-400/70 uppercase tracking-wide">Records Deleted</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">{totalRetainedRecords}</p>
          <p className="text-[10px] text-emerald-400/70 uppercase tracking-wide">Records Retained</p>
        </div>
      </div>

      {/* Retention Reasons */}
      {retentionReasons.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
          <p className="text-[10px] text-yellow-400 font-medium uppercase tracking-wide mb-1">Retention Reasons</p>
          {retentionReasons.map((reason, idx) => (
            <p key={idx} className="text-xs text-yellow-400/80 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-yellow-400 flex-shrink-0" />
              {reason}
            </p>
          ))}
        </div>
      )}

      {/* Download Button */}
      <button
        onClick={handleDownloadCertificate}
        className="w-full px-4 py-2.5 bg-[#111c33] border border-gray-700/50 text-gray-300 text-xs font-medium rounded-lg hover:border-[#C9A84C] hover:text-[#C9A84C] transition flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Download Deletion Certificate
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformOffboardingPage() {
  const [requests, setRequests] = useState<OffboardingRequest[]>(INITIAL_REQUESTS);
  const [selectedId, setSelectedId] = useState<string | null>(INITIAL_REQUESTS[0]?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OffboardingStatus | 'all'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' | 'danger' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [toast, setToast] = useState<string | null>(null);

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
      checklist: { ...EMPTY_CHECKLIST },
      retainedItems: [],
      activityLog: [
        { timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16), action: 'Offboarding request created', user: 'Current User' },
      ],
      notes: formNotes,
    };

    setRequests((prev) => [newReq, ...prev]);
    setSelectedId(newReq.id);
    setStatusFilter('all');
    setShowForm(false);
    setFormBizId('');
    setFormReason('requested');
    setFormDate('');
    setFormNotes('');
    setToast(`Offboarding request created for ${biz.name}`);
  }, [formBizId, formReason, formDate, formNotes, requests.length]);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'danger' = 'success') => {
    setToast({ message, type });
  }, []);

  const doAdvance = useCallback(
    (id: string) => {
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const idx = STATUS_STEPS.indexOf(r.status);
          if (idx >= STATUS_STEPS.length - 1) return r;
          const nextStatus = STATUS_STEPS[idx + 1];
          return {
            ...r,
            status: nextStatus,
            activityLog: [
              ...r.activityLog,
              {
                timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
                action: `Status advanced to ${STATUS_LABELS[nextStatus]}`,
                user: 'Current User',
              },
            ],
          };
        }),
      );
    },
    [],
  );

  const advanceStatus = useCallback(
    (id: string) => {
      const req = requests.find((r) => r.id === id);
      if (!req) return;
      const idx = STATUS_STEPS.indexOf(req.status);
      if (idx >= STATUS_STEPS.length - 1) return;
      const nextStatus = STATUS_STEPS[idx + 1];

      if (nextStatus === 'deleting') {
        setConfirmModal({
          title: 'Confirm Data Deletion',
          message:
            'You are about to move this case to the Deleting stage. This will begin irreversible data deletion. Are you sure you want to proceed?',
          confirmLabel: 'Begin Deletion',
          danger: true,
          onConfirm: () => {
            doAdvance(id);
            showToast(`${req.businessName} advanced to Deleting`, 'danger');
            setConfirmModal(null);
          },
        });
      } else {
        doAdvance(id);
        showToast(`${req.businessName} advanced to ${STATUS_LABELS[nextStatus]}`, 'success');
      }
    },
    [requests, doAdvance, showToast],
  );

  const applyRetentionHold = useCallback(
    (id: string) => {
      const req = requests.find((r) => r.id === id);
      if (!req) return;
      showToast(`Retention hold applied to ${req.businessName}`, 'warning');
    },
    [requests, showToast],
  );

  const initiateDeletion = useCallback(
    (id: string) => {
      const req = requests.find((r) => r.id === id);
      if (!req) return;
      setConfirmModal({
        title: 'Initiate Immediate Deletion',
        message: `This will skip remaining retention periods and immediately begin deleting all data for ${req.businessName}. This action cannot be undone.`,
        confirmLabel: 'Delete All Data',
        danger: true,
        onConfirm: () => {
          setRequests((prev) =>
            prev.map((r) => {
              if (r.id !== id) return r;
              return {
                ...r,
                status: 'deleting' as OffboardingStatus,
                activityLog: [
                  ...r.activityLog,
                  {
                    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
                    action: 'Immediate deletion initiated — retention period skipped',
                    user: 'Current User',
                  },
                ],
              };
            }),
          );
          showToast(`Deletion initiated for ${req.businessName}`, 'danger');
          setConfirmModal(null);
        },
      });
    },
    [requests, showToast],
  );

  const markComplete = useCallback(
    (id: string) => {
      const req = requests.find((r) => r.id === id);
      if (!req) return;
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          return {
            ...r,
            status: 'completed' as OffboardingStatus,
            checklist: { clientProfile: true, applications: true, documents: true, consent: true, financial: true, communications: true },
            activityLog: [
              ...r.activityLog,
              {
                timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
                action: 'Offboarding marked as complete',
                user: 'Current User',
              },
            ],
          };
        }),
      );
      showToast(`${req.businessName} offboarding completed`, 'success');
    },
    [requests, showToast],
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
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Confirmation Modal */}
      {confirmModal && (
        <ConfirmationModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

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
            <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-5 space-y-5 max-h-[calc(100vh-12rem)] overflow-y-auto">
              {/* Header: Business name + status badge */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">{selected.businessName}</h3>
                  <p className="text-xs text-gray-400 mt-1">{selected.id}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>

              {/* Reason, requested date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Reason</p>
                  <p className={`text-sm font-medium ${REASON_COLORS[selected.reason]}`}>
                    {REASON_LABELS[selected.reason]}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Requested</p>
                  <p className="text-sm text-gray-200">{selected.requestedDate}</p>
                </div>
              </div>

              {/* Status Workflow */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Status Workflow</p>
                <StatusWorkflow status={selected.status} />
                <div className="flex gap-2 mt-2">
                  {STATUS_STEPS.map((step) => (
                    <span key={step} className="text-[10px] text-gray-500 flex-1 text-center">
                      {STATUS_LABELS[step]}
                    </span>
                  ))}
                </div>
              </div>

              {/* Retention Period */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Retention Period</p>
                {selected.status === 'completed' ? (
                  <p className="text-xs text-gray-500">Retention period completed.</p>
                ) : (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-yellow-400">
                        {selected.status === 'retention_hold' ? '30-Day Retention Hold Active' : 'Scheduled Deletion'}
                      </p>
                      <span className="text-xs font-mono text-yellow-300">
                        {daysUntil(selected.deletionDate) > 0 ? `${daysUntil(selected.deletionDate)}d` : '0d'}
                      </span>
                    </div>
                    <p className="text-xs text-yellow-400/70 mt-1">
                      {daysUntil(selected.deletionDate) > 0
                        ? `${daysUntil(selected.deletionDate)} days remaining until ${selected.deletionDate}`
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
              </div>

              {/* Data to be Deleted: Checklist */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
                  Data to be Deleted
                </p>
                <div className="bg-[#111c33] rounded-lg p-3 space-y-1">
                  {(Object.keys(CHECKLIST_LABELS) as (keyof DeletionChecklist)[]).map((key) => (
                    <ChecklistItem
                      key={key}
                      label={CHECKLIST_LABELS[key]}
                      checked={selected.checklist[key]}
                      onChange={() => toggleChecklist(selected.id, key)}
                      disabled={selected.status === 'completed' || selected.status === 'requested'}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                  Checklist items can only be marked during Retention Hold or Deleting phases.
                </p>
              </div>

              {/* Data to be Retained */}
              {selected.retainedItems.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
                    Data to be Retained
                  </p>
                  <div className="bg-[#111c33] rounded-lg p-3 space-y-2">
                    {selected.retainedItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-300">{item.label}</p>
                          <p className="text-[10px] text-gray-500">
                            {item.reason === 'legal_hold' ? 'Legal Hold' : 'Regulatory Requirement'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selected.notes && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-300">{selected.notes}</p>
                </div>
              )}

              {/* Activity Log */}
              {selected.activityLog.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Activity Log</p>
                  <div className="bg-[#111c33] rounded-lg p-3 space-y-3 max-h-40 overflow-y-auto">
                    {selected.activityLog.map((evt, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-gray-500 mt-1" />
                          {i < selected.activityLog.length - 1 && <div className="w-px flex-1 bg-gray-700 mt-1" />}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-xs text-gray-300">{evt.action}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {evt.timestamp} &middot; {evt.user}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {selected.status !== 'completed' && (
                <div className="space-y-2 pt-2 border-t border-gray-700/50">
                  <button
                    onClick={() => advanceStatus(selected.id)}
                    className="w-full px-4 py-2.5 bg-[#C9A84C] text-[#0A1628] font-semibold text-sm rounded-lg hover:bg-[#b8993f] transition"
                  >
                    Advance Stage
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => applyRetentionHold(selected.id)}
                      className="px-3 py-2 text-xs font-medium rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition"
                    >
                      Apply Retention Hold
                    </button>
                    <button
                      onClick={() => initiateDeletion(selected.id)}
                      className="px-3 py-2 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
                    >
                      Initiate Deletion
                    </button>
                  </div>
                  <button
                    onClick={() => markComplete(selected.id)}
                    className="w-full px-4 py-2 text-xs font-medium rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition"
                  >
                    Mark Complete
                  </button>
                <p className="text-[10px] text-gray-500 mt-2">
                  Checklist items can only be marked during Retention Hold or Deleting phases.
                </p>
              </div>

              {/* Deletion Audit Log (4D) */}
              {(selected.status === 'completed' || selected.status === 'deleting') && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
                    Deletion Audit Log
                  </p>
                  <AuditLog requestId={selected.id} businessName={selected.businessName} />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-8 text-center">
              <p className="text-gray-500 text-sm">Select a request to view details.</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
