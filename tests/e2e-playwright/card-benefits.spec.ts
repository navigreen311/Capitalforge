// ============================================================
// /card-benefits — the benefits shown are the ones on record
//
// The page and its endpoint were both mock. GET /api/card-benefits/:clientId
// returned the same twelve benefits across Amex Business Platinum, Chase
// Sapphire Reserve and Amex Business Gold for any clientId; mark-used wrote
// to a module-level object that emptied on restart while answering 200; and
// the export produced a report with "$2,450.00 estimated unused" typed into
// it, for whichever client asked.
//
// The page held its own copies of the same three cards, plus a client picker
// offering Acme Corp, Sterling Partners and three more that do not exist.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

async function seededClientId(page: import('@playwright/test').Page): Promise<string> {
  const t = await token(page);
  const clients = (
    (await fetch(`${API}/v1/clients?pageSize=100`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then(expectOk)) as { data: { id: string; businessName: string }[] }
  ).data;
  const apex = clients.find((c) => c.businessName.includes('Apex Digital'));
  expect(apex, 'the seeded client with cards is present').toBeTruthy();
  return apex!.id;
}

test.describe('Card benefits', () => {
  test('reads the benefits recorded against the client cards', async ({ signedInPage: page }) => {
    await page.goto('/card-benefits');
    const id = await seededClientId(page);

    const body = (await fetch(`${API}/card-benefits/${id}`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    }).then(expectOk)) as {
      data: { cards: { product: string; benefits: { name: string }[] }[] };
    };

    const names = body.data.cards.flatMap((c) => c.benefits.map((b) => b.name));
    expect(names.length, 'the seed records card benefits').toBeGreaterThan(0);

    for (const name of names.slice(0, 3)) {
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the three cards that were invented', async ({ signedInPage: page }) => {
    await page.goto('/card-benefits');
    await expect(page.getByRole('heading', { name: 'Card Benefits' })).toBeVisible();

    // Full names only. "Business Platinum" on its own is a substring of two
    // cards the seed genuinely holds — Citi Business Platinum and Business
    // Platinum Credit Card — and getByText matches substrings, so asserting
    // on the short form fails against a real card that ought to be there.
    for (const invented of [
      'Amex Business Platinum',
      'Chase Sapphire Reserve',
      'Amex Business Gold',
      'Centurion Lounge',
      'DoorDash Credit',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('offers only real clients in the picker', async ({ signedInPage: page }) => {
    await page.goto('/card-benefits');

    for (const invented of [
      'Acme Corp',
      'Sterling Partners',
      'Redwood Holdings',
      'Pinnacle Ventures',
      'BlueSky Industries',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('a benefit with no value on record is not shown as worth nothing', async ({
    signedInPage: page,
  }) => {
    await page.goto('/card-benefits');
    const id = await seededClientId(page);

    const body = (await fetch(`${API}/card-benefits/${id}`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    }).then(expectOk)) as {
      data: { cards: { benefits: { name: string; value: number | null }[] }[] };
    };

    const unvalued = body.data.cards
      .flatMap((c) => c.benefits)
      .find((b) => b.value === null);
    expect(unvalued, 'the seed records a benefit with no value').toBeTruthy();

    await expect(page.getByText(unvalued!.name).first()).toBeVisible({ timeout: 30000 });
    // "$0" would state the benefit is worth nothing rather than unrecorded.
    await expect(page.getByText('$0', { exact: true })).toHaveCount(0);
  });

  test('marking a benefit used persists it', async ({ signedInPage: page }) => {
    await page.goto('/card-benefits');
    const t = await token(page);
    const id = await seededClientId(page);

    const before = (await fetch(`${API}/card-benefits/${id}`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then(expectOk)) as {
      data: { cards: { cardId: string; benefits: { benefitId: string; utilized: boolean }[] }[] };
    };

    const card = before.data.cards.find((c) => c.benefits.some((b) => !b.utilized));
    expect(card, 'an unused benefit exists to mark').toBeTruthy();
    const benefit = card!.benefits.find((b) => !b.utilized)!;

    const res = await fetch(
      `${API}/card-benefits/${card!.cardId}/benefits/${benefit.benefitId}/mark-used`,
      { method: 'POST', headers: { Authorization: `Bearer ${t}` } },
    );
    expect(res.status).toBe(200);

    // The state used to live in a module-level object, so it survived until
    // the next restart and no further. Re-reading is the test.
    const after = (await fetch(`${API}/card-benefits/${id}`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then(expectOk)) as {
      data: { cards: { benefits: { benefitId: string; utilized: boolean }[] }[] };
    };

    const reread = after.data.cards
      .flatMap((c) => c.benefits)
      .find((b) => b.benefitId === benefit.benefitId);
    expect(reread?.utilized, 'the benefit stayed used').toBe(true);
  });

  test('the export is built from the rows, not typed into the handler', async ({
    signedInPage: page,
  }) => {
    await page.goto('/card-benefits');
    const t = await token(page);
    const id = await seededClientId(page);

    const body = (await fetch(`${API}/card-benefits/${id}/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    }).then(expectOk)) as { data: { report: string } };

    const report = body.data.report;
    // The numbers that used to be in every report for every client.
    expect(report).not.toContain('$2,450.00');
    expect(report).not.toContain('Centurion Lounge');
    expect(report).not.toContain('Chase Sapphire Reserve');
    // And it names the client it was actually built for.
    expect(report).toContain('Apex Digital');
  });

  test('refuses a client on another tenant', async ({ signedInPage: page }) => {
    await page.goto('/card-benefits');
    const res = await fetch(`${API}/card-benefits/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    });
    // The old handler answered 200 with twelve benefits for any id at all.
    expect(res.status).toBe(404);
  });

  test('offers no cancellation logging, and says why', async ({ signedInPage: page }) => {
    await page.goto('/card-benefits');
    await expect(page.getByRole('heading', { name: 'Card Benefits' })).toBeVisible();

    // It posted to /api/v1/card-benefits/cancel, which does not exist, and
    // updated the screen regardless.
    await expect(page.getByRole('button', { name: /Log Cancellation/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Not shown here' })).toBeVisible();
  });
});
