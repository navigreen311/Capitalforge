// ============================================================
// The handlers that invented their answers
//
// A sweep for Math.random() and self-declared "mock" in the backend found
// several endpoints reporting work they had not done:
//
//   POST /api/compliance/run-checks       new_issues from Math.random() * 5,
//                                         resolved from * 3, total_checked
//                                         from 25 + up to 20, status
//                                         "completed", six check types named,
//                                         nothing run and nothing written
//   GET  /api/v1/dashboard/kpi-summary    every sparkline a random walk from
//                                         60% of the current value, noise
//                                         biased upward so lines tended to
//                                         climb
//   GET  /api/billing/invoices/:id/pdf    a fabricated invoice for any id:
//                                         fixed address, four invented line
//                                         items, $4,549.00 total
//   POST /api/billing/invoices/:id/void   wrote to a module-level object; the
//   POST /api/billing/invoices/:id/unpay  row kept its status either way
//   POST /api/platform/billing/send-overdue-reminders
//                                         "Sent N reminders" with N random
//                                         and nothing sent
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function auth(page: import('@playwright/test').Page): Promise<string> {
  const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));
  return `Bearer ${t}`;
}

test.describe('Compliance sweep', () => {
  test('run-checks reports what it actually ran', async ({ signedInPage: page }) => {
    await page.goto('/compliance');
    const a = await auth(page);

    const run = async () =>
      (await fetch(`${API}/compliance/run-checks`, {
        method: 'POST',
        headers: { Authorization: a, 'Content-Type': 'application/json' },
      }).then(expectOk)) as {
        data: {
          new_issues: number;
          resolved: number | null;
          total_checked: number;
          checks_run: number;
          businesses_checked: number;
          check_types: string[];
        };
      };

    const first = await run();
    const second = await run();

    // Deterministic: businesses times check types. The old handler answered
    // with Math.random() * 5 new issues and 25 + up to 20 checked, so two runs
    // agreeing on anything was chance.
    expect(first.data.checks_run).toBeGreaterThan(0);
    expect(second.data.checks_run).toBe(first.data.checks_run);
    expect(second.data.businesses_checked).toBe(first.data.businesses_checked);

    // Every check that ran wrote a row. Deliberately not compared against
    // /compliance/overview: that endpoint reads with take: 200, so its total
    // stops rising once there are more checks than that, and it cannot
    // witness a write at all past that point.
    expect(first.data.total_checked).toBe(first.data.checks_run);
    expect(second.data.total_checked).toBe(second.data.checks_run);

    // Nothing marks an earlier check resolved, so there is no count to give.
    expect(first.data.resolved).toBeNull();

    // It used to name six types regardless of what ran.
    expect(first.data.check_types.length).toBeGreaterThan(0);
    expect(first.data.check_types.length).toBeLessThanOrEqual(6);
    expect(second.data.check_types).toEqual(first.data.check_types);
  });
});

test.describe('Dashboard sparklines', () => {
  test('are the same on two consecutive reads', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const a = await auth(page);

    const read = async () =>
      (await fetch(`${API}/v1/dashboard/kpi-summary`, { headers: { Authorization: a } }).then(expectOk)) as { data: { sparklines: Record<string, number[] | null> } };

    const first = await read();
    const second = await read();

    // A random walk redrew every point on every request.
    expect(second.data.sparklines).toEqual(first.data.sparklines);
  });

  test('states no history for a metric that has none', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const a = await auth(page);

    const body = (await fetch(`${API}/v1/dashboard/kpi-summary`, { headers: { Authorization: a } }).then(expectOk)) as { data: { sparklines: Record<string, number[] | null> } };

    // "Active" is a current status with nothing on the row recording what it
    // was before, so a past count can only be invented.
    expect(body.data.sparklines['applications']).toBeNull();

    // The others come from timestamps and are non-decreasing, being running
    // totals — a walk produced dips and climbs at random.
    for (const key of ['clients', 'funding']) {
      const series = body.data.sparklines[key];
      expect(Array.isArray(series), `${key} has a series`).toBe(true);
      for (let i = 1; i < series!.length; i++) {
        expect(series![i]!, `${key} is cumulative`).toBeGreaterThanOrEqual(series![i - 1]!);
      }
    }
  });
});

test.describe('Invoice documents and state', () => {
  async function paidInvoice(page: import('@playwright/test').Page) {
    const a = await auth(page);
    const clients = (
      (await fetch(`${API}/v1/clients?pageSize=1`, { headers: { Authorization: a } }).then(expectOk)) as { data: { id: string; businessName: string }[] }
    ).data;

    const created = (await fetch(`${API}/businesses/${clients[0]!.id}/invoices`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealStructure: 'consulting_only', totalApprovedCredit: 0 }),
    }).then(expectOk)) as { data: { id: string } };

    return { id: created.data.id, a, clientName: clients[0]!.businessName };
  }

  test('the invoice text comes from the row', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a, clientName } = await paidInvoice(page);

    const body = (await fetch(`${API}/billing/invoices/${id}/pdf`, {
      headers: { Authorization: a },
    }).then(expectOk)) as { data: { content: string } };

    const text = body.data.content;
    // The document it used to print for every id.
    expect(text).not.toContain('123 Business Ave');
    expect(text).not.toContain('$4,549.00');
    expect(text).not.toContain('Card Stacking Advisory Fee');
    expect(text).not.toContain('Net 30');
    // And it names the client it was actually raised against.
    expect(text).toContain(clientName);
  });

  test('an invoice on another tenant has no document', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const a = await auth(page);

    const res = await fetch(
      `${API}/billing/invoices/00000000-0000-0000-0000-000000000000/pdf`,
      { headers: { Authorization: a } },
    );
    // It used to render a complete invoice for any id at all.
    expect(res.status).toBe(404);
  });

  test('voiding persists and survives a re-read', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a } = await paidInvoice(page);

    const res = await fetch(`${API}/billing/invoices/${id}/void`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Raised in error' }),
    });
    expect(res.status).toBe(200);

    const reread = (await fetch(`${API}/invoices/${id}`, { headers: { Authorization: a } }).then(expectOk)) as { data: { status: string } };

    // The status used to stay untouched while the endpoint answered "voided".
    expect(reread.data.status).toBe('void');
  });

  test('a paid invoice cannot be voided', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a } = await paidInvoice(page);

    await fetch(`${API}/invoices/${id}/pay`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Voiding a paid invoice would erase the record of a payment.
    const res = await fetch(`${API}/billing/invoices/${id}/void`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Should be refused' }),
    });
    expect(res.status).toBe(422);
  });

  test('unpaying persists and survives a re-read', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a } = await paidInvoice(page);

    await fetch(`${API}/invoices/${id}/pay`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await fetch(`${API}/billing/invoices/${id}/unpay`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { refunded: boolean } };
    // Reverting the record does not reverse a payment with the processor.
    expect(body.data.refunded).toBe(false);

    const reread = (await fetch(`${API}/invoices/${id}`, { headers: { Authorization: a } }).then(expectOk)) as { data: { status: string; paidAt: string | null } };

    expect(reread.data.status).not.toBe('paid');
    expect(reread.data.paidAt).toBeNull();
  });
});

test.describe('Actions nothing performs', () => {
  test('overdue reminders are refused rather than reported sent', async ({
    signedInPage: page,
  }) => {
    await page.goto('/billing');
    const a = await auth(page);

    const res = await fetch(`${API}/platform/billing/send-overdue-reminders`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });

    // It answered 200 with "Sent N overdue payment reminders", N random,
    // nothing sent. This system can send real SMS and email.
    expect(res.status).toBe(501);
  });
});
