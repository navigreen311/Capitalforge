// ============================================================
// /compliance/decisions — the register reads the database
//
// The page held six decisions as literals, each with a named advisor, the
// factors behind it, and — on the declines — an adverse action notice with a
// status of 'sent' and a delivery date. That is the ECOA §1002.9 record, and
// nothing in this system holds it.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Application {
  id: string;
  businessName: string;
  status: string;
  declineReason: string | null;
  decidedAt: string | null;
}

async function decided(token: string | null): Promise<Application[]> {
  const res = await fetch(`${API}/applications?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  const rows = ((await res.json()) as { data: Application[] }).data;
  return rows.filter((r) => r.status === 'approved' || r.status === 'declined');
}

const YEAR = new Date().getFullYear();

test.describe('Application decision register', () => {
  test('shows the decided applications the API returns', async ({ signedInPage: page }) => {
    await page.goto('/compliance/decisions');
    await expect(page.getByRole('heading', { name: 'Application Decisions' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decided(token);
    expect(rows.length, 'the seed records decided applications').toBeGreaterThan(0);

    await expect(
      page.getByText('Decisions', { exact: true }).locator('..').getByText(String(rows.length), {
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });

    for (const row of rows.slice(0, 3)) {
      await expect(page.getByText(row.id).first()).toBeVisible();
    }
  });

  test('lists only applications that have been decided', async ({ signedInPage: page }) => {
    await page.goto('/compliance/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const all = await fetch(`${API}/applications?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: Application[] }).data);

    const undecided = all.filter((r) => r.status !== 'approved' && r.status !== 'declined');
    expect(undecided.length, 'the seed has an application still in flight').toBeGreaterThan(0);

    // A decision register listing applications still in flight overstates how
    // much has been decided.
    for (const row of undecided) {
      await expect(page.getByText(row.id)).toHaveCount(0);
    }
  });

  test('does not render the decisions that used to be hardcoded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/decisions');
    await expect(page.getByRole('heading', { name: 'Application Decisions' })).toBeVisible();

    for (const invented of [
      'APP-2026-0142',
      'QuickStart Ventures',
      'Harbor Marine Supply',
      'Sarah Chen',
      'Marcus Johnson',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('claims no adverse action notice was sent', async ({ signedInPage: page }) => {
    await page.goto('/compliance/decisions');
    await expect(page.getByRole('heading', { name: 'Application Decisions' })).toBeVisible();

    // The declines carried the notice text, a status of "sent" and a delivery
    // date. Nothing records any of it.
    await expect(page.getByRole('columnheader', { name: /adverse|notice/i })).toHaveCount(0);
    await expect(page.getByText('has been declined based on the following factors')).toHaveCount(0);
    await expect(
      page.getByText('Nothing in this system records the notice', { exact: false }),
    ).toBeVisible();
  });

  test('shows the recorded decline reason, and says when none is recorded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decided(token);

    const withReason = rows.find((r) => r.status === 'declined' && r.declineReason !== null);
    expect(withReason, 'the seed records a decline reason').toBeTruthy();

    await page.getByText(withReason!.id).first().click();
    await expect(page.getByText(withReason!.declineReason as string).first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('cross-references each decline against the 1071 register', async ({ signedInPage: page }) => {
    await page.goto('/compliance/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const register = await fetch(`${API}/fair-lending/adverse-action?year=${YEAR}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { applicationId: string }[] }).data);

    const onRegister = new Set(register.map((r) => r.applicationId));
    const rows = await decided(token);
    const declines = rows.filter((r) => r.status === 'declined');
    expect(declines.length).toBeGreaterThan(0);

    // Every decline the register knows about reads Yes. The join is the point
    // of this page: a decline missing from the register is a finding.
    const covered = declines.filter((d) => onRegister.has(d.id));
    expect(covered.length, 'the seed puts its declines on the register').toBeGreaterThan(0);

    await expect(page.getByRole('columnheader', { name: 'On 1071 register' })).toBeVisible();
    await expect(page.getByText('Yes', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  });

  test('flags a decline the register has no record of', async ({ signedInPage: page }) => {
    await page.goto('/compliance/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const register = await fetch(`${API}/fair-lending/adverse-action?year=${YEAR}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { applicationId: string }[] }).data);
    const onRegister = new Set(register.map((r) => r.applicationId));

    const rows = await decided(token);
    const gap = rows.find((r) => r.status === 'declined' && !onRegister.has(r.id));
    expect(
      gap,
      'the seed carries a decline that is deliberately off the 1071 register',
    ).toBeTruthy();

    // The finding this page exists to surface: a credit decision that was
    // made and never recorded where Section 1071 requires it.
    const row = page.getByText(gap!.id).first().locator('xpath=ancestor::tr[1]');
    await expect(row.getByText('Not recorded')).toBeVisible({ timeout: 30000 });

    await page.getByText(gap!.id).first().click();
    await expect(
      page.getByText('does not appear on the Section 1071 register', { exact: false }),
    ).toBeVisible();
  });

  test('counts the declines needing attention', async ({ signedInPage: page }) => {
    await page.goto('/compliance/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const register = await fetch(`${API}/fair-lending/adverse-action?year=${YEAR}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { applicationId: string }[] }).data);
    const onRegister = new Set(register.map((r) => r.applicationId));

    const rows = await decided(token);
    const expected = rows.filter(
      (r) => r.status === 'declined' && (r.declineReason === null || !onRegister.has(r.id)),
    ).length;
    expect(expected).toBeGreaterThan(0);

    // The figure appears twice, correctly: on the KPI card and on the filter
    // badge. The card is the first.
    //
    // Scoped to main: the notification panel sits in the DOM of every page
    // and its heading matched this text, so an unscoped locator found the
    // overlay instead of the card.
    await expect(
      page
        .getByRole('main')
        .getByText('Needs attention')
        .first()
        .locator('..')
        .getByText(String(expected), { exact: true })
        .first(),
    ).toBeVisible({ timeout: 30000 });

    // And the filter shows exactly those.
    await page.getByRole('button', { name: /^Needs attention/ }).click();
    await expect(page.getByText(`${expected} of ${rows.length}`)).toBeVisible();
  });

  test('lists no decision factors', async ({ signedInPage: page }) => {
    await page.goto('/compliance/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decided(token);

    await page.getByText(rows[0].id).first().click();

    // "Credit Score: 780", "PAYDEX: 82", "Annual Revenue: $2.4M" were the
    // stated basis of each decision. None is recorded against a decision.
    for (const invented of ['Credit Score: 780', 'PAYDEX: 82', 'Industry Risk: Low']) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
    await expect(page.getByText('No decision factors are listed', { exact: false })).toBeVisible();
  });

  test('does not name an advisor as the decider', async ({ signedInPage: page }) => {
    await page.goto('/compliance/decisions');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await decided(token);

    await page.getByText(rows[0].id).first().click();

    await expect(
      page.getByText('Who made the decision is not recorded', { exact: false }),
    ).toBeVisible({ timeout: 30000 });
  });
});
