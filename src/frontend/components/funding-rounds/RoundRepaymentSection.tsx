'use client';

// ============================================================
// RoundRepaymentSection — Repayment schedule section for the
// funding round detail page. Displays card payment table,
// APR window callout with interest shock, and action buttons.
// ============================================================

import Link from 'next/link';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { SectionCard } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoundRepaymentSectionProps {
  roundId: string;
  clientId: string;
}

interface CardRepaymentEntry {
  card: string;
  nextDueDate: string;
  amount: number;
  type: 'autopay' | 'manual';
  status: 'confirmed' | 'pending';
}

interface AprWindow {
  daysRemaining: number;
  balance: number;
  deadlineDate: string;
  monthlyInterestCost: number;
  annualInterestCost: number;
  actionRequiredBy: string;
}

interface RoundRepaymentData {
  cards: CardRepaymentEntry[];
  aprWindow: AprWindow | null;
}

// ---------------------------------------------------------------------------
// Placeholder / fallback data
// ---------------------------------------------------------------------------

const PLACEHOLDER_CARDS: CardRepaymentEntry[] = [
  {
    card: 'Ink Business Preferred',
    nextDueDate: '2026-04-15',
    amount: 1200,
    type: 'autopay',
    status: 'confirmed',
  },
];

const PLACEHOLDER_APR_WINDOW: AprWindow = {
  daysRemaining: 49,
  balance: 12400,
  deadlineDate: '2026-05-20',
  monthlyInterestCost: 309,
  annualInterestCost: 3709,
  actionRequiredBy: '2026-05-05',
};

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

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function RepaymentSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Table skeleton */}
      <div className="p-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-5 flex-[2] bg-gray-100 rounded" />
            <div className="h-5 flex-1 bg-gray-100 rounded" />
            <div className="h-5 flex-1 bg-gray-100 rounded" />
            <div className="h-5 w-20 bg-gray-100 rounded" />
            <div className="h-5 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* APR callout skeleton */}
      <div className="mx-6 mb-6">
        <div className="h-32 bg-amber-50 rounded-lg" />
      </div>

      {/* Button skeleton */}
      <div className="px-6 pb-6 flex gap-3">
        <div className="h-10 w-56 bg-gray-100 rounded-lg" />
        <div className="h-10 w-48 bg-gray-100 rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: CardRepaymentEntry['type'] }) {
  const styles: Record<CardRepaymentEntry['type'], string> = {
    autopay: 'bg-purple-50 text-purple-700',
    manual: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[type]}`}>
      {type === 'autopay' ? 'Autopay' : 'Manual'}
    </span>
  );
}

function StatusBadge({ status }: { status: CardRepaymentEntry['status'] }) {
  const styles: Record<CardRepaymentEntry['status'], string> = {
    confirmed: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// APR Window Callout
// ---------------------------------------------------------------------------

function AprWindowCallout({ aprWindow }: { aprWindow: AprWindow }) {
  const isUrgent = aprWindow.daysRemaining <= 30;
  const borderColor = isUrgent ? 'border-red-300' : 'border-amber-300';
  const bgColor = isUrgent ? 'bg-red-50' : 'bg-amber-50';
  const headerColor = isUrgent ? 'text-red-800' : 'text-amber-800';
  const textColor = isUrgent ? 'text-red-700' : 'text-amber-700';

  return (
    <div className={`mx-6 my-4 rounded-lg border ${borderColor} ${bgColor} p-4`}>
      <p className={`text-sm font-bold ${headerColor} mb-1`}>
        APR WINDOW: {aprWindow.daysRemaining} days remaining
      </p>
      <p className={`text-sm ${textColor} mb-3`}>
        If balance of {formatCurrency(aprWindow.balance)} is not paid by{' '}
        {formatDate(aprWindow.deadlineDate)}:
      </p>
      <ul className={`text-sm ${textColor} space-y-1 list-disc list-inside`}>
        <li>
          Monthly interest cost:{' '}
          <span className="font-semibold">{formatCurrency(aprWindow.monthlyInterestCost)}/month</span>
        </li>
        <li>
          Annual interest cost:{' '}
          <span className="font-semibold">{formatCurrency(aprWindow.annualInterestCost)}/year</span>
        </li>
        <li>
          Action required by:{' '}
          <span className="font-semibold">{formatDate(aprWindow.actionRequiredBy)}</span>
        </li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function RoundRepaymentSection({ roundId, clientId }: RoundRepaymentSectionProps) {
  const { data, isLoading, error, refetch } = useAuthFetch<RoundRepaymentData>(
    `/api/v1/funding-rounds/${roundId}/repayment`,
  );

  if (isLoading) {
    return (
      <SectionCard title="Repayment Schedule">
        <RepaymentSkeleton />
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="Repayment Schedule">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  // Use fetched data or fall back to placeholders
  const cards = data?.cards ?? PLACEHOLDER_CARDS;
  const aprWindow = data?.aprWindow ?? PLACEHOLDER_APR_WINDOW;

  return (
    <SectionCard title="Repayment Schedule" flushBody>
      {/* ── Cards Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                Card
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Next Due
              </th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Amount
              </th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Type
              </th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cards.map((entry, idx) => (
              <tr
                key={`${entry.card}-${idx}`}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-3 text-gray-900 font-medium">{entry.card}</td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {formatShortDate(entry.nextDueDate)}
                </td>
                <td className="px-4 py-3 text-right text-gray-900 font-medium tabular-nums">
                  {formatCurrency(entry.amount)}
                </td>
                <td className="px-4 py-3 text-center">
                  <TypeBadge type={entry.type} />
                </td>
                <td className="px-6 py-3 text-center">
                  <StatusBadge status={entry.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── APR Window Callout ── */}
      {aprWindow && <AprWindowCallout aprWindow={aprWindow} />}

      {/* ── Action Buttons ── */}
      <div className="px-6 py-4 flex flex-wrap gap-3 border-t border-surface-border">
        <button
          type="button"
          className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-white
                     bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors"
        >
          Notify Client About Repayment
        </button>
        <Link
          href={`/clients/${clientId}?tab=repayment`}
          className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-gray-700
                     bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          View Full Repayment Plan
        </Link>
      </div>
    </SectionCard>
  );
}
