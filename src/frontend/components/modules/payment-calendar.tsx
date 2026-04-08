'use client';

// ============================================================
// PaymentCalendar — Monthly calendar grid showing payment
// due dates per card. Color-coded by payment status:
//   green  = paid
//   yellow = upcoming (within 7 days)
//   red    = overdue
//   gray   = future
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentStatus = 'paid' | 'upcoming' | 'overdue' | 'scheduled';

export interface PaymentDue {
  id: string;
  cardName: string;
  issuer: string;
  dueDate: string; // ISO date string
  amount: number;
  status: PaymentStatus;
  minPayment?: number;
}

interface PaymentCalendarProps {
  payments?: PaymentDue[];
  /** ISO date string for "today"; defaults to real today */
  today?: string;
  className?: string;
  /** Callback when "Mark Paid" is clicked on a payment */
  onMarkPaid?: (paymentId: string) => void;
  /** Callback when "Contact Client" is clicked on an overdue day */
  onContactClient?: (paymentId: string) => void;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const today = new Date();
const yy = today.getFullYear();
const mm = today.getMonth();

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export const PLACEHOLDER_PAYMENTS: PaymentDue[] = [
  {
    id: 'pay_001',
    cardName: 'Ink Business Preferred',
    issuer: 'Chase',
    dueDate: isoDay(addDays(today, -5)),
    amount: 1_200,
    minPayment: 35,
    status: 'paid',
  },
  {
    id: 'pay_002',
    cardName: 'Business Gold Card',
    issuer: 'Amex',
    dueDate: isoDay(addDays(today, -2)),
    amount: 880,
    minPayment: 27,
    status: 'overdue',
  },
  {
    id: 'pay_003',
    cardName: 'Spark Cash Plus',
    issuer: 'Capital One',
    dueDate: isoDay(addDays(today, 3)),
    amount: 540,
    minPayment: 25,
    status: 'upcoming',
  },
  {
    id: 'pay_004',
    cardName: 'Plum Card',
    issuer: 'Amex',
    dueDate: isoDay(addDays(today, 5)),
    amount: 2_300,
    minPayment: 60,
    status: 'upcoming',
  },
  {
    id: 'pay_005',
    cardName: 'Ink Business Cash',
    issuer: 'Chase',
    dueDate: isoDay(addDays(today, 12)),
    amount: 760,
    minPayment: 25,
    status: 'scheduled',
  },
  {
    id: 'pay_006',
    cardName: 'Business Platinum',
    issuer: 'Amex',
    dueDate: isoDay(addDays(today, 18)),
    amount: 4_100,
    minPayment: 100,
    status: 'scheduled',
  },
  {
    id: 'pay_007',
    cardName: 'Venture X Business',
    issuer: 'Capital One',
    dueDate: isoDay(addDays(today, 22)),
    amount: 1_650,
    minPayment: 45,
    status: 'scheduled',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<PaymentStatus, { dot: string; bg: string; border: string; text: string; label: string }> = {
  paid:      { dot: 'bg-green-500',  bg: 'bg-green-900/40',  border: 'border-green-700',  text: 'text-green-300',  label: 'Paid' },
  upcoming:  { dot: 'bg-yellow-400', bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', label: 'Due Soon' },
  overdue:   { dot: 'bg-red-500',    bg: 'bg-red-900/40',    border: 'border-red-700',    text: 'text-red-300',    label: 'Overdue' },
  scheduled: { dot: 'bg-gray-500',   bg: 'bg-gray-800/60',   border: 'border-gray-700',   text: 'text-gray-400',   label: 'Scheduled' },
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PaymentPill({ payment }: { payment: PaymentDue }) {
  const s = STATUS_STYLES[payment.status];
  return (
    <div
      title={`${payment.cardName} · ${formatCurrency(payment.amount)}`}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 border text-[10px] font-medium truncate ${s.bg} ${s.border} ${s.text}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      <span className="truncate">{payment.issuer}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PaymentCalendar({
  payments = PLACEHOLDER_PAYMENTS,
  today: todayProp,
  className = '',
  onMarkPaid,
  onContactClient,
}: PaymentCalendarProps) {
  const referenceToday = todayProp ? new Date(todayProp) : new Date();
  const [viewYear, setViewYear] = useState(referenceToday.getFullYear());
  const [viewMonth, setViewMonth] = useState(referenceToday.getMonth());
  const [selected, setSelected] = useState<string | null>(null); // ISO date

  // Build a map: isoDate → PaymentDue[]
  const paymentMap = new Map<string, PaymentDue[]>();
  payments.forEach((p) => {
    const key = p.dueDate.slice(0, 10);
    if (!paymentMap.has(key)) paymentMap.set(key, []);
    paymentMap.get(key)!.push(p);
  });

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  const todayIso = referenceToday.toISOString().slice(0, 10);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const selectedPayments = selected ? (paymentMap.get(selected) ?? []) : [];

  // Summary counts
  const overdueCount  = payments.filter(p => p.status === 'overdue').length;
  const upcomingCount = payments.filter(p => p.status === 'upcoming').length;
  const totalDue = payments
    .filter(p => p.status === 'upcoming' || p.status === 'overdue')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className={`rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div>
          <h3 className="text-base font-semibold text-white">Payment Calendar</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {overdueCount > 0 && (
              <span className="text-red-400 font-medium">{overdueCount} overdue · </span>
            )}
            {upcomingCount > 0 && (
              <span className="text-yellow-400 font-medium">{upcomingCount} upcoming · </span>
            )}
            <span>{formatCurrency(totalDue)} due soon</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-gray-200 min-w-[120px] text-center">
            {formatMonthYear(viewYear, viewMonth)}
          </span>
          <button
            onClick={nextMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm"
          >
            ›
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-800">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 divide-x divide-y divide-gray-800/60">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="min-h-[72px] bg-gray-900/30" />;
          }

          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayPayments = paymentMap.get(iso) ?? [];
          const isToday = iso === todayIso;
          const isSelected = iso === selected;

          // Determine highest urgency for cell highlight
          const hasOverdue  = dayPayments.some(p => p.status === 'overdue');
          const hasUpcoming = dayPayments.some(p => p.status === 'upcoming');
          const hasPaid     = dayPayments.some(p => p.status === 'paid');

          let cellBg = 'hover:bg-gray-800/40';
          if (isSelected)       cellBg = 'bg-[#C9A84C]/10';
          else if (hasOverdue)  cellBg = 'bg-red-950/30 hover:bg-red-950/50';
          else if (hasUpcoming) cellBg = 'bg-yellow-950/30 hover:bg-yellow-950/50';
          else if (hasPaid)     cellBg = 'bg-green-950/20 hover:bg-green-950/40';

          return (
            <div
              key={iso}
              onClick={() => setSelected(isSelected ? null : iso)}
              className={`min-h-[72px] p-1.5 cursor-pointer transition-colors ${cellBg}`}
            >
              {/* Day number */}
              <div className={`
                text-xs font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full
                ${isToday
                  ? 'bg-[#C9A84C] text-[#0A1628]'
                  : hasOverdue
                  ? 'text-red-400'
                  : hasUpcoming
                  ? 'text-yellow-400'
                  : 'text-gray-400'}
              `}>
                {day}
              </div>

              {/* Payment pills (up to 2 visible) */}
              <div className="flex flex-col gap-0.5">
                {dayPayments.slice(0, 2).map(p => (
                  <PaymentPill key={p.id} payment={p} />
                ))}
                {dayPayments.length > 2 && (
                  <span className="text-[9px] text-gray-500 pl-1">+{dayPayments.length - 2} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected day detail panel — 5E enhanced with Mark Paid + Past Due CTA */}
      {selected && selectedPayments.length > 0 && (() => {
        const hasOverdueDay = selectedPayments.some(p => p.status === 'overdue');
        return (
          <div className="border-t border-gray-800 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {/* Past Due banner for overdue days */}
            {hasOverdueDay && (
              <div className="flex items-center justify-between rounded-lg border border-red-700 bg-red-900/30 px-4 py-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-sm">&#9888;</span>
                  <span className="text-sm font-semibold text-red-300">Past Due — Contact Client</span>
                </div>
                <button
                  onClick={() => {
                    const overduePayment = selectedPayments.find(p => p.status === 'overdue');
                    if (overduePayment && onContactClient) onContactClient(overduePayment.id);
                  }}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-800 text-red-200 hover:bg-red-700 transition-colors"
                >
                  Contact Now
                </button>
              </div>
            )}

            <div className="space-y-2">
              {selectedPayments.map(p => {
                const s = STATUS_STYLES[p.status];
                return (
                  <div key={p.id} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${s.bg} ${s.border}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-100">{p.cardName}</p>
                      <p className="text-xs text-gray-400">
                        {p.issuer} &middot; {formatCurrency(p.amount)} &middot; Min: {formatCurrency(p.minPayment ?? 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{formatCurrency(p.amount)}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${s.bg} ${s.border} ${s.text}`}>
                          {s.label}
                        </span>
                      </div>
                      {p.status !== 'paid' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onMarkPaid) onMarkPaid(p.id);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-green-700 bg-green-900/40 text-green-300 hover:bg-green-900/60 transition-colors whitespace-nowrap"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div className="flex gap-4 px-5 py-3 border-t border-gray-800 bg-gray-900/30">
        {(['paid', 'upcoming', 'overdue', 'scheduled'] as PaymentStatus[]).map(s => (
          <div key={s} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className={`w-2 h-2 rounded-full ${STATUS_STYLES[s].dot}`} />
            {STATUS_STYLES[s].label}
          </div>
        ))}
      </div>
    </div>
  );
}
