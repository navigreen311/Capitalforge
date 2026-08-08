// ============================================================
// /spend-governance — a response without riskLevelBasis does not
// take the page down
//
// This happened. The page was updated to render riskLevelBasis while
// the running backend was one commit behind and did not send it.
// `riskLevelBasis.length` threw, React unmounted the route, and the
// screen read "Application Error — Something Went Wrong".
//
// The cost was not the crash. It was the diagnosis: a backend one
// commit behind looked exactly like the frontend change never having
// landed, and the stale values it was still returning — chargebackRatio
// 0.5, riskLevel critical — corroborated that reading.
//
// The route is stubbed here rather than pointed at an old server,
// because the case under test is a shape, not a version.
// ============================================================

import { test, expect } from './fixtures';

const RISK_SUMMARY = /\/transactions\/risk-summary/;

/** The payload the previous service actually returned, verbatim. */
const OLD_SHAPE = {
  success: true,
  data: {
    businessId: 'seed-biz-001',
    totalTransactions: 2,
    totalAmount: 724.2,
    flaggedCount: 1,
    cashLikeCount: 0,
    cashLikeAmount: 0,
    averageRiskScore: 0,
    chargebackRatio: 0.5,
    highRiskTransactions: [],
    cashLikeTransactions: [],
    suspiciousRailTransactions: [],
    riskLevel: 'critical',
  },
};

test.describe('spend-governance against an older API', () => {
  test('renders, and says the basis is absent rather than implying none', async ({
    signedInPage: page,
  }) => {
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(e.message));

    await page.route(RISK_SUMMARY, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OLD_SHAPE),
      }),
    );

    await page.goto('/spend-governance');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();

    // The failure this exists for.
    expect(body).not.toContain('Something Went Wrong');
    expect(crashes).toEqual([]);

    // And it must not go quiet. `riskLevelBasis ?? []` would satisfy every
    // assertion above while rendering a stale API identically to a healthy
    // one that had nothing to report — the same collapse the field exists
    // to undo.
    expect(body).toContain('riskLevelBasis');
    expect(body).toMatch(/older than this page/i);
  });

  test('shows the reasons when the API does send them', async ({ signedInPage: page }) => {
    // The other side of the branch: with the field present, the note must
    // not appear and the reasons must.
    await page.goto('/spend-governance');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Something Went Wrong');
    expect(body).not.toMatch(/older than this page/i);
  });
});
