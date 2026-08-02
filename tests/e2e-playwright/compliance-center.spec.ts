// ============================================================
// /compliance — the firm's regulatory position, from compliance_checks
//
// This page stated a regulated firm's compliance position out of literals.
// Ten findings against businesses that do not exist — "NY disclosure deadline
// missed — immediate filing required" for Apex Ventures LLC, "Affiliated
// vendor on CFPB enforcement watch list" for Blue Ridge Consulting — scored
// into a six-component breakdown, with a top priority telling the operator to
// "File the 2 overdue state disclosures (+10 points)". It wrote all of it to
// disk as a .txt report, and running the checks was a two-second timer that
// invented a count of new issues in the browser.
//
// The endpoints behind it were mock as well: score-breakdown returned four
// fixed rows with reasons like "No deceptive practices found", and
// export-report produced "Overall Compliance Score: 89/100" for every tenant.
//
// The load-bearing case is the empty one: overview returned a score of 100
// for a tenant with no checks on record, which is a clean bill of health
// derived from never having looked.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

test.describe('Compliance center', () => {
  test('does not render the findings that were invented', async ({ signedInPage: page }) => {
    await page.goto('/compliance');
    await expect(page.getByRole('heading', { name: 'Compliance Center' })).toBeVisible();

    // The findings themselves, not the business names: the empty-state text
    // on this page names the businesses it used to show while explaining that
    // they do not exist, and getByText matches substrings.
    for (const invented of [
      'NY disclosure deadline missed',
      'Affiliated vendor on CFPB enforcement watch list',
      'Beneficial ownership docs incomplete',
      'Product terms mismatch with marketing materials',
      'Sanctions screening clear',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('offers no recommended filing', async ({ signedInPage: page }) => {
    await page.goto('/compliance');
    await expect(page.getByRole('heading', { name: 'Compliance Center' })).toBeVisible();

    // These told an operator which regulatory filings to make, with point
    // values, against businesses that do not exist.
    await expect(page.getByText('File the 2 overdue state disclosures')).toHaveCount(0);
    // A heading, not free text: this page's own explanation contains the
    // phrase "quick wins" while saying the section is gone.
    await expect(page.getByRole('heading', { name: /Quick Wins/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Top Priority' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Not shown here' })).toBeVisible();
  });

  test('the score matches the checks on record, and is absent without them', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance');
    const body = (await fetch(`${API}/compliance/overview`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    }).then((r) => r.json())) as { data: { score: number | null; total: number } };

    if (body.data.total === 0) {
      // The case the fix exists for: no checks, so no score.
      expect(body.data.score, 'no checks means no score').toBeNull();
      await expect(
        page.getByText('No checks have run for this tenant, so there is no score'),
      ).toBeVisible({ timeout: 30000 });
      await expect(page.getByLabel('Compliance score not available')).toBeVisible();
    } else {
      expect(typeof body.data.score).toBe('number');
      await expect(page.getByLabel(`Compliance score ${body.data.score}`)).toBeVisible({
        timeout: 30000,
      });
    }
  });

  test('the score breakdown comes from the checks, not from four fixed rows', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance');
    const body = (await fetch(`${API}/compliance/score-breakdown`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    }).then((r) => r.json())) as {
      data: {
        breakdown: { checkType: string; score: number | null; totalChecks: number }[];
        checksHaveRun: boolean;
      };
    };

    // Not "state_law is absent" — that is a real check type the service
    // produces, and asserting it away fails against genuine data.
    //
    // Nor a comparison against the overview's check list: that endpoint
    // truncates to 50 rows while this one reads 500, so a type can legitimately
    // appear here and not there. Comparing two different windows is how the
    // first version of this test failed.
    //
    // The property that actually distinguishes derived rows from a fixed list
    // is that every row counts the checks it came from.
    for (const row of body.data.breakdown) {
      expect(row.totalChecks, `${row.checkType} is in the breakdown`).toBeGreaterThan(0);
    }
    expect(body.data.checksHaveRun).toBe(body.data.breakdown.length > 0);

    // A category nothing has scored reports no score rather than zero.
    for (const row of body.data.breakdown) {
      expect(row.score === null || typeof row.score === 'number').toBe(true);
    }
  });

  test('the exported report is built from the rows', async ({ signedInPage: page }) => {
    await page.goto('/compliance');
    const body = (await fetch(`${API}/compliance/export-report`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token(page)}` },
    }).then((r) => r.json())) as { data: { reportText: string; checkCount: number } };

    const report = body.data.reportText;

    // Everything that used to be in every report, for every tenant.
    expect(report).not.toContain('Overall Compliance Score: 89/100');
    expect(report).not.toContain('CA SB 1235');
    expect(report).not.toContain('Total Checks Run: 42');
    // And no recommendations: what a firm owes a regulator is advice.
    expect(report).not.toContain('Recommendations');
    expect(report).not.toContain('avoid regulatory penalty');

    if (body.data.checkCount === 0) {
      expect(report).toContain('No compliance checks are on record');
      expect(report).toContain('No score is stated');
    } else {
      expect(report).toContain(`Total Checks Run: ${body.data.checkCount}`);
    }
  });

  test('running the checks persists what it finds', async ({ signedInPage: page }) => {
    await page.goto('/compliance');
    const t = await token(page);

    const before = (await fetch(`${API}/compliance/overview`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then((r) => r.json())) as { data: { total: number } };

    const run = await fetch(`${API}/compliance/run-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    });
    expect(run.status).toBe(200);

    const ran = (await run.json()) as { data: { checkCount: number; businessCount: number } };

    const after = (await fetch(`${API}/compliance/overview`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then((r) => r.json())) as { data: { total: number; score: number | null } };

    // The run used to be a timer in the browser that changed nothing.
    //
    // Asserted on what the sweep reports rather than on the overview's total:
    // that endpoint reads with take: 200, so once the table passes 200 rows
    // its count stops rising and cannot witness a write. This assertion used
    // to compare the two totals and passed only while the table was small —
    // it broke the day the rows caught up with it.
    expect(ran.data.checkCount).toBeGreaterThan(0);
    expect(ran.data.businessCount).toBeGreaterThan(0);
    expect(after.data.total).toBeGreaterThanOrEqual(before.data.total);
    // And with checks on record, a score exists.
    expect(after.data.score).not.toBeNull();
  });
});
