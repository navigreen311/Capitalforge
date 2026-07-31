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

async function accessToken(): Promise<string> {
  if (cachedToken !== null) return cachedToken;

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
  const login = (await loginRes.json()) as { data?: { accessToken?: string } };
  const token = login.data?.accessToken;

  if (!loginRes.ok || !token) {
    throw new Error(
      `Sign-in failed for ${EMAIL} (HTTP ${loginRes.status}). ` +
        'The seeded admin user is missing — run `npm run db:seed`.',
    );
  }

  cachedToken = token;
  return token;
}

export const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, use) => {
    const token = await accessToken();
    // addInitScript runs before any page script, so the token is present on
    // the first render rather than arriving after the initial fetches.
    await page.addInitScript((value) => {
      localStorage.setItem('cf_access_token', value as string);
    }, token);
    await use(page);
  },
});

export { expect } from '@playwright/test';
