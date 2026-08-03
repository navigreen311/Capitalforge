// ============================================================
// /comm-compliance — scans, scripts and QA read the database
//
// The page's worst fixture was a QA scorecard naming four advisors and
// scoring their compliance, script adherence and consent capture, with a
// trend arrow each. Nobody scored those calls. Beside it were five scripts
// with approvers written in and a scanner that ran a regex in the browser.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Script {
  id: string;
  name: string;
  category: string;
  currentVersion: { approvedBy: string | null; isActive: boolean };
}

async function scripts(token: string | null): Promise<Script[]> {
  const res = await fetch(`${API}/scripts`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status, '/scripts must be reachable').toBe(200);
  return ((await res.json()) as { data: Script[] }).data;
}

test.describe('Communication compliance', () => {
  test('scans a draft on the server', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');
    await expect(page.getByRole('heading', { name: 'Communication Compliance' })).toBeVisible();

    await page
      .getByLabel('Draft')
      .fill('We offer guaranteed approval for every business owner, with no risk to you.');
    // The tab is also called Scan; this is the submit button.
    await page.getByRole('button', { name: 'Scan', exact: true }).last().click();

    // The finding, its evidence and the statute all come from the API.
    await expect(page.getByText('Guaranteed approval claim')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('FTC Act', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/risk\b/i).first()).toBeVisible();
  });

  test('does not show the scanner enforcement examples', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');

    await page.getByLabel('Draft').fill('We offer guaranteed approval for every business owner.');
    // The tab is also called Scan; this is the submit button.
    await page.getByRole('button', { name: 'Scan', exact: true }).last().click();
    await expect(page.getByText('Guaranteed approval claim')).toBeVisible({ timeout: 30000 });

    // One of the cited enforcement actions names a company that appears
    // elsewhere in this codebase as an explicitly stubbed vendor. Invented
    // precedent must not be why an advisor is told to change their wording.
    await expect(page.getByText('Pinnacle Business Capital')).toHaveCount(0);
    await expect(page.getByText('$5M penalty')).toHaveCount(0);
  });

  test('a clean draft is not reported as approved wording', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');

    await page
      .getByLabel('Draft')
      .fill('Thanks for your time today. I will send the fee schedule in writing this afternoon.');
    // The tab is also called Scan; this is the submit button.
    await page.getByRole('button', { name: 'Scan', exact: true }).last().click();

    await expect(
      page.getByText('That is not an approval of the wording', { exact: false }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows the scripts the API returns', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');
    await page.getByRole('button', { name: 'Script Library' }).click();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await scripts(token);
    expect(rows.length, 'the seed records scripts').toBeGreaterThan(0);

    for (const row of rows.slice(0, 3)) {
      await expect(page.getByText(row.name).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the scripts that used to be hardcoded', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');
    await page.getByRole('button', { name: 'Script Library' }).click();

    // Approvers and reviewers were written in with job titles.
    for (const invented of [
      'Sarah Chen (QA Lead)',
      'Marcus Johnson (Compliance)',
      'Diana Reeves (Sr. QA)',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('flags a script in use with no recorded approver', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await scripts(token);

    const unapproved = rows.filter((r) => r.currentVersion.approvedBy === null);
    expect(unapproved.length, 'the seed leaves scripts unapproved').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Script Library' }).click();

    // A script an advisor reads from that nobody signed off is the gap worth
    // showing, and it is counted rather than left to be noticed.
    await expect(
      page
        .getByText('Without a recorded approver')
        .locator('..')
        .getByText(String(unapproved.length), { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('No recorded approver').first()).toBeVisible();
  });

  test('shows the scored calls for an advisor', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // The advisor the seed scores calls against. There is no endpoint that
    // lists advisors, which is why the page asks for an id.
    const business = await fetch(`${API}/applications?pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { businessId: string }[] }).data[0]);
    expect(business).toBeTruthy();

    const advisorId = await page.evaluate(async () => {
      const res = await fetch('/api/v1/clients?pageSize=25', {
        headers: { Authorization: `Bearer ${localStorage.getItem('cf_access_token')}` },
      });
      const body = (await res.json()) as { data?: { advisorName?: string }[] };
      return body.data?.find((c) => c.advisorName && c.advisorName !== 'Unassigned') ? true : false;
    });
    expect(advisorId, 'the seed assigns an advisor to a client').toBe(true);

    await page.getByRole('button', { name: 'Call QA' }).click();

    // The signed-in user's own id is prefilled, which is the one id the page
    // can know without a directory.
    const field = page.getByLabel('Advisor id');
    await expect(field).not.toHaveValue('');

    await page.getByRole('button', { name: /Show scores/ }).click();
    // exact, because the page's own description ends "...and how calls
    // scored." and getByText matches case-insensitive substrings. Without it
    // this resolved to the prose when the stat card was absent — passing while
    // asserting nothing — and to both when it was present.
    await expect(page.getByText('Calls scored', { exact: true })).toBeVisible({ timeout: 30000 });
  });

  test('does not show a team scorecard, and says why', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');
    await page.getByRole('button', { name: 'Call QA' }).click();

    // Four advisors scored on dimensions nobody measured, each with a trend.
    for (const advisor of ['Jordan Mitchell', 'Casey Rivera', 'Alex Torres', 'Morgan Park']) {
      await expect(page.getByText(advisor)).toHaveCount(0);
    }

    await expect(
      page.getByText('no endpoint lists advisors', { exact: false }),
    ).toBeVisible();
  });

  test('a scored call is not presented as a rating of the advisor', async ({
    signedInPage: page,
  }) => {
    await page.goto('/comm-compliance');
    await page.getByRole('button', { name: 'Call QA' }).click();
    await page.getByRole('button', { name: /Show scores/ }).click();

    // exact, because the page's own description ends "...and how calls
    // scored." and getByText matches case-insensitive substrings. Without it
    // this resolved to the prose when the stat card was absent — passing while
    // asserting nothing — and to both when it was present.
    await expect(page.getByText('Calls scored', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByText('not a rating of the advisor', { exact: false }),
    ).toBeVisible();
    // The scorecard's trend arrows are gone with it.
    await expect(page.getByRole('columnheader', { name: /trend/i })).toHaveCount(0);
  });
});
