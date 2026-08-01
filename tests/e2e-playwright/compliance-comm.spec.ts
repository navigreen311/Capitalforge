// ============================================================
// /compliance/comm-compliance — consent and do-not-contact read the database
//
// Two of this page's fixtures decided whether contacting somebody is lawful:
// a consent audit giving every business a voice, SMS and email status, and a
// do-not-contact list. Both were literals, and this system can send real SMS.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface DncEntry {
  id: string;
  phoneNumber: string;
  businessId: string | null;
  businessName: string | null;
  source: string;
}

async function dncList(token: string | null): Promise<DncEntry[]> {
  const res = await fetch(`${API}/do-not-call`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/do-not-call must be reachable').toBe(200);
  return ((await res.json()) as { data: DncEntry[] }).data;
}

test.describe('Consent and do-not-contact', () => {
  test('shows consent read per client from the API', async ({ signedInPage: page }) => {
    await page.goto('/compliance/comm-compliance');
    await expect(page.getByRole('heading', { name: /Consent/ })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clients = await fetch(`${API}/v1/clients?pageSize=25`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { id: string; businessName: string }[] }).data);
    expect(clients.length).toBeGreaterThan(0);

    for (const client of clients.slice(0, 3)) {
      await expect(page.getByText(client.businessName).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the consent table that used to be hardcoded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/comm-compliance');
    await expect(page.getByRole('heading', { name: /Consent/ })).toBeVisible();

    for (const invented of [
      'Apex Ventures LLC',
      'Summit Capital Group',
      'Horizon Retail Partners',
      'Crestline Medical LLC',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('a channel with nothing on record is not shown as granted', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/comm-compliance');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const clients = await fetch(`${API}/v1/clients?pageSize=25`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { id: string }[] }).data);

    const consent = await fetch(`${API}/businesses/${clients[0].id}/consent`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { channel: string }[] }).data);

    // The seeded client has email and document consent, and nothing for
    // voice or SMS — which is the case under test.
    const channels = new Set(consent.map((c) => c.channel));
    expect(channels.has('sms'), 'the seed leaves SMS consent unrecorded').toBe(false);

    // "None on record" is neither a refusal nor permission. The old page said
    // "granted" for clients that do not exist, which on a TCPA surface is the
    // assertion that you may dial them.
    await expect(page.getByText('None on record').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('granted', { exact: true })).toHaveCount(0);
  });

  test('reads the do-not-contact list, which had no endpoint before', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/comm-compliance');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const entries = await dncList(token);
    expect(entries.length, 'the seed records suppressions').toBeGreaterThan(0);

    await page.getByRole('button', { name: /Do Not Contact/ }).click();

    for (const entry of entries) {
      await expect(page.getByText(entry.phoneNumber).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('keeps a suppression that matched no client', async ({ signedInPage: page }) => {
    await page.goto('/compliance/comm-compliance');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const entries = await dncList(token);
    const unmatched = entries.find((e) => e.businessId === null);
    expect(unmatched, 'the seed records a suppression with no client match').toBeTruthy();

    await page.getByRole('button', { name: /Do Not Contact/ }).click();

    // Somebody can opt out from a number on no file, and it is still a number
    // the sender must not dial. Dropping it would remove a real protection.
    await expect(page.getByText(unmatched!.phoneNumber)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('no client matched').first()).toBeVisible();
  });

  test('marks a client who is on the suppression list', async ({ signedInPage: page }) => {
    await page.goto('/compliance/comm-compliance');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const entries = await dncList(token);
    const matched = entries.find((e) => e.businessId !== null);
    expect(matched, 'the seed records a suppression matched to a client').toBeTruthy();

    // The consent table and the suppression list are joined, so a client with
    // live consent who has since opted out is visible as both.
    await expect(page.getByText('On the DNC list').first()).toBeVisible({ timeout: 30000 });
  });

  test('does not rebuild the flagged communication log', async ({ signedInPage: page }) => {
    await page.goto('/compliance/comm-compliance');
    await expect(page.getByRole('heading', { name: /Consent/ })).toBeVisible();

    // Eight calls and emails carried compliance flags — no consent, banned
    // claim, missing opt-out — against businesses that do not exist. Nothing
    // records a review of an individual communication.
    for (const invented of [
      'Discussed Q2 credit line increase options',
      'Used phrase "guaranteed approval"',
      'Promotional SMS about new credit builder product launch',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }

    await expect(page.getByRole('heading', { name: 'Communication review log' })).toBeVisible();
    await expect(
      page.getByText('Nothing records a compliance review of an individual communication', {
        exact: false,
      }),
    ).toBeVisible();
  });

  test('does not render the templates with invented approvers', async ({ signedInPage: page }) => {
    await page.goto('/compliance/comm-compliance');
    await expect(page.getByRole('heading', { name: /Consent/ })).toBeVisible();

    // Four templates approved by "Compliance Team" and "Legal Team".
    await expect(page.getByText('Compliance Team')).toHaveCount(0);
    await expect(page.getByText('Legal Team')).toHaveCount(0);
    await expect(page.getByText('Initial Outreach — Credit Line')).toHaveCount(0);
  });

  test('counts consent per channel from what was read', async ({ signedInPage: page }) => {
    await page.goto('/compliance/comm-compliance');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const clients = await fetch(`${API}/v1/clients?pageSize=25`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { id: string }[] }).data);

    let emailActive = 0;
    for (const client of clients.slice(0, 50)) {
      const consent = await fetch(`${API}/businesses/${client.id}/consent`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((b) => (b as { data: { channel: string; status: string }[] }).data);
      if (consent.some((c) => c.channel === 'email' && c.status === 'active')) emailActive += 1;
    }

    await expect(
      page
        .getByText('Email consent')
        .locator('..')
        .getByText(String(emailActive), { exact: true }),
    ).toBeVisible({ timeout: 30000 });
  });
});
