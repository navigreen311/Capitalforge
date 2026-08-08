'use client';

// ============================================================
// /funding-rounds/[id] — one funding round, read from the API
//
// This page was a single literal. `const PLACEHOLDER = { id: 'FR-018',
// businessName: 'Apex Ventures LLC', roundNumber: 2, targetAmount: 150000,
// obtainedAmount: 105000, advisorName: 'Sarah Chen', ... }` with three cards
// under it, rendered for every round id — including ids belonging to another
// tenant, and ids that do not exist at all. Apex Ventures LLC is one of the
// businesses other specs here assert must never appear, because it is not a
// client.
//
// It survived four passes over this application because the sweep that finds
// pages like this skips dynamic segments: it cannot visit /funding-rounds/[id]
// without an id, so the one page still holding fixtures was the one it could
// not reach. That gap is closed alongside this — the sweep now resolves a real
// id from the API and visits the route properly.
//
// GET /api/funding-rounds/:roundId has been there throughout: tenant-scoped,
// 404 for a round that is not yours, with the applications attached to the
// round and the progress derived from them.
//
// Three things are gone rather than rebuilt:
//
//   Advisor. The fixture named Sarah Chen. A business carries an advisorId,
//   the round does not, and this endpoint returns neither.
//
//   Target close date. There is no such field on a funding round. The date
//   shown was a literal, and a target close is a commitment.
//
//   Economics — a program fee of $4,750, a funding fee of $1,800, $98,450 net
//   capital and an effective rate of 6.25%. cost_calculations is real, but it
//   is keyed to a business rather than a round, so attributing one to this
//   round would invent the attribution even where the numbers are genuine.
// ============================================================

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { toFundingRoundDetail, aprDaysRemaining } from '@/lib/funding-round-detail-view';
import { CapabilityState } from '@/components/ui/capability-state';

// ── Helpers ────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
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

const STATUS_CHIP: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  planning: 'bg-gray-100 text-gray-600 border-gray-200',
};

function chip(status: string): string {
  return STATUS_CHIP[status] ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

function aprColor(days: number | null): string {
  if (days === null) return 'text-gray-400';
  if (days <= 15) return 'text-red-600 font-semibold';
  if (days <= 60) return 'text-amber-600 font-semibold';
  return 'text-emerald-600';
}

// ── Page ──────────────────────────────────────────────────────

export default function FundingRoundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: raw, isLoading, error } = useAuthFetch<unknown>(`/api/funding-rounds/${id}`);
  const round = useMemo(() => toFundingRoundDetail(raw), [raw]);

  const back = (
    <button
      onClick={() => router.push('/funding-rounds')}
      className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
    >
      ← Back to Funding Rounds
    </button>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {back}
        <p className="text-sm text-gray-500">Loading funding round…</p>
      </div>
    );
  }

  if (error !== null || !round.loaded) {
    // A round that is not there, or not yours, renders nothing. This page used
    // to draw FR-018 in both cases.
    return (
      <div className="space-y-6">
        {back}
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-1">
          <h1 className="text-sm font-semibold text-red-900">
            This funding round could not be read.
          </h1>
          <p className="text-xs text-red-800">
            It may not exist, or it may belong to another tenant. No round is shown — this
            page used to render the same sample round for any id at all.
          </p>
        </div>
      </div>
    );
  }

  const pct = round.progress.targetProgressPct;

  return (
    <div className="space-y-6">
      {back}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {round.roundNumber === null ? 'Funding round' : `Round ${round.roundNumber}`} —{' '}
            {round.businessName}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Started {formatDate(round.startedAt)}
            {round.completedAt === null ? '' : ` · completed ${formatDate(round.completedAt)}`}
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${chip(round.status)}`}>
          {round.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900">Credit obtained</h2>
          <p className="text-sm text-gray-600 tabular-nums">
            {fmt(round.progress.creditObtained)}
            {round.targetCredit === null ? '' : ` of ${fmt(round.targetCredit)}`}
          </p>
        </div>

        {round.targetCredit === null || pct === null ? (
          // No bar without a denominator: an empty one reads as no progress
          // and a full one as the target being met.
          <p className="text-xs text-gray-500">
            No target credit is recorded for this round, so progress is not shown as a
            share. {fmt(round.progress.creditObtained)} has been obtained.
          </p>
        ) : (
          <>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {pct}% of target
              {round.progress.creditRemaining === null
                ? ''
                : ` · ${fmt(round.progress.creditRemaining)} remaining`}
            </p>
          </>
        )}

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          {[
            { k: 'Applications', v: String(round.progress.applicationCount) },
            { k: 'Approved', v: String(round.progress.approvedCount) },
            { k: 'Pending', v: String(round.progress.pendingCount) },
            { k: 'Declined', v: String(round.progress.declinedCount) },
          ].map((f) => (
            <div key={f.k}>
              <dt className="text-[10px] text-gray-500 uppercase tracking-wide">{f.k}</dt>
              <dd className="text-sm text-gray-900 mt-0.5 tabular-nums">{f.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Cards on this round */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Cards on this round</h2>

        {round.applications.length === 0 ? (
          <p className="text-xs text-gray-500">
            No card applications are attached to this round. Three were shown here for every
            round, whatever was on file.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                <th className="pb-2 font-medium">Card</th>
                <th className="pb-2 font-medium">Issuer</th>
                <th className="pb-2 font-medium">Limit</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Intro APR ends</th>
              </tr>
            </thead>
            <tbody>
              {round.applications.map((app) => {
                const days = aprDaysRemaining(app.introAprExpiry);
                return (
                  <tr key={app.id} className="border-t border-gray-100">
                    <td className="py-2 text-gray-900">{app.cardProduct}</td>
                    <td className="py-2 text-gray-600">{app.issuer}</td>
                    <td className="py-2 text-gray-700 tabular-nums">
                      {/* Not $0: a card with no limit recorded is not a card
                          approved for nothing. */}
                      {app.creditLimit === null ? (
                        <span className="italic text-gray-400">not recorded</span>
                      ) : (
                        fmt(app.creditLimit)
                      )}
                    </td>
                    <td className="py-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${chip(app.status)}`}
                      >
                        {app.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`py-2 ${aprColor(days)}`}>
                      {app.introAprExpiry === null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <>
                          {formatDate(app.introAprExpiry)}
                          {days === null ? '' : ` (${days}d)`}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* What this page no longer claims */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Not shown here</h2>

        <CapabilityState
          state="not_built"
          size="section"
          title="An advisor and a target close date"
          detail="Both were literals. A business carries an advisor; the round does not, and there is no target close field on a funding round at all."
          unblock={{
            kind: 'unblocked_by',
            text: 'a target-close column on the round, and a decision about whether an advisor belongs to the round or is inherited from the business.',
          }}
        />

        <CapabilityState
          state="not_built"
          size="section"
          title="Round economics"
          detail="A program fee, a funding fee, net capital and an effective rate were shown per round. Cost calculations are real, but they are keyed to a business rather than a round."
          unblock={{
            kind: 'unblocked_by',
            // Worth stating as a hazard rather than a gap: the figures exist
            // and are correct, so showing them here would look right. What
            // would be invented is the attribution, not the number.
            text: 'attributing a cost calculation to a round. The figures are genuine today — what is missing is the link, so putting them here would invent the attribution rather than the amount.',
          }}
        />
      </div>
    </div>
  );
}
