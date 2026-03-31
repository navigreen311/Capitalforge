// ============================================================
// CapitalForge — Hardship & Workout Protocol Service
//
// Responsibilities:
//   1. Trigger detection (missed payments + utilization spike)
//   2. Structured payment plan creation (hardship schedules)
//   3. Settlement workflow (offer calculation + documentation)
//   4. Card closure sequencing by priority (highest fee first)
//   5. Credit counselor referral
//   6. Emit HARDSHIP_OPENED / HARDSHIP_RESOLVED events
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES, RISK_THRESHOLDS } from '@shared/constants/index.js';
import logger from '../config/logger.js';

// ── Prisma singleton ─────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Constants ────────────────────────────────────────────────

/** Minimum missed-payment count to auto-open a hardship case */
export const HARDSHIP_THRESHOLDS = {
  MISSED_PAYMENTS_MINOR:   1,   // triggers 'minor' severity
  MISSED_PAYMENTS_SERIOUS: 2,   // triggers 'serious' severity
  MISSED_PAYMENTS_CRITICAL: 3,  // triggers 'critical' severity
  UTILIZATION_SPIKE_WARN:  0.80, // 80% — triggers 'minor' if no missed payments
  UTILIZATION_SPIKE_HIGH:  0.90, // 90% — triggers 'serious'
  UTILIZATION_SPIKE_CRITICAL: 0.95, // 95% — triggers 'critical'
} as const;

/** Standard settlement offer rates by severity */
export const SETTLEMENT_RATES = {
  minor:    0.90, // offer 90 cents on the dollar
  serious:  0.75, // offer 75 cents on the dollar
  critical: 0.55, // offer 55 cents on the dollar
} as const;

/** NFCC-member credit counseling agencies for referral */
export const COUNSELING_AGENCIES = [
  { name: 'NFCC — National Foundation for Credit Counseling', url: 'https://www.nfcc.org', phone: '1-800-388-2227' },
  { name: 'CCCS — Consumer Credit Counseling Service',        url: 'https://www.cccsmd.org', phone: '1-800-642-2227' },
  { name: 'GreenPath Financial Wellness',                     url: 'https://www.greenpath.com', phone: '1-888-860-4120' },
] as const;

// ── Trigger Types ────────────────────────────────────────────

export const TRIGGER_TYPE = {
  MISSED_PAYMENT:      'missed_payment',
  UTILIZATION_SPIKE:   'utilization_spike',
  COMBINED:            'combined',
  MANUAL:              'manual',
} as const;

export type TriggerType = (typeof TRIGGER_TYPE)[keyof typeof TRIGGER_TYPE];
export type Severity    = 'minor' | 'serious' | 'critical';
export type CaseStatus  = 'open' | 'payment_plan' | 'settlement' | 'closed' | 'referred';

// ── Input/Output Types ────────────────────────────────────────

export interface HardshipTriggerInput {
  /** Number of consecutive missed minimum payments */
  missedPaymentCount: number;
  /** Current blended utilization across all cards (0–1) */
  currentUtilization: number;
  /** Total outstanding balance in USD */
  totalBalance: number;
  /** Monthly gross revenue (for payment plan sizing) */
  monthlyRevenue: number;
  /** Cards held, ordered by any sequence — service will re-sort */
  cards: CardSummary[];
}

export interface CardSummary {
  cardApplicationId: string;
  issuer:            string;
  balance:           number;
  creditLimit:       number;
  annualFee:         number;
  regularApr:        number;
  introAprExpiry?:   Date | null;
}

export interface HardshipTriggerResult {
  shouldOpenCase:  boolean;
  triggerType:     TriggerType;
  severity:        Severity;
  reasons:         string[];
}

export interface PaymentPlanItem {
  cardApplicationId: string;
  issuer:            string;
  balance:           number;
  monthlyPayment:    number;
  dueDay:            number; // day of month
  interestRate:      number; // reduced rate for hardship plan
  termMonths:        number;
}

export interface PaymentPlan {
  planId:         string;
  totalMonthly:   number;
  termMonths:     number;
  items:          PaymentPlanItem[];
  createdAt:      Date;
}

export interface SettlementOffer {
  offerId:           string;
  totalBalance:      number;
  offerAmount:       number;
  offerRate:         number;  // fraction of balance offered (e.g. 0.75)
  savingsAmount:     number;
  expiresAt:         Date;    // 30-day expiry
  documentRef:       string;  // placeholder for vault reference
  createdAt:         Date;
}

export interface CardClosureSequence {
  sequence:  ClosureStep[];
  rationale: string;
}

export interface ClosureStep {
  rank:              number;
  cardApplicationId: string;
  issuer:            string;
  annualFee:         number;
  balance:           number;
  closeFirst:        boolean;
  reason:            string;
}

export interface CounselorReferral {
  referralId:  string;
  agency:      typeof COUNSELING_AGENCIES[number];
  caseId:      string;
  referredAt:  Date;
  notes:       string;
}

// ── Core Functions ────────────────────────────────────────────

/**
 * Evaluate signals and determine whether a hardship case should be opened.
 * Pure computation — does NOT persist.
 */
export function detectHardshipTrigger(input: HardshipTriggerInput): HardshipTriggerResult {
  const reasons: string[] = [];
  let triggerType: TriggerType = TRIGGER_TYPE.MANUAL;
  let severity: Severity = 'minor';
  let shouldOpenCase = false;

  const hasMissed    = input.missedPaymentCount >= HARDSHIP_THRESHOLDS.MISSED_PAYMENTS_MINOR;
  const hasUtilSpike = input.currentUtilization >= HARDSHIP_THRESHOLDS.UTILIZATION_SPIKE_WARN;

  // ── Missed payment severity ───────────────────────────────
  if (input.missedPaymentCount >= HARDSHIP_THRESHOLDS.MISSED_PAYMENTS_CRITICAL) {
    severity = 'critical';
    reasons.push(`${input.missedPaymentCount} consecutive missed payments (critical threshold)`);
    shouldOpenCase = true;
  } else if (input.missedPaymentCount >= HARDSHIP_THRESHOLDS.MISSED_PAYMENTS_SERIOUS) {
    severity = 'serious';
    reasons.push(`${input.missedPaymentCount} consecutive missed payments (serious threshold)`);
    shouldOpenCase = true;
  } else if (input.missedPaymentCount >= HARDSHIP_THRESHOLDS.MISSED_PAYMENTS_MINOR) {
    severity = 'minor';
    reasons.push(`${input.missedPaymentCount} missed payment detected`);
    shouldOpenCase = true;
  }

  // ── Utilization spike severity ────────────────────────────
  if (input.currentUtilization >= HARDSHIP_THRESHOLDS.UTILIZATION_SPIKE_CRITICAL) {
    const utilSeverity: Severity = 'critical';
    if (utilSeverity > severity || !hasMissed) severity = utilSeverity;
    reasons.push(`Utilization at ${Math.round(input.currentUtilization * 100)}% (critical spike)`);
    shouldOpenCase = true;
  } else if (input.currentUtilization >= HARDSHIP_THRESHOLDS.UTILIZATION_SPIKE_HIGH) {
    const utilSeverity: Severity = 'serious';
    if (!hasMissed) severity = utilSeverity;
    reasons.push(`Utilization at ${Math.round(input.currentUtilization * 100)}% (high spike)`);
    shouldOpenCase = true;
  } else if (input.currentUtilization >= HARDSHIP_THRESHOLDS.UTILIZATION_SPIKE_WARN) {
    if (!hasMissed) severity = 'minor';
    reasons.push(`Utilization at ${Math.round(input.currentUtilization * 100)}% (warning threshold)`);
    shouldOpenCase = true;
  }

  // ── Trigger type classification ───────────────────────────
  if (hasMissed && hasUtilSpike) {
    triggerType = TRIGGER_TYPE.COMBINED;
    // Combined signals escalate severity by one level
    if (severity === 'minor')        severity = 'serious';
    else if (severity === 'serious') severity = 'critical';
  } else if (hasMissed) {
    triggerType = TRIGGER_TYPE.MISSED_PAYMENT;
  } else if (hasUtilSpike) {
    triggerType = TRIGGER_TYPE.UTILIZATION_SPIKE;
  }

  return { shouldOpenCase, triggerType, severity, reasons };
}

/**
 * Open a hardship case in the database and emit the appropriate event.
 */
export async function openHardshipCase(
  businessId: string,
  tenantId:   string,
  input:      HardshipTriggerInput,
): Promise<{ caseId: string; trigger: HardshipTriggerResult }> {
  const trigger = detectHardshipTrigger(input);

  const prisma = getPrisma();

  const hardshipCase = await prisma.hardshipCase.create({
    data: {
      tenantId,
      businessId,
      triggerType: trigger.triggerType,
      severity:    trigger.severity,
      status:      'open',
    },
  });

  await eventBus.publishAndPersist(tenantId, {
    eventType:     'hardship.opened',
    aggregateType: AGGREGATE_TYPES.BUSINESS,
    aggregateId:   businessId,
    payload: {
      caseId:      hardshipCase.id,
      businessId,
      triggerType: trigger.triggerType,
      severity:    trigger.severity,
      reasons:     trigger.reasons,
    },
  });

  logger.info('[HardshipService] Case opened', {
    caseId:    hardshipCase.id,
    businessId,
    severity:  trigger.severity,
    trigger:   trigger.triggerType,
  });

  return { caseId: hardshipCase.id, trigger };
}

/**
 * Build a structured hardship payment plan.
 *
 * Strategy:
 *   - Target total monthly payment = 35% of monthly revenue (hardship ceiling)
 *   - Distribute pro-rata by balance across all cards
 *   - Apply reduced hardship interest rate (capped at 10% APR regardless of card APR)
 *   - Term = how many months needed at that payment to clear principal
 */
export function createPaymentPlan(
  cards:          CardSummary[],
  monthlyRevenue: number,
  severity:       Severity,
): PaymentPlan {
  const HARDSHIP_APR_CAP = 0.10;   // 10% max APR for hardship plans
  const HARDSHIP_INCOME_PCT: Record<Severity, number> = {
    minor:    0.35,  // 35% of revenue
    serious:  0.30,  // 30% — tighter
    critical: 0.25,  // 25% — most conservative
  };

  const totalMonthlyBudget = monthlyRevenue * HARDSHIP_INCOME_PCT[severity];
  const totalBalance       = cards.reduce((s, c) => s + c.balance, 0);

  const items: PaymentPlanItem[] = cards.map((card) => {
    const balanceShare  = totalBalance > 0 ? card.balance / totalBalance : 0;
    const monthlyPayment = Math.max(Math.round(totalMonthlyBudget * balanceShare * 100) / 100, 25);
    const hardshipRate   = Math.min(card.regularApr, HARDSHIP_APR_CAP);
    const monthlyRate    = hardshipRate / 12;
    // Term = months to pay off at this monthly payment with reduced interest
    const termMonths     = monthlyRate > 0
      ? Math.ceil(-Math.log(1 - (card.balance * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate))
      : Math.ceil(card.balance / monthlyPayment);

    return {
      cardApplicationId: card.cardApplicationId,
      issuer:            card.issuer,
      balance:           card.balance,
      monthlyPayment,
      dueDay:            15, // standardize payment due on 15th
      interestRate:      hardshipRate,
      termMonths:        Math.min(termMonths, 60), // cap at 5 years
    };
  });

  const actualTotalMonthly = items.reduce((s, i) => s + i.monthlyPayment, 0);
  const maxTermMonths      = Math.max(...items.map((i) => i.termMonths), 1);

  return {
    planId:       uuidv4(),
    totalMonthly: Math.round(actualTotalMonthly * 100) / 100,
    termMonths:   maxTermMonths,
    items,
    createdAt:    new Date(),
  };
}

/**
 * Persist a payment plan onto an existing hardship case.
 */
export async function attachPaymentPlan(
  caseId:   string,
  tenantId: string,
  plan:     PaymentPlan,
): Promise<void> {
  const prisma = getPrisma();

  await prisma.hardshipCase.update({
    where: { id: caseId },
    data:  {
      status:      'payment_plan',
      paymentPlan: plan as unknown as Record<string, unknown>,
      updatedAt:   new Date(),
    },
  });

  await eventBus.publishAndPersist(tenantId, {
    eventType:     'hardship.payment_plan.created',
    aggregateType: AGGREGATE_TYPES.BUSINESS,
    aggregateId:   caseId,
    payload:       { caseId, planId: plan.planId, totalMonthly: plan.totalMonthly, termMonths: plan.termMonths },
  });

  logger.info('[HardshipService] Payment plan attached', { caseId, planId: plan.planId });
}

/**
 * Calculate a settlement offer for the outstanding balance.
 *
 * Settlement is appropriate when:
 *   - Severity is 'serious' or 'critical'
 *   - Client cannot sustain a regular payment plan
 *
 * The offer rate is determined by severity band.
 */
export function calculateSettlementOffer(
  totalBalance: number,
  severity:     Severity,
): SettlementOffer {
  const offerRate   = SETTLEMENT_RATES[severity];
  const offerAmount = Math.round(totalBalance * offerRate * 100) / 100;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  return {
    offerId:       uuidv4(),
    totalBalance,
    offerAmount,
    offerRate,
    savingsAmount: Math.round((totalBalance - offerAmount) * 100) / 100,
    expiresAt,
    documentRef:   `settlement-offer-${uuidv4()}`,  // vault reference placeholder
    createdAt:     new Date(),
  };
}

/**
 * Persist a settlement offer onto an existing hardship case.
 */
export async function attachSettlementOffer(
  caseId:   string,
  tenantId: string,
  offer:    SettlementOffer,
): Promise<void> {
  const prisma = getPrisma();

  await prisma.hardshipCase.update({
    where: { id: caseId },
    data:  {
      status:          'settlement',
      settlementOffer: offer as unknown as Record<string, unknown>,
      updatedAt:       new Date(),
    },
  });

  await eventBus.publishAndPersist(tenantId, {
    eventType:     'hardship.settlement.offered',
    aggregateType: AGGREGATE_TYPES.BUSINESS,
    aggregateId:   caseId,
    payload:       {
      caseId,
      offerId:       offer.offerId,
      totalBalance:  offer.totalBalance,
      offerAmount:   offer.offerAmount,
      offerRate:     offer.offerRate,
      savingsAmount: offer.savingsAmount,
      expiresAt:     offer.expiresAt,
    },
  });

  logger.info('[HardshipService] Settlement offer attached', {
    caseId,
    offerId:      offer.offerId,
    offerRate:    offer.offerRate,
    offerAmount:  offer.offerAmount,
  });
}

/**
 * Determine card closure sequence — highest annual fee closed first,
 * with zero-balance cards prioritized when fees are equal.
 *
 * Rationale: closing high-fee cards first maximises savings; keeping
 * cards with balances open longer preserves credit utilization math
 * during the workout period.
 */
export function buildCardClosureSequence(cards: CardSummary[]): CardClosureSequence {
  const sorted = [...cards].sort((a, b) => {
    // Primary: highest annual fee first
    if (b.annualFee !== a.annualFee) return b.annualFee - a.annualFee;
    // Secondary: zero-balance cards before carry-balance cards
    const aHasBalance = a.balance > 0 ? 1 : 0;
    const bHasBalance = b.balance > 0 ? 1 : 0;
    return aHasBalance - bHasBalance;
  });

  const sequence: ClosureStep[] = sorted.map((card, idx) => ({
    rank:              idx + 1,
    cardApplicationId: card.cardApplicationId,
    issuer:            card.issuer,
    annualFee:         card.annualFee,
    balance:           card.balance,
    closeFirst:        idx === 0,
    reason:
      card.annualFee > 0
        ? `Annual fee $${card.annualFee} — highest fee card in portfolio`
        : card.balance === 0
        ? 'Zero balance — safe to close without credit utilization impact'
        : 'Lowest fee card — close last to preserve available credit',
  }));

  return {
    sequence,
    rationale:
      'Cards ordered by annual fee (descending). Highest-fee cards closed first to reduce carrying cost. ' +
      'Cards with outstanding balances are closed later to manage utilization ratio during workout.',
  };
}

/**
 * Persist the closure sequence onto a hardship case.
 */
export async function attachCardClosureSequence(
  caseId:   string,
  tenantId: string,
  sequence: CardClosureSequence,
): Promise<void> {
  const prisma = getPrisma();

  await prisma.hardshipCase.update({
    where: { id: caseId },
    data:  {
      cardClosureSequence: sequence as unknown as Record<string, unknown>,
      updatedAt:           new Date(),
    },
  });

  logger.info('[HardshipService] Card closure sequence attached', { caseId, steps: sequence.sequence.length });
}

/**
 * Generate a credit counselor referral for a hardship case.
 * Selects the NFCC agency as the primary referral.
 */
export function generateCounselorReferral(caseId: string, notes?: string): CounselorReferral {
  return {
    referralId: uuidv4(),
    agency:     COUNSELING_AGENCIES[0],
    caseId,
    referredAt: new Date(),
    notes:      notes ?? 'Client referred for nonprofit credit counseling and debt management plan assistance.',
  };
}

/**
 * Persist a counselor referral onto a hardship case and mark it as referred.
 */
export async function attachCounselorReferral(
  caseId:   string,
  tenantId: string,
  referral: CounselorReferral,
): Promise<void> {
  const prisma = getPrisma();

  await prisma.hardshipCase.update({
    where: { id: caseId },
    data:  {
      status:           'referred',
      counselorReferral: JSON.stringify(referral),
      updatedAt:         new Date(),
    },
  });

  await eventBus.publishAndPersist(tenantId, {
    eventType:     'hardship.counselor.referred',
    aggregateType: AGGREGATE_TYPES.BUSINESS,
    aggregateId:   caseId,
    payload:       {
      caseId,
      referralId: referral.referralId,
      agencyName: referral.agency.name,
    },
  });

  logger.info('[HardshipService] Counselor referral attached', { caseId, referralId: referral.referralId });
}

/**
 * Retrieve all hardship cases for a business.
 */
export async function listHardshipCases(businessId: string) {
  const prisma = getPrisma();
  return prisma.hardshipCase.findMany({
    where:   { businessId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Update fields on an existing hardship case.
 */
export async function updateHardshipCase(
  caseId:  string,
  updates: Partial<{ status: string; counselorReferral: string }>,
) {
  const prisma = getPrisma();
  return prisma.hardshipCase.update({
    where: { id: caseId },
    data:  { ...updates, updatedAt: new Date() },
  });
}
