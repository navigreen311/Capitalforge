// ============================================================
// The last two surfaces that reported things nobody had
//
// POST /api/platform/integrations/:id/connect answered 200 with "Integration
// <id> connected successfully" after writing a status into a module-level
// object. No credentials were exchanged and no provider was contacted — any
// id at all came back connected, the record was gone at the next restart,
// and a second worker would have told the same operator it was not
// connected. There is no integration table anywhere in the schema.
//
// GET /api/platform/portfolio/benchmarks served two quarters as literals,
// and the tenant's own results were among them: avgCreditScore 718,
// approvalRate 72.1, delinquencyRate 1.8. They sat beside nested industry
// figures the portfolio beat on every axis — 705, 64.0, 3.2. None of it came
// from this tenant's data. It is the page somebody reads to decide whether
// their book is performing.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function auth(page: import('@playwright/test').Page): Promise<string> {
  const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));
  return `Bearer ${t}`;
}

test.describe('Platform integrations', () => {
  test('connecting is refused rather than reported successful', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');

    const res = await fetch(`${API}/platform/integrations/plaid/connect`, {
      method: 'POST',
      headers: { Authorization: await auth(page), 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/No credentials are exchanged/);
  });

  test('testing a connection is refused for the same reason', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');

    // This used to require connect to have been called first, then read a
    // memory flag and call that a connection test.
    const res = await fetch(`${API}/platform/integrations/plaid/test`, {
      method: 'POST',
      headers: { Authorization: await auth(page), 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(501);
  });

  test('connecting twice does not accumulate state', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const a = await auth(page);

    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${API}/platform/integrations/quickbooks/connect`, {
        method: 'POST',
        headers: { Authorization: a, 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(501);
    }
  });
});

test.describe('Integration layer', () => {
  // The layer under /api/integrations kept its connections in a Map, so
  // connecting Plaid built an access token of the form
  // plaid_access_stub_<uuid>, called it connected, and a sync reported 150
  // transactions it had never fetched. Nothing contacted any provider, and no
  // table records an integration connection.

  test('connecting a provider is refused, not faked', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');

    const res = await fetch(`${API}/integrations/plaid/connect`, {
      method: 'POST',
      headers: { Authorization: await auth(page), 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicToken: 'public-token-test' }),
    });

    // 501 rather than 500: nothing broke, the operation does not exist.
    expect(res.status).toBe(501);
    // This router's error helper puts the message directly on `error`, not
    // nested under `error.message` like the platform routes above.
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Nothing in this system contacts the provider/);
  });

  test('the connection list is empty rather than worker-local', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const a = await auth(page);

    await fetch(`${API}/integrations/plaid/connect`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicToken: 'public-token-test' }),
    });

    // It used to list whatever this worker had faked since it started.
    const body = (await fetch(`${API}/integrations`, { headers: { Authorization: a } }).then(
      expectOk,
    )) as { data: unknown[] };

    expect(body.data).toEqual([]);
  });
});

test.describe('Portfolio benchmarks', () => {
  test('reports this tenant figures, not the invented ones', async ({ signedInPage: page }) => {
    await page.goto('/portfolio');

    const body = (await fetch(`${API}/platform/portfolio/benchmarks?quarter=2026-Q1`, {
      headers: { Authorization: await auth(page) },
    }).then(expectOk)) as {
      data: {
        avgCreditScore: number | null;
        approvalRate: number | null;
        delinquencyRate: number | null;
        basedOn: { decidedApplications: number; creditPulls: number };
      };
    };

    // The literals it used to serve for every tenant.
    expect(body.data.avgCreditScore).not.toBe(718);
    expect(body.data.approvalRate).not.toBe(72.1);

    // Nothing records a delinquency against a card, so this cannot be a
    // number. It was 1.8, which reads as measured.
    expect(body.data.delinquencyRate).toBeNull();

    // Sample sizes, so an approval rate over three applications is not read
    // the same way as one over three hundred.
    expect(typeof body.data.basedOn.decidedApplications).toBe('number');
    expect(typeof body.data.basedOn.creditPulls).toBe('number');
  });

  test('states no figure for a quarter with nothing in it', async ({ signedInPage: page }) => {
    await page.goto('/portfolio');

    // A quarter long before anything was seeded: every figure is unknown, and
    // a zero would be a claim — an approval rate of 0% says every application
    // was declined.
    const body = (await fetch(`${API}/platform/portfolio/benchmarks?quarter=2020-Q1`, {
      headers: { Authorization: await auth(page) },
    }).then(expectOk)) as {
      data: { avgCreditScore: number | null; approvalRate: number | null; avgCreditLimit: number | null };
    };

    expect(body.data.avgCreditScore).toBeNull();
    expect(body.data.approvalRate).toBeNull();
    expect(body.data.avgCreditLimit).toBeNull();
  });

  test('keeps industry reference figures, and says they are reference', async ({
    signedInPage: page,
  }) => {
    await page.goto('/portfolio');

    const body = (await fetch(`${API}/platform/portfolio/benchmarks?quarter=2026-Q1`, {
      headers: { Authorization: await auth(page) },
    }).then(expectOk)) as {
      data: { industryBenchmarks: { avgCreditScore: number; source: string } | null };
    };

    // Published market figures are legitimate hardcoded reference, the same
    // as the Net-30 vendor terms on /credit-builder. What was missing was
    // saying so.
    expect(body.data.industryBenchmarks?.avgCreditScore).toBe(705);
    expect(body.data.industryBenchmarks?.source).toMatch(/reference data, not measured here/);
  });

  test('rejects a quarter that is not one', async ({ signedInPage: page }) => {
    await page.goto('/portfolio');

    const res = await fetch(`${API}/platform/portfolio/benchmarks?quarter=not-a-quarter`, {
      headers: { Authorization: await auth(page) },
    });
    expect(res.status).toBe(400);
  });
});
