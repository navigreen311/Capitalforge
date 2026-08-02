// ============================================================
// The compliance-extended fixture endpoints are gone
//
// compliance-extended.routes.ts served six datasets of invented records
// under /api/compliance/*, mounted and reachable by any authenticated
// caller of any tenant. The worst was a communication log:
//
//   cl_004  call   Summit Capital Group   "Cold outreach call — discussed
//                                          MCA options"
//                                          flags: banned_claim, no_consent
//   cl_008  email  Summit Capital Group   'Used phrase "guaranteed
//                                          approval" in marketing email'
//                                          flags: banned_claim
//
// Compliance violations attributed to advisor calls that never happened,
// with a consent audit beside it granting and revoking permission for
// businesses that do not exist.
//
// No page called any of it — each subject has a real endpoint, and the
// pages were pointed at those. So the file is deleted rather than rewritten.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

/** Every route the deleted file served. */
const GONE = [
  '/compliance/regulatory',
  '/compliance/comm-compliance/log',
  '/compliance/comm-compliance/consent-audit',
  '/compliance/training/modules',
  '/compliance/decisions',
  '/compliance/decisions/dec_001',
];

/** The real endpoint for each subject it covered. */
const REAL = [
  '/regulatory/alerts?limit=5',
  '/training/tracks',
  '/training/certifications',
];

test.describe('Compliance-extended fixtures', () => {
  test('none of the fixture routes answer any more', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    for (const path of GONE) {
      const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status, `${path} must not answer`).toBe(404);
    }
  });

  test('the invented records are not served from anywhere', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    for (const path of [...GONE, ...REAL]) {
      const raw = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${t}` },
      }).then((r) => r.text());

      for (const invented of [
        'Summit Capital Group',
        'Blue Ridge Consulting',
        'Crestline Medical',
        'Pinnacle Logistics',
        'cl_004',
        'banned_claim',
      ]) {
        expect(raw, `${invented} must not appear from ${path}`).not.toContain(invented);
      }
    }
  });

  test('the subjects it covered still have real endpoints', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // Deleting the fixtures must not have removed the only source for any of
    // these — the pages read them.
    for (const path of REAL) {
      const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status, `${path} must still answer`).toBe(200);
    }
  });

  test('the compliance pages still load their data', async ({ signedInPage: page }) => {
    for (const [route, heading] of [
      ['/compliance/regulatory', /Regulatory/],
      ['/compliance/decisions', /Decision/],
      ['/compliance/training', /Training/],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 30000,
      });
    }
  });
});
