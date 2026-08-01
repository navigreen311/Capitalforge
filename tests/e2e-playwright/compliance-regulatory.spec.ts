// ============================================================
// /compliance/regulatory — the update feed reads the database
//
// The page held eight regulatory updates as literals, and they were not
// summaries of real rules but specific claims about enacted law and
// enforcement, attributed to named regulators — an FTC settlement figure, a
// signed Texas act with an effective date, a California amendment — each with
// a paragraph telling an advisor what their clients must now do.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Alert {
  id: string;
  title: string;
  source: string;
  ruleType: string;
  impactScore: number | null;
}

async function alerts(token: string | null): Promise<Alert[]> {
  const res = await fetch(`${API}/regulatory/alerts?limit=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/regulatory/alerts must be reachable').toBe(200);
  return ((await res.json()) as { data: { alerts: Alert[] } }).data.alerts;
}

test.describe('Compliance — regulatory update feed', () => {
  test('shows the updates the API returns', async ({ signedInPage: page }) => {
    await page.goto('/compliance/regulatory');
    await expect(page.getByRole('heading', { name: 'Regulatory Updates' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await alerts(token);
    expect(rows.length, 'the seed records regulatory alerts').toBeGreaterThan(0);

    for (const row of rows.slice(0, 3)) {
      await expect(page.getByText(row.title).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not assert legislation that was written into the page', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/regulatory');
    await expect(page.getByRole('heading', { name: 'Regulatory Updates' })).toBeVisible();

    // Specific, actionable and invented: a settlement figure, a signed act
    // with an effective date, a named state amendment.
    for (const claim of [
      'FTC settled with a business credit broker for $2.3M',
      'Texas HB 1442 Business Lending Transparency Act Signed',
      'California SB 1235 Amendment Expands Disclosure Requirements',
      'New York DFS Proposes Commercial Lending Transparency Rule',
      'Florida UDAP Provisions Now Cover Digital Credit Applications',
    ]) {
      await expect(page.getByText(claim)).toHaveCount(0);
    }
  });

  test('offers filters built from the data, and no state filter', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/regulatory');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await alerts(token);

    // No column records a jurisdiction, so the six states offered before were
    // part of the same fixture as the rules.
    await expect(page.getByLabel('State')).toHaveCount(0);

    const sourceSelect = page.getByLabel('Source');
    await expect(sourceSelect).toBeVisible({ timeout: 30000 });

    // Every option corresponds to a source some alert actually has.
    const options = await sourceSelect.locator('option').allTextContents();
    const sources = new Set(rows.map((r) => r.source));
    for (const option of options) {
      if (option === 'All sources') continue;
      expect(sources.has(option), `${option} is offered but no alert has it`).toBe(true);
    }
    expect(options.length).toBe(sources.size + 1);
  });

  test('filtering by source shows only that source', async ({ signedInPage: page }) => {
    await page.goto('/compliance/regulatory');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await alerts(token);

    const source = rows[0].source;
    const expected = rows.filter((r) => r.source === source);
    const excluded = rows.filter((r) => r.source !== source);

    await page.getByLabel('Source').selectOption(source);

    for (const row of expected) {
      await expect(page.getByText(row.title).first()).toBeVisible({ timeout: 30000 });
    }
    for (const row of excluded) {
      await expect(page.getByText(row.title)).toHaveCount(0);
    }
  });

  test('has no bookmark control, because nothing stores one', async ({ signedInPage: page }) => {
    await page.goto('/compliance/regulatory');
    await expect(page.getByRole('heading', { name: 'Regulatory Updates' })).toBeVisible();

    // The pin toggled local state and forgot on reload.
    await expect(page.getByText('bookmarked', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /bookmark/i })).toHaveCount(0);
  });

  test('claims no sync it does not perform', async ({ signedInPage: page }) => {
    await page.goto('/compliance/regulatory');
    await expect(page.getByRole('heading', { name: 'Regulatory Updates' })).toBeVisible();

    // "Last synced: Apr 7, 2026" was a constant, and nothing fetches rules
    // from any regulator.
    await expect(page.getByText('Last synced', { exact: false })).toHaveCount(0);
    await expect(
      page.getByText('not a feed from the regulators', { exact: false }),
    ).toBeVisible();
  });

  test('reports platform impact, not what a client must do', async ({ signedInPage: page }) => {
    await page.goto('/compliance/regulatory');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await alerts(token);
    const scored = rows.find((a) => a.impactScore !== null);
    expect(scored, 'a scored alert is needed').toBeTruthy();

    const res = await fetch(`${API}/regulatory/impact/${scored!.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const assessment = ((await res.json()) as { data: { rationale: string } }).data;

    await page
      .getByText(scored!.title)
      .locator('xpath=ancestor::article[1]')
      .getByRole('button', { name: 'Platform impact' })
      .click();

    // The assessment shown is the API's, and it is labelled for what it is.
    await expect(page.getByText(assessment.rationale)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Modules affected on this platform')).toBeVisible();
    await expect(
      page.getByText('What a given client must do about this rule is not assessed here'),
    ).toBeVisible();
  });
});
