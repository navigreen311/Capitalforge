// ============================================================
// /billing — invoices are records, and survive
//
// The page listed invoices as literals: CF-2026-0041 to Apex Ventures LLC
// for $18,500 issued, CF-2026-0040 to NovaTech Solutions for $9,750 marked
// overdue, CF-2026-0039 to Horizon Retail for $42,000 — beside commissions
// owed to named partners and a usage meter reading 87,400 of 100,000 API
// calls. An overdue invoice says a client owes money and has not paid.
//
// The API behind it computed real fees but kept the result in a Map held by
// the process, so an invoice existed until the server restarted and two
// workers disagreed about it, while an invoices table sat unused.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

async function firstBusinessId(t: string | null): Promise<string> {
  const body = (await fetch(`${API}/compliance/disclosures`, {
    headers: { Authorization: `Bearer ${t}` },
  }).then(expectOk)) as { data: { businesses: { businessId: string }[] } };
  expect(body.data.businesses.length).toBeGreaterThan(0);
  return body.data.businesses[0].businessId;
}

test.describe('Billing', () => {
  test('an invoice survives being generated', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const t = await token(page);
    const businessId = await firstBusinessId(t);

    const created = await fetch(`${API}/businesses/${businessId}/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealStructure: 'consulting_only', totalApprovedCredit: 0 }),
    });
    expect(created.status).toBe(201);

    const { data } = (await created.json()) as { data: { id: string; invoiceNumber: string } };
    expect(data.id).toBeTruthy();

    // The proof the Map could not give: read it back.
    const listed = await fetch(`${API}/businesses/${businessId}/invoices`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { id: string; invoiceNumber: string }[] }).data);

    expect(listed.find((i) => i.id === data.id), 'the invoice must come back').toBeTruthy();
  });

  test('marking an invoice paid persists, and charges nothing', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const t = await token(page);
    const businessId = await firstBusinessId(t);

    const created = await fetch(`${API}/businesses/${businessId}/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealStructure: 'consulting_only', totalApprovedCredit: 0 }),
    }).then(expectOk);
    const invoiceId = (created as { data: { id: string } }).data.id;

    const paid = await fetch(`${API}/invoices/${invoiceId}/pay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(paid.status).toBe(200);

    const body = (await paid.json()) as { data: { status: string; charged: boolean } };
    expect(body.data.status).toBe('paid');
    // Recording a payment is not taking one.
    expect(body.data.charged).toBe(false);

    const after = await fetch(`${API}/businesses/${businessId}/invoices`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { id: string; status: string }[] }).data);
    expect(after.find((i) => i.id === invoiceId)!.status).toBe('paid');
  });

  test('an invoice from another tenant is not payable', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const t = await token(page);

    const res = await fetch(`${API}/invoices/not-a-real-invoice/pay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  test('renders none of the invented invoices, commissions or usage', async ({
    signedInPage: page,
  }) => {
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible({ timeout: 30000 });

    for (const invented of [
      'CF-2026-0041',
      'CF-2026-0040',
      'NovaTech Solutions',
      'Marcus Webb',
      'Renata',
      // Not the usage figures — the page's own note quotes them, saying what
      // the meter used to claim.
      'com_001',
      'Apex Ventures LOC',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('says what it does not do', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: 'What is not here' })).toBeVisible({
      timeout: 30000,
    });
    // Asserted as state rather than as wording. These three facts used to be
    // three identical grey paragraphs; they are now three markers, and what
    // matters is that the page still distinguishes them — commissions is a
    // capability that works with nothing in it, while metering and taking
    // payment are capabilities that do not exist.
    const marker = (title: string) => page.locator(`[data-capability-title="${title}"]`);

    await expect(marker('Commissions')).toHaveAttribute('data-capability-state', 'no_data');
    await expect(marker('Usage metering')).toHaveAttribute('data-capability-state', 'not_built');
    await expect(marker('Taking payment')).toHaveAttribute('data-capability-state', 'not_built');

    // The substance, not the sentence: no money moves, and the reason given
    // is the mechanism rather than a claim that the capability is absent.
    await expect(marker('Taking payment')).toContainText('no money moves');
    await expect(marker('Taking payment')).toContainText('STRIPE_SECRET_KEY');
    await expect(marker('Commissions')).toContainText('commission_records');
  });
});

test.describe('Commissions', () => {
  test('a commission survives being created', async ({ signedInPage: page }) => {
    await page.goto('/billing');
    const t = await token(page);
    const businessId = await firstBusinessId(t);

    const invoice = (await fetch(`${API}/businesses/${businessId}/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealStructure: 'consulting_only', totalApprovedCredit: 0 }),
    }).then(expectOk)) as { data: { id: string } };

    const created = await fetch(`${API}/invoices/${invoice.data.id}/commissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisorId: 'e2e-advisor', type: 'advisor_commission', amount: 250 }),
    });
    expect(created.status).toBe(201);

    // commission_records had a table and nothing wrote to it; the service
    // mutated a Map that a restart emptied.
    const listed = await fetch(`${API}/commissions`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { invoiceId: string | null; amount: number }[] }).data);

    const found = listed.find((c) => c.invoiceId === invoice.data.id);
    expect(found, 'the commission must come back from the database').toBeTruthy();
    expect(found!.amount).toBe(250);
  });

  test('a commission cannot be attached to another tenant’s invoice', async ({
    signedInPage: page,
  }) => {
    await page.goto('/billing');
    const t = await token(page);

    const res = await fetch(`${API}/invoices/not-a-real-invoice/commissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisorId: 'x', type: 'advisor_commission', amount: 10 }),
    });
    expect(res.status).toBe(404);
  });
});
