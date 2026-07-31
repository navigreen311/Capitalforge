// ============================================================
// /fair-lending — Section 1071 monitoring reads the database
//
// The page charted approval rates by race, gender and ownership from ten
// hardcoded buckets — a fifteen-point gap between White (Non-Hispanic) and
// Black or African American — while the API for the same year reported
// totalApplications: 0. These check that the figures come from the API, that
// the invented ones are gone, and that no demographic breakdown of outcomes
// is reconstructed on the client.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Dashboard {
  reportingYear: number;
  totalApplications: number;
  approvalRate: number;
  denialRate: number;
  withdrawalRate: number;
  recordsWithDemographics: number;
  demographicCompletionRate: number;
  topAdverseReasons: { reason: string; count: number }[];
}

async function dashboard(token: string | null, year: number): Promise<Dashboard> {
  const res = await fetch(`${API}/fair-lending/dashboard?year=${year}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, 'the fair lending dashboard must be reachable').toBe(200);
  return ((await res.json()) as { data: Dashboard }).data;
}

const YEAR = new Date().getFullYear();

test.describe('Fair lending — Section 1071', () => {
  test('shows the covered application count the API reports', async ({ signedInPage: page }) => {
    await page.goto('/fair-lending');
    await expect(page.getByRole('heading', { name: /Fair Lending/ })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const data = await dashboard(token, YEAR);
    expect(data.totalApplications, 'the seed records 1071 decisions').toBeGreaterThan(0);

    // Exact: the coverage banner prose ("4 of 100 covered applications in
    // 2026") also contains this label.
    await expect(
      page
        .getByText('Covered applications', { exact: true })
        .locator('..')
        .getByText(String(data.totalApplications), { exact: true }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows the approval and denial rates the API computes', async ({ signedInPage: page }) => {
    await page.goto('/fair-lending');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const data = await dashboard(token, YEAR);

    await expect(
      page
        .getByText('Approved', { exact: true })
        .locator('..')
        .getByText(`${data.approvalRate}%`, { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page
        .getByText('Denied', { exact: true })
        .locator('..')
        .getByText(`${data.denialRate}%`, { exact: true }),
    ).toBeVisible();
  });

  test('does not chart approval rates by race, gender or ownership', async ({
    signedInPage: page,
  }) => {
    await page.goto('/fair-lending');
    await expect(page.getByRole('heading', { name: /Fair Lending/ })).toBeVisible();

    // These ten buckets rendered on every install for every tenant, with a
    // disparity that came from the source file.
    for (const bucket of [
      'White (Non-Hispanic)',
      'Black or Afr. American',
      'Hispanic / Latino',
      'Women-Owned (WOSB)',
      'Minority-Owned (MOSB)',
    ]) {
      await expect(page.getByText(bucket)).toHaveCount(0);
    }

    // And the page says why there is no such breakdown, rather than leaving
    // its absence to be read as nothing to report.
    await expect(page.getByText('Outcomes by demographic')).toBeVisible();
    await expect(page.getByText('does not break outcomes down by demographic', { exact: false }))
      .toBeVisible();
  });

  test('reports demographic collection from the API, not a completeness table', async ({
    signedInPage: page,
  }) => {
    await page.goto('/fair-lending');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const data = await dashboard(token, YEAR);

    await page.getByRole('button', { name: 'Demographic Collection' }).click();

    await expect(
      page.getByText(
        `${data.recordsWithDemographics} of ${data.totalApplications} recorded decisions carry a response`,
      ),
    ).toBeVisible({ timeout: 30000 });

    // The per-field breakdown named applications that do not exist.
    await expect(page.getByText('Race / ethnicity (owner)')).toHaveCount(0);
    await expect(page.getByText('APP-0071')).toHaveCount(0);
  });

  test('the adverse action register matches the denials the API reports', async ({
    signedInPage: page,
  }) => {
    await page.goto('/fair-lending');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const res = await fetch(`${API}/fair-lending/adverse-action?year=${YEAR}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const rows = ((await res.json()) as { data: { applicationId: string | null }[] }).data;
    expect(rows.length, 'the seed records denials for this year').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Adverse Action Register' }).click();

    for (const row of rows) {
      if (row.applicationId !== null) {
        await expect(page.getByText(row.applicationId).first()).toBeVisible({ timeout: 30000 });
      }
    }

    // Notice delivery is recorded nowhere, so the register has no column for
    // it. Asserted on the column headers rather than on the page text, since
    // the page explains in prose why the old delivery flag is gone.
    await expect(page.getByRole('columnheader', { name: /deliver/i })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /notice/i })).toHaveCount(0);
  });

  test('the obligations list makes no claim that a control is in place', async ({
    signedInPage: page,
  }) => {
    await page.goto('/fair-lending');
    await page.getByRole('button', { name: 'Section 1071 Obligations' }).click();

    await expect(page.getByText('Firewall demographic data from underwriting')).toBeVisible();

    // It used to mark the Regulation B firewall and the adverse action notice
    // templates "complete" — an attestation with no evidence behind it.
    await expect(
      page.getByText('Firewall: loan officers cannot access demographic data'),
    ).toHaveCount(0);
    await expect(page.getByText('no status against any item', { exact: false })).toBeVisible();
  });

  test('the dashboard and the coverage check agree on the year', async ({ signedInPage: page }) => {
    await page.goto('/fair-lending');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const headers = { Authorization: `Bearer ${token}` };

    const data = await dashboard(token, YEAR);
    const cov = await fetch(`${API}/fair-lending/coverage?year=${YEAR}`, { headers })
      .then((r) => r.json())
      .then((b) => (b as { data: { applicationCount: number } }).data);

    // The dashboard windowed on createdAt and the adverse action report on
    // actionDate, so one reporting year produced two different totals.
    expect(cov.applicationCount).toBe(data.totalApplications);
  });

  test('a year with nothing recorded shows no rates rather than zeroes', async ({
    signedInPage: page,
  }) => {
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token')).catch(() => null);
    await page.goto('/fair-lending');
    const tok = token ?? (await page.evaluate(() => localStorage.getItem('cf_access_token')));

    // Two years back carries no seeded decisions.
    const empty = YEAR - 2;
    const data = await dashboard(tok, empty);
    expect(data.totalApplications, 'this year is expected to be empty').toBe(0);

    await page.getByLabel('Reporting year').selectOption(String(empty));

    await expect(
      page.getByText(`No covered applications recorded for ${empty}.`),
    ).toBeVisible({ timeout: 30000 });

    // "0% approved" on a fair lending surface reads as a finding, so the rate
    // cards are not rendered at all rather than rendered as zero.
    await expect(page.getByText('Covered applications', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Approved', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Denied', { exact: true })).toHaveCount(0);
  });
});
