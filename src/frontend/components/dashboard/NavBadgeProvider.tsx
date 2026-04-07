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

async function fetchCount(url: string, token: string | null): Promise<number> {
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return 0;
    const json = await res.json();
    // Support both { data: { total_count } } and { data: [...] } shapes
    if (json?.data?.total_count !== undefined) return json.data.total_count;
    if (Array.isArray(json?.data)) return json.data.length;
    return 0;
  } catch {
    return 0;
  }
}

// ── Provider ────────────────────────────────────────────────────────────────

export function NavBadgeProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<NavBadgeCounts>(DEFAULT_COUNTS);

  const refresh = useCallback(async () => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('cf_access_token')
        : null;

    // Prefer the consolidated nav-counts endpoint; fall back to individual calls
    try {
      const res = await fetch('/api/v1/dashboard/nav-counts', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setCounts({
            dashboardBadge: json.data.action_queue ?? 0,
            applicationsBadge: json.data.applications ?? 0,
            fundingRoundsBadge: json.data.funding_rounds ?? 0,
            complianceBadge: json.data.compliance ?? 0,
            complaintsBadge: json.data.complaints ?? 0,
          });
          return;
        }
      }
    } catch {
      // Fall through to individual endpoint fetches
    }

    // Fallback: fetch from individual endpoints
    const [dashboardBadge, applicationsBadge, fundingRoundsBadge] =
      await Promise.all([
        fetchCount('/api/v1/dashboard/action-queue', token),
        fetchCount('/api/v1/dashboard/committee-queue', token),
        fetchCount('/api/v1/dashboard/active-rounds', token),
      ]);

    setCounts({
      dashboardBadge,
      applicationsBadge,
      fundingRoundsBadge,
      complianceBadge: 0,
      complaintsBadge: 0,
    });
  }, []);

  useEffect(() => {
    // Initial fetch
    refresh();

    // Auto-refresh every 60s
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

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
