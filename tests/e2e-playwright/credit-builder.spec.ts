// ============================================================
// /credit-builder — the picker offers real clients, and an absent score
// stays absent
//
// The client picker held eight literals under ids cb_001 to cb_008: Apex
// Ventures LLC, NovaGo Solutions, Meridian Holdings and five more. None of
// them exist, so choosing one sent every later request to
// /api/credit-builder/cb_001/scores. The backend answered correctly — 404,
// tenant-scoped, no such client — and the page turned that into a credit
// profile: Paydex 0, a tradeline count of 0, and a projected Tier 1 unlock
// date computed from both.
//
// The coercions that did it were `?? 0` at four call sites, on components
// that already accepted null and rendered it honestly. Plus a constant
// businessAgeMonths of 36, which cleared the two-year Tier 3 threshold for
// every client, against a schema that records no formation date at all.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

/** Seeded: has a Paydex of 80 on record. */
const CLIENT_WITH_SCORE = 'Apex Digital Solutions LLC';
/** Seeded with no business credit file, which is the case under test. */
const CLIENT_WITHOUT_SCORE = 'Meridian Health & Wellness S Corp';

test.describe('Credit builder client picker', () => {
  test('offers the clients the API returns, not eight invented ones', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clients = (await fetch(`${API}/v1/clients?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { businessName: string }[] }).data)) as {
      businessName: string;
    }[];
    expect(clients.length, 'the seed provides clients to offer').toBeGreaterThan(0);

    await page.getByRole('combobox', { name: 'Search clients' }).click();

    // A real one is on the list.
    await expect(
      page.getByText(clients[0]!.businessName).first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test('does not offer the businesses that were invented', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await page.getByRole('combobox', { name: 'Search clients' }).click();

    // These are not clients. One of them, Apex Ventures LLC, is in the list
    // the communications-compliance spec already asserts must never appear,
    // for the same reason.
    for (const invented of [
      'Apex Ventures LLC',
      'NovaGo Solutions',
      'Meridian Holdings',
      'Brightline Corp',
      'Thornwood Capital',
      'Pinnacle Group Inc',
      'Summit Edge Partners',
      'Vanguard Logistics LLC',
    ]) {
      await expect(page.getByText(invented, { exact: true })).toHaveCount(0);
    }
  });
});

test.describe('Credit builder figures', () => {
  async function selectClient(page: import('@playwright/test').Page, name: string) {
    await page.goto('/credit-builder');
    const box = page.getByRole('combobox', { name: 'Search clients' });
    await box.click();
    await box.fill(name);
    await page.getByText(name).first().click();
  }

  test('a client with no business credit file shows no score, not a zero', async ({
    signedInPage: page,
  }) => {
    await selectClient(page, CLIENT_WITHOUT_SCORE);

    // The specific claim this prevents: a Paydex of 0 is a score — the worst
    // one — for a business nobody has pulled a file on.
    await expect(page.getByText('Current Paydex: 0')).toHaveCount(0);
  });

  test('separates a score nobody pulled from one nobody can pull', async ({
    signedInPage: page,
  }) => {
    // All three cards were the same component reading `score === null`, so a
    // client with no scores got "Not yet pulled" three times. Two of those
    // name a real errand. The third named one that does not exist: FICO
    // calculates SBSS when a lender requests it, so there is no dormant
    // record for an advisor to fetch, at any price.
    await selectClient(page, CLIENT_WITHOUT_SCORE);

    const sbss = page.locator('div').filter({ hasText: /^FICO SBSS/ }).first();
    await expect(sbss).toBeVisible({ timeout: 30000 });

    // The SBSS card says what it is rather than implying a missing pull.
    await expect(page.getByText('Lender-computed').first()).toBeVisible();
    await expect(page.getByText('Not obtainable on demand').first()).toBeVisible();

    // And the two obtainable cards still say the honest thing, so this is a
    // distinction rather than a blanket rewording.
    await expect(page.getByText('Not yet pulled').first()).toBeVisible();

    // Each obtainable card names the action and its cost — the half that was
    // missing, since the page tracked whether a client had a score and never
    // how they get one.
    await expect(page.getByText(/about \$49\.95 a report/i).first()).toBeVisible();
    await expect(page.getByText(/CreditSignal/i).first()).toBeVisible();

    // No target on the SBSS card. "115 pts needed" would be a to-do item
    // nobody can pick up.
    await expect(page.getByText('175+ for Tier 3')).toHaveCount(0);
  });

  test('distinguishes no trade lines from trade lines not read', async ({
    signedInPage: page,
  }) => {
    // Both used to render "0 of 5 trade lines established". They are
    // different facts and the page has to be able to say which one it means.

    // Nothing selected: nothing has been asked for, so nothing is counted.
    await page.goto('/credit-builder');
    await expect(page.getByText('Not read').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('0 of 5 trade lines established')).toHaveCount(0);

    // A client whose tradeline list came back empty: zero is the real answer
    // and is stated as one.
    await selectClient(page, CLIENT_WITHOUT_SCORE);
    await expect(page.getByText('0 of 5 trade lines established')).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows the score on record for a client that has one', async ({ signedInPage: page }) => {
    await selectClient(page, CLIENT_WITH_SCORE);

    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clients = (await fetch(`${API}/v1/clients?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { id: string; businessName: string }[] }).data)) as {
      id: string;
      businessName: string;
    }[];
    const target = clients.find((c) => c.businessName === CLIENT_WITH_SCORE);
    expect(target, 'the seeded client is present').toBeTruthy();

    // The endpoint answers for a real id, which it never did for cb_001.
    const res = await fetch(`${API}/credit-builder/${target!.id}/scores`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status, 'a real client id is not a 404').toBe(200);
  });

  test('reads business age from the formation date on the record', async ({
    signedInPage: page,
  }) => {
    await selectClient(page, CLIENT_WITH_SCORE);

    // Two wrong answers preceded this one. First a constant 36 months for
    // every client, which cleared the two-year threshold for all of them.
    // Then null, on the belief that nothing recorded a formation date —
    // `Business.dateOfFormation` exists and is populated, so the timeline said
    // "Formation date not recorded" while the criterion beside it counted the
    // months.
    await expect(page.getByText(/months since formation/).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Formation date not recorded')).toHaveCount(0);
  });
});

// ── DUNS track ──────────────────────────────────────────────────────────────
//
// The six completion circles were component state. A reload wiped them, and
// they were keyed to no client, so marks made against one business stayed on
// screen after switching to another. `tier1Unlocked` reads the count, which
// made the "ready for Tier 1 stacking" banner rest partly on checkboxes that
// belonged to nobody and survived nothing.

test.describe('DUNS step completion', () => {
  async function selectClient(page: import('@playwright/test').Page, name: string) {
    const box = page.getByRole('combobox', { name: 'Search clients' });
    await box.click();
    await box.fill(name);
    await page.getByText(name).first().click();
  }

  /**
   * Clears the marks an earlier run left, so each test starts from none.
   *
   * Only steps 1 and 3: the rest are derived from the client's data and the
   * API refuses to have them set by hand.
   */
  async function resetSteps(page: import('@playwright/test').Page, clientName: string) {
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const clients = (await fetch(`${API}/v1/clients?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(expectOk)
      .then((b) => (b as { data: { id: string; businessName: string }[] }).data)) as {
      id: string;
      businessName: string;
    }[];
    const target = clients.find((c) => c.businessName === clientName);
    expect(target, `${clientName} is seeded`).toBeTruthy();

    for (const step of [1, 3]) {
      const res = await fetch(`${API}/credit-builder/${target!.id}/steps/${step}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false }),
      });
      expect(res.ok, `clearing attested step ${step}`).toBe(true);
    }
    return target!.id;
  }

  test('does not offer a mark when there is nowhere to record one', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');

    // With no client chosen there is no business to record a step against. A
    // circle that ticks and saves nothing is the defect this page carried.
    const circles = page.getByRole('checkbox');
    await expect(circles.first()).toBeDisabled({ timeout: 30000 });

    // And no progress figure is asserted for a track nobody has read.
    await expect(page.getByText('Select a client to see their DUNS progress')).toBeVisible();
  });

  test('a mark survives a reload', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await resetSteps(page, CLIENT_WITH_SCORE);
    await selectClient(page, CLIENT_WITH_SCORE);

    // Asserted on the attested step's own confirmation line rather than the
    // aggregate count, which now also moves with derived data — a test that
    // watched the total would pass or fail on how many trade lines the seed
    // happens to carry.
    const confirmed = page.getByText(/Confirmed by an advisor/);
    await expect(confirmed).toHaveCount(0, { timeout: 30000 });

    await page.getByRole('checkbox').first().click();
    await expect(confirmed).toHaveCount(1, { timeout: 30000 });

    // The whole point. This used to come back unmarked.
    await page.reload();
    await selectClient(page, CLIENT_WITH_SCORE);
    await expect(page.getByText(/Confirmed by an advisor/)).toHaveCount(1, { timeout: 30000 });
  });

  test('marks belong to one client and do not follow the picker', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');
    await resetSteps(page, CLIENT_WITH_SCORE);
    await resetSteps(page, CLIENT_WITHOUT_SCORE);

    await selectClient(page, CLIENT_WITH_SCORE);
    await page.getByRole('checkbox').first().click();
    await expect(page.getByText(/Confirmed by an advisor/)).toHaveCount(1, { timeout: 30000 });

    // Switching client used to carry the marks across, so a business nobody
    // had touched showed another one's progress.
    await page.getByRole('button', { name: 'Clear selected client' }).click();
    await selectClient(page, CLIENT_WITHOUT_SCORE);
    await expect(page.getByText(/Confirmed by an advisor/)).toHaveCount(0, { timeout: 30000 });
  });
});

// ── Derived steps ───────────────────────────────────────────────────────────
//
// A client with a PAYDEX of 80 showed the score card ticked and the step-5 bar
// full at 80/80, while the step itself sat unchecked and the track read 0/6.
// Completion was manual-only, so nothing connected the figure on screen to the
// step describing it.
//
// Steps 2, 4, 5 and 6 are now read from the client's data; 1 and 3 stay an
// advisor's claim, because nothing here records a DUNS number or a bank
// account.

test.describe('Derived DUNS steps', () => {
  async function selectClient(page: import('@playwright/test').Page, name: string) {
    const box = page.getByRole('combobox', { name: 'Search clients' });
    await box.click();
    await box.fill(name);
    await page.getByText(name).first().click();
  }

  test('completes step 5 from the PAYDEX already on screen', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    // The exact defect: this client's PAYDEX is 80 and the step is about
    // reaching 80. Nobody has to tick anything.
    await expect(page.getByText('PAYDEX 80, pulled')).toBeVisible({ timeout: 30000 });

    // And the track is no longer 0/6 for a client who has done three of them.
    await expect(page.getByText('0/6 DUNS steps recorded')).toHaveCount(0);
  });

  test('states what each derived step read', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    await expect(page.getByText('Address and phone on file')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('trade lines reporting to D&B').first()).toBeVisible();
    await expect(page.getByText(/card application(s)? submitted/)).toBeVisible();
  });

  test('names what is missing rather than only failing', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITHOUT_SCORE);

    await expect(page.getByText(/Missing on the client record:/)).toBeVisible({ timeout: 30000 });
    // The step's own line, with its prefix. The stacking criteria panel below
    // says "No PAYDEX on record for this client" about the same absence, and a
    // bare substring matches both.
    await expect(page.getByText("From this client's data: No PAYDEX on record")).toBeVisible();
  });

  test('offers a toggle only on the two steps an advisor attests', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    // Steps 1 and 3 only. A derived step is not an advisor's to set, and a
    // control that took the click and changed nothing would be the quiet
    // version of the defect this page was audited for.
    await expect(page.getByRole('checkbox')).toHaveCount(2, { timeout: 30000 });
  });

  test('refuses a hand-marked derived step at the API', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const res = await fetch(`${API}/credit-builder/seed-biz-001/steps/5`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    // 422, not a 200 that changes nothing: a stored mark disagreeing with the
    // PAYDEX would be read as fact by everything downstream, including the
    // Tier 1 readiness banner.
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('STEP_IS_DERIVED');
  });
});

// ── Stacking criteria ───────────────────────────────────────────────────────
//
// Eight criteria were held as literals with a hardcoded status of "unknown"
// and `allMet = false` beside them, so this panel reported "none assessed" to
// every client since it was written. Seven are now answered from the same
// facts the DUNS steps derive from; the eighth cannot be answered for anybody
// and says so.

test.describe('Stacking unlock criteria', () => {
  async function selectClient(page: import('@playwright/test').Page, name: string) {
    const box = page.getByRole('combobox', { name: 'Search clients' });
    await box.click();
    await box.fill(name);
    await page.getByText(name).first().click();
  }

  test('assesses the criteria and states what each read', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    await expect(page.getByText('none assessed')).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByText(/stacking criteria met/)).toBeVisible();

    // The figure behind a status, not just the status.
    await expect(page.getByText('PAYDEX 80, needs 80')).toBeVisible();
    await expect(page.getByText('Intelliscore 64, needs 60')).toBeVisible();
  });

  test('says a score was never pulled rather than that the client failed', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    // This client has no SBSS. "Not measured" and "Not yet" are different
    // claims, and only one of them is about the client.
    await expect(page.getByText('No SBSS on record for this client').first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Not measured').first()).toBeVisible();
  });

  test('assesses the Equifax criterion against Equifax’s own score', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    // This read "Cannot assess" for every client: the Equifax business adapter
    // wrote an SBSS, so nothing produced the score the criterion reads. It now
    // writes its own Business Credit Risk Score, 101–992.
    await expect(page.getByText('Equifax Business Risk 640, needs 500')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Cannot assess')).toHaveCount(0);
    await expect(page.getByText(/No Equifax business risk score is produced/)).toHaveCount(0);
  });

  test('assesses nothing until a client is chosen', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');

    // Not read is not "none met". This panel used to state that no criterion
    // was satisfied whether or not anything had been asked.
    await expect(
      page.getByText('Select a client to assess these against their credit file.'),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'UNLOCKED' })).toHaveCount(0);
  });

  test('follows the DUNS attestation it depends on', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
    const mark = (completed: boolean) =>
      fetch(`${API}/credit-builder/seed-biz-001/steps/1`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });

    await mark(false);
    await selectClient(page, CLIENT_WITH_SCORE);
    await expect(
      page.getByText(/no advisor has confirmed the DUNS registration/i).first(),
    ).toBeVisible({ timeout: 30000 });

    // sc_001 is the one criterion built from an attestation and a fact
    // together, so marking step 1 has to move it — and the panel has to
    // refresh, or two states of one fact sit on screen at once.
    await page.getByRole('checkbox').first().click();
    await expect(page.getByText(/DUNS confirmed by an advisor/).first()).toBeVisible({
      timeout: 30000,
    });

    await mark(false);
  });

  test('agrees with the DUNS step asking the same question', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));

    const steps = (await fetch(`${API}/credit-builder/seed-biz-001/steps`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as { data: { steps: { stepNumber: number; completed: boolean }[] } };

    const criteria = (await fetch(`${API}/credit-builder/seed-biz-001/stacking-criteria`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(expectOk)) as { data: { criteria: { id: string; status: string }[] } };

    const step = (n: number) => steps.data.steps.find((s) => s.stepNumber === n)!.completed;
    const criterion = (id: string) =>
      criteria.data.criteria.find((c) => c.id === id)!.status === 'met';

    // Step 4 and sc_002 are the same question about trade lines; step 5 and
    // sc_003 the same question about PAYDEX. They read one fact set, so they
    // cannot answer differently.
    expect(criterion('sc_002')).toBe(step(4));
    expect(criterion('sc_003')).toBe(step(5));
  });
});

// ── Programme track ─────────────────────────────────────────────────────────
//
// /graduation/status has answered correctly since the engine was written, and
// nothing in the frontend called it — the four tracks, the gates holding a
// client back and the roadmap out of them were reachable only by an advisor
// who knew the URL.

test.describe('Programme track', () => {
  async function selectClient(page: import('@playwright/test').Page, name: string) {
    const box = page.getByRole('combobox', { name: 'Search clients' });
    await box.click();
    await box.fill(name);
    await page.getByText(name).first().click();
  }

  test('shows the track a client is on and what the next one waits for', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    await expect(page.getByRole('heading', { name: 'Programme Track' })).toBeVisible({
      timeout: 30000,
    });
    // This client clears every measurable gate for Full Stack. Before the
    // seed carried real trade-line arrays they were pinned to Credit Builder
    // by a count that read 0 off a summary object.
    await expect(page.getByText('To reach Full Stack')).toBeVisible();

    // The gates themselves, with the figure each one read.
    await expect(page.getByText('Personal FICO Score')).toBeVisible();
    await expect(page.getByText('Active Positive Tradelines')).toBeVisible();
  });

  test('lists all four tracks and marks the current one', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    for (const track of ['Credit Builder', 'Starter Stack', 'Full Stack', 'LOC / SBA Bridge']) {
      await expect(page.getByText(track, { exact: true }).first()).toBeVisible({ timeout: 30000 });
    }
    await expect(page.getByText('— current')).toBeVisible();
  });

  test('names the next action rather than only the shortfall', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);

    // The roadmap the engine produces, which nothing rendered before.
    await expect(page.getByRole('heading', { name: 'Next actions' })).toBeVisible({
      timeout: 30000,
    });

    // The action for an unmeasured requirement is to measure it — unless
    // nobody can. This used to assert /Pull a FICO SBSS report/ and "Same
    // day", and the page said both. Neither is true of SBSS: FICO calculates
    // it when a lender requests it, so there is no report to buy this
    // afternoon and no errand an advisor can run. "Same day" was the worse
    // half — it put a deadline on work that cannot be done at all.
    await expect(page.getByText(/nobody here can obtain one/i).first()).toBeVisible();
    await expect(page.getByText('Not obtainable on demand').first()).toBeVisible();
    await expect(page.getByText(/Pull a FICO SBSS report/)).toHaveCount(0);

    // Still framed as unmeasured rather than as a shortfall.
    await expect(page.getByText(/not a shortfall/i).first()).toBeVisible();

    // And no timeline is invented from an absence. This read "Estimated 0
    // months at the current rate" until the estimator returned null for an
    // unmeasured gate — 0 means "nothing left to close", which is the
    // opposite of what is true here.
    await expect(
      page.getByText('No timeline is projected while a requirement is unmeasured.'),
    ).toBeVisible();
    await expect(page.getByText(/Estimated 0 months/)).toHaveCount(0);
  });

  test('assesses nothing until a client is chosen', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');

    // Not read is not "nothing holding them back".
    await expect(
      page.getByText('Select a client to see which track they qualify for.'),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('To reach')).toHaveCount(0);
  });

  test('does not present an unmeasured requirement as a shortfall', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');
    await selectClient(page, CLIENT_WITH_SCORE);
    await expect(page.getByRole('heading', { name: 'Programme Track' })).toBeVisible({
      timeout: 30000,
    });

    // Scoped to this panel. The stacking-criteria panel below deliberately
    // uses the same words for the same states — consistency an advisor should
    // get — so an unscoped count reads both.
    const panel = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Programme Track' }),
    });

    const met = await panel.getByText('Met', { exact: true }).count();
    const notYet = await panel.getByText('Not yet', { exact: true }).count();
    const notMeasured = await panel.getByText('Not measured', { exact: true }).count();
    expect(met + notYet + notMeasured, 'every gate carries exactly one status').toBeGreaterThan(0);

    // An unmeasured gate never shows a figure it does not have — exactly one
    // "Not on record" line per unmeasured gate, and none when there are none.
    // This is the assertion that fails if the panel ever prints a 0 for an
    // absent score, which is the whole defect in miniature.
    await expect(panel.getByText('Not on record')).toHaveCount(notMeasured);

    // "Not yet" is a statement about the client; "Not measured" is a statement
    // about us. A gate carries one or the other, never both.
    await expect(panel.getByText('Not measured', { exact: true })).toHaveCount(notMeasured);
    await expect(panel.getByText('Not yet', { exact: true })).toHaveCount(notYet);
  });
});

// ── Controls that did nothing ───────────────────────────────────────────────

test.describe('Inert step actions', () => {
  test('offers no Verify DUNS or Record account button', async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');

    // Both rendered a link-styled affordance and had no handler branch:
    // `handleStepAction` has only ever handled steps 4 and 6. Nothing in this
    // system verifies a DUNS number or records a bank account, so there is
    // nothing to wire them to.
    await expect(page.getByRole('button', { name: /Verify DUNS/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Record account/ })).toHaveCount(0);

    // The step rows themselves stay — the process still has six steps.
    await expect(page.getByText('Register DUNS Number')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Open Business Bank Account')).toBeVisible();

    // The two that do something are still offered.
    await expect(page.getByRole('button', { name: /View vendors/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /View eligible cards/ })).toBeVisible();
  });

  test('links step 1 to D&B, where the registration actually happens', async ({
    signedInPage: page,
  }) => {
    await page.goto('/credit-builder');

    // A link that goes where it says, in place of a "Verify DUNS" button that
    // verified nothing. URL checked 2026-08-05: 200, no redirect. The path
    // this repo used before, /duns-number/get-a-duns.html, now 301s to it.
    const link = page.getByRole('link', { name: /Register at D&B/ });
    await expect(link).toBeVisible({ timeout: 30000 });
    await expect(link).toHaveAttribute('href', 'https://www.dnb.com/en-us/smb/duns/get-a-duns.html');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
