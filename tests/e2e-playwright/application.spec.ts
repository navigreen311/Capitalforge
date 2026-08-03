import { test, expect, expectOk } from './fixtures';

// ============================================================
// Application pipeline E2E — /applications
// Covers: the kanban board, its columns, and the new-application wizard.
//
// These ran signed out, so the board fell back to ten sample applications and
// the tests asserted against those — `APP-` ids that exist in no database.
// Signed in, the page threw: the real rows carry no advisor field and the
// board called .split(' ') on it.
//
// Now signed in and asserting against the seeded records, so a passing run
// means the pipeline rendered real data.
// ============================================================

test.describe('Application pipeline board', () => {
  test('shows the board and the new-application action', async ({ signedInPage: page }) => {
    await page.goto('/applications');

    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByRole('button', { name: /new application/i })).toBeVisible();
  });

  test('renders every kanban column', async ({ signedInPage: page }) => {
    await page.goto('/applications');

    for (const column of ['Draft', 'Pending Consent', 'Submitted', 'Approved', 'Declined']) {
      await expect(page.getByText(column, { exact: true }).first()).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test('renders the seeded applications rather than sample cards', async ({
    signedInPage: page,
  }) => {
    await page.goto('/applications');

    // Seeded records, from prisma/seed.ts.
    await expect(page.getByText('Ink Business Preferred').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Apex Digital Solutions LLC').first()).toBeVisible();

    // The sample data these tests used to assert on is gone. `APP-` ids
    // appeared nowhere but the placeholder array.
    await expect(page.getByText(/^APP-/)).toHaveCount(0);
  });

  test('does not crash when rendering real rows', async ({ signedInPage: page }) => {
    // The regression this file exists to catch. Real applications carry no
    // advisor, and the board used to call .split(' ') on it, which took the
    // whole page to the error boundary.
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/applications');
    await expect(page.getByText('Ink Business Preferred').first()).toBeVisible({
      timeout: 15000,
    });

    expect(pageErrors).toEqual([]);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test('opens the new-application wizard', async ({ signedInPage: page }) => {
    await page.goto('/applications');

    await page.getByRole('button', { name: /new application/i }).click();

    // Other modals mount alongside this one, so the wizard is addressed by
    // its accessible name rather than by role alone.
    const dialog = page.getByRole('dialog', { name: 'New Application Wizard' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByRole('heading', { name: 'New Application' })).toBeVisible();
  });

  test('closes the wizard without creating anything', async ({ signedInPage: page }) => {
    await page.goto('/applications');
    await page.getByRole('button', { name: /new application/i }).click();

    const dialog = page.getByRole('dialog', { name: 'New Application Wizard' });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('Pipeline size', () => {
  test.setTimeout(120_000);

  test('counts every application, not the first page', async ({ signedInPage: page }) => {
    const API = 'http://127.0.0.1:4000/api';
    await page.goto('/applications');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Creating an application requires at least one assigned advisor. The
    // fixture seeds only the access token, so the user id comes from the API.
    const tenant = (await fetch(`${API}/tenants/by-slug/demo-advisors`).then(expectOk)) as { data?: { id?: string } };
    const login = (await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@demoadvisors.io',
        password: 'DemoPass123!',
        tenantId: tenant.data?.id,
      }),
    }).then(expectOk)) as { data?: { user?: { id?: string } } };

    const advisorId = login.data?.user?.id;
    expect(advisorId, 'no signed-in user id available').toBeTruthy();

    const total = async () => {
      const j = (await fetch(`${API}/applications`, { headers }).then(expectOk)) as {
        meta?: { total?: number };
      };
      return j.meta?.total ?? 0;
    };

    // The endpoint returns 50 at a time, so push the pipeline past that.
    const toCreate = Math.max(0, 55 - (await total()));
    const stamp = Date.now();

    // Five at a time, and every response checked. Firing fifteen at once
    // alongside the other specs' workers exhausted the backend's database
    // connections, and because the responses were ignored the run failed much
    // later on a count, reporting nothing about why.
    const BATCH = 5;
    for (let batch = 0; batch * BATCH < toCreate; batch++) {
      const responses = await Promise.all(
        Array.from({ length: Math.min(BATCH, toCreate - batch * BATCH) }, (_, i) =>
          fetch(`${API}/businesses/seed-biz-001/applications`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              issuer: 'Chase',
              cardProduct: `E2E pipeline filler ${stamp}-${batch}-${i}`,
              creditLimit: 1000,
              assignedAdvisorIds: [advisorId],
            }),
          }),
        ),
      );

      for (const res of responses) {
        if (res.status !== 201) {
          const body = await res.text();
          throw new Error(`Creating a filler application failed (${res.status}): ${body.slice(0, 200)}`);
        }
      }
    }

    const count = await total();
    expect(count, 'the pipeline should exceed one page').toBeGreaterThan(50);

    await page.reload();

    // The board's own "Total" chip, which counts the rows it loaded. Matching
    // rendered cards by text is unreliable — a regex matches ancestors as well
    // as the card, so the count comes out inflated and passes either way.
    // The chip renders "Total: 55" as text nodes in one button, so there is no
    // child element to match on — it is addressed by the button's own text.
    await expect(page.getByRole('button', { name: /^Total: \d+$/ })).toHaveText(
      `Total: ${count}`,
      { timeout: 30000 },
    );
  });
});

test.describe('Board figures', () => {
  const API = 'http://127.0.0.1:4000/api';

  test('declined credit is not counted as pipeline', async ({ signedInPage: page }) => {
    await page.goto('/applications');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const rows = (await fetch(`${API}/applications?pageSize=100`, { headers }).then(expectOk)) as {
      data?: { id: string; status: string; requestedLimit: number; approvedLimit?: number }[];
    };
    const apps = rows.data ?? [];

    const currency = (n: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n);

    // What the board should show: everything not declined.
    const expectedPipeline = apps
      .filter((a) => a.status !== 'declined')
      .reduce((sum, a) => sum + (a.approvedLimit ?? a.requestedLimit ?? 0), 0);

    // Approved credit only, from the approved limit.
    const expectedApproved = apps
      .filter((a) => a.status === 'approved')
      .reduce((sum, a) => sum + (a.approvedLimit ?? 0), 0);

    await expect(page.getByRole('button', { name: /^Pipeline Value: / })).toHaveText(
      `Pipeline Value: ${currency(expectedPipeline)}`,
      { timeout: 30000 },
    );
    await expect(page.getByRole('button', { name: /^Approved: / })).toHaveText(
      `Approved: ${currency(expectedApproved)}`,
    );

    // And the declined value is genuinely excluded, so this is not a
    // coincidence of the two sums being equal.
    const declinedValue = apps
      .filter((a) => a.status === 'declined')
      .reduce((sum, a) => sum + (a.requestedLimit ?? 0), 0);
    expect(declinedValue, 'no declined application carries a limit to exclude').toBeGreaterThan(0);
  });

  test('says how much of the board the pipeline figure covers', async ({ signedInPage: page }) => {
    await page.goto('/applications');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const rows = (await fetch(`${API}/applications?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as {
      data?: { status: string; requestedLimit: number | null; approvedLimit?: number }[];
    };
    const apps = rows.data ?? [];

    const open = apps.filter((a) => a.status !== 'declined');
    const withAmount = open.filter(
      (a) => a.requestedLimit !== null || a.approvedLimit !== undefined,
    );

    // The seed carries a submitted application with no amount on file, so this
    // is a live case rather than a hypothetical one.
    expect(withAmount.length, 'every open application carries an amount').toBeLessThan(open.length);

    await expect(
      page.getByText(
        `Pipeline Value covers ${withAmount.length} of ${open.length} open applications`,
      ),
    ).toBeVisible({ timeout: 30000 });
  });

  test('does not offer to move a card between columns', async ({ signedInPage: page }) => {
    await page.goto('/applications');
    await expect(page.getByText('Applications', { exact: false }).first()).toBeVisible();

    // Dragging called a 404 route and swallowed the failure, leaving the board
    // showing a status change that was never recorded.
    await expect(page.locator('[draggable="true"]')).toHaveCount(0);
    await expect(page.getByText('Drop here')).toHaveCount(0);
  });
});

test.describe('Figures before the data arrives', () => {
  /**
   * The board's chips render outside the loading branch, so until the fetch
   * returns they showed "Total: 0", "Pipeline Value: $0" and "Approved: $0"
   * beside the words "Loading pipeline...". A pipeline of zero is a claim
   * about the business — no live applications, nothing approved — and it was
   * being made on every load before anything was known.
   *
   * The page already had the right idea one line further down: Approval Rate
   * shows a dash rather than 0%, because "0% reads as a rejection rate of one
   * hundred percent". Same reasoning, same treatment, for the other three.
   *
   * Caught by delaying the API rather than by reading the source: whether a
   * figure renders before its data is a runtime property, and a first attempt
   * to find these statically matched the wrong `return (`.
   */
  const SLOW_API_MS = 4000;

  test('states a dash, not a zero, until the numbers are known', async ({
    signedInPage: page,
  }) => {
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_API_MS));
      await route.continue();
    });

    await page.goto('/applications', { waitUntil: 'commit' });

    // While it is still loading, and saying so.
    await expect(page.getByText('Loading pipeline...')).toBeVisible({ timeout: 30000 });

    await expect(page.getByRole('button', { name: /^Total: / })).toHaveText('Total: —');
    await expect(page.getByRole('button', { name: /^Pipeline Value: / })).toHaveText(
      'Pipeline Value: —',
    );
    await expect(page.getByRole('button', { name: /^Approved: / })).toHaveText('Approved: —');

    // The specific claim this exists to prevent.
    await expect(page.getByText('Pipeline Value: $0')).toHaveCount(0);
  });

  test('shows the figures once they are known', async ({ signedInPage: page }) => {
    // The dash must be a loading state, not a permanent regression: with the
    // API answering normally the real numbers still arrive.
    await page.goto('/applications');
    await expect(page.getByRole('button', { name: /^Pipeline Value: / })).not.toHaveText(
      'Pipeline Value: —',
      { timeout: 30000 },
    );
    await expect(page.getByText('Loading pipeline...')).toHaveCount(0);
  });
});
