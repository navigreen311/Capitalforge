'use client';

// ============================================================
// RepaymentTab — Client repayment overview with payment calendar,
// APR expiry schedule, and payoff waterfall recommendation.
// ============================================================

import { useMemo } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { toRepaymentView, formatAmountOrDash } from '@/lib/repayment-view';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { SectionCard, StatCard } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepaymentTabProps {
  clientId: string;
}

interface PaymentEntry {
  date: string;
  card: string;
  issuer: string;
  amount: number;
  type: 'autopay' | 'manual';
  status: 'upcoming' | 'paid' | 'overdue';
}

interface AprExpiryEntry {
  cardName: string;
  limit: number;
  expiryDate: string;
  daysLeft: number;
  regularApr: number;
  currentBalance: number;
}

interface PayoffEntry {
  priority: number;
  card: string;
  balance: number;
  apr: number;
  monthlyMinimum: number;
  payoffRecommendation: string;
}

interface RepaymentSummary {
  nextPaymentDate: string;
  nextPaymentAmount: number;
  nextPaymentCard: string;
  totalMonthlyObligations: number;
  autopayPercent: number;
  cardsAtRisk: number;
}

interface RepaymentData {
  summary: RepaymentSummary;
  payments: PaymentEntry[];
  aprExpiry: AprExpiryEntry[];
  interestShockMonthly: number;
  payoffWaterfall: PayoffEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDaysLeftColor(days: number): string {
  if (days <= 30) return 'text-red-600 font-semibold';
  if (days <= 90) return 'text-amber-600 font-semibold';
  return 'text-emerald-600';
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function RepaymentSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-surface-border p-6">
            <div className="h-4 w-24 bg-gray-100 rounded mb-3" />
            <div className="h-8 w-20 bg-gray-100 rounded mb-2" />
            <div className="h-3 w-32 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeletons */}
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-border">
            <div className="h-5 w-40 bg-gray-100 rounded" />
          </div>
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, r) => (
              <div key={r} className="flex gap-4">
                <div className="h-5 flex-1 bg-gray-100 rounded" />
                <div className="h-5 flex-1 bg-gray-100 rounded" />
                <div className="h-5 w-20 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status / type badges
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: PaymentEntry['status'] }) {
  const styles: Record<PaymentEntry['status'], string> = {
    upcoming: 'bg-blue-50 text-blue-700',
    paid: 'bg-emerald-50 text-emerald-700',
    overdue: 'bg-red-50 text-red-700',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function TypeBadge({ type }: { type: PaymentEntry['type'] }) {
  const styles: Record<PaymentEntry['type'], string> = {
    autopay: 'bg-purple-50 text-purple-700',
    manual: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[type]}`}>
      {type === 'autopay' ? 'Autopay' : 'Manual'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function RepaymentTab({ clientId }: RepaymentTabProps) {
  const { data, isLoading, error, refetch } = useAuthFetch<unknown>(
    `/api/v1/clients/${clientId}/repayment`,
  );

  const view = useMemo(() => toRepaymentView(data), [data]);

  if (isLoading) return <RepaymentSkeleton />;

  if (error) {
    return <DashboardErrorState error={error} onRetry={refetch} />;
  }

  const { payments, aprExpiry, payoffWaterfall, nextPayment } = view;

  // No plan on record is a real state, and a different one from a plan with
  // nothing due. It used to render as a set of zeroes.
  if (!view.hasPlan && payments.length === 0 && aprExpiry.length === 0) {
    return (
      <SectionCard title="Repayment">
        <div className="rounded-lg border border-dashed border-surface-border bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No repayment plan on record</p>
          <p className="mt-1 text-xs text-gray-500">
            Nothing is scheduled for this client, and no approved card carries an intro APR.
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Section 1: Repayment Summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Next Payment Due"
          value={nextPayment ? formatCurrency(nextPayment.amount) : '—'}
          subtitle={nextPayment ? `${formatDate(nextPayment.date)} - ${nextPayment.issuer}` : 'Nothing scheduled'}
          icon="$"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Total Monthly Obligations"
          value={formatAmountOrDash(view.totalMonthlyObligations)}
          icon="$"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          title="On Autopay"
          value={view.autopayPercent === null ? '—' : `${view.autopayPercent}%`}
          icon="AP"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
        <StatCard
          title="Cards at Risk"
          value={String(view.cardsAtRisk)}
          subtitle="Utilization > 80%"
          icon="!!"
          iconBg={view.cardsAtRisk > 0 ? 'bg-red-50' : 'bg-emerald-50'}
          iconColor={view.cardsAtRisk > 0 ? 'text-red-600' : 'text-emerald-600'}
          trendDirection={view.cardsAtRisk > 0 ? 'down' : 'flat'}
        />
      </div>

      {/* ── Section 2: Payment Calendar (30-day list) ── */}
      <SectionCard
        title="Payment Calendar"
        subtitle="Next 30 days"
        flushBody
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-gray-50/50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Issuer</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Amount</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Autopay</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((payment, idx) => (
                <tr
                  key={payment.id}
                  className={payment.status === 'overdue' ? 'bg-red-50' : 'hover:bg-gray-50'}
                >
                  <td className="px-6 py-3 text-gray-700 whitespace-nowrap">{formatDate(payment.date)}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{payment.issuer}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium tabular-nums">{formatCurrency(payment.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <TypeBadge type={payment.autopayEnabled ? 'autopay' : 'manual'} />
                  </td>
                  <td className="px-6 py-3 text-center"><StatusBadge status={payment.status as never} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section 3: APR Expiry Schedule ── */}
      <SectionCard
        title="APR Expiry Schedule"
        subtitle="Cards with 0% intro APR"
        flushBody
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-gray-50/50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Card Name</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Limit</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Expiry Date</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Days Left</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Regular APR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aprExpiry.map((entry) => (
                <tr key={entry.applicationId} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-900 font-medium">
                    {entry.cardProduct}
                    <span className="block text-xs text-gray-500">{entry.issuer}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatAmountOrDash(entry.creditLimit)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDate(entry.expiryDate)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${getDaysLeftColor(entry.daysRemaining)}`}>
                    {entry.daysRemaining} days
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {entry.postExpiryApr === null ? '—' : `${entry.postExpiryApr.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* An interest forecast needs carried balances, which no issuer
            integration supplies. The figure shown here was invented, so the
            exposure is expressed in terms of what is actually known: the
            limits whose intro rate is about to lapse. */}
        {aprExpiry.some((e) => e.severity !== 'ok') && (
          <div className="mx-6 my-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Intro APR lapsing soon.</span>{' '}
              {aprExpiry.filter((e) => e.severity !== 'ok').length} card(s) leave their
              introductory rate within 60 days. Interest exposure cannot be forecast —
              carried balances are not available from the issuer.
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── Section 4: Payoff Waterfall ── */}
      <SectionCard
        title="Payoff Waterfall"
        subtitle="Recommended payoff order (highest APR first)"
        flushBody
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-gray-50/50">
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 w-16">#</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Card</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Credit Limit</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Why this order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payoffWaterfall.map((entry) => (
                <tr key={entry.applicationId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-navy/10 text-brand-navy text-xs font-bold">
                      {entry.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {entry.cardProduct}
                    <span className="block text-xs text-gray-500">{entry.issuer}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatAmountOrDash(entry.creditLimit)}</td>
                  <td className="px-6 py-3 text-gray-600 text-xs">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
