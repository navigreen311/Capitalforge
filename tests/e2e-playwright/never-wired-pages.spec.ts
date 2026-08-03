// ============================================================
// The pages that had never been wired
//
// Nine of them rendered literals and called nothing. Five had a populated
// endpoint behind them; three had no data source at all and now say so;
// /clients/new turned out to be a real intake wizard whose constants are
// form options and TCPA disclosure text, and is untouched.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

const WIRED: [string, RegExp, string][] = [
  ['/issuers', /Issuers/, '/issuers'],
  ['/partners', /Partners/, '/partners'],
  ['/ai-governance', /AI Governance/, '/ai-governance/decisions?limit=5'],
  ['/workflows', /Workflows/, '/platform/workflows'],
  ['/platform/voiceforge', /VoiceForge/, '/voiceforge/calls'],
];

const REFUSED: [string, RegExp][] = [
  ['/referrals', /Referrals/],
  ['/platform/visionaudioforge', /VisionAudioForge/],
  ['/sandbox', /Sandbox/],
];

test.describe('Never-wired pages', () => {
  for (const [route, heading, endpoint] of WIRED) {
    test(`${route} reads ${endpoint}`, async ({ signedInPage: page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 30000,
      });

      const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));
      const res = await fetch(`${API}${endpoint}`, { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status, `${endpoint} must answer`).toBe(200);
    });
  }

  for (const [route, heading] of REFUSED) {
    test(`${route} says it is not implemented`, async ({ signedInPage: page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByRole('heading', { name: 'Not implemented' })).toBeVisible();
    });
  }

  test('/documents shows what the vault holds for a client', async ({ signedInPage: page }) => {
    await page.goto('/documents');
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible({ timeout: 30000 });

    const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const businessId = await fetch(`${API}/clients?limit=1`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { id: string }[] }).data[0]?.id);

    const res = await fetch(`${API}/businesses/${businessId}/documents`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(res.status).toBe(200);

    const docs = (await res.json()) as { data: { documents: { title: string }[] } };
    for (const d of docs.data.documents.slice(0, 2)) {
      await expect(page.getByText(d.title).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('none of them render their literals', async ({ signedInPage: page }) => {
    const checks: [string, string[]][] = [
      ['/issuers', ['Thornwood']],
      ['/partners', ['FastFund']],
      ['/workflows', ['pwf_001']],
      ['/documents', ['Dossier']],
    ];

    for (const [route, invented] of checks) {
      await page.goto(route);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      for (const text of invented) {
        await expect(page.getByText(text, { exact: false }), `${text} on ${route}`).toHaveCount(0);
      }
    }
  });
});
