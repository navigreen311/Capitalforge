// ============================================================
// No invented case law leaves the API
//
// Three places asserted enforcement history that could not be verified:
//
//   comm-compliance.service   eight enforcementExample strings, e.g. "FTC v.
//                             Pinnacle Business Capital (2021): $5M penalty
//                             for guaranteed approval claims"
//   training.service          six enforcement cases with parties, agencies,
//                             penalties, findings and docket-style refs like
//                             FTC-X-2021-0041
//   compliance.service        three vendors with invented FTC/CFPB/State-AG
//                             actions, whose docket numbers became the
//                             legalCitation on persisted compliance findings
//
// Pinnacle Business Capital is also the name of an explicitly stubbed vendor
// in this codebase, which is where the respondent most likely came from.
//
// The statutes stay — FTC Act § 5 and Dodd-Frank § 1031 are real, checkable
// and are what the rules actually rest on.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

/** Names and references that were invented. None may appear in a response. */
const INVENTED = [
  'Pinnacle Business Capital',
  'Credit Secrets',
  'Business Advisors Inc',
  'Consumer Assistance Services',
  'FTC-X-2021-0041',
  'CFPB-2020-0012',
  'CFPB-SUP-2022-H',
  'FTC-BUS-2019-ADV',
  'FTC-CRD-2020-SEC',
  'CFPB-ENF-2021-URG',
  'CA-AG-2021-1192',
];

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

test.describe('Enforcement citations', () => {
  test('the vendor history endpoint reports unscreened, not clean', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const t = await token(page);

    for (const vendorId of ['vendor-critical-001', 'vendor-high-risk-001', 'anything-at-all']) {
      const res = await fetch(`${API}/compliance/vendor-history/${vendorId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        data: {
          enforcementActions: unknown[];
          riskLevel: string | null;
          screened: boolean;
          isStubData: boolean;
        };
      };

      expect(data.data.enforcementActions).toHaveLength(0);
      expect(data.data.screened).toBe(false);
      // Was 'low' for anything outside the invented table, and 'critical'
      // for vendor-critical-001.
      expect(data.data.riskLevel).toBeNull();
      expect(data.data.isStubData).toBe(true);
    }
  });

  test('a vendor compliance check does not come back low risk', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const t = await token(page);

    const businesses = await fetch(`${API}/compliance/disclosures`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { businesses: { businessId: string }[] } }).data.businesses);
    expect(businesses.length).toBeGreaterThan(0);

    // POST /api/businesses/:id/compliance/check — the router mounts at '/',
    // so this is the path, not /api/compliance/check.
    const res = await fetch(
      `${API}/businesses/${businesses[0].businessId}/compliance/check`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkType: 'vendor', vendorId: 'vendor-critical-001' }),
      },
    );
    expect(res.status, 'the check must run').toBeLessThan(300);

    const body = (await res.json()) as {
      data: {
        riskLevel: string;
        findings: { category: string; description: string; legalCitation?: string }[];
      };
    };

    // Was 'critical', from an invented FTC penalty against a vendor nobody
    // screened. An unscreened vendor is not low risk either.
    expect(body.data.riskLevel).toBe('unknown');
    expect(body.data.findings.some((f) => f.category === 'vendor.not_screened')).toBe(true);

    const raw = JSON.stringify(body);
    // The finding's legalCitation used to be `Docket: FTC-X-2021-0041`, and
    // the whole check was persisted to compliance_checks carrying it.
    expect(raw).not.toContain('Docket:');
    for (const invented of INVENTED) expect(raw).not.toContain(invented);
  });

  test('the training catalogue carries lessons and statutes, not cases', async ({
    signedInPage: page,
  }) => {
    await page.goto('/training');
    const t = await token(page);

    const res = await fetch(`${API}/training/tracks`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(res.status).toBe(200);
    const raw = JSON.stringify(await res.json());

    for (const invented of INVENTED) {
      expect(raw, `${invented} must not be published`).not.toContain(invented);
    }
    // The lessons themselves survive — they never depended on the cases.
    expect(raw).toContain('guaranteed approval');
  });

  test('a scan cites the statute and no enforcement example', async ({ signedInPage: page }) => {
    await page.goto('/comm-compliance');
    const t = await token(page);

    const me = await page.evaluate(() => localStorage.getItem('cf_user'));
    const advisorId = (JSON.parse(me ?? '{}') as { id?: string }).id;

    const res = await fetch(`${API}/comm-compliance/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advisorId,
        channel: 'email',
        content: 'We offer guaranteed approval for every business owner.',
      }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { violations: { legalCitation: string; enforcementExample?: string }[] };
    };
    expect(body.data.violations.length).toBeGreaterThan(0);

    for (const v of body.data.violations) {
      // The statute stays. It is real and it is what the rule rests on.
      expect(v.legalCitation).toMatch(/FTC Act|Dodd-Frank|Reg |§/);
      expect(v.enforcementExample).toBeUndefined();
    }

    const raw = JSON.stringify(body);
    for (const invented of INVENTED) expect(raw).not.toContain(invented);
  });
});
