'use client';

// ============================================================
// /financial-control/hardship — Hardship Case Manager
//
// Sections:
//   1. Client selector filtered to "at risk" clients
//   2. Hardship flag type selector
//   3. Resolution tracker (open > in_negotiation > resolved > written_off)
//   4. Workout proposal section (text area for notes)
//   5. Table of active hardship cases
//   6. New case creation modal
// ============================================================

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HardshipFlag = 'missed_payment' | 'high_utilization' | 'income_change' | 'business_closure';
type ResolutionStatus = 'open' | 'in_negotiation' | 'resolved' | 'written_off';

interface AtRiskClient {
  id: string;
  name: string;
  businessName: string;
  fico: number;
  utilization: number;
  missedPayments: number;
  totalDebt: number;
}

interface HardshipCase {
  id: string;
  clientId: string;
  clientName: string;
  businessName: string;
  flag: HardshipFlag;
  status: ResolutionStatus;
  totalDebt: number;
  missedPayments: number;
  utilization: number;
  openedAt: string;
  lastUpdated: string;
  assignedAdvisor: string;
  workoutNotes: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const AT_RISK_CLIENTS: AtRiskClient[] = [
  { id: 'arc_1', name: 'Carlos Mendez', businessName: 'Mendez Trucking LLC', fico: 620, utilization: 92, missedPayments: 3, totalDebt: 84_500 },
  { id: 'arc_2', name: 'Patricia Wong', businessName: 'Wong Consulting Group', fico: 645, utilization: 87, missedPayments: 2, totalDebt: 62_300 },
  { id: 'arc_3', name: 'James Thornton', businessName: 'Thornton Construction Inc', fico: 590, utilization: 95, missedPayments: 4, totalDebt: 128_700 },
  { id: 'arc_4', name: 'Maria Santos', businessName: 'Santos Bakery & Cafe', fico: 660, utilization: 78, missedPayments: 1, totalDebt: 34_200 },
  { id: 'arc_5', name: 'Robert Kim', businessName: 'Kim Auto Parts LLC', fico: 610, utilization: 88, missedPayments: 3, totalDebt: 95_600 },
];

const PLACEHOLDER_CASES: HardshipCase[] = [
  {
    id: 'hc_001', clientId: 'arc_1', clientName: 'Carlos Mendez', businessName: 'Mendez Trucking LLC',
    flag: 'missed_payment', status: 'in_negotiation', totalDebt: 84_500, missedPayments: 3,
    utilization: 92, openedAt: '2026-02-15', lastUpdated: '2026-03-28',
    assignedAdvisor: 'Sarah Mitchell',
    workoutNotes: 'Client experiencing cash flow disruption due to fleet maintenance costs. Proposed 6-month reduced payment plan at 60% of minimum. Awaiting issuer response on Chase Ink account.',
  },
  {
    id: 'hc_002', clientId: 'arc_3', clientName: 'James Thornton', businessName: 'Thornton Construction Inc',
    flag: 'high_utilization', status: 'open', totalDebt: 128_700, missedPayments: 4,
    utilization: 95, openedAt: '2026-03-05', lastUpdated: '2026-03-30',
    assignedAdvisor: 'David Park',
    workoutNotes: 'High utilization across 5 cards. Construction project delayed 90 days. Evaluating settlement offers from Amex and Capital One.',
  },
  {
    id: 'hc_003', clientId: 'arc_2', clientName: 'Patricia Wong', businessName: 'Wong Consulting Group',
    flag: 'income_change', status: 'in_negotiation', totalDebt: 62_300, missedPayments: 2,
    utilization: 87, openedAt: '2026-01-20', lastUpdated: '2026-03-15',
    assignedAdvisor: 'Sarah Mitchell',
    workoutNotes: 'Lost major client (35% of revenue). Negotiating hardship rate reduction with Chase and Citi. Client enrolled in business counseling program.',
  },
  {
    id: 'hc_004', clientId: 'arc_5', clientName: 'Robert Kim', businessName: 'Kim Auto Parts LLC',
    flag: 'business_closure', status: 'open', totalDebt: 95_600, missedPayments: 3,
    utilization: 88, openedAt: '2026-03-20', lastUpdated: '2026-04-01',
    assignedAdvisor: 'David Park',
    workoutNotes: 'Business winding down operations. Exploring settlement options for all outstanding balances. Priority: negotiate below 50 cents on the dollar where possible.',
  },
  {
    id: 'hc_005', clientId: 'arc_4', clientName: 'Maria Santos', businessName: 'Santos Bakery & Cafe',
    flag: 'missed_payment', status: 'resolved', totalDebt: 34_200, missedPayments: 1,
    utilization: 78, openedAt: '2025-12-10', lastUpdated: '2026-02-28',
    assignedAdvisor: 'Sarah Mitchell',
    workoutNotes: 'Resolved. Client enrolled in 12-month payment plan. First two payments received on time. Late fees waived by Amex.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLAG_CONFIG: Record<HardshipFlag, { label: string; badgeClass: string }> = {
  missed_payment:    { label: 'Missed Payment',    badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  high_utilization:  { label: 'High Utilization',   badgeClass: 'bg-orange-900 text-orange-300 border-orange-700' },
  income_change:     { label: 'Income Change',      badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  business_closure:  { label: 'Business Closure',   badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
};

const STATUS_CONFIG: Record<ResolutionStatus, { label: string; badgeClass: string; step: number }> = {
  open:             { label: 'Open',            badgeClass: 'bg-red-900 text-red-300 border-red-700', step: 0 },
  in_negotiation:   { label: 'In Negotiation',  badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700', step: 1 },
  resolved:         { label: 'Resolved',         badgeClass: 'bg-green-900 text-green-300 border-green-700', step: 2 },
  written_off:      { label: 'Written Off',      badgeClass: 'bg-gray-800 text-gray-400 border-gray-600', step: 3 },
};

const STATUS_STEPS: ResolutionStatus[] = ['open', 'in_negotiation', 'resolved', 'written_off'];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.className =
    'fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-100 shadow-2xl';
  el.style.animation = 'fadeInUp 0.3s ease, fadeOut 0.3s ease 2.5s forwards';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------------------
// Resolution Tracker component
// ---------------------------------------------------------------------------

function ResolutionTracker({ status }: { status: ResolutionStatus }) {
  const currentStep = STATUS_CONFIG[status].step;

  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, i) => {
        const cfg = STATUS_CONFIG[step];
        const isActive = i <= currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold border transition-colors ${
                isCurrent
                  ? 'bg-[#C9A84C] text-[#0A1628] border-[#C9A84C]'
                  : isActive
                  ? 'bg-gray-700 text-gray-300 border-gray-600'
                  : 'bg-gray-900 text-gray-600 border-gray-800'
              }`}
              title={cfg.label}
            >
              {i + 1}
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={`w-4 h-0.5 ${i < currentStep ? 'bg-[#C9A84C]' : 'bg-gray-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialControlHardshipPage() {
  const [cases, setCases] = useState<HardshipCase[]>(PLACEHOLDER_CASES);
  const [filterFlag, setFilterFlag] = useState<HardshipFlag | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ResolutionStatus | 'all'>('all');
  const [selectedCase, setSelectedCase] = useState<HardshipCase | null>(PLACEHOLDER_CASES[0]);
  const [editingNotes, setEditingNotes] = useState(PLACEHOLDER_CASES[0].workoutNotes);
  const [showNewCase, setShowNewCase] = useState(false);

  // New case form
  const [newCaseClient, setNewCaseClient] = useState('');
  const [newCaseFlag, setNewCaseFlag] = useState<HardshipFlag>('missed_payment');
  const [newCaseNotes, setNewCaseNotes] = useState('');

  const filtered = useMemo(
    () => cases.filter((c) => {
      if (filterFlag !== 'all' && c.flag !== filterFlag) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      return true;
    }),
    [cases, filterFlag, filterStatus],
  );

  const openCount = cases.filter((c) => c.status === 'open').length;
  const negotiatingCount = cases.filter((c) => c.status === 'in_negotiation').length;
  const resolvedCount = cases.filter((c) => c.status === 'resolved').length;
  const totalDebtAtRisk = cases
    .filter((c) => c.status === 'open' || c.status === 'in_negotiation')
    .reduce((s, c) => s + c.totalDebt, 0);

  function handleSelectCase(c: HardshipCase) {
    setSelectedCase(c);
    setEditingNotes(c.workoutNotes);
  }

  function handleSaveNotes() {
    if (!selectedCase) return;
    setCases((prev) =>
      prev.map((c) =>
        c.id === selectedCase.id
          ? { ...c, workoutNotes: editingNotes, lastUpdated: new Date().toISOString().split('T')[0] }
          : c,
      ),
    );
    setSelectedCase({ ...selectedCase, workoutNotes: editingNotes });
    showToast('Workout notes saved.');
  }

  function handleUpdateStatus(caseId: string, newStatus: ResolutionStatus) {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? { ...c, status: newStatus, lastUpdated: new Date().toISOString().split('T')[0] }
          : c,
      ),
    );
    if (selectedCase?.id === caseId) {
      setSelectedCase({ ...selectedCase, status: newStatus });
    }
    showToast(`Case status updated to ${STATUS_CONFIG[newStatus].label}.`);
  }

  function handleCreateCase() {
    const client = AT_RISK_CLIENTS.find((c) => c.id === newCaseClient);
    if (!client) {
      showToast('Please select a client.');
      return;
    }

    const newCase: HardshipCase = {
      id: `hc_new_${Date.now()}`,
      clientId: client.id,
      clientName: client.name,
      businessName: client.businessName,
      flag: newCaseFlag,
      status: 'open',
      totalDebt: client.totalDebt,
      missedPayments: client.missedPayments,
      utilization: client.utilization,
      openedAt: new Date().toISOString().split('T')[0],
      lastUpdated: new Date().toISOString().split('T')[0],
      assignedAdvisor: 'Unassigned',
      workoutNotes: newCaseNotes,
    };

    setCases((prev) => [newCase, ...prev]);
    setShowNewCase(false);
    setNewCaseClient('');
    setNewCaseFlag('missed_payment');
    setNewCaseNotes('');
    showToast(`Hardship case opened for ${client.name}.`);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      {/* Toast animation styles */}
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Hardship Case Manager</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Track at-risk clients, manage hardship flags, and resolve workout proposals.
          </p>
        </div>
        <button
          onClick={() => setShowNewCase(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
        >
          + New Hardship Case
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Open Cases</p>
          <p className={`text-2xl font-bold ${openCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{openCount}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">In Negotiation</p>
          <p className="text-2xl font-bold text-yellow-400">{negotiatingCount}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Resolved</p>
          <p className="text-2xl font-bold text-green-400">{resolvedCount}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Debt at Risk</p>
          <p className="text-2xl font-bold text-[#C9A84C]">{formatCurrency(totalDebtAtRisk)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold uppercase">Flag:</span>
          <div className="flex gap-1">
            {(['all', 'missed_payment', 'high_utilization', 'income_change', 'business_closure'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterFlag(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  filterFlag === f
                    ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'
                }`}
              >
                {f === 'all' ? 'All' : FLAG_CONFIG[f].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold uppercase">Status:</span>
          <div className="flex gap-1">
            {(['all', 'open', 'in_negotiation', 'resolved', 'written_off'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  filterStatus === s
                    ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content: table + detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cases table */}
        <div className="lg:col-span-2 rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-base font-semibold text-white">Active Hardship Cases</h3>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} case{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Client / Business</th>
                  <th className="text-center px-4 py-3 font-semibold">Flag</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Debt</th>
                  <th className="text-center px-4 py-3 font-semibold">Resolution</th>
                  <th className="text-right px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map((c) => {
                  const flagCfg = FLAG_CONFIG[c.flag];
                  const statusCfg = STATUS_CONFIG[c.status];
                  const isSelected = selectedCase?.id === c.id;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleSelectCase(c)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#C9A84C]/10' : 'bg-[#0A1628] hover:bg-gray-900/50'
                      }`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-100">{c.clientName}</p>
                        <p className="text-xs text-gray-500">{c.businessName}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${flagCfg.badgeClass}`}>
                          {flagCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-white">{formatCurrency(c.totalDebt)}</span>
                        <p className="text-[10px] text-gray-500">{c.missedPayments} missed | {c.utilization}% util</p>
                      </td>
                      <td className="px-4 py-3">
                        <ResolutionTracker status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400">
                        {formatDate(c.lastUpdated)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-gray-600 text-sm">
                No hardship cases match the current filters.
              </div>
            )}
          </div>
        </div>

        {/* Detail / Workout panel */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          {selectedCase ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">{selectedCase.clientName}</h3>
                <p className="text-xs text-gray-400">{selectedCase.businessName}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Total Debt</p>
                  <p className="text-sm font-bold text-white">{formatCurrency(selectedCase.totalDebt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Missed Payments</p>
                  <p className="text-sm font-bold text-red-400">{selectedCase.missedPayments}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Utilization</p>
                  <p className="text-sm font-bold text-orange-400">{selectedCase.utilization}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Advisor</p>
                  <p className="text-sm font-semibold text-gray-200">{selectedCase.assignedAdvisor}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Resolution Progress</p>
                <ResolutionTracker status={selectedCase.status} />
              </div>

              {/* Status actions */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_STEPS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleUpdateStatus(selectedCase.id, s)}
                      disabled={selectedCase.status === s}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        selectedCase.status === s
                          ? 'bg-[#C9A84C] text-[#0A1628] cursor-default'
                          : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                      }`}
                    >
                      {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Workout notes */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2">Workout Proposal / Notes</p>
                <textarea
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] resize-none"
                  placeholder="Enter workout proposal details, negotiation notes, or resolution plan..."
                />
                <button
                  onClick={handleSaveNotes}
                  className="mt-2 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-xs font-semibold transition-colors"
                >
                  Save Notes
                </button>
              </div>

              <div className="text-xs text-gray-600 pt-2 border-t border-gray-800">
                Opened {formatDate(selectedCase.openedAt)} | Last updated {formatDate(selectedCase.lastUpdated)}
              </div>
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500">Select a case from the table to view details and manage the workout proposal.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Case Modal */}
      {showNewCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">New Hardship Case</h2>
              <button onClick={() => setShowNewCase(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                &#215;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  At-Risk Client
                </label>
                <select
                  value={newCaseClient}
                  onChange={(e) => setNewCaseClient(e.target.value)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
                >
                  <option value="">Select a client...</option>
                  {AT_RISK_CLIENTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.businessName} (FICO {c.fico}, {c.utilization}% util)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  Hardship Flag Type
                </label>
                <select
                  value={newCaseFlag}
                  onChange={(e) => setNewCaseFlag(e.target.value as HardshipFlag)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
                >
                  {(Object.keys(FLAG_CONFIG) as HardshipFlag[]).map((f) => (
                    <option key={f} value={f}>{FLAG_CONFIG[f].label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  Initial Notes
                </label>
                <textarea
                  value={newCaseNotes}
                  onChange={(e) => setNewCaseNotes(e.target.value)}
                  rows={4}
                  placeholder="Describe the hardship situation..."
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewCase(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCase}
                className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
              >
                Open Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
