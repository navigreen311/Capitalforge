// ============================================================
// CapitalForge — Inngest Background Functions
//
// Defines 4 scheduled background jobs for automated portfolio
// management. Written against the Inngest function pattern so
// they can be wired up once the Inngest SDK is installed.
//
// Until then, each function's core logic is exported as a
// standalone async function that takes a PrismaClient and runs
// the business logic directly — usable from BullMQ, cron, or
// manual invocation.
//
// Functions:
//   1. checkAprExpiry           — daily 8 AM
//   2. checkDisclosureDeadlines — daily 9 AM
//   3. generateRestackOpportunities — weekly Monday 6 AM
//   4. checkMissedPayments      — daily 7 AM
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../config/logger.js';

// ── Helpers ───────────────────────────────────────────────────

function daysFromNow(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

// ── Result types ─────────────────────────────────────────────

export interface AprExpiryResult {
  roundsScanned: number;
  actionItemsCreated: number;
  details: Array<{
    roundId: string;
    businessId: string;
    aprExpiryDate: string;
    daysUntilExpiry: number;
  }>;
}

export interface DisclosureDeadlineResult {
  checksScanned: number;
  notificationsCreated: number;
  details: Array<{
    checkId: string;
    businessId: string;
    checkType: string;
    daysUntilDue: number;
  }>;
}

export interface RestackOpportunity {
  businessId: string;
  legalName: string;
  currentRound: number;
  reason: string;
  estimatedCredit: number;
}

export interface RestackResult {
  businessesEvaluated: number;
  opportunitiesFound: number;
  opportunities: RestackOpportunity[];
}

export interface MissedPaymentResult {
  schedulesScanned: number;
  hardshipFlagsCreated: number;
  details: Array<{
    businessId: string;
    repaymentPlanId: string;
    consecutiveMissed: number;
  }>;
}

// ============================================================
// 1. CHECK APR EXPIRY — Daily 8 AM
//    Cron: 0 8 * * *
//
//    Scans completed funding rounds with intro APR expiring
//    within 60 days. Creates action queue items (ledger events)
//    so advisors are prompted to restack or pay down balances.
// ============================================================

export async function checkAprExpiry(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<AprExpiryResult> {
  const tag = '[checkAprExpiry]';
  logger.info(`${tag} Starting APR expiry scan`, { now: now.toISOString() });

  const lookAheadDate = daysFromNow(60, now);

  // Find completed rounds with APR expiring within 60 days that
  // haven't already had all 3 alert windows sent
  const expiringRounds = await prisma.fundingRound.findMany({
    where: {
      status: 'completed',
      aprExpiryDate: {
        not: null,
        gte: now,
        lte: lookAheadDate,
      },
      OR: [
        { alertSent60: false },
        { alertSent30: false },
        { alertSent15: false },
      ],
    },
    include: {
      business: {
        select: {
          id: true,
          tenantId: true,
          legalName: true,
          advisorId: true,
        },
      },
    },
  });

  logger.info(`${tag} Found ${expiringRounds.length} rounds with upcoming APR expiry`);

  const details: AprExpiryResult['details'] = [];

  for (const round of expiringRounds) {
    const expiryDate = round.aprExpiryDate!;
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Determine which alert window to fire
    const alertWindow =
      daysUntilExpiry <= 15 ? 15 :
      daysUntilExpiry <= 30 ? 30 :
      60;

    const flagField =
      alertWindow === 15 ? 'alertSent15' :
      alertWindow === 30 ? 'alertSent30' :
      'alertSent60';

    // Skip if this window was already sent
    if (round[flagField]) continue;

    try {
      // Create action queue item as a ledger event
      await prisma.ledgerEvent.create({
        data: {
          tenantId: round.business.tenantId,
          eventType: 'apr_expiry.approaching',
          aggregateType: 'funding_round',
          aggregateId: round.id,
          payload: {
            businessId: round.business.id,
            businessName: round.business.legalName,
            roundNumber: round.roundNumber,
            aprExpiryDate: expiryDate.toISOString(),
            daysUntilExpiry,
            alertWindow,
            advisorId: round.business.advisorId,
            actionRequired: daysUntilExpiry <= 15
              ? 'urgent_restack_or_paydown'
              : daysUntilExpiry <= 30
                ? 'plan_restack_strategy'
                : 'review_apr_transition',
          },
          metadata: {
            source: 'inngest:checkAprExpiry',
            firedAt: now.toISOString(),
          },
        },
      });

      // Mark the alert window as sent
      await prisma.fundingRound.update({
        where: { id: round.id },
        data: { [flagField]: true },
      });

      details.push({
        roundId: round.id,
        businessId: round.business.id,
        aprExpiryDate: expiryDate.toISOString(),
        daysUntilExpiry,
      });

      logger.info(`${tag} Created action item for round ${round.id}`, {
        businessId: round.business.id,
        daysUntilExpiry,
        alertWindow,
      });
    } catch (err) {
      logger.error(`${tag} Failed to process round ${round.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result: AprExpiryResult = {
    roundsScanned: expiringRounds.length,
    actionItemsCreated: details.length,
    details,
  };

  logger.info(`${tag} Scan complete`, {
    roundsScanned: result.roundsScanned,
    actionItemsCreated: result.actionItemsCreated,
  });

  return result;
}

// ============================================================
// 2. CHECK DISCLOSURE DEADLINES — Daily 9 AM
//    Cron: 0 9 * * *
//
//    Queries unresolved compliance checks and flags those
//    approaching a 7-day deadline. Creates notification
//    ledger events for the compliance dashboard.
// ============================================================

export async function checkDisclosureDeadlines(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<DisclosureDeadlineResult> {
  const tag = '[checkDisclosureDeadlines]';
  logger.info(`${tag} Starting disclosure deadline scan`, { now: now.toISOString() });

  // Find all unresolved compliance checks created more than 23 days ago
  // (i.e. approaching the 30-day standard disclosure deadline within 7 days)
  const deadlineThreshold = daysAgo(23, now); // created 23+ days ago = due within 7 days

  const pendingChecks = await prisma.complianceCheck.findMany({
    where: {
      resolvedAt: null,
      createdAt: {
        lte: deadlineThreshold,
      },
    },
    include: {
      business: {
        select: {
          id: true,
          legalName: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  logger.info(`${tag} Found ${pendingChecks.length} checks approaching deadline`);

  const details: DisclosureDeadlineResult['details'] = [];

  for (const check of pendingChecks) {
    const daysSinceCreated = Math.ceil(
      (now.getTime() - check.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysUntilDue = Math.max(0, 30 - daysSinceCreated);

    try {
      await prisma.ledgerEvent.create({
        data: {
          tenantId: check.tenantId,
          eventType: 'compliance.disclosure_deadline_approaching',
          aggregateType: 'compliance_check',
          aggregateId: check.id,
          payload: {
            checkId: check.id,
            checkType: check.checkType,
            riskLevel: check.riskLevel,
            businessId: check.businessId,
            businessName: check.business?.legalName ?? 'Unknown',
            daysUntilDue,
            daysSinceCreated,
            stateJurisdiction: check.stateJurisdiction,
            actionRequired: daysUntilDue <= 2
              ? 'urgent_resolution_needed'
              : 'schedule_resolution',
          },
          metadata: {
            source: 'inngest:checkDisclosureDeadlines',
            firedAt: now.toISOString(),
          },
        },
      });

      details.push({
        checkId: check.id,
        businessId: check.businessId ?? 'none',
        checkType: check.checkType,
        daysUntilDue,
      });

      logger.info(`${tag} Created notification for check ${check.id}`, {
        checkType: check.checkType,
        daysUntilDue,
      });
    } catch (err) {
      logger.error(`${tag} Failed to process check ${check.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result: DisclosureDeadlineResult = {
    checksScanned: pendingChecks.length,
    notificationsCreated: details.length,
    details,
  };

  logger.info(`${tag} Scan complete`, {
    checksScanned: result.checksScanned,
    notificationsCreated: result.notificationsCreated,
  });

  return result;
}

// ============================================================
// 3. GENERATE RESTACK OPPORTUNITIES — Weekly Monday 6 AM
//    Cron: 0 6 * * 1
//
//    Evaluates all active businesses against restack criteria:
//      - Last funding round completed 6+ months ago
//      - Personal FICO >= 680
//      - Business credit established (Paydex >= 70 or DNB file exists)
//      - Current utilization < 50%
//      - No active hardship cases
//    Creates opportunity ledger events for the advisor dashboard.
// ============================================================

export async function generateRestackOpportunities(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<RestackResult> {
  const tag = '[generateRestackOpportunities]';
  logger.info(`${tag} Starting weekly restack evaluation`, { now: now.toISOString() });

  const sixMonthsAgo = daysAgo(180, now);

  // Get all active businesses with their latest funding round & credit data
  const activeBusinesses = await prisma.business.findMany({
    where: {
      status: 'active',
    },
    include: {
      fundingRounds: {
        orderBy: { roundNumber: 'desc' },
        take: 1,
      },
      creditProfiles: {
        orderBy: { pulledAt: 'desc' },
      },
      tenant: {
        select: { id: true },
      },
    },
  });

  logger.info(`${tag} Evaluating ${activeBusinesses.length} active businesses`);

  const opportunities: RestackOpportunity[] = [];

  for (const biz of activeBusinesses) {
    const latestRound = biz.fundingRounds[0];

    // Must have at least one completed round
    if (!latestRound || latestRound.status !== 'completed') continue;

    // Round must have been completed 6+ months ago
    if (!latestRound.completedAt || latestRound.completedAt > sixMonthsAgo) continue;

    // Check personal FICO >= 680
    const personalProfile = biz.creditProfiles.find(
      (cp) => cp.profileType === 'personal' && cp.scoreType === 'fico',
    );
    if (!personalProfile || !personalProfile.score || personalProfile.score < 680) continue;

    // Check business credit exists (Paydex >= 70 or any business profile)
    const bizProfile = biz.creditProfiles.find(
      (cp) => cp.profileType === 'business',
    );
    const hasBusinessCredit = bizProfile && bizProfile.score && bizProfile.score >= 70;

    // Check utilization < 50%
    const utilization = personalProfile.utilization
      ? new Prisma.Decimal(personalProfile.utilization).toNumber()
      : null;
    if (utilization !== null && utilization >= 0.5) continue;

    // Check no active hardship cases
    const activeHardship = await prisma.hardshipCase.findFirst({
      where: {
        businessId: biz.id,
        status: 'open',
      },
    });
    if (activeHardship) continue;

    // Build reason string
    const reasons: string[] = [];
    reasons.push(
      `Round ${latestRound.roundNumber} completed ${Math.floor(
        (now.getTime() - latestRound.completedAt.getTime()) / (1000 * 60 * 60 * 24),
      )} days ago`,
    );
    reasons.push(`FICO: ${personalProfile.score}`);
    if (hasBusinessCredit) reasons.push(`Paydex: ${bizProfile!.score}`);
    if (utilization !== null) reasons.push(`Utilization: ${(utilization * 100).toFixed(0)}%`);

    const estimatedCredit = personalProfile.score >= 750 ? 200000 :
      personalProfile.score >= 720 ? 150000 :
      100000;

    opportunities.push({
      businessId: biz.id,
      legalName: biz.legalName,
      currentRound: latestRound.roundNumber,
      reason: reasons.join('; '),
      estimatedCredit,
    });

    // Create ledger event for the opportunity
    try {
      await prisma.ledgerEvent.create({
        data: {
          tenantId: biz.tenant.id,
          eventType: 'restack.opportunity_identified',
          aggregateType: 'business',
          aggregateId: biz.id,
          payload: {
            businessId: biz.id,
            legalName: biz.legalName,
            currentRound: latestRound.roundNumber,
            nextRound: latestRound.roundNumber + 1,
            personalFico: personalProfile.score,
            businessCreditScore: bizProfile?.score ?? null,
            utilization: utilization,
            estimatedCredit,
            reason: reasons.join('; '),
            advisorId: biz.advisorId,
          },
          metadata: {
            source: 'inngest:generateRestackOpportunities',
            firedAt: now.toISOString(),
          },
        },
      });
    } catch (err) {
      logger.error(`${tag} Failed to create opportunity event for ${biz.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result: RestackResult = {
    businessesEvaluated: activeBusinesses.length,
    opportunitiesFound: opportunities.length,
    opportunities,
  };

  logger.info(`${tag} Evaluation complete`, {
    evaluated: result.businessesEvaluated,
    opportunities: result.opportunitiesFound,
  });

  return result;
}

// ============================================================
// 4. CHECK MISSED PAYMENTS — Daily 7 AM
//    Cron: 0 7 * * *
//
//    Scans payment schedules for overdue items (status still
//    "upcoming" past dueDate). If a business has 2+ consecutive
//    missed payments, creates a HardshipCase record.
// ============================================================

export async function checkMissedPayments(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<MissedPaymentResult> {
  const tag = '[checkMissedPayments]';
  logger.info(`${tag} Starting missed payment scan`, { now: now.toISOString() });

  // Find all overdue payment schedules
  const overdueSchedules = await prisma.paymentSchedule.findMany({
    where: {
      status: 'upcoming',
      dueDate: {
        lt: now,
      },
    },
    include: {
      repaymentPlan: {
        select: {
          id: true,
          tenantId: true,
          businessId: true,
        },
      },
    },
    orderBy: {
      dueDate: 'asc',
    },
  });

  logger.info(`${tag} Found ${overdueSchedules.length} overdue payment schedules`);

  // Mark overdue schedules
  for (const schedule of overdueSchedules) {
    await prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data: { status: 'missed' },
    });
  }

  // Group by repayment plan to find consecutive misses
  const planMisses = new Map<string, {
    tenantId: string;
    businessId: string;
    count: number;
  }>();

  for (const schedule of overdueSchedules) {
    const planId = schedule.repaymentPlanId;
    const existing = planMisses.get(planId);
    if (existing) {
      existing.count++;
    } else {
      planMisses.set(planId, {
        tenantId: schedule.repaymentPlan.tenantId,
        businessId: schedule.repaymentPlan.businessId,
        count: 1,
      });
    }
  }

  // Also check for previously missed payments on these plans
  // to determine total consecutive misses
  const details: MissedPaymentResult['details'] = [];

  for (const [planId, info] of planMisses) {
    // Count recent consecutive missed payments (look at last 6 months)
    const recentMissed = await prisma.paymentSchedule.count({
      where: {
        repaymentPlanId: planId,
        status: 'missed',
        dueDate: {
          gte: daysAgo(180, now),
        },
      },
    });

    if (recentMissed >= 2) {
      // Check if there's already an open hardship case
      const existingCase = await prisma.hardshipCase.findFirst({
        where: {
          businessId: info.businessId,
          status: 'open',
          triggerType: 'missed_payments',
        },
      });

      if (!existingCase) {
        try {
          // Create hardship case
          await prisma.hardshipCase.create({
            data: {
              tenantId: info.tenantId,
              businessId: info.businessId,
              triggerType: 'missed_payments',
              severity: recentMissed >= 4 ? 'critical' : recentMissed >= 3 ? 'high' : 'medium',
              status: 'open',
              paymentPlan: {
                repaymentPlanId: planId,
                consecutiveMissed: recentMissed,
                lastChecked: now.toISOString(),
              },
            },
          });

          // Create ledger event for the hardship flag
          await prisma.ledgerEvent.create({
            data: {
              tenantId: info.tenantId,
              eventType: 'hardship.auto_flagged',
              aggregateType: 'business',
              aggregateId: info.businessId,
              payload: {
                businessId: info.businessId,
                repaymentPlanId: planId,
                consecutiveMissed: recentMissed,
                severity: recentMissed >= 4 ? 'critical' : recentMissed >= 3 ? 'high' : 'medium',
                actionRequired: 'review_hardship_case',
              },
              metadata: {
                source: 'inngest:checkMissedPayments',
                firedAt: now.toISOString(),
              },
            },
          });

          details.push({
            businessId: info.businessId,
            repaymentPlanId: planId,
            consecutiveMissed: recentMissed,
          });

          logger.warn(`${tag} Created hardship flag for business ${info.businessId}`, {
            repaymentPlanId: planId,
            consecutiveMissed: recentMissed,
          });
        } catch (err) {
          logger.error(`${tag} Failed to create hardship case for ${info.businessId}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        logger.info(`${tag} Hardship case already open for business ${info.businessId}`);
      }
    }
  }

  const result: MissedPaymentResult = {
    schedulesScanned: overdueSchedules.length,
    hardshipFlagsCreated: details.length,
    details,
  };

  logger.info(`${tag} Scan complete`, {
    schedulesScanned: result.schedulesScanned,
    hardshipFlagsCreated: result.hardshipFlagsCreated,
  });

  return result;
}

// ============================================================
// Inngest function definitions (for future SDK integration)
//
// When inngest is installed, register these via:
//   import { inngest } from './inngest-client';
//   import { allInngestFunctions } from './inngest-functions';
//   serve({ client: inngest, functions: allInngestFunctions });
//
// For now, the exported `inngestFunctionDefs` array provides the
// metadata (name, cron, handler) so they can be wired into any
// scheduler (BullMQ, node-cron, Inngest, etc.).
// ============================================================

export interface InngestFunctionDef {
  id: string;
  name: string;
  cron: string;
  handler: (prisma: PrismaClient, now?: Date) => Promise<unknown>;
}

export const inngestFunctionDefs: InngestFunctionDef[] = [
  {
    id: 'capitalforge/check-apr-expiry',
    name: 'Check APR Expiry (Daily 8 AM)',
    cron: '0 8 * * *',
    handler: checkAprExpiry,
  },
  {
    id: 'capitalforge/check-disclosure-deadlines',
    name: 'Check Disclosure Deadlines (Daily 9 AM)',
    cron: '0 9 * * *',
    handler: checkDisclosureDeadlines,
  },
  {
    id: 'capitalforge/generate-restack-opportunities',
    name: 'Generate Restack Opportunities (Weekly Monday)',
    cron: '0 6 * * 1',
    handler: generateRestackOpportunities,
  },
  {
    id: 'capitalforge/check-missed-payments',
    name: 'Check Missed Payments (Daily 7 AM)',
    cron: '0 7 * * *',
    handler: checkMissedPayments,
  },
];

export default inngestFunctionDefs;
