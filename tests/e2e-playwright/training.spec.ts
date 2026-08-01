// ============================================================
// /training — certifications and the catalogue read the database
//
// The page carried three tracks with their own modules and a per-advisor
// progress table showing completed certifications with expiry dates. A
// completed certification is the evidence that mandatory training was done.
// Nobody sat any of it.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

interface Certification {
  id: string;
  trackName: string;
  status: string;
  score: number | null;
  completedAt: string | null;
  expiresAt: string | null;
}

interface Track {
  name: string;
  label: string;
  modules: { id: string; title: string; lessons: string[] }[];
  prerequisiteTracks: string[];
}

async function certifications(token: string | null): Promise<Certification[]> {
  const res = await fetch(`${API}/training/certifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/training/certifications must be reachable').toBe(200);
  return ((await res.json()) as { data: Certification[] }).data;
}

async function tracks(token: string | null): Promise<Track[]> {
  const res = await fetch(`${API}/training/tracks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, '/training/tracks must be reachable').toBe(200);
  return ((await res.json()) as { data: Track[] }).data;
}

test.describe('Training and certification', () => {
  test('shows the catalogue the API publishes', async ({ signedInPage: page }) => {
    await page.goto('/training');
    await expect(page.getByRole('heading', { name: /Training/ })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const catalogue = await tracks(token);
    expect(catalogue.length, 'tracks are published').toBeGreaterThan(0);

    for (const track of catalogue) {
      await expect(page.getByText(track.label).first()).toBeVisible({ timeout: 30000 });
    }
  });

  test('does not render the tracks that used to be hardcoded', async ({ signedInPage: page }) => {
    await page.goto('/training');
    await expect(page.getByRole('heading', { name: /Training/ })).toBeVisible();

    for (const invented of [
      'New Advisor Onboarding',
      'Annual Compliance Recertification',
      'Introduction to Commercial Lending Compliance',
      'Platform Tools & Workflow Certification',
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }
  });

  test('shows this user’s own certification, from the API', async ({ signedInPage: page }) => {
    await page.goto('/training');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const mine = await certifications(token);
    const passed = mine.find((c) => c.status === 'passed');
    expect(passed, 'the seed records a passed certification for this user').toBeTruthy();

    await expect(page.getByText('Passed').first()).toBeVisible({ timeout: 30000 });
    if (passed!.score !== null) {
      await expect(page.getByText(`your score ${passed!.score}`)).toBeVisible();
    }
  });

  test('does not show a team progress table', async ({ signedInPage: page }) => {
    await page.goto('/training');
    await expect(page.getByRole('heading', { name: /Training/ })).toBeVisible();

    // Four advisors with completion counts and expiry dates, none recorded.
    for (const advisor of ['Jordan M.', 'Casey R.', 'Alex T.', 'Morgan P.']) {
      await expect(page.getByText(advisor)).toHaveCount(0);
    }
    await expect(
      page.getByText('no endpoint lists users', { exact: false }),
    ).toBeVisible();
  });

  test('publishes no enforcement cases, through either endpoint', async ({
    signedInPage: page,
  }) => {
    await page.goto('/training');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    // Both payloads, checked at the wire rather than only on screen: the
    // certification response embeds the track definition, so stripping the
    // catalogue alone would still have sent them.
    for (const path of ['/training/tracks', '/training/certifications']) {
      const raw = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.text());

      expect(raw, `${path} must not carry invented case parties`).not.toContain('Pinnacle');
      expect(raw, `${path} must not carry docket references`).not.toContain('sourceRef');
      expect(raw).not.toContain('civil money penalty');
    }

    await expect(page.getByText('FTC v. Pinnacle Business Capital')).toHaveCount(0);
    await expect(page.getByText('FTC-X-2021-0041')).toHaveCount(0);
  });

  test('keeps the lesson from each case', async ({ signedInPage: page }) => {
    await page.goto('/training');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const catalogue = await tracks(token);
    const withLesson = catalogue
      .flatMap((t) => t.modules)
      .find((m) => m.lessons.length > 0);
    expect(withLesson, 'modules carry takeaways').toBeTruthy();

    // The advice survives even though the attribution does not.
    await page.getByText(catalogue[0].label).first().click();
    await expect(page.getByText('Takeaways').first()).toBeVisible({ timeout: 30000 });
  });

  test('states a prerequisite that is not currently held', async ({ signedInPage: page }) => {
    await page.goto('/training');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const catalogue = await tracks(token);
    const mine = await certifications(token);
    const held = new Set(mine.filter((c) => c.status === 'passed').map((c) => c.trackName));

    const blocked = catalogue.find(
      (t) => t.prerequisiteTracks.length > 0 && t.prerequisiteTracks.some((p) => !held.has(p)),
    );
    const satisfied = catalogue.find(
      (t) => t.prerequisiteTracks.length > 0 && t.prerequisiteTracks.every((p) => held.has(p)),
    );

    // The seeded user holds onboarding, so the annual track's prerequisite is
    // met and the advanced track's is not.
    expect(blocked ?? satisfied, 'a track with prerequisites is published').toBeTruthy();

    if (blocked !== undefined) {
      await expect(page.getByText('Requires a current', { exact: false }).first()).toBeVisible({
        timeout: 30000,
      });
    }
  });

  test('does not mark modules off, because nothing records that', async ({
    signedInPage: page,
  }) => {
    await page.goto('/training');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const catalogue = await tracks(token);

    await page.getByText(catalogue[0].label).first().click();

    // Each module used to carry a completed flag and a completion date.
    // Certification is recorded as a whole, not module by module.
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(
      page.getByText('Nothing records progress within a track', { exact: false }),
    ).toBeVisible();
  });
});
