// ============================================================
// The acquisition paths reach the screen, with their sources
//
// The unit test proves no claim exists without provenance. It cannot prove the
// provenance is rendered — a card could carry perfect citations in its data and
// display none of them, and the advisor reading it would be repeating an
// unsourced number to a client exactly as before.
//
// So these assert the two properties that only exist in the DOM: that the
// summary is unchanged when collapsed, and that expanding shows both the path
// and the dates behind it.
// ============================================================

import { test, expect } from './fixtures';

test.describe('score card acquisition paths', () => {
  // The client picker here is a searchable combobox, not a select — the same
  // pattern credit-builder.spec.ts already uses. Reused rather than
  // reinvented, since a second way of doing this is a second thing to break.
  test.beforeEach(async ({ signedInPage: page }) => {
    await page.goto('/credit-builder');
    const box = page.getByRole('combobox', { name: 'Search clients' });
    await expect(box).toBeVisible({ timeout: 30000 });
    await box.click();
    await box.fill('Apex Digital');
    await page.getByText('Apex Digital Solutions LLC').first().click();

    // The cards do not exist until a client is chosen.
    await expect(page.getByText('D&B PAYDEX').first()).toBeVisible({ timeout: 30000 });
  });

  test('collapsed by default, so the scoreboard stays readable', async ({ signedInPage: page }) => {
    // Four expanded paths would bury the scores the panel exists to show.
    await expect(page.getByRole('button', { name: /how a client gets this/i }).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/D&B CreditSignal is free and alerts/)).toBeHidden();
  });

  test('PAYDEX expands to a numbered path with its timing', async ({ signedInPage: page }) => {
    const card = page.getByTestId('score-card-d-b-paydex');
    await card.getByRole('button', { name: /how a client gets this/i }).click();

    await expect(page.getByText(/Get a D-U-N-S number/)).toBeVisible();
    await expect(page.getByText(/Pay early, not merely on time/)).toBeVisible();
    await expect(page.getByText(/two billing cycles/)).toBeVisible();
  });

  test('the unverified trade-experience count renders as unverified', async ({
    signedInPage: page,
  }) => {
    // The single most likely place this content goes wrong. It must never
    // appear as a number, and must never look like the sourced claims around
    // it — so this checks for the label, not just the absence of a figure.
    const card = page.getByTestId('score-card-d-b-paydex');
    await card.getByRole('button', { name: /how a client gets this/i }).click();

    await expect(page.getByText('Not verified').first()).toBeVisible();
    await expect(page.getByText(/is not confirmed/)).toBeVisible();
    await expect(page.getByText(/do not promise the client a threshold/)).toBeVisible();
  });

  test('every expanded claim shows a verification date', async ({ signedInPage: page }) => {
    // Provenance that exists in the data and not on screen is provenance the
    // advisor cannot repeat.
    const card = page.getByTestId('score-card-experian-business');
    await card.getByRole('button', { name: /how a client gets this/i }).click();

    await expect(page.getByText(/verified 2026-08-05/).first()).toBeVisible();
    await expect(page.getByText(/\$49\.95 per report/)).toBeVisible();
  });

  test('the Experian caution is shown as a caution', async ({ signedInPage: page }) => {
    const card = page.getByTestId('score-card-experian-business');
    await card.getByRole('button', { name: /how a client gets this/i }).click();

    await expect(page.getByText('Do not say this to a client')).toBeVisible();
    await expect(page.getByText(/does not give a business its own Intelliscore Plus for free/)).toBeVisible();
  });

  test('Equifax names which score belongs on the card', async ({ signedInPage: page }) => {
    const card = page.getByTestId('score-card-equifax-business-risk');
    await card.getByRole('button', { name: /how a client gets this/i }).click();

    // Scoped to the card. Asserting page-wide matched the same strings in the
    // milestone copy elsewhere on this page — a strict-mode violation that
    // says the assertion was never really about this card.
    // The table row, not the phrase. "OneScore for Commercial" appears three
    // times in this card — summary, table, and the paragraph explaining the
    // overlap — and the claim under test is that the *table* names it beside
    // its range, which is what an advisor reads to tell the products apart.
    await expect(card.getByRole('cell', { name: /OneScore for Commercial/ })).toBeVisible();
    await expect(card.getByRole('cell', { name: '300–650' })).toBeVisible();
    await expect(card.getByRole('cell', { name: /101–992/ })).toBeVisible();
    await expect(card.getByText(/passes validation silently/)).toBeVisible();
  });

  test('SBSS offers no path, and says so on the control itself', async ({ signedInPage: page }) => {
    // The label differs because the content differs. "How a client gets this"
    // would be a false promise on a card whose whole point is that they cannot.
    const card = page.getByTestId('score-card-fico-sbss');
    const trigger = card.getByRole('button', { name: /why there is no path/i });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Also card-scoped: the page carries its own SBSS milestone copy that
    // names the same notice, so a page-wide match proves nothing about the
    // expansion.
    await expect(card.getByText(/does not sell a FICO SBSS product directly/)).toBeVisible();
    await expect(card.getByText(/5000-876777/)).toBeVisible();
    await expect(card.getByText(/DSCR 1\.10:1/)).toBeVisible();
  });
});
