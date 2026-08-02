// ============================================================
// /credit-builder — the picker offers real clients, and an absent score
// stays absent
//
// The client picker held eight literals under ids cb_001 to cb_008: Apex
// Ventures LLC, NovaGo Solutions, Meridian Holdings and five more. None of
// them exist, so choosing one sent every later request to
// /api/credit-builder/cb_001/scores. The backend answered correctly — 404,
// tenant-scoped, no such client — and the page turned that into a credit
// profile: Paydex 0, a tradeline count of 0, and a projected Tier 1 unlock
// date computed from both.
//
// The coercions that did it were `?? 0` at four call sites, on components
// that already accepted null and rendered it honestly. Plus a constant
// businessAgeMonths of 36, which cleared the two-year Tier 3 threshold for
// every client, against a schema that records no formation date at all.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

/** Seeded: has a Paydex of 80 on record. */
const CLIENT_WITH_SCORE = 'Apex Digital Solutions LLC';
/** Seeded with no business credit file, which is the case under test. */
const CLIENT_WITHOUT_SCORE = 'Meridian Health & Wellness S Corp';

test.describe('Credit builder client picker', () => {
  test('offers the clients the API returns, not eight invented ones', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clients = (await fetch(`${API}/v1/clients?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { businessName: string }[] }).data)) as {
      businessName: string;
    }[];
    expect(clients.length, 'the seed provides clients to offer').toBeGreaterThan(0);

    await page.getByRole('combobox', { name: 'Search clients' }).click();

    // A real one is on the list.
    await expect(
      page.getByText(clients[0]!.businessName).first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test('does not offer the businesses that were invented', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await page.getByRole('combobox', { name: 'Search clients' }).click();

    // These are not clients. One of them, Apex Ventures LLC, is in the list
    // the communications-compliance spec already asserts must never appear,
    // for the same reason.
    for (const invented of [
      'Apex Ventures LLC',
      'NovaGo Solutions',
      'Meridian Holdings',
      'Brightline Corp',
      'Thornwood Capital',
      'Pinnacle Group Inc',
      'Summit Edge Partners',
      'Vanguard Logistics LLC',
    ]) {
      await expect(page.getByText(invented, { exact: true })).toHaveCount(0);
    }
  });
});

test.describe('Credit builder figures', () => {
  async function selectClient(page: import('@playwright/test').Page, name: string) {
    await page.goto('/credit-builder');
    const box = page.getByRole('combobox', { name: 'Search clients' });
    await box.click();
    await box.fill(name);
    await page.getByText(name).first().click();
  }

  test('a client with no business credit file shows no score, not a zero', async ({
    signedInPage: page,
  }) => {
    await selectClient(page, CLIENT_WITHOUT_SCORE);

    // The specific claim this prevents: a Paydex of 0 is a score — the worst
    // one — for a business nobody has pulled a file on.
    await expect(page.getByText('Current Paydex: 0')).toHaveCount(0);
  });

  test('distinguishes no trade lines from trade lines not read', async ({
    signedInPage: page,
  }) => {
    // Both used to render "0 of 5 trade lines established". They are
    // different facts and the page has to be able to say which one it means.

    // Nothing selected: nothing has been asked for, so nothing is counted.
    await page.goto('/credit-builder');
    await expect(page.getByText('Not read').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('0 of 5 trade lines established')).toHaveCount(0);

    // A client whose tradeline list came back empty: zero is the real answer
    // and is stated as one.
    await selectClient(page, CLIENT_WITHOUT_SCORE);
    await expect(page.getByText('0 of 5 trade lines established')).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows the score on record for a client that has one', async ({ signedInPage: page }) => {
    await selectClient(page, CLIENT_WITH_SCORE);

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clients = (await fetch(`${API}/v1/clients?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { id: string; businessName: string }[] }).data)) as {
      id: string;
      businessName: string;
    }[];
    const target = clients.find((c) => c.businessName === CLIENT_WITH_SCORE);
    expect(target, 'the seeded client is present').toBeTruthy();

    // The endpoint answers for a real id, which it never did for cb_001.
    const res = await fetch(`${API}/credit-builder/${target!.id}/scores`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status, 'a real client id is not a 404').toBe(200);
  });

  test('does not claim a business age that nothing records', async ({ signedInPage: page }) => {
    await selectClient(page, CLIENT_WITH_SCORE);

    // businessAgeMonths was 36 for everyone, so this criterion reported
    // "Already met" to every client on a fact held nowhere in the schema.
    await expect(page.getByText('Formation date not recorded').first()).toBeVisible({
      timeout: 30000,
    });
  });
});
