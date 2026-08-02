// ============================================================
// /multi-tenant — administers real tenants, and claims nothing else
//
// The page held five tenants as literals: Apex Capital Group at $14,400 a
// month with 48 advisors and 412 clients, Clearview Strategies suspended with
// invoices INV-5019 and INV-5006 both overdue, a platform MRR card totalling
// the array. Nothing was fetched — the only occurrence of the word fetch was
// a comment saying what to replace the feature toggle with in production.
//
// Two things are under test: the tenants shown are the ones the endpoint
// returns, and the surfaces with no backing are gone rather than mocked.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

test.describe('Multi-tenant admin', () => {
  test('lists the tenants the endpoint returns', async ({ signedInPage: page }) => {
    await page.goto('/multi-tenant');

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const res = await fetch(`${API}/admin/tenants?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status, '/admin/tenants must be reachable').toBe(200);

    const tenants = ((await res.json()) as { data: { tenants: { name: string }[] } }).data.tenants;
    expect(tenants.length, 'the seed provides a tenant').toBeGreaterThan(0);

    for (const tenant of tenants.slice(0, 3)) {
      await expect(page.getByText(tenant.name).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the five tenants that were invented', async ({ signedInPage: page }) => {
    await page.goto('/multi-tenant');
    await expect(page.getByRole('heading', { name: 'Multi-Tenant Admin' })).toBeVisible();

    for (const invented of [
      'Apex Capital Group',
      'BlueSky Financial',
      'Momentum Advisors',
      'Pinnacle Wealth',
      'Clearview Strategies',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('publishes no subscription invoices, because none are recorded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/multi-tenant');
    await expect(page.getByRole('heading', { name: 'Multi-Tenant Admin' })).toBeVisible();

    // Invoice rows are keyed to a business, not a tenant. These numbers
    // summarised nothing.
    for (const invoice of ['INV-1041', 'INV-1028', 'INV-5019', 'INV-5006']) {
      await expect(page.getByText(invoice)).toHaveCount(0);
    }
    // exact, because this page's own explanation contains the word
    // "overdue" and getByText matches case-insensitive substrings.
    await expect(page.getByText('Overdue', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Paid', { exact: true })).toHaveCount(0);
  });

  test('offers no impersonation, and says why', async ({ signedInPage: page }) => {
    await page.goto('/multi-tenant');
    await expect(page.getByRole('heading', { name: 'Multi-Tenant Admin' })).toBeVisible();

    // The endpoint returns imp_<id>_<timestamp> and starts no session, while
    // the dialog claimed the action was logged and audited.
    await expect(page.getByRole('button', { name: /Impersonate/i })).toHaveCount(0);
    // The dialog's own controls, rather than its warning text: the page now
    // quotes that warning while explaining why the feature is gone, and
    // getByText would match the explanation.
    await expect(page.getByLabel(/Reason for Impersonation/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Not shown here' })).toBeVisible();
  });

  test('states no platform MRR when no plan record carries a price', async ({
    signedInPage: page,
  }) => {
    await page.goto('/multi-tenant');

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const tenants = (
      (await fetch(`${API}/admin/tenants?pageSize=100`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json())) as {
        data: { tenants: { currentPlan: { monthlyPrice: string | null } | null }[] };
      }
    ).data.tenants;

    const priced = tenants.filter((t) => t.currentPlan?.monthlyPrice != null);

    if (priced.length === 0) {
      // A dash, not $0 — which would state that every tenant is on a free plan.
      await expect(page.getByText('No plan record carries a price')).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByText('$0', { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText('No plan record carries a price')).toHaveCount(0);
    }
  });
});

test.describe('Tenant scoping', () => {
  test('a tenant admin is not served another tenant', async ({ signedInPage: page }) => {
    // localStorage is per-origin; without navigating first the page is
    // about:blank and reading it is a SecurityError.
    await page.goto('/multi-tenant');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // The signed-in seed user is a tenant_admin. Before scoping, this listed
    // every tenant on the platform, and any id could be read by url.
    const body = (await fetch(`${API}/admin/tenants?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json())) as { data: { tenants: { id: string }[]; total: number } };

    expect(body.data.tenants.length, 'one tenant, their own').toBe(1);
    expect(body.data.total, 'the count is scoped too').toBe(1);

    // A tenant that is not theirs is a 404, not a 403: refusing differently
    // would confirm the id exists.
    const other = await fetch(
      `${API}/admin/tenants/00000000-0000-0000-0000-000000000000/usage`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(other.status).toBe(404);
  });
});
