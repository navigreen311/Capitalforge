// ============================================================
// /platform/referrals — no commission rate without a commission
//
// Referral links have a table as of 2026-08-07, so the endpoints create and
// list real rows. What has *not* changed is the part these tests were written
// for: a commission rate.
//
// A tier ladder was hardcoded in the component — Bronze 10%, Silver 15%,
// Gold 20% — and rendered per advisor with a progress line reading "6 more
// for Silver". Nothing holds a commission rate, a conversion or a referral,
// so both the rate and the distance to the next one were invented, and every
// advisor showed as Bronze because that is what the ladder returns for no
// data. Telling an advisor what share of a deal they earn is not a display
// default.
//
// And the commission and leaderboard tables rendered their headers with no
// rows and no explanation, which reads as a programme with no participants
// rather than a programme that does not exist.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

test.describe('Referral tracking', () => {
  test('the endpoint says a conversion count is a floor', async ({ signedInPage: page }) => {
    await page.goto('/platform/referrals');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const body = (await fetch(`${API}/platform/referrals`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as {
      data: { referrals: unknown[]; tracking: { available: boolean; note: string } };
    };

    // Tracking exists now. What it cannot do is notice a referred party
    // becoming a client on their own, so the count is a floor and the API
    // says so rather than presenting a zero as a measurement.
    expect(Array.isArray(body.data.referrals)).toBe(true);
    expect(body.data.tracking.available).toBe(true);
    expect(body.data.tracking.note).toMatch(/floor/i);
  });

  test('states no commission rate for an advisor', async ({ signedInPage: page }) => {
    await page.goto('/platform/referrals');
    await expect(page.getByRole('heading', { name: 'Advisor Referral Links' })).toBeVisible({
      timeout: 30000,
    });

    // Scoped to the advisor cards. The commission table below now explains
    // what was removed and quotes the three rates while doing it, and
    // getByText matches substrings, so a page-wide assertion here fails
    // against the explanation rather than against a badge.
    const advisorCards = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Advisor Referral Links' }),
    });

    for (const invented of ['Bronze 10%', 'Silver 15%', 'Gold 20%']) {
      await expect(advisorCards.getByText(invented)).toHaveCount(0);
    }

    // This phrase only ever existed on the badge.
    await expect(page.getByText('more for Silver')).toHaveCount(0);

    // No empty-state assertion here on purpose.
    //
    // It used to check that the section explains itself when nothing is on
    // record, which was safe while nothing could be. Referral links are rows
    // now, so whether the list is empty depends on what another test in this
    // run created — and an assertion whose truth depends on test order is a
    // flake waiting for a slower machine. The property this test is named for
    // holds either way: no invented rate, whatever is in the list.
  });

  test('says why the commission table is empty', async ({ signedInPage: page }) => {
    await page.goto('/platform/referrals');
    await expect(page.getByRole('heading', { name: 'Commission Structure' })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('No commission tiers are on record')).toBeVisible();
  });

  test('says why the leaderboard is empty', async ({ signedInPage: page }) => {
    await page.goto('/platform/referrals');
    await expect(page.getByRole('heading', { name: 'Referral Leaderboard' })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('No advisor has a referral on record')).toBeVisible();
  });

  test('creates a referral that is still there on the next read', async ({
    signedInPage: page,
  }) => {
    await page.goto('/platform/referrals');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const res = await fetch(`${API}/platform/referrals`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ referredName: 'Test Referral' }),
    });

    // It used to answer 201 with a link that resolved to nothing, held in
    // memory until the process restarted. The assertion that would have
    // caught that is the read-back, not the status.
    expect(res.status).toBe(201);
    const created = (await res.json()) as { data: { referral: { id: string; code: string } } };
    expect(created.data.referral.code).toBeTruthy();

    const list = (await fetch(`${API}/platform/referrals`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as { data: { referrals: Array<{ id: string }> } };

    expect(list.data.referrals.some((r) => r.id === created.data.referral.id)).toBe(true);
  });
});
