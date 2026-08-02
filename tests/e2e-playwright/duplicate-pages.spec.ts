// ============================================================
// The duplicate pages render one implementation
//
// Eight subjects had two pages each. The sidebar linked one, which was
// wired to the API; the other kept its literals and was reachable by URL —
// so the two disagreed about the same client.
//
// That is how /offboarding and /platform/offboarding came to differ over
// whether a client's data had been deleted.
// ============================================================

import { test, expect } from './fixtures';

const PAIRS: [string, string, RegExp][] = [
  ['/tax', '/financial-control/tax', /Tax Documents/],
  ['/hardship', '/financial-control/hardship', /Hardship/],
  ['/crm', '/platform/crm', /CRM/],
  ['/data-lineage', '/platform/data-lineage', /Data Lineage/],
  ['/reports', '/platform/reports', /Reports/],
  ['/simulator', '/financial-control/simulator', /Simulator/],
  ['/contracts', '/compliance/contracts', /Contracts/],
  ['/deal-committee', '/compliance/deal-committee', /Deal Committee/],
];

test.describe('Duplicate pages', () => {
  for (const [short, full, heading] of PAIRS) {
    test(`${short} renders the same page as ${full}`, async ({ signedInPage: page }) => {
      await page.goto(full);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 30000,
      });

      await page.goto(short);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 30000,
      });
    });
  }

  test('the twins carry none of the literals they used to', async ({ signedInPage: page }) => {
    const checks: [string, string[]][] = [
      // Values only the fixtures carried — each page's note names what it
      // removed, and getByText matches case-insensitively.
      ['/tax', ['48 KB', 'td_001']],
      ['/hardship', ['Carlos Mendez', 'Mendez Trucking']],
      ['/crm', ['MRR']],
      ['/deal-committee', ['Sarah Chen', 'Mike Ross', 'Elena Voss']],
      ['/contracts', ['Meridian Capital Group']],
      ['/simulator', ['Marcus Rivera', 'Lisa Chen']],
    ];

    for (const [route, invented] of checks) {
      await page.goto(route);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      for (const text of invented) {
        await expect(page.getByText(text, { exact: false }), `${text} on ${route}`).toHaveCount(0);
      }
    }
  });

  test('the committee queue serves the real handler, not the mock', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const res = await fetch('http://127.0.0.1:4000/api/dashboard/committee-queue', {
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(res.status).toBe(200);

    // A second router mounted at this path served two invented deals with
    // named reviewers and an SLA countdown. It was shadowed by the real
    // handler the whole time, and has been deleted.
    const raw = await res.text();
    for (const invented of ['Apex Ventures', 'Meridian Holdings', 'Sarah Chen', 'Mike Ross']) {
      expect(raw, `${invented} must not be served`).not.toContain(invented);
    }

    // The real handler reads deal_committee_reviews, so an empty queue means
    // no review is open — not that a mock returned nothing.
    const body = JSON.parse(raw) as { data: { deals: { client_name: string }[] } };
    expect(Array.isArray(body.data.deals)).toBe(true);
  });
});
