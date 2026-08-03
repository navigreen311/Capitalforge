// ============================================================
// /platform/referrals — no commission rate without a commission
//
// The referral list and the endpoints behind it were made honest earlier:
// GET /api/platform/referrals returns an empty list with a stated reason and
// POST answers 501. Two things survived that pass, both in the page.
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
  test('the endpoint reports that tracking is not available', async ({ signedInPage: page }) => {
    await page.goto('/platform/referrals');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const body = (await fetch(`${API}/platform/referrals`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as {
      data: { referrals: unknown[]; tracking: { available: boolean; why: string } };
    };

    expect(body.data.referrals).toEqual([]);
    expect(body.data.tracking.available).toBe(false);
    expect(body.data.tracking.why).toContain('not implemented');
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

    // With nothing on record there is no advisor card to carry a badge, so
    // the section says that rather than showing an empty grid under a
    // heading.
    await expect(page.getByText('No advisor has a referral link')).toBeVisible();
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

  test('refuses to create a referral rather than answering 201', async ({
    signedInPage: page,
  }) => {
    await page.goto('/platform/referrals');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const res = await fetch(`${API}/platform/referrals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisorName: 'Test', source: 'LinkedIn' }),
    });

    // It used to answer 201 with a link that resolved to nothing, held in
    // memory until the process restarted.
    expect(res.status).toBe(501);
  });
});
