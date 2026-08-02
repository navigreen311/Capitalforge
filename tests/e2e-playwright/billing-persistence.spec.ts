// ============================================================
// The last two billing endpoints that answered without recording
//
// POST /api/billing/commissions/:id/resolve wrote the resolution into a
// module-level object and answered 200 with status "resolved". The record
// kept its old status, and the note describing the settlement was gone at the
// next restart and invisible to every other worker meanwhile. Unlike the
// refund path, this one was reachable.
//
// GET /api/billing/revenue-trend invented six months of revenue —
// `45000 + Math.random() * 15000` a month — then sorted the six figures
// ascending under a comment reading "Ensure upward trend", so the chart always
// climbed, and derived a growth rate from that ordering. The figures changed
// on every request, which was the one way a reader might have noticed.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

/** A commission on record, created through the real endpoints. */
async function commission(
  page: import('@playwright/test').Page,
): Promise<{ id: string; auth: string }> {
  const auth = `Bearer ${await token(page)}`;

  const clients = (
    (await fetch(`${API}/v1/clients?pageSize=1`, { headers: { Authorization: auth } }).then((r) =>
      r.json(),
    )) as { data: { id: string }[] }
  ).data;

  const invoice = (await fetch(`${API}/businesses/${clients[0]!.id}/invoices`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealStructure: 'consulting_only', totalApprovedCredit: 0 }),
  }).then((r) => r.json())) as { data: { id: string } };

  const created = (await fetch(`${API}/invoices/${invoice.data.id}/commissions`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'referral_flat', amount: 500, partnerId: 'partner-test' }),
  }).then((r) => r.json())) as { data: { id: string } };

  expect(created.data?.id, 'a commission was created').toBeTruthy();
  return { id: created.data.id, auth };
}

test.describe('Commission dispute resolution', () => {
  test('resolving persists the status and the reason', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, auth } = await commission(page);

    const res = await fetch(`${API}/billing/commissions/${id}/resolve`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution: 'Split agreed with partner', amount: 250 }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { status: string; paid: boolean } };
    expect(body.data.status).toBe('resolved');
    // Recording an outcome is not paying anybody.
    expect(body.data.paid).toBe(false);

    // The state used to live in a module-level object. Reading it back through
    // a different endpoint is what tells the two apart.
    // /api/commissions — the list lives outside the /billing prefix that the
    // resolve endpoint uses.
    const list = (await fetch(`${API}/commissions`, {
      headers: { Authorization: auth },
    }).then((r) => r.json())) as { data: { id: string; status: string }[] };

    const found = list.data.find((c) => c.id === id);
    expect(found, 'the commission is still on record').toBeTruthy();
    expect(found!.status, 'the resolved status survived the re-read').toBe('resolved');
  });

  test('a resolution needs a reason', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, auth } = await commission(page);

    const res = await fetch(`${API}/billing/commissions/${id}/resolve`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 250 }),
    });
    expect(res.status).toBe(422);
  });

  test('a commission on another tenant cannot be resolved', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const auth = `Bearer ${await token(page)}`;

    // This used to answer 200 for any id at all, having checked nothing.
    const res = await fetch(
      `${API}/billing/commissions/00000000-0000-0000-0000-000000000000/resolve`,
      {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: 'Test' }),
      },
    );
    expect(res.status).toBe(404);
  });
});

test.describe('Revenue trend', () => {
  test('is the same on two consecutive reads', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const auth = `Bearer ${await token(page)}`;

    const read = async () =>
      (await fetch(`${API}/billing/revenue-trend`, { headers: { Authorization: auth } }).then((r) =>
        r.json(),
      )) as { data: { months: { month: string; revenue: number }[] } };

    const first = await read();
    const second = await read();

    // The old handler randomised every figure on every request.
    expect(second.data.months.map((m) => m.revenue)).toEqual(
      first.data.months.map((m) => m.revenue),
    );
  });

  test('does not manufacture an upward trend', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const auth = `Bearer ${await token(page)}`;

    const body = (await fetch(`${API}/billing/revenue-trend`, {
      headers: { Authorization: auth },
    }).then((r) => r.json())) as {
      data: {
        months: { month: string; revenue: number; collectionRate: number | null }[];
        summary: { totalRevenue: number; growthRate: number | null; avgCollectionRate: number | null };
      };
    };

    const revenues = body.data.months.map((m) => m.revenue);
    expect(revenues).toHaveLength(6);

    // The old handler sorted the months ascending so the line always climbed.
    // Real revenue may happen to be sorted, but it must not be guaranteed to
    // be: with a seeded tenant the months are mostly zero, and a strictly
    // increasing series would mean the sort is still there.
    const strictlyIncreasing = revenues.every((v, i) => i === 0 || v > revenues[i - 1]!);
    expect(strictlyIncreasing).toBe(false);

    // Totals agree with the months rather than being computed separately.
    const summed = Math.round(revenues.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(body.data.summary.totalRevenue).toBe(summed);
  });

  test('states no rate where there is nothing to rate', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const auth = `Bearer ${await token(page)}`;

    const body = (await fetch(`${API}/billing/revenue-trend`, {
      headers: { Authorization: auth },
    }).then((r) => r.json())) as {
      data: {
        months: { invoiceCount: number; collectionRate: number | null }[];
        summary: { growthRate: number | null };
      };
    };

    // A month with no invoices has no collection rate. 0% would read as every
    // invoice going unpaid, and 100% as perfect collection on nothing.
    for (const month of body.data.months) {
      if (month.invoiceCount === 0) {
        expect(month.collectionRate).toBeNull();
      } else {
        expect(typeof month.collectionRate).toBe('number');
      }
    }

    // And growth from a zero base is null, not Infinity.
    expect(body.data.summary.growthRate === null || Number.isFinite(body.data.summary.growthRate)).toBe(
      true,
    );
  });
});
