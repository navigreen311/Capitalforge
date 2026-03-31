// ============================================================
// CapitalForge Credit Optimizer Service
//
// Pure business-logic layer — no DB or I/O dependencies.
// Takes a snapshot of credit profiles and returns an ordered
// list of OptimizationActions with estimated score impact.
//
// Optimization categories (in priority order):
//   1. utilization  — biggest short-term lever
//   2. derogatory   — dispute / pay-for-delete
//   3. inquiry      — velocity cool-down
//   4. tradeline    — add seasoned/authorized tradelines
//   5. score_mix    — account type diversity
//   6. payment_history — autopay / on-time streak
// ============================================================

import { RISK_THRESHOLDS } from '../../shared/constants/index.js';
import type {
  CreditProfileDto,
  OptimizationAction,
  Tradeline,
} from '../../shared/validators/credit.validators.js';

// ── Score-impact look-up table ────────────────────────────────
// Estimates are conservative midpoints from industry research.

const SCORE_IMPACT = {
  DROP_UTILIZATION_BELOW_30: 40,   // per bureau, single cycle
  DROP_UTILIZATION_BELOW_10: 60,
  PAY_OFF_REVOLVING_BALANCE: 30,
  DISPUTE_DEROGATORY: 25,          // per item, if removed
  DISPUTE_COLLECTION: 40,
  ADD_AUTHORIZED_TRADELINE: 20,
  ADD_SECURED_CARD: 15,
  REDUCE_INQUIRY_VELOCITY: 10,     // per hard inquiry that ages off
  ENABLE_AUTOPAY: 10,
  ESTABLISH_DnB_PROFILE: 30,       // if no D&B profile yet
} as const;

// ── Service ───────────────────────────────────────────────────

export class CreditOptimizerService {

  /**
   * Analyze the provided credit profiles and return a prioritized
   * list of actionable optimization steps.
   *
   * @param profiles       All CreditProfile records for the business
   * @param utilization    Pre-calculated aggregate utilization (0–1) or null
   * @param inquiries90d   Total inquiries across all bureaus in last 90 days
   */
  generateActions(
    profiles: CreditProfileDto[],
    utilization: number | null,
    inquiries90d: number,
  ): OptimizationAction[] {
    const actions: OptimizationAction[] = [];
    let priority = 1;

    // ── 1. Utilization actions ───────────────────────────────

    if (utilization !== null) {
      if (utilization >= RISK_THRESHOLDS.MAX_UTILIZATION_CRITICAL) {
        // Critical: > 90% — immediate paydown
        actions.push({
          priority: priority++,
          category: 'utilization',
          title: 'Urgently Reduce Credit Utilization (>90%)',
          description:
            `Current aggregate utilization is ${(utilization * 100).toFixed(1)}%, well above the 90% critical threshold. ` +
            'Pay down revolving balances immediately — especially on cards above 90% — before the next statement date. ' +
            'This is the single highest-impact action available.',
          estimatedScoreImpact: SCORE_IMPACT.DROP_UTILIZATION_BELOW_30,
          estimatedTimeframeDays: 30,
          actionable: true,
          metadata: { currentUtilization: utilization, targetUtilization: 0.29 },
        });
      } else if (utilization >= RISK_THRESHOLDS.MAX_UTILIZATION_WARN) {
        // Warning: 70–89%
        actions.push({
          priority: priority++,
          category: 'utilization',
          title: 'Reduce Credit Utilization (70–90%)',
          description:
            `Aggregate utilization is ${(utilization * 100).toFixed(1)}%. ` +
            'Pay down balances below 30% per card before the next statement closes. ' +
            'Ideal utilization for maximum FICO improvement is under 10%.',
          estimatedScoreImpact: SCORE_IMPACT.DROP_UTILIZATION_BELOW_30,
          estimatedTimeframeDays: 30,
          actionable: true,
          metadata: { currentUtilization: utilization, targetUtilization: 0.29 },
        });
      } else if (utilization >= 0.3) {
        // Moderate: 30–69% — still worth optimizing
        actions.push({
          priority: priority++,
          category: 'utilization',
          title: 'Optimize Utilization Below 10% for Maximum Score',
          description:
            `Utilization is ${(utilization * 100).toFixed(1)}%. ` +
            'While not at risk threshold, reducing each card below 10% before statement date ' +
            'will yield the strongest FICO score improvement.',
          estimatedScoreImpact: SCORE_IMPACT.DROP_UTILIZATION_BELOW_10,
          estimatedTimeframeDays: 60,
          actionable: true,
          metadata: { currentUtilization: utilization, targetUtilization: 0.09 },
        });
      }
    }

    // ── 2. Derogatory / collections ──────────────────────────

    const derogatoryItems = this.collectDerogatories(profiles);

    if (derogatoryItems.collections > 0) {
      actions.push({
        priority: priority++,
        category: 'derogatory',
        title: `Dispute / Settle ${derogatoryItems.collections} Collection Account(s)`,
        description:
          'Collection accounts significantly suppress scores. ' +
          'Send pay-for-delete letters to collection agencies; if unsuccessful, ' +
          'dispute inaccurate items with each reporting bureau under FCRA Section 611.',
        estimatedScoreImpact: SCORE_IMPACT.DISPUTE_COLLECTION * derogatoryItems.collections,
        estimatedTimeframeDays: 90,
        actionable: true,
        metadata: { itemCount: derogatoryItems.collections },
      });
    }

    if (derogatoryItems.latePayments > 0) {
      actions.push({
        priority: priority++,
        category: 'derogatory',
        title: `Dispute ${derogatoryItems.latePayments} Late Payment(s)`,
        description:
          'Late payments remain on file for 7 years but their score impact diminishes with time. ' +
          'If any are inaccurate, file disputes with the reporting bureau. ' +
          'Bring all accounts current immediately and establish autopay.',
        estimatedScoreImpact: SCORE_IMPACT.DISPUTE_DEROGATORY * Math.min(derogatoryItems.latePayments, 3),
        estimatedTimeframeDays: 45,
        actionable: true,
        metadata: { itemCount: derogatoryItems.latePayments },
      });
    }

    // ── 3. Inquiry velocity ──────────────────────────────────

    if (inquiries90d > RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D) {
      const excess = inquiries90d - RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D;
      actions.push({
        priority: priority++,
        category: 'inquiry',
        title: `Pause New Applications — Inquiry Velocity Too High (${inquiries90d} in 90 days)`,
        description:
          `You have ${inquiries90d} hard inquiries in the past 90 days, exceeding the ${RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D}-inquiry threshold. ` +
          'New applications will trigger additional hard pulls and further suppress scores. ' +
          `Allow ${excess} excess inquiries to age past 90 days before the next funding round.`,
        estimatedScoreImpact: SCORE_IMPACT.REDUCE_INQUIRY_VELOCITY * excess,
        estimatedTimeframeDays: 90,
        actionable: false,
        metadata: {
          currentInquiries: inquiries90d,
          maxRecommended: RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D,
          excessInquiries: excess,
        },
      });
    } else if (inquiries90d >= Math.floor(RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D * 0.75)) {
      // Approaching threshold — caution
      actions.push({
        priority: priority++,
        category: 'inquiry',
        title: `Monitor Inquiry Count — Approaching Velocity Limit (${inquiries90d}/${RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D})`,
        description:
          `You have ${inquiries90d} inquiries against a ${RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D}-inquiry 90-day limit. ` +
          'Be selective about new applications. Space out any remaining credit pulls by at least 30 days.',
        estimatedScoreImpact: 0,
        estimatedTimeframeDays: 0,
        actionable: false,
        metadata: { currentInquiries: inquiries90d },
      });
    }

    // ── 4. Tradeline building ─────────────────────────────────

    const tradelineCount = this.countActiveTradelines(profiles);

    if (tradelineCount < 5) {
      actions.push({
        priority: priority++,
        category: 'tradeline',
        title: 'Add Seasoned Tradelines or Become an Authorized User',
        description:
          `Only ${tradelineCount} active tradeline(s) detected. ` +
          'Become an authorized user on a family member\'s or business partner\'s aged, low-utilization card. ' +
          'Alternatively, open a secured business credit card and a net-30 vendor account ' +
          '(e.g., Uline, Quill) to establish business credit depth.',
        estimatedScoreImpact: SCORE_IMPACT.ADD_AUTHORIZED_TRADELINE,
        estimatedTimeframeDays: 30,
        actionable: true,
        metadata: { currentTradelines: tradelineCount, targetTradelines: 7 },
      });
    }

    // ── 5. D&B / Business credit profile ─────────────────────

    const hasDnb = profiles.some((p) => p.bureau === 'dnb');
    if (!hasDnb) {
      actions.push({
        priority: priority++,
        category: 'tradeline',
        title: 'Establish Dun & Bradstreet (D&B) Profile',
        description:
          'No D&B profile found. Register with D&B to obtain a DUNS number, ' +
          'then open net-30 vendor accounts that report to D&B. ' +
          'A strong Paydex score (80+) is required by many SBA lenders.',
        estimatedScoreImpact: SCORE_IMPACT.ESTABLISH_DnB_PROFILE,
        estimatedTimeframeDays: 90,
        actionable: true,
      });
    }

    // ── 6. FICO SBSS tracking ─────────────────────────────────

    const sbssProfiles = profiles.filter((p) => p.scoreType === 'sbss');
    const highestSbss = sbssProfiles.length > 0
      ? Math.max(...sbssProfiles.map((p) => p.score ?? 0))
      : null;

    if (highestSbss !== null && highestSbss < 160) {
      // SBA loans generally require 155+ SBSS
      actions.push({
        priority: priority++,
        category: 'score_mix',
        title: `Improve FICO SBSS Score (Current: ${highestSbss} — SBA Threshold: 155)`,
        description:
          `Your FICO SBSS score is ${highestSbss}. SBA 7(a) loans require a minimum of 155. ` +
          'The SBSS incorporates personal credit, business credit, and financial data. ' +
          'Reducing personal utilization, paying all business accounts on time, and building ' +
          'D&B/Experian Business tradelines are the most direct levers.',
        estimatedScoreImpact: 160 - highestSbss,
        estimatedTimeframeDays: 120,
        actionable: true,
        metadata: { currentSbss: highestSbss, targetSbss: 160 },
      });
    }

    // ── 7. Payment history ────────────────────────────────────

    const hasLatePayments = profiles.some((p) => (p.derogatoryCount ?? 0) > 0);
    if (!hasLatePayments) {
      // Reinforce positive behavior
      actions.push({
        priority: priority++,
        category: 'payment_history',
        title: 'Enable Autopay on All Accounts',
        description:
          'Payment history is 35% of your FICO score. Enroll every account in autopay ' +
          'for at least the minimum payment to eliminate missed-payment risk. ' +
          'Maintain a 24-month streak of on-time payments for maximum impact.',
        estimatedScoreImpact: SCORE_IMPACT.ENABLE_AUTOPAY,
        estimatedTimeframeDays: 30,
        actionable: true,
      });
    }

    // Sort by priority (already ordered by insertion, but re-sort to be explicit)
    actions.sort((a, b) => a.priority - b.priority);

    return actions;
  }

  /**
   * Recommend the earliest date the next credit pull should be triggered.
   * Logic:
   *   - If inquiry velocity is breached: wait until oldest inquiry is >90d old
   *   - Otherwise: allow pull in 30 days (standard advisory cadence)
   */
  recommendNextPullDate(
    profiles: CreditProfileDto[],
    velocityResult: { count: number; breached: boolean; windowDays: number },
  ): string | null {
    if (profiles.length === 0) return new Date().toISOString();

    if (!velocityResult.breached) {
      // Standard 30-day cadence
      const next = new Date();
      next.setDate(next.getDate() + 30);
      return next.toISOString();
    }

    // Find the earliest pulledAt to determine when the 90-day window clears
    const sortedByPull = [...profiles].sort(
      (a, b) => new Date(a.pulledAt).getTime() - new Date(b.pulledAt).getTime(),
    );

    const oldestPull = new Date(sortedByPull[0].pulledAt);
    const clearDate = new Date(oldestPull.getTime() + velocityResult.windowDays * 24 * 60 * 60 * 1000);

    // Add a 7-day buffer after window clears
    clearDate.setDate(clearDate.getDate() + 7);

    return clearDate.toISOString();
  }

  // ── Private Helpers ───────────────────────────────────────────

  private collectDerogatories(profiles: CreditProfileDto[]): {
    latePayments: number;
    collections: number;
  } {
    let latePayments = 0;
    let collections = 0;

    // Sum derogatory counts, but avoid double-counting the same account
    // across bureaus by taking the max per account type (heuristic).
    const bureauDerogatories = new Map<string, number>();

    for (const profile of profiles) {
      const count = profile.derogatoryCount ?? 0;
      if (count > 0) {
        const existing = bureauDerogatories.get(profile.bureau) ?? 0;
        bureauDerogatories.set(profile.bureau, Math.max(existing, count));
      }

      const tradelines = (profile.tradelines ?? []) as Tradeline[];
      for (const tl of tradelines) {
        if (tl.isDerogatory) {
          if (tl.accountType === 'collection') {
            collections++;
          } else if (tl.paymentStatus?.includes('late') || tl.paymentStatus?.includes('days')) {
            latePayments++;
          }
        }
      }
    }

    // If tradelines didn't give granular data, use bureau-level counts
    if (latePayments === 0 && collections === 0) {
      const totalDerogatory = Array.from(bureauDerogatories.values())
        .reduce((sum, c) => sum + c, 0);
      latePayments = Math.ceil(totalDerogatory * 0.7);
      collections = totalDerogatory - latePayments;
    }

    return { latePayments, collections };
  }

  private countActiveTradelines(profiles: CreditProfileDto[]): number {
    // Use the bureau with the most tradelines as our best data point
    let maxCount = 0;
    for (const profile of profiles) {
      const tradelines = (profile.tradelines ?? []) as Tradeline[];
      const activeCount = tradelines.filter((tl) => !tl.closedAt).length;
      if (activeCount > maxCount) maxCount = activeCount;
    }
    return maxCount;
  }
}
