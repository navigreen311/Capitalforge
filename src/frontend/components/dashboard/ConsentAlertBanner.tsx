'use client';

// ============================================================
// ConsentAlertBanner — Dashboard consent & acknowledgment alert
//
// Shows a slim green banner when all clients are compliant,
// or an amber/red alert bar when issues need attention.
// Dismissible per session via sessionStorage; reappears on
// next session if issues remain outstanding.
// Uses useAuthFetch for data fetching and DashboardErrorState
// for error display.
// ============================================================

import { useEffect, useState } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { apiClient } from '@/lib/api-client';
import { DashboardErrorState } from './DashboardErrorState';

interface ConsentIssueItem {
  client_id: string;
  client_name: string;
  issue_type: 'missing_acknowledgment' | 'expired_consent' | 'blocked_application';
  details: string;
}

interface ConsentStatusData {
  missing_acknowledgments: number;
  expired_consents: number;
  blocked_applications: number;
  all_clear: boolean;
  items: ConsentIssueItem[];
  last_updated: string;
}

const DISMISS_KEY = 'cf_consent_banner_dismissed';

export function ConsentAlertBanner() {
  const { data, isLoading, error, refetch } = useAuthFetch<ConsentStatusData>(
    '/api/v1/dashboard/consent-status',
  );

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(DISMISS_KEY) === 'true';
  });

  async function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, 'true');

    const outstandingCount =
      (data?.missing_acknowledgments ?? 0) +
      (data?.expired_consents ?? 0) +
      (data?.blocked_applications ?? 0);

    try {
      await apiClient.post('/v1/events', {
        event_type: 'consent_alert.dismissed',
        payload: {
          advisor_id: 'current', // resolved server-side from JWT
          timestamp: new Date().toISOString(),
          outstanding_count: outstandingCount,
        },
      });
    } catch {
      // fire-and-forget; dismissal still takes effect locally
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 h-10">
        <div className="h-4 w-64 rounded bg-gray-200" />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────

  if (error) {
    return <DashboardErrorState error={error} onRetry={refetch} />;
  }

  // ── No data ─────────────────────────────────────────────────

  if (!data) return null;

  // ── Dismissed ────────────────────────────────────────────────

  if (dismissed) return null;

  // ── All clear ────────────────────────────────────────────────

  if (data.all_clear) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-2 flex items-center gap-2 h-10">
        <svg
          className="h-4 w-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium">All consents and acknowledgments current &#x2713;</span>
      </div>
    );
  }

  // ── Issues detected ──────────────────────────────────────────

  const totalIssues =
    data.missing_acknowledgments +
    data.expired_consents +
    data.blocked_applications;

  const isHighSeverity = data.blocked_applications > 0;
  const bgClass = isHighSeverity
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-amber-50 border-amber-200 text-amber-800';
  const buttonClass = isHighSeverity
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-amber-600 hover:bg-amber-700 text-white';

  const segments: string[] = [];
  if (data.missing_acknowledgments > 0) {
    segments.push(`${data.missing_acknowledgments} missing acknowledgment${data.missing_acknowledgments !== 1 ? 's' : ''}`);
  }
  if (data.expired_consents > 0) {
    segments.push(`${data.expired_consents} expired/revoked consent${data.expired_consents !== 1 ? 's' : ''}`);
  }
  if (data.blocked_applications > 0) {
    segments.push(`${data.blocked_applications} blocked application${data.blocked_applications !== 1 ? 's' : ''}`);
  }

  return (
    <div className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-4 ${bgClass}`}>
      <div className="flex items-center gap-2 min-w-0">
        <svg
          className="h-5 w-5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span className="text-sm font-medium truncate">
          {totalIssues} consent issue{totalIssues !== 1 ? 's' : ''} require attention: {segments.join(', ')}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <a
          href="/compliance"
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${buttonClass}`}
        >
          Review Consent Queue
        </a>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-md hover:bg-black/10 transition-colors"
          aria-label="Dismiss alert"
          type="button"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
