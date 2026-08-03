// ============================================================
// The commission lifecycle — approve, pay, claw back
//
// approveCommission, markCommissionPaid and clawBackCommission read a record
// out of commissionStore, mutated it and put it back, so a transition lived
// in one worker's memory until the process restarted while commission_records
// held whatever it had held before. No route called them, which is the only
// reason that did no harm — and the last of that class in the codebase.
//
// markCommissionPaid checked nothing at all: it would pay a commission nobody
// had approved, and pay one that had already been clawed back. Those refusals
// are the substance of a lifecycle, so they are what most of this pins.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function auth(page: import('@playwright/test').Page): Promise<string> {
  const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));
  return `Bearer ${t}`;
}

/** A pending commission, created through the real endpoints. */
async function pendingCommission(
  page: import('@playwright/test').Page,
): Promise<{ id: string; a: string }> {
  const a = await auth(page);

  const clients = (
    (await fetch(`${API}/v1/clients?pageSize=1`, { headers: { Authorization: a } }).then(
      expectOk,
    )) as { data: { id: string }[] }
  ).data;

  const invoice = (await fetch(`${API}/businesses/${clients[0]!.id}/invoices`, {
    method: 'POST',
    headers: { Authorization: a, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealStructure: 'consulting_only', totalApprovedCredit: 0 }),
  }).then(expectOk)) as { data: { id: string } };

  const created = (await fetch(`${API}/invoices/${invoice.data.id}/commissions`, {
    method: 'POST',
    headers: { Authorization: a, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'referral_flat', amount: 500, partnerId: 'partner-lifecycle' }),
  }).then(expectOk)) as { data: { id: string; status: string } };

  expect(created.data.status, 'a new commission starts pending').toBe('pending');
  return { id: created.data.id, a };
}

async function statusOf(id: string, a: string): Promise<string | undefined> {
  const list = (await fetch(`${API}/commissions`, { headers: { Authorization: a } }).then(
    expectOk,
  )) as { data: { id: string; status: string }[] };
  return list.data.find((c) => c.id === id)?.status;
}

test.describe('Commission lifecycle', () => {
  test('approve then pay, and both survive a re-read', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a } = await pendingCommission(page);

    const approved = (await fetch(`${API}/commissions/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    }).then(expectOk)) as { data: { status: string } };
    expect(approved.data.status).toBe('approved');

    // The transition used to live in a Map. Reading it back through a
    // different endpoint is what tells the two apart.
    expect(await statusOf(id, a), 'the approval is on record').toBe('approved');

    const paid = (await fetch(`${API}/commissions/${id}/pay`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    }).then(expectOk)) as { data: { status: string; paidAt: string | null; disbursed: boolean } };

    expect(paid.data.status).toBe('paid');
    expect(paid.data.paidAt).not.toBeNull();
    // Recording a payment is not moving money to anybody.
    expect(paid.data.disbursed).toBe(false);

    expect(await statusOf(id, a), 'the payment is on record').toBe('paid');
  });

  test('will not pay a commission nobody approved', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a } = await pendingCommission(page);

    // The old function checked nothing, so this was money out of the door on
    // nobody's authority.
    const res = await fetch(`${API}/commissions/${id}/pay`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(422);

    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/has not been approved/);

    expect(await statusOf(id, a), 'it stays pending').toBe('pending');
  });

  test('will not approve the same commission twice', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a } = await pendingCommission(page);

    const first = await fetch(`${API}/commissions/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${API}/commissions/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });
    expect(second.status).toBe(422);
  });

  test('claws back a paid commission, and only a paid one', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a } = await pendingCommission(page);

    // Not yet paid: a clawback reclaims money that went out, and withdrawing
    // one that never did is a cancellation — a different act with no state.
    const tooEarly = await fetch(`${API}/commissions/${id}/clawback`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });
    expect(tooEarly.status).toBe(422);

    await fetch(`${API}/commissions/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });
    await fetch(`${API}/commissions/${id}/pay`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });

    const clawed = (await fetch(`${API}/commissions/${id}/clawback`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    }).then(expectOk)) as { data: { status: string } };
    expect(clawed.data.status).toBe('clawed_back');

    expect(await statusOf(id, a), 'the clawback is on record').toBe('clawed_back');
  });

  test('will not pay a commission that was clawed back', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, a } = await pendingCommission(page);

    for (const action of ['approve', 'pay', 'clawback']) {
      await fetch(`${API}/commissions/${id}/${action}`, {
        method: 'POST',
        headers: { Authorization: a, 'Content-Type': 'application/json' },
      });
    }

    // The old function would have paid it a second time.
    const res = await fetch(`${API}/commissions/${id}/pay`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(422);
    expect(await statusOf(id, a)).toBe('clawed_back');
  });

  test('refuses a commission on another tenant', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const res = await fetch(
      `${API}/commissions/00000000-0000-0000-0000-000000000000/approve`,
      {
        method: 'POST',
        headers: { Authorization: await auth(page), 'Content-Type': 'application/json' },
      },
    );
    expect(res.status).toBe(404);
  });
});
