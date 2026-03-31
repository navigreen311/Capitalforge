// ============================================================
// CapitalForge — Issuer Rules Service
//
// Versioned database of issuer-specific credit card rules.
// Each rule is modeled as a pure, side-effect-free eligibility
// check so it can be tested in isolation and composed freely
// inside the stacking optimizer.
//
// Rules currently modeled:
//   Chase  — 5/24 rule
//   Amex   — velocity limits (max 2 new cards per 90 days,
//             max 4 personal + 4 business lifetime caps,
//             1-card-per-5-days application cooldown)
//   Citi   — 1/8 rule (1 app per 8 days) and 2/65 rule
//             (2 apps per 65 days, per product family)
//
// To add a new rule:
//   1. Extend IssuerRuleId and ISSUER_RULES_REGISTRY.
//   2. Implement a new check function following the existing pattern.
//   3. Wire it into evaluateAllRules().
// ============================================================

import type { Issuer } from './card-products.js';
import { ISSUER_RULES as RULE_CONSTANTS } from '../../shared/constants/index.js';

// ============================================================
// Domain types
// ============================================================

/** A single card that is already open or was opened in the past. */
export interface ExistingCard {
  id: string;
  issuer: Issuer;
  /** ISO date string — when the card was opened / approved */
  openedAt: string;
  /** Whether the card is still open */
  isOpen: boolean;
}

/** Minimal credit/application profile needed for rule evaluation. */
export interface ApplicantProfile {
  /** All cards the applicant has held (open + closed) */
  existingCards: ExistingCard[];
  /**
   * All credit-card application dates in the past 65 days regardless of issuer.
   * ISO date strings.
   */
  recentApplicationDates: string[];
}

/** Result of evaluating a single issuer rule. */
export interface RuleCheckResult {
  ruleId: IssuerRuleId;
  issuer: Issuer;
  /** Human-readable description of the rule */
  ruleName: string;
  passed: boolean;
  /** Why the rule passed or failed */
  reason: string;
  /** Extra diagnostic data (counts, dates) for UI display */
  meta?: Record<string, unknown>;
}

/** Summary of running all rules for a candidate card issuer. */
export interface IssuerEligibilityResult {
  issuer: Issuer;
  eligible: boolean;
  /** Subset of rules that blocked eligibility */
  blockedBy: RuleCheckResult[];
  /** All rule results (pass and fail) */
  allResults: RuleCheckResult[];
}

// ============================================================
// Rule registry
// ============================================================

export type IssuerRuleId =
  | 'chase_5_24'
  | 'amex_velocity_90d'
  | 'amex_velocity_5d_cooldown'
  | 'citi_1_per_8_days'
  | 'citi_2_per_65_days';

interface IssuerRule {
  id: IssuerRuleId;
  issuer: Issuer;
  name: string;
  /** Semver of this rule definition — bump when the rule logic changes */
  version: string;
  description: string;
}

export const ISSUER_RULES_REGISTRY: Readonly<Record<IssuerRuleId, IssuerRule>> = {
  chase_5_24: {
    id: 'chase_5_24',
    issuer: 'chase',
    name: 'Chase 5/24 Rule',
    version: '1.0.0',
    description:
      'Chase will not approve applicants who have opened 5 or more new credit cards ' +
      `(from any issuer) in the past ${RULE_CONSTANTS.CHASE_524_WINDOW_MONTHS} months.`,
  },
  amex_velocity_90d: {
    id: 'amex_velocity_90d',
    issuer: 'amex',
    name: 'Amex 90-Day Velocity Limit',
    version: '1.0.0',
    description:
      `Amex limits applicants to 2 new card approvals within any ${RULE_CONSTANTS.AMEX_VELOCITY_COOLDOWN_DAYS}-day window.`,
  },
  amex_velocity_5d_cooldown: {
    id: 'amex_velocity_5d_cooldown',
    issuer: 'amex',
    name: 'Amex 5-Day Application Cooldown',
    version: '1.0.0',
    description:
      'Amex typically declines a new application submitted within 5 days of a previous Amex application.',
  },
  citi_1_per_8_days: {
    id: 'citi_1_per_8_days',
    issuer: 'citi',
    name: 'Citi 1/8 Rule',
    version: '1.0.0',
    description:
      `Citi limits applicants to 1 new card application per ${RULE_CONSTANTS.CITI_1_8_DAYS} days.`,
  },
  citi_2_per_65_days: {
    id: 'citi_2_per_65_days',
    issuer: 'citi',
    name: 'Citi 2/65 Rule',
    version: '1.0.0',
    description:
      `Citi limits applicants to 2 new card applications per ${RULE_CONSTANTS.CITI_8_65_DAYS} days.`,
  },
};

// ============================================================
// Date helpers
// ============================================================

function daysBetween(earlier: Date, later: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((later.getTime() - earlier.getTime()) / msPerDay);
}

function monthsBetween(earlier: Date, later: Date): number {
  return (
    (later.getFullYear() - earlier.getFullYear()) * 12 +
    (later.getMonth() - earlier.getMonth())
  );
}

function parseDate(iso: string): Date {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    throw new Error(`[IssuerRulesService] Invalid date string: "${iso}"`);
  }
  return d;
}

// ============================================================
// Individual rule checks
// ============================================================

/**
 * Chase 5/24 — reject if 5+ new cards opened in the past 24 months.
 * Counts cards from ALL issuers, not just Chase.
 */
function checkChase524(
  profile: ApplicantProfile,
  asOf: Date = new Date(),
): RuleCheckResult {
  const rule = ISSUER_RULES_REGISTRY.chase_5_24;
  const windowMonths = RULE_CONSTANTS.CHASE_524_WINDOW_MONTHS;
  const maxCards = RULE_CONSTANTS.CHASE_524_MAX_CARDS;

  const newCards = profile.existingCards.filter((card) => {
    const opened = parseDate(card.openedAt);
    return monthsBetween(opened, asOf) < windowMonths;
  });

  const count = newCards.length;
  const passed = count < maxCards;

  return {
    ruleId: rule.id,
    issuer: rule.issuer,
    ruleName: rule.name,
    passed,
    reason: passed
      ? `${count} new card(s) opened in the past ${windowMonths} months (limit: ${maxCards - 1}).`
      : `${count} new card(s) opened in the past ${windowMonths} months — exceeds Chase 5/24 limit of ${maxCards - 1}.`,
    meta: {
      newCardsInWindow: count,
      windowMonths,
      maxAllowed: maxCards - 1,
      cardIds: newCards.map((c) => c.id),
    },
  };
}

/**
 * Amex 90-day velocity — reject if 2+ Amex cards opened in the past 90 days.
 */
function checkAmexVelocity90d(
  profile: ApplicantProfile,
  asOf: Date = new Date(),
): RuleCheckResult {
  const rule = ISSUER_RULES_REGISTRY.amex_velocity_90d;
  const windowDays = RULE_CONSTANTS.AMEX_VELOCITY_COOLDOWN_DAYS;
  const maxInWindow = 2;

  const recentAmex = profile.existingCards.filter((card) => {
    if (card.issuer !== 'amex') return false;
    const opened = parseDate(card.openedAt);
    return daysBetween(opened, asOf) < windowDays;
  });

  const count = recentAmex.length;
  const passed = count < maxInWindow;

  return {
    ruleId: rule.id,
    issuer: rule.issuer,
    ruleName: rule.name,
    passed,
    reason: passed
      ? `${count} Amex card(s) opened in the past ${windowDays} days (limit: ${maxInWindow - 1}).`
      : `${count} Amex card(s) opened in the past ${windowDays} days — exceeds Amex velocity limit of ${maxInWindow - 1}.`,
    meta: {
      recentAmexCount: count,
      windowDays,
      maxAllowed: maxInWindow - 1,
    },
  };
}

/**
 * Amex 5-day cooldown — reject if an Amex application was submitted within
 * the last 5 days (datapoint: Amex system-duplicates on quick re-apps).
 */
function checkAmexCooldown5d(
  profile: ApplicantProfile,
  asOf: Date = new Date(),
): RuleCheckResult {
  const rule = ISSUER_RULES_REGISTRY.amex_velocity_5d_cooldown;
  const cooldownDays = 5;

  const recentDates = profile.recentApplicationDates
    .map(parseDate)
    .filter((d) => daysBetween(d, asOf) < cooldownDays);

  // Also check existing Amex card openings within 5 days
  const recentAmexOpenings = profile.existingCards
    .filter((c) => c.issuer === 'amex')
    .map((c) => parseDate(c.openedAt))
    .filter((d) => daysBetween(d, asOf) < cooldownDays);

  const passed = recentDates.length === 0 && recentAmexOpenings.length === 0;

  return {
    ruleId: rule.id,
    issuer: rule.issuer,
    ruleName: rule.name,
    passed,
    reason: passed
      ? `No Amex applications in the past ${cooldownDays} days.`
      : `An Amex application was submitted within the past ${cooldownDays} days — cooldown period active.`,
    meta: {
      cooldownDays,
      recentApplications: recentDates.length,
      recentOpenings: recentAmexOpenings.length,
    },
  };
}

/**
 * Citi 1/8 — reject if any credit-card application was submitted within 8 days.
 */
function checkCiti1Per8Days(
  profile: ApplicantProfile,
  asOf: Date = new Date(),
): RuleCheckResult {
  const rule = ISSUER_RULES_REGISTRY.citi_1_per_8_days;
  const windowDays = RULE_CONSTANTS.CITI_1_8_DAYS;

  const recentApps = profile.recentApplicationDates
    .map(parseDate)
    .filter((d) => daysBetween(d, asOf) < windowDays);

  const passed = recentApps.length === 0;

  return {
    ruleId: rule.id,
    issuer: rule.issuer,
    ruleName: rule.name,
    passed,
    reason: passed
      ? `No credit applications in the past ${windowDays} days.`
      : `${recentApps.length} application(s) in the past ${windowDays} days — Citi 1/8 rule blocks new application.`,
    meta: {
      windowDays,
      recentApplicationCount: recentApps.length,
    },
  };
}

/**
 * Citi 2/65 — reject if 2+ credit-card applications were submitted within 65 days.
 */
function checkCiti2Per65Days(
  profile: ApplicantProfile,
  asOf: Date = new Date(),
): RuleCheckResult {
  const rule = ISSUER_RULES_REGISTRY.citi_2_per_65_days;
  const windowDays = RULE_CONSTANTS.CITI_8_65_DAYS;
  const maxApps = 2;

  const recentApps = profile.recentApplicationDates
    .map(parseDate)
    .filter((d) => daysBetween(d, asOf) < windowDays);

  const count = recentApps.length;
  const passed = count < maxApps;

  return {
    ruleId: rule.id,
    issuer: rule.issuer,
    ruleName: rule.name,
    passed,
    reason: passed
      ? `${count} application(s) in the past ${windowDays} days (limit: ${maxApps - 1}).`
      : `${count} application(s) in the past ${windowDays} days — Citi 2/65 rule blocks new application.`,
    meta: {
      windowDays,
      applicationCount: count,
      maxAllowed: maxApps - 1,
    },
  };
}

// ============================================================
// IssuerRulesService
// ============================================================

export class IssuerRulesService {
  /**
   * Check all rules that apply to a specific issuer.
   * Pass an optional `asOf` date to simulate future / past evaluations.
   */
  checkIssuer(
    issuer: Issuer,
    profile: ApplicantProfile,
    asOf: Date = new Date(),
  ): IssuerEligibilityResult {
    const results = this._runRulesForIssuer(issuer, profile, asOf);
    const blockedBy = results.filter((r) => !r.passed);

    return {
      issuer,
      eligible: blockedBy.length === 0,
      blockedBy,
      allResults: results,
    };
  }

  /**
   * Evaluate all rules across all supported issuers.
   * Useful for a full eligibility scan before generating a stack plan.
   */
  checkAllIssuers(
    profile: ApplicantProfile,
    asOf: Date = new Date(),
  ): Map<Issuer, IssuerEligibilityResult> {
    const supportedIssuers: Issuer[] = ['chase', 'amex', 'citi'];
    const resultMap = new Map<Issuer, IssuerEligibilityResult>();

    for (const issuer of supportedIssuers) {
      resultMap.set(issuer, this.checkIssuer(issuer, profile, asOf));
    }

    return resultMap;
  }

  /**
   * Convenience: returns true only when the issuer has zero blocking rules.
   */
  isEligible(
    issuer: Issuer,
    profile: ApplicantProfile,
    asOf: Date = new Date(),
  ): boolean {
    return this.checkIssuer(issuer, profile, asOf).eligible;
  }

  /**
   * Returns the canonical rule definitions for UI rendering / audit logs.
   */
  getRuleDefinitions(): IssuerRule[] {
    return Object.values(ISSUER_RULES_REGISTRY);
  }

  /**
   * Returns rule definitions filtered to a single issuer.
   */
  getRuleDefinitionsForIssuer(issuer: Issuer): IssuerRule[] {
    return Object.values(ISSUER_RULES_REGISTRY).filter((r) => r.issuer === issuer);
  }

  // ── Private ────────────────────────────────────────────────

  private _runRulesForIssuer(
    issuer: Issuer,
    profile: ApplicantProfile,
    asOf: Date,
  ): RuleCheckResult[] {
    switch (issuer) {
      case 'chase':
        return [checkChase524(profile, asOf)];

      case 'amex':
        return [
          checkAmexVelocity90d(profile, asOf),
          checkAmexCooldown5d(profile, asOf),
        ];

      case 'citi':
        return [
          checkCiti1Per8Days(profile, asOf),
          checkCiti2Per65Days(profile, asOf),
        ];

      default:
        // Issuers without modeled rules are always considered eligible
        return [];
    }
  }
}

// Singleton convenience export
export const issuerRulesService = new IssuerRulesService();
