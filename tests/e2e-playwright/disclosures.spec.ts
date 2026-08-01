// ============================================================
// /disclosures — the CMS reads the database
//
// The page held nine templates as literals, each with a version number, an
// author, and an approvedBy of "CCO" or "GC" — approval records for the text
// a client is handed to satisfy a legal obligation. It also offered to send
// them to five made-up firms, with no endpoint behind the button.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Template {
  id: string;
  name: string;
  state: string;
  category: string;
  status: string;
  isActive: boolean;
  approvedBy: string | null;
}

async function templates(token: string | null): Promise<Template[]> {
  const res = await fetch(`${API}/disclosures/templates?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/disclosures/templates must be reachable').toBe(200);
  return ((await res.json()) as { data: Template[] }).data;
}


/**
 * A template of our own, so the approval tests do not consume the seeded ones.
 *
 * Approving is irreversible through the API — there is no un-approve — so a
 * test that approves a seeded draft passes once and leaves one fewer draft
 * for every run after it. Each run creates and approves its own instead.
 * clean:dev-data removes anything named "E2E ...".
 */
async function createTemplate(token: string | null, suffix: string): Promise<Template> {
  const res = await fetch(`${API}/disclosures/templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: 'FEDERAL',
      category: 'federal',
      name: `E2E ${suffix} ${Date.now()}`,
      // Deliberately avoids the words create, update, select, drop, delete,
      // alter and union: the input sanitizer rejects any of them anywhere in
      // the body as SQL injection, prose or not.
      content:
        'E2E PROBE DISCLOSURE. This text exists only to exercise the disclosure ' +
        'lifecycle in the browser suite and is never issued to any client. It is ' +
        'padded so that it clears the hundred character minimum the API enforces.',
      effectiveDate: '2026-01-01',
    }),
  });
  expect(res.status, 'a template can be created').toBe(201);
  return ((await res.json()) as { data: Template }).data;
}

test.describe('Disclosure CMS', () => {
  test('shows the templates the API returns', async ({ signedInPage: page }) => {
    await page.goto('/disclosures');
    await expect(page.getByRole('heading', { name: 'Disclosure Templates' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await templates(token);
    expect(rows.length, 'the seed records disclosure templates').toBeGreaterThan(0);

    for (const row of rows.slice(0, 4)) {
      await expect(page.getByText(row.name).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the templates that used to be hardcoded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/disclosures');
    await expect(page.getByRole('heading', { name: 'Disclosure Templates' })).toBeVisible();

    for (const invented of [
      'Standard APR Disclosure',
      'ECOA Rights — English',
      'FCRA Summary of Rights',
      'UDAAP Policy Statement',
      'Florida Privacy Addendum',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('claims no approval that was not recorded', async ({ signedInPage: page }) => {
    await page.goto('/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await templates(token);

    // The seeded templates are drafts: nothing has been through the approval
    // endpoint, so nothing carries an approver.
    const unapproved = rows.filter((r) => r.approvedBy === null);
    expect(unapproved.length, 'the seed leaves templates unapproved').toBeGreaterThan(0);

    // A role name never stands in for a person who approved something.
    await expect(page.getByRole('cell', { name: 'CCO', exact: true })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: 'GC', exact: true })).toHaveCount(0);

    await expect(page.getByText('not approved').first()).toBeVisible({ timeout: 30000 });
  });

  test('will not offer to render an unapproved disclosure, and says why', async ({
    signedInPage: page,
  }) => {
    await page.goto('/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await templates(token);

    const draft = rows.find((r) => r.status !== 'approved');
    expect(draft, 'a template that is not approved is needed').toBeTruthy();

    await page.getByText(draft!.name).first().click();

    // The API refuses this too — asserted below — so the page states the
    // reason rather than only disabling the control.
    await expect(
      page.getByText('A disclosure has to be approved before it can be issued', { exact: false }),
    ).toBeVisible({ timeout: 30000 });

    const res = await fetch(`${API}/disclosures/render`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: draft!.id, context: {} }),
    });
    expect(res.status, 'the API refuses to render an inactive template').toBe(400);
  });

  test('has no send-to-client control, because nothing sends', async ({ signedInPage: page }) => {
    await page.goto('/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await templates(token);
    await page.getByText(rows[0].name).first().click();

    // "Send to N Clients" had delivery-channel checkboxes and no endpoint,
    // on text whose delivery is itself the compliance act.
    await expect(page.getByRole('button', { name: /Send to/ })).toHaveCount(0);
    for (const firm of ['Meridian Capital Group', 'Silverline Credit Union', 'Coastal Bank & Trust']) {
      await expect(page.getByText(firm)).toHaveCount(0);
    }
  });

  test('approving persists, and records who did it', async ({ signedInPage: page }) => {
    await page.goto('/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const created = await createTemplate(token, 'approval');
    expect(created.status).toBe('draft');

    const res = await fetch(`${API}/disclosures/templates/${created.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    const after = (await templates(token)).find((t) => t.id === created.id);
    expect(after?.status).toBe('approved');
    // A real user id, not a role name written into a fixture.
    expect(after?.approvedBy, 'the approver is recorded').toBeTruthy();

    await page.goto('/disclosures');
    await page.getByText(created.name).first().click();
    await expect(page.getByText(`Approved by ${after?.approvedBy}`, { exact: false })).toBeVisible({
      timeout: 30000,
    });
  });

  test('offers no submit-for-review step, because submitting records none', async ({
    signedInPage: page,
  }) => {
    await page.goto('/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await templates(token);

    const draft = rows.find((r) => r.status === 'draft');
    test.skip(draft === undefined, 'every template is already approved in this run');

    // POST /disclosures/templates/:id/submit answers 200 and writes nothing:
    // the service publishes an audit event and its own comment notes that
    // status is derived from approvedBy/approvedAt. The template comes back
    // still a draft, so a button for it would show a change that did not
    // happen.
    const before = draft!.status;
    const res = await fetch(`${API}/disclosures/templates/${draft!.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status, 'the endpoint reports success').toBe(200);

    const after = (await templates(token)).find((t) => t.id === draft!.id);
    expect(after?.status, 'and the status is unchanged').toBe(before);

    await page.getByText(draft!.name).first().click();
    await expect(page.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);
    await expect(
      page.getByText('pending review', { exact: false }).first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test('renders an approved template through the API', async ({ signedInPage: page }) => {
    await page.goto('/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // Its own, so this does not depend on another test having run first.
    const created = await createTemplate(token, 'render');
    await fetch(`${API}/disclosures/templates/${created.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await fetch(`${API}/disclosures/render`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: created.id, context: {} }),
    });
    expect(res.status, 'an approved, active template renders').toBe(200);
  });

  test('does not invent a change history', async ({ signedInPage: page }) => {
    await page.goto('/disclosures');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await templates(token);

    await page.getByText(rows[0].name).first().click();
    await page.getByRole('button', { name: 'Version history' }).click();

    // The old history carried per-version authors and change summaries —
    // "Updated Prime Rate reference language", by "Legal Team". Neither is
    // recorded anywhere.
    await expect(
      page.getByText('Change summaries and per-version authors are not recorded'),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Updated Prime Rate reference language')).toHaveCount(0);
  });
});
