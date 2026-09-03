'use client';

// ============================================================
// RestackOpportunities — Re-Stack Opportunities Panel
//
// Displays businesses eligible for another funding round,
// sorted by readiness score. Wraps in SectionCard with
// loading skeleton and empty state handling.
// ============================================================

import { SectionCard } from '../ui/card';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

// ── Types ───────────────────────────────────────────────────────────────────

interface RestackOpportunity {
  client_id: string;
  client_name: string;
  client_initials: string;
  current_round: number;
  next_round: number;
  /** Null when readiness has never been assessed. Not the same as zero. */
  readiness_score: number | null;
  last_funded_date: string | null;
}

interface RestackData {
  /**
   * `total_pipeline_value` is gone from this response and there is nothing to
   * replace it with. It summed an `estimated_additional_credit` that was the
   * previous round's TARGET credit times 0.75 — a multiplier derived from
   * nothing, under a comment claiming to sum approved applications. Nothing in
   * this system forecasts what a client will be approved for.
   */
  eligible_count: number;
  /** What the count is out of, so an empty list is readable. */
  active_count: number;
  not_assessed_count: number;
  opportunities: RestackOpportunity[];
  last_updated: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getReadinessPill(score: number | null) {
  // Not assessed is its own state. Rendering it as 0% put a client nobody has
  // scored in the same grey pill as one scored zero.
  if (score === null) {
    return { bg: 'bg-gray-100 text-gray-500', label: 'not assessed' };
  }
  if (score >= 80) {
    return { bg: 'bg-emerald-100 text-emerald-700', label: `${score}%` };
  }
  if (score >= 60) {
    return { bg: 'bg-amber-100 text-amber-700', label: `${score}%` };
  }
  return { bg: 'bg-gray-100 text-gray-500', label: `${score}%` };
}

function hoursUntilNextBureauRefresh(): number {
  // Bureau data typically refreshes at 06:00 UTC daily
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(6, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60)));
}

// ── Event tracking ──────────────────────────────────────────────────────────

async function trackRestackOutreach(clientId: string, round: number): Promise<void> {
  try {
    await fetch('/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'restack.outreach.initiated',
        payload: {
          client_id: clientId,
          round,
          timestamp: new Date().toISOString(),
        },
      }),
    });
  } catch {
    // fire-and-forget
  }
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-gray-200" />
            <div className="h-2.5 w-20 rounded bg-gray-200" />
          </div>
          <div className="h-5 w-12 rounded-full bg-gray-200" />
          <div className="h-7 w-24 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

// ── Opportunity row ─────────────────────────────────────────────────────────

function OpportunityRow({ opp }: { opp: RestackOpportunity }) {
  const pill = getReadinessPill(opp.readiness_score);

  function handleStartRound() {
    void trackRestackOutreach(opp.client_id, opp.next_round);
    window.location.href = `/applications/new?client_id=${opp.client_id}&round=${opp.next_round}`;
  }

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full bg-brand-gold/20 text-brand-gold
                   flex items-center justify-center text-xs font-bold flex-shrink-0"
        aria-hidden="true"
      >
        {opp.client_initials}
      </div>

      {/* Client info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{opp.client_name}</p>
        <p className="text-xs text-gray-500">
          {opp.current_round > 0
            ? `Round ${opp.current_round} complete · ready for ${opp.next_round}`
            : `No prior round · ready for round ${opp.next_round}`}
        </p>
      </div>

      {/* Readiness pill */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${pill.bg}`}
      >
        {pill.label}
      </span>

      {/* Last funded date */}
      <span className="text-xs text-gray-400 hidden sm:block w-24 text-right flex-shrink-0">
        {formatDate(opp.last_funded_date)}
      </span>

      {/* Action button */}
      <button
        onClick={handleStartRound}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md
                   bg-brand-navy text-white hover:bg-brand-navy/90
                   transition-colors duration-150"
      >
        Start Round {opp.next_round}
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function RestackOpportunities() {
  const { data, isLoading, error, refetch } = useAuthFetch<RestackData>(
    '/api/v1/dashboard/restack-opportunities',
  );

  // ── Header action: pipeline value badge ───────────────────────────────────

  // A count, not a forecast. This read `{formatCurrency(total_pipeline_value)}
  // pipeline value` in gold, from a figure nothing measured.
  const pipelineAction = data ? (
    <span className="text-sm font-semibold text-brand-gold">
      {data.eligible_count} {data.eligible_count === 1 ? 'client' : 'clients'} ready
    </span>
  ) : null;

  return (
    <SectionCard
      title="Re-Stack Opportunities"
      action={pipelineAction}
    >
      {isLoading && <LoadingSkeleton />}

      {error && (
        <DashboardErrorState error={error} onRetry={refetch} />
      )}

      {!isLoading && !error && data && data.opportunities.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">
          No clients ready for re-stack — next bureau refresh in {hoursUntilNextBureauRefresh()} hours.
          {/* An empty list means something different when nobody has been
              scored. Only clients with a readiness assessment are evaluated,
              and this panel used to show the same sentence either way — and
              the same sentence again when the query had failed outright. */}
          {data.not_assessed_count > 0 && (
            <>
              <br />
              {data.not_assessed_count} of {data.active_count} active clients have no readiness
              assessment and were not evaluated.
            </>
          )}
        </p>
      )}

      {!isLoading && !error && data && data.opportunities.length > 0 && (
        <div>
          {data.opportunities.map((opp) => (
            <OpportunityRow key={opp.client_id} opp={opp} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
