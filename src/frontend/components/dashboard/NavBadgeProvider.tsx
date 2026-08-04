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

interface NavBadgeCounts {
  dashboardBadge: number;
  applicationsBadge: number;
  fundingRoundsBadge: number;
  complianceBadge: number;
  complaintsBadge: number;
}

interface NavBadgeContextValue extends NavBadgeCounts {
  refresh: () => void;
}

const DEFAULT_COUNTS: NavBadgeCounts = {
  dashboardBadge: 0,
  applicationsBadge: 0,
  fundingRoundsBadge: 0,
  complianceBadge: 0,
  complaintsBadge: 0,
};

// ── Context ─────────────────────────────────────────────────────────────────

const NavBadgeContext = createContext<NavBadgeContextValue>({
  ...DEFAULT_COUNTS,
  refresh: () => {},
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 60_000;

// Logged, not fixed: an unreadable count becomes 0, and a badge showing no
// number reads as "nothing waiting" rather than "not known". Distinguishing
// them needs an unknown state the badge can render, which is a redesign.
async function fetchCount(url: string): Promise<number> {
  try {
    const data = await loadJson<unknown>(url);
    // Support both { data: { total_count } } and { data: [...] } shapes
    const record = data as { total_count?: unknown } | null;
    if (typeof record?.total_count === 'number') return record.total_count;
    if (Array.isArray(data)) return data.length;
    return 0;
  } catch {
    return 0;
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
        setCounts({
          dashboardBadge: data['action_queue'] ?? 0,
          applicationsBadge: data['applications'] ?? 0,
          fundingRoundsBadge: data['funding_rounds'] ?? 0,
          complianceBadge: data['compliance'] ?? 0,
          complaintsBadge: data['complaints'] ?? 0,
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
      complianceBadge: 0,
      complaintsBadge: 0,
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
