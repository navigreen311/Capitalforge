'use client';

// ============================================================
// ActiveFundingRounds — Dashboard summary of in-progress rounds
// Compact table with progress bars, APR expiry warnings, and
// status badges. Shows 5 rows with "View all" overflow link.
// ============================================================

import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from './DashboardErrorState';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RoundSummary {
  id: string;
  client_name: string;
  client_id: string;
  round_number: number;
  target_credit: number;
  achieved_credit: number;
  progress_pct: number;
  cards_approved: number;
  apr_expiry_soonest: string | null;
  apr_days_remaining: number | null;
  status: string;
}

interface ActiveRoundsData {
  total_count: number;
  total_target: number;
  total_achieved: number;
  rounds: RoundSummary[];
  last_updated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function truncateId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}

function progressColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function aprExpiryColor(days: number | null): string {
  if (days === null) return 'text-gray-400';
  if (days < 30) return 'text-red-500 font-semibold';
  if (days < 60) return 'text-amber-500 font-semibold';
  return 'text-green-600';
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    planning: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    paused: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
  };
  const label = status.replace(/_/g, ' ');
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${
        styles[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {label}
    </span>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-4 w-12 bg-gray-200 rounded" />
          <div className="flex-1 h-2 bg-gray-200 rounded-full" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Progress bar ───────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 rounded-full bg-gray-100 flex-1 min-w-[60px]">
        <div
          className={`h-2 rounded-full ${progressColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ActiveFundingRounds() {
  const { data, isLoading: loading, error, refetch } = useAuthFetch<ActiveRoundsData>('/api/v1/dashboard/active-rounds');

  const VISIBLE_ROWS = 5;

  // ── SectionCard wrapper ─────────────────────────────────────────────────
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          Active Funding Rounds
        </h2>
        {data && (
          <span className="text-xs text-gray-400">
            {data.total_count} active
          </span>
        )}
      </div>

      {/* Loading state */}
      {loading && <LoadingSkeleton />}

      {/* Error state */}
      {error && <DashboardErrorState error={error} onRetry={refetch} />}

      {/* Empty state */}
      {!loading && !error && data && data.rounds.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-500 mb-3">
            No active funding rounds
          </p>
          <a
            href="/funding-rounds/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Start New Round
          </a>
        </div>
      )}

      {/* Data table */}
      {!loading && !error && data && data.rounds.length > 0 && (
        <>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="pb-2 pr-3">Round ID</th>
                  <th className="pb-2 pr-3">Client</th>
                  <th className="pb-2 pr-3 text-center">Round #</th>
                  <th className="pb-2 pr-3 text-right">Target</th>
                  <th className="pb-2 pr-3 min-w-[140px]">Achieved</th>
                  <th className="pb-2 pr-3 text-center">Cards</th>
                  <th className="pb-2 pr-3">APR Expiry</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.rounds.slice(0, VISIBLE_ROWS).map((round) => (
                  <tr key={round.id} className="hover:bg-gray-50/50">
                    <td className="py-2.5 pr-3">
                      <span
                        className="text-xs text-gray-400 font-mono"
                        title={round.id}
                      >
                        {truncateId(round.id)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-gray-900 max-w-[160px] truncate">
                      {round.client_name}
                    </td>
                    <td className="py-2.5 pr-3 text-center text-gray-600">
                      {round.round_number}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">
                      {formatCurrency(round.target_credit)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="space-y-1">
                        <span className="text-xs tabular-nums text-gray-600">
                          {formatCurrency(round.achieved_credit)}
                        </span>
                        <ProgressBar pct={round.progress_pct} />
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-center tabular-nums text-gray-700">
                      {round.cards_approved}
                    </td>
                    <td className="py-2.5 pr-3">
                      {round.apr_expiry_soonest ? (
                        <span
                          className={`text-xs tabular-nums ${aprExpiryColor(
                            round.apr_days_remaining,
                          )}`}
                        >
                          {round.apr_days_remaining}d
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">--</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">{statusBadge(round.status)}</td>
                    <td className="py-2.5">
                      <a
                        href={`/funding-rounds/${round.id}`}
                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
                      >
                        View Round
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary totals row */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <div className="flex gap-4">
              <span>
                Target:{' '}
                <span className="font-semibold text-gray-700">
                  {formatCurrency(data.total_target)}
                </span>
              </span>
              <span>
                Achieved:{' '}
                <span className="font-semibold text-gray-700">
                  {formatCurrency(data.total_achieved)}
                </span>
              </span>
              <span>
                Progress:{' '}
                <span className="font-semibold text-gray-700">
                  {data.total_target > 0
                    ? (
                        (data.total_achieved / data.total_target) *
                        100
                      ).toFixed(1)
                    : 0}
                  %
                </span>
              </span>
            </div>
          </div>

          {/* View all link */}
          {data.total_count > VISIBLE_ROWS && (
            <div className="mt-3 text-center">
              <a
                href="/funding-rounds"
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                View all {data.total_count} rounds
              </a>
            </div>
          )}
        </>
      )}
    </section>
  );
}
