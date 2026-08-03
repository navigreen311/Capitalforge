// ============================================================
// /platform/offboarding — the deletion audit trail is the real one
//
// This is the route the sidebar links to. It carried five offboarding
// requests and, per request, an audit trail of an erasure: timestamps to the
// second, per-class record counts, "Credit data RETAINED — Regulatory 7-year
// hold". A button turned that into a downloadable DATA DELETION CERTIFICATE.
//
// The endpoint behind it was manufacturing too — it read a stage out of an
// object held in the running process, walked a fixed list up to it, and
// stamped each entry Date.now() minus an hour per step, attributed to
// "system". Any id at all produced a full trail.
//
// Nothing in this file triggers a deletion. It is real and irreversible: it
// nulls SSNs, dates of birth and addresses on every business owner and
// rewrites every user's email and password hash for the tenant. Running it
// here would destroy the seeded login the whole suite signs in with.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface AuditBody {
  success: boolean;
  data?: { offboardingId: string; entries: { id: string; action: string }[]; totalEntries: number };
}

async function firstWorkflowId(token: string | null): Promise<string> {
  const res = await fetch(`${API}/offboarding`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  const rows = ((await res.json()) as { data: { id: string }[] }).data;
  expect(rows.length, 'the seed records offboarding workflows').toBeGreaterThan(0);
  return rows[0].id;
}

test.describe('Platform offboarding', () => {
  test('renders the same view as /offboarding, from the API', async ({ signedInPage: page }) => {
    // Two pages over the same subject, each with its own fixtures, is how one
    // came to show a client's data as deleted while the other showed it held.
    await page.goto('/platform/offboarding');
    await expect(page.getByRole('heading', { name: 'Offboarding' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const id = await firstWorkflowId(token);
    await expect(page.getByText(id).first()).toBeVisible({ timeout: 30000 });
  });

  test('does not render the requests or the erasure log that were invented', async ({
    signedInPage: page,
  }) => {
    await page.goto('/platform/offboarding');
    await expect(page.getByRole('heading', { name: 'Offboarding' })).toBeVisible();

    for (const invented of [
      'SilverPeak Solutions',
      'RedLine Logistics',
      'Coastal Commerce LLC',
      'Credit data RETAINED',
      'Legal hold - active litigation',
      'Pending dispute resolution',
      'Ledger events deleted',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('offers no deletion certificate, and says why', async ({ signedInPage: page }) => {
    await page.goto('/platform/offboarding');
    await expect(page.getByRole('heading', { name: 'Offboarding' })).toBeVisible();

    // The download assembled a DATA DELETION CERTIFICATE from the fixtures —
    // a document attesting to an erasure that had not happened.
    await expect(page.getByRole('button', { name: /certificate/i })).toHaveCount(0);
    await expect(
      page.getByText('no deletion certificate to download', { exact: false }),
    ).toBeVisible();
  });

  test('the audit trail shown is whatever audit_logs holds, including nothing', async ({
    signedInPage: page,
  }) => {
    await page.goto('/platform/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const id = await firstWorkflowId(token);

    const body = (await fetch(`${API}/platform/offboarding/${id}/audit-log`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as AuditBody;

    expect(body.success).toBe(true);
    expect(body.data?.totalEntries).toBe(body.data?.entries.length);

    // The seed writes its workflows straight to the table, so no audit rows
    // exist for them. The manufactured version produced four entries anyway.
    await page.getByText(id).first().click();
    const expected =
      body.data!.entries.length === 0
        ? 'Nothing has been recorded against this workflow yet.'
        : body.data!.entries[0].action.replace(/_/g, ' ');
    await expect(page.getByText(expected, { exact: false })).toBeVisible({ timeout: 30000 });
  });

  test('an audit trail for a workflow that does not exist is a 404, not a trail', async ({
    signedInPage: page,
  }) => {
    await page.goto('/platform/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // Because the entries were generated from a stage list rather than read,
    // any id produced a complete record of an erasure.
    const res = await fetch(`${API}/platform/offboarding/no-such-workflow/audit-log`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as AuditBody & { error?: { code: string } };
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
  });

  test('advancing a stage answers 501 and moves nothing', async ({ signedInPage: page }) => {
    await page.goto('/platform/offboarding');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const id = await firstWorkflowId(token);

    const before = await fetch(`${API}/offboarding/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk);

    // It used to answer 200 after moving a counter in memory, which no other
    // process — and no later request to a different worker — could see.
    const res = await fetch(`${API}/platform/offboarding/${id}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'data_deletion' }),
    });
    expect(res.status).toBe(501);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_IMPLEMENTED');

    const after = await fetch(`${API}/offboarding/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk);
    expect((after as { data: { status: string } }).data.status).toBe(
      (before as { data: { status: string } }).data.status,
    );
  });

  test('the page offers no way to trigger a deletion', async ({ signedInPage: page }) => {
    await page.goto('/platform/offboarding');
    await expect(page.getByRole('heading', { name: 'Offboarding' })).toBeVisible();

    await expect(page.getByRole('button', { name: /delete|purge|erase|wipe/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Running a deletion' })).toBeVisible();
  });
});
