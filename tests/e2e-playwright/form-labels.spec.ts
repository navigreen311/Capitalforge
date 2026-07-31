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
