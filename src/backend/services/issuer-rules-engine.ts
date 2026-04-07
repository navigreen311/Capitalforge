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
  /** Number of new cards opened (any issuer) in the past 24 months */
  newCardsLast24Months: number;
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
}

/** Result of evaluating a single rule. */
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  severity: 'hard' | 'soft';
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
  eligibilityScore: number;
  evaluatedAt: string;
  rulesEvaluated: number;
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
      throw new Error(`Issuer not found: ${issuerId}`);
    }

    const hardBlocks: RuleViolation[] = [];
    const softWarnings: RuleViolation[] = [];

    for (const rule of issuer.rules) {
      const violation = this.evaluateRule(rule, context);
      if (violation) {
        if (violation.severity === 'hard') {
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
      hardBlocks,
      softWarnings,
      eligibilityScore,
      evaluatedAt: new Date().toISOString(),
      rulesEvaluated: issuer.rules.length,
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
      case 'velocity_max_apps_per_period':
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
    const maxApps = rule.value ?? 0;
    const periodDays = rule.periodDays ?? 0;

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

    const cooldownDays = rule.periodDays ?? 0;
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

    const minScore = rule.value ?? 0;
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

    const minMonths = rule.value ?? 0;
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

    const minRevenue = rule.value ?? 0;
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
    const maxInquiries = rule.value ?? 0;
    const periodDays = rule.periodDays ?? 365;

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

    const maxUtil = rule.value ?? 1;
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

    const blackoutDays = rule.periodDays ?? 30;
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
    const maxCards = rule.value ?? 0;
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
