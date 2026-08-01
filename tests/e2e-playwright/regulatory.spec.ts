// ============================================================
// /regulatory — the page reads the database
//
// It called nothing: six alerts, five funds-flow rows with daily volumes, six
// AML pillar scores, and a register of state lending licences with numbers
// and expiry dates, all written into the component. Its router was one of the
// twenty-two index.ts never imported, so the endpoints behind it answered 404.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Alert {
  id: string;
  title: string;
  status: string;
  impactScore: number | null;
}

async function alerts(token: string | null): Promise<Alert[]> {
  const res = await fetch(`${API}/regulatory/alerts?limit=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/regulatory/alerts must be reachable').toBe(200);
  return ((await res.json()) as { data: { alerts: Alert[] } }).data.alerts;
}

test.describe('Regulatory intelligence', () => {
  test('shows the rule changes the API returns', async ({ signedInPage: page }) => {
    await page.goto('/regulatory');
    await expect(page.getByRole('heading', { name: 'Regulatory Intelligence' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await alerts(token);
    expect(rows.length, 'the seed records regulatory alerts').toBeGreaterThan(0);

    for (const row of rows.slice(0, 3)) {
      await expect(page.getByText(row.title).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the alerts that used to be hardcoded', async ({ signedInPage: page }) => {
    await page.goto('/regulatory');
    await expect(page.getByRole('heading', { name: 'Regulatory Intelligence' })).toBeVisible();

    await expect(
      page.getByText('Updated UDAP Enforcement Guidance – Small Business Credit'),
    ).toHaveCount(0);
  });

  test('does not list licences that do not exist', async ({ signedInPage: page }) => {
    await page.goto('/regulatory');
    await page.getByRole('button', { name: 'Licensing Review' }).click();

    // These licence numbers were written into the page. Nothing in the schema
    // records a licence held, its number or its expiry, and acting on a false
    // "active" here means lending into a state unlicensed.
    for (const licenceNumber of [
      'CFL-60DX-2024',
      'PFA-NY-0441',
      'CAB-TX-8821',
      'CFC-FL-1103',
      'RISA-IL-0772',
    ]) {
      await expect(page.getByText(licenceNumber)).toHaveCount(0);
    }

    // And it says so, rather than leaving the absence to be read as "none held".
    await expect(page.getByRole('heading', { name: 'Licences held' })).toBeVisible();
    await expect(
      page.getByText('Nothing in this system records a licence held', { exact: false }),
    ).toBeVisible();
  });

  test('does not show AML readiness scores', async ({ signedInPage: page }) => {
    await page.goto('/regulatory');
    await page.getByRole('button', { name: 'Licensing Review' }).click();

    // Six pillars each carried a score out of 100, identical for every
    // tenant, each with an "Improve →" link when it fell below 75. Asserted
    // on those structures, not on the pillar names: the page names them in
    // prose when explaining what was removed.
    await expect(page.getByRole('link', { name: /Improve/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'AML Readiness', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'AML readiness' })).toBeVisible();
    await expect(page.getByText('Nothing measured any of them', { exact: false })).toBeVisible();
  });

  test('shows the funds flow classifications the API returns, without volumes', async ({
    signedInPage: page,
  }) => {
    await page.goto('/regulatory');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const res = await fetch(`${API}/funds-flow/classifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const rows = ((await res.json()) as { data: { classifications: { workflowName: string }[] } })
      .data.classifications;
    expect(rows.length, 'the seed records funds flow classifications').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Funds Flow' }).click();

    for (const row of rows) {
      await expect(page.getByText(row.workflowName).first()).toBeVisible({ timeout: 30000 });
    }

    // No column records volume against a classification. Scoped to the
    // table, since the note below it cites "$2.4M/day" as the example of what
    // the rows used to carry.
    await expect(page.locator('table').getByText('$2.4M/day')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /volume/i })).toHaveCount(0);
  });

  test('recording a review persists', async ({ signedInPage: page }) => {
    await page.goto('/regulatory');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // Deliberately not an alert whose status is 'new'.
    //
    // The review endpoint accepts under_review, resolved and dismissed, and
    // has no transition back to 'new'. An earlier version of this test took a
    // new alert, reviewed it, and "restored" it to resolved — which is not
    // where it started. It passed once and then drifted the seeded data, so
    // the next full run found no new alert and failed.
    //
    // Any alert already in a restorable status can be flipped and put back
    // exactly, which makes this repeatable.
    const RESTORABLE = ['under_review', 'resolved', 'dismissed'];
    const before = await alerts(token);
    const target = before.find((a) => RESTORABLE.includes(a.status));
    expect(target, 'an alert in a restorable status is needed').toBeTruthy();

    const original = target!.status;
    const flipped = original === 'dismissed' ? 'resolved' : 'dismissed';

    const review = (status: string) =>
      fetch(`${API}/regulatory/alerts/${target!.id}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus: status }),
      });

    try {
      const res = await review(flipped);
      expect(res.status).toBe(200);

      const after = await alerts(token);
      expect(after.find((a) => a.id === target!.id)?.status).toBe(flipped);
    } finally {
      // Restored even if the assertion above fails, so one bad run does not
      // leave the seed altered for every run after it.
      await review(original);
    }

    const restored = await alerts(token);
    expect(restored.find((a) => a.id === target!.id)?.status).toBe(original);
  });

  test('an impact assessment comes from the API', async ({ signedInPage: page }) => {
    await page.goto('/regulatory');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await alerts(token);
    const scored = rows.find((a) => a.impactScore !== null);
    expect(scored, 'a scored alert is needed').toBeTruthy();

    const res = await fetch(`${API}/regulatory/impact/${scored!.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status, '/regulatory/impact/:ruleId must be reachable').toBe(200);
    const assessment = ((await res.json()) as { data: { rationale: string } }).data;
    expect(assessment.rationale.length).toBeGreaterThan(0);

    await page
      .getByText(scored!.title)
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
      .getByRole('button', { name: 'Impact assessment' })
      .click();

    await expect(page.getByText(assessment.rationale)).toBeVisible({ timeout: 30000 });
  });

  test('an unscored alert is not rendered as low impact', async ({ signedInPage: page }) => {
    await page.goto('/regulatory');
    await expect(page.getByRole('heading', { name: 'Regulatory Intelligence' })).toBeVisible();

    // Every seeded alert carries a score, so this checks the page states the
    // distinction rather than defaulting an absent score to a band.
    const notScored = page.getByText('Impact not scored');
    const count = await notScored.count();
    if (count > 0) {
      await expect(notScored.first()).toBeVisible();
    }

    // The headline says how many open alerts have no score, so "highest open
    // impact" is not read as a ceiling across everything open.
    await expect(page.getByText('Highest open impact')).toBeVisible();
  });
});
