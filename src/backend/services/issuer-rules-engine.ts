// ============================================================
// CapitalForge — Issuer Rules Engine Service
//
// Database-driven rule evaluation engine that checks issuer
// eligibility based on active IssuerRule records. Complements
// the existing in-memory IssuerRulesService with persistent,
// admin-editable rules stored in the DB.
//
// Usage:
//   const engine = new IssuerRulesEngine(prisma);
//   const result = await engine.checkIssuerEligibility(issuerId, context);
// ============================================================

import { PrismaClient } from '@prisma/client';

// ============================================================
// Types
// ============================================================

/** Context provided for rule evaluation — typically built from a business profile. */
export interface EligibilityContext {
  /**
   * New cards opened at BANK issuers in the past 24 months, for Chase 5/24.
   *
   * Credit union cards are excluded, because credit union applications do not
   * count towards 5/24 — the exemption that makes a credit union the sensible
   * next step once bank velocity is spent.
   */
  newCardsLast24Months: number;
  /**
   * How many credit union cards were left out of the count above.
   *
   * Carried so the exemption can be shown rather than inferred: a count that is
   * simply smaller is indistinguishable from cards having been missed, and an
   * advisor reading "3" cannot tell whether the client has three cards or five
   * with two exempted.
   */
  creditUnionCardsExcludedFrom524?: number;
  /**
   * Where `newCardsLast24Months` came from.
   *
   * Applications are what this system submitted; held cards are what the
   * client arrived with, attested by an advisor. The split matters because
   * the two have different provenance and the caveat has to say so — one is
   * a record of our own action, the other is a claim about the past.
   */
  fiveTwentyFourFromApplications?: number;
  fiveTwentyFourFromHeldCards?: number;
  /**
   * Held bank cards with no opening date.
   *
   * Neither counted nor ignored: they are why an answer may be "at most N
   * slots open" rather than "N". The stacking optimizer already drew this
   * distinction; the issuer-rules path did not.
   */
  heldCardsOfUnknownAge?: number;

  /** Number of applications to this specific issuer in the past N days */
  issuerAppsInPeriod: number;
  /** Most recent application date to this issuer (ISO string or null) */
  lastApplicationDate: string | null;
  /** Most recent decline date from this issuer (ISO string or null) */
  lastDeclineDate: string | null;
  /** Current FICO score */
  creditScore: number | null;
  /** Number of hard inquiries in the past 6 months */
  inquiriesLast6Months: number;
  /** Number of hard inquiries in the past 12 months */
  inquiriesLast12Months: number;
  /** Current credit utilization as a decimal (0-1) */
  utilization: number | null;
  /** Business age in months */
  businessAgeMonths: number | null;
  /** Annual revenue in dollars */
  annualRevenue: number | null;
  /** Number of currently open cards with this issuer */
  openCardsWithIssuer: number;
  /** Whether the applicant has an existing banking relationship */
  hasExistingRelationship: boolean;
  /** Total number of new card applications in the past N days (cross-issuer) */
  totalAppsInPeriod: number;
  /** Products previously held with this issuer (slugs) */
  previousProducts: string[];
  /** Evaluation date (defaults to now) */
  asOfDate?: string;
  /** Two-letter US state code (e.g. 'WA', 'CA') for geographic restriction checks */
  state?: string;
}

/**
 * The rule type the cross-issuer velocity check dispatches on — Chase 5/24 and
 * its relatives.
 *
 * Exported and shared because `buildCaveats` has to describe exactly the rule
 * `evaluateRule` applied. An earlier draft matched `'velocity'`, which is not a
 * rule type this engine has ever emitted, so the caveat never fired — and its
 * tests passed, because they asserted the same wrong string. Two copies of a
 * dispatch key is two chances to be wrong about which one is real.
 */
export const CROSS_ISSUER_VELOCITY_RULE = 'velocity_max_apps_per_period';

/** Result of evaluating a single rule. */
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  /**
   * `unconfigured` is not a third grade of seriousness — it means the rule
   * could not be evaluated because a parameter it needs is not recorded.
   * It is reported, and it blocks. See `unevaluatedRules`.
   */
  severity: 'hard' | 'soft' | 'unconfigured';
  description: string;
  /** Why this rule was triggered */
  reason: string;
  /** Current value vs. threshold */
  currentValue: number | string | null;
  threshold: number | string | null;
}

/** Full eligibility result for an issuer. */
export interface EligibilityResult {
  issuerId: string;
  issuerName: string;
  eligible: boolean;
  hardBlocks: RuleViolation[];
  softWarnings: RuleViolation[];
  /**
   * Rules that could not be evaluated because a parameter is missing.
   *
   * Every threshold used to be defaulted with `??`, and the same `?? 0` meant
   * opposite things: `maxApps ?? 0` blocked everyone, `minScore ?? 0` passed
   * everyone, and `periodDays` had three different defaults in this one file —
   * 0, 365 and 30 — so which rule you got depended on which function read it.
   * None of them said the rule was unconfigured.
   *
   * These are also in `hardBlocks`, so an unevaluated rule fails closed. That
   * is a choice, not an accident: an issuer rule nobody finished recording is
   * not evidence that a client qualifies.
   */
  unevaluatedRules: RuleViolation[];
  eligibilityScore: number;
  evaluatedAt: string;
  rulesEvaluated: number;
  /**
   * What the verdict above rests on, where that is narrower than it reads.
   *
   * `eligible: true` is the absence of a violation, and an absence has a
   * denominator. The velocity rules count `CardApplication` rows created in
   * this system — and **nothing here records a card a client already held**.
   * No model exists for one: `CardApplication` is an application made through
   * CapitalForge, so a client who arrived with four bank cards opened
   * elsewhere counts as zero against Chase 5/24.
   *
   * That makes the count a **floor, not a measurement**, and it errs in the
   * permissive direction: the advisor is told there is room, the client
   * applies, and the auto-decline is the first anyone hears of the four cards.
   *
   * Carried as a caveat rather than a warning banner because it is true of
   * every client, always — a flag that always fires is read as decoration
   * within a week. It states the basis of the number so the reader can weigh
   * it, which is the same reason `creditUnionCardsExcludedFrom524` is reported
   * rather than silently subtracted.
   *
   * See `docs/gaps.md` §7 for what would close it.
   */
  caveats: EligibilityCaveat[];
}

export interface EligibilityCaveat {
  /** Which rule or figure the caveat qualifies. */
  subject: string;
  /** What was actually counted. */
  basis: string;
  /** Which direction the uncertainty runs, so a reader knows what to fear. */
  direction: 'may_understate' | 'may_overstate';
}

/**
 * What this verdict rests on, stated where it is narrower than it reads.
 *
 * Only emitted for rules that actually ran, so this does not editorialise
 * about checks nobody performed.
 */
export function buildCaveats(
  rules: readonly { ruleType: string; periodDays: number | null }[],
  context: EligibilityContext,
): EligibilityCaveat[] {
  const caveats: EligibilityCaveat[] = [];

  // Cross-issuer velocity — Chase 5/24 and its relatives. `periodDays >= 365`
  // is the same discriminator `checkVelocity` uses to pick this counter, so
  // the caveat cannot describe a rule the evaluator did not apply.
  const hasCrossIssuerVelocity = rules.some(
    (r) => r.ruleType === CROSS_ISSUER_VELOCITY_RULE && (r.periodDays ?? 0) >= 365,
  );

  if (hasCrossIssuerVelocity) {
    const exempted = context.creditUnionCardsExcludedFrom524 ?? 0;
    const unplaceable = context.heldCardsOfUnknownAge ?? 0;

    // The split is reported only when BOTH halves were supplied and they
    // reconcile against the total.
    //
    // `fiveTwentyFourFromApplications ?? newCardsLast24Months` fell back to the
    // TOTAL, so a caller supplying the held-cards half and not the applications
    // half produced "Counted 5 cards — 5 from applications, 2 from cards the
    // client is recorded as already holding": a breakdown summing to 7 under a
    // headline of 5, double-counting against itself in the sentence an advisor
    // reads to justify a placement.
    //
    // These are not counters with a meaningful zero. They are the two halves of
    // one figure, and one of them absent is unknown rather than zero. So the
    // breakdown reports itself as unavailable, the way an unconfigured rule
    // does, instead of inventing the half it was not given.
    const fromApplications =
      typeof context.fiveTwentyFourFromApplications === 'number'
        ? context.fiveTwentyFourFromApplications
        : null;
    const fromHeldCards =
      typeof context.fiveTwentyFourFromHeldCards === 'number'
        ? context.fiveTwentyFourFromHeldCards
        : null;

    const total = context.newCardsLast24Months;
    const plural = total === 1 ? '' : 's';

    let headline: string;
    if (fromApplications === null || fromHeldCards === null) {
      const bothAbsent = fromApplications === null && fromHeldCards === null;
      const absent = bothAbsent
        ? 'neither half was'
        : fromApplications === null
          ? 'the applications half was'
          : 'the held-cards half was';
      headline =
        `Counted ${total} card${plural}. The split between applications recorded in `
        + `CapitalForge and cards the client already held is NOT AVAILABLE: ${absent} `
        + 'supplied, and a missing half is unknown rather than zero';
    } else if (fromApplications + fromHeldCards !== total) {
      // A breakdown that does not sum to its own headline is not a breakdown.
      headline =
        `Counted ${total} card${plural}. The split is NOT AVAILABLE: the halves supplied `
        + `(${fromApplications} from applications, ${fromHeldCards} from held cards) sum `
        + `to ${fromApplications + fromHeldCards}, which does not reconcile against the `
        + 'total. One of the three figures is wrong and this cannot say which';
    } else {
      headline =
        `Counted ${total} card${plural}`
        + ` — ${fromApplications} from applications recorded in CapitalForge`
        + `, ${fromHeldCards} from cards the client is recorded as already holding`;
    }

    const parts = [headline];

    if (exempted > 0) {
      parts.push(
        `${exempted} credit-union card${exempted === 1 ? '' : 's'} excluded as exempt`,
      );
    }

    if (unplaceable > 0) {
      // The reason the answer is "at most N". These cards exist and cannot be
      // placed in the window, so they are neither counted nor ignored.
      parts.push(
        `${unplaceable} held card${unplaceable === 1 ? '' : 's'} could not be placed in time `
        + '(no opening date recorded), so the figure is a floor',
      );
    }

    parts.push(
      'Held cards are advisor attestations rather than a bureau pull, so this is '
      + 'only as good as what was entered; a card nobody recorded is still invisible',
    );

    caveats.push({
      subject: 'Chase 5/24 and other cross-issuer velocity limits',
      basis: parts.join('. ') + '.',
      // Still may understate: the record improves the answer without
      // guaranteeing it. Nothing forces an advisor to enter a card.
      direction: 'may_understate',
    });
  }

  return caveats;
}

// ============================================================
// Rule type -> IssuerRule shape from DB
// ============================================================

interface DbIssuerRule {
  id: string;
  issuerId: string;
  ruleType: string;
  name: string;
  description: string | null;
  value: number | null;
  periodDays: number | null;
  severity: string;
  isActive: boolean;
}

// ============================================================
// Engine
// ============================================================

/**
 * No such issuer.
 *
 * Typed, because the route mapped this with
 * `err.message.includes('not found')` — the same string-matching hazard removed
 * from the dossier route. Any future error whose message happened to contain
 * those two words became a 404, so a genuine failure would have been reported
 * as "no such issuer" to somebody deciding where to place a client.
 */
export class IssuerNotFoundError extends Error {
  constructor(issuerId: string) {
    super(`Issuer not found: ${issuerId}`);
    this.name = 'IssuerNotFoundError';
  }
}

export class IssuerRulesEngine {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Evaluate all active rules for an issuer against the provided context.
   * Returns eligibility status, hard blocks, soft warnings, and a score.
   */
  async checkIssuerEligibility(
    issuerId: string,
    context: EligibilityContext,
  ): Promise<EligibilityResult> {
    const issuer = await this.prisma.issuer.findUnique({
      where: { id: issuerId },
      include: { rules: { where: { isActive: true } } },
    });

    if (!issuer) {
      throw new IssuerNotFoundError(issuerId);
    }

    const hardBlocks: RuleViolation[] = [];
    const softWarnings: RuleViolation[] = [];
    const unevaluatedRules: RuleViolation[] = [];

    for (const rule of issuer.rules) {
      const violation = this.evaluateRule(rule, context);
      if (violation) {
        if (violation.severity === 'unconfigured') {
          // Both lists. Reported as unevaluated so a reader can see WHY, and
          // blocking so an unfinished rule cannot read as a client qualifying.
          // The `else` below used to catch anything that was not 'hard', so an
          // unconfigured rule would have landed in soft warnings and passed.
          unevaluatedRules.push(violation);
          hardBlocks.push(violation);
        } else if (violation.severity === 'hard') {
          hardBlocks.push(violation);
        } else {
          softWarnings.push(violation);
        }
      }
    }

    const eligible = hardBlocks.length === 0;
    const eligibilityScore = this.calculateScore(
      issuer.rules.length,
      hardBlocks.length,
      softWarnings.length,
    );

    return {
      issuerId: issuer.id,
      issuerName: issuer.name,
      eligible,
      unevaluatedRules,
      hardBlocks,
      softWarnings,
      eligibilityScore,
      evaluatedAt: new Date().toISOString(),
      rulesEvaluated: issuer.rules.length,
      caveats: buildCaveats(issuer.rules, context),
    };
  }

  /**
   * Evaluate a single rule against the context.
   * Returns a RuleViolation if the rule is violated, or null if passed.
   */
  evaluateRule(
    rule: DbIssuerRule,
    context: EligibilityContext,
  ): RuleViolation | null {
    const severity = rule.severity as 'hard' | 'soft';

    switch (rule.ruleType) {
      case CROSS_ISSUER_VELOCITY_RULE:
        return this.checkVelocity(rule, context, severity);

      case 'velocity_cooldown_days':
        return this.checkCooldown(rule, context, severity);

      case 'once_per_lifetime':
        return this.checkOncePerLifetime(rule, context, severity);

      case 'score_minimum':
        return this.checkScoreMinimum(rule, context, severity);

      case 'business_age_minimum':
        return this.checkBusinessAge(rule, context, severity);

      case 'revenue_minimum':
        return this.checkRevenue(rule, context, severity);

      case 'inquiry_maximum':
        return this.checkInquiries(rule, context, severity);

      case 'utilization_maximum':
        return this.checkUtilization(rule, context, severity);

      case 'blackout_after_decline':
        return this.checkDeclineBlackout(rule, context, severity);

      case 'portfolio_maximum':
        return this.checkPortfolioMax(rule, context, severity);

      case 'membership_required':
        return this.checkMembership(rule, context, severity);

      case 'relationship_requirement':
        return this.checkRelationship(rule, context, severity);

      case 'geographic_restriction':
        // Geographic restrictions require location data not yet in context
        return null;

      default:
        return null;
    }
  }

  // ── Private rule evaluators ──────────────────────────────

  private checkVelocity(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    const maxApps = param(rule.value);
    const periodDays = param(rule.periodDays);
    if (maxApps === null) return unevaluated(rule, 'value');
    if (periodDays === null) return unevaluated(rule, 'periodDays');

    // Use totalAppsInPeriod for cross-issuer velocity (e.g. Chase 5/24)
    // Use issuerAppsInPeriod for issuer-specific velocity
    const currentApps = periodDays >= 365
      ? context.newCardsLast24Months
      : context.totalAppsInPeriod;

    if (currentApps >= maxApps) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `${currentApps} applications in the past ${periodDays} days meets/exceeds limit of ${maxApps}.`,
        currentValue: currentApps,
        threshold: maxApps,
      };
    }
    return null;
  }

  private checkCooldown(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    if (!context.lastApplicationDate) return null;

    const cooldownDays = param(rule.periodDays);
    if (cooldownDays === null) return unevaluated(rule, 'periodDays');
    const lastApp = new Date(context.lastApplicationDate);
    const asOf = context.asOfDate ? new Date(context.asOfDate) : new Date();
    const daysSinceLast = Math.floor(
      (asOf.getTime() - lastApp.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceLast < cooldownDays) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `Only ${daysSinceLast} days since last application. Requires ${cooldownDays}-day cooldown.`,
        currentValue: daysSinceLast,
        threshold: cooldownDays,
      };
    }
    return null;
  }

  private checkOncePerLifetime(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    // If there are previous products, check if they held this product before
    // This is a simplified check — in practice, would compare specific product names
    if (context.previousProducts.length > 0) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `Applicant has previously held products with this issuer. Once-per-lifetime restriction may apply.`,
        currentValue: context.previousProducts.join(', '),
        threshold: 'once per lifetime',
      };
    }
    return null;
  }

  private checkScoreMinimum(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    if (context.creditScore === null) return null;

    const minScore = param(rule.value);
    if (minScore === null) return unevaluated(rule, 'value');
    if (context.creditScore < minScore) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `Credit score ${context.creditScore} is below minimum of ${minScore}.`,
        currentValue: context.creditScore,
        threshold: minScore,
      };
    }
    return null;
  }

  private checkBusinessAge(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    if (context.businessAgeMonths === null) return null;

    const minMonths = param(rule.value);
    if (minMonths === null) return unevaluated(rule, 'value');
    if (context.businessAgeMonths < minMonths) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `Business age ${context.businessAgeMonths} months is below minimum of ${minMonths} months.`,
        currentValue: context.businessAgeMonths,
        threshold: minMonths,
      };
    }
    return null;
  }

  private checkRevenue(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    if (context.annualRevenue === null) return null;

    const minRevenue = param(rule.value);
    if (minRevenue === null) return unevaluated(rule, 'value');
    if (context.annualRevenue < minRevenue) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `Annual revenue $${context.annualRevenue.toLocaleString()} is below minimum of $${minRevenue.toLocaleString()}.`,
        currentValue: context.annualRevenue,
        threshold: minRevenue,
      };
    }
    return null;
  }

  private checkInquiries(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    const maxInquiries = param(rule.value);
    const periodDays = param(rule.periodDays);
    if (maxInquiries === null) return unevaluated(rule, 'value');
    if (periodDays === null) return unevaluated(rule, 'periodDays');

    const currentInquiries = periodDays <= 180
      ? context.inquiriesLast6Months
      : context.inquiriesLast12Months;

    if (currentInquiries > maxInquiries) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `${currentInquiries} inquiries in the past ${periodDays} days exceeds maximum of ${maxInquiries}.`,
        currentValue: currentInquiries,
        threshold: maxInquiries,
      };
    }
    return null;
  }

  private checkUtilization(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    if (context.utilization === null) return null;

    const maxUtil = param(rule.value);
    if (maxUtil === null) return unevaluated(rule, 'value');
    if (context.utilization > maxUtil) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `Utilization ${(context.utilization * 100).toFixed(1)}% exceeds maximum of ${(maxUtil * 100).toFixed(1)}%.`,
        currentValue: context.utilization,
        threshold: maxUtil,
      };
    }
    return null;
  }

  private checkDeclineBlackout(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    if (!context.lastDeclineDate) return null;

    const blackoutDays = param(rule.periodDays);
    if (blackoutDays === null) return unevaluated(rule, 'periodDays');
    const lastDecline = new Date(context.lastDeclineDate);
    const asOf = context.asOfDate ? new Date(context.asOfDate) : new Date();
    const daysSinceDecline = Math.floor(
      (asOf.getTime() - lastDecline.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceDecline < blackoutDays) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `Only ${daysSinceDecline} days since last decline. Blackout period is ${blackoutDays} days.`,
        currentValue: daysSinceDecline,
        threshold: blackoutDays,
      };
    }
    return null;
  }

  private checkPortfolioMax(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    const maxCards = param(rule.value);
    if (maxCards === null) return unevaluated(rule, 'value');
    if (context.openCardsWithIssuer >= maxCards) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: `Already holding ${context.openCardsWithIssuer} cards with this issuer. Maximum is ${maxCards}.`,
        currentValue: context.openCardsWithIssuer,
        threshold: maxCards,
      };
    }
    return null;
  }

  private checkMembership(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    if (!context.hasExistingRelationship) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: 'Membership or existing relationship is required.',
        currentValue: 'none',
        threshold: 'required',
      };
    }
    return null;
  }

  private checkRelationship(
    rule: DbIssuerRule,
    context: EligibilityContext,
    severity: 'hard' | 'soft',
  ): RuleViolation | null {
    if (!context.hasExistingRelationship) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity,
        description: rule.description ?? '',
        reason: 'An existing banking relationship is recommended for better approval odds.',
        currentValue: 'no relationship',
        threshold: 'relationship preferred',
      };
    }
    return null;
  }

  // ── Scoring ──────────────────────────────────────────────

  /**
   * Calculate an eligibility score from 0-100.
   * 100 = all rules pass. Each hard block deducts 25 points, each soft warning deducts 10.
   */
  private calculateScore(
    totalRules: number,
    hardBlockCount: number,
    softWarningCount: number,
  ): number {
    if (totalRules === 0) return 100;
    const penalty = hardBlockCount * 25 + softWarningCount * 10;
    return Math.max(0, Math.min(100, 100 - penalty));
  }
}

// ============================================================
// Credit Union — Types
// ============================================================

/** Known credit union slugs used for CU-specific logic. */
export type CreditUnionSlug =
  | 'navy_federal'
  | 'penfed'
  | 'alliant'
  | 'first_tech'
  | 'becu'
  // Matches card_products.issuerId, which is the constrained source. This
  // engine previously said 'lake_michigan' and nothing reconciled the two.
  | 'lake_michigan_cu';

/** Bureau that a credit union primarily pulls for underwriting. */
export type CreditBureau = 'TransUnion' | 'Equifax' | 'Experian';

/** Result from evaluating CU-specific eligibility. */
export interface CreditUnionEligibilityResult {
  /** Credit union identifier (slug) */
  creditUnionSlug: string;
  /** Overall status: eligible, requires_verification, or ineligible */
  status: 'eligible' | 'requires_verification' | 'ineligible';
  /** Whether CU membership must be verified before applying */
  membershipRequired: boolean;
  /** Note about CU membership requirements */
  membershipNote: string;
  /** Hard blocks (e.g. state restriction) */
  blocks: CreditUnionBlock[];
  /** Advisory notes (velocity, strategy) */
  notes: string[];
  /** Which credit bureau this CU primarily pulls */
  bureauPull: CreditBureau;
  /** Minimum credit score for this CU (lower than major banks) */
  minimumCreditScore: number;
  /** Whether this application counts against bank velocity rules */
  countsAgainstBankVelocity: boolean;
}

/**
 * A rule parameter, or null when it is not recorded.
 *
 * Deliberately not defaulted. A threshold nobody entered is not a threshold of
 * zero, and the caller must say what it wants to do about that rather than
 * inherit whatever `??` happened to be written on the line.
 */
function param(value: number | null | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

/** The rule could not be evaluated. Named, reported, and blocking. */
function unevaluated(
  rule: { id: string; ruleName?: string | null; ruleType: string; description?: string | null },
  missing: string,
): RuleViolation {
  return {
    ruleId: rule.id,
    ruleName: rule.ruleName ?? rule.ruleType,
    ruleType: rule.ruleType,
    severity: 'unconfigured',
    description: rule.description ?? '',
    reason:
      `Rule cannot be evaluated: \`${missing}\` is not recorded on it. `
      + 'It is neither passed nor failed — nothing here knows what it requires.',
    currentValue: null,
    threshold: null,
  };
}

/** A blocking condition specific to credit union evaluation. */
export interface CreditUnionBlock {
  type: 'state_restriction' | 'credit_score' | 'other';
  message: string;
}

// ============================================================
// Credit Union — Configuration Data
// ============================================================

interface CreditUnionConfig {
  slug: CreditUnionSlug;
  name: string;
  bureau: CreditBureau;
  minimumScore: number;
  stateRestriction: string | null;
  membershipNote: string;
}

const CREDIT_UNION_CONFIGS: Record<CreditUnionSlug, CreditUnionConfig> = {
  navy_federal: {
    slug: 'navy_federal',
    name: 'Navy Federal Credit Union',
    bureau: 'Equifax',
    minimumScore: 600,
    stateRestriction: null,
    membershipNote:
      'Membership open to active-duty military, veterans, DoD civilians, and their families.',
  },
  penfed: {
    slug: 'penfed',
    name: 'PenFed Credit Union',
    bureau: 'TransUnion',
    minimumScore: 580,
    stateRestriction: null,
    membershipNote:
      'Membership open to anyone — join via Voices for America\'s Troops ($17 one-time donation).',
  },
  alliant: {
    slug: 'alliant',
    name: 'Alliant Credit Union',
    bureau: 'TransUnion',
    minimumScore: 620,
    stateRestriction: null,
    membershipNote:
      'Membership open to anyone — join via Foster Care to Success ($5 donation).',
  },
  first_tech: {
    slug: 'first_tech',
    name: 'First Tech Federal Credit Union',
    bureau: 'TransUnion',
    minimumScore: 600,
    stateRestriction: null,
    membershipNote:
      'Membership open to anyone — join via Financial Fitness Association ($8/year).',
  },
  becu: {
    slug: 'becu',
    name: 'BECU',
    bureau: 'Equifax',
    minimumScore: 600,
    stateRestriction: 'WA',
    membershipNote:
      'Membership requires living or working in Washington state.',
  },
  lake_michigan_cu: {
    slug: 'lake_michigan_cu',
    name: 'Lake Michigan Credit Union',
    bureau: 'Equifax',
    minimumScore: 620,
    stateRestriction: null,
    membershipNote:
      'Membership open to anyone — join via ACA International membership ($5).',
  },
};

/**
 * The credit union slugs this engine has configuration for.
 *
 * Exported so a test can assert they match the issuer registry. They did not:
 * this engine said `lake_michigan` while the card catalogue said
 * `lake_michigan_cu`, and because the lookup is a Record, the mismatch
 * resolved to `undefined` and read as "no special handling" rather than as an
 * error.
 */
export const CREDIT_UNION_SLUGS_IN_RULES_ENGINE: readonly string[] =
  Object.keys(CREDIT_UNION_CONFIGS);


// ============================================================
// Credit Union — Eligibility Evaluation
// ============================================================

/**
 * Evaluate credit union-specific eligibility rules.
 *
 * Unlike major bank issuers, credit unions:
 * - Always require membership verification before applying
 * - Have lower credit score minimums (580-650 vs 670-750+)
 * - Do NOT count against bank velocity rules (Chase 5/24, Amex 2/90)
 * - May have geographic restrictions (e.g. BECU = WA only)
 *
 * @param creditUnionSlug - The slug identifier for the credit union
 * @param context - Standard eligibility context
 * @returns CreditUnionEligibilityResult with status, blocks, and advisory notes
 */
export function evaluateCreditUnionEligibility(
  creditUnionSlug: string,
  context: EligibilityContext,
): CreditUnionEligibilityResult {
  const config = CREDIT_UNION_CONFIGS[creditUnionSlug as CreditUnionSlug];

  // Fallback for unknown CU slugs — still return a valid result
  if (!config) {
    return {
      creditUnionSlug,
      status: 'requires_verification',
      membershipRequired: true,
      membershipNote:
        'Membership is required. Check the credit union website for eligibility requirements.',
      blocks: [],
      notes: [
        'Credit union applications do not count against Chase 5/24 or Amex velocity limits.',
      ],
      bureauPull: 'TransUnion',
      minimumCreditScore: 620,
      countsAgainstBankVelocity: false,
    };
  }

  const blocks: CreditUnionBlock[] = [];
  const notes: string[] = [];

  // ── State restriction check ─────────────────────────────
  if (config.stateRestriction) {
    if (!context.state) {
      blocks.push({
        type: 'state_restriction',
        message: `${config.name} requires residence in ${config.stateRestriction}. State not provided — please verify before applying.`,
      });
    } else if (
      context.state.toUpperCase() !== config.stateRestriction.toUpperCase()
    ) {
      blocks.push({
        type: 'state_restriction',
        message: `${config.name} requires residence in ${config.stateRestriction}. Applicant is in ${context.state.toUpperCase()}.`,
      });
    }
  }

  // ── Credit score check (softer minimums) ────────────────
  if (context.creditScore !== null && context.creditScore < config.minimumScore) {
    blocks.push({
      type: 'credit_score',
      message: `Credit score ${context.creditScore} is below ${config.name}'s recommended minimum of ${config.minimumScore}. CUs are more flexible than banks, but approval is unlikely below this threshold.`,
    });
  }

  // ── Velocity impact note ────────────────────────────────
  notes.push(
    'Credit union applications do NOT count against Chase 5/24 or Amex 2/90 velocity rules. Apply freely without impacting major bank eligibility.',
  );

  // ── Bureau pull info ────────────────────────────────────
  notes.push(
    `${config.name} primarily pulls ${config.bureau}. Plan your inquiry strategy accordingly.`,
  );

  // ── Determine overall status ────────────────────────────
  const hasHardBlocks = blocks.some((b) => b.type === 'state_restriction');
  const hasCreditBlock = blocks.some((b) => b.type === 'credit_score');

  let status: CreditUnionEligibilityResult['status'];
  if (hasHardBlocks) {
    status = 'ineligible';
  } else if (hasCreditBlock) {
    // CUs are more flexible — credit score issues are soft blocks
    status = 'requires_verification';
  } else {
    // Membership always needs verification
    status = 'requires_verification';
  }

  return {
    creditUnionSlug: config.slug,
    status,
    membershipRequired: true,
    membershipNote: config.membershipNote,
    blocks,
    notes,
    bureauPull: config.bureau,
    minimumCreditScore: config.minimumScore,
    countsAgainstBankVelocity: false,
  };
}

// ============================================================
// Credit Union — Bureau Pull Mapping (Convenience)
// ============================================================

/**
 * Get the primary credit bureau a credit union pulls during underwriting.
 *
 * Mapping:
 * - PenFed, Alliant, First Tech --> TransUnion
 * - Navy Federal, BECU, Lake Michigan --> Equifax
 *
 * @param creditUnionSlug - The credit union slug
 * @returns The bureau name, or 'TransUnion' as a safe default
 */
export function getCreditUnionBureauPull(
  creditUnionSlug: string,
): CreditBureau {
  const config = CREDIT_UNION_CONFIGS[creditUnionSlug as CreditUnionSlug];
  return config?.bureau ?? 'TransUnion';
}

// ============================================================
// Credit Union — Strategy Note
// ============================================================

/**
 * Returns a strategy note explaining how credit union cards fit
 * into an overall credit card optimization strategy.
 *
 * Key points covered:
 * - CU cards do not count against bank velocity limits
 * - Lower ongoing APRs (10-18% vs 20-29% at major banks)
 * - Membership is often open to anyone via partner organizations
 * - Best to apply AFTER major bank cards in sequencing
 * - Membership establishment takes 1-3 business days
 */
export function getCreditUnionStrategyNote(): string {
  return [
    '=== Credit Union Card Strategy ===',
    '',
    '1. VELOCITY ADVANTAGE: Credit union card applications do NOT count against',
    '   major bank velocity rules such as Chase 5/24 or Amex 2/90. You can apply',
    '   for CU cards without reducing your eligibility at Chase, Amex, Citi, or',
    '   other major issuers.',
    '',
    '2. LOWER APRs: Credit unions typically offer ongoing APRs of 10-18%, compared',
    '   to 20-29% at major banks. This makes CU cards ideal for balances that may',
    '   carry month-to-month or for balance transfer strategies.',
    '',
    '3. MEMBERSHIP IS OFTEN OPEN: Most credit unions allow anyone to join through',
    '   a partner organization or charitable donation ($5-$17 one-time). Navy Federal',
    '   is the exception, requiring military affiliation.',
    '',
    '4. SEQUENCING — APPLY AFTER BANKS: Because CU apps do not affect bank velocity,',
    '   always prioritize major bank applications first (Chase, Amex, Citi, Capital One,',
    '   Barclays). Once those are secured, layer in credit union applications freely.',
    '',
    '5. MEMBERSHIP LEAD TIME: Plan ahead — membership establishment typically takes',
    '   1-3 business days. Some CUs require membership to be active for 24-48 hours',
    '   before you can apply for a credit card. Factor this into your application timeline.',
  ].join('\n');
}
