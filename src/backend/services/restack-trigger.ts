// ============================================================
// CapitalForge — Re-Stack Trigger Engine
//
// Responsibilities:
//   1. checkRestackEligibility(businessId) — evaluate a single business
//   2. scanAllForRestack() — scan all businesses and return eligible ones
//
// Eligibility Criteria:
//   - fundingReadinessScore >= 70
//   - Days since last application >= 90
//   - Current utilization <= 40%
//   - No more than 2 active (non-decided) applications
// ============================================================

import { PrismaClient } from '@prisma/client';
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

const MIN_READINESS_SCORE = 70;
const MIN_DAYS_SINCE_LAST_APP = 90;
const MAX_UTILIZATION = 0.40;
const MAX_ACTIVE_APPLICATIONS = 2;

// ── Types ────────────────────────────────────────────────────

export interface RestackEligibilityResult {
  businessId: string;
  businessName: string;
  eligible: boolean;
  reasons: string[];
  readinessScore: number;
  daysSinceLastApp: number | null;
  currentUtilization: number | null;
  activeApplicationCount: number;
  recommendedRoundNumber: number;
}

// ── Core: Check Single Business Eligibility ──────────────────

export async function checkRestackEligibility(
  businessId: string,
  tenantId?: string,
): Promise<RestackEligibilityResult> {
  const prisma = getPrisma();

  const whereClause: Record<string, unknown> = { id: businessId };
  if (tenantId) whereClause.tenantId = tenantId;

  const business = await prisma.business.findFirst({
    where: whereClause,
    include: {
      cardApplications: {
        orderBy: { createdAt: 'desc' },
      },
      fundingRounds: {
        orderBy: { roundNumber: 'desc' },
      },
      creditProfiles: {
        orderBy: { pulledAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!business) {
    return {
      businessId,
      businessName: 'Unknown',
      eligible: false,
      reasons: ['Business not found'],
      readinessScore: 0,
      daysSinceLastApp: null,
      currentUtilization: null,
      activeApplicationCount: 0,
      recommendedRoundNumber: 1,
    };
  }

  const reasons: string[] = [];
  let eligible = true;

  // 1. Readiness score check
  const readinessScore = business.fundingReadinessScore ?? 0;
  if (readinessScore < MIN_READINESS_SCORE) {
    eligible = false;
    reasons.push(`Readiness score ${readinessScore} is below threshold of ${MIN_READINESS_SCORE}`);
  } else {
    reasons.push(`Readiness score ${readinessScore} meets threshold`);
  }

  // 2. Days since last application
  const lastApp = business.cardApplications[0];
  let daysSinceLastApp: number | null = null;
  if (lastApp) {
    const appDate = lastApp.submittedAt ?? lastApp.createdAt;
    daysSinceLastApp = Math.floor(
      (Date.now() - new Date(appDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceLastApp < MIN_DAYS_SINCE_LAST_APP) {
      eligible = false;
      reasons.push(`Only ${daysSinceLastApp} days since last application (need ${MIN_DAYS_SINCE_LAST_APP})`);
    } else {
      reasons.push(`${daysSinceLastApp} days since last application meets threshold`);
    }
  } else {
    reasons.push('No prior applications — eligible for first round');
  }

  // 3. Current utilization
  const latestCredit = business.creditProfiles[0];
  const currentUtilization = latestCredit?.utilization
    ? Number(latestCredit.utilization)
    : null;
  if (currentUtilization !== null) {
    if (currentUtilization > MAX_UTILIZATION) {
      eligible = false;
      reasons.push(`Utilization ${Math.round(currentUtilization * 100)}% exceeds ${Math.round(MAX_UTILIZATION * 100)}% max`);
    } else {
      reasons.push(`Utilization ${Math.round(currentUtilization * 100)}% is within limit`);
    }
  } else {
    reasons.push('No utilization data available — skipping utilization check');
  }

  // 4. Active application count
  const activeStatuses = ['draft', 'submitted', 'in_review', 'pending'];
  const activeApplicationCount = business.cardApplications.filter(
    (app) => activeStatuses.includes(app.status),
  ).length;
  if (activeApplicationCount > MAX_ACTIVE_APPLICATIONS) {
    eligible = false;
    reasons.push(`${activeApplicationCount} active applications exceed max of ${MAX_ACTIVE_APPLICATIONS}`);
  } else {
    reasons.push(`${activeApplicationCount} active applications within limit`);
  }

  // Recommended next round number
  const highestRound = business.fundingRounds[0]?.roundNumber ?? 0;
  const recommendedRoundNumber = highestRound + 1;

  return {
    businessId,
    businessName: business.legalName,
    eligible,
    reasons,
    readinessScore,
    daysSinceLastApp,
    currentUtilization,
    activeApplicationCount,
    recommendedRoundNumber,
  };
}

// ── Core: Scan All Businesses for Restack Eligibility ────────

export async function scanAllForRestack(
  tenantId?: string,
): Promise<RestackEligibilityResult[]> {
  const prisma = getPrisma();

  const whereClause: Record<string, unknown> = { status: 'active' };
  if (tenantId) whereClause.tenantId = tenantId;

  // Pre-filter: only look at businesses with readiness >= threshold
  whereClause.fundingReadinessScore = { gte: MIN_READINESS_SCORE };

  const businesses = await prisma.business.findMany({
    where: whereClause,
    select: { id: true, tenantId: true },
  });

  logger.info('[RestackTrigger] Scanning businesses for restack eligibility', {
    candidateCount: businesses.length,
    tenantId: tenantId ?? 'all',
  });

  const results: RestackEligibilityResult[] = [];

  for (const biz of businesses) {
    const result = await checkRestackEligibility(biz.id, biz.tenantId);
    if (result.eligible) {
      results.push(result);
    }
  }

  // Sort by readiness score descending
  results.sort((a, b) => b.readinessScore - a.readinessScore);

  logger.info('[RestackTrigger] Scan complete', {
    eligible: results.length,
    total: businesses.length,
  });

  return results;
}
