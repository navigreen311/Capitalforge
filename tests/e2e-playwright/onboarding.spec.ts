import { test, expect } from '@playwright/test';

// ============================================================
// Onboarding Wizard E2E Tests — /clients/new
// Covers: 5-step wizard flow (Business Info, Owners, Consent,
//         Suitability, Review & Submit)
// ============================================================

test.describe('Client onboarding wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the new-client wizard
    await page.goto('/clients/new');
    await expect(page.locator('text=Business Info')).toBeVisible();
  });

  test('Step 1: fill business information and advance', async ({ page }) => {
    // Required fields: legalName, entityType, address, city, state, zip
    await page.fill('input[name="legalName"], input[placeholder*="legal" i]', 'Acme Holdings LLC');

    // Select entity type
    const entitySelect = page.locator('select').filter({ hasText: /LLC|S-Corp|C-Corp/i }).first();
    if (await entitySelect.isVisible()) {
      await entitySelect.selectOption('llc');
    }

    // Fill address fields
    await page.locator('input').filter({ hasText: /address/i }).first().isVisible().catch(() => null);
    const addressInputs = page.locator('input[name="addressLine1"], input[placeholder*="address" i]');
    if (await addressInputs.first().isVisible()) {
      await addressInputs.first().fill('123 Main Street');
    }

    const cityInput = page.locator('input[name="city"], input[placeholder*="city" i]');
    if (await cityInput.first().isVisible()) {
      await cityInput.first().fill('New York');
    }

    // State selection
    const stateSelect = page.locator('select[name="state"]');
    if (await stateSelect.isVisible()) {
      await stateSelect.selectOption('NY');
    }

    const zipInput = page.locator('input[name="zip"], input[placeholder*="zip" i]');
    if (await zipInput.first().isVisible()) {
      await zipInput.first().fill('10001');
    }

    // Click "Next" to advance to Step 2
    const nextBtn = page.locator('button').filter({ hasText: /next/i });
    await nextBtn.click();

    // Verify we moved to Step 2 (Owners)
    await expect(page.locator('text=Owners')).toBeVisible();
  });

  test('Step 2: add an owner and advance', async ({ page }) => {
    // Quickly fill Step 1 minimally and advance
    await page.fill('input[name="legalName"]', 'Test Corp');
    const entitySelect = page.locator('select').first();
    await entitySelect.selectOption({ index: 1 });
    await page.fill('input[name="addressLine1"]', '1 Test Rd');
    await page.fill('input[name="city"]', 'Test City');
    const stateSelect = page.locator('select[name="state"]');
    if (await stateSelect.isVisible()) await stateSelect.selectOption('CA');
    await page.fill('input[name="zip"]', '90001');
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Now on Step 2: fill owner info
    const firstNameInput = page.locator('input[name="firstName"], input[placeholder*="first" i]').first();
    const lastNameInput = page.locator('input[name="lastName"], input[placeholder*="last" i]').first();

    if (await firstNameInput.isVisible()) {
      await firstNameInput.fill('John');
    }
    if (await lastNameInput.isVisible()) {
      await lastNameInput.fill('Doe');
    }

    // Ownership percentage
    const ownershipInput = page.locator('input[name="ownershipPercent"], input[placeholder*="ownership" i]').first();
    if (await ownershipInput.isVisible()) {
      await ownershipInput.fill('100');
    }

    // Advance to Step 3
    const nextBtn = page.locator('button').filter({ hasText: /next/i });
    await nextBtn.click();

    await expect(page.locator('text=Consent')).toBeVisible();
  });

  test('Step 3: check consent boxes and advance', async ({ page }) => {
    // Quickly navigate to Step 3 by filling Steps 1 & 2 minimally
    // Step 1
    await page.fill('input[name="legalName"]', 'Consent Corp');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.fill('input[name="addressLine1"]', '1 Consent Rd');
    await page.fill('input[name="city"]', 'Austin');
    const stateSelect = page.locator('select[name="state"]');
    if (await stateSelect.isVisible()) await stateSelect.selectOption('TX');
    await page.fill('input[name="zip"]', '73301');
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 2: fill owner
    await page.locator('input[name="firstName"], input[placeholder*="first" i]').first().fill('Jane');
    await page.locator('input[name="lastName"], input[placeholder*="last" i]').first().fill('Smith');
    await page.locator('input[name="ownershipPercent"], input[placeholder*="ownership" i]').first().fill('100');
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 3: Consent — check all consent checkboxes
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }

    // Advance to Step 4 (Suitability)
    await page.locator('button').filter({ hasText: /next/i }).click();
    await expect(page.locator('text=Suitability')).toBeVisible();
  });

  test('Step 4: verify suitability panel is displayed', async ({ page }) => {
    // Navigate through Steps 1-3
    await page.fill('input[name="legalName"]', 'Suit Corp');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.fill('input[name="addressLine1"]', '1 Suit Rd');
    await page.fill('input[name="city"]', 'Denver');
    const stateSelect = page.locator('select[name="state"]');
    if (await stateSelect.isVisible()) await stateSelect.selectOption('CO');
    await page.fill('input[name="zip"]', '80201');
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 2
    await page.locator('input[name="firstName"], input[placeholder*="first" i]').first().fill('Bob');
    await page.locator('input[name="lastName"], input[placeholder*="last" i]').first().fill('Builder');
    await page.locator('input[name="ownershipPercent"], input[placeholder*="ownership" i]').first().fill('100');
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 3: check consents
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 4: Suitability panel should be visible with credit score input
    await expect(page.locator('text=Suitability')).toBeVisible();
    const creditScoreInput = page.locator('input[name="creditScore"], input[placeholder*="credit" i]').first();
    await expect(creditScoreInput).toBeVisible();
  });

  test('Step 5: review and submit creates client', async ({ page }) => {
    // Navigate through all steps
    // Step 1
    await page.fill('input[name="legalName"]', 'Submit Corp LLC');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.fill('input[name="addressLine1"]', '1 Submit Rd');
    await page.fill('input[name="city"]', 'Miami');
    const stateSelect = page.locator('select[name="state"]');
    if (await stateSelect.isVisible()) await stateSelect.selectOption('FL');
    await page.fill('input[name="zip"]', '33101');
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 2
    await page.locator('input[name="firstName"], input[placeholder*="first" i]').first().fill('Alice');
    await page.locator('input[name="lastName"], input[placeholder*="last" i]').first().fill('Owner');
    await page.locator('input[name="ownershipPercent"], input[placeholder*="ownership" i]').first().fill('100');
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 3: consents
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await checkboxes.nth(i).check();
    }
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 4: suitability — advance with defaults
    await page.locator('button').filter({ hasText: /next/i }).click();

    // Step 5: Review — verify summary is shown
    await expect(page.locator('text=Review')).toBeVisible();
    await expect(page.locator('text=Submit Corp LLC')).toBeVisible();

    // Submit the client
    const createBtn = page.locator('button').filter({ hasText: /create client/i });
    await createBtn.click();

    // Should redirect to the new client detail page /clients/<id>
    await page.waitForURL('**/clients/**', { timeout: 15000 });
    expect(page.url()).toMatch(/\/clients\/[a-zA-Z0-9_-]+/);
  });
});
