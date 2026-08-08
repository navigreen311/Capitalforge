// ============================================================
// /simulator — the scenario result is read, not dumped
//
// The page rendered the whole response through one loop that
// JSON.stringify'd anything that was not a primitive:
//
//   {typeof value === 'object' && value !== null
//     ? JSON.stringify(value)
//     : String(value)}
//
// so four structured objects — a seven-round schedule, an approval
// report, a 24-month repayment path and a four-product comparison —
// arrived as raw JSON on one line each.
//
// The profiles below are the ones the service was run against while
// designing the view. Their scores are not fixtures: they are what
// fundingSimulator.runScenario returns for these inputs, and two of the
// three cases were only visible by running it.
// ============================================================

import { test, expect } from './fixtures';

interface ProfileInput {
  ficoScore: number;
  utilizationRatio: number;
  derogatoryCount: number;
  inquiries12m: number;
  creditAgeMonths: number;
  annualRevenue: number;
  yearsInOperation: number;
  existingDebt: number;
  targetCreditLimit: number;
}

/**
 * FICO 720, six years, $850k revenue.
 * Real scores: stack 100, SBA 100, LOC 100, MCA 15 — a three-way tie at
 * the cap, which the service resolves by the order it built the options.
 */
const STRONG: ProfileInput = {
  ficoScore: 720,
  utilizationRatio: 0.25,
  derogatoryCount: 0,
  inquiries12m: 2,
  creditAgeMonths: 96,
  annualRevenue: 850_000,
  yearsInOperation: 6,
  existingDebt: 120_000,
  targetCreditLimit: 150_000,
};

/**
 * FICO 599, half a year, $90k revenue.
 * Real scores: stack 60, SBA 20, LOC 45, MCA 30 — and the service still
 * recommends the MCA, because a rule overrides the ranking under 600
 * FICO and under a year in operation.
 */
const EDGE: ProfileInput = {
  ficoScore: 599,
  utilizationRatio: 0.6,
  derogatoryCount: 1,
  inquiries12m: 4,
  creditAgeMonths: 30,
  annualRevenue: 90_000,
  yearsInOperation: 0.5,
  existingDebt: 40_000,
  targetCreditLimit: 40_000,
};

async function runScenario(page: import('@playwright/test').Page, profile: ProfileInput): Promise<void> {
  await page.goto('/simulator');
  for (const [key, value] of Object.entries(profile)) {
    await page.fill(`#sim-${key}`, String(value));
  }
  const response = page.waitForResponse(
    (r) => r.url().includes('/simulator/run') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /run scenario/i }).click();
  await response;
  await expect(page.getByTestId('scenario-result')).toBeVisible();
}

test.describe('Simulator result presentation', () => {
  test('renders the four objects as bands, with no raw JSON', async ({ signedInPage: page }) => {
    await runScenario(page, STRONG);

    for (const id of ['verdict-band', 'affordability-band', 'alternatives-band', 'mechanics-band']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // The defect itself. The old render produced object literals on the
    // page — `{"rounds":[{"roundNumber":1,...` — so the absence of that
    // shape is the thing worth asserting.
    const body = (await page.locator('body').innerText()).replace(/\s+/g, '');
    expect(body).not.toContain('"roundNumber":');
    expect(body).not.toContain('"suitabilityScore":');
    expect(body).not.toContain('"monthlySchedule":');
  });

  test('says a tie is a tie rather than implying a clear winner', async ({ signedInPage: page }) => {
    await runScenario(page, STRONG);

    const verdict = page.getByTestId('verdict-band');
    await expect(verdict.getByTestId('verdict-tied')).toBeVisible();
    await expect(verdict.getByTestId('verdict-clear')).toHaveCount(0);
    await expect(verdict.getByTestId('verdict-tied')).toContainText(/tied/i);

    // Three products share the cap, so naming only the winner would be
    // the misreading this band exists to prevent.
    await expect(verdict.getByTestId('verdict-score')).toContainText('100/100');
  });

  test('states plainly when the pick was a rule, not the top score', async ({
    signedInPage: page,
  }) => {
    await runScenario(page, EDGE);

    const verdict = page.getByTestId('verdict-band');
    const overridden = verdict.getByTestId('verdict-overridden');

    await expect(overridden).toBeVisible();
    await expect(overridden).toContainText(/chosen by rule, not by score/i);

    // The two facts an advisor needs: what was picked and what beat it.
    await expect(overridden).toContainText('30/100');
    await expect(overridden).toContainText('60/100');

    // The service's rationale claims the chosen product "offers the
    // highest suitability score (30/100)" while stacking sits at 60 in
    // the same response. It stays on the page, but behind a disclosure
    // that labels it — it must not be the headline.
    await expect(verdict.getByText(/contradicted by the scores above/i)).toBeVisible();
  });

  test('leads the repayment band with the shock month', async ({ signedInPage: page }) => {
    await runScenario(page, STRONG);

    const band = page.getByTestId('affordability-band');
    await expect(band.getByRole('heading', { name: /interest shock at month/i })).toBeVisible();

    // Both sides of the shock, which is what makes the month mean anything.
    await expect(band.getByTestId('pre-shock-payment')).not.toBeEmpty();
    await expect(band.getByTestId('post-shock-payment')).not.toBeEmpty();

    // The marked bar comes from each row's own isShockMonth flag.
    await expect(band.getByTestId('shock-bar')).toHaveCount(1);
  });

  test('ranks by the score the run returned, so demotion is not hard-coded', async ({
    signedInPage: page,
  }) => {
    // Strong profile: the merchant cash advance scores 15 and sinks.
    await runScenario(page, STRONG);
    let rows = page.getByTestId('alternatives-table').locator('tbody tr');
    await expect(rows.last()).toHaveAttribute('data-testid', 'option-row-mca');

    // Edge profile: the same product is what the service recommends, and
    // rendering it as the worst option there would contradict the verdict
    // band directly above it.
    await runScenario(page, EDGE);
    rows = page.getByTestId('alternatives-table').locator('tbody tr');
    await expect(rows.last()).not.toHaveAttribute('data-testid', 'option-row-mca');
    await expect(page.getByTestId('option-row-mca')).toHaveAttribute('data-recommended', 'true');
  });

  test('keeps the mechanics band collapsed until asked for', async ({ signedInPage: page }) => {
    await runScenario(page, STRONG);

    const mechanics = page.getByTestId('mechanics-band');
    await expect(mechanics).not.toHaveAttribute('open', /.*/);
    await expect(mechanics.getByTestId('rounds-table')).not.toBeVisible();

    await mechanics.locator('summary').click();
    await expect(mechanics.getByTestId('rounds-table')).toBeVisible();
    await expect(mechanics.getByTestId('card-breakdown-table')).toBeVisible();
  });
});
