import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// ============================================================
// Onboarding Wizard E2E — /clients/new
// Covers the 5-step flow: Business Info, Owners, Consent,
// Suitability, Review & Submit.
//
// These ran signed out and addressed fields by `name`, which the wizard does
// not set. Every field selector was wrapped in `if (await x.isVisible())`, so
// nothing was filled and nothing failed until the final assertion — the tests
// looked like they exercised the form while typing into nothing.
//
// Selectors are now `name`-based against attributes the wizard actually
// carries, with no conditional guards: a field that cannot be found is a
// failure, not a step to skip.
// ============================================================

/** The forward button is labelled Continue, and is disabled until the step validates. */
const CONTINUE = /^continue$/i;

/** Step 1 requires legal name, entity type, and a full address. */
async function fillBusinessInfo(page: Page, legalName: string, state = 'NY') {
  await page.fill('input[name="legalName"]', legalName);
  await page.selectOption('select[name="entityType"]', 'llc');
  await page.fill('input[name="addressLine1"]', '123 Main Street');
  await page.fill('input[name="city"]', 'New York');
  await page.selectOption('select[name="state"]', state);
  await page.fill('input[name="zip"]', '10001');
}

/** Step 2 requires at least one owner with a non-zero stake. */
async function fillOwner(page: Page, firstName: string, lastName: string) {
  await page.fill('input[name="firstName"]', firstName);
  await page.fill('input[name="lastName"]', lastName);
  await page.fill('input[name="ownershipPercent"]', '100');
}

/** Step 3 captures TCPA consents; each is a separate disclosure. */
async function acceptConsents(page: Page) {
  const boxes = page.locator('input[type="checkbox"]');
  const count = await boxes.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await boxes.nth(i).check();
}

const next = (page: Page) => page.getByRole('button', { name: CONTINUE }).click();

test.describe('Client onboarding wizard', () => {
  test.beforeEach(async ({ signedInPage }) => {
    await signedInPage.goto('/clients/new');
    // "Business Info" is the stepper label; "Business Information" is the
    // section heading. A substring match hits both, so this is exact.
    await expect(
      signedInPage.getByText('Business Info', { exact: true }),
    ).toBeVisible();
  });

  test('Step 1: fill business information and advance', async ({ signedInPage: page }) => {
    await fillBusinessInfo(page, 'Acme Holdings LLC');
    await next(page);

    await expect(page.getByRole('heading', { name: 'Owners / Principals' })).toBeVisible();
  });

  test('Step 1: cannot advance until the required fields are filled', async ({
    signedInPage: page,
  }) => {
    // The guard the old version could not have caught: with every field
    // selector silently matching nothing, an unfilled form advancing would
    // have looked identical to a filled one.
    const cont = page.getByRole('button', { name: CONTINUE });
    await expect(cont).toBeDisabled();

    // Partially filled is still not enough — the address is required too.
    await page.fill('input[name="legalName"]', 'Half Filled LLC');
    await page.selectOption('select[name="entityType"]', 'llc');
    await expect(cont).toBeDisabled();

    await fillBusinessInfo(page, 'Half Filled LLC');
    await expect(cont).toBeEnabled();
  });

  test('Step 2: add an owner and advance', async ({ signedInPage: page }) => {
    await fillBusinessInfo(page, 'Test Corp', 'CA');
    await next(page);

    await fillOwner(page, 'John', 'Doe');
    await next(page);

    await expect(page.getByRole('heading', { name: /consent/i })).toBeVisible();
  });

  test('Step 3: check consent boxes and advance', async ({ signedInPage: page }) => {
    await fillBusinessInfo(page, 'Consent Corp', 'TX');
    await next(page);
    await fillOwner(page, 'Jane', 'Smith');
    await next(page);

    await acceptConsents(page);
    await next(page);

    await expect(page.getByRole('heading', { name: /suitability/i })).toBeVisible();
  });

  test('Step 4: suitability panel is displayed', async ({ signedInPage: page }) => {
    await fillBusinessInfo(page, 'Suit Corp', 'CO');
    await next(page);
    await fillOwner(page, 'Bob', 'Builder');
    await next(page);
    await acceptConsents(page);
    await next(page);

    await expect(page.getByRole('heading', { name: /suitability/i })).toBeVisible();
  });

  test('Step 5: review shows what was entered and submit creates the client', async ({
    signedInPage: page,
  }) => {
    // Unique per run: the wizard writes a real business, and a fixed name
    // would accumulate duplicates across runs.
    const legalName = `E2E Submit Corp ${Date.now()}`;

    await fillBusinessInfo(page, legalName, 'FL');
    await next(page);
    await fillOwner(page, 'Alice', 'Owner');
    await next(page);
    await acceptConsents(page);
    await next(page);
    await next(page); // Step 4 → Review

    await expect(page.getByRole('heading', { name: /review/i })).toBeVisible();
    // The review step must show the entered name, not a template value.
    await expect(page.getByText(legalName).first()).toBeVisible();

    await page.getByRole('button', { name: /create client/i }).click();

    // Lands on the new client's detail page. The id is excluded from matching
    // "new" explicitly: /clients/[^/]+$ matches the wizard's own URL, so the
    // wait would resolve before anything had been created.
    await page.waitForURL((url) => /\/clients\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'), {
      timeout: 20000,
    });
  });
});
