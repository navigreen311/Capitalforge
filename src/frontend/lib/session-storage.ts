// ============================================================
// Session storage — one definition of every key, and one reader each
//
// The keys were literals repeated across nine files. Eight agreed; one did
// not. `DocumentsTab` defined its own `getAuthToken()` reading `cf_token` —
// a key nothing writes — so it returned `''` for its entire existence, and
// `''` is falsy, so the spread meant to add `Authorization` added nothing.
// Both of its fetches went out unauthenticated and neither checked its status,
// so nothing said so.
//
// That is the duplicated-fact defect, and it failed in the permissive
// direction: no error, no 401 surfaced to the user, just requests quietly
// missing their credentials.
//
// `cf_user` had the same shape from the other end — three components each
// parsing it themselves, with three different ideas of the payload and two
// different levels of validation.
//
// Everything reads these functions now. Adding a tenth caller should not
// require knowing a string.
//
// ── Why `globalThis` rather than naming `localStorage`
//
// The backend tsconfig compiles some of this directory (see `fetch-all-pages`)
// and has no DOM lib, so naming `localStorage` directly breaks
// `npm run build:backend`. Reaching it through `globalThis` keeps this module
// importable from both sides.
// ============================================================

const ACCESS_TOKEN_KEY = 'cf_access_token';
const REFRESH_TOKEN_KEY = 'cf_refresh_token';
const USER_KEY = 'cf_user';

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): WebStorageLike | null {
  return (globalThis as { localStorage?: WebStorageLike }).localStorage ?? null;
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    // Safari private browsing throws on access rather than returning null.
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* storage unavailable — the caller cannot do anything useful about it */
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* as above */
  }
}

// ── Tokens ───────────────────────────────────────────────────

/**
 * The access token, or null.
 *
 * **`localStorage` only.** `AskCapitalForge` used to fall back to
 * `sessionStorage`, which nothing writes — so a token placed there would have
 * authenticated the chat and nothing else in the application. "Is this user
 * signed in" must not depend on which component you ask, and the login page
 * writes `localStorage`, so that is the answer.
 */
export function getAccessToken(): string | null {
  return read(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  write(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  remove(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return read(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  write(REFRESH_TOKEN_KEY, token);
}

// ── The signed-in user ───────────────────────────────────────

/**
 * What the login response actually stores.
 *
 * Every field is optional because this is parsed from storage, not received
 * from a typed call: the string was written by a previous version of the app
 * as easily as by this one. A reader that needs `role` should check it rather
 * than assume it — `DealCommitteeQueue` cast the parsed JSON to a type and
 * read `role` straight off it, which worked only because `safeUser` happens to
 * include it while the login page's own annotation said `{ id, firstName }`.
 */
export interface StoredUser {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

/** The stored user, or null when absent or unparseable. */
export function getStoredUser(): StoredUser | null {
  const raw = read(USER_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as StoredUser;
  } catch {
    return null;
  }
}

/** The stored user's id, when it is a string. Null covers every other case. */
export function getStoredUserId(): string | null {
  const id = getStoredUser()?.id;
  return typeof id === 'string' && id !== '' ? id : null;
}

/** The stored user's role, when it is a string. */
export function getStoredUserRole(): string | null {
  const role = getStoredUser()?.role;
  return typeof role === 'string' && role !== '' ? role : null;
}

export function setStoredUser(user: StoredUser): void {
  write(USER_KEY, JSON.stringify(user));
}

/** Everything the session consists of, removed together. */
export function clearSession(): void {
  remove(ACCESS_TOKEN_KEY);
  remove(REFRESH_TOKEN_KEY);
  remove(USER_KEY);
}
