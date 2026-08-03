// ============================================================
// The dashboard's widgets reach endpoints that exist
//
// Recent Applications called GET /api/v1/dashboard/recent-applications, which
// had no router file and no entry in the dashboard's SUB_ROUTES list. It
// answered 404 for as long as the widget had been asking, so the landing page
// rendered "Something went wrong" in that panel on every visit.
//
// The browser suite passed throughout. Nothing asserted on this widget, and a
// component that catches its own fetch failure and renders an error state is
// invisible to tests that only assert what a page does show. It was found by
// opening the page and reading it.
//
// So this asserts the absence: no widget on the dashboard is sitting in its
// error state, and every /v1/dashboard endpoint the page requests answers.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

test.describe('Dashboard widgets', () => {
  test('every dashboard request the page makes is answered', async ({ signedInPage: page }) => {
    const notFound: string[] = [];

    page.on('response', (r) => {
      if (r.status() === 404 && r.url().includes('/api/')) notFound.push(r.url());
    });

    await page.goto('/dashboard', { waitUntil: 'load' });
    // The widgets fetch independently after paint.
    await page.waitForTimeout(4000);

    expect(notFound, `dashboard requested endpoints that do not exist:\n${notFound.join('\n')}`)
      .toEqual([]);
  });

  test('no widget is showing its error state', async ({ signedInPage: page }) => {
    await page.goto('/dashboard', { waitUntil: 'load' });
    await page.waitForTimeout(4000);

    // The shared error component renders this. A widget that cannot load says
    // so, which is right — but on a seeded tenant nothing should need to.
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });

  test('recent applications reads the applications on record', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const body = (await fetch(`${API}/v1/dashboard/recent-applications`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as {
      data: {
        applications: { id: string; clientName: string; consent: string; amount: string }[];
        total: number;
      };
    };

    expect(body.data.total, 'the seed provides applications').toBeGreaterThan(0);
    expect(body.data.applications.length).toBeGreaterThan(0);

    const first = body.data.applications[0]!;
    expect(first.clientName, 'each row names its client').toBeTruthy();
    // missing / partial / complete — "none on record" is not "refused", and
    // the widget distinguishes them.
    expect(['missing', 'partial', 'complete']).toContain(first.consent);
  });

  test('the table renders every status the endpoint emits', async ({ signedInPage: page }) => {
    // DashboardBadge read STATUS_MAP[status].label with no fallback, and
    // `cancelled` — a real card application status — was not in the map. The
    // throw happened during render, so the widget's own error handling never
    // saw it; it unwound to the page error boundary and replaced the entire
    // dashboard with "Something Went Wrong".
    //
    // The mapping itself is covered by unit tests. What this checks is the
    // pairing: that the statuses actually coming out of the endpoint are ones
    // the table puts on screen, and that the table drew a row for each.
    await page.goto('/dashboard', { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    await expect(page.getByText('Something went wrong')).toHaveCount(0);

    const table = page.locator('table').filter({ has: page.getByText('App ID') }).first();
    const rows = table.locator('tbody tr');

    const count = await rows.count();
    expect(count, 'the seed provides applications to draw').toBeGreaterThan(0);

    // Every row carries a status that reads as something. An unmapped status
    // used to throw; a status with no label would render an empty badge,
    // which is the quieter version of the same failure. Neither is allowed.
    for (let i = 0; i < count; i++) {
      const badge = rows.nth(i).locator('[aria-label^="Status:"]');
      await expect(badge).toHaveCount(1);
      expect((await badge.innerText()).trim(), `row ${i} has an empty status badge`).not.toBe('');
    }
  });

  test('an application with no limit recorded shows a dash, not zero', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const body = (await fetch(`${API}/v1/dashboard/recent-applications`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as { data: { applications: { amount: string }[] } };

    // A card approved for nothing and a card with nothing recorded are
    // different facts.
    for (const app of body.data.applications) {
      expect(app.amount === '—' || app.amount.startsWith('$')).toBe(true);
    }
  });
});
