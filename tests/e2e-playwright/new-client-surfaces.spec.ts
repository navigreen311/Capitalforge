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

/** A unique, digit-free suffix, so a fixture name cannot collide with an
 *  assertion about numbers rendered on the page. */
function uniqueSuffix(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function onboardClient(token: string | null): Promise<string> {
  const res = await fetch(`${API}/businesses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Letters, not digits.
      //
      // This was `String(Date.now()).slice(-8)`, and the suitability test below
      // asserts that "72" appears nowhere on the client's page — the score this
      // panel used to invent. `getByText('72')` is a substring match, so it
      // matched the client's own name whenever that timestamp fragment
      // contained 72, and the name renders twice.
      //
      // The leading digits of an 8-digit millisecond window only turn over
      // every ~2.8 hours, so this did not fail at random: it failed for hours
      // at a time and passed for the rest. Two runs five minutes apart both saw
      // 726... and 729..., after two earlier runs on the same code had passed.
      // A unique name is still needed; it just must not carry digits that
      // content assertions can collide with.
      legalName: `Onboarding Check ${uniqueSuffix()}`,
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
    //
    // Scoped to the Suitability card. Three things on this page report an absence,
    // and the unscoped match hit all three: the Readiness stat card and the
    // Funding Readiness row both say "Not assessed", and the suitability panel
    // says it too. They are different facts about different subjects, and a
    // locator that cannot tell them apart would keep passing on a page where
    // suitability had gone back to inventing a score, as long as readiness still
    // said the right thing.
    //
    // The suitability stat card's own word is "Not checked" - a check that was
    // never run, rather than a score that was never assessed.
    const suitabilityCard = page
      .locator('div')
      .filter({ has: page.getByText('Suitability Score', { exact: true }) })
      .last();

    await expect(suitabilityCard.getByText('Not checked', { exact: true })).toBeVisible({
      timeout: 30000,
    });

    // The card says so positively, rather than being merely empty.
    await expect(suitabilityCard.getByText('no check on record', { exact: true })).toBeVisible();

    // `exact: true` matters here. Without it this is a substring match against
    // the whole page, and it matched the client's own generated name — the
    // fabricated score is a stat-card value whose entire text is "72", so an
    // exact match is both what we mean and the only form that cannot collide
    // with a revenue figure, a date or an id that happens to contain 72.
    await expect(page.getByText('72', { exact: true })).toHaveCount(0);
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
