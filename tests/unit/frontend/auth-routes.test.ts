// ============================================================
// isPublicRoute — where the shell must not ask the API anything
//
// The Sidebar, Header and NavBadgeProvider sit in the root layout, so they
// mount on the sign-in page as readily as on the dashboard. Their badge polls
// went out either way: five requests before the visitor had typed a password,
// repeating every sixty seconds, every one of them a 401. (Four of the five
// came from a single rejection — the nav-badge provider reads a failed
// consolidated call as a reason to try three individual endpoints.)
//
// These pin which paths that gate closes on, including the prefix cases where
// a careless `startsWith` would close it on the wrong ones.
// ============================================================

import { describe, it, expect } from 'vitest';
import { isPublicRoute, PUBLIC_ROUTES } from '../../../src/frontend/lib/auth-routes';

describe('isPublicRoute — routes served without a session', () => {
  it('closes the gate on the sign-in page', () => {
    expect(isPublicRoute('/login')).toBe(true);
  });

  it('closes the gate on the two-factor challenge', () => {
    // Reached holding a token the API has not yet accepted as complete.
    expect(isPublicRoute('/login/two-factor')).toBe(true);
  });

  it('covers every route it declares', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(isPublicRoute(route)).toBe(true);
    }
  });

  it('ignores a trailing slash', () => {
    expect(isPublicRoute('/login/')).toBe(true);
  });
});

describe('isPublicRoute — routes that expect a session', () => {
  it('opens the gate on the dashboard', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
  });

  it('opens the gate on a nested authenticated route', () => {
    expect(isPublicRoute('/clients/8f2a/documents')).toBe(false);
  });

  it('opens the gate at the root', () => {
    expect(isPublicRoute('/')).toBe(false);
  });
});

describe('isPublicRoute — paths that merely start with a public one', () => {
  it('does not treat /registered-agents as /register', () => {
    // A bare startsWith would, and would silently stop that page's badges.
    expect(isPublicRoute('/registered-agents')).toBe(false);
  });

  it('does not treat /login-history as /login', () => {
    expect(isPublicRoute('/login-history')).toBe(false);
  });
});

describe('isPublicRoute — no path', () => {
  it('treats a missing pathname as authenticated rather than public', () => {
    // usePathname can be null before the router settles. Guessing "public"
    // there would suppress the first legitimate poll after a hard reload.
    expect(isPublicRoute(null)).toBe(false);
    expect(isPublicRoute(undefined)).toBe(false);
    expect(isPublicRoute('')).toBe(false);
  });
});
