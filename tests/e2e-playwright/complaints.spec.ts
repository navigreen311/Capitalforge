import { test, expect } from './fixtures';

// ============================================================
// Complaints register — /complaints
//
// The table rendered eight fixed complaints and the log form pushed into local
// state that vanished on reload, while POST/GET/PUT /api/complaints already
// existed and persisted. These assert the round trip, and that the figures
// above the table are counted from the same rows shown in it.
// ============================================================

const API = 'http://127.0.0.1:4000/api';

async function authHeaders(page: import('@playwright/test').Page) {
  const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

test.describe('Complaints register', () => {
  test('loads complaints from the API, not from a constant', async ({ signedInPage: page }) => {
    // Written directly, so anything on screen came through the API.
    await page.goto('/complaints');
    const headers = await authHeaders(page);
    const marker = `E2E complaint probe ${Date.now()}`;

    const res = await fetch(`${API}/complaints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category: 'billing',
        source: 'portal',
        severity: 'high',
        description: marker,
      }),
    });
    expect(res.status).toBe(201);

    const createdId = ((await res.json()) as { data?: { id?: string } }).data?.id;
    expect(createdId, 'the probe complaint was not created').toBeTruthy();

    // The register lists ids, so that is what proves the row came from the API.
    await page.reload();
    await expect(page.getByText(createdId as string).first()).toBeVisible({ timeout: 15000 });

    // And none of the sample rows survive.
    await expect(page.getByText('Marcus Bell')).toHaveCount(0);
    await expect(page.getByText('Aisha Johnson')).toHaveCount(0);
  });

  test('logging a complaint persists it', async ({ signedInPage: page }) => {
    const description = `E2E logged via form ${Date.now()}`;

    await page.goto('/complaints');
    await page.getByRole('button', { name: /log complaint/i }).first().click();

    const modal = page.getByRole('heading', { name: 'Log New Complaint' });
    await expect(modal).toBeVisible();

    await page.getByLabel('Category', { exact: true }).selectOption('compliance');
    await page.getByLabel('How was it received?').selectOption('email');
    await page.getByLabel('Severity', { exact: true }).selectOption('critical');
    await page.getByLabel('Description', { exact: true }).fill(description);
    await page.getByLabel('Assignee', { exact: true }).fill('E2E Owner');

    await page.getByRole('button', { name: 'Log Complaint', exact: true }).click();

    await expect(modal).toBeHidden({ timeout: 10000 });

    // Look the row up by its description through the API, then assert the id
    // the form produced is on screen after a reload — so it reached the
    // database rather than living in local state.
    const headers = await authHeaders(page);
    const listed = (await fetch(`${API}/complaints?pageSize=100`, { headers }).then((r) =>
      r.json(),
    )) as { data?: { complaints?: { id: string; description: string }[] } };
    const saved = (listed.data?.complaints ?? []).find((c) => c.description === description);
    expect(saved, 'the complaint was not persisted').toBeTruthy();

    await page.reload();
    await expect(page.getByText(saved!.id).first()).toBeVisible({ timeout: 15000 });
  });

  test('refuses to submit a description the API would reject', async ({ signedInPage: page }) => {
    await page.goto('/complaints');
    await page.getByRole('button', { name: /log complaint/i }).first().click();

    const submit = page.getByRole('button', { name: 'Log Complaint', exact: true });
    await expect(submit).toBeDisabled();

    // The API requires 10+ characters.
    await page.getByLabel('Description', { exact: true }).fill('too short');
    await expect(submit).toBeDisabled();

    await page.getByLabel('Description', { exact: true }).fill('A description long enough to be accepted.');
    await expect(submit).toBeEnabled();
  });

  test('a status change is saved, not just shown', async ({ signedInPage: page }) => {
    await page.goto('/complaints');
    const headers = await authHeaders(page);
    const description = `E2E status change ${Date.now()}`;

    const created = (await fetch(`${API}/complaints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category: 'service',
        source: 'phone',
        severity: 'medium',
        description,
      }),
    }).then((r) => r.json())) as { data?: { id?: string } };

    const id = created.data?.id;
    expect(id, 'the probe complaint was not created').toBeTruthy();

    await page.reload();
    await page.getByText(id as string).first().click();

    await page.getByRole('button', { name: 'Start Investigation' }).click();

    // Read back from the API rather than trusting the panel. There is no
    // single-complaint GET, so the row is found in the list.
    await expect
      .poll(
        async () => {
          const listed = (await fetch(`${API}/complaints?pageSize=100`, { headers }).then((r) =>
            r.json(),
          )) as { data?: { complaints?: { id: string; status: string }[] } };
          return (listed.data?.complaints ?? []).find((c) => c.id === id)?.status;
        },
        { timeout: 10000 },
      )
      .toBe('investigating');
  });

  test('the KPI counts match the rows on screen', async ({ signedInPage: page }) => {
    await page.goto('/complaints');
    const headers = await authHeaders(page);

    const listed = (await fetch(`${API}/complaints?pageSize=100`, { headers }).then((r) =>
      r.json(),
    )) as { data?: { complaints?: { status: string; severity: string }[] } };

    const rows = listed.data?.complaints ?? [];
    const open = rows.filter((c) => c.status === 'open' || c.status === 'investigating').length;
    const critical = rows.filter((c) => c.severity === 'critical').length;

    // Previously "Open / Escalated" counted a fixed array and "Resolved (30d)"
    // was the literal 12.
    await expect(page.getByText('Open / Escalated').locator('..')).toContainText(String(open), {
      timeout: 15000,
    });
    await expect(page.getByText('Critical Severity').locator('..')).toContainText(
      String(critical),
    );
  });
});
