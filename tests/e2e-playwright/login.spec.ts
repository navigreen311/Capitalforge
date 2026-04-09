import { test, expect } from '@playwright/test';

// ============================================================
// Login E2E Tests
// Covers: navigation, form fill, submission, redirect, dashboard KPIs
// ============================================================

test.describe('Login flow', () => {
  test('should display the login page with branding', async ({ page }) => {
    await page.goto('/login');

    // Verify branding elements
    await expect(page.locator('h1')).toContainText('CapitalForge');
    await expect(page.locator('h2')).toContainText('Sign in to your account');

    // Verify form fields exist
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show submit button disabled when fields are empty', async ({ page }) => {
    await page.goto('/login');

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();
  });

  test('should fill email and password then submit', async ({ page }) => {
    await page.goto('/login');

    // Fill in credentials
    await page.fill('#email', 'admin@capitalforge.io');
    await page.fill('#password', 'password123');

    // Submit button should be enabled
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();

    // Submit the form
    await submitBtn.click();

    // Wait for navigation to /dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('should show dashboard with KPI cards after login', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'admin@capitalforge.io');
    await page.fill('#password', 'password123');
    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Dashboard should render StatsBar KPI cards
    // StatsBar renders stat cards with metric values
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeVisible();

    // Verify at least one KPI stat card is present
    // The dashboard StatsBar component renders cards with numeric values
    const kpiCards = page.locator('[class*="rounded"]').filter({ hasText: /\$|%|[0-9]/ });
    await expect(kpiCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display error on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'bad@example.com');
    await page.fill('#password', 'wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Error banner should appear
    const errorBanner = page.locator('[class*="red"]').filter({ hasText: /invalid|failed|error/i });
    await expect(errorBanner.first()).toBeVisible({ timeout: 10000 });
  });
});
