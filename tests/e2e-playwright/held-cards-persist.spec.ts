// ============================================================
// The Existing Cards section persists — against a real client
//
// Tick a card, give it a month, save, and look again in a fresh tab. The
// second tab is the whole point: it is what the next session sees, and before
// this change it saw an empty section no matter what had been entered.
//
// ── Why a new tab rather than page.reload()
//
// The first version of this test reloaded, re-selected the client and asserted
// the box was ticked. It passed — and it passed just as happily with the save
// deliberately removed and the client's record empty.
//
// Browsers restore form control state across a reload. The checkbox came back
// ticked from the browser's own restoration, before React re-rendered from the
// (empty) record, and `toBeChecked` polls until true, so it caught the
// transient and stopped looking. `page.goto` to the same URL does it too.
//
// A fresh tab has no form history to restore, so the only thing that can tick
// the box is the record. The negative half below — a card ticked but never
// saved, absent in the new tab — is what keeps that honest: it fails if the
// section ever starts restoring state from somewhere other than the record.
//
// Restores the client's card list at the end, because this writes to a real
// record rather than a fixture.
// ============================================================

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const CARD = 'Chase Ink Business Preferred';
const MONTH = '2025-03';

/**
 * A fresh tab on the optimizer with `clientId` selected and their record
 * loaded.
 *
 * Waiting for the GET is not politeness — it is what makes the assertions
 * mean anything. Without it `toBeChecked` was satisfied by a tick the tab
 * showed for a few milliseconds before React rendered from the record, and
 * passed on a client whose record was empty. Anchoring to the response means
 * every assertion below is read after the record has had its say.
 */
async function freshTabOn(page: Page, clientId: string): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto('/optimizer');
  const select = tab.getByLabel('Select client');
  await expect(select).toBeEnabled({ timeout: 30000 });

  const loaded = tab.waitForResponse(
    (r) => r.url().includes('/held-cards') && r.request().method() === 'GET',
    { timeout: 30000 },
  );
  await select.selectOption(clientId);
  await loaded;
  return tab;
}

function cardCheckbox(target: Page) {
  return target.locator('label').filter({ hasText: CARD }).getByRole('checkbox');
}

test('a card saved from the form is what the next session sees', async ({ signedInPage: page }) => {
  await page.goto('/optimizer');

  const clientSelect = page.getByLabel('Select client');
  await expect(clientSelect).toBeEnabled({ timeout: 30000 });

  // The first real client, not the "-- Manual entry (mock) --" placeholder.
  const clientId = await clientSelect.locator('option').nth(1).getAttribute('value');
  expect(clientId, 'the seeded tenant should have at least one client').toBeTruthy();

  // Read the record through Playwright's request context rather than a fetch
  // inside the page: a cross-origin call from the app's port to the API is
  // refused by the browser, which the app itself never hits because it calls
  // the API same-origin.
  const token = await page.evaluate(() => localStorage.getItem('cf_access_token'));
  expect(token, 'the fixture should have seeded a token').toBeTruthy();
  const auth = { Authorization: `Bearer ${token}` };
  const cardsUrl = `http://127.0.0.1:4000/api/clients/${clientId}/held-cards`;

  // What was on the record before this test touched it, so it can go back.
  const beforeRes = await page.request.get(cardsUrl, { headers: auth });
  expect(beforeRes.ok(), 'the held-cards endpoint should answer for a real client').toBe(true);
  const before = (await beforeRes.json()).data.cards as Array<Record<string, unknown>>;

  await clientSelect.selectOption(clientId!);
  // Enabled, not merely visible. The section is disabled until the client's
  // record has answered, and a driver will click a disabled control without
  // waiting — the click fires no change event, so the tick is not real state
  // and the response clears it. That is exactly how this test first failed on
  // CI and passed locally: same code, slower request.
  await expect(cardCheckbox(page)).toBeEnabled({ timeout: 30000 });
  await cardCheckbox(page).check();
  await page.locator(`[id="opened-${CARD}"]`).fill(MONTH);

  // ── The negative half: ticked is not saved ─────────────────
  //
  // Ticking a card to see what a plan does is a question, not a claim. If this
  // ever comes back checked, something is writing to a client's record on the
  // strength of a checkbox, and every row here carries an attestor's name.
  const unsavedTab = await freshTabOn(page, clientId!);
  await expect(cardCheckbox(unsavedTab)).not.toBeChecked({ timeout: 30000 });
  await unsavedTab.close();

  // ── Save ───────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Save to client record' }).click();
  await expect(page.getByText(/On record and counting toward 5\/24/)).toBeVisible({
    timeout: 30000,
  });

  // ── The positive half: saved is what the next session sees ─
  const savedTab = await freshTabOn(page, clientId!);
  await expect(cardCheckbox(savedTab)).toBeChecked({ timeout: 30000 });
  await expect(savedTab.locator(`[id="opened-${CARD}"]`)).toHaveValue(MONTH, { timeout: 30000 });
  await savedTab.close();

  // And it is a row on the record, attributed — not re-rendered state.
  const recorded = (await (await page.request.get(cardsUrl, { headers: auth })).json()).data
    .cards as Array<{
    issuer: string;
    productName: string | null;
    openedAt: string | null;
    attestedBy: string | null;
    source: string;
  }>;

  const chase = recorded.find(
    (c) => c.issuer === 'Chase' && c.productName === 'Ink Business Preferred',
  );
  expect(chase, 'the card should be a row, split into issuer and product').toBeTruthy();
  expect(chase!.openedAt).toContain('2025-03');
  expect(chase!.source).toBe('advisor_attested');
  expect(chase!.attestedBy, 'the signed-in advisor, not the payload').toBeTruthy();

  // ── Put the record back ────────────────────────────────────
  const restore = await page.request.post(cardsUrl, {
    headers: { ...auth, 'content-type': 'application/json' },
    data: {
      cards: before.map((c) => ({
        issuer: c.issuer,
        productName: c.productName ?? undefined,
        openedAt: c.openedAt ?? null,
        creditLimit: c.creditLimit == null ? null : Number(c.creditLimit),
      })),
      replace: true,
    },
  });
  // Asserted rather than fired and forgotten: an unchecked restore leaves the
  // next run starting from a record this one wrote, which is how a test comes
  // to pass on its own leftovers.
  expect(restore.ok(), 'the client record should be restored').toBe(true);
});

// ============================================================
// A click cannot land in the window where it would be discarded
//
// Selecting a client starts a request whose response replaces the ticked list.
// A card ticked before it landed was discarded when it did: the click
// registered, the response arrived a moment later, and the box cleared itself
// with nothing on screen to say why.
//
// It never happened locally, where the request takes a few milliseconds. It
// happened on CI, where the test above ticked a card, waited the full sixty
// seconds and never saw the field that appears when a card is ticked — a real
// defect, found because the assertion was about the app's state rather than
// about the click.
//
// Delaying the response makes the window certain rather than a matter of how
// loaded the machine is. What is asserted is that the window is closed to the
// advisor: the section says it is loading and its controls are disabled, so
// there is no click to lose. (The state update also merges rather than
// replaces if an edit does get through — belt and braces for a re-render
// arriving late, which no browser test can stage honestly, since a click on a
// disabled control fires no change event at all.)
// ============================================================

test('the card list is not editable while the record is still loading', async ({
  signedInPage: page,
}) => {
  await page.route('**/held-cards', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await new Promise((r) => setTimeout(r, 3000));
    await route.fallback();
  });

  await page.goto('/optimizer');
  const clientSelect = page.getByLabel('Select client');
  await expect(clientSelect).toBeEnabled({ timeout: 30000 });
  const clientId = await clientSelect.locator('option').nth(1).getAttribute('value');

  const loading = page.getByText(/Loading this client.s recorded cards/);
  await clientSelect.selectOption(clientId!);

  await expect(loading).toBeVisible();
  await expect(cardCheckbox(page)).toBeDisabled();

  // And once the record has answered, the section is editable and a tick
  // holds — the same window, on the other side of it.
  await expect(loading).toBeHidden({ timeout: 30000 });
  await expect(cardCheckbox(page)).toBeEnabled();
  await cardCheckbox(page).check();
  await expect(cardCheckbox(page)).toBeChecked();
  await expect(page.locator(`[id="opened-${CARD}"]`)).toBeVisible();
});
