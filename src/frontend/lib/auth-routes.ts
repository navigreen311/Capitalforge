// ============================================================
// CapitalForge — which routes are reachable without a session
//
// The app shell (Sidebar, Header, NavBadgeProvider) lives in the root layout,
// so it mounts on every route including the sign-in page. Its badge and
// notification fetches went out regardless, which meant a visitor who had not
// yet typed a password produced a burst of 401s — and, because the nav-badge
// provider treats a failed consolidated call as a reason to try three
// individual endpoints, one rejected request became four. On a 60-second
// timer, for as long as the login page stayed open.
//
// A request that cannot succeed should not be sent. This module names the
// routes where that is true by construction.
// ============================================================

/**
 * Routes served without a session.
 *
 * `/login/two-factor` is here for the same reason as `/login`: the challenge
 * is completed while holding an access token the API has not yet accepted as
 * fully authenticated, so shell traffic is still noise at that point.
 *
 * The last three do not exist as pages yet — the sign-in form links to them —
 * but they are unauthenticated by definition whenever they arrive.
 */
export const PUBLIC_ROUTES = [
  '/login',
  '/login/two-factor',
  '/register',
  '/forgot-password',
  '/reset-password',
] as const;

/**
 * True when `pathname` is served without a session.
 *
 * Matches a route and anything nested beneath it, so `/login/two-factor`
 * resolves without needing its own entry, but does not match a route that
 * merely shares a prefix: `/registered-agents` is not `/register`.
 */
export function isPublicRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  // Ignore a trailing slash so '/login/' and '/login' agree.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  return PUBLIC_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}
