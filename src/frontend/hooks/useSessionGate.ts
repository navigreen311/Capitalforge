'use client';

// ============================================================
// CapitalForge — the shell's "is it worth asking?" gate
//
// Shared by the layout-level components that poll the API on their own timers
// (nav badges, the notification bell). They render on every route, including
// the ones you reach without a session, and they used to fetch on every one
// of them.
//
// This does not decide whether a request will be *authorised* — the server
// does that. It answers the cheaper question the client can settle for
// itself: is there any point sending this at all.
// ============================================================

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isPublicRoute } from '@/lib/auth-routes';

/**
 * True when shell components should fetch: the current route expects a
 * session, and a token exists to send with the request.
 *
 * The token is read through state rather than straight from `localStorage`
 * because the first render happens on the server, where there is no such
 * thing. Reading it during render would make the server and client disagree
 * about the first paint; reading it in an effect means the gate opens on the
 * commit after mount, which is early enough — these are background badge
 * polls, not the page's own data.
 *
 * Sign-in navigates from `/login` to `/dashboard`, which changes `pathname`
 * and re-runs the effect, so the gate opens on its own once credentials
 * exist. Callers must list the returned value in their effect dependencies.
 */
export function useSessionGate(): boolean {
  const pathname = usePathname();
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(
      typeof window !== 'undefined' &&
        !!window.localStorage.getItem('cf_access_token'),
    );
  }, [pathname]);

  return hasToken && !isPublicRoute(pathname);
}
