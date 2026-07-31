import { test, expect } from './fixtures';

// ============================================================
// Logging a regulator inquiry — /complaints
//
// The panel rendered four fixed inquiries and "+ Log Inquiry" had no onClick
// at all, while POST/GET /api/regulator/inquiries already existed and
// persisted to the database. These assert the round trip: the form saves, the
// list reflects it, and a reload still shows it.
// ============================================================

const API = 'http://127.0.0.1:4000/api';

test.describe('Log regulator inquiry', () => {
  test('the button opens a form', async ({ signedInPage: page }) => {
    await page.goto('/complaints');

    await page.getByRole('button', { name: '+ Log Inquiry' }).click();

    const dialog = page.getByRole('dialog', { name: 'Log Regulator Inquiry' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Agency name')).toBeVisible();
    await expect(dialog.getByLabel('Matter type')).toBeVisible();
  });

  test('refuses to submit until the server would accept it', async ({ signedInPage: page }) => {
    await page.goto('/complaints');
    await page.getByRole('button', { name: '+ Log Inquiry' }).click();

    const dialog = page.getByRole('dialog', { name: 'Log Regulator Inquiry' });
    const submit = dialog.getByRole('button', { name: 'Log inquiry' });

    // The API requires an agency of 2+ chars and a description of 10+. The
    // form mirrors that rather than letting a request leave that is already
    // known to fail.
    await expect(submit).toBeDisabled();

    await dialog.getByLabel('Agency name').fill('FTC');
    await expect(submit).toBeDisabled();

    await dialog.getByLabel('What is the agency asking for?').fill('Too short');
    await expect(submit).toBeDisabled();

    await dialog
      .getByLabel('What is the agency asking for?')
      .fill('Requesting records of digital consent disclosures for Q1.');
    await expect(submit).toBeEnabled();
  });

  test('saves an inquiry and shows it in the list, and it survives a reload', async ({
    signedInPage: page,
  }) => {
    // Unique per run: this writes a real row.
    const reference = `E2E-${Date.now()}`;
    const agency = 'Federal Trade Commission';

    await page.goto('/complaints');
    await page.getByRole('button', { name: '+ Log Inquiry' }).click();

    const dialog = page.getByRole('dialog', { name: 'Log Regulator Inquiry' });
    await dialog.getByLabel('Matter type').selectOption('FTC');
    await dialog.getByLabel('Severity').selectOption('elevated');
    await dialog.getByLabel('Agency name').fill(agency);
    await dialog.getByLabel('Reference number').fill(reference);
    await dialog
      .getByLabel('What is the agency asking for?')
      .fill('Requesting records of digital consent disclosures for Q1 2026.');

    await dialog.getByRole('button', { name: 'Log inquiry' }).click();

    // The dialog closes only on a confirmed save.
    await expect(dialog).toBeHidden({ timeout: 10000 });

    // Present in the list without a manual refresh.
    await expect(page.getByText(reference)).toBeVisible({ timeout: 10000 });

    // And it was persisted, not just pushed into local state.
    await page.reload();
    await expect(page.getByText(reference)).toBeVisible({ timeout: 15000 });
  });

  test('the open-inquiry count comes from the saved rows', async ({ signedInPage: page }) => {
    // Navigate before reading localStorage: on about:blank the origin has no
    // accessible storage and the read throws a SecurityError.
    await page.goto('/complaints');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const listed = (await fetch(`${API}/regulator/inquiries`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json())) as { data?: { inquiries?: { status: string }[] } };

    const known = (listed.data?.inquiries ?? []).filter((i) => i.status !== 'closed').length;

    // The KPI reports what the panel loaded, rather than a constant. It was
    // previously a fixed 3 regardless of the tenant's actual matters.
    const card = page.locator('div', { hasText: /^Active Reg\. Inquiries/ }).last();
    await expect(card).toContainText(String(known), { timeout: 15000 });
  });
});
