'use client';

// ============================================================
// ComplianceHealthPanel — dashboard right column
//
// This panel showed a green 84 in a ring, above four rows: State disclosures
// 42 Approved, TILA requirements 38 Approved, Pending reviews 6, Overdue items
// 2. Every one of those numbers was a literal in the dashboard page. They did
// not come from a request, they were identical for every tenant and every
// user, and they did not change when a compliance check ran or failed.
//
// The ring was the worst of it. 84 is a passing grade, coloured green by a
// threshold at 80, sitting on the landing page under the heading "Aggregate
// score across active clients" — a specific claim about the whole portfolio,
// made up. And it sat directly above the state disclosure section, which says
// truthfully that nothing is tracked.
//
// GET /api/compliance/overview computes a real score from the compliance
// checks on record, and returns null rather than 100 when no check has run.
// This panel now shows that, including the null.
// ============================================================

import Link from 'next/link';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

interface ComplianceOverview {
  score: number | null;
  total: number;
  passed: number;
  failed: number;
  critical: number;
}

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <svg width="96" height="96" viewBox="0 0 96 96" aria-label={`Compliance score: ${score}`}>
      <circle cx="48" cy="48" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference * 0.25}
        strokeLinecap="round"
      />
      <text
        x="48"
        y="53"
        textAnchor="middle"
        className="fill-gray-900"
        style={{ fontSize: '22px', fontWeight: 600 }}
      >
        {score}
      </text>
    </svg>
  );
}

/**
 * No score, because nothing has been checked.
 *
 * Deliberately not a ring. An empty ring is still a ring, and a reader
 * glancing at the panel would take it as a low score rather than as no score.
 */
function NoScore() {
  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-gray-300">
      <span className="text-2xl text-gray-300" aria-hidden="true">
        —
      </span>
    </div>
  );
}

function CountRow({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${tone}`}>{count}</span>
    </div>
  );
}

export function ComplianceHealthPanel() {
  const { data, isLoading, error, refetch } = useAuthFetch<ComplianceOverview>(
    '/api/compliance/overview',
  );

  if (isLoading) {
    return (
      <div className="flex animate-pulse flex-col items-center gap-4">
        <div className="h-24 w-24 rounded-full bg-gray-200" />
        <div className="h-3 w-full rounded bg-gray-100" />
        <div className="h-3 w-5/6 rounded bg-gray-100" />
      </div>
    );
  }

  if (error) return <DashboardErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="flex flex-col items-center gap-4">
      {data.score === null ? <NoScore /> : <ScoreRing score={data.score} />}

      {data.total === 0 ? (
        <p className="text-center text-xs leading-relaxed text-gray-600">
          No compliance check has been run for this tenant, so there is no score. A score here
          would be derived from never having looked.
        </p>
      ) : (
        <div className="w-full space-y-2">
          <CountRow label="Checks on record" count={data.total} tone="text-gray-900" />
          <CountRow label="Passed" count={data.passed} tone="text-emerald-700" />
          <CountRow label="Failed" count={data.failed} tone="text-red-700" />
          <CountRow label="Critical" count={data.critical} tone="text-red-700" />
        </div>
      )}

      <Link href="/compliance" className="btn-outline btn btn-sm w-full justify-center">
        Open Compliance Center
      </Link>
    </div>
  );
}
