'use client';

// ============================================================
// StateDisclosureDeadlines — Collapsible dashboard section
//
// Shows upcoming state disclosure filing deadlines. Collapsed
// when all deadlines are filed (green); auto-expanded when
// amber/red items need attention.
// ============================================================

import { useEffect, useRef, useState } from 'react';

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

interface ApiResponse {
  success: boolean;
  data?: ComplianceDeadlinesData;
  error?: { code: string; message: string };
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

// ── Component ────────────────────────────────────────────────

export function StateDisclosureDeadlines() {
  const [data, setData] = useState<ComplianceDeadlinesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDeadlines() {
      try {
        const res = await fetch('/api/v1/dashboard/compliance-deadlines');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        if (!cancelled) {
          if (json.success && json.data) {
            setData(json.data);
            // Auto-expand if there are non-filed deadlines
            const hasActionable = json.data.deadlines.some(
              (d) => d.status !== 'filed',
            );
            setExpanded(hasActionable);
          } else {
            setError(json.error?.message ?? 'Failed to load deadlines');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDeadlines();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Loading skeleton ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 w-56 rounded bg-gray-200" />
            <div className="h-5 w-8 rounded-full bg-gray-200" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-5/6 rounded bg-gray-100" />
            <div className="h-4 w-4/6 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error / no data ──────────────────────────────────────────

  if (error || !data) return null;

  const dueCount = data.due_within_7_days;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors rounded-xl"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">
            State Disclosure Deadlines
          </h3>
          {dueCount > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 min-w-[1.25rem]">
              {dueCount}
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
        <div className="border-t border-gray-100 px-4 pb-4 pt-2">
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
                    <span className="bg-brand-navy/10 text-brand-navy text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
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
                        dl.days_remaining <= 7 ? 'text-red-600' : 'text-gray-500'
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
                        href={`/compliance/disclosures/new?state=${dl.state}&client=${dl.client_id}`}
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
