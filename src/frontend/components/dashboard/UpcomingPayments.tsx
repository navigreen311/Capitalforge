'use client';

// ============================================================
// UpcomingPayments — 7-day horizontal payment calendar strip
//
// Summary row: total due, % autopay, manual reminders count
// Horizontal scrollable day cards with color-coded status dots
// Click a day to expand inline payment list
// "Send Reminders" button opens modal with client consent list
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

// ── Types ───────────────────────────────────────────────────────────────────

interface PaymentItem {
  client_name: string;
  client_id: string;
  issuer: string;
  amount: number;
  payment_type: 'autopay' | 'manual';
  status: 'upcoming' | 'paid' | 'missed';
  tcpa_consent?: boolean;
}

type DayStatus = 'all_autopay' | 'some_manual' | 'has_missed';

interface DayBucket {
  date: string;
  day_label: string;
  payment_count: number;
  total_amount: number;
  status: DayStatus;
  payments: PaymentItem[];
}

interface WeekSummary {
  total_due: number;
  autopay_pct: number;
  manual_reminders_needed: number;
}

interface UpcomingPaymentsData {
  week_summary: WeekSummary;
  days: DayBucket[];
  last_updated: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_DOT: Record<DayStatus, string> = {
  all_autopay: 'bg-emerald-500',
  some_manual: 'bg-amber-500',
  has_missed: 'bg-red-500',
};

const STATUS_LABEL: Record<DayStatus, string> = {
  all_autopay: 'All autopay',
  some_manual: 'Manual payments',
  has_missed: 'Has missed',
};

const PAYMENT_STATUS_CHIP: Record<string, string> = {
  upcoming: 'text-blue-600 bg-blue-50',
  paid: 'text-emerald-600 bg-emerald-50',
  missed: 'text-red-600 bg-red-50',
};

// ── Loading skeleton ────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <section aria-label="Upcoming Payments">
      <div className="bg-white rounded-xl border border-surface-border shadow-card p-6 animate-pulse">
        {/* Title skeleton */}
        <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
        {/* Summary row skeleton */}
        <div className="flex items-center gap-6 mb-4">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        {/* Day strip skeleton */}
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="min-w-[120px] h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-8">
      <div className="text-2xl mb-2" aria-hidden="true">
        📅
      </div>
      <p className="text-sm font-medium text-gray-700">No upcoming payments</p>
      <p className="text-xs text-gray-500 mt-1">
        Payment data will appear here once clients have scheduled payments.
      </p>
    </div>
  );
}

// ── Reminder Modal ──────────────────────────────────────────────────────────

function ReminderModal({
  payments,
  onClose,
  onSent,
}: {
  payments: PaymentItem[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Escape key handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Filter to only manual/upcoming payments that need reminders
  const remindable = payments.filter(
    (p) => p.payment_type === 'manual' && p.status !== 'paid',
  );

  // Eligible = has TCPA consent
  const eligible = remindable.filter((p) => p.tcpa_consent !== false);
  const ineligible = remindable.filter((p) => p.tcpa_consent === false);

  async function handleSendReminders() {
    if (eligible.length === 0) return;
    setSending(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/v1/voiceforge/send-reminders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          client_ids: eligible.map((p) => p.client_id),
          count: eligible.length,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSent(true);
      onSent();
    } catch (err) {
      console.error('[UpcomingPayments] send reminders failed:', err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Send payment reminders"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Send Reminders</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Close modal"
            type="button"
          >
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {remindable.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No manual payments need reminders.</p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Clients with manual payments due in the next 3 days:
            </p>
            <ul className="divide-y divide-gray-100 max-h-60 overflow-y-auto mb-4">
              {eligible.map((p, i) => (
                <li key={`${p.client_id}-${p.issuer}-${i}`} className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{p.client_name}</span>
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Consent
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    ${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </li>
              ))}
              {ineligible.map((p, i) => (
                <li
                  key={`no-consent-${p.client_id}-${p.issuer}-${i}`}
                  className="py-2 flex items-center justify-between opacity-50"
                  title="TCPA consent required to send reminders"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500">{p.client_name}</span>
                    <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                      Consent required
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-400">
                    ${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </li>
              ))}
            </ul>

            {sent ? (
              <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium py-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Reminders sent successfully
              </div>
            ) : (
              <button
                onClick={handleSendReminders}
                disabled={sending || eligible.length === 0}
                className="w-full bg-brand-navy text-white text-sm font-semibold py-2.5 px-4 rounded-lg
                           hover:bg-brand-navy/90 disabled:opacity-50 transition-colors"
                type="button"
              >
                {sending
                  ? 'Sending...'
                  : `Send to ${eligible.length} eligible client${eligible.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Day Card ────────────────────────────────────────────────────────────────

function DayCard({
  day,
  isToday,
  isSelected,
  onClick,
}: {
  day: DayBucket;
  isToday: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const baseClasses = 'min-w-[120px] p-3 rounded-lg border cursor-pointer transition-all duration-150 flex-shrink-0';
  const todayClasses = isToday
    ? 'border-2 border-brand-navy bg-brand-navy/5'
    : 'bg-white border-surface-border hover:border-gray-300';
  const selectedClasses = isSelected ? 'ring-2 ring-brand-navy/40' : '';

  const dotColor = STATUS_DOT[day.status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${todayClasses} ${selectedClasses}`}
      aria-label={`${day.day_label}, ${day.payment_count} payment${day.payment_count !== 1 ? 's' : ''}, ${formatCurrency(day.total_amount)}`}
      aria-pressed={isSelected}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {day.day_label}
        </span>
        {day.payment_count > 0 && (
          <span className={`w-2 h-2 rounded-full ${dotColor}`} aria-hidden="true" />
        )}
      </div>
      {isToday && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-navy mb-0.5 block">
          Today
        </span>
      )}
      <p className="text-lg font-bold leading-tight text-gray-900">
        {formatCurrency(day.total_amount)}
      </p>
      <p className="text-xs mt-0.5 text-gray-400">
        {day.payment_count} payment{day.payment_count !== 1 ? 's' : ''}
      </p>
    </button>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function UpcomingPayments() {
  const { data, isLoading, error, refetch } = useAuthFetch<UpcomingPaymentsData>(
    '/api/v1/dashboard/upcoming-payments',
  );

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleCloseModal = useCallback(() => setShowReminderModal(false), []);

  const handleRemindersSent = useCallback(() => {
    setToastMessage('Reminders sent successfully!');
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // Auto-select today on first data load
  useEffect(() => {
    if (data && data.days.length > 0 && selectedDay === null) {
      setSelectedDay(data.days[0].date);
    }
  }, [data, selectedDay]);

  // ── Loading ───────────────────────────────────────────────────
  if (isLoading) return <div style={{ minHeight: 160 }}><Skeleton /></div>;

  // ── Error ─────────────────────────────────────────────────────
  if (error) {
    return (
      <section aria-label="Upcoming Payments" style={{ minHeight: 160 }}>
        <DashboardErrorState error={error} onRetry={refetch} />
      </section>
    );
  }

  // ── No data ───────────────────────────────────────────────────
  if (!data || data.days.length === 0) {
    return (
      <section aria-label="Upcoming Payments">
        <div className="bg-white rounded-xl border border-surface-border shadow-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Upcoming Payments</h2>
          <EmptyState />
        </div>
      </section>
    );
  }

  const selectedBucket = data.days.find((d) => d.date === selectedDay);
  const todayStr = data.days[0]?.date;

  // Collect manual/upcoming payments from the next 3 days for the reminder modal
  const reminderPayments = data.days
    .slice(0, 3)
    .flatMap((d) =>
      d.payments.filter((p) => p.payment_type === 'manual' && p.status !== 'paid'),
    );

  return (
    <section aria-label="Upcoming Payments">
      <div className="bg-white rounded-xl border border-surface-border shadow-card p-6 relative">
        {/* ── Toast notification ──────────────────────────────── */}
        {toastMessage && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm font-medium px-4 py-2 rounded-lg border border-emerald-200 shadow-sm z-10 animate-in fade-in">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {toastMessage}
          </div>
        )}

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Upcoming Payments</h2>
          {data.week_summary.manual_reminders_needed > 0 && (
            <button
              type="button"
              onClick={() => setShowReminderModal(true)}
              className="text-xs font-semibold text-brand-navy bg-brand-navy/10 px-3 py-1.5 rounded-lg
                         hover:bg-brand-navy/20 transition-colors"
            >
              Send Reminders
            </button>
          )}
        </div>

        {/* ── Summary row — "This Week" ──────────────────────── */}
        <div className="flex items-center gap-6 mb-4 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            This Week
          </span>
          <div>
            <span className="text-gray-500">Total Due: </span>
            <span className="font-semibold text-gray-900">
              {formatCurrency(data.week_summary.total_due)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Autopay: </span>
            <span className="font-semibold text-emerald-600">
              {data.week_summary.autopay_pct}%
            </span>
          </div>
          <div>
            <span className="text-gray-500">Manual: </span>
            <span className={`font-semibold ${data.week_summary.manual_reminders_needed > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {data.week_summary.manual_reminders_needed} reminder{data.week_summary.manual_reminders_needed !== 1 ? 's' : ''} needed
            </span>
          </div>
        </div>

        {/* ── 7-Day Strip ─────────────────────────────────────── */}
        <div className="overflow-x-auto flex gap-3 pb-2">
          {data.days.map((day) => (
            <DayCard
              key={day.date}
              day={day}
              isToday={day.date === todayStr}
              isSelected={day.date === selectedDay}
              onClick={() => setSelectedDay(day.date === selectedDay ? null : day.date)}
            />
          ))}
        </div>

        {/* ── Legend ───────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
          {(['all_autopay', 'some_manual', 'has_missed'] as DayStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} aria-hidden="true" />
              <span>{STATUS_LABEL[s]}</span>
            </div>
          ))}
        </div>

        {/* ── Expanded Payment List ─────────────────────────────── */}
        {selectedBucket && selectedBucket.payments.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              {selectedBucket.day_label} — {selectedBucket.payment_count} payment{selectedBucket.payment_count !== 1 ? 's' : ''}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium">Card Issuer</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedBucket.payments.map((p, i) => (
                    <tr key={`${p.client_id}-${p.issuer}-${i}`}>
                      <td className="py-2 font-medium text-gray-900">{p.client_name}</td>
                      <td className="py-2 text-gray-500">{p.issuer}</td>
                      <td className="py-2 text-right font-semibold text-gray-700">
                        ${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          p.payment_type === 'autopay'
                            ? 'text-emerald-600 bg-emerald-50'
                            : 'text-amber-600 bg-amber-50'
                        }`}>
                          {p.payment_type === 'autopay' ? 'Autopay' : 'Manual'}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${PAYMENT_STATUS_CHIP[p.status] ?? ''}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedBucket && selectedBucket.payments.length === 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-400 text-center py-2">
              No payments due on {selectedBucket.day_label}
            </p>
          </div>
        )}

        {/* ── Reminder Modal ──────────────────────────────────── */}
        {showReminderModal && (
          <ReminderModal
            payments={reminderPayments}
            onClose={handleCloseModal}
            onSent={handleRemindersSent}
          />
        )}
      </div>
    </section>
  );
}
