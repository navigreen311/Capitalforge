// ============================================================
// /financial-control/hardship and /financial-control/tax
//
// Both pages called no API. The hardship page held two clients in workout —
// Carlos Mendez of Mendez Trucking LLC, $84,500, 3 missed payments, 92%
// utilisation, advisor Sarah Mitchell — and generated a workout proposal
// addressed to the client from multipliers of that invented balance: a
// settlement at 55% of it, a rate cut to 9.99%, waived late fees, signed by
// a "Hardship Resolution Team" and valid for 30 days.
//
// The tax page listed 1099s for "Acme Holdings LLC", EIN 12-3456789, marked
// generated, with file sizes and download buttons, for forms nothing
// produces.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

test.describe('Financial control', () => {
  test('hardship shows the cases the API returns', async ({ signedInPage: page }) => {
    await page.goto('/financial-control/hardship');
    await expect(page.getByRole('heading', { name: 'Hardship' })).toBeVisible({ timeout: 30000 });

    const t = await token(page);
    const cases = await fetch(`${API}/financial/hardship-cases`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { id: string; businessName: string | null }[] }).data);

    // Open one so the page has something real to show, then read it back.
    const businesses = await fetch(`${API}/compliance/disclosures`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { businesses: { businessId: string }[] } }).data.businesses);

    if (cases.length === 0) {
      const created = await fetch(`${API}/financial/hardship-cases`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: businesses[0].businessId,
          missedPaymentCount: 3,
          currentUtilization: 0.95,
          totalBalance: 50_000,
          monthlyRevenue: 20_000,
        }),
      });
      expect(created.status).toBe(201);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Hardship' })).toBeVisible({
        timeout: 30000,
      });
    }

    const after = await fetch(`${API}/financial/hardship-cases`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { businessName: string | null }[] }).data);
    expect(after.length).toBeGreaterThan(0);

    const named = after.find((c) => c.businessName !== null);
    if (named) {
      await expect(page.getByText(named.businessName!).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('hardship renders none of the clients or the workout letter', async ({
    signedInPage: page,
  }) => {
    await page.goto('/financial-control/hardship');
    await expect(page.getByRole('heading', { name: 'Hardship' })).toBeVisible({ timeout: 30000 });

    for (const invented of [
      'Carlos Mendez',
      'Mendez Trucking',
      'James Thornton',
      'Thornton Construction',
      'Sarah Mitchell',
      'David Park',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }

    // The letter body, and the call script that went with it. Not the
    // phrases the page's own note quotes back — "Hardship Resolution Team"
    // appears there deliberately, describing what was removed.
    // getByText is case-insensitive, so "WORKOUT PROPOSAL" would match the
    // page's own note about the workout proposal it no longer generates.
    // These are lines only the letter itself carried.
    for (const phrase of [
      'PROPOSED TERMS',
      'Interest Rate Reduction',
      'Late Fee Waiver',
      'Initiate Call',
      'Dear ',
    ]) {
      await expect(page.getByText(phrase)).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: /proposal|settlement|initiate/i })).toHaveCount(
      0,
    );
  });

  test('hardship says why it makes no offer', async ({ signedInPage: page }) => {
    await page.goto('/financial-control/hardship');
    await expect(
      page.getByRole('heading', { name: 'No offer is produced here' }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('a settlement at 55% of', { exact: false })).toBeVisible();
    await expect(
      page.getByText('It holds no outstanding balance', { exact: false }),
    ).toBeVisible();
  });

  test('tax reports that nothing is generated', async ({ signedInPage: page }) => {
    await page.goto('/financial-control/tax');
    await expect(
      page.getByRole('heading', { name: 'No tax document is produced by this system' }),
    ).toBeVisible({ timeout: 30000 });

    const t = await token(page);
    const body = (await fetch(`${API}/financial/tax-documents`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then(expectOk)) as { data: { documents: unknown[]; generated: boolean } };
    expect(body.data.documents).toEqual([]);
    expect(body.data.generated).toBe(false);
  });

  test('tax renders none of the forms that were listed', async ({ signedInPage: page }) => {
    await page.goto('/financial-control/tax');
    await expect(page.getByRole('heading', { name: 'Tax Documents' })).toBeVisible({
      timeout: 30000,
    });

    // Values only the document rows carried. The page's note names the
    // client, the EIN and the form types deliberately, describing what it
    // used to claim was generated — and getByText matches case-insensitively,
    // so asserting on those would match the note.
    for (const invented of ['48 KB', '124 KB', '36 KB', 'td_001']) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
    // No download, and no bulk export of documents that do not exist.
    await expect(page.getByRole('button', { name: /download|export|generate/i })).toHaveCount(0);
  });
});
