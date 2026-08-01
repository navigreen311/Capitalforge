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
    //
    // On an environment with no DELETION_CONFIRM_SECRET set — which is every
    // environment this suite runs in — the refusal comes earlier still, from
    // the secret check. Either way the answer is a refusal and nothing is
    // touched; which of the two guards fired is asserted in the unit tests.
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

  test('refuses to delete at all until the deletion secrets are configured', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await workflows(token);

    // The confirmation token used to be HMAC('confirm-secret', tenantId +
    // workflowId) whenever DELETION_CONFIRM_SECRET was unset. Both ids come
    // back from this very API, so the guard on an irreversible erasure was
    // computable by anyone who could read the repository. Unset now means
    // refused, not defaulted.
    const res = await fetch(`${API}/offboarding/${rows[0].id}/delete-data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jurisdiction: 'ccpa', confirmationToken: 'ANYTHING' }),
    });
    expect(res.status).toBe(503);

    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DELETION_NOT_CONFIGURED');

    const after = await workflows(token);
    expect(after.find((w) => w.id === rows[0].id)?.dataDeletionStatus).toBe(
      rows[0].dataDeletionStatus,
    );
  });

  test('a workflow that is not the caller’s is a 404, not a server error', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // The lookup is scoped to the tenant in the token now, rather than being
    // read unscoped and checked afterwards. Anything outside it — including
    // an id that does not exist at all — answers the same way.
    const res = await fetch(`${API}/offboarding/not-a-real-workflow`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);

    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('the export returns the tenant\u2019s actual records', async ({ signedInPage: page }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await workflows(token);

    // The workflow the seed already marks exported, so running this does not
    // change what any other test sees.
    const already = rows.find((r) => r.dataExportCompleted);
    expect(already, 'the seed records one workflow with its export done').toBeTruthy();

    const res = await fetch(`${API}/offboarding/${already!.id}/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        sections: Record<string, { count: number; truncated: boolean; records: unknown[] }>;
        excluded: { what: string; why: string }[];
        recordCount: number;
        truncated: boolean;
      };
    };
    const { sections, excluded, recordCount } = body.data;

    // It used to count three tables and hand back a path to a file nobody
    // wrote: exports/{tenantId}/{workflowId}/data-{timestamp}.zip.
    expect(JSON.stringify(body)).not.toContain('.zip');
    expect(body.data).not.toHaveProperty('exportKey');

    // Real rows: each one resolves through the businesses endpoint, and the
    // name matches. A fabricated export could not do that.
    expect(sections.businesses.records.length).toBeGreaterThan(0);
    for (const record of (sections.businesses.records as { id: string; legalName: string }[]).slice(0, 3)) {
      const fetched = await fetch(`${API}/businesses/${record.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(fetched.status, `exported business ${record.id} must exist`).toBe(200);
      const business = (await fetched.json()) as { data: { business: { legalName: string } } };
      expect(business.data.business.legalName).toBe(record.legalName);
    }

    // The count is the sections, not an unrelated tally.
    const summed = Object.values(sections).reduce((sum, s) => sum + s.count, 0);
    expect(recordCount).toBe(summed);
    for (const s of Object.values(sections)) expect(s.records).toHaveLength(s.count);
  });

  test('the export carries no credentials or firewalled demographics', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await workflows(token);
    const already = rows.find((r) => r.dataExportCompleted);

    const body = await fetch(`${API}/offboarding/${already!.id}/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    // The exported records only. The excluded list names these fields by
    // design — searching the whole document would match the very note saying
    // they were left out.
    const data = (body as { data: { sections: unknown; excluded: { what: string }[] } }).data;
    const records = JSON.stringify(data.sections);
    for (const field of ['passwordHash', 'mfaSecret', 'demographicData']) {
      expect(records, `${field} must not leave in an export`).not.toContain(field);
    }

    // And the document states what it is missing rather than leaving a gap
    // the reader has to notice.
    expect(data.excluded.length).toBeGreaterThan(0);
    expect(data.excluded.map((e) => e.what).join(' ')).toContain('passwordHash');
  });

  test('the export carries the SSN, and declares that it does', async ({
    signedInPage: page,
  }) => {
    await page.goto('/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const rows = await workflows(token);
    const already = rows.find((r) => r.dataExportCompleted);

    const body = (await fetch(`${API}/offboarding/${already!.id}/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json())) as {
      data: {
        sections: Record<string, { records: Record<string, unknown>[] }>;
        sensitiveFields: string[];
        excluded: { what: string }[];
      };
    };

    // A value, not just the field. The seeded owners carry numbers from
    // 987-65-4320 onwards — the block the SSA reserves for fiction and has
    // never issued — so this asserts a real value flows without putting
    // anything that could be a person's number in a test file.
    const owners = body.data.sections.businessOwners.records;
    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) {
      expect(owner).toHaveProperty('ssn');
      expect(String(owner['ssn'])).toMatch(/^987-65-432\d$/);
    }

    // Named, so whoever handles the file knows what is in it.
    expect(body.data.sensitiveFields).toContain('business_owners.ssn');
    expect(body.data.excluded.map((e) => e.what).join(' ')).not.toContain('ssn');
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
