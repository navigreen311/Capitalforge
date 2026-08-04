// ============================================================
// /funding-rounds/[id] — the round asked for, or none
//
// The page was one literal: round FR-018 for Apex Ventures LLC, three cards,
// $150,000 targeted and $105,000 obtained, an advisor called Sarah Chen and a
// block of round economics. It rendered for every id — ids on other tenants,
// and ids that do not exist.
//
// It survived four passes over this application because the pre-load sweep
// skips dynamic segments: it cannot visit a route that needs an id, so the one
// page still holding fixtures was the one it could not reach.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

/** A round id this tenant really owns. */
async function seededRoundId(page: import('@playwright/test').Page): Promise<string> {
  const body = (await fetch(`${API}/funding-rounds?pageSize=10`, {
    headers: { Authorization: `Bearer ${await token(page)}` },
  }).then(expectOk)) as { data?: { id: string }[] };
  const rounds = body.data ?? [];
  expect(rounds.length, 'the seed provides a funding round').toBeGreaterThan(0);
  return rounds[0]!.id;
}

test.describe('Funding round detail', () => {
  test('renders the round the id belongs to', async ({ signedInPage: page }) => {
    await page.goto('/funding-rounds');
    const id = await seededRoundId(page);

    const round = (await fetch(`${API}/funding-rounds/${id}`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    }).then(expectOk)) as {
      data: { businessName: string; roundNumber: number };
    };

    await page.goto(`/funding-rounds/${id}`);
    await expect(page.getByText(round.data.businessName).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByRole('heading', { name: new RegExp(`Round ${round.data.roundNumber}`) }),
    ).toBeVisible();
  });

  test('does not render the round that was invented', async ({ signedInPage: page }) => {
    await page.goto('/funding-rounds');
    const id = await seededRoundId(page);
    await page.goto(`/funding-rounds/${id}`);

    // Apex Ventures LLC is not a client, and FR-018 is not a round. Both
    // appeared on this page for every id.
    // Exact, so a real round numbered FR-0180 or a client whose name merely
    // contains one of these cannot trip an assertion about invented fixtures.
    await expect(page.getByText('Apex Ventures LLC', { exact: true })).toHaveCount(0);
    await expect(page.getByText('FR-018', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Sarah Chen', { exact: true })).toHaveCount(0);
  });

  test('shows nothing for a round that does not exist', async ({ signedInPage: page }) => {
    // The defect at its clearest: this used to render a complete funding
    // round, with cards and figures, for an id belonging to nobody.
    await page.goto('/funding-rounds/00000000-0000-0000-0000-000000000000');

    await expect(page.getByText('This funding round could not be read')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Apex Ventures LLC')).toHaveCount(0);
    await expect(page.getByText('$150,000')).toHaveCount(0);
  });

  test('the endpoint refuses a round on another tenant', async ({ signedInPage: page }) => {
    await page.goto('/funding-rounds');
    const res = await fetch(`${API}/funding-rounds/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    });
    expect(res.status).toBe(404);
  });

  test('states no round economics, because none are recorded per round', async ({
    signedInPage: page,
  }) => {
    await page.goto('/funding-rounds');
    const id = await seededRoundId(page);
    await page.goto(`/funding-rounds/${id}`);
    await expect(page.getByRole('heading', { name: 'Not shown here' })).toBeVisible({
      timeout: 30000,
    });

    // Cost calculations are keyed to a business, not a round.
    for (const invented of ['$4,750', '$1,800', '$98,450', '6.25%']) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('the figures match the round on record', async ({ signedInPage: page }) => {
    await page.goto('/funding-rounds');
    const id = await seededRoundId(page);

    const round = (await fetch(`${API}/funding-rounds/${id}`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    }).then(expectOk)) as {
      data: { progress: { applicationCount: number; approvedCount: number } };
    };

    await page.goto(`/funding-rounds/${id}`);
    await expect(page.getByRole('heading', { name: 'Cards on this round' })).toBeVisible({
      timeout: 30000,
    });

    // The fixture always showed three cards. This shows what is attached.
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(round.data.progress.applicationCount);
  });
});
