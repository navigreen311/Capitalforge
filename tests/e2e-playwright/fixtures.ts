// ============================================================
// Shared fixtures for the browser suite.
//
// Most pages are only meaningful signed in. The onboarding and application
// specs used to navigate straight to their pages with no session; the app
// shell rendered, the data never loaded, and every assertion about page
// content failed for a reason that looked like a broken page.
//
// `signedInPage` seeds the access token before the first navigation, which is
// what the app reads on mount. It logs in through the API rather than driving
// the login form, so a change to that form breaks the login spec — which
// tests it — and not every other spec.
// ============================================================

import { test as base, type Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api';

/** Seeded development credentials, created by prisma/seed.ts. */
const EMAIL = 'admin@demoadvisors.io';
const PASSWORD = 'DemoPass123!';

let cachedToken: string | null = null;
let cachedUser: Record<string, unknown> | null = null;

/**
 * How long a cached token is trusted before signing in again.
 *
 * The token was cached for the lifetime of the worker. Access tokens expire —
 * 15 minutes in CI — and the browser suite runs for about nineteen there, so
 * every test past the fifteen-minute mark authenticated with a dead token,
 * got a 401, and failed on whatever it did with the empty body. A different
 * test each run, always around the same point, and never locally because the
 * suite finishes here in under nine minutes.
 *
 * Well inside the shortest expiry the app is configured with anywhere, so the
 * suite does not depend on a long-lived token to pass.
 */
const TOKEN_TTL_MS = 8 * 60 * 1000;

let cachedAt = 0;

async function accessToken(): Promise<string> {
  if (cachedToken !== null && Date.now() - cachedAt < TOKEN_TTL_MS) return cachedToken;

  const tenantRes = await fetch(`${API}/tenants/by-slug/demo-advisors`);
  if (!tenantRes.ok) {
    throw new Error(
      `Could not resolve the demo tenant (HTTP ${tenantRes.status}). Is the API running, and seeded?`,
    );
  }
  const tenant = (await tenantRes.json()) as { data?: { id?: string } };
  const tenantId = tenant.data?.id;
  if (!tenantId) throw new Error('The demo tenant has no id; run `npm run db:seed`.');

  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, tenantId }),
  });
  const login = (await loginRes.json()) as {
    data?: { accessToken?: string; user?: Record<string, unknown> };
  };
  const token = login.data?.accessToken;
  cachedUser = login.data?.user ?? null;

  if (!loginRes.ok || !token) {
    throw new Error(
      `Sign-in failed for ${EMAIL} (HTTP ${loginRes.status}). ` +
        'The seeded admin user is missing — run `npm run db:seed`.',
    );
  }

  cachedToken = token;
  cachedAt = Date.now();
  return token;
}


/**
 * Parse a response, or fail saying what the server actually said.
 *
 * Specs read API responses with `.then((r) => r.json())` and then index into
 * the body. When a request fails, `data` is undefined and the test dies on
 * `Cannot read properties of undefined`, naming a property rather than a
 * status — so the failure describes the shape of an error body instead of the
 * error.
 *
 * That cost two nineteen-minute CI cycles: every test past the token's
 * fifteen-minute expiry was getting a 401, and each run blamed whichever spec
 * happened to be running when it hit. A status in the message would have
 * pointed at the cause on the first run.
 *
 * Used as `.then(expectOk)` in place of `.then((r) => r.json())`. Tests that
 * assert a 404 or a 501 deliberately keep checking `res.status` themselves;
 * this is only for the reads that assume success.
 */
export async function expectOk(res: Response): Promise<unknown> {
  if (res.ok) return res.json();

  // The body usually carries the API's own error code and message. Truncated,
  // because an HTML error page would otherwise bury the status.
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    detail = '(body unreadable)';
  }

  throw new Error(
    `${res.status} ${res.statusText} from ${res.url}
` +
      `  ${detail}
` +
      '  This request was expected to succeed. Check the status before the body.',
  );
}

export const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, use) => {
    const token = await accessToken();
    // addInitScript runs before any page script, so these are present on the
    // first render rather than arriving after the initial fetches.
    //
    // cf_user as well as the token: the login page stores both, and a page
    // that needs the signed-in user's id — to attribute an action to them —
    // sees a half-signed-in session without it. A fixture that signs in
    // differently from the real thing tests a state no user is ever in.
    await page.addInitScript(
      (value) => {
        const { token: t, user } = value as { token: string; user: unknown };
        localStorage.setItem('cf_access_token', t);
        if (user !== null) localStorage.setItem('cf_user', JSON.stringify(user));
      },
      { token, user: cachedUser },
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
