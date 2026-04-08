'use client';

// ============================================================
// TradelineTracker — Tradeline tracking table with add modal
//
// Displays vendor tradelines for a client, showing status,
// credit limits, balances, and payment history. Includes an
// "Add Tradeline" modal for manual entry.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TradelineTrackerProps {
  clientId: string | null;
  clientName: string | null;
  prefillVendor?: string | null;
  showAddModal?: boolean;
  onCloseAddModal?: () => void;
}

type TradelineStatus = 'Applied' | 'Approved' | 'Reporting' | 'Late';
type ApprovalStatus = 'Applied' | 'Approved' | 'Denied';

interface Tradeline {
  id: string;
  vendor: string;
  applied_date: string;
  approved: boolean;
  credit_limit: number;
  balance: number;
  payments_made: number;
  payments_total: number;
  status: TradelineStatus;
}

interface TradelinesResponse {
  tradelines: Tradeline[];
  reporting_count: number;
  reporting_target: number;
  avg_payment_status: string;
}

interface NewTradelineForm {
  vendor: string;
  customVendor: string;
  appliedDate: string;
  approvalStatus: ApprovalStatus;
  creditLimit: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const VENDOR_LIST = [
  'Uline',
  'Quill',
  'Crown Office Supplies',
  'Grainger',
  'Marathon',
  'Strategic Network Solutions',
  'The CEO Creative',
  'Nav',
  'Custom...',
] as const;

const STATUS_BADGE: Record<TradelineStatus, string> = {
  Applied: 'bg-blue-500/20 text-blue-300',
  Approved: 'bg-emerald-500/20 text-emerald-300',
  Reporting: 'bg-green-500/20 text-green-300',
  Late: 'bg-red-500/20 text-red-300',
};

// ── Placeholder data ────────────────────────────────────────────────────────

const PLACEHOLDER_DATA: TradelinesResponse = {
  tradelines: [
    {
      id: 'pl-1',
      vendor: 'Uline',
      applied_date: '2025-11-15',
      approved: true,
      credit_limit: 5000,
      balance: 1200,
      payments_made: 3,
      payments_total: 3,
      status: 'Reporting',
    },
    {
      id: 'pl-2',
      vendor: 'Quill',
      applied_date: '2025-12-01',
      approved: true,
      credit_limit: 3000,
      balance: 800,
      payments_made: 2,
      payments_total: 2,
      status: 'Reporting',
    },
    {
      id: 'pl-3',
      vendor: 'Crown Office Supplies',
      applied_date: '2026-03-10',
      approved: false,
      credit_limit: 0,
      balance: 0,
      payments_made: 0,
      payments_total: 0,
      status: 'Applied',
    },
  ],
  reporting_count: 2,
  reporting_target: 5,
  avg_payment_status: 'On Time',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 animate-pulse">
      <div className="h-5 w-64 bg-gray-700 rounded mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-800 rounded" />
        ))}
      </div>
    </div>
  );
}

// ── Add Tradeline Modal ─────────────────────────────────────────────────────

function AddTradelineModal({
  onClose,
  onSave,
  prefillVendor,
}: {
  onClose: () => void;
  onSave: (form: NewTradelineForm) => void;
  prefillVendor?: string | null;
}) {
  const initialVendor = prefillVendor && VENDOR_LIST.includes(prefillVendor as typeof VENDOR_LIST[number])
    ? prefillVendor
    : prefillVendor
      ? 'Custom...'
      : VENDOR_LIST[0];
  const [form, setForm] = useState<NewTradelineForm>({
    vendor: initialVendor,
    customVendor: prefillVendor && !VENDOR_LIST.includes(prefillVendor as typeof VENDOR_LIST[number]) ? prefillVendor : '',
    appliedDate: new Date().toISOString().slice(0, 10),
    approvalStatus: 'Applied',
    creditLimit: '',
  });

  // Escape key handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  const isCustomVendor = form.vendor === 'Custom...';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add tradeline"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Add Tradeline</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-800 transition-colors"
            aria-label="Close modal"
            type="button"
          >
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Vendor dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Vendor</label>
            <select
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {VENDOR_LIST.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* Custom vendor name */}
          {isCustomVendor && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Vendor Name</label>
              <input
                type="text"
                value={form.customVendor}
                onChange={(e) => setForm({ ...form, customVendor: e.target.value })}
                placeholder="Enter vendor name"
                required
                className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2
                           placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          )}

          {/* Applied Date */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Applied Date</label>
            <input
              type="date"
              value={form.appliedDate}
              onChange={(e) => setForm({ ...form, appliedDate: e.target.value })}
              required
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Approval Status radio group */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Approval Status</label>
            <div className="flex items-center gap-4">
              {(['Applied', 'Approved', 'Denied'] as ApprovalStatus[]).map((status) => (
                <label key={status} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="approvalStatus"
                    value={status}
                    checked={form.approvalStatus === status}
                    onChange={() => setForm({ ...form, approvalStatus: status })}
                    className="w-4 h-4 text-blue-500 bg-gray-800 border-gray-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">{status}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Credit Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Credit Limit</label>
            <input
              type="number"
              value={form.creditLimit}
              onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
              placeholder="$0"
              min="0"
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2
                         placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Save button */}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg
                       hover:bg-blue-500 transition-colors focus:ring-2 focus:ring-blue-400 focus:ring-offset-2
                       focus:ring-offset-gray-900 outline-none"
          >
            Save Tradeline
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function TradelineTracker({ clientId, clientName, prefillVendor, showAddModal: externalShowAdd, onCloseAddModal }: TradelineTrackerProps) {
  const apiPath = clientId ? `/api/v1/clients/${clientId}/tradelines` : null;

  const { data, isLoading, error, refetch } = useAuthFetch<TradelinesResponse>(
    apiPath ?? '/api/v1/clients/null/tradelines',
  );

  const [internalShowAdd, setInternalShowAdd] = useState(false);
  const showAddModal = externalShowAdd ?? internalShowAdd;
  const setShowAddModal = useCallback((val: boolean) => {
    setInternalShowAdd(val);
    if (!val && onCloseAddModal) onCloseAddModal();
  }, [onCloseAddModal]);
  const [localTradelines, setLocalTradelines] = useState<Tradeline[]>([]);

  const handleCloseModal = useCallback(() => setShowAddModal(false), [setShowAddModal]);

  // Resolve the display data: API response or placeholder fallback
  const resolved = data ?? (clientId ? null : PLACEHOLDER_DATA);
  const tradelines = resolved ? [...resolved.tradelines, ...localTradelines] : localTradelines;
  const reportingCount = (resolved?.reporting_count ?? 0) +
    localTradelines.filter((t) => t.status === 'Reporting').length;
  const reportingTarget = resolved?.reporting_target ?? 5;
  const avgPayment = resolved?.avg_payment_status ?? 'On Time';

  function handleSave(form: NewTradelineForm) {
    const vendorName = form.vendor === 'Custom...' ? form.customVendor : form.vendor;
    const limit = parseInt(form.creditLimit, 10) || 0;
    const isApproved = form.approvalStatus === 'Approved';

    const newTradeline: Tradeline = {
      id: `local-${Date.now()}`,
      vendor: vendorName,
      applied_date: form.appliedDate,
      approved: isApproved,
      credit_limit: limit,
      balance: 0,
      payments_made: 0,
      payments_total: 0,
      status: form.approvalStatus === 'Denied' ? 'Applied' : (form.approvalStatus as TradelineStatus),
    };

    setLocalTradelines((prev) => [...prev, newTradeline]);
    setShowAddModal(false);
  }

  // ── Loading ───────────────────────────────────────────────────
  if (clientId && isLoading) {
    return (
      <section aria-label="Tradeline Tracker">
        <Skeleton />
      </section>
    );
  }

  // ── Error ─────────────────────────────────────────────────────
  if (error) {
    return (
      <section aria-label="Tradeline Tracker">
        <DashboardErrorState error={error} onRetry={refetch} />
      </section>
    );
  }

  const displayName = clientName?.toUpperCase() ?? 'CLIENT';

  return (
    <section aria-label="Tradeline Tracker">
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold tracking-wider text-gray-100 uppercase">
            My Tradelines &mdash; {displayName}
          </h2>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg
                       hover:bg-blue-500/20 transition-colors"
          >
            + Add Tradeline
          </button>
        </div>

        {/* ── Table ───────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                <th className="pb-2 font-medium">Vendor</th>
                <th className="pb-2 font-medium">Applied</th>
                <th className="pb-2 font-medium">Approved</th>
                <th className="pb-2 font-medium text-right">Limit</th>
                <th className="pb-2 font-medium text-right">Balance</th>
                <th className="pb-2 font-medium">Payments</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {tradelines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500 text-sm">
                    No tradelines yet. Click &quot;+ Add Tradeline&quot; to get started.
                  </td>
                </tr>
              ) : (
                tradelines.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="py-3 font-medium text-gray-100">{t.vendor}</td>
                    <td className="py-3 text-gray-400">{formatDate(t.applied_date)}</td>
                    <td className="py-3">
                      {t.approved ? (
                        <span className="text-emerald-400 font-medium">Yes</span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )}
                    </td>
                    <td className="py-3 text-right font-semibold text-gray-200">
                      {t.credit_limit > 0 ? formatCurrency(t.credit_limit) : '--'}
                    </td>
                    <td className="py-3 text-right text-gray-300">
                      {t.balance > 0 ? formatCurrency(t.balance) : '--'}
                    </td>
                    <td className="py-3 text-gray-300">
                      {t.payments_total > 0 ? (
                        <span>
                          {t.payments_made}/{t.payments_total}{' '}
                          {t.payments_made === t.payments_total ? (
                            <span className="text-emerald-400">&#10003;</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-gray-600">--</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status]}`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Summary Row ─────────────────────────────────────── */}
        <div className="mt-4 pt-3 border-t border-gray-700 flex items-center justify-between text-sm">
          <span className="text-gray-400">
            Tradelines reporting to D&amp;B:{' '}
            <span className={reportingCount >= reportingTarget ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {reportingCount} of {reportingTarget} needed
            </span>
          </span>
          <span className="text-gray-400">
            Avg payment:{' '}
            <span className="text-emerald-400 font-semibold">{avgPayment}</span>
          </span>
        </div>

        {/* ── Add Tradeline Modal ─────────────────────────────── */}
        {showAddModal && (
          <AddTradelineModal onClose={handleCloseModal} onSave={handleSave} prefillVendor={prefillVendor} />
        )}
      </div>
    </section>
  );
}
