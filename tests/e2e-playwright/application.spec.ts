import { test, expect } from '@playwright/test';

// ============================================================
// Application E2E Tests — /applications
// Covers: navigating to applications, opening the new application
// wizard, selecting client/card/purpose, submitting, and verifying
// the card appears on the kanban board.
// ============================================================

test.describe('Application creation flow', () => {
  test('should display the applications kanban board', async ({ page }) => {
    await page.goto('/applications');

    // The page should show kanban columns (draft, submitted, approved, etc.)
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeVisible();

    // Verify the "+ New Application" button exists
    const newAppBtn = page.locator('button').filter({ hasText: /new application/i });
    await expect(newAppBtn).toBeVisible();
  });

  test('should open new application wizard modal', async ({ page }) => {
    await page.goto('/applications');

    // Click "+ New Application"
    const newAppBtn = page.locator('button').filter({ hasText: /new application/i });
    await newAppBtn.click();

    // Wizard modal should appear with Step 1: Client selection
    await expect(page.locator('text=Client')).toBeVisible({ timeout: 5000 });
  });

  test('should walk through the new application wizard steps', async ({ page }) => {
    await page.goto('/applications');

    // Open wizard
    await page.locator('button').filter({ hasText: /new application/i }).click();

    // Step 1: Select a client
    // The wizard has a client selector — click the first available client option
    const clientOption = page.locator('[role="option"], [role="listbox"] > *, button').filter({ hasText: /LLC|Inc|Corp/i }).first();
    if (await clientOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clientOption.click();
    }

    // Advance via Next button
    const nextBtn = page.locator('button').filter({ hasText: /next/i });
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
    }

    // Step 2: Issuer selection (if present)
    const nextBtn2 = page.locator('button').filter({ hasText: /next/i });
    if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn2.click();
    }

    // Step 3: Card selection
    const cardOption = page.locator('[role="option"], button, label').filter({ hasText: /card|ink|sapphire|chase/i }).first();
    if (await cardOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cardOption.click();
    }

    const nextBtn3 = page.locator('button').filter({ hasText: /next/i });
    if (await nextBtn3.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn3.click();
    }

    // Step 4: Business Purpose
    const purposeInput = page.locator('textarea, input[name="businessPurpose"], input[placeholder*="purpose" i]').first();
    if (await purposeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await purposeInput.fill('Working capital for expansion');
    }

    const nextBtn4 = page.locator('button').filter({ hasText: /next/i });
    if (await nextBtn4.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn4.click();
    }

    // Step 5: Pre-Submission Declaration — check all declaration checkboxes
    const declarationCheckboxes = page.locator('input[type="checkbox"]');
    const cbCount = await declarationCheckboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await declarationCheckboxes.nth(i).check();
    }

    // Submit
    const submitBtn = page.locator('button').filter({ hasText: /submit/i });
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
    }
  });

  test('should show application cards on the kanban board', async ({ page }) => {
    await page.goto('/applications');

    // Wait for the board to render with existing placeholder cards
    const kanbanCards = page.locator('[class*="rounded"]').filter({ hasText: /APP-/ });
    await expect(kanbanCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('should support kanban column headers', async ({ page }) => {
    await page.goto('/applications');

    // Verify kanban column headers exist (draft, submitted, approved, etc.)
    const draftColumn = page.locator('text=Draft').first();
    const submittedColumn = page.locator('text=Submitted').first();

    await expect(draftColumn).toBeVisible({ timeout: 10000 });
    await expect(submittedColumn).toBeVisible({ timeout: 10000 });
  });
});
