import { test, expect } from './fixtures';

// ============================================================
// Onboarding wizard — label association
//
// Every control in the wizard was addressable only by placeholder or position:
// the Field component rendered a label with no htmlFor next to an input with
// no id. A screen reader announced "edit text, blank", clicking a label did
// not focus its input, and the validation message below a field was never
// announced because nothing referenced it.
//
// getByLabel resolves through the accessibility tree, so these fail if the
// association regresses — which a visual check would not catch.
// ============================================================

const STEP_1_FIELDS = [
  'Legal Name',
  'DBA (Doing Business As)',
  'EIN',
  'Entity Type',
  'State of Formation',
  'Date of Formation',
  'Annual Revenue ($)',
  'Monthly Revenue ($)',
  'Number of Employees',
  'Address Line 1',
  'City',
  'State',
  'ZIP',
];

test.describe('Onboarding wizard accessibility', () => {
  test.beforeEach(async ({ signedInPage }) => {
    await signedInPage.goto('/clients/new');
    await expect(signedInPage.getByText('Business Info', { exact: true })).toBeVisible();
  });

  test('every step 1 field is reachable by its visible label', async ({ signedInPage: page }) => {
    for (const label of STEP_1_FIELDS) {
      // exact:false so "Legal Name" matches despite the required asterisk.
      await expect(
        page.getByLabel(label, { exact: false }).first(),
        `field "${label}" is not associated with its label`,
      ).toBeVisible();
    }
  });

  test('a label is bound to its own control, not merely adjacent to it', async ({
    signedInPage: page,
  }) => {
    // Typing through the label proves the htmlFor/id pair resolves: without
    // it, this fills nothing.
    await page.getByLabel('Legal Name', { exact: false }).fill('Association Test LLC');
    await expect(page.locator('input[name="legalName"]')).toHaveValue('Association Test LLC');
  });

  test('clicking a label focuses its control', async ({ signedInPage: page }) => {
    const city = page.locator('input[name="city"]');
    const id = await city.getAttribute('id');
    expect(id, 'the input has no id, so no label can reference it').not.toBeNull();

    // Addressed through the htmlFor/id pair rather than by text, so this
    // asserts the binding itself: clicking a merely adjacent label does
    // nothing, and the focus check below would fail.
    await page.locator(`label[for="${id}"]`).click();
    await expect(city).toBeFocused();
  });

  test('required fields are announced as required', async ({ signedInPage: page }) => {
    // The asterisk is hidden from assistive tech, so the requirement has to be
    // carried by aria-required or it is not conveyed at all.
    for (const name of ['legalName', 'addressLine1', 'city', 'zip']) {
      await expect(page.locator(`input[name="${name}"]`)).toHaveAttribute(
        'aria-required',
        'true',
      );
    }
    await expect(page.locator('select[name="entityType"]')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  test('the decorative asterisk is hidden from assistive technology', async ({
    signedInPage: page,
  }) => {
    const asterisks = page.locator('label span[aria-hidden="true"]');
    expect(await asterisks.count()).toBeGreaterThan(0);
  });

  test('a validation error is linked to its field and announced', async ({
    signedInPage: page,
  }) => {
    // An invalid EIN is the one step-1 error reachable without submitting,
    // since the Continue button stays disabled until the form is complete.
    const ein = page.getByLabel('EIN', { exact: false });
    await ein.fill('12345');
    await page.getByLabel('Legal Name', { exact: false }).click();

    // Errors render on validate, which runs when Continue is attempted.
    await page.locator('input[name="legalName"]').fill('Err Corp');
    await page.selectOption('select[name="entityType"]', 'llc');
    await page.fill('input[name="addressLine1"]', '1 Test Rd');
    await page.fill('input[name="city"]', 'Testville');
    await page.selectOption('select[name="state"]', 'NY');
    await page.fill('input[name="zip"]', '10001');
    await page.getByRole('button', { name: /^continue$/i }).click();

    const error = page.getByRole('alert').filter({ hasText: /EIN must be/i });
    await expect(error).toBeVisible();

    // The field points at that message, so it is announced with the field
    // rather than sitting silently beside it.
    const describedBy = await ein.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`#${describedBy}`)).toHaveText(/EIN must be/i);
    await expect(ein).toHaveAttribute('aria-invalid', 'true');
  });

  test('owner fields are labelled too', async ({ signedInPage: page }) => {
    await page.fill('input[name="legalName"]', 'Owner Label Co');
    await page.selectOption('select[name="entityType"]', 'llc');
    await page.fill('input[name="addressLine1"]', '1 Test Rd');
    await page.fill('input[name="city"]', 'Testville');
    await page.selectOption('select[name="state"]', 'NY');
    await page.fill('input[name="zip"]', '10001');
    await page.getByRole('button', { name: /^continue$/i }).click();

    for (const label of ['First Name', 'Last Name', 'Ownership %', 'Date of Birth']) {
      await expect(
        page.getByLabel(label, { exact: false }).first(),
        `owner field "${label}" is not associated with its label`,
      ).toBeVisible();
    }
  });
});
