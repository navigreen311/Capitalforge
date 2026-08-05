// ============================================================
// /optimizer — the client handed over by another page arrives
//
// Three surfaces link here naming a client: the credit builder's step 6 ("View
// eligible cards"), its Tier 1 graduation banner, and its milestone alerts.
// All three sent `?client_id=…&from=…`, and this page read none of it — it
// kept its own `selectedBusinessId` and started empty.
//
// So an advisor who clicked through for a named client landed on a blank form
// and had to find them again, with nothing on screen saying a selection had
// been made and dropped. Not a false success; a handoff that looked like one.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

/** Seeded, and the client the credit-builder specs use. */
const CLIENT = 'Apex Digital Solutions LLC';

async function clientId(page: import('@playwright/test').Page, name: string): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
  const clients = (await fetch(`${API}/v1/clients?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(expectOk)
    .then((b) => (b as { data: { id: string; businessName: string }[] }).data)) as {
    id: string;
    businessName: string;
  }[];
  const match = clients.find((c) => c.businessName === name);
  expect(match, `${name} is seeded`).toBeTruthy();
  return match!.id;
}

test.describe('Optimizer client handoff', () => {
  test('preselects the client named in the link', async ({ signedInPage: page }) => {
    await page.goto('/optimizer');
    const id = await clientId(page, CLIENT);

    await page.goto(`/optimizer?client_id=${id}&from=credit-builder`);

    const select = page.getByRole('combobox', { name: 'Select client' });
    await expect(select).toHaveValue(id, { timeout: 30000 });
    await expect(page.getByText('Carried over from the credit builder')).toBeVisible();
  });

  test('names the surface the client came from', async ({ signedInPage: page }) => {
    await page.goto('/optimizer');
    const id = await clientId(page, CLIENT);

    await page.goto(`/optimizer?client_id=${id}&from=graduation`);
    await expect(page.getByText('Carried over from the Tier 1 graduation banner')).toBeVisible({
      timeout: 30000,
    });
  });

  test('starts empty when no client was named', async ({ signedInPage: page }) => {
    await page.goto('/optimizer');

    const select = page.getByRole('combobox', { name: 'Select client' });
    await expect(select).toHaveValue('', { timeout: 30000 });
    await expect(page.getByText(/Carried over from/)).toHaveCount(0);
    await expect(page.getByText(/not in your list/)).toHaveCount(0);
  });

  test('says so when the named client cannot be resolved', async ({ signedInPage: page }) => {
    // A stale link, or a client on another tenant. Selecting it anyway would
    // show "Business selected" for a business absent from the dropdown beside
    // it, and send an id the API will refuse.
    await page.goto('/optimizer?client_id=00000000-0000-0000-0000-000000000000&from=credit-builder');

    await expect(page.getByText(/not in your list/)).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('combobox', { name: 'Select client' })).toHaveValue('');
  });

  test('treats a literal "null" as no client, not as an id', async ({ signedInPage: page }) => {
    // The graduation banner interpolated whatever clientId held, so
    // `client_id=null` was reachable. It is now suppressed at the source; this
    // pins the receiving end too.
    await page.goto('/optimizer?client_id=null&from=graduation');

    await expect(page.getByRole('combobox', { name: 'Select client' })).toHaveValue('', {
      timeout: 30000,
    });
    await expect(page.getByText(/not in your list/)).toHaveCount(0);
  });
});
