import { test, expect } from './fixtures';

// ============================================================
// Application pipeline E2E — /applications
// Covers: the kanban board, its columns, and the new-application wizard.
//
// These ran signed out, so the board fell back to ten sample applications and
// the tests asserted against those — `APP-` ids that exist in no database.
// Signed in, the page threw: the real rows carry no advisor field and the
// board called .split(' ') on it.
//
// Now signed in and asserting against the seeded records, so a passing run
// means the pipeline rendered real data.
// ============================================================

test.describe('Application pipeline board', () => {
  test('shows the board and the new-application action', async ({ signedInPage: page }) => {
    await page.goto('/applications');

    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByRole('button', { name: /new application/i })).toBeVisible();
  });

  test('renders every kanban column', async ({ signedInPage: page }) => {
    await page.goto('/applications');

    for (const column of ['Draft', 'Pending Consent', 'Submitted', 'Approved', 'Declined']) {
      await expect(page.getByText(column, { exact: true }).first()).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test('renders the seeded applications rather than sample cards', async ({
    signedInPage: page,
  }) => {
    await page.goto('/applications');

    // Seeded records, from prisma/seed.ts.
    await expect(page.getByText('Ink Business Preferred').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Apex Digital Solutions LLC').first()).toBeVisible();

    // The sample data these tests used to assert on is gone. `APP-` ids
    // appeared nowhere but the placeholder array.
    await expect(page.getByText(/^APP-/)).toHaveCount(0);
  });

  test('does not crash when rendering real rows', async ({ signedInPage: page }) => {
    // The regression this file exists to catch. Real applications carry no
    // advisor, and the board used to call .split(' ') on it, which took the
    // whole page to the error boundary.
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/applications');
    await expect(page.getByText('Ink Business Preferred').first()).toBeVisible({
      timeout: 15000,
    });

    expect(pageErrors).toEqual([]);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test('opens the new-application wizard', async ({ signedInPage: page }) => {
    await page.goto('/applications');

    await page.getByRole('button', { name: /new application/i }).click();

    // Other modals mount alongside this one, so the wizard is addressed by
    // its accessible name rather than by role alone.
    const dialog = page.getByRole('dialog', { name: 'New Application Wizard' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByRole('heading', { name: 'New Application' })).toBeVisible();
  });

  test('closes the wizard without creating anything', async ({ signedInPage: page }) => {
    await page.goto('/applications');
    await page.getByRole('button', { name: /new application/i }).click();

    const dialog = page.getByRole('dialog', { name: 'New Application Wizard' });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
