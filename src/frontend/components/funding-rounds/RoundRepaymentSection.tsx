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
  applicationId: string;
  issuer: string;
  cardProduct: string;
  creditLimit: number | null;
  introAprExpiry: string | null;
  daysRemaining: number | null;
  regularApr: number | null;
  annualFee: number | null;
  severity: 'critical' | 'warning' | 'ok' | null;
}

/**
 * The exposure when intro rates lapse.
 *
 * Expressed against credit limits, not balances: no issuer integration
 * supplies a carried balance, so a balance-based interest cost cannot be
 * computed. `basedOnCards` and `cardsMissingApr` are reported so a partial
 * figure is not read as a complete one.
 */
interface AprWindow {
  daysRemaining: number;
  deadlineDate: string;
  annualisedExposure: number;
  basedOnCards: number;
  cardsMissingApr: number;
}

interface RoundRepaymentData {
  cards: CardRepaymentEntry[];
  aprWindow: AprWindow | null;
}

// ---------------------------------------------------------------------------
// Placeholder / fallback data
// ---------------------------------------------------------------------------

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
        If balances carry past {formatDate(aprWindow.deadlineDate)}:
      </p>
      <ul className={`text-sm ${textColor} space-y-1 list-disc list-inside`}>
        <li>
          Monthly interest cost:{' '}
          <span className="font-semibold">{formatCurrency(aprWindow.annualisedExposure)}/year</span>
        </li>
        <li>
          Annual interest cost:{' '}
          <span className="font-semibold">
            {aprWindow.basedOnCards} card{aprWindow.basedOnCards !== 1 ? 's' : ''}
          </span>
        </li>
        <li>
          Action required by:{' '}
          <span className="font-semibold">
            {aprWindow.cardsMissingApr > 0
              ? `${aprWindow.cardsMissingApr} card(s) have no APR on record`
              : 'all cards have an APR on record'}
          </span>
        </li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function RoundRepaymentSection({ roundId, clientId }: RoundRepaymentSectionProps) {
  const { data, isLoading, error, refetch } = useAuthFetch<{
    cards?: CardRepaymentEntry[];
    totals?: {
      interestShockAnnualised?: number;
      interestShockBasedOnCards?: number;
      cardsMissingRegularApr?: number;
    };
    nextAprExpiry?: { introAprExpiry?: string | null; daysRemaining?: number | null } | null;
  }>(`/api/v1/funding-rounds/${roundId}/repayment`);

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
  // No cards on the round is a real answer; this used to substitute a
  // sample card with a due date and an amount.
  const cards = data?.cards ?? [];

  const next = data?.nextAprExpiry ?? null;
  const totals = data?.totals ?? {};
  const aprWindow: AprWindow | null =
    next && next.introAprExpiry && typeof next.daysRemaining === 'number'
      ? {
          daysRemaining: next.daysRemaining,
          deadlineDate: next.introAprExpiry,
          annualisedExposure: totals.interestShockAnnualised ?? 0,
          basedOnCards: totals.interestShockBasedOnCards ?? 0,
          cardsMissingApr: totals.cardsMissingRegularApr ?? 0,
        }
      : null;

  return (
    <SectionCard title="Repayment Schedule" flushBody>
      {/* ── Cards Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Card</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Credit Limit</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Intro APR Ends</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Days Left</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Regular APR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cards.map((entry) => (
              <tr key={entry.applicationId} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-gray-900 font-medium">
                  {entry.cardProduct}
                  <span className="block text-xs text-gray-500">{entry.issuer}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                  {entry.creditLimit === null ? '\u2014' : formatCurrency(entry.creditLimit)}
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {entry.introAprExpiry ? formatShortDate(entry.introAprExpiry) : '\u2014'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {entry.daysRemaining === null ? (
                    '\u2014'
                  ) : (
                    <span
                      className={
                        entry.severity === 'critical'
                          ? 'text-red-600 font-semibold'
                          : entry.severity === 'warning'
                            ? 'text-amber-600'
                            : 'text-gray-700'
                      }
                    >
                      {entry.daysRemaining} days
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                  {entry.regularApr === null ? '\u2014' : `${entry.regularApr.toFixed(1)}%`}
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
