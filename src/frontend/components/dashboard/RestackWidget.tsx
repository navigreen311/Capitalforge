'use client';

// ============================================================
// RestackWidget — Dashboard widget showing restack-eligible clients
//
// Shows count of eligible clients, top 5 businesses with:
//   - Name, readiness score, days since last app, recommended action
// Gold accent styling per brand guidelines.
// ============================================================

import { SectionCard } from '../ui/card';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

// ── Types ───────────────────────────────────────────────────

interface RestackEligible {
  businessId: string;
  businessName: string;
  eligible: boolean;
  reasons: string[];
  readinessScore: number;
  daysSinceLastApp: number | null;
  currentUtilization: number | null;
  activeApplicationCount: number;
  recommendedRoundNumber: number;
}

interface RestackResponse {
  eligible: RestackEligible[];
  total: number;
  scannedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-[#C9A84C]';
  return 'text-gray-400';
}

function getScoreBg(score: number): string {
  if (score >= 85) return 'bg-emerald-900/30 border-emerald-800';
  if (score >= 70) return 'bg-[#C9A84C]/10 border-[#C9A84C]/30';
  return 'bg-gray-800 border-gray-700';
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// ── Loading skeleton ────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-700" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-gray-700" />
            <div className="h-2.5 w-20 rounded bg-gray-700" />
          </div>
          <div className="h-5 w-12 rounded-full bg-gray-700" />
        </div>
      ))}
    </div>
  );
}

// ── Callback type ──────────────────────────────────────────

export interface RestackStartRoundPayload {
  client_id: string;
  client_name: string;
  round: number;
}

// ── Eligible row ────────────────────────────────────────────

function EligibleRow({ item, onStartRound }: { item: RestackEligible; onStartRound?: (payload: RestackStartRoundPayload) => void }) {
  const scoreColor = getScoreColor(item.readinessScore);
  const scoreBg = getScoreBg(item.readinessScore);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-800 last:border-b-0">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full bg-[#C9A84C]/20 text-[#C9A84C]
                   flex items-center justify-center text-xs font-bold flex-shrink-0"
        aria-hidden="true"
      >
        {getInitials(item.businessName)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100 truncate">{item.businessName}</p>
        <p className="text-xs text-gray-500">
          {item.daysSinceLastApp !== null ? `${item.daysSinceLastApp}d since last app` : 'No prior apps'}
          {' · '}
          Round {item.recommendedRoundNumber}
        </p>
      </div>

      {/* Readiness score */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${scoreBg} ${scoreColor}`}
      >
        {item.readinessScore}%
      </span>

      {/* Action */}
      <button
        type="button"
        onClick={() =>
          onStartRound?.({
            client_id: item.businessId,
            client_name: item.businessName,
            round: item.recommendedRoundNumber,
          })
        }
        className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md
                   bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40
                   hover:bg-[#C9A84C]/10 transition-colors duration-150"
      >
        Start Round {item.recommendedRoundNumber}
      </button>
    </div>
  );
}

// ── Fallback data for mock/demo mode ────────────────────────

const MOCK_ELIGIBLE: RestackEligible[] = [
  {
    businessId: 'biz_001', businessName: 'Blue Ridge Consulting', eligible: true,
    reasons: ['Readiness score 88 meets threshold', '120 days since last application'],
    readinessScore: 88, daysSinceLastApp: 120, currentUtilization: 0.22,
    activeApplicationCount: 0, recommendedRoundNumber: 3,
  },
  {
    businessId: 'biz_002', businessName: 'Summit Capital Group', eligible: true,
    reasons: ['Readiness score 82 meets threshold', '95 days since last application'],
    readinessScore: 82, daysSinceLastApp: 95, currentUtilization: 0.35,
    activeApplicationCount: 1, recommendedRoundNumber: 2,
  },
  {
    businessId: 'biz_003', businessName: 'Apex Ventures LLC', eligible: true,
    reasons: ['Readiness score 76 meets threshold', '110 days since last application'],
    readinessScore: 76, daysSinceLastApp: 110, currentUtilization: 0.28,
    activeApplicationCount: 0, recommendedRoundNumber: 4,
  },
  {
    businessId: 'biz_004', businessName: 'Westbrook Partners', eligible: true,
    reasons: ['Readiness score 61 meets threshold', '150 days since last application'],
    readinessScore: 61, daysSinceLastApp: 150, currentUtilization: 0.30,
    activeApplicationCount: 0, recommendedRoundNumber: 2,
  },
];

// ── Main component ──────────────────────────────────────────

interface RestackWidgetProps {
  onStartRound?: (payload: RestackStartRoundPayload) => void;
}

export function RestackWidget({ onStartRound }: RestackWidgetProps = {}) {
  const { data, isLoading, error, refetch } = useAuthFetch<RestackResponse>(
    '/api/restack/eligible',
  );

  // Use API data if available, fallback to mocks for demo
  const eligible = data?.eligible ?? MOCK_ELIGIBLE;
  const total = data?.total ?? eligible.length;
  const sorted = [...eligible].sort((a, b) => b.readinessScore - a.readinessScore);
  const displayItems = sorted.slice(0, 5);

  const headerAction = (
    <span className="text-sm font-semibold text-[#C9A84C]">
      {total} eligible
    </span>
  );

  return (
    <SectionCard
      title="Re-Stack Eligible"
      subtitle="Clients ready for another funding round"
      action={headerAction}
    >
      {isLoading && <LoadingSkeleton />}

      {error && !isLoading && (
        <DashboardErrorState error={error} onRetry={refetch} />
      )}

      {!isLoading && !error && displayItems.length === 0 && (
        <p className="text-sm text-gray-500 py-6 text-center">
          No clients currently meet restack criteria.
        </p>
      )}

      {!isLoading && !error && displayItems.length > 0 && (
        <div>
          {displayItems.map((item) => (
            <EligibleRow key={item.businessId} item={item} onStartRound={onStartRound} />
          ))}

          {total > 5 && (
            <div className="pt-3 text-center">
              <a
                href="/clients?filter=restack-eligible"
                className="text-xs font-semibold text-[#C9A84C] hover:text-[#C9A84C]/80 transition-colors"
              >
                View All {total} Eligible Clients
              </a>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
