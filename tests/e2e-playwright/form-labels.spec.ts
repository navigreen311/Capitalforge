import { test, expect } from './fixtures';

// ============================================================
// Every visible form control must have an accessible name.
//
// A control with no name is announced as "edit text, blank": visible on
// screen, unusable without sight. This walks the app's screens and computes
// the name the way a screen reader would, so it catches the case a static
// scan cannot — a control whose label is rendered by a component, or whose
// association only holds at runtime.
//
// Placeholder deliberately does not count. It disappears as soon as the user
// types, and several screen readers ignore it entirely.
// ============================================================

const ROUTES = [
  '/dashboard',
  '/clients',
  '/clients/new',
  '/applications',
  '/funding-rounds',
  '/optimizer',
  '/repayment',
  '/credit-builder',
  '/declines',
  '/documents',
  '/billing',
  '/complaints',
  '/referrals',
  '/issuers',
  '/partners',
  '/settings',
  '/statements',
  '/workflows',
  '/training',
  '/portfolio',
  '/regulatory',
  '/disclosures',
  '/spend-governance',
  '/reports',
];

interface UnnamedControl {
  tag: string;
  type: string | null;
  placeholder: string | null;
  cls: string;
}

/** Mirrors how an assistive technology resolves a control's name. */
const COLLECT_UNNAMED = `() => {
  const named = (el) => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      return labelledby.split(/\\s+/).some((id) => {
        const t = document.getElementById(id);
        return t && t.textContent && t.textContent.trim() !== '';
      });
    }
    if ((el.getAttribute('aria-label') || '').trim() !== '') return true;
    if (el.id) {
      const bound = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (bound && bound.textContent && bound.textContent.trim() !== '') return true;
    }
    if (el.closest('label')) return true;
    if ((el.getAttribute('title') || '').trim() !== '') return true;
    return false;
  };

  const out = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    // Skip controls that are not rendered at all; a visually hidden file
    // input behind a styled button is still reachable and is not skipped.
    const style = window.getComputedStyle(el);
    if (style.display === 'none' && el.type !== 'file') continue;
    if (named(el)) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      type: type || null,
      placeholder: el.getAttribute('placeholder'),
      cls: (el.getAttribute('class') || '').slice(0, 60),
    });
  }
  return out;
}`;

/**
 * Buttons worth opening: they reveal a form.
 *
 * Discovered rather than listed, so a modal added later is audited without
 * anyone remembering to register it here.
 */
const OPENS_A_FORM =
  /^(new|add|create|generate|upload|edit|invite|configure|schedule|log|record|request|assign|import|compose|draft|write)\b/i;

/**
 * Button labels start with decoration as often as not — "+ New Rule",
 * "↑ Upload", "📩 Request from Client", "✦Generate Dispute Letter". Matching a
 * verb at the start of the label means stripping that first, or the button is
 * skipped and the form behind it never audited. Only the copy used for
 * matching is normalised; the click still uses the exact on-screen name.
 */
function triggerVerb(name: string): string {
  return name.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/**
 * Never clicked. These either destroy data, commit a decision, or send
 * something to a client — an audit must not be the thing that fires them.
 */
const DESTRUCTIVE = /\b(delete|remove|revoke|suspend|terminate|cancel|close|archive|approve|decline|reject|submit|send|save|confirm|pay|charge|offboard|purge|reset|deactivate|disable|escalate|sign)\b/i;

/**
 * Status chips share their wording with the verbs above — a filter row of
 * "Draft | Submitted | Approved" reads as a trigger called "Draft", and
 * "New(2)" is a badge with a count. Clicking them filters the view and burns a
 * slot that a real form-opening button would have used.
 */
const STATUS_CHIP = /^(new|draft|pending|active|approved|declined|submitted|closed|all|open|archived)(\s*\(\d+\))?$/i;

function isFormTrigger(label: string): boolean {
  const verb = triggerVerb(label);
  return OPENS_A_FORM.test(verb) && !DESTRUCTIVE.test(label) && !STATUS_CHIP.test(verb);
}

/** Every button's visible text, in DOM order, so an index can address it. */
async function collectButtonLabels(page: import('@playwright/test').Page): Promise<string[]> {
  return page
    .getByRole('button')
    // Structurally typed rather than as Element: the backend tsconfig also
    // compiles this file and has no DOM lib, so naming a DOM type here breaks
    // `npm run build:backend`.
    .evaluateAll((nodes) =>
      (nodes as unknown as { textContent: string | null; getAttribute(n: string): string | null }[])
        .map((n) => (n.textContent || n.getAttribute('aria-label') || '').trim()),
    );
}

for (const route of ROUTES) {
  test(`every form control on ${route} has an accessible name`, async ({ signedInPage: page }) => {
    const response = await page.goto(route);
    expect(response?.status(), `${route} did not load`).toBeLessThan(400);

    // Let client-rendered content settle before inspecting the DOM.
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(500);

    // Self-invoking: page.evaluate treats a string as an expression, so the
    // function has to call itself or the result is the function, not its
    // return value.
    const unnamed = await page.evaluate<UnnamedControl[]>(`(${COLLECT_UNNAMED})()`);

    expect(
      unnamed,
      `${route}: ${unnamed.length} control(s) with no accessible name — ` +
        JSON.stringify(unnamed, null, 2),
    ).toEqual([]);
  });
}

// ============================================================
// Controls that only exist once something is opened.
//
// The route sweep above only sees what renders on load. Most of this app's
// forms live in modals and slide-over panels, which is exactly where an
// unlabelled field hides: nothing renders it until a button is pressed, so a
// page-level audit passes while the form behind it is unusable.
//
// Triggers are found by their accessible name rather than listed here, so a
// modal added later is covered without anyone registering it. Destructive
// buttons are never clicked — an audit must not be the thing that sends a
// letter or approves an application.
// ============================================================

/** Cap per route: enough to reach the forms, bounded enough to stay quick. */
const MAX_TRIGGERS = 8;

// Up to MAX_TRIGGERS clicks, each followed by a reload, so these run well past
// the default per-test budget.
test.describe.configure({ timeout: 120_000 });

for (const route of ROUTES) {
  test(`controls revealed by buttons on ${route} have accessible names`, async ({
    signedInPage: page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(400);

    const labels = await collectButtonLabels(page);

    // Indices, not names. Discovery reads textContent but getByRole matches on
    // the accessible name, and the two differ often enough to matter — the
    // dashboard's "+New Application" was found by text and then matched zero
    // buttons by name, so its modal was never opened and the route passed
    // having audited nothing.
    const candidates = labels
      .map((label, index) => ({ label, index }))
      .filter(({ label }) => isFormTrigger(label))
      .slice(0, MAX_TRIGGERS);

    const failures: { trigger: string; controls: UnnamedControl[] }[] = [];

    for (const { label, index } of candidates) {
      const button = page.getByRole('button').nth(index);
      if (!(await button.isVisible().catch(() => false))) continue;
      // A disabled trigger cannot open anything, and clicking one costs the
      // full actionability timeout while Playwright waits for it to become
      // enabled — enough of those and the test dies of old age rather than
      // reporting anything.
      if (await button.isDisabled().catch(() => false)) continue;

      const name = label;
      await button.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(600);

      const unnamed = await page.evaluate<UnnamedControl[]>(`(${COLLECT_UNNAMED})()`);
      if (unnamed.length > 0) failures.push({ trigger: name, controls: unnamed });

      // Reload rather than just pressing Escape. A modal left open swallows
      // the next trigger's click, and every subsequent one then silently
      // audits nothing — a clean pass that examined a single dialog.
      await page.goto(route);
      await page.waitForTimeout(400);
    }

    expect(
      failures,
      `${route}: unlabelled controls behind ${failures.length} trigger(s) — ` +
        JSON.stringify(failures, null, 2),
    ).toEqual([]);
  });
}

// ============================================================
// Proof that the sweep above is not passing on an empty room.
//
// Trigger discovery is by button label, so a rename silently drops a modal
// from coverage and every route still reports green — the audit would examine
// nothing and say so in the same words it uses when everything is fine.
//
// These anchors assert the opposite: for screens known to open a form, the
// trigger is still found and still reveals controls that were not on the page
// before. If one breaks, coverage shrank, whether or not anything is unlabelled.
// ============================================================

const COVERAGE_ANCHORS: { route: string; trigger: string }[] = [
  { route: '/clients', trigger: '+ New Client' },
  { route: '/billing', trigger: '+ Generate Invoice' },
  { route: '/issuers', trigger: '+ Add Issuer Contact' },
  { route: '/workflows', trigger: '+ New Rule' },
  { route: '/documents', trigger: '↑ Upload' },
  { route: '/referrals', trigger: '+ Add Referral' },
  // Both of these opened nothing until the fixes in this commit: the dashboard
  // trigger was never clicked because discovery and clicking disagreed on the
  // label, and the tradeline modal could not open at all.
  { route: '/dashboard', trigger: '+New Application' },
  { route: '/credit-builder', trigger: '+ Add Tradeline' },
];

const COUNT_CONTROLS = `(() => document.querySelectorAll('input, select, textarea').length)()`;

for (const { route, trigger } of COVERAGE_ANCHORS) {
  test(`"${trigger}" on ${route} still reveals a form to audit`, async ({
    signedInPage: page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(400);

    // Located exactly as the sweep locates it — by label, then by index — so
    // this anchor fails if the sweep would have missed the button, not merely
    // if the button vanished.
    const labels = await collectButtonLabels(page);
    const index = labels.indexOf(trigger);
    expect(
      index,
      `trigger "${trigger}" no longer exists on ${route} — if it was renamed, ` +
        'update this anchor; the modal behind it is otherwise unaudited',
    ).toBeGreaterThan(-1);

    const button = page.getByRole('button').nth(index);
    await expect(button).toBeVisible();

    // The discovery filter has to accept it, or the sweep skips it silently.
    expect(
      isFormTrigger(trigger),
      `"${trigger}" is no longer matched by the trigger filter`,
    ).toBe(true);

    const before = await page.evaluate<number>(COUNT_CONTROLS);
    await button.click();
    await page.waitForTimeout(700);
    const after = await page.evaluate<number>(COUNT_CONTROLS);

    expect(
      after,
      `"${trigger}" opened nothing: ${before} controls before, ${after} after`,
    ).toBeGreaterThan(before);
  });
}
