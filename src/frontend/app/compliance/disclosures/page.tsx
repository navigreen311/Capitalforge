'use client';

// ============================================================
// /compliance/disclosures — Disclosures Management
// Table: Business | State | Regulation | Deadline | Status
// Color coding for overdue/due-soon/on-track, file action.
// State coverage: CA, NY, IL, TX, VA, UT.
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DisclosureStatus = 'Filed' | 'Pending' | 'Overdue' | 'Draft';

interface Disclosure {
  id: string;
  businessName: string;
  state: string;
  regulation: string;
  deadline: string;
  status: DisclosureStatus;
  filedAt: string | null;
}

// ---------------------------------------------------------------------------
// Placeholder data — 6 required states
// ---------------------------------------------------------------------------

const PLACEHOLDER_DISCLOSURES: Disclosure[] = [
  { id: 'dis_001', businessName: 'Apex Ventures LLC',       state: 'CA', regulation: 'SB 1235 Commercial Finance Disclosures',       deadline: '2026-04-15', status: 'Pending',  filedAt: null },
  { id: 'dis_002', businessName: 'NovaTech Solutions Inc.',  state: 'NY', regulation: 'Commercial Finance Disclosure Law',             deadline: '2026-03-31', status: 'Overdue',  filedAt: null },
  { id: 'dis_003', businessName: 'Horizon Retail Partners',  state: 'IL', regulation: 'Consumer Installment Loan Act Disclosure',      deadline: '2026-05-01', status: 'Filed',    filedAt: '2026-03-20T10:00:00Z' },
  { id: 'dis_004', businessName: 'Summit Capital Group',     state: 'TX', regulation: 'HB 1442 Business Lending Transparency',         deadline: '2026-09-01', status: 'Draft',    filedAt: null },
  { id: 'dis_005', businessName: 'Blue Ridge Consulting',    state: 'VA', regulation: 'Open-End Credit Disclosure Requirements',       deadline: '2026-04-10', status: 'Pending',  filedAt: null },
  { id: 'dis_006', businessName: 'Crestline Medical LLC',    state: 'UT', regulation: 'Consumer Credit Protection — Title 70C',        deadline: '2026-06-30', status: 'Filed',    filedAt: '2026-03-15T14:00:00Z' },
  { id: 'dis_007', businessName: 'Meridian Capital',         state: 'CA', regulation: 'CCPA / CPRA Privacy Disclosure',                deadline: '2026-04-05', status: 'Overdue',  filedAt: null },
  { id: 'dis_008', businessName: 'Pinnacle Freight LLC',     state: 'NY', regulation: 'Truth in Lending — NY Addendum',                deadline: '2026-04-12', status: 'Pending',  filedAt: null },
  { id: 'dis_009', businessName: 'Apex Ventures LLC',        state: 'IL', regulation: 'Predatory Lending Prevention Disclosure',       deadline: '2026-07-15', status: 'Draft',    filedAt: null },
  { id: 'dis_010', businessName: 'Summit Capital Group',     state: 'VA', regulation: 'VA Consumer Protection Act Addendum',           deadline: '2026-04-08', status: 'Pending',  filedAt: null },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = new Date();

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineColor(dateStr: string, status: DisclosureStatus): string {
  if (status === 'Filed') return 'text-green-400';
  const days = daysUntil(dateStr);
  if (days < 0) return 'text-red-400';      // Overdue
  if (days <= 7) return 'text-amber-400';    // Due within 7 days
  return 'text-green-400';                    // On track
}

function deadlineRowBorder(dateStr: string, status: DisclosureStatus): string {
  if (status === 'Filed') return 'border-l-green-500';
  const days = daysUntil(dateStr);
  if (days < 0) return 'border-l-red-500';
  if (days <= 7) return 'border-l-amber-500';
  return 'border-l-green-500';
}

function statusBadge(s: DisclosureStatus): string {
  switch (s) {
    case 'Filed':   return 'bg-green-900/50 text-green-300 border border-green-700';
    case 'Pending': return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
    case 'Overdue': return 'bg-red-900/50 text-red-300 border border-red-700';
    case 'Draft':   return 'bg-blue-900/50 text-blue-300 border border-blue-700';
  }
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

const STATE_LIST = ['All', 'CA', 'NY', 'IL', 'TX', 'VA', 'UT'] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DisclosuresPage() {
  const [disclosures, setDisclosures] = useState<Disclosure[]>(PLACEHOLDER_DISCLOSURES);
  const [stateFilter, setStateFilter] = useState<string>('All');
  const [toast, setToast] = useState<string | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkFiling, setBulkFiling] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  // Fetch from API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/compliance/disclosures');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.length) setDisclosures(data.data);
        }
      } catch { /* placeholder */ }
    })();
  }, []);

  const filtered = stateFilter === 'All'
    ? disclosures
    : disclosures.filter((d) => d.state === stateFilter);

  // Sort: Overdue first, then by deadline ascending
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
    if (b.status === 'Overdue' && a.status !== 'Overdue') return 1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  const handleFile = useCallback((id: string) => {
    setDisclosures((prev) =>
      prev.map((d) => d.id === id ? { ...d, status: 'Filed' as DisclosureStatus, filedAt: new Date().toISOString() } : d)
    );
    const disc = disclosures.find((d) => d.id === id);
    if (disc) {
      setToast(`${disc.regulation} filed for ${disc.businessName}`);
      fetch(`/api/compliance/disclosures/${id}/file`, { method: 'POST' }).catch(() => {});
    }
  }, [disclosures]);

  const handleCreatePriorityTask = useCallback((id: string) => {
    const disc = disclosures.find((d) => d.id === id);
    if (disc) {
      setToast('Priority task created in Action Queue');
      fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'priority', disclosureId: id }) }).catch(() => {});
    }
  }, [disclosures]);

  // Bulk modal helpers
  const pendingDisclosures = disclosures.filter((d) => d.status === 'Pending' || d.status === 'Overdue');

  const openBulkModal = useCallback(() => {
    setBulkSelected(new Set(pendingDisclosures.map((d) => d.id)));
    setBulkProgress(0);
    setBulkFiling(false);
    setBulkModalOpen(true);
  }, [pendingDisclosures]);

  const toggleBulkItem = useCallback((id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkFile = useCallback(async () => {
    const ids = Array.from(bulkSelected);
    if (ids.length === 0) return;
    setBulkFiling(true);
    setBulkProgress(0);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      setDisclosures((prev) =>
        prev.map((d) => d.id === id ? { ...d, status: 'Filed' as DisclosureStatus, filedAt: new Date().toISOString() } : d)
      );
      fetch(`/api/compliance/disclosures/${id}/file`, { method: 'POST' }).catch(() => {});
      setBulkProgress(i + 1);
      // Small delay for visual feedback
      await new Promise((r) => setTimeout(r, 300));
    }
    setBulkFiling(false);
    setBulkModalOpen(false);
    setToast(`${ids.length} disclosure${ids.length > 1 ? 's' : ''} filed successfully`);
  }, [bulkSelected]);

  // Summary stats
  const overdue = disclosures.filter((d) => d.status === 'Overdue').length;
  const pending = disclosures.filter((d) => d.status === 'Pending').length;
  const filed = disclosures.filter((d) => d.status === 'Filed').length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Disclosures</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            State disclosure tracking &middot; {disclosures.length} total &middot;{' '}
            {overdue > 0 && <span className="text-red-400 font-semibold">{overdue} overdue</span>}
            {overdue > 0 && pending > 0 && ' · '}
            {pending > 0 && <span className="text-yellow-400">{pending} pending</span>}
            {(overdue > 0 || pending > 0) && ' · '}
            <span className="text-green-400">{filed} filed</span>
          </p>
        </div>
      </div>

      {/* State filter */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {STATE_LIST.map((s) => (
          <button
            key={s}
            onClick={() => setStateFilter(s)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              stateFilter === s
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {pendingDisclosures.length > 0 && (
        <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-xl bg-[#0f1d32] border border-yellow-700/40">
          <span className="text-sm text-yellow-300 font-medium">
            {pendingDisclosures.length} disclosure{pendingDisclosures.length > 1 ? 's' : ''} pending action
          </span>
          <button
            onClick={openBulkModal}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors"
          >
            File All Pending ({pendingDisclosures.length}) &rarr;
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Business</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">State</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Regulation</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Deadline</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Status</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No disclosures for this state.</td></tr>
              ) : (
                sorted.map((d) => {
                  const days = daysUntil(d.deadline);
                  const isOverdue = d.status === 'Overdue';
                  return (
                    <tr key={d.id} className={`border-b border-gray-800/50 border-l-4 ${deadlineRowBorder(d.deadline, d.status)} hover:bg-[#0A1628]/50 transition-colors ${isOverdue ? 'bg-red-950/20' : ''}`}>
                      <td className="px-4 py-3 text-gray-100 font-medium">
                        {d.businessName}
                        {isOverdue && (
                          <div className="mt-1.5 px-2 py-1 rounded bg-red-900/40 border border-red-700/50 text-red-300 text-xs font-semibold">
                            OVERDUE: {Math.abs(days)} days &mdash; immediate action required
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold bg-gray-800 text-gray-300 border border-gray-600 px-2 py-0.5 rounded">
                          {d.state}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs max-w-[300px]">{d.regulation}</td>
                      <td className={`px-4 py-3 text-xs font-semibold ${deadlineColor(d.deadline, d.status)}`}>
                        {formatDate(d.deadline)}
                        {d.status !== 'Filed' && (
                          <span className="block text-xs font-normal mt-0.5 opacity-80">
                            {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d remaining`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(d.status)}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isOverdue ? (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => handleCreatePriorityTask(d.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-xs font-semibold text-white transition-colors"
                            >
                              Create Priority Task
                            </button>
                            <button
                              onClick={() => handleFile(d.id)}
                              className="px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-xs font-semibold text-[#0A1628] transition-colors"
                            >
                              File Now &rarr;
                            </button>
                          </div>
                        ) : d.status !== 'Filed' ? (
                          <button
                            onClick={() => handleFile(d.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-xs font-semibold text-[#0A1628] transition-colors"
                          >
                            File Disclosure
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">Filed {d.filedAt ? formatDate(d.filedAt) : ''}</span>
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

      {/* Bulk File Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">File Pending Disclosures</h2>
              <button onClick={() => setBulkModalOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
            </div>

            {/* Checklist */}
            <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
              {pendingDisclosures.map((d) => (
                <label key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#0A1628]/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={bulkSelected.has(d.id)}
                    onChange={() => toggleBulkItem(d.id)}
                    disabled={bulkFiling}
                    className="w-4 h-4 rounded border-gray-600 text-[#C9A84C] focus:ring-[#C9A84C] bg-gray-800"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-100 font-medium block truncate">{d.businessName}</span>
                    <span className="text-xs text-gray-400 block truncate">{d.regulation} ({d.state})</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(d.status)}`}>{d.status}</span>
                </label>
              ))}
            </div>

            {/* Progress bar */}
            {bulkFiling && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Filing disclosures...</span>
                  <span>{bulkProgress}/{bulkSelected.size}</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C9A84C] rounded-full transition-all duration-300"
                    style={{ width: `${(bulkProgress / bulkSelected.size) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{bulkSelected.size} selected</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setBulkModalOpen(false)}
                  disabled={bulkFiling}
                  className="px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkFile}
                  disabled={bulkFiling || bulkSelected.size === 0}
                  className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors disabled:opacity-50"
                >
                  {bulkFiling ? 'Filing...' : `File Selected (${bulkSelected.size})`}
                </button>
              </div>
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
