// ============================================================
// No page states a figure before it has the data
//
// /applications rendered its stat chips above the loading branch, so every
// load showed "Total: 0", "Pipeline Value: $0" and "Approved: $0" beside the
// words "Loading pipeline...". A zero is a claim: it says there are no
// applications and nothing in the pipeline. The same figures appeared when
// the fetch failed, because an empty result set and an unanswered request
// produce identical sums.
//
// Finding that one was not the hard part. Finding whether others did it was,
// and a static pass got it wrong — matching `return (` picked up a helper
// rather than the component — because whether a figure renders before its
// data is a runtime property, not a syntactic one. Delaying the API and
// reading what each page claims while it waits is what actually answers it.
//
// So this walks every route the app serves rather than a list somebody has to
// remember to extend, which is the only version of this test that keeps
// working as pages are added. It has already earned that: run against the
// tree it was written for, it found a hardcoded "Current SBSS: 148 · Next
// milestone: 160" still sitting under a table that had been corrected to say
// no SBSS score is recorded anywhere.
//
// A violation is money, a percentage, or a labelled number on screen while
// the page is still loading. A dash, a blank, or the word "Loading" is honest
// and matches nothing here.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';

/**
 * Routes come from the filesystem for the same reason global-setup warms them
 * that way: a hardcoded list silently stops covering new pages, which is the
 * one failure mode this test cannot afford. Dynamic segments are skipped —
 * they need an id — and route groups add no path segment.
 */
function routes(): string[] {
  const appDir = path.join(process.cwd(), 'src', 'frontend', 'app');
  const found: string[] = [];

  const walk = (dir: string, route: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        if (entry.name === 'page.tsx') found.push(route === '' ? '/' : route);
        continue;
      }
      if (entry.name.startsWith('[')) continue;
      const segment = entry.name.startsWith('(') ? '' : `/${entry.name}`;
      walk(path.join(dir, entry.name), route + segment);
    }
  };

  walk(appDir, '');
  return found.sort();
}

/**
 * Routes whose figures are not claims about anybody's data.
 *
 * Every entry needs a reason, because the easy way to make this test pass is
 * to keep adding to this set.
 */
const EXEMPT: Record<string, string> = {
  // Marketing prices. The page's own content, true whether or not an API
  // answers, so holding the API says nothing about them.
  '/': 'published plan prices',
  '/pricing': 'published plan prices',

  // Net-30 vendor credit limits ($500–$5,000 and similar) and the D&B Paydex
  // target of 80. Facts about third-party vendors and a bureau's scale, not
  // about the client — the same reasoning that kept the vendor table when
  // this page's client-specific figures were removed. The progress percentage
  // is 0 of 6 DUNS steps because nothing records a client's progress through
  // them, which the page states on itself.
  '/credit-builder': 'third-party vendor terms and bureau thresholds',

  // The page is a "not implemented" notice whose explanation quotes the
  // commissions it removed — $1,500 and $2,200 — while saying nothing stores
  // them. Matching a page's account of what it deleted is the sweep's own
  // false positive, not a defect.
  '/referrals': 'explanation quoting the literals it removed',
};

/**
 * Known violations, deliberately not fixed here.
 *
 * test.fail() means the run is red if these ever start passing, so a fix
 * cannot land without removing the entry. That is the point: an exemption is
 * silent, and this is not.
 *
 * Empty. /compliance was the one entry — a fabricated regulatory assessment
 * over two mock endpoints — and it has since been fixed, which is exactly the
 * sequence this mechanism is for.
 */
const KNOWN_VIOLATIONS: Record<string, string> = {};

/** Money, a percentage, or a label asserting a number. */
const FIGURE = /\$[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?%|[A-Za-z][\w ]{1,24}:\s*(?:\$?[\d,]+(?:\.\d+)?)/g;

/** Long enough that nothing resolves during the read. */
const API_DELAY_MS = 4000;
/** Long enough for the shell to paint, short enough to still be loading. */
const READ_AFTER_MS = 1200;

test.describe('Figures before the data arrives', () => {
  for (const route of routes()) {
    if (route in EXEMPT) continue;

    const known = KNOWN_VIOLATIONS[route];

    test(`${route} states no figure while it is loading`, async ({ signedInPage: page }) => {
      if (known !== undefined) {
        // Expected to fail. If this passes, the defect is gone and the entry
        // above must go with it.
        test.fail(true, known);
      }

      await page.route('**/api/**', async (r) => {
        await new Promise((resolve) => setTimeout(resolve, API_DELAY_MS));
        await r.continue();
      });

      // commit rather than load: waiting for load would wait out the delay
      // above and miss the state under test.
      await page.goto(route, { waitUntil: 'commit' }).catch(() => {});
      await page.waitForTimeout(READ_AFTER_MS);

      const body = await page.locator('body').innerText().catch(() => '');
      const figures = [...new Set(body.match(FIGURE) ?? [])];

      expect(
        figures,
        `${route} states ${figures.join(', ')} before its data has arrived. ` +
          'A zero is a claim — show a dash until the figure is known.',
      ).toEqual([]);
    });
  }
});
