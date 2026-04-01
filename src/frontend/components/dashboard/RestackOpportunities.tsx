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
  estimated_additional_credit: number;
  readiness_score: number;
  last_funded_date: string | null;
}

interface RestackData {
  total_pipeline_value: number;
  opportunities: RestackOpportunity[];
  last_updated: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getReadinessPill(score: number) {
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
    trackRestackOutreach(opp.client_id, opp.next_round);
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
          Round {opp.current_round} &middot; {formatCurrency(opp.estimated_additional_credit)} est.
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

  const pipelineAction = data ? (
    <span className="text-sm font-semibold text-brand-gold">
      {formatCurrency(data.total_pipeline_value)} pipeline value
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
