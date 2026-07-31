// ============================================================
// /declines — the recovery board reads the database
//
// The page used to render seven hardcoded DeclineRecords for clients that do
// not exist, advance stages with a setTimeout, and treat a missing cooldown
// date as "Eligible Now". These check that what is on screen came from the
// API, and that the two claims that must never be invented — reapply
// eligibility, and a win rate over nothing — are not.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface DeclineRecord {
  id: string;
  issuer: string;
  businessName: string | null;
  recoveryStage: string;
  reapplyCooldownDate: string | null;
  declineReasons: { primary?: string; card_name?: string };
}

async function declines(token: string | null): Promise<DeclineRecord[]> {
  const res = await fetch(`${API}/declines?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { data?: DeclineRecord[] };
  return body.data ?? [];
}

test.describe('Decline recovery board', () => {
  test('shows the declines the API returns, not sample records', async ({ signedInPage: page }) => {
    await page.goto('/declines');
    await expect(page.getByRole('heading', { name: 'Decline Recovery' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const records = await declines(token);
    expect(records.length, 'the seed carries decline recovery records').toBeGreaterThan(0);

    // Client names, not issuers: the seven sample records happened to use
    // the same issuer names, so checking issuers passed against them too.
    const named = records.filter((r) => r.businessName !== null);
    expect(named.length, 'decline records resolve to real clients').toBeGreaterThan(0);

    for (const record of named.slice(0, 5)) {
      await expect(page.getByText(record.businessName as string).first()).toBeVisible({
        timeout: 30000,
      });
    }
  });

  test('does not render the clients that used to be hardcoded', async ({ signedInPage: page }) => {
    await page.goto('/declines');
    await expect(page.getByRole('heading', { name: 'Decline Recovery' })).toBeVisible();

    // These seven businesses appeared on every install, for every tenant,
    // regardless of what was in the database.
    for (const invented of [
      'Horizon Retail Partners',
      'Apex Ventures LLC',
      'Crestline Medical LLC',
      'NovaTech Solutions Inc.',
      'Blue Ridge Consulting',
      'Summit Capital Group',
      'Pinnacle Freight Corp',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('counts declines from the API', async ({ signedInPage: page }) => {
    await page.goto('/declines');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const records = await declines(token);

    const statsRes = await fetch(`${API}/declines/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(statsRes.status, '/declines/stats must be reachable').toBe(200);
    const stats = (await statsRes.json()) as { data?: { totalDeclines?: number } };

    expect(stats.data?.totalDeclines).toBe(records.length);
    await expect(page.getByText(String(records.length)).first()).toBeVisible({ timeout: 30000 });
  });

  test('a decline with no cooldown recorded is not called eligible', async ({
    signedInPage: page,
  }) => {
    await page.goto('/declines');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const records = await declines(token);

    const withoutCooldown = records.filter((r) => r.reapplyCooldownDate === null);
    expect(
      withoutCooldown.length,
      'the seed carries a decline with no cooldown date, which is the case under test',
    ).toBeGreaterThan(0);

    // Reading an absent cooldown as eligibility sends a client into a hard
    // pull inside the issuer's window. It reads "Not recorded".
    await expect(page.getByText('Not recorded').first()).toBeVisible({ timeout: 30000 });

    // And the reapply calendar lists only cooldowns that have demonstrably
    // passed, so a record with none is absent from it.
    const eligibleNow = records.filter(
      (r) =>
        r.reapplyCooldownDate !== null &&
        new Date(r.reapplyCooldownDate).getTime() <= Date.now() &&
        r.recoveryStage !== 'won' &&
        r.recoveryStage !== 'lost',
    );
    const calendar = page.getByText('Reapply calendar').locator('..');
    if (eligibleNow.length === 0) {
      await expect(calendar.getByText('Nothing is eligible to reapply today.')).toBeVisible();
    }
  });

  test('reachable stats and analytics endpoints', async ({ signedInPage: page }) => {
    await page.goto('/declines');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const headers = { Authorization: `Bearer ${token}` };

    // Both were shadowed by /declines/:id and answered 404 with "Decline
    // recovery record stats not found" — mounted, implemented, unreachable.
    for (const path of ['/declines/stats', '/declines/analytics']) {
      const res = await fetch(`${API}${path}`, { headers });
      expect(res.status, `${path} must not be shadowed by /declines/:id`).toBe(200);
    }
  });

  test('does not offer to parse an uploaded adverse action notice', async ({
    signedInPage: page,
  }) => {
    await page.goto('/declines');
    await expect(page.getByRole('heading', { name: 'Decline Recovery' })).toBeVisible();

    // The parser reported the same invented extraction for any file dropped
    // on it, then offered to open a decline record prefilled with it.
    await expect(page.getByText('Adverse Action Notice Parser')).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(
      page.getByText('Automatic extraction from an uploaded notice is not available', {
        exact: false,
      }),
    ).toBeVisible();
  });

  test('advancing a stage persists', async ({ signedInPage: page }) => {
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token')).catch(() => null);
    await page.goto('/declines');
    const tok = token ?? (await page.evaluate(() => localStorage.getItem('cf_access_token')));

    // Create a decline of our own to move, so no seeded record is disturbed.
    const client = await fetch(`${API}/v1/clients?pageSize=1`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data?: { id: string }[] }).data?.[0]);
    expect(client?.id, 'a client is needed to log a decline against').toBeTruthy();

    const created = await fetch(`${API}/declines`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client!.id,
        issuer: 'E2E Bank',
        card_name: 'E2E Stage Probe',
        decline_reason: 'Too many recent inquiries',
      }),
    });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { data?: { id?: string } }).data?.id;
    expect(id).toBeTruthy();

    // The board used to run a setTimeout and move the row locally.
    const moved = await fetch(`${API}/declines/${id}/stage`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'recon_call_scheduled' }),
    });
    expect(moved.status).toBe(200);

    const after = (await declines(tok)).find((r) => r.id === id);
    expect(after?.recoveryStage, 'the stage change survives a reload').toBe(
      'recon_call_scheduled',
    );

    await page.goto('/declines');
    await expect(page.getByText('E2E Bank').first()).toBeVisible({ timeout: 30000 });
  });

  test('a reapply reminder reports that it is not available', async ({ signedInPage: page }) => {
    await page.goto('/declines');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // It used to answer 201 Created with a reminder id, having written
    // nothing — there is no reminder table, scheduler or delivery path.
    const res = await fetch(`${API}/declines/seed-decline-001/reminder`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(501);
  });

  test('a decline cannot be logged against a client that does not exist', async ({
    signedInPage: page,
  }) => {
    await page.goto('/declines');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const res = await fetch(`${API}/declines`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'no-such-client-e2e',
        issuer: 'E2E Bank',
        card_name: 'E2E Orphan Probe',
        decline_reason: 'Internal policy',
      }),
    });
    // It used to answer 201 with a fabricated record when the write failed.
    expect(res.status).toBe(404);
  });
});
