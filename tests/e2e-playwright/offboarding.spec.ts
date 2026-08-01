// ============================================================
// /offboarding — workflows and retention read the database
//
// The page carried four workflows with their data steps ticked off — "PII
// anonymization ✓, Credit file purge ✓" — which is the answer to "did you
// erase my data".
//
// Nothing in this file triggers a deletion. It is real and irreversible: it
// nulls SSNs, dates of birth and addresses on every business owner and
// rewrites every user's email and password hash for the tenant. Running it
// here would destroy the seeded login the whole suite signs in with.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Workflow {
  id: string;
  businessId: string | null;
  offboardingType: string;
  status: string;
  dataExportCompleted: boolean;
  dataDeletionStatus: string;
  deletionProofHash: string | null;
}

async function workflows(token: string | null): Promise<Workflow[]> {
  const res = await fetch(`${API}/offboarding`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/api/offboarding must be reachable').toBe(200);
  return ((await res.json()) as { data: Workflow[] }).data;
}

test.describe('Offboarding', () => {
  test('shows the workflows the API returns', async ({ signedInPage: page }) => {
    await page.goto('/offboarding');
    await expect(page.getByRole('heading', { name: 'Offboarding' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await workflows(token);
    expect(rows.length, 'the seed records offboarding workflows').toBeGreaterThan(0);

    for (const row of rows) {
      await expect(page.getByText(row.id).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the workflows that used to be hardcoded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    await expect(page.getByRole('heading', { name: 'Offboarding' })).toBeVisible();

    for (const invented of [
      'NovaBridge Capital (Tenant)',
      'Horizon Retail Partners',
      'Summit Capital Group',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('claims no deletion that has not run', async ({ signedInPage: page }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await workflows(token);

    // The seed deliberately completes no deletion, because completing one
    // means running it against the demo data.
    expect(
      rows.every((r) => r.dataDeletionStatus !== 'completed'),
      'no seeded workflow claims a completed deletion',
    ).toBe(true);

    await expect(page.getByText('Not deleted').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Deleted', { exact: true })).toHaveCount(0);
  });

  test('shows no per-step deletion ticks, because none are recorded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await workflows(token);

    // The record holds one deletion status for the whole workflow.
    for (const step of [
      'Consent revocation',
      'PII anonymization',
      'Credit file purge',
      'Audit log archival',
      'Database partition wipe',
    ]) {
      await expect(page.getByText(step)).toHaveCount(0);
    }

    await page.getByText(rows[0].id).first().click();
    await expect(
      page.getByText('There are no per-step states', { exact: false }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows the retention exceptions the API computes, per jurisdiction', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const gdpr = await fetch(`${API}/offboarding/retention?jurisdiction=gdpr`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { exceptions: { table: string }[] } }).data.exceptions);

    const ccpa = await fetch(`${API}/offboarding/retention?jurisdiction=ccpa`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { exceptions: { table: string }[] } }).data.exceptions);

    // GDPR adds the consent-records exception; the jurisdictions genuinely
    // differ, so the selector is not decorative.
    expect(gdpr.length).toBeGreaterThan(ccpa.length);

    await page.getByLabel('Jurisdiction').selectOption('gdpr');
    for (const exception of gdpr) {
      await expect(page.getByText(exception.table).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the retention schedule that was invented', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    await expect(page.getByRole('heading', { name: 'Offboarding' })).toBeVisible();

    // Seven data classes with retention periods and delete-after dates.
    for (const invented of [
      'Loan application records',
      'KYB/KYC identity documents',
      'Communication transcripts',
      'CFPB exam readiness',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
    await expect(
      page.getByText('not a general retention schedule', { exact: false }),
    ).toBeVisible();
  });

  test('offers no way to trigger a deletion', async ({ signedInPage: page }) => {
    await page.goto('/offboarding');
    await expect(page.getByRole('heading', { name: 'Offboarding' })).toBeVisible();

    // The deletion is irreversible and guarded by a server-derived token; a
    // dashboard should not be able to produce it.
    await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /purge|erase|wipe/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Running a deletion' })).toBeVisible();
  });

  test('the deletion endpoint refuses a wrong confirmation token', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await workflows(token);

    // A deliberately wrong token, so the guard is exercised without any
    // chance of the deletion running.
    const res = await fetch(`${API}/offboarding/${rows[0].id}/delete-data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jurisdiction: 'ccpa', confirmationToken: 'DEFINITELY-NOT-THE-TOKEN' }),
    });
    expect(res.status, 'a wrong token is refused').toBeGreaterThanOrEqual(400);

    // And nothing changed.
    const after = await workflows(token);
    expect(after.find((w) => w.id === rows[0].id)?.dataDeletionStatus).toBe(
      rows[0].dataDeletionStatus,
    );
    expect(after.find((w) => w.id === rows[0].id)?.deletionProofHash).toBeNull();
  });

  test('the workflow list is reachable, which it was not before', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // Only a lookup by id existed, so a page listing what is in progress had
    // nothing to read. Registered before /offboarding/:id so the literal path
    // is not swallowed by the parameter.
    const res = await fetch(`${API}/offboarding`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const retention = await fetch(`${API}/offboarding/retention`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(retention.status, '/offboarding/retention must not bind as an id').toBe(200);
  });
});
