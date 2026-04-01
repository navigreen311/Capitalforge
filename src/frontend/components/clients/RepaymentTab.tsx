'use client';

// ============================================================
// RepaymentTab — Client repayment overview with payment calendar,
// APR expiry schedule, and payoff waterfall recommendation.
// ============================================================

import { useAuthFetch } from '@/hooks/useAuthFetch';
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
  const { data, isLoading, error, refetch } = useAuthFetch<RepaymentData>(
    `/api/v1/clients/${clientId}/repayment`,
  );

  if (isLoading) return <RepaymentSkeleton />;

  if (error) {
    return <DashboardErrorState error={error} onRetry={refetch} />;
  }

  if (!data) return null;

  const { summary, payments, aprExpiry, interestShockMonthly, payoffWaterfall } = data;

  return (
    <div className="space-y-6">
      {/* ── Section 1: Repayment Summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Next Payment Due"
          value={formatCurrency(summary.nextPaymentAmount)}
          subtitle={`${formatDate(summary.nextPaymentDate)} - ${summary.nextPaymentCard}`}
          icon="$"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Total Monthly Obligations"
          value={formatCurrency(summary.totalMonthlyObligations)}
          icon="$"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          title="On Autopay"
          value={`${summary.autopayPercent}%`}
          icon="AP"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
        <StatCard
          title="Cards at Risk"
          value={String(summary.cardsAtRisk)}
          subtitle="Utilization > 80%"
          icon="!!"
          iconBg={summary.cardsAtRisk > 0 ? 'bg-red-50' : 'bg-emerald-50'}
          iconColor={summary.cardsAtRisk > 0 ? 'text-red-600' : 'text-emerald-600'}
          trendDirection={summary.cardsAtRisk > 0 ? 'down' : 'flat'}
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
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Card</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Issuer</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Amount</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Type</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((payment, idx) => (
                <tr
                  key={`${payment.date}-${payment.card}-${idx}`}
                  className={payment.status === 'overdue' ? 'bg-red-50' : 'hover:bg-gray-50'}
                >
                  <td className="px-6 py-3 text-gray-700 whitespace-nowrap">{formatDate(payment.date)}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{payment.card}</td>
                  <td className="px-4 py-3 text-gray-500">{payment.issuer}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium tabular-nums">{formatCurrency(payment.amount)}</td>
                  <td className="px-4 py-3 text-center"><TypeBadge type={payment.type} /></td>
                  <td className="px-6 py-3 text-center"><StatusBadge status={payment.status} /></td>
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
                <tr key={entry.cardName} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-900 font-medium">{entry.cardName}</td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatCurrency(entry.limit)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDate(entry.expiryDate)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${getDaysLeftColor(entry.daysLeft)}`}>
                    {entry.daysLeft} days
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">{entry.regularApr.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Interest shock forecast */}
        {interestShockMonthly > 0 && (
          <div className="mx-6 my-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Interest Shock Forecast:</span>{' '}
              If balances carry past promo: estimated{' '}
              <span className="font-bold">{formatCurrency(interestShockMonthly)}/month</span>{' '}
              in interest.
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
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Balance</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">APR</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Monthly Min</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payoffWaterfall.map((entry) => (
                <tr key={entry.priority} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-navy/10 text-brand-navy text-xs font-bold">
                      {entry.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{entry.card}</td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatCurrency(entry.balance)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={entry.apr >= 20 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                      {entry.apr.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatCurrency(entry.monthlyMinimum)}</td>
                  <td className="px-6 py-3 text-gray-600 text-xs">{entry.payoffRecommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
