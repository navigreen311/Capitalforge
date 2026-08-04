'use client';

// ============================================================
// CapitalForge — Nav Badge Provider
//
// React context that fetches badge counts for navigation items.
// Auto-refreshes every 60 seconds.
// ============================================================

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useSessionGate } from '@/hooks/useSessionGate';
import { loadJson } from '@/lib/load-json';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * A badge count, or null when it could not be read.
 *
 * These were plain numbers, and an unreadable count became 0 — which the
 * sidebar renders as no badge at all, i.e. "nothing waiting". A queue of
 * eleven things and a queue nobody could reach looked identical, and the one
 * that needs attention was the one that showed nothing.
 *
 * Null is not a number the caller can quietly add to something else, which is
 * the point: every consumer has to decide what it shows when it does not know.
 */
export type BadgeCount = number | null;

interface NavBadgeCounts {
  dashboardBadge: BadgeCount;
  applicationsBadge: BadgeCount;
  fundingRoundsBadge: BadgeCount;
  complianceBadge: BadgeCount;
  complaintsBadge: BadgeCount;
}

interface NavBadgeContextValue extends NavBadgeCounts {
  refresh: () => void;
}

/**
 * Before anything has been fetched, nothing is known — not zero.
 *
 * The provider renders these while the first request is in flight and
 * whenever there is no session, so a zero here would flash "all clear" on
 * every page load before the real counts arrived.
 */
const DEFAULT_COUNTS: NavBadgeCounts = {
  dashboardBadge: null,
  applicationsBadge: null,
  fundingRoundsBadge: null,
  complianceBadge: null,
  complaintsBadge: null,
};

// ── Context ─────────────────────────────────────────────────────────────────

const NavBadgeContext = createContext<NavBadgeContextValue>({
  ...DEFAULT_COUNTS,
  refresh: () => {},
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 60_000;

/** The count at this endpoint, or null when it could not be read. */
async function fetchCount(url: string): Promise<BadgeCount> {
  try {
    const data = await loadJson<unknown>(url);
    // Support both { data: { total_count } } and { data: [...] } shapes
    const record = data as { total_count?: unknown } | null;
    if (typeof record?.total_count === 'number') return record.total_count;
    if (Array.isArray(data)) return data.length;
    // A 200 whose body has neither shape is not a count of zero.
    return null;
  } catch {
    return null;
  }
}

// ── Provider ────────────────────────────────────────────────────────────────

export function NavBadgeProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<NavBadgeCounts>(DEFAULT_COUNTS);

  // Badges are chrome around whatever page is open, including the sign-in
  // page. Without this the provider polled four endpoints a minute at a
  // visitor who had not signed in yet, and every one of them was a 401.
  const shouldFetch = useSessionGate();

  const refresh = useCallback(async () => {
    if (!shouldFetch) return;

    // Prefer the consolidated nav-counts endpoint; fall back to individual calls
    try {
      const data = await loadJson<Record<string, number> | null>(
        '/api/v1/dashboard/nav-counts',
      );
      if (data) {
        // ?? null, not ?? 0: a key the consolidated endpoint omits is one it
        // has not told us about, which is not the same as a count of none.
        setCounts({
          dashboardBadge: data['action_queue'] ?? null,
          applicationsBadge: data['applications'] ?? null,
          fundingRoundsBadge: data['funding_rounds'] ?? null,
          complianceBadge: data['compliance'] ?? null,
          complaintsBadge: data['complaints'] ?? null,
        });
        return;
      }
    } catch {
      // Fall through to individual endpoint fetches
    }

    // Fallback: fetch from individual endpoints
    const [dashboardBadge, applicationsBadge, fundingRoundsBadge] =
      await Promise.all([
        fetchCount('/api/v1/dashboard/action-queue'),
        fetchCount('/api/v1/dashboard/committee-queue'),
        fetchCount('/api/v1/dashboard/active-rounds'),
      ]);

    setCounts({
      dashboardBadge,
      applicationsBadge,
      fundingRoundsBadge,
      // The fallback path has no endpoint for these two, so they stay unknown
      // rather than reporting a zero nothing measured.
      complianceBadge: null,
      complaintsBadge: null,
    });
  }, [shouldFetch]);

  useEffect(() => {
    // No session, or a route that does not expect one: render the badges at
    // their defaults and send nothing. Signing in changes the route, which
    // reopens the gate and starts the poll.
    if (!shouldFetch) {
      setCounts(DEFAULT_COUNTS);
      return;
    }

    // Initial fetch
    refresh();

    // Auto-refresh every 60s
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, shouldFetch]);

  return (
    <NavBadgeContext.Provider value={{ ...counts, refresh }}>
      {children}
    </NavBadgeContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useNavBadges(): NavBadgeContextValue {
  return useContext(NavBadgeContext);
}
