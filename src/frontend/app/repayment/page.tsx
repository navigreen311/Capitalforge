'use client';

// ============================================================
// /repayment — Repayment Command Center
//
// Reads /api/v1/clients/:clientId/repayment for the selected client.
//
// Sections:
//   1. Client selector
//   2. Plan summary (balance, obligations, autopay coverage, cards at risk)
//   3. Intro-APR expiry alerts
//   4. Cards, in payoff order
//   5. Upcoming payment calendar
//   6. Export, generated from the loaded data
//
// What this page cannot show, and why:
//
// Card balances are not modelled. CardApplication carries limits and rates;
// RepaymentPlan carries one plan-level totalBalance. Nothing supplies a
// per-card balance, because no issuer integration exists to report one. Every
// figure derived from a per-card balance — utilisation, months to payoff, the
// avalanche/snowball comparison, the payoff projection curve, balance-transfer
// economics — therefore has no source.
//
// Those sections used to be rendered from a fixed array of five invented
// cards: $18,400 on an Ink Business Cash, an avalanche plan "saving" $3,140
// against snowball. None of it moved when a client was selected, because
// nothing was ever fetched. They are gone rather than rendered from zeros,
// which would read as a client who owes nothing.
//
// Writes are absent by design. repayment.service.ts keeps plans and schedules
// in module-level Maps and its router is not mounted, so an autopay change or
// a mark-paid would survive until the next restart and never reach the
// database this page reads. The controls are read-only and say so, instead of
// reporting a save that did not happen.
// ============================================================

import { useState, useMemo, Suspense } from 'react';
import PaymentCalendar, { type PaymentDue } from '../../components/modules/payment-calendar';
import InterestShockAlert, { type PromoCard } from '../../components/modules/interest-shock-alert';
import { RepaymentClientSelector } from '@/components/repayment';
import type { RepaymentClient } from '@/components/repayment';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import {
  toRepaymentView,
  toCardRows,
  formatAmountOrDash,
  type RepaymentView,
  type AprExpiryRow,
  type CardRow,
} from '@/lib/repayment-view';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** APRs arrive as decimal fractions (0.2124); render as a percentage. */
function formatApr(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(2)}%`;
}

/** A percentage the API may not carry. */
function formatPercentOrDash(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

const STRATEGY_LABELS: Record<string, string> = {
  avalanche: 'Avalanche — highest APR first',
  snowball: 'Snowball — lowest balance first',
};

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}


const SEVERITY_STYLES: Record<AprExpiryRow['severity'], { text: string }> = {
  critical: { text: 'text-red-300' },
  warning: { text: 'text-yellow-300' },
  ok: { text: 'text-green-300' },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RepaymentPage() {
  const [selectedClient, setSelectedClient] = useState<RepaymentClient | null>(null);

  // useAuthFetch skips any path containing "undefined", so no request is made
  // until a client is chosen.
  const {
    data: raw,
    isLoading,
    error,
    refetch,
  } = useAuthFetch<unknown>(`/api/v1/clients/${selectedClient?.id ?? 'undefined'}/repayment`);

  const view: RepaymentView | null = useMemo(
    () => (raw === null || raw === undefined ? null : toRepaymentView(raw)),
    [raw],
  );

  // Cards in payoff order, each joined to its soonest unpaid payment.
  const cardRows: CardRow[] = useMemo(() => (view ? toCardRows(view) : []), [view]);

  // The alert component treats balance as optional and renders balance-derived
  // figures as unavailable without it, so the real expiries still show.
  const promoCards: PromoCard[] = useMemo(
    () =>
      cardRows
        .filter((c) => c.postExpiryApr !== null)
        .map((c) => ({
          id: c.applicationId,
          cardName: c.cardProduct,
          issuer: c.issuer,
          promoExpiresAt: c.expiryDate,
          promoApr: (c.introApr ?? 0) * 100,
          regularApr: (c.postExpiryApr ?? 0) * 100,
          balance: null,
        })),
    [cardRows],
  );

  const calendarPayments: PaymentDue[] = useMemo(
    () =>
      (view?.payments ?? []).map((p) => ({
        id: p.id,
        cardName: p.cardProduct ?? p.issuer,
        issuer: p.issuer,
        dueDate: p.date,
        amount: p.amount,
        status: (p.status === 'paid'
          ? 'paid'
          : p.status === 'overdue'
            ? 'overdue'
            : 'upcoming') as PaymentDue['status'],
        minPayment: p.amount,
      })),
    [view],
  );

  // ── Export, built from what is on screen ──
  function handleExportSummary() {
    if (!view || !selectedClient) return;

    const lines = [
      'REPAYMENT SUMMARY',
      `Client: ${selectedClient.legal_name}`,
      `Generated: ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`,
      '',
      `Repayment plan on record: ${view.hasPlan ? 'yes' : 'no'}`,
      `Strategy: ${view.strategy ? (STRATEGY_LABELS[view.strategy] ?? view.strategy) : 'not set'}`,
      `Total balance: ${formatAmountOrDash(view.totalBalance)}`,
      `Monthly obligations: ${formatAmountOrDash(view.totalMonthlyObligations)}`,
      `Autopay coverage: ${formatPercentOrDash(view.autopayPercent)}`,
      `Cards with intro APR lapsing within 30 days: ${view.cardsAtRisk}`,
      '',
      'CARDS, IN PAYOFF ORDER',
      '-'.repeat(60),
      ...cardRows.map(
        (c) =>
          `${c.priority ?? '-'}. ${c.cardProduct} (${c.issuer})\n` +
          `   Limit: ${formatAmountOrDash(c.creditLimit)} | Intro APR: ${formatApr(c.introApr)} | ` +
          `After expiry: ${formatApr(c.postExpiryApr)} | ` +
          `Expires: ${formatDate(c.expiryDate)} (${c.daysRemaining}d)`,
      ),
      '',
      // Stated, rather than left to be inferred from a missing column.
      'Card balances are not tracked, so utilisation and months-to-payoff are',
      'not included in this summary.',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repayment-summary-${selectedClient.id}-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasCards = cardRows.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      {/* Client selector */}
      <Suspense fallback={<div className="h-12" />}>
        <RepaymentClientSelector
          selectedClient={selectedClient}
          onClientSelect={setSelectedClient}
          onClear={() => setSelectedClient(null)}
        />
      </Suspense>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Repayment Command Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Intro-APR exposure, payoff order and upcoming payments for the selected client.
          </p>
        </div>

        {view && view.cardsAtRisk > 0 && (
          <div className="flex items-center gap-2 bg-red-900/40 border border-red-700 rounded-lg px-3 py-2">
            <span className="text-red-400 text-sm font-semibold">
              ⚠ {view.cardsAtRisk} card{view.cardsAtRisk > 1 ? 's' : ''} lapsing within 30 days
            </span>
          </div>
        )}
      </div>

      {!selectedClient && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-12 text-center">
          <p className="text-sm text-gray-400">
            Select a client above to load their repayment position.
          </p>
        </div>
      )}

      {selectedClient && isLoading && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-12 text-center">
          <p className="text-sm text-gray-500">Loading repayment detail…</p>
        </div>
      )}

      {selectedClient && error && !isLoading && (
        <DashboardErrorState error={error} onRetry={refetch} variant="dark" />
      )}

      {selectedClient && view && !isLoading && !error && (
        <>
          {/* ── Summary ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Balance"
              value={formatAmountOrDash(view.totalBalance)}
              sub={view.hasPlan ? 'from the active plan' : 'no repayment plan on record'}
              accent={view.totalBalance === null ? 'text-gray-500' : 'text-red-300'}
            />
            <SummaryCard
              label="Monthly Obligations"
              value={formatAmountOrDash(view.totalMonthlyObligations)}
              sub={view.hasPlan ? 'scheduled monthly payment' : 'requires a plan'}
              accent={view.totalMonthlyObligations === null ? 'text-gray-500' : 'text-[#C9A84C]'}
            />
            <SummaryCard
              label="Autopay Coverage"
              value={formatPercentOrDash(view.autopayPercent)}
              sub={
                view.autopayPercent === null
                  ? 'no upcoming payments scheduled'
                  : 'of upcoming payments on autopay'
              }
              accent={view.autopayPercent === null ? 'text-gray-500' : 'text-blue-300'}
            />
            <SummaryCard
              label="Cards At Risk"
              value={String(view.cardsAtRisk)}
              sub="intro APR lapsing within 30 days"
              accent={view.cardsAtRisk > 0 ? 'text-red-300' : 'text-gray-300'}
            />
          </div>

          {/* Plan status. The strategy is read from the plan rather than chosen
              here: switching it would need a write path that does not exist. */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                  Repayment Plan
                </p>
                <p className="text-sm text-gray-200 mt-1">
                  {view.hasPlan
                    ? view.strategy
                      ? (STRATEGY_LABELS[view.strategy] ?? view.strategy)
                      : 'Active, no strategy recorded'
                    : 'No repayment plan on record for this client.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportSummary}
                className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm
                  font-semibold text-gray-200 hover:bg-gray-800 hover:border-gray-600
                  transition-colors"
              >
                Export summary
              </button>
            </div>
          </div>

          {/* ── Intro-APR expiry alerts ── */}
          {promoCards.length > 0 && (
            <div>
              <SectionHeading
                title="Intro APR expiry"
                subtitle="Urgency is real; the interest figures need balances, which are not tracked."
              />
              <InterestShockAlert cards={promoCards} minSeverity="safe" />
            </div>
          )}

          {/* ── Cards in payoff order ── */}
          <div>
            <SectionHeading
              title="Cards, in payoff order"
              subtitle="Ordered by how soon each intro rate lapses — the nearest cost comes first."
            />

            {!hasCards ? (
              <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-10 text-center">
                <p className="text-sm text-gray-500">
                  No approved cards with an intro APR on record for this client.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      {['#', 'Card', 'Limit', 'Intro APR', 'After expiry', 'Expires', 'Next payment', 'Autopay'].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {cardRows.map((card) => (
                      <tr
                        key={card.applicationId}
                        className="border-b border-gray-800/60 last:border-0"
                      >
                        <td className="px-4 py-3 text-gray-500">{card.priority ?? '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-100">{card.cardProduct}</p>
                          <p className="text-xs text-gray-500">{card.issuer}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-200">
                          {formatAmountOrDash(card.creditLimit)}
                        </td>
                        <td className="px-4 py-3 text-gray-200">{formatApr(card.introApr)}</td>
                        <td className="px-4 py-3 text-gray-200">{formatApr(card.postExpiryApr)}</td>
                        <td className="px-4 py-3">
                          <p className={`font-semibold ${SEVERITY_STYLES[card.severity].text}`}>
                            {card.daysRemaining <= 0 ? 'Lapsed' : `${card.daysRemaining}d`}
                          </p>
                          <p className="text-xs text-gray-500">{formatDate(card.expiryDate)}</p>
                        </td>
                        <td className="px-4 py-3">
                          {card.nextPayment ? (
                            <>
                              <p className="text-gray-200">
                                {formatCurrency(card.nextPayment.amount)}
                              </p>
                              <p className="text-xs text-gray-500">
                                due {formatDate(card.nextPayment.date)}
                              </p>
                            </>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {card.nextPayment === null ? (
                            <span className="text-gray-600">—</span>
                          ) : card.nextPayment.autopayEnabled ? (
                            <span className="text-green-400 text-xs font-semibold">On</span>
                          ) : (
                            <span className="text-gray-400 text-xs font-semibold">Off</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Says what is missing and why, rather than leaving a reader to
                assume the columns were simply not needed. */}
            <p className="text-xs text-gray-500 mt-2">
              Balances, utilisation and months-to-payoff are not shown: no issuer
              integration reports per-card balances, so there is nothing to display.
              Autopay reflects the next scheduled payment and is read-only here —
              changing it needs a write path that does not exist yet.
            </p>
          </div>

          {/* ── Payment calendar ── */}
          <div>
            <SectionHeading
              title="Upcoming payments"
              subtitle={
                calendarPayments.length === 0
                  ? 'No scheduled payments on record.'
                  : `${calendarPayments.length} scheduled payment${
                      calendarPayments.length === 1 ? '' : 's'
                    }.`
              }
            />
            <PaymentCalendar payments={calendarPayments} />
          </div>
        </>
      )}
    </div>
  );
}
