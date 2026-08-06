'use client';

// ============================================================
// CapitalForge — access token renewal
//
// Lives in its own module because everything that talks to the API needs it:
// the `useAuthFetch` hook, the imperative `loadJson` helpers, and `apiClient`
// itself. Keeping it inside the hook meant `api-client` could not use it
// without importing the hook that imports `api-client`.
//
// Access tokens last fifteen minutes. Refresh tokens last seven days. Every
// bug this module has had came from those two facts being handled in one
// place and forgotten in another.
// ============================================================

// Keys and accessors live in session-storage — one definition for the app.
// These were local copies that happened to agree with the others, which is
// not the same as being one fact.
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearSession,
} from './session-storage';


/** The single refresh in flight, if any. See `attemptTokenRefresh`. */
let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Exchange the stored refresh token for a fresh access token.
 *
 * This must match `POST /api/auth/refresh` exactly, and for a while it did not:
 * it sent `{ refresh_token }` where the route's schema requires `{ refreshToken }`,
 * and then read `access_token` off the top level of a response that returns
 * `{ success, data: { accessToken, refreshToken } }`. Three mismatches in one
 * function, none of which could fail loudly — a rejected refresh is
 * indistinguishable from an expired session, so the whole app simply locked
 * fifteen minutes after sign-in and told the user to sign in again while
 * holding a refresh token that was still valid for seven days.
 *
 * The server issues a new refresh token on every call, so the new one is
 * stored too.
 */
export function attemptTokenRefresh(): Promise<boolean> {
  // A dashboard mounts ~16 widgets that fetch independently, so an expired
  // access token produces ~16 simultaneous 401s and, without this, ~16
  // simultaneous refreshes of the same token. Rotating one token sixteen
  // times in parallel is wasteful now and unsafe later: the route already
  // returns the retired `oldJti` for a blocklist that is currently a TODO,
  // and the day that lands, the first refresh to return would invalidate the
  // token the other fifteen are still holding. One refresh in flight at a
  // time; every other caller waits on the same promise.
  inFlightRefresh ??= runTokenRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function runTokenRefresh(): Promise<boolean> {
  try {
    const refreshToken =
      getRefreshToken();

    if (!refreshToken) return false;

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      // A 401 means the refresh token itself was rejected — expired, or
      // revoked once revocation exists. Nothing will revive this session, so
      // drop the dead credentials rather than sending them on every later
      // request. Any other status (a 400, a 500, a proxy hiccup) says nothing
      // about the token, so it is left alone.
      if (response.status === 401 && typeof window !== 'undefined') {
        clearSession();
      }
      return false;
    }

    const json = (await response.json().catch(() => null)) as
      | { success?: boolean; data?: { accessToken?: string; refreshToken?: string } }
      | null;

    const accessToken = json?.data?.accessToken;
    if (!accessToken) return false;

    setAccessToken(accessToken);
    if (json?.data?.refreshToken) {
      setRefreshToken(json.data.refreshToken);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * True when there is no access token but a refresh token to trade for one.
 *
 * This is the state that produces `AUTH_TOKEN_MISSING` — the request goes out
 * with no `Authorization` header at all and the server rejects it as
 * unauthenticated rather than as expired. It is worth spending a refresh on
 * before the first attempt rather than after the failure, because some of
 * these calls are submits: by the time the error comes back the user has
 * already filled in five steps of a form.
 */
export function canRecoverSession(): boolean {
  if (typeof window === 'undefined') return false;
  return getAccessToken() === null && getRefreshToken() !== null;
}
