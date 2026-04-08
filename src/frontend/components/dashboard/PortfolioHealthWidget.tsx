'use client';

// ============================================================
// PortfolioHealthWidget — Composite health score (0-100) with
// letter grade badge, 6-component breakdown bars, trend
// indicator, and prioritized action items.
// ============================================================

import Link from 'next/link';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { SectionCard } from '@/components/ui/card';

// ── Types ───────────────────────────────────────────────────────────────────

interface HealthComponent {
  name: string;
  key: string;
  score: number;
  maxPoints: number;
  percentage: number;
  detail: string;
}

interface ActionItem {
  priority: number;
  title: string;
  description: string;
  potentialGain: number;
}

interface PortfolioHealthData {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: HealthComponent[];
  trend: {
    direction: 'up' | 'down' | 'flat';
    delta: number;
    previousScore: number;
  };
  actionItems: ActionItem[];
  computedAt: string;
}

// ── Color helpers ───────────────────────────────────────────────────────────

function gradeColor(score: number): {
  text: string;
  bg: string;
  ring: string;
  bar: string;
} {
  if (score >= 90)
    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-50',
      ring: '#10B981',
      bar: 'bg-emerald-500',
    };
  if (score >= 80)
    return {
      text: 'text-teal-700',
      bg: 'bg-teal-50',
      ring: '#14B8A6',
      bar: 'bg-teal-500',
    };
  if (score >= 70)
    return {
      text: 'text-amber-700',
      bg: 'bg-amber-50',
      ring: '#F59E0B',
      bar: 'bg-amber-500',
    };
  return {
    text: 'text-red-700',
    bg: 'bg-red-50',
    ring: '#EF4444',
    bar: 'bg-red-500',
  };
}

function componentBarColor(percentage: number): string {
  if (percentage >= 90) return 'bg-emerald-500';
  if (percentage >= 75) return 'bg-teal-500';
  if (percentage >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function trendArrow(direction: 'up' | 'down' | 'flat'): string {
  switch (direction) {
    case 'up':
      return '\u2191';
    case 'down':
      return '\u2193';
    default:
      return '\u2192';
  }
}

function trendColor(direction: 'up' | 'down' | 'flat'): string {
  switch (direction) {
    case 'up':
      return 'text-emerald-600';
    case 'down':
      return 'text-red-600';
    default:
      return 'text-gray-500';
  }
}

// ── Score Ring (SVG) ────────────────────────────────────────────────────────

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const colors = gradeColor(score);

  return (
    <div className="flex flex-col items-center">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        aria-label={`Portfolio Health Score: ${score}, Grade: ${grade}`}
      >
        {/* Track */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="10"
        />
        {/* Fill */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={colors.ring}
          strokeWidth="10"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
        {/* Score number */}
        <text
          x="60"
          y="55"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: '28px', fontWeight: 700, fill: '#0F172A' }}
        >
          {score}
        </text>
        {/* Grade letter */}
        <text
          x="60"
          y="78"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: '14px', fontWeight: 600, fill: colors.ring }}
        >
          Grade {grade}
        </text>
      </svg>
    </div>
  );
}

// ── Component breakdown bar ─────────────────────────────────────────────────

function ComponentBar({ component }: { component: HealthComponent }) {
  const barColor = componentBarColor(component.percentage);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{component.name}</span>
        <span className="text-gray-500 text-xs tabular-nums">
          {component.score.toFixed(1)}/{component.maxPoints}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${component.percentage}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">{component.detail}</p>
    </div>
  );
}

// ── Skeleton loader ─────────────────────────────────────────────────────────

function HealthSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex justify-center">
        <div className="w-[120px] h-[120px] rounded-full bg-gray-200" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-2 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main widget ─────────────────────────────────────────────────────────────

export function PortfolioHealthWidget() {
  const { data, isLoading, error } = useAuthFetch<{
    success: boolean;
    data: PortfolioHealthData;
  }>('/api/portfolio/health');

  const health = data?.data;

  return (
    <SectionCard
      title="Portfolio Health"
      subtitle="Composite score across 6 dimensions"
    >
      {isLoading && <HealthSkeleton />}

      {error && !isLoading && (
        <DashboardErrorState
          error={error}
        />
      )}

      {health && !isLoading && (
        <div className="space-y-5">
          {/* Score ring + trend */}
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={health.score} grade={health.grade} />

            {/* Trend indicator */}
            <div className={`flex items-center gap-1 text-sm ${trendColor(health.trend.direction)}`}>
              <span className="text-lg font-semibold">
                {trendArrow(health.trend.direction)}
              </span>
              <span>
                {health.trend.delta > 0 ? '+' : ''}
                {health.trend.delta} pts vs last month
              </span>
            </div>
          </div>

          {/* Component breakdown */}
          <div className="space-y-3">
            {health.components.map((comp) => (
              <ComponentBar key={comp.key} component={comp} />
            ))}
          </div>

          {/* Action items */}
          {health.actionItems.length > 0 && (
            <div className="border-t border-surface-border pt-4 space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">
                Top Actions
              </h4>
              {health.actionItems.slice(0, 3).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-800">{item.title}</p>
                    <p className="text-xs text-gray-500">
                      {item.description}
                    </p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      +{item.potentialGain.toFixed(1)} pts potential
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* View full breakdown link */}
          <Link
            href="/portfolio"
            className="btn-outline btn btn-sm w-full justify-center"
          >
            View Full Breakdown
          </Link>
        </div>
      )}
    </SectionCard>
  );
}
