// ============================================================
// CapitalForge — Auto Re-Stack Trigger Engine
//
// Responsibilities:
//   1. Re-stack readiness scoring based on payment history,
//      utilization improvement, and credit score recovery
//   2. Automated advisor alert at readiness threshold (score >= 70)
//   3. Outreach trigger scheduling
//   4. Re-stack conversion tracking and revenue attribution
//   5. Emit RESTACK_TRIGGER_FIRED event
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
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

/** Score at which an advisor alert is automatically fired */
export const RESTACK_ALERT_THRESHOLD = 70;

/** Score bands */
export const RESTACK_BANDS = {
  NOT_READY:    { min: 0,  max: 39,  label: 'not_ready'    },
  BUILDING:     { min: 40, max: 59,  label: 'building'     },
  APPROACHING:  { min: 60, max: 69,  label: 'approaching'  },
  READY:        { min: 70, max: 84,  label: 'ready'        },
  OPTIMAL:      { min: 85, max: 100, label: 'optimal'      },
} as const;

export type RestackBandLabel = 'not_ready' | 'building' | 'approaching' | 'ready' | 'optimal';

// ── Input / Output Types ──────────────────────────────────────

export interface RestackReadinessInput {
  /** Monthly on-time payments since hardship/last-stack */
  onTimePaymentMonths: number;

  /** Number of payments missed since hardship (0 = clean record) */
  missedPaymentsSinceHardship: number;

  /** Current blended utilization (0–1) */
  currentUtilization: number;

  /**
   * Utilization at time of hardship or last stack (0–1).
   * Used to measure improvement direction.
   */
  baselineUtilization: number;

  /** Current best personal FICO score */
  currentCreditScore: number;

  /**
   * Credit score at time of hardship or last stack.
   * Used to measure recovery trajectory.
   */
  baselineCreditScore: number;

  /** Months since the last hardship case was closed (or since last stack) */
  monthsSinceLastEvent: number;

  /** Whether a hardship case is still open */
  activeHardshipCase: boolean;
}

export interface RestackReadinessScore {
  score:                number;   // 0–100 composite
  band:                 RestackBandLabel;
  paymentHistoryScore:  number;   // 0–30
  utilizationScore:     number;   // 0–30
  creditRecoveryScore:  number;   // 0–25
  timeElapsedScore:     number;   // 0–15
  alertFired:           boolean;
  recommendations:      string[];
  breakdown:            Record<string, number>;
}

export interface RestackOutreachTrigger {
  triggerId:     string;
  businessId:    string;
  advisorId:     string | null;
  score:         number;
  band:          RestackBandLabel;
  scheduledAt:   Date;
  channel:       'email' | 'sms' | 'in_app';
  message:       string;
}

export interface RestackConversion {
  conversionId:     string;
  businessId:       string;
  triggerId:        string;
  fundingRoundId:   string;
  revenueAmount:    number;   // program fee or commission attributed
  attributedAt:     Date;
}

// ── Score Component Calculators ───────────────────────────────

/** Payment history component — 0 to 30 points */
function scorePaymentHistory(
  onTimeMonths:     number,
  missedSince:      number,
): number {
  if (missedSince > 0)   return Math.max(0, 5 - missedSince * 5); // heavy penalty
  if (onTimeMonths >= 12) return 30;
  if (onTimeMonths >= 9)  return 24;
  if (onTimeMonths >= 6)  return 18;
  if (onTimeMonths >= 3)  return 10;
  if (onTimeMonths >= 1)  return 5;
  return 0;
}

/** Utilization improvement component — 0 to 30 points */
function scoreUtilizationImprovement(
  current:  number,
  baseline: number,
): number {
  // Reward absolute low utilization + improvement from baseline
  const improvementPct = baseline > 0 ? (baseline - current) / baseline : 0;

  let utilizationPoints = 0;
  if (current <= 0.10)      utilizationPoints = 20;
  else if (current <= 0.20) utilizationPoints = 16;
  else if (current <= 0.30) utilizationPoints = 12;
  else if (current <= 0.50) utilizationPoints = 7;
  else if (current <= 0.70) utilizationPoints = 3;
  else                      utilizationPoints = 0;

  let improvementPoints = 0;
  if (improvementPct >= 0.50)      improvementPoints = 10;
  else if (improvementPct >= 0.30) improvementPoints = 7;
  else if (improvementPct >= 0.10) improvementPoints = 4;
  else if (improvementPct > 0)     improvementPoints = 2;

  return Math.min(utilizationPoints + improvementPoints, 30);
}

/** Credit score recovery component — 0 to 25 points */
function scoreCreditRecovery(
  current:  number,
  baseline: number,
): number {
  const gain = current - baseline;

  let scorePoints = 0;
  if (current >= 720)      scorePoints = 15;
  else if (current >= 680) scorePoints = 11;
  else if (current >= 650) scorePoints = 7;
  else if (current >= 620) scorePoints = 3;

  let gainPoints = 0;
  if (gain >= 50)      gainPoints = 10;
  else if (gain >= 30) gainPoints = 7;
  else if (gain >= 15) gainPoints = 4;
  else if (gain >= 5)  gainPoints = 2;

  return Math.min(scorePoints + gainPoints, 25);
}

/** Time elapsed component — 0 to 15 points */
function scoreTimeElapsed(monthsSinceLastEvent: number): number {
  if (monthsSinceLastEvent >= 24) return 15;
  if (monthsSinceLastEvent >= 18) return 12;
  if (monthsSinceLastEvent >= 12) return 9;
  if (monthsSinceLastEvent >= 6)  return 5;
  if (monthsSinceLastEvent >= 3)  return 2;
  return 0;
}

/** Determine the band label for a given score */
function determineBand(score: number): RestackBandLabel {
  for (const band of Object.values(RESTACK_BANDS)) {
    if (score >= band.min && score <= band.max) return band.label;
  }
  return 'not_ready';
}

/** Build human-readable recommendations based on score gaps */
function buildRecommendations(
  input: RestackReadinessInput,
  paymentHistoryScore:  number,
  utilizationScore:     number,
  creditRecoveryScore:  number,
): string[] {
  const recs: string[] = [];

  if (paymentHistoryScore < 18) {
    const monthsNeeded = Math.max(0, 6 - input.onTimePaymentMonths);
    recs.push(`Maintain ${monthsNeeded} more month(s) of on-time payments to strengthen payment history score.`);
  }

  if (input.missedPaymentsSinceHardship > 0) {
    recs.push('No new missed payments — zero missed payments required before re-stack consideration.');
  }

  if (utilizationScore < 16) {
    const targetUtil = Math.max(0, input.currentUtilization - 0.20);
    recs.push(`Reduce utilization to below 30% (currently ${Math.round(input.currentUtilization * 100)}%). Target: ${Math.round(targetUtil * 100)}%.`);
  }

  if (creditRecoveryScore < 11) {
    recs.push(`Credit score of ${input.currentCreditScore} needs further recovery. Target 680+ for strong re-stack eligibility.`);
  }

  if (input.activeHardshipCase) {
    recs.push('Close or resolve active hardship case before re-stack outreach.');
  }

  if (recs.length === 0) {
    recs.push('Profile is on track for re-stack. Advisor should review funding round strategy.');
  }

  return recs;
}

// ── Core Functions ────────────────────────────────────────────

/**
 * Compute re-stack readiness score for a business.
 * Pure computation — does NOT persist.
 */
export function computeRestackReadiness(input: RestackReadinessInput): RestackReadinessScore {
  // Hard block: active hardship case = not ready
  if (input.activeHardshipCase) {
    return {
      score:                0,
      band:                 'not_ready',
      paymentHistoryScore:  0,
      utilizationScore:     0,
      creditRecoveryScore:  0,
      timeElapsedScore:     0,
      alertFired:           false,
      recommendations:      ['Close or resolve active hardship case before re-stack consideration.'],
      breakdown:            { paymentHistory: 0, utilization: 0, creditRecovery: 0, timeElapsed: 0 },
    };
  }

  const paymentHistoryScore  = scorePaymentHistory(input.onTimePaymentMonths, input.missedPaymentsSinceHardship);
  const utilizationScore     = scoreUtilizationImprovement(input.currentUtilization, input.baselineUtilization);
  const creditRecoveryScore  = scoreCreditRecovery(input.currentCreditScore, input.baselineCreditScore);
  const timeElapsedScore     = scoreTimeElapsed(input.monthsSinceLastEvent);

  const score = Math.min(
    paymentHistoryScore + utilizationScore + creditRecoveryScore + timeElapsedScore,
    100,
  );

  const band       = determineBand(score);
  const alertFired = score >= RESTACK_ALERT_THRESHOLD;

  const recommendations = buildRecommendations(
    input,
    paymentHistoryScore,
    utilizationScore,
    creditRecoveryScore,
  );

  return {
    score,
    band,
    paymentHistoryScore,
    utilizationScore,
    creditRecoveryScore,
    timeElapsedScore,
    alertFired,
    recommendations,
    breakdown: {
      paymentHistory: paymentHistoryScore,
      utilization:    utilizationScore,
      creditRecovery: creditRecoveryScore,
      timeElapsed:    timeElapsedScore,
    },
  };
}

/**
 * Evaluate re-stack readiness and fire advisor alert + ledger event
 * if the threshold is met.
 *
 * @returns The computed readiness score
 */
export async function evaluateRestackReadiness(
  businessId: string,
  tenantId:   string,
  advisorId:  string | null,
  input:      RestackReadinessInput,
): Promise<RestackReadinessScore> {
  const result = computeRestackReadiness(input);

  if (result.alertFired) {
    await eventBus.publishAndPersist(tenantId, {
      eventType:     EVENT_TYPES.RESTACK_TRIGGER_FIRED,
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId:   businessId,
      payload: {
        businessId,
        advisorId,
        score:       result.score,
        band:        result.band,
        breakdown:   result.breakdown,
        firedAt:     new Date().toISOString(),
      },
      metadata: { alertType: 'restack_readiness', threshold: RESTACK_ALERT_THRESHOLD },
    });

    logger.info('[AutoRestackService] Advisor alert fired', {
      businessId,
      advisorId,
      score: result.score,
      band:  result.band,
    });
  }

  return result;
}

/**
 * Schedule an outreach trigger for a business that has crossed the
 * readiness threshold.
 *
 * Selects the channel based on band:
 *   - optimal  → sms + email (returns email trigger)
 *   - ready    → email
 *   - approaching → in_app
 */
export function buildOutreachTrigger(
  businessId: string,
  advisorId:  string | null,
  score:      number,
  band:       RestackBandLabel,
): RestackOutreachTrigger {
  const channel: RestackOutreachTrigger['channel'] =
    band === 'optimal' ? 'sms'     :
    band === 'ready'   ? 'email'   :
                         'in_app';

  const scheduledAt = new Date();
  // Delay outreach by 1 business day for advisor review
  scheduledAt.setDate(scheduledAt.getDate() + 1);

  const message =
    band === 'optimal'
      ? `Your business profile has reached optimal re-stack readiness (score: ${score}/100). This is an ideal time to explore your next funding round.`
      : band === 'ready'
      ? `Your business is ready for a re-stack review (score: ${score}/100). Schedule a call with your advisor to explore new credit opportunities.`
      : `Your re-stack score is approaching the threshold (${score}/100). Keep up your payment history to unlock new funding options.`;

  return {
    triggerId:   uuidv4(),
    businessId,
    advisorId,
    score,
    band,
    scheduledAt,
    channel,
    message,
  };
}

/**
 * Record a re-stack conversion (funding round successfully opened
 * after a re-stack trigger was fired).
 *
 * Revenue attribution is stored against the trigger that initiated outreach.
 */
export async function recordRestackConversion(
  businessId:    string,
  tenantId:      string,
  triggerId:     string,
  fundingRoundId: string,
  revenueAmount: number,
): Promise<RestackConversion> {
  const conversion: RestackConversion = {
    conversionId:  uuidv4(),
    businessId,
    triggerId,
    fundingRoundId,
    revenueAmount,
    attributedAt:  new Date(),
  };

  await eventBus.publishAndPersist(tenantId, {
    eventType:     'restack.conversion.recorded',
    aggregateType: AGGREGATE_TYPES.BUSINESS,
    aggregateId:   businessId,
    payload: {
      ...conversion,
      attributedAt: conversion.attributedAt.toISOString(),
    },
    metadata: { revenueAttributionType: 'restack_trigger' },
  });

  logger.info('[AutoRestackService] Conversion recorded', {
    businessId,
    triggerId,
    fundingRoundId,
    revenueAmount,
  });

  return conversion;
}
