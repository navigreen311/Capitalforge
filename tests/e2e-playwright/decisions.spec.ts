// ============================================================
// /decisions — the governance log reads the database
//
// The page held eight decisions as literals, each tied to a named client and
// carrying a snapshot of the inputs behind it, beside an override trail
// naming who approved each reversal — including a Chief Credit Officer. It
// closed by asserting seven-year append-only retention.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Decision {
  id: string;
  moduleSource: string;
  decisionType: string;
  inputHash: string | null;
  confidence: number | null;
  overriddenBy: string | null;
  modelVersion: string | null;
  flags: { belowConfidenceThreshold: boolean; wasOverridden: boolean };
}

async function decisions(token: string | null): Promise<Decision[]> {
  const res = await fetch(`${API}/ai-governance/decisions?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/ai-governance/decisions must be reachable').toBe(200);
  return ((await res.json()) as { data: { decisions: Decision[] } }).data.decisions;
}

test.describe('Decision governance', () => {
  test('shows the decisions the API returns', async ({ signedInPage: page }) => {
    await page.goto('/decisions');
    await expect(page.getByRole('heading', { name: 'Decision Governance' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decisions(token);
    expect(rows.length, 'the seed records AI decisions').toBeGreaterThan(0);

    // The count comes from the log, not from a fixture.
    await expect(
      page.getByText('Decisions', { exact: true }).locator('..').getByText(String(rows.length), {
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });

    for (const model of [...new Set(rows.map((r) => r.modelVersion).filter(Boolean))].slice(0, 3)) {
      await expect(page.getByText(model as string).first()).toBeVisible();
    }
  });

  test('does not render the decisions that used to be hardcoded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/decisions');
    await expect(page.getByRole('heading', { name: 'Decision Governance' })).toBeVisible();

    for (const invented of [
      'Apex Ventures LLC',
      'NovaTech Solutions Inc.',
      'Pinnacle Freight Corp',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('names nobody as having approved an override', async ({ signedInPage: page }) => {
    await page.goto('/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decisions(token);

    const overridden = rows.find((r) => r.overriddenBy !== null);
    expect(overridden, 'the seed records an overridden decision').toBeTruthy();

    // The trail asserted a senior sign-off per override. No column holds one.
    for (const person of ['Ana Reyes', 'Diana Walsh', 'Chief Credit Officer']) {
      await expect(page.getByText(person)).toHaveCount(0);
    }

    // Scoped to the table: "Overridden" is also a KPI label, and that is the
    // first match on the page.
    await page.locator('table').getByText('Overridden', { exact: true }).first().click();
    await expect(
      page.getByText('Who authorised this override is not recorded', { exact: false }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows the input hash and no input snapshot', async ({ signedInPage: page }) => {
    await page.goto('/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decisions(token);

    const hashed = rows.find((r) => r.inputHash !== null);
    expect(hashed, 'a decision with an input hash is needed').toBeTruthy();

    await page.getByText(hashed!.modelVersion as string).first().click();

    await expect(page.getByText(hashed!.inputHash as string)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('A digest, not the inputs', { exact: false })).toBeVisible();

    // The row used to carry the applicant figures behind each decision.
    for (const invented of ['FICO Score', '$2,400,000', 'Annual Revenue']) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('claims no retention or immutability guarantee', async ({ signedInPage: page }) => {
    await page.goto('/decisions');
    await expect(page.getByRole('heading', { name: 'Decision Governance' })).toBeVisible();

    // The original assertion, in full. Matching the fragments alone would hit
    // the page's own explanation of what was removed, which quotes them.
    await expect(
      page.getByText(
        'All override entries are append-only and retained for 7 years per regulatory requirements.',
      ),
    ).toHaveCount(0);
    await expect(page.getByText('Entries cannot be deleted or modified')).toHaveCount(0);
    await expect(
      page.getByText('Retention and immutability are not claimed', { exact: false }),
    ).toBeVisible();
  });

  test('carries no client column, because a decision is not linked to one', async ({
    signedInPage: page,
  }) => {
    await page.goto('/decisions');
    await expect(page.getByRole('heading', { name: 'Decision Governance' })).toBeVisible();

    await expect(page.getByRole('columnheader', { name: /client|business/i })).toHaveCount(0);
    await expect(
      page.getByText('A decision is not linked to a client', { exact: false }),
    ).toBeVisible();
  });

  test('filters by module against the API vocabulary', async ({ signedInPage: page }) => {
    await page.goto('/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decisions(token);

    const modules = [...new Set(rows.map((r) => r.moduleSource))];
    expect(modules.length).toBeGreaterThan(1);

    const select = page.getByLabel('Module');
    const options = await select.locator('option').allTextContents();
    // Every option corresponds to a module some decision actually came from.
    expect(options.length).toBe(modules.length + 1);

    const target = modules[0];
    await select.selectOption(target);

    const expected = rows.filter((r) => r.moduleSource === target).length;
    await expect(page.getByText(`${expected} of ${rows.length}`)).toBeVisible({ timeout: 30000 });
  });

  test('per-module rates and version history come from the API', async ({ signedInPage: page }) => {
    await page.goto('/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const headers = { Authorization: `Bearer ${token}` };

    const metrics = await fetch(`${API}/ai-governance/metrics`, { headers })
      .then(expectOk)
      .then((b) => (b as { data: { moduleSource: string; totalDecisions: number }[] }).data);
    expect(metrics.length, 'metrics are reported per module').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'By Module' }).click();
    await expect(page.getByRole('columnheader', { name: 'Override rate' })).toBeVisible({
      timeout: 30000,
    });

    const versions = await fetch(`${API}/ai-governance/versions`, { headers })
      .then(expectOk)
      .then((b) => (b as { data: { modelVersion: string }[] }).data);
    expect(versions.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Model Versions' }).click();
    await expect(page.getByText(versions[0].modelVersion).first()).toBeVisible({ timeout: 30000 });
  });

  test('a decision with no confidence is not shown as zero', async ({ signedInPage: page }) => {
    await page.goto('/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decisions(token);

    // Every seeded decision reports one, so this checks the page renders the
    // distinction rather than defaulting a missing score to 0%.
    const unscored = rows.filter((r) => r.confidence === null);
    if (unscored.length > 0) {
      await expect(page.getByText('not reported').first()).toBeVisible({ timeout: 30000 });
    }
    await expect(page.getByText('0%')).toHaveCount(0);
  });
});
