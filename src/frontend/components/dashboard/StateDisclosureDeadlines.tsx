'use client';

// ============================================================
// StateDisclosureDeadlines — Collapsible dashboard section
//
// Shows upcoming state disclosure filing deadlines. Collapsed
// when all deadlines are filed (green); auto-expanded when
// amber/red items need attention.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

// ── Types ────────────────────────────────────────────────────

type DeadlineStatus = 'filed' | 'pending' | 'overdue';

interface DeadlineItem {
  id: string;
  state: string;
  regulation_name: string;
  client_name: string;
  client_id: string;
  deadline_date: string;
  days_remaining: number;
  status: DeadlineStatus;
}

interface ComplianceDeadlinesData {
  all_clear: boolean;
  due_within_7_days: number;
  deadlines: DeadlineItem[];
  last_updated: string;
}

// ── Status chip styles ───────────────────────────────────────

const STATUS_STYLES: Record<DeadlineStatus, string> = {
  filed: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<DeadlineStatus, string> = {
  filed: 'Filed',
  pending: 'Pending',
  overdue: 'Overdue',
};

// ── Helpers ──────────────────────────────────────────────────

function formatDeadlineDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Determine the header badge color based on the most urgent deadline. */
function getBadgeStyle(deadlines: DeadlineItem[]): string | null {
  const hasUrgent = deadlines.some(
    (d) => d.status !== 'filed' && d.days_remaining <= 7,
  );
  if (hasUrgent) return 'bg-red-100 text-red-700';

  const hasWarning = deadlines.some(
    (d) => d.status !== 'filed' && d.days_remaining <= 30,
  );
  if (hasWarning) return 'bg-amber-100 text-amber-700';

  return null;
}

// ── Component ────────────────────────────────────────────────

export function StateDisclosureDeadlines() {
  const { data, isLoading, error, refetch } =
    useAuthFetch<ComplianceDeadlinesData>('/api/v1/dashboard/compliance-deadlines');

  const [expanded, setExpanded] = useState(false);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-expand when data first loads if there are actionable items
  useEffect(() => {
    if (data && !hasAutoExpanded) {
      const hasActionable = data.deadlines.some((d) => d.status !== 'filed');
      setExpanded(hasActionable);
      setHasAutoExpanded(true);
    }
  }, [data, hasAutoExpanded]);

  // Re-measure height when expanded state changes (for smooth animation)
  useEffect(() => {
    if (expanded && contentRef.current) {
      // Force a reflow so the browser picks up the new scrollHeight
      contentRef.current.style.maxHeight = `${contentRef.current.scrollHeight}px`;
    }
  }, [expanded, data]);

  // ── Loading skeleton ─────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="h-5 w-8 rounded-full bg-gray-200" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-5/6 rounded bg-gray-100" />
          <div className="h-4 w-4/6 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────

  if (error) {
    return <DashboardErrorState error={error} onRetry={refetch} />;
  }

  // ── No data ──────────────────────────────────────────────────

  if (!data) return null;

  const actionableCount = data.deadlines.filter(
    (d) => d.status !== 'filed',
  ).length;
  const badgeStyle = getBadgeStyle(data.deadlines);

  return (
    <div>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between py-2 text-left hover:opacity-80 transition-opacity"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">
            State Deadlines
          </h3>
          {actionableCount > 0 && badgeStyle && (
            <span
              className={`inline-flex items-center justify-center rounded-full text-xs font-bold px-2 py-0.5 min-w-[1.25rem] ${badgeStyle}`}
            >
              {actionableCount}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Collapsible content with smooth height transition */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: expanded
            ? `${contentRef.current?.scrollHeight ?? 2000}px`
            : '0px',
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="pt-2 pb-1">
          {/* All clear message */}
          {data.all_clear ? (
            <div className="flex items-center gap-2 py-2 text-emerald-600">
              <svg
                className="h-4 w-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium">
                All state disclosures current
              </span>
            </div>
          ) : (
            /* Deadline rows */
            <div className="space-y-2">
              {data.deadlines.map((dl) => (
                <div
                  key={dl.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm"
                >
                  {/* Left: state badge + regulation + client */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="bg-brand-navy/10 text-brand-navy text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 uppercase tracking-wide">
                      {dl.state}
                    </span>
                    <span className="font-medium text-gray-900 truncate">
                      {dl.regulation_name}
                    </span>
                    <span className="text-gray-400 hidden sm:inline">|</span>
                    <span className="text-gray-500 truncate hidden sm:inline">
                      {dl.client_name}
                    </span>
                  </div>

                  {/* Right: date, days, status, CTA */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-gray-500 text-xs hidden md:inline">
                      {formatDeadlineDate(dl.deadline_date)}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        dl.days_remaining <= 7
                          ? 'text-red-600'
                          : dl.days_remaining <= 30
                            ? 'text-amber-600'
                            : 'text-gray-500'
                      }`}
                    >
                      {dl.days_remaining}d
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[dl.status]}`}
                    >
                      {STATUS_LABELS[dl.status]}
                    </span>
                    {dl.status !== 'filed' && (
                      <a
                        href={`/compliance/disclosures/new?state=${dl.state}&client_id=${dl.client_id}`}
                        className="text-xs font-semibold text-brand-navy hover:underline flex-shrink-0"
                      >
                        File Disclosure
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
