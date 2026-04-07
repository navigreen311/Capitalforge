'use client';

// ============================================================
// /compliance/complaints — Complaints Management
// Intake form, status workflow, 30-day SLA tracker,
// complaint log table with filters.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ComplaintStatus = 'Received' | 'Under Review' | 'Responded' | 'Resolved' | 'Escalated';
type ComplaintType = 'Billing' | 'Disclosure' | 'Fair Lending' | 'Product Mismatch' | 'Advisor Conduct' | 'Data Privacy' | 'Other';
type Channel = 'Phone' | 'Email' | 'Web Portal' | 'In-Person' | 'Mail' | 'Social Media';

interface Complaint {
  id: string;
  businessName: string;
  complaintType: ComplaintType;
  channel: Channel;
  status: ComplaintStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
  assignee: string;
  slaDeadline: string; // 30 days from createdAt
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

function slaFromCreated(created: string): string {
  const d = new Date(created);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

const PLACEHOLDER_COMPLAINTS: Complaint[] = [
  { id: 'CMP-001', businessName: 'Apex Ventures LLC',       complaintType: 'Billing',          channel: 'Email',       status: 'Under Review', description: 'Client disputes fee charged on March statement. Claims no disclosure.',                  createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-20T14:00:00Z', assignee: 'Sarah Chen',      slaDeadline: slaFromCreated('2026-03-15T10:00:00Z') },
  { id: 'CMP-002', businessName: 'NovaTech Solutions Inc.',  complaintType: 'Fair Lending',     channel: 'Web Portal',  status: 'Escalated',    description: 'Alleges discriminatory denial based on ZIP code. ECOA review initiated.',               createdAt: '2026-03-10T08:00:00Z', updatedAt: '2026-03-25T16:00:00Z', assignee: 'Michael Torres',  slaDeadline: slaFromCreated('2026-03-10T08:00:00Z') },
  { id: 'CMP-003', businessName: 'Horizon Retail Partners',  complaintType: 'Disclosure',       channel: 'Phone',       status: 'Received',     description: 'Client claims APR disclosure was not visible on mobile application.',                    createdAt: '2026-04-01T09:30:00Z', updatedAt: '2026-04-01T09:30:00Z', assignee: '',                slaDeadline: slaFromCreated('2026-04-01T09:30:00Z') },
  { id: 'CMP-004', businessName: 'Summit Capital Group',     complaintType: 'Advisor Conduct',  channel: 'Email',       status: 'Responded',    description: 'Client unhappy with advisor communication frequency and tone.',                         createdAt: '2026-02-20T11:00:00Z', updatedAt: '2026-03-10T13:00:00Z', assignee: 'Emily Park',      slaDeadline: slaFromCreated('2026-02-20T11:00:00Z') },
  { id: 'CMP-005', businessName: 'Blue Ridge Consulting',    complaintType: 'Product Mismatch', channel: 'In-Person',   status: 'Resolved',     description: 'Product terms did not match initial proposal. Resolved with adjustment.',               createdAt: '2026-01-15T14:00:00Z', updatedAt: '2026-02-05T10:00:00Z', assignee: 'Sarah Chen',      slaDeadline: slaFromCreated('2026-01-15T14:00:00Z') },
  { id: 'CMP-006', businessName: 'Crestline Medical LLC',    complaintType: 'Data Privacy',     channel: 'Mail',        status: 'Under Review', description: 'Request for data deletion under CCPA. Processing confirmation pending.',                createdAt: '2026-03-25T16:00:00Z', updatedAt: '2026-03-28T09:00:00Z', assignee: 'Michael Torres',  slaDeadline: slaFromCreated('2026-03-25T16:00:00Z') },
];

const STATUSES: ComplaintStatus[] = ['Received', 'Under Review', 'Responded', 'Resolved', 'Escalated'];
const COMPLAINT_TYPES: ComplaintType[] = ['Billing', 'Disclosure', 'Fair Lending', 'Product Mismatch', 'Advisor Conduct', 'Data Privacy', 'Other'];
const CHANNELS: Channel[] = ['Phone', 'Email', 'Web Portal', 'In-Person', 'Mail', 'Social Media'];
const STATUS_ORDER: Record<ComplaintStatus, number> = { 'Received': 0, 'Under Review': 1, 'Responded': 2, 'Resolved': 3, 'Escalated': 4 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = new Date();

function daysRemaining(slaDeadline: string): number {
  return Math.ceil((new Date(slaDeadline).getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function slaColor(days: number, status: ComplaintStatus): string {
  if (status === 'Resolved') return 'text-green-400';
  if (days < 0) return 'text-red-400';
  if (days <= 5) return 'text-amber-400';
  return 'text-green-400';
}

function slaBg(days: number, status: ComplaintStatus): string {
  if (status === 'Resolved') return 'bg-green-900/20';
  if (days < 0) return 'bg-red-900/20';
  if (days <= 5) return 'bg-amber-900/20';
  return 'bg-green-900/20';
}

function statusBadge(s: ComplaintStatus): string {
  switch (s) {
    case 'Received':     return 'bg-blue-900/50 text-blue-300 border border-blue-700';
    case 'Under Review': return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
    case 'Responded':    return 'bg-purple-900/50 text-purple-300 border border-purple-700';
    case 'Resolved':     return 'bg-green-900/50 text-green-300 border border-green-700';
    case 'Escalated':    return 'bg-red-900/50 text-red-300 border border-red-700';
  }
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>(PLACEHOLDER_COMPLAINTS);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'All'>('All');
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Intake form
  const [form, setForm] = useState({
    businessName: '',
    complaintType: 'Billing' as ComplaintType,
    channel: 'Email' as Channel,
    description: '',
  });

  // Fetch from API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/compliance/complaints');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.length) setComplaints(data.data);
        }
      } catch { /* placeholder */ }
    })();
  }, []);

  const filtered = useMemo(() => {
    const base = statusFilter === 'All' ? complaints : complaints.filter((c) => c.status === statusFilter);
    return [...base].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [complaints, statusFilter]);

  const handleSubmitComplaint = useCallback(() => {
    if (!form.businessName.trim() || !form.description.trim()) return;
    const now = new Date().toISOString();
    const newComplaint: Complaint = {
      id: `CMP-${String(complaints.length + 1).padStart(3, '0')}`,
      businessName: form.businessName,
      complaintType: form.complaintType,
      channel: form.channel,
      status: 'Received',
      description: form.description,
      createdAt: now,
      updatedAt: now,
      assignee: '',
      slaDeadline: slaFromCreated(now),
    };
    setComplaints((prev) => [newComplaint, ...prev]);
    setShowIntakeForm(false);
    setForm({ businessName: '', complaintType: 'Billing', channel: 'Email', description: '' });
    setToast(`Complaint ${newComplaint.id} created`);
    fetch('/api/compliance/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComplaint),
    }).catch(() => {});
  }, [form, complaints.length]);

  const handleStatusChange = useCallback((id: string, newStatus: ComplaintStatus) => {
    setComplaints((prev) =>
      prev.map((c) => c.id === id ? { ...c, status: newStatus, updatedAt: new Date().toISOString() } : c)
    );
    setToast(`${id} status updated to ${newStatus}`);
    fetch(`/api/compliance/complaints/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {});
  }, []);

  // Summary
  const open = complaints.filter((c) => c.status !== 'Resolved').length;
  const breached = complaints.filter((c) => c.status !== 'Resolved' && daysRemaining(c.slaDeadline) < 0).length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Complaints</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {complaints.length} total &middot; {open} open
            {breached > 0 && <span className="ml-2 text-red-400 font-semibold">{breached} SLA breached</span>}
          </p>
        </div>
        <button
          onClick={() => setShowIntakeForm(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628] text-sm font-semibold transition-colors"
        >
          New Complaint
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800 overflow-x-auto">
        {(['All', ...STATUSES] as const).map((s) => {
          const count = s === 'All' ? complaints.length : complaints.filter((c) => c.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                statusFilter === s
                  ? 'border-[#C9A84C] text-[#C9A84C]'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {s} <span className="text-xs text-gray-500 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Complaint Log Table */}
      <div className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">ID</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Business</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Type</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Channel</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Status</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">SLA (30d)</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Created</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No complaints match the filter.</td></tr>
              ) : (
                filtered.map((c) => {
                  const days = daysRemaining(c.slaDeadline);
                  return (
                    <tr key={c.id} className="border-b border-gray-800/50 hover:bg-[#0A1628]/50 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.id}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-100 font-medium text-sm">{c.businessName}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{c.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                          {c.complaintType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{c.channel}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`rounded-lg px-2 py-1 inline-block ${slaBg(days, c.status)}`}>
                          <span className={`text-xs font-bold ${slaColor(days, c.status)}`}>
                            {c.status === 'Resolved' ? 'Closed' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        {c.status !== 'Resolved' && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) handleStatusChange(c.id, e.target.value as ComplaintStatus);
                            }}
                            className="rounded-lg bg-[#0A1628] border border-gray-700 text-gray-300 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#C9A84C]/50"
                          >
                            <option value="">Move to...</option>
                            {STATUSES.filter((s) => s !== c.status).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Workflow Legend */}
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
        <span>Workflow:</span>
        {STATUSES.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded ${statusBadge(s)} text-[10px]`}>{s}</span>
            {i < STATUSES.length - 1 && <span className="text-gray-700">&rarr;</span>}
          </span>
        ))}
      </div>

      {/* Intake Form Modal */}
      {showIntakeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">New Complaint</h3>
              <button onClick={() => setShowIntakeForm(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Business</label>
                <input
                  type="text"
                  value={form.businessName}
                  onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  placeholder="Business name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Complaint Type</label>
                  <select
                    value={form.complaintType}
                    onChange={(e) => setForm((f) => ({ ...f, complaintType: e.target.value as ComplaintType }))}
                    className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  >
                    {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Channel</label>
                  <select
                    value={form.channel}
                    onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as Channel }))}
                    className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  >
                    {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 resize-none"
                  placeholder="Describe the complaint..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-5">
              <button onClick={() => setShowIntakeForm(false)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors">
                Cancel
              </button>
              <button onClick={handleSubmitComplaint} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors">
                Submit Complaint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0A1628] border border-[#C9A84C]/30 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}
