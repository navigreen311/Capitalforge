// ============================================================
// /compliance/disclosures — no filing status is claimed
//
// The page listed ten filings against named businesses with deadlines and
// statuses — two Filed with dates and confirmation references, three
// Overdue. Filing one set the row to Filed in the browser and minted a
// confirmation reference with Math.random(), plus a link to a PDF nothing
// generates; a bulk action did that for every pending row and finished with
// "10 disclosures filed successfully". The endpoint answered 200 with a
// filing date and wrote nothing, and served the same six invented rows to
// every tenant.
//
// The dashboard section made the same claim from the other side: a deadline
// per client derived from a hash of the client id, marked filed when that
// hash was divisible by four.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Inventory {
  businesses: { businessId: string; businessName: string; stateOfFormation: string | null }[];
  obligations: unknown[];
  obligationRegister: { exists: boolean; why: string };
  filingRecord: { exists: boolean; why: string };
}

async function inventory(token: string | null): Promise<Inventory> {
  const res = await fetch(`${API}/compliance/disclosures`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/api/compliance/disclosures must be reachable').toBe(200);
  return ((await res.json()) as { data: Inventory }).data;
}

test.describe('State disclosures', () => {
  test('the endpoint reports no obligation register and no filing record', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const data = await inventory(token);

    expect(data.obligationRegister.exists).toBe(false);
    expect(data.filingRecord.exists).toBe(false);
    expect(data.obligations).toEqual([]);

    // Nothing in the payload carries a status or a deadline.
    const raw = JSON.stringify(data);
    for (const claim of ['Pending', 'Overdue', 'Filed', 'deadline', 'filedAt', 'confirmationRef']) {
      expect(raw, `${claim} must not appear`).not.toContain(claim);
    }
  });

  test('the businesses it lists are this tenant’s real ones', async ({ signedInPage: page }) => {
    await page.goto('/compliance/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const data = await inventory(token);

    expect(data.businesses.length, 'the seed records businesses').toBeGreaterThan(0);

    await expect(page.getByRole('table')).toBeVisible({ timeout: 30000 });

    for (const b of data.businesses.slice(0, 3)) {
      const res = await fetch(`${API}/businesses/${b.businessId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status, `${b.businessId} must exist`).toBe(200);
      const fetched = (await res.json()) as { data: { business: { legalName: string } } };
      expect(fetched.data.business.legalName).toBe(b.businessName);

      await expect(page.getByText(b.businessName).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the filings that were invented', async ({ signedInPage: page }) => {
    await page.goto('/compliance/disclosures');
    // The body is behind the loaded state, so wait for it before asserting
    // that something is absent — otherwise absence is just "still loading".
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30000 });

    for (const invented of [
      'Apex Ventures LLC',
      'NovaTech Solutions Inc.',
      'Horizon Retail Partners',
      'Summit Capital Group',
      'Blue Ridge Consulting',
      'Crestline Medical LLC',
      'CF-2026-IL-0042',
      'HB 1442 Business Lending Transparency',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }

    // And no status chips anywhere on the page.
    const table = page.getByRole('table');
    for (const status of ['Overdue', 'Filed', 'Pending']) {
      await expect(table.getByText(status, { exact: true })).toHaveCount(0);
    }
  });

  test('offers no way to file, and the endpoint refuses', async ({ signedInPage: page }) => {
    await page.goto('/compliance/disclosures');
    await expect(
      page.getByText('Not offered here, individually or in bulk', { exact: false }),
    ).toBeVisible({ timeout: 30000 });

    // "File", "File Now", "File Selected (10)" and the bulk progress bar.
    await expect(page.getByRole('button', { name: /file/i })).toHaveCount(0);

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const res = await fetch(`${API}/compliance/disclosures/dis_001/file`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(501);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_IMPLEMENTED');
  });

  test('says why it cannot report a filing position', async ({ signedInPage: page }) => {
    await page.goto('/compliance/disclosures');

    await expect(
      page.getByRole('heading', { name: 'This page cannot tell you whether you have filed' }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('No obligation register', { exact: false })).toBeVisible();
    await expect(page.getByText('No filing record', { exact: false })).toBeVisible();

    // State of formation is offered as an inventory, not a determination.
    await expect(
      page.getByText('not a determination of which disclosure law applies', { exact: false }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('the dashboard section no longer generates deadlines', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const res = await fetch(`${API}/v1/dashboard/compliance-deadlines`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      data: { tracked: boolean; deadlines: unknown[]; clients: number; all_clear?: boolean };
    };
    expect(data.data.tracked).toBe(false);
    expect(data.data.deadlines).toEqual([]);
    // all_clear was true whenever the hash came up filed for every row.
    expect(data.data.all_clear).toBeUndefined();
    expect(data.data.clients).toBeGreaterThan(0);

    await expect(page.getByText('Not tracked.', { exact: false })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('link', { name: 'File Disclosure' })).toHaveCount(0);
  });
});
