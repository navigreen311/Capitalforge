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

/**
 * The number rendered inside a KPI card.
 *
 * Asserting `toContainText('3')` against the whole card is unsound: the label
 * "Resolved (30d)" contains a 3 and a 0, so the assertion passes on the label
 * alone. This targets the value element and compares it exactly.
 */
function kpiValue(page: import('@playwright/test').Page, label: string) {
  return page
    .locator('div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .last()
    .locator('p')
    .nth(1);
}

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
    await expect(kpiValue(page, 'Open / Escalated')).toHaveText(String(open), {
      timeout: 15000,
    });
    await expect(kpiValue(page, 'Critical Severity')).toHaveText(String(critical));
  });
});

test.describe('Attach evidence', () => {
  test('a complaint can be filed against a seeded client', async ({ signedInPage: page }) => {
    // The create schema required a uuid while every seeded business uses a
    // readable id, so the log form's own client list produced "Invalid uuid".
    await page.goto('/complaints');
    const headers = await authHeaders(page);

    const res = await fetch(`${API}/complaints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        businessId: 'seed-biz-001',
        category: 'service',
        source: 'portal',
        severity: 'low',
        description: 'E2E complaint filed against a seeded client id.',
      }),
    });
    expect(res.status).toBe(201);

    const id = ((await res.json()) as { data?: { id?: string } }).data?.id;
    await page.reload();

    // Scoped to the row: the name also appears in the client filter's hidden
    // <option> list, which is not evidence that the row rendered.
    const row = page.getByRole('row').filter({ hasText: id as string });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText('Apex Digital Solutions LLC');
  });

  test('offers the client documents and persists the attachment', async ({
    signedInPage: page,
  }) => {
    await page.goto('/complaints');
    const headers = await authHeaders(page);

    // Its own complaint against Apex Digital, which has two seeded documents.
    // Attaching to a seeded complaint would pass once and then fail, because
    // an already-attached document is no longer offered.
    const created = (await fetch(`${API}/complaints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        businessId: 'seed-biz-001',
        category: 'billing',
        source: 'portal',
        severity: 'low',
        description: 'E2E evidence attachment probe.',
      }),
    }).then((r) => r.json())) as { data?: { id?: string } };

    const id = created.data?.id;
    expect(id, 'the probe complaint was not created').toBeTruthy();

    await page.reload();
    await page.getByText(id as string).first().click();
    await page.getByRole('button', { name: '+ Attach Evidence' }).click();

    const dialog = page.getByRole('dialog', { name: 'Attach Evidence' });
    await expect(dialog).toBeVisible();

    // A real document belonging to that client, not a typed filename.
    const doc = dialog.getByText('Chase Ink — March 2026 statement.pdf');
    await expect(doc).toBeVisible({ timeout: 10000 });

    await doc.click();
    await dialog.getByRole('button', { name: /^Attach/ }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    // Read back from the API: the reference is stored against the complaint.
    await expect
      .poll(
        async () => {
          const listed = (await fetch(`${API}/complaints?pageSize=100`, { headers }).then((r) =>
            r.json(),
          )) as { data?: { complaints?: { id: string; evidenceDocIds: string[] }[] } };
          return (listed.data?.complaints ?? []).find((c) => c.id === id)?.evidenceDocIds;
        },
        { timeout: 10000 },
      )
      .toContain('seed-doc-001');
  });

  test('says so when the complaint has no client to draw documents from', async ({
    signedInPage: page,
  }) => {
    await page.goto('/complaints');
    const headers = await authHeaders(page);

    // No businessId, so there is no document library behind it.
    const created = (await fetch(`${API}/complaints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category: 'other',
        source: 'other',
        severity: 'low',
        description: 'E2E unattributed complaint for the evidence picker.',
      }),
    }).then((r) => r.json())) as { data?: { id?: string } };

    await page.reload();
    await page.getByText(created.data?.id as string).first().click();
    await page.getByRole('button', { name: '+ Attach Evidence' }).click();

    await expect(
      page.getByText(/not attributed to a client/i),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Resolved (30d)', () => {
  test('counts a resolution from the last 30 days', async ({ signedInPage: page }) => {
    await page.goto('/complaints');
    const headers = await authHeaders(page);

    const before = (await fetch(`${API}/complaints?pageSize=100`, { headers }).then((r) =>
      r.json(),
    )) as { data?: { complaints?: { resolvedAt: string | null }[] } };

    const cutoff = Date.now() - 30 * 86_400_000;
    const baseline = (before.data?.complaints ?? []).filter(
      (c) => c.resolvedAt !== null && new Date(c.resolvedAt).getTime() >= cutoff,
    ).length;

    // Resolve one now. Against the old frozen clock — a window ending
    // 2026-04-01 — this would not have moved the figure at all.
    const created = (await fetch(`${API}/complaints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category: 'service',
        source: 'phone',
        severity: 'low',
        description: 'E2E resolved-window probe.',
      }),
    }).then((r) => r.json())) as { data?: { id?: string } };

    // The API enforces a workflow: open goes to investigating or closed, and
    // only investigating goes to resolved. A direct jump is a 400.
    const toInvestigating = await fetch(`${API}/complaints/${created.data?.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: 'investigating' }),
    });
    expect(toInvestigating.status).toBe(200);

    const res = await fetch(`${API}/complaints/${created.data?.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: 'resolved', resolution: 'Closed during the E2E run.' }),
    });
    expect(res.status).toBe(200);

    await page.reload();

    await expect(kpiValue(page, 'Resolved (30d)')).toHaveText(String(baseline + 1), {
      timeout: 15000,
    });
  });
});
