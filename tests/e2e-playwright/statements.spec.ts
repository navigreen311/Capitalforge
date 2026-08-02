// ============================================================
// /statements — anomalies come from the detector
//
// The page held 1763 lines of literals, the worst of which asserted detected
// billing anomalies: a duplicate annual fee of $1,390 against an expected
// $695 on an Amex Business Platinum, with the instruction to contact Amex
// commercial servicing for a reversal and escalate within five business
// days. An advisor acting on that calls an issuer about a charge that was
// never made.
//
// The API was half real: the per-business endpoints read statement_records
// and run a real detector, while GET /api/statements returned the same three
// invented statements to everyone, and /statements/:id/line-items returned
// five transactions and a $11.59 reconciliation difference for any id at
// all — including ids that do not exist.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

async function firstBusinessId(t: string | null): Promise<string> {
  const body = (await fetch(`${API}/compliance/disclosures`, {
    headers: { Authorization: `Bearer ${t}` },
  }).then((r) => r.json())) as { data: { businesses: { businessId: string }[] } };
  expect(body.data.businesses.length).toBeGreaterThan(0);
  return body.data.businesses[0].businessId;
}

test.describe('Statements', () => {
  test('the list endpoint reads the table, per client', async ({ signedInPage: page }) => {
    await page.goto('/statements');
    const t = await token(page);
    const businessId = await firstBusinessId(t);

    const res = await fetch(`${API}/statements?client_id=${businessId}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(res.status).toBe(200);

    const raw = await res.text();
    // The three that came back for every client and every tenant.
    for (const invented of [
      'Amex Business Platinum',
      'Chase Sapphire Reserve',
      'Amex Business Gold',
      '12450.32',
      'stmt-001',
    ]) {
      expect(raw, `${invented} must not be served`).not.toContain(invented);
    }

    // A client with nothing imported gets nothing, not three statements.
    const body = JSON.parse(raw) as { data: { statements: unknown[] } };
    expect(Array.isArray(body.data.statements)).toBe(true);
  });

  test('line items are not invented for an id that does not exist', async ({
    signedInPage: page,
  }) => {
    await page.goto('/statements');
    const t = await token(page);

    const res = await fetch(`${API}/statements/no-such-statement/line-items`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    // Was 200 with five transactions and a reconciliation difference.
    expect(res.status).toBe(404);

    const raw = await res.text();
    for (const invented of ['Office Depot', 'Delta Air Lines', 'AWS Cloud Services', '11.59']) {
      expect(raw).not.toContain(invented);
    }
  });

  test('the page renders none of the invented anomalies', async ({ signedInPage: page }) => {
    await page.goto('/statements');
    await expect(page.getByRole('heading', { name: 'Statements' })).toBeVisible({
      timeout: 30000,
    });

    // Values only the fixtures carried. The page's own note quotes the Amex
    // instruction deliberately, and getByText is case-insensitive, so these
    // are figures rather than phrases.
    for (const invented of ['$1,390.00', '$695.00', '$340.00', 'ano_001', 'stmt_002']) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('shows the anomalies the detector produced, and no advice', async ({
    signedInPage: page,
  }) => {
    await page.goto('/statements');
    await expect(page.getByRole('heading', { name: 'Statements' })).toBeVisible({
      timeout: 30000,
    });

    const t = await token(page);
    const businessId = await firstBusinessId(t);

    const res = await fetch(`${API}/businesses/${businessId}/statements/anomalies`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { reports: { anomalies: Record<string, unknown>[] }[]; totalAnomalies: number };
    };

    // Whatever the detector found, none of it carries an instruction.
    for (const report of body.data.reports) {
      for (const anomaly of report.anomalies) {
        expect(anomaly['suggestedAction']).toBeUndefined();
        expect(anomaly['remediation']).toBeUndefined();
      }
    }

    await expect(
      page.getByRole('heading', { name: `Anomalies (${body.data.totalAnomalies})` }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('says what an empty anomaly list means', async ({ signedInPage: page }) => {
    await page.goto('/statements');
    await expect(page.getByRole('heading', { name: 'Statements' })).toBeVisible({
      timeout: 30000,
    });

    const t = await token(page);
    const businessId = await firstBusinessId(t);
    const total = await fetch(`${API}/businesses/${businessId}/statements/anomalies`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { totalAnomalies: number } }).data.totalAnomalies);

    if (total === 0) {
      await expect(
        page.getByText('the result of a check that ran', { exact: false }),
      ).toBeVisible();
    }
    await expect(
      page.getByText('No remediation instruction is shown', { exact: false }),
    ).toBeVisible();
  });
});
