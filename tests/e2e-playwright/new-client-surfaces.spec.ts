// ============================================================
// A brand-new client's own page reports nothing as an error
//
// Walking the journey by hand — onboard a client, then open them — showed
// "Something went wrong: No ACH authorization on file for this client" with a
// Retry button, under a heading reading ACH Authorization. Nothing was wrong.
// A client who has not given an ACH authorization is every client on the day
// they are onboarded.
//
// The card already had the right empty state written. It was unreachable: the
// endpoint's 404 landed in the `if (error)` branch above it. AchDebitTab,
// which renders the same record on the ACH tab, had always ordered those two
// checks the other way round.
//
// The whole suite passed throughout, because every test ran against seeded
// clients that already had an authorization on file. Nothing had ever opened
// a client created a moment earlier — which is the first thing a real advisor
// does.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

/**
 * A client with nothing recorded against it. Created per test rather than
 * seeded, because the point is the state a client is in before anything has
 * happened to them — which a seeded client is never in.
 */
async function onboardClient(token: string | null): Promise<string> {
  const res = await fetch(`${API}/businesses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legalName: `Onboarding Check ${String(Date.now()).slice(-8)}`,
      entityType: 'llc',
      industry: 'Professional Services',
      state: 'DE',
      annualRevenue: 850000,
    }),
  });

  const body = (await expectOk(res)) as { data: { business: { id: string } } };
  return body.data.business.id;
}

test.describe('A newly onboarded client', () => {
  test('shows no error panel on their own page', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clientId = await onboardClient(token);

    await page.goto(`/clients/${clientId}`, { waitUntil: 'load' });
    await page.waitForTimeout(4000);

    // Their name, so we know the right page loaded and not a shell.
    await expect(page.getByRole('heading', { name: /Onboarding Check/ })).toBeVisible();

    await expect(
      page.getByText('Something went wrong'),
      'nothing about a client with no history yet is an error',
    ).toHaveCount(0);
  });

  test('says ACH authorization is not on file, rather than failing to load it', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clientId = await onboardClient(token);

    await page.goto(`/clients/${clientId}`, { waitUntil: 'load' });

    await expect(page.getByText('ACH Authorization', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('None on file', { exact: true })).toBeVisible();
    await expect(
      page.getByText('No ACH authorization has been taken from this client.'),
    ).toBeVisible();

    // No Retry anywhere on the page, because there is nothing to retry — the
    // request succeeded in reporting that the client has no authorization.
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  });

  test('says suitability is not assessed, rather than assuming a score', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clientId = await onboardClient(token);

    await page.goto(`/clients/${clientId}`, { waitUntil: 'load' });

    // This panel used to show a fixed score of 72 and "suitable for moderate
    // stacking" for every client, assessed or not.
    await expect(page.getByText('Not assessed', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('72')).toHaveCount(0);
  });

  test('the endpoints behind those panels answer, they do not fail', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clientId = await onboardClient(token);

    // Both answer 404 for "no record yet". That is the contract the cards are
    // written against, and if it changes to 200-with-null they must follow.
    for (const url of [
      `${API}/v1/clients/${clientId}/ach-authorization`,
      `${API}/businesses/${clientId}/suitability/latest`,
    ]) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status, `${url} should report absence, not fail`).toBe(404);

      const body = (await res.json()) as { error: { message: string } };
      // The message is shown to a user in some surfaces, so it has to read as
      // a statement of fact rather than as a fault.
      expect(body.error.message.toLowerCase()).toMatch(/no .* (on file|found)/);
    }
  });
});
