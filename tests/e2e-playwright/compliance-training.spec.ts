// ============================================================
// /compliance/training — certification status reads the database
//
// The page carried five training modules with their own due dates,
// completion flags and scores, and an advisor grid: five named people
// against those modules with every cell filled in. A completed compliance
// module is the evidence that somebody was trained.
//
// This is the page the sidebar links to, so it carries the working surface.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Certification {
  id: string;
  userId: string;
  trackName: string;
  status: string;
  score: number | null;
  expiresAt: string | null;
  certificateRef: string | null;
}

async function certifications(token: string | null): Promise<Certification[]> {
  const res = await fetch(`${API}/training/certifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Certification[] }).data;
}

test.describe('Compliance training status', () => {
  test('shows this user’s certifications from the API', async ({ signedInPage: page }) => {
    await page.goto('/compliance/training');
    await expect(page.getByRole('heading', { name: 'Compliance Training' })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const mine = await certifications(token);
    expect(mine.length, 'the seed records certifications for this user').toBeGreaterThan(0);

    const passed = mine.find((c) => c.status === 'passed');
    expect(passed).toBeTruthy();
    await expect(page.getByText('Passed').first()).toBeVisible({ timeout: 30000 });
    if (passed!.score !== null) {
      await expect(page.getByRole('cell', { name: String(passed!.score) })).toBeVisible();
    }
  });

  test('does not render the modules or advisors that were hardcoded', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/training');
    await expect(page.getByRole('heading', { name: 'Compliance Training' })).toBeVisible();

    // Five modules with their own due dates and scores.
    for (const invented of ['TCPA Compliance', 'UDAP Guidelines', 'AML Basics']) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }

    // Five named people, every cell filled in.
    for (const advisor of ['Sarah Chen', 'Marcus Johnson', 'Emily Rodriguez', 'David Kim']) {
      await expect(page.getByText(advisor)).toHaveCount(0);
    }

    await expect(page.getByText('No advisor grid', { exact: false })).toBeVisible();
  });

  test('offers to record a score only on the caller’s own unfinished track', async ({
    signedInPage: page,
  }) => {
    await page.goto('/compliance/training');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const mine = await certifications(token);
    const inProgress = mine.find((c) => c.status === 'in_progress');
    expect(inProgress, 'the seed leaves one track in progress for this user').toBeTruthy();

    // Offered once, for the in-progress track — not for the one already
    // passed and not lapsed.
    await expect(page.getByRole('button', { name: 'Record a score' })).toHaveCount(1);
  });

  test('refuses a score outside the range, on both sides', async ({ signedInPage: page }) => {
    await page.goto('/compliance/training');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const mine = await certifications(token);
    const inProgress = mine.find((c) => c.status === 'in_progress');
    expect(inProgress).toBeTruthy();

    // The API rejects it, so nothing is recorded and the seeded state is
    // unchanged. Deliberately not completing the certification here:
    // completing is irreversible through this API, and a test that consumes
    // seeded state passes once and drifts afterwards.
    const res = await fetch(`${API}/training/certifications/${inProgress!.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 140 }),
    });
    expect(res.status).toBe(400);

    const after = await certifications(token);
    expect(after.find((c) => c.id === inProgress!.id)?.status).toBe('in_progress');

    // And the page guards before sending.
    await page.getByRole('button', { name: 'Record a score' }).click();
    const field = page.getByLabel(/^Score for /);
    await field.fill('140');
    await page.getByRole('button', { name: 'Record' }).click();
    await expect(page.getByText('Enter a whole score between 0 and 100')).toBeVisible();
  });

  test('says the score is self-entered and unattributed', async ({ signedInPage: page }) => {
    await page.goto('/compliance/training');
    await expect(page.getByRole('heading', { name: 'Compliance Training' })).toBeVisible();

    // No assessment runs, and nothing records who typed the number.
    await expect(
      page.getByText('no assessment is run, and nothing records who typed it', { exact: false }),
    ).toBeVisible();
  });

  test('says completing is not scoped to the caller by the API', async ({ signedInPage: page }) => {
    await page.goto('/compliance/training');
    await expect(page.getByRole('heading', { name: 'Compliance Training' })).toBeVisible();

    // completeCertification looks the record up by id and tenant only, so a
    // caller with compliance write access can complete somebody else's. The
    // page only offers its own, and says the gap is in the API.
    await expect(
      page.getByText('can complete somebody else', { exact: false }),
    ).toBeVisible();
  });

  test('shows renewal timing from the record', async ({ signedInPage: page }) => {
    await page.goto('/compliance/training');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const mine = await certifications(token);
    const nonExpiring = mine.find((c) => c.status === 'passed' && c.expiresAt === null);
    expect(nonExpiring, 'the onboarding track does not expire').toBeTruthy();

    // A track that does not expire says so, rather than showing a blank that
    // reads as a missing date.
    await expect(page.getByText('does not expire').first()).toBeVisible({ timeout: 30000 });
  });

  test('does not tick modules within a track', async ({ signedInPage: page }) => {
    await page.goto('/compliance/training');
    await expect(page.getByRole('heading', { name: 'Compliance Training' })).toBeVisible();

    // Certification is recorded per track as a whole; nothing records
    // progress through the modules inside one.
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByText('No module grid', { exact: false })).toBeVisible();
  });
});
