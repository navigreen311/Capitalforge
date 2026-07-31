import { test, expect } from '@playwright/test';

// ============================================================
// Login E2E Tests
// Covers: branding, form state, submission, redirect, dashboard render
//
// Locators are role-based and scoped. Bare `h2` and `button[type="submit"]`
// used to be unique on this page; a floating chat widget was later added to
// the layout, which put a second submit button and further headings on every
// page and made all five tests fail on strict-mode violations.
//
// Credentials are the seeded development pair from prisma/seed.ts. The page
// resolves the tenant itself from the demo-advisors slug, so only email and
// password are supplied here.
// ============================================================

const EMAIL = 'admin@demoadvisors.io';
const PASSWORD = 'DemoPass123!';

/** The login form's own submit button, not the chat widget's. */
const signInButton = (page: import('@playwright/test').Page) =>
  page.locator('form').getByRole('button', { name: /sign in/i });

test.describe('Login flow', () => {
  test('should display the login page with branding', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'CapitalForge', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(signInButton(page)).toBeVisible();
  });

  test('should show submit button disabled when fields are empty', async ({ page }) => {
    await page.goto('/login');
    await expect(signInButton(page)).toBeDisabled();
  });

  test('should fill email and password then submit', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);

    const submitBtn = signInButton(page);
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('should show dashboard after login', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await signInButton(page).click();

    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('should display error on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'bad@example.com');
    await page.fill('#password', 'wrongpassword');
    await signInButton(page).click();

    // The page renders the API's own message — "Invalid credentials." — and
    // only falls back to its own wording if the response carries none. Matched
    // on the copy rather than on a colour class that any restyle would break.
    await expect(page.getByText(/invalid credentials|invalid email or password/i).first())
      .toBeVisible({ timeout: 10000 });

    // And it must not have navigated.
    expect(page.url()).toContain('/login');
  });
});
