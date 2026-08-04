// ============================================================
// The notification bell reads records
//
// The bell sat in the header of every page reporting "4 unread" from a
// constant, over five literals: "APR Expiry — Thornwood Capital / Chase
// ****4821 expires in 5 days", "Compliance flag — James Park call", "Deal
// committee review needed — Apex Ventures $250K awaiting decision". Their
// timestamps were written in as strings, so they said "2h ago" whenever you
// looked, and clicking one navigated to a client that does not exist.
//
// Behind it, GET /api/notifications served ten more invented items from an
// array held in the API process. A token was required — the global auth gate
// covered it — but the router had no tenant context, so every authenticated
// caller of every tenant received the same ten.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Item {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  occurredAt: string | null;
  href: string | null;
}

async function notifications(token: string | null): Promise<Item[]> {
  const res = await fetch(`${API}/notifications?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/api/notifications must be reachable').toBe(200);
  return ((await res.json()) as { data: { notifications: Item[] } }).data.notifications;
}

test.describe('Notifications', () => {
  test('the endpoint requires a token', async () => {
    // Not a change — the global auth gate already covered this router. Held
    // here because the router now carries tenantMiddleware of its own, and
    // that is what must not regress: the previous version had no tenant
    // context, so every authenticated caller saw the same ten items.
    const res = await fetch(`${API}/notifications`);
    expect(res.status).toBe(401);

    const count = await fetch(`${API}/notifications/count`);
    expect(count.status).toBe(401);
  });

  test('shows the items the API derives, and each one is real', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const items = await notifications(token);

    // Each id names the record it came from: apr:<applicationId>,
    // complaint:<id>, offboarding:<id> and so on.
    for (const item of items) {
      expect(item.id).toMatch(/^(apr|invoice|complaint|regulatory|consent|offboarding):.+/);
    }

    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByRole('heading', { name: 'Open items' })).toBeVisible();

    if (items.length === 0) {
      await expect(page.getByText('Nothing outstanding', { exact: false })).toBeVisible();
      return;
    }
    for (const item of items.slice(0, 3)) {
      await expect(page.getByText(item.title, { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });
    }
  });

  test('the seeded data really does produce something to act on', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const items = await notifications(token);

    // Not an assertion about the count — an assertion that the derivation is
    // wired to real tables rather than returning an empty list that would
    // pass every other check here.
    expect(items.length, 'the seed leaves records that need attention').toBeGreaterThan(0);

    const offboarding = items.filter((i) => i.type === 'offboarding');
    expect(
      offboarding.length,
      'the seed leaves offboarding workflows with deletions outstanding',
    ).toBeGreaterThan(0);

    const workflows = await fetch(`${API}/offboarding`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { id: string }[] }).data.map((w) => `offboarding:${w.id}`));
    for (const item of offboarding) expect(workflows).toContain(item.id);
  });

  test('does not render the notifications that were invented', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByRole('heading', { name: 'Open items' })).toBeVisible();

    for (const invented of [
      'APR Expiry — Thornwood Capital',
      'Compliance flag — James Park call',
      'Deal committee review needed',
      'Consent expired — Brightline Corp',
      'Re-stack opportunity — Meridian Holdings',
      'Sam Delgado',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }

    // The endpoint's own set is gone too.
    const raw = JSON.stringify(await (await fetch(`${API}/notifications`, {
      headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('cf_access_token'))}` },
    })).json());
    expect(raw).not.toContain('Sam Delgado');
    expect(raw).not.toContain('CapitalForge v2.4 deployed');
  });

  test('offers no way to mark anything read, and says why', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByRole('heading', { name: 'Open items' })).toBeVisible();

    // "Mark all read" mutated an array in the API process, so it changed what
    // every other caller saw and a restart undid it.
    //
    // Scoped to the panel: the dashboard behind it has a Mark all read of its
    // own, over a separate fixture list, which is not what this is about.
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByRole('button', { name: /mark all read/i })).toHaveCount(0);
    await expect(panel.getByText('Nothing marks one as read', { exact: false })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    for (const path of ['/notifications/read-all', '/notifications/n-1/read']) {
      const res = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status, `${path} must not exist`).toBe(404);
    }
  });

  test('the badge count matches what the list holds', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const outstanding = await fetch(`${API}/notifications/count`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { outstanding: number } }).data.outstanding);

    const items = await notifications(token);
    expect(outstanding).toBe(items.length);

    // It used to be useState(4) — every page opened with four waiting.
    //
    // Polled, not read once. The bell's count starts null and is filled in by
    // a fetch, so its label is a bare "Notifications" until that resolves.
    // getAttribute() is a single read and does not retry, so this raced the
    // component's own request and failed whenever the read won — which is
    // exactly what it did once on master and not again on two later runs.
    // toHaveAttribute polls, so it waits for the count rather than sampling
    // whatever was there at that instant.
    const bell = page.getByRole('button', { name: /Notifications/ });
    await expect(bell).toHaveAttribute('aria-label', new RegExp(`\\b${outstanding}\\b`));

    // And never the old wording, which counted unread rather than outstanding.
    const label = await bell.getAttribute('aria-label');
    expect(label).not.toContain('unread');
  });
});
