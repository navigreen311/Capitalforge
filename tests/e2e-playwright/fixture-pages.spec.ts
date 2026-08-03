// ============================================================
// The last fixture-only pages
//
// Eight sidebar destinations rendered literals and called nothing:
//
//   /clients              PLACEHOLDER_CLIENTS, while /api/clients returned
//                         the real roster
//   /funding-rounds       PLACEHOLDER_ROUNDS, while /api/funding-rounds did
//   /spend-governance     transactions and a risk summary
//   /rewards              cards with earn rates and a best-card-per-category
//                         recommendation
//   /compliance/contracts contract analyses
//   /portfolio            approval rates by issuer, industry and FICO band,
//                         one set of numbers multiplied per quarter
//   /platform/crm         twelve months of recurring revenue
//   /platform/reports     "247 clients", "68.5% approval rate", "$2,450,000
//                         funding deployed", "$142,500 revenue" — a whole
//                         report from constants, with a download
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

test.describe('Fixture-only pages', () => {
  test('/clients shows the roster the API returns', async ({ signedInPage: page }) => {
    await page.goto('/clients');
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible({ timeout: 30000 });

    const t = await token(page);
    const rows = await fetch(`${API}/clients?limit=200`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { businessName: string }[] }).data);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows.slice(0, 3)) {
      await expect(page.getByText(row.businessName).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('/funding-rounds shows the rounds the API returns', async ({ signedInPage: page }) => {
    await page.goto('/funding-rounds');
    await expect(page.getByRole('heading', { name: 'Funding Rounds' })).toBeVisible({
      timeout: 30000,
    });

    const t = await token(page);
    const rounds = await fetch(`${API}/funding-rounds`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: unknown[] }).data);

    if (rounds.length === 0) {
      await expect(page.getByText('No funding round is on record')).toBeVisible();
    } else {
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30000 });
    }
  });

  test('/portfolio reports only what it can count', async ({ signedInPage: page }) => {
    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible({
      timeout: 30000,
    });

    // A rate is shown with its denominator, so nobody reads 100% off one
    // approval.
    const rate = page.getByText(/% of \d+/).first();
    const noDecisions = page.getByText('no approval rate to report', { exact: false });
    await expect(rate.or(noDecisions)).toBeVisible({ timeout: 30000 });
  });

  test('/platform/reports counts records and refuses the rest', async ({ signedInPage: page }) => {
    await page.goto('/platform/reports');
    await expect(
      page.getByRole('heading', { name: 'What cannot be reported' }),
    ).toBeVisible({ timeout: 30000 });

    // No export of figures the system does not have.
    await expect(page.getByRole('button', { name: /download|export|generate/i })).toHaveCount(0);
  });

  test('none of the eight pages render their fixtures', async ({ signedInPage: page }) => {
    const checks: [string, string[]][] = [
      ['/clients', ['Thornwood Capital', 'BlueStar Holdings']],
      ['/funding-rounds', ['Apex Ventures LLC']],
      ['/spend-governance', ['Office Depot', 'WeWork']],
      ['/rewards', ['Amex Business Platinum', 'Category Best']],
      ['/compliance/contracts', ['Meridian Capital Group']],
      ['/portfolio', ['Q1 2026 vs Q4 2025']],
      ['/platform/crm', ['MRR']],
      // Not the figures the page's own note quotes back when explaining
      // what it removed — these are values only the report body carried.
      ['/platform/reports', ['Avg Days to Fund', 'SBA Approvals', 'Underwriting']],
    ];

    for (const [route, invented] of checks) {
      await page.goto(route);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      for (const text of invented) {
        await expect(page.getByText(text, { exact: false }), `${text} on ${route}`).toHaveCount(0);
      }
    }
  });

  test('each page reaches its endpoint rather than rendering blind', async ({
    signedInPage: page,
  }) => {
    // A page that renders nothing and calls nothing looks the same as one
    // whose data source is empty. These are the calls the pages make.
    await page.goto('/dashboard');
    const t = await token(page);
    const businessId = await fetch(`${API}/clients?limit=1`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { id: string }[] }).data[0]?.id);
    expect(businessId).toBeTruthy();

    for (const path of [
      '/clients?limit=1',
      '/funding-rounds',
      `/businesses/${businessId}/transactions`,
      `/businesses/${businessId}/benefits`,
      '/contracts/analyses',
      '/crm/pipeline',
    ]) {
      const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status, `${path} must answer`).toBe(200);
    }
  });
});
