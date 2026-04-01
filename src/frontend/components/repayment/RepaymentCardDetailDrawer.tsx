'use client';

// ============================================================
// RepaymentCardDetailDrawer — 480px right slide-over showing
// card repayment details: amortization schedule, payment
// history, autopay status, and payment update controls.
// Dark theme (bg-[#1a2332]) to match the repayment palette.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface RepaymentCardDetailPlan {
  id: string;
  card: string;
  issuer: string;
  balance: number;
  apr: number;
  monthlyPayment: number;
  minPayment: number;
  payoffProgressPct: number;
  etaMonths: number;
  status: string;
  autopay: string;
}

export interface RepaymentCardDetailDrawerProps {
  plan: RepaymentCardDetailPlan | null;
  isOpen: boolean;
  onClose: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function issuerBadgeClasses(issuer: string): string {
  const i = issuer.toLowerCase();
  if (i.includes('chase')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (i.includes('amex') || i.includes('american express'))
    return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
  if (i.includes('capital one')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (i.includes('citi')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
  if (i.includes('discover')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

function statusBadgeClasses(status: string): string {
  const s = status.toLowerCase().replace(/[_\s-]/g, '');
  if (s === 'ontrack' || s === 'active') return 'bg-green-900/40 text-green-300 border-green-700';
  if (s === 'behind') return 'bg-yellow-900/40 text-yellow-300 border-yellow-700';
  if (s === 'atrisk' || s === 'delinquent') return 'bg-red-900/40 text-red-300 border-red-700';
  return 'bg-gray-900/40 text-gray-300 border-gray-700';
}

// ── Amortization projection ─────────────────────────────────────────────────

interface AmortizationRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  remaining: number;
}

function buildAmortizationSchedule(
  balance: number,
  apr: number,
  monthlyPayment: number,
  months: number,
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  let remaining = balance;
  const monthlyRate = apr / 100 / 12;

  for (let m = 1; m <= months && remaining > 0; m++) {
    const interest = remaining * monthlyRate;
    const payment = Math.min(monthlyPayment, remaining + interest);
    const principal = payment - interest;
    remaining = Math.max(0, remaining - principal);

    rows.push({
      month: m,
      payment: Math.round(payment * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
    });
  }

  return rows;
}

// ── Payment history placeholder data ────────────────────────────────────────

type PaymentStatus = 'on-time' | 'late' | 'missed';

interface PaymentHistoryEntry {
  date: string;
  amount: number;
  status: PaymentStatus;
}

function generatePaymentHistory(monthlyPayment: number): PaymentHistoryEntry[] {
  const now = new Date();
  const statuses: PaymentStatus[] = ['on-time', 'on-time', 'late'];
  return Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (i + 1), 15);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      amount: monthlyPayment + (i === 2 ? -50 : 0),
      status: statuses[i],
    };
  });
}

function paymentStatusBadge(status: PaymentStatus): { classes: string; label: string } {
  switch (status) {
    case 'on-time':
      return { classes: 'bg-green-900/40 text-green-300 border-green-700', label: 'On Time' };
    case 'late':
      return { classes: 'bg-yellow-900/40 text-yellow-300 border-yellow-700', label: 'Late' };
    case 'missed':
      return { classes: 'bg-red-900/40 text-red-300 border-red-700', label: 'Missed' };
  }
}

// ── Autopay section ─────────────────────────────────────────────────────────

function autopayDisplay(status: string): { icon: string; label: string; classes: string; actionLabel: string } {
  const s = status.toLowerCase();
  if (s === 'confirmed' || s === 'active' || s === 'enabled')
    return { icon: '\u2705', label: 'Confirmed', classes: 'text-green-400', actionLabel: 'Manage Autopay' };
  if (s === 'failed' || s === 'error')
    return { icon: '\u274C', label: 'Failed', classes: 'text-red-400', actionLabel: 'Fix Autopay' };
  return { icon: '\u26A0\uFE0F', label: 'Not Set', classes: 'text-yellow-400', actionLabel: 'Enable Autopay' };
}

// ── Main Component ──────────────────────────────────────────────────────────

export function RepaymentCardDetailDrawer({ plan, isOpen, onClose }: RepaymentCardDetailDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [newPayment, setNewPayment] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  // Reset local state when plan changes
  useEffect(() => {
    if (plan) {
      setNewPayment(plan.monthlyPayment.toString());
      setSaveMessage('');
    }
  }, [plan]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !plan) return null;

  const amortization = buildAmortizationSchedule(plan.balance, plan.apr, plan.monthlyPayment, 6);
  const paymentHistory = generatePaymentHistory(plan.monthlyPayment);
  const autopay = autopayDisplay(plan.autopay);

  function handleSavePayment() {
    const parsed = parseFloat(newPayment);
    if (isNaN(parsed) || parsed < plan!.minPayment) {
      setSaveMessage(`Minimum payment is ${formatCurrency(plan!.minPayment)}`);
      return;
    }
    setSaveMessage('Payment updated successfully.');
    setTimeout(() => setSaveMessage(''), 3000);
  }

  return (
    <>
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s ease-out;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-[#1a2332] shadow-xl z-50 flex flex-col animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label={`${plan.card} repayment details`}
      >
        {/* ── 1. Header ──────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-white/10">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">{plan.card}</h3>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${issuerBadgeClasses(plan.issuer)}`}
              >
                {plan.issuer}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${statusBadgeClasses(plan.status)}`}
              >
                {plan.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Quick stats ─────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">Balance</p>
              <p className="text-sm font-bold text-white">{formatCurrency(plan.balance)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">APR</p>
              <p className="text-sm font-bold text-white">{plan.apr}%</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">ETA</p>
              <p className="text-sm font-bold text-white">{plan.etaMonths} mo</p>
            </div>
          </div>

          {/* Payoff progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Payoff Progress</span>
              <span className="text-xs font-semibold text-gray-300">{plan.payoffProgressPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${plan.payoffProgressPct}%` }}
              />
            </div>
          </div>

          {/* ── 2. Amortization Schedule ────────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              6-Month Amortization Projection
            </h4>
            <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400">
                    <th className="text-left px-3 py-2 font-medium">Month</th>
                    <th className="text-right px-3 py-2 font-medium">Payment</th>
                    <th className="text-right px-3 py-2 font-medium">Interest</th>
                    <th className="text-right px-3 py-2 font-medium">Principal</th>
                    <th className="text-right px-3 py-2 font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {amortization.map((row) => (
                    <tr key={row.month} className="text-gray-300">
                      <td className="px-3 py-2">{row.month}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.payment)}</td>
                      <td className="px-3 py-2 text-right text-red-400">{formatCurrency(row.interest)}</td>
                      <td className="px-3 py-2 text-right text-green-400">{formatCurrency(row.principal)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 3. Payment History ──────────────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Payment History (Last 3 Months)
            </h4>
            <div className="space-y-2">
              {paymentHistory.map((entry, idx) => {
                const badge = paymentStatusBadge(entry.status);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm text-gray-200">{entry.date}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(entry.amount)}</p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 4. Autopay Status ───────────────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Autopay Status
            </h4>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{autopay.icon}</span>
                <span className={`text-sm font-medium ${autopay.classes}`}>{autopay.label}</span>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-blue-400 hover:text-blue-300 underline transition-colors"
              >
                {autopay.actionLabel}
              </button>
            </div>
          </div>

          {/* ── 5. Update Monthly Payment ───────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Update Monthly Payment
            </h4>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    value={newPayment}
                    onChange={(e) => {
                      setNewPayment(e.target.value);
                      setSaveMessage('');
                    }}
                    min={plan.minPayment}
                    step="0.01"
                    className="w-full rounded-lg border border-white/10 bg-[#151d2a] text-white text-sm pl-7 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-label="New monthly payment amount"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSavePayment}
                  className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2.5 transition-colors flex-shrink-0"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Minimum: {formatCurrency(plan.minPayment)}
              </p>
              {saveMessage && (
                <p
                  className={`text-xs mt-2 ${
                    saveMessage.includes('successfully') ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {saveMessage}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── 6. Footer Actions ──────────────────────────────── */}
        <div className="border-t border-white/10 px-6 py-4 bg-[#151d2a]">
          <button
            type="button"
            className="w-full text-center text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-4 py-2.5 transition-colors"
          >
            Contact Client
          </button>
        </div>
      </div>
    </>
  );
}
