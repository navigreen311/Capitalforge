// ============================================================
// CapitalForge — Card Benefits & Perks Tracker Service
//
// Responsibilities:
//   • Maintain a registry of per-card benefits (insurance,
//     travel credits, extended warranties, cashback categories,
//     lounge access, etc.)
//   • Track utilization of each benefit (utilized / date)
//   • Generate expiry alerts for benefits with an expiryDate
//   • Produce a keep-vs-cancel recommendation for each card
//     based on how much benefit value has been utilised relative
//     to the card's annual fee
// ============================================================

import { CARD_CATALOG, getActiveCards, type CardProduct } from './card-products.js';

// ── Benefit types ─────────────────────────────────────────────

export type BenefitType =
  | 'travel_credit'
  | 'lounge_access'
  | 'purchase_protection'
  | 'extended_warranty'
  | 'trip_cancellation_insurance'
  | 'rental_car_insurance'
  | 'cell_phone_protection'
  | 'global_entry_tsa_credit'
  | 'hotel_credit'
  | 'dining_credit'
  | 'cashback_category'
  | 'sign_up_bonus'
  | 'annual_fee_rebate'
  | 'other';

// ── Static benefit catalog entry ─────────────────────────────
//
// Each CardBenefitDefinition describes a reusable benefit tied
// to a specific card product.  These are seeded from the card
// catalog; callers may also inject custom ones for testing.

export interface CardBenefitDefinition {
  id: string;                 // stable slug: <cardId>--<type>--<seq>
  cardId: string;             // references CardProduct.id
  cardName: string;
  issuer: string;
  benefitType: BenefitType;
  benefitName: string;
  /** Estimated annual USD value of the benefit */
  benefitValue: number;
  /** Annual reset date ISO string, e.g. "2026-12-31" — null = no reset */
  annualResetDate: string | null;
  /** Whether the cardholder must actively claim/use the credit */
  requiresActiveClaim: boolean;
  description: string;
}

// ── Runtime benefit record ────────────────────────────────────
//
// Created per-business when a card is added to their portfolio.

export interface BusinessCardBenefit {
  id: string;                  // runtime UUID (echoes CardBenefit.id from Prisma)
  businessId: string;
  cardApplicationId: string;   // ties to CardApplication.id
  cardId: string;
  definitionId: string;        // references CardBenefitDefinition.id
  benefitType: BenefitType;
  benefitName: string;
  benefitValue: number;
  /** ISO date when this specific benefit instance expires */
  expiryDate: string | null;
  utilized: boolean;
  utilizedDate: string | null;
  createdAt: string;
}

// ── Alert ─────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'urgent';

export interface BenefitExpiryAlert {
  benefitId: string;
  cardId: string;
  cardName: string;
  benefitName: string;
  benefitValue: number;
  expiryDate: string;
  daysUntilExpiry: number;
  severity: AlertSeverity;
  message: string;
}

// ── Renewal recommendation ────────────────────────────────────

export type RenewalDecision = 'keep' | 'cancel' | 'negotiate' | 'product_change';

export interface CardRenewalRecommendation {
  cardId: string;
  cardApplicationId: string;
  cardName: string;
  issuer: string;
  annualFee: number;
  /** Sum of values of benefits actually utilized this period */
  utilizedBenefitValue: number;
  /** Sum of values of ALL available benefits (utilized + not) */
  totalAvailableBenefitValue: number;
  /** utilizedBenefitValue / annualFee (0-∞; >1 = value exceeds fee) */
  utilizationRatio: number;
  decision: RenewalDecision;
  reasoning: string;
  potentialAnnualSavings: number;
}

// ── Input for benefit utilization ────────────────────────────

export interface UtilizeBenefitInput {
  benefitId: string;
  utilizedDate?: string;  // ISO string; defaults to now
}

// ── Static benefit catalog seeded from card products ─────────
//
// Production systems would extend this with issuer-provided data.
// Here we derive a reasonable benefit set from the catalog.

function buildStaticBenefitCatalog(
  cards: ReadonlyArray<CardProduct>,
): Map<string, CardBenefitDefinition[]> {
  const catalog = new Map<string, CardBenefitDefinition[]>();

  for (const card of cards) {
    const defs: CardBenefitDefinition[] = [];

    // All cards: purchase protection (basic)
    defs.push({
      id:                  `${card.id}--purchase_protection--1`,
      cardId:              card.id,
      cardName:            card.name,
      issuer:              card.issuer,
      benefitType:         'purchase_protection',
      benefitName:         'Purchase Protection',
      benefitValue:        50,
      annualResetDate:     null,
      requiresActiveClaim: true,
      description:         'Covers eligible purchases against damage or theft for up to 120 days.',
    });

    // All cards: extended warranty
    defs.push({
      id:                  `${card.id}--extended_warranty--1`,
      cardId:              card.id,
      cardName:            card.name,
      issuer:              card.issuer,
      benefitType:         'extended_warranty',
      benefitName:         'Extended Warranty',
      benefitValue:        75,
      annualResetDate:     null,
      requiresActiveClaim: true,
      description:         'Extends original manufacturer warranty by up to 1 year.',
    });

    // Rental car insurance for cards without foreign transaction fee
    if (card.foreignTransactionFeePercent === 0) {
      defs.push({
        id:                  `${card.id}--rental_car_insurance--1`,
        cardId:              card.id,
        cardName:            card.name,
        issuer:              card.issuer,
        benefitType:         'rental_car_insurance',
        benefitName:         'Rental Car Insurance',
        benefitValue:        125,
        annualResetDate:     null,
        requiresActiveClaim: false,
        description:         'Auto collision damage waiver when paying with this card.',
      });
    }

    // Annual fee cards get premium perks
    if (card.annualFee >= 95) {
      defs.push({
        id:                  `${card.id}--trip_cancellation_insurance--1`,
        cardId:              card.id,
        cardName:            card.name,
        issuer:              card.issuer,
        benefitType:         'trip_cancellation_insurance',
        benefitName:         'Trip Cancellation & Interruption Insurance',
        benefitValue:        200,
        annualResetDate:     null,
        requiresActiveClaim: true,
        description:         'Reimbursement up to $10,000 per trip for covered cancellations.',
      });
    }

    if (card.annualFee >= 150) {
      defs.push({
        id:                  `${card.id}--travel_credit--1`,
        cardId:              card.id,
        cardName:            card.name,
        issuer:              card.issuer,
        benefitType:         'travel_credit',
        benefitName:         'Annual Travel Credit',
        benefitValue:        card.annualFee >= 375 ? 200 : 100,
        annualResetDate:     `${new Date().getFullYear()}-12-31`,
        requiresActiveClaim: false,
        description:         'Statement credit for eligible travel purchases.',
      });

      defs.push({
        id:                  `${card.id}--global_entry_tsa_credit--1`,
        cardId:              card.id,
        cardName:            card.name,
        issuer:              card.issuer,
        benefitType:         'global_entry_tsa_credit',
        benefitName:         'Global Entry / TSA PreCheck Credit',
        benefitValue:        100,
        annualResetDate:     null,
        requiresActiveClaim: true,
        description:         'Up to $100 statement credit every 4 years for Global Entry or TSA PreCheck.',
      });
    }

    // Sign-up bonus as a one-time benefit
    if (card.signupBonus) {
      // Extract dollar value heuristically; default 500 if not parseable
      const match = card.signupBonus.match(/\$([\d,]+)/);
      const dollarValue = match ? parseInt(match[1].replace(/,/g, ''), 10) : 500;
      defs.push({
        id:                  `${card.id}--sign_up_bonus--1`,
        cardId:              card.id,
        cardName:            card.name,
        issuer:              card.issuer,
        benefitType:         'sign_up_bonus',
        benefitName:         'Sign-Up / Welcome Bonus',
        benefitValue:        dollarValue,
        annualResetDate:     null,
        requiresActiveClaim: true,
        description:         card.signupBonus,
      });
    }

    catalog.set(card.id, defs);
  }

  return catalog;
}

// ── Thresholds for expiry alerts ─────────────────────────────

const ALERT_URGENT_DAYS  = 7;
const ALERT_WARNING_DAYS = 30;
const ALERT_INFO_DAYS    = 60;

// ── Thresholds for keep / cancel ─────────────────────────────

const KEEP_RATIO_THRESHOLD       = 0.6; // > 60 % of fee recovered
const NEGOTIATE_RATIO_THRESHOLD  = 0.3; // 30–60 % recovered
const FREE_CARD_ZERO_FEE         = 0;

// ── Service class ─────────────────────────────────────────────

export class CardBenefitsService {

  private readonly benefitCatalog: Map<string, CardBenefitDefinition[]>;

  /**
   * In-memory store for business card benefits.
   * Key: businessId → list of BusinessCardBenefit.
   *
   * Production: replace with Prisma reads/writes.
   */
  private readonly store = new Map<string, BusinessCardBenefit[]>();

  constructor(cards: ReadonlyArray<CardProduct> = getActiveCards()) {
    this.benefitCatalog = buildStaticBenefitCatalog(cards);
  }

  // ── Benefit catalog helpers ─────────────────────────────────

  /**
   * Return all static benefit definitions for a card.
   */
  getBenefitDefinitions(cardId: string): CardBenefitDefinition[] {
    return this.benefitCatalog.get(cardId) ?? [];
  }

  /**
   * Return all benefit definitions across the entire catalog.
   */
  getAllBenefitDefinitions(): CardBenefitDefinition[] {
    return [...this.benefitCatalog.values()].flat();
  }

  // ── Per-business benefit management ────────────────────────

  /**
   * Register all standard benefits for a card application.
   * Call this when a card is approved and added to the portfolio.
   *
   * @param businessId       Business UUID
   * @param cardApplicationId CardApplication UUID
   * @param cardId           CardProduct slug
   * @param cardAnniversaryDate ISO date — used to compute annual expiry
   */
  registerCardBenefits(
    businessId: string,
    cardApplicationId: string,
    cardId: string,
    cardAnniversaryDate: string,
  ): BusinessCardBenefit[] {
    const defs = this.getBenefitDefinitions(cardId);
    const now  = new Date().toISOString();

    const benefits: BusinessCardBenefit[] = defs.map((def) => {
      // Annual-reset benefits expire at end of cardholder year
      const expiryDate = def.annualResetDate
        ? this._nextAnniversaryExpiry(cardAnniversaryDate)
        : null;

      return {
        id:               `${businessId}--${cardApplicationId}--${def.id}`,
        businessId,
        cardApplicationId,
        cardId,
        definitionId:     def.id,
        benefitType:      def.benefitType,
        benefitName:      def.benefitName,
        benefitValue:     def.benefitValue,
        expiryDate,
        utilized:         false,
        utilizedDate:     null,
        createdAt:        now,
      };
    });

    const existing = this.store.get(businessId) ?? [];
    this.store.set(businessId, [...existing, ...benefits]);
    return benefits;
  }

  /**
   * Retrieve all benefits for a business (optionally filtered by card).
   */
  getBusinessBenefits(businessId: string, cardId?: string): BusinessCardBenefit[] {
    const all = this.store.get(businessId) ?? [];
    return cardId ? all.filter((b) => b.cardId === cardId) : all;
  }

  /**
   * Mark a specific benefit as utilized.
   */
  utilizeBenefit(
    businessId: string,
    benefitId: string,
    input: UtilizeBenefitInput,
  ): BusinessCardBenefit | null {
    const benefits = this.store.get(businessId);
    if (!benefits) return null;

    const benefit = benefits.find((b) => b.id === benefitId);
    if (!benefit) return null;

    benefit.utilized     = true;
    benefit.utilizedDate = input.utilizedDate ?? new Date().toISOString();
    return benefit;
  }

  // ── Expiry alerts ───────────────────────────────────────────

  /**
   * Return expiry alerts for benefits that are approaching
   * their expiryDate and have not yet been utilized.
   *
   * @param businessId Business UUID
   * @param asOfDate   Reference date (defaults to today)
   */
  getExpiryAlerts(
    businessId: string,
    asOfDate: Date = new Date(),
  ): BenefitExpiryAlert[] {
    const benefits = this.getBusinessBenefits(businessId);
    const alerts: BenefitExpiryAlert[] = [];

    for (const benefit of benefits) {
      if (benefit.utilized || !benefit.expiryDate) continue;

      const expiry       = new Date(benefit.expiryDate);
      const daysUntil    = Math.floor(
        (expiry.getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntil < 0) continue; // already expired
      if (daysUntil > ALERT_INFO_DAYS) continue; // not yet alert-worthy

      const severity: AlertSeverity =
        daysUntil <= ALERT_URGENT_DAYS  ? 'urgent'  :
        daysUntil <= ALERT_WARNING_DAYS ? 'warning' : 'info';

      // Look up card name from definitions
      const def   = this._findDefinition(benefit.definitionId);
      const label = def?.cardName ?? benefit.cardId;

      alerts.push({
        benefitId:       benefit.id,
        cardId:          benefit.cardId,
        cardName:        label,
        benefitName:     benefit.benefitName,
        benefitValue:    benefit.benefitValue,
        expiryDate:      benefit.expiryDate,
        daysUntilExpiry: daysUntil,
        severity,
        message: severity === 'urgent'
          ? `URGENT: ${benefit.benefitName} on ${label} expires in ${daysUntil} day(s). Use it now to avoid losing $${benefit.benefitValue} in value.`
          : severity === 'warning'
          ? `${benefit.benefitName} on ${label} expires in ${daysUntil} days ($${benefit.benefitValue} value).`
          : `Reminder: ${benefit.benefitName} on ${label} expires in ${daysUntil} days.`,
      });
    }

    // Sort: most urgent first
    return alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  // ── Keep / cancel analysis ──────────────────────────────────

  /**
   * Produce a keep-vs-cancel recommendation for every card
   * that has benefits registered for the given business.
   */
  getRenewalRecommendations(businessId: string): CardRenewalRecommendation[] {
    const benefits = this.getBusinessBenefits(businessId);
    if (!benefits.length) return [];

    // Group by cardApplicationId
    const groupedByApp = new Map<string, BusinessCardBenefit[]>();
    for (const benefit of benefits) {
      const list = groupedByApp.get(benefit.cardApplicationId) ?? [];
      list.push(benefit);
      groupedByApp.set(benefit.cardApplicationId, list);
    }

    const recommendations: CardRenewalRecommendation[] = [];

    for (const [cardApplicationId, cardBenefits] of groupedByApp) {
      const cardId = cardBenefits[0]!.cardId;
      const def    = this._findDefinition(cardBenefits[0]!.definitionId);
      const cardName = def?.cardName ?? cardId;
      const issuer   = def?.issuer   ?? 'unknown';

      // Annual fee from catalog
      const catalogCard = [...this.benefitCatalog.values()]
        .flat()
        .find((d) => d.cardId === cardId);
      const annualFee = this._getAnnualFee(cardId);

      const totalAvailableBenefitValue = cardBenefits.reduce(
        (s, b) => s + b.benefitValue, 0,
      );
      const utilizedBenefitValue = cardBenefits
        .filter((b) => b.utilized)
        .reduce((s, b) => s + b.benefitValue, 0);

      const utilizationRatio = annualFee > 0
        ? utilizedBenefitValue / annualFee
        : utilizedBenefitValue > 0 ? 1 : 0;

      let decision: RenewalDecision;
      let reasoning: string;
      let potentialAnnualSavings = 0;

      if (annualFee === FREE_CARD_ZERO_FEE) {
        decision  = 'keep';
        reasoning = 'No annual fee — always worth keeping for its rewards and benefits.';
      } else if (utilizationRatio >= KEEP_RATIO_THRESHOLD) {
        decision  = 'keep';
        reasoning = `You have utilized $${utilizedBenefitValue.toFixed(0)} in benefits against a $${annualFee} annual fee (${(utilizationRatio * 100).toFixed(0)}% coverage). The card is delivering strong value.`;
      } else if (utilizationRatio >= NEGOTIATE_RATIO_THRESHOLD) {
        decision  = 'negotiate';
        reasoning = `You have only utilized $${utilizedBenefitValue.toFixed(0)} of $${annualFee} in annual fee (${(utilizationRatio * 100).toFixed(0)}%). Call the issuer to request a retention offer or annual fee waiver before renewing.`;
        potentialAnnualSavings = annualFee - utilizedBenefitValue;
      } else {
        decision  = 'cancel';
        reasoning = `You have utilized only $${utilizedBenefitValue.toFixed(0)} against a $${annualFee} annual fee (${(utilizationRatio * 100).toFixed(0)}%). The card is not delivering sufficient value. Consider cancelling or downgrading to a no-fee product.`;
        potentialAnnualSavings = annualFee;
      }

      // If unutilized benefits could theoretically tip the ratio to keep —
      // recommend a product change instead of outright cancel
      const totalBenefitRatio = annualFee > 0 ? totalAvailableBenefitValue / annualFee : 1;
      if (decision === 'cancel' && totalBenefitRatio >= KEEP_RATIO_THRESHOLD) {
        decision  = 'product_change';
        reasoning += ' However, the card offers enough total benefit value — consider maximising unused benefits or requesting a product change to a card with a lower fee.';
      }

      recommendations.push({
        cardId,
        cardApplicationId,
        cardName,
        issuer,
        annualFee,
        utilizedBenefitValue,
        totalAvailableBenefitValue,
        utilizationRatio,
        decision,
        reasoning,
        potentialAnnualSavings,
      });
    }

    return recommendations;
  }

  // ── Internal helpers ────────────────────────────────────────

  private _findDefinition(definitionId: string): CardBenefitDefinition | undefined {
    for (const defs of this.benefitCatalog.values()) {
      const found = defs.find((d) => d.id === definitionId);
      if (found) return found;
    }
    return undefined;
  }

  private _getAnnualFee(cardId: string): number {
    // Walk the catalog to find the card's annual fee
    for (const [cId, defs] of this.benefitCatalog.entries()) {
      if (cId === cardId && defs.length > 0) {
        // The definition doesn't store annual fee — pull from CARD_CATALOG
        break;
      }
    }
    const card = CARD_CATALOG.find((c) => c.id === cardId);
    return card?.annualFee ?? 0;
  }

  private _nextAnniversaryExpiry(anniversaryDate: string): string {
    const date  = new Date(anniversaryDate);
    const today = new Date();
    date.setFullYear(today.getFullYear());
    if (date <= today) {
      date.setFullYear(today.getFullYear() + 1);
    }
    return date.toISOString().split('T')[0]!;
  }
}

export default CardBenefitsService;
