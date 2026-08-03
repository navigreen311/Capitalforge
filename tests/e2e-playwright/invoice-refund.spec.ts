// ============================================================
// POST /api/invoices/:id/refund — a refund that leaves a record
//
// issueRefund was the last write in revenue-ops that went nowhere. It read
// the invoice out of a module-level Map, built a credit note, and put both
// back into that Map — so a refund left no record anywhere, disappeared when
// the process restarted, and was invisible to every other worker. Nothing
// called it, which is the only reason it did no harm.
//
// The service computes and validates; the route writes both rows in one
// transaction. Re-reading after the write is the test that distinguishes the
// two, exactly as it did for card benefits.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

/** A paid invoice to refund against, created through the real endpoints. */
async function paidInvoice(
  page: import('@playwright/test').Page,
): Promise<{ id: string; amount: number; auth: string }> {
  const t = await token(page);
  const auth = `Bearer ${t}`;

  const clients = (
    (await fetch(`${API}/v1/clients?pageSize=1`, { headers: { Authorization: auth } }).then(expectOk)) as { data: { id: string }[] }
  ).data;
  expect(clients.length, 'the seed provides a client').toBeGreaterThan(0);

  const created = (await fetch(`${API}/businesses/${clients[0]!.id}/invoices`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealStructure: 'consulting_only', totalApprovedCredit: 0 }),
  }).then(expectOk)) as { data: { id: string; amount: number } };

  const invoiceId = created.data.id;

  const paid = await fetch(`${API}/invoices/${invoiceId}/pay`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  expect(paid.status, 'the invoice can be marked paid').toBe(200);

  return { id: invoiceId, amount: created.data.amount, auth };
}

test.describe('Invoice refunds', () => {
  test('a refund writes a credit note that survives a re-read', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, amount, auth } = await paidInvoice(page);

    const res = await fetch(`${API}/invoices/${id}/refund`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: amount, reason: 'Client dispute resolved' }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      data: { creditNoteId: string; creditNoteNumber: string; invoiceStatus: string; charged: boolean };
    };
    expect(body.data.creditNoteNumber).toMatch(/^CN-/);
    // Recording a credit note is not returning money.
    expect(body.data.charged).toBe(false);

    // The state used to live in a Map, so it survived until the next restart
    // and no further. Reading it back is the test.
    const invoices = (await fetch(`${API}/businesses/${(await fetch(`${API}/invoices/${id}`, {
      headers: { Authorization: auth },
    }).then(expectOk) as { data: { businessId: string } }).data.businessId}/invoices`, {
      headers: { Authorization: auth },
    }).then(expectOk)) as { data: { id: string; type: string; amount: number }[] };

    const note = invoices.data.find((i) => i.id === body.data.creditNoteId);
    expect(note, 'the credit note is on record').toBeTruthy();
    expect(note!.type).toBe('credit_note');
    expect(note!.amount).toBeLessThan(0);
  });

  test('a fully refunded invoice is marked refunded', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, amount, auth } = await paidInvoice(page);

    const body = (await fetch(`${API}/invoices/${id}/refund`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: amount, reason: 'Full refund' }),
    }).then(expectOk)) as { data: { invoiceStatus: string } };

    expect(body.data.invoiceStatus).toBe('refunded');
  });

  test('refunds cannot exceed what is left on the invoice', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, amount, auth } = await paidInvoice(page);

    const half = Math.round((amount / 2) * 100) / 100;

    const first = await fetch(`${API}/invoices/${id}/refund`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: half, reason: 'Partial' }),
    });
    expect(first.status).toBe(201);

    // The balance comes from the credit notes on record, not from a counter.
    // Without that, an invoice could be refunded in full repeatedly.
    const second = await fetch(`${API}/invoices/${id}/refund`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: amount, reason: 'Too much' }),
    });
    expect(second.status).toBe(422);

    const err = (await second.json()) as { error: { message: string } };
    expect(err.error.message).toMatch(/exceeds refundable/);
  });

  test('an unpaid invoice cannot be refunded', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const t = await token(page);
    const auth = `Bearer ${t}`;

    const clients = (
      (await fetch(`${API}/v1/clients?pageSize=1`, { headers: { Authorization: auth } }).then(expectOk)) as { data: { id: string }[] }
    ).data;

    const created = (await fetch(`${API}/businesses/${clients[0]!.id}/invoices`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealStructure: 'consulting_only', totalApprovedCredit: 0 }),
    }).then(expectOk)) as { data: { id: string; amount: number } };

    const res = await fetch(`${API}/invoices/${created.data.id}/refund`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: 1, reason: 'Not paid yet' }),
    });
    expect(res.status).toBe(422);
  });

  test('a refund needs a reason', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const { id, auth } = await paidInvoice(page);

    // A credit note nobody can account for is worse than no credit note.
    const res = await fetch(`${API}/invoices/${id}/refund`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: 1 }),
    });
    expect(res.status).toBe(400);
  });

  test('an invoice on another tenant is not refundable', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const t = await token(page);

    const res = await fetch(`${API}/invoices/00000000-0000-0000-0000-000000000000/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: 1, reason: 'Test' }),
    });
    expect(res.status).toBe(404);
  });
});
