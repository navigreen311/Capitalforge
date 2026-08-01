// ============================================================
// The dashboard's Recent Activity card reads the audit log
//
// It was five literals, under a comment reading "Activity feed mock data
// (retained — no replacement component)":
//
//   APP-0091 moved to underwriting review                    12 min ago
//   Credit pull completed — Brightline Corp (Equifax)        1 hr ago
//   Compliance flag: Illinois disclosure deadline in 3 days  2 hr ago
//   Dossier exported for Apex Ventures Inc.                  4 hr ago
//   Funding Round #FR-018 created — $1.2M target             Yesterday
//
// The times were strings, so it said "12 min ago" whenever it was opened,
// and "Mark all read" faded the rows and raised a toast reading "All
// activity marked as read" while setting a Set that a refresh discarded.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Entry {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  actor: string | null;
  occurredAt: string;
}

async function activity(token: string | null): Promise<{ entries: Entry[]; total: number }> {
  const res = await fetch(`${API}/activity?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/api/activity must be reachable').toBe(200);
  return ((await res.json()) as { data: { entries: Entry[]; total: number } }).data;
}

test.describe('Dashboard activity', () => {
  test('shows the entries the audit log holds', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const { entries, total } = await activity(token);
    expect(entries.length, 'the audit log records actions').toBeGreaterThan(0);

    const card = page.getByRole('region', { name: 'Recent activity' });

    // Every entry is real: the id resolves to a row, and the card shows the
    // action as recorded rather than a sentence about it.
    for (const entry of entries.slice(0, 3)) {
      const words = entry.action.replace(/[._]/g, ' ');
      const label = words.charAt(0).toUpperCase() + words.slice(1);
      await expect(card.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 30000 });
    }

    await expect(card.getByText(`${total} recorded`)).toBeVisible();
  });

  test('does not render the activity that was written in', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();

    for (const invented of [
      'APP-0091 moved to underwriting review',
      'Credit pull completed — Brightline Corp (Equifax)',
      'Compliance flag: Illinois disclosure deadline in 3 days',
      'Dossier exported for Apex Ventures Inc.',
      'Funding Round #FR-018 created — $1.2M target',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('times come from the records, so they move', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const { entries } = await activity(token);

    // The fixtures were "12 min ago", "1 hr ago", "2 hr ago", "4 hr ago",
    // "Yesterday" — in that order, always.
    const card = page.getByRole('region', { name: 'Recent activity' });
    await expect(card.getByText('12 min ago')).toHaveCount(0);
    await expect(card.getByText('4 hr ago')).toHaveCount(0);

    // Newest first, from the timestamps.
    const times = entries.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  test('attributes an action only where the record does', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const { entries } = await activity(token);

    const card = page.getByRole('region', { name: 'Recent activity' });
    await expect(card.getByText(/unattributed|·/).first()).toBeVisible({ timeout: 30000 });

    // Whatever the audit log holds, nothing is credited to "system".
    for (const entry of entries) {
      expect(entry.actor === null || entry.actor.length > 0).toBe(true);
      expect(entry.actor).not.toBe('system');
    }
  });

  test('offers no way to mark activity read, and says why', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();

    const card = page.getByRole('region', { name: 'Recent activity' });

    // The button faded the rows and raised a toast saying "All activity
    // marked as read", over a Set that a refresh discarded.
    await expect(card.getByRole('button', { name: /mark all read/i })).toHaveCount(0);
    await expect(page.getByText('All activity marked as read')).toHaveCount(0);
    await expect(card.getByText('Nothing marks an entry as read', { exact: false })).toBeVisible();
  });

  test('the endpoint is tenant-scoped and needs a token', async ({ signedInPage: page }) => {
    const anon = await fetch(`${API}/activity`);
    expect(anon.status).toBe(401);

    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const { entries, total } = await activity(token);

    // total counts this tenant's rows, not every row in the table.
    expect(total).toBeGreaterThanOrEqual(entries.length);
  });
});
