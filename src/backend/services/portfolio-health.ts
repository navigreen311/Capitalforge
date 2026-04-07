// ============================================================
// CapitalForge — Portfolio Health Score Service
//
// Calculates a composite health score (0-100) across 6 dimensions:
//   1. Consent Completion    (20 pts)
//   2. Acknowledgment Completion (20 pts)
//   3. Compliance Pass Rate  (20 pts)
//   4. APR Management        (20 pts)
//   5. Approval Rate         (10 pts)
//   6. Payment Performance   (10 pts)
//
// Grade scale: A >= 90, B >= 80, C >= 70, D >= 60, F < 60
// ============================================================

import { PrismaClient } from '@prisma/client';

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthComponent {
  name: string;
  key: string;
  score: number;
  maxPoints: number;
  percentage: number;
  detail: string;
}

export interface ActionItem {
  priority: number;
  title: string;
  description: string;
  potentialGain: number;
}

export interface PortfolioHealthResult {
  score: number;
  grade: HealthGrade;
  components: HealthComponent[];
  trend: {
    direction: 'up' | 'down' | 'flat';
    delta: number;
    previousScore: number;
  };
  actionItems: ActionItem[];
  computedAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_CONSENT_TYPES = ['tcpa', 'data_sharing', 'application'];
const REQUIRED_ACK_TYPES = [
  'product_reality',
  'fee_schedule',
  'personal_guarantee',
  'cash_advance_risk',
];

// ── Grade mapper ─────────────────────────────────────────────────────────────

function scoreToGrade(score: number): HealthGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ── Core calculation ─────────────────────────────────────────────────────────

export async function calculatePortfolioHealth(
  prisma: PrismaClient,
  tenantId: string,
): Promise<PortfolioHealthResult> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // ── Fetch aggregate data in parallel ─────────────────────────────────────

  const [
    businesses,
    consentRecords,
    acknowledgments,
    complianceChecks,
    fundingRounds,
    applications,
    paymentSchedules,
    // Previous period data for trend
    prevComplianceChecks,
    prevApplications,
    prevPayments,
  ] = await Promise.all([
    // All active businesses for this tenant
    prisma.business.findMany({
      where: { tenantId, status: { not: 'archived' } },
      select: { id: true },
    }),

    // All active consent records
    prisma.consentRecord.findMany({
      where: { tenantId, status: 'active' },
      select: { businessId: true, consentType: true },
    }),

    // All acknowledgments for tenant businesses
    prisma.productAcknowledgment.findMany({
      where: {
        business: { tenantId },
      },
      select: { businessId: true, acknowledgmentType: true },
    }),

    // Compliance checks (current period)
    prisma.complianceCheck.findMany({
      where: {
        tenantId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { riskLevel: true },
    }),

    // Funding rounds with APR expiry
    prisma.fundingRound.findMany({
      where: {
        business: { tenantId },
        aprExpiryDate: { not: null },
      },
      select: {
        aprExpiryDate: true,
        status: true,
        alertSent60: true,
        alertSent30: true,
        alertSent15: true,
      },
    }),

    // All applications (current period)
    prisma.cardApplication.findMany({
      where: {
        business: { tenantId },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { status: true },
    }),

    // Payment schedules (current period)
    prisma.paymentSchedule.findMany({
      where: {
        repaymentPlan: {
          tenantId,
        },
        dueDate: { lte: now },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { status: true, paidAt: true, dueDate: true },
    }),

    // ── Previous period (30-60 days ago) for trend calculation ──────────

    prisma.complianceCheck.findMany({
      where: {
        tenantId,
        createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
      select: { riskLevel: true },
    }),

    prisma.cardApplication.findMany({
      where: {
        business: { tenantId },
        createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
      select: { status: true },
    }),

    prisma.paymentSchedule.findMany({
      where: {
        repaymentPlan: { tenantId },
        dueDate: { lte: thirtyDaysAgo, gte: sixtyDaysAgo },
      },
      select: { status: true, paidAt: true, dueDate: true },
    }),
  ]);

  const businessIds = new Set(businesses.map((b) => b.id));
  const totalBusinesses = businessIds.size;

  // ── 1. Consent Completion (20 pts) ───────────────────────────────────────

  let consentPct = 0;
  if (totalBusinesses > 0) {
    // Group consents by business
    const consentsByBiz = new Map<string, Set<string>>();
    for (const cr of consentRecords) {
      if (cr.businessId && businessIds.has(cr.businessId)) {
        if (!consentsByBiz.has(cr.businessId)) {
          consentsByBiz.set(cr.businessId, new Set());
        }
        consentsByBiz.get(cr.businessId)!.add(cr.consentType);
      }
    }

    let fullyConsented = 0;
    for (const types of consentsByBiz.values()) {
      if (REQUIRED_CONSENT_TYPES.every((t) => types.has(t))) {
        fullyConsented++;
      }
    }
    consentPct = fullyConsented / totalBusinesses;
  }
  const consentScore = Math.round(consentPct * 20 * 100) / 100;

  // ── 2. Acknowledgment Completion (20 pts) ────────────────────────────────

  let ackPct = 0;
  if (totalBusinesses > 0) {
    const acksByBiz = new Map<string, Set<string>>();
    for (const ack of acknowledgments) {
      if (businessIds.has(ack.businessId)) {
        if (!acksByBiz.has(ack.businessId)) {
          acksByBiz.set(ack.businessId, new Set());
        }
        acksByBiz.get(ack.businessId)!.add(ack.acknowledgmentType);
      }
    }

    let fullyAcked = 0;
    for (const types of acksByBiz.values()) {
      if (REQUIRED_ACK_TYPES.every((t) => types.has(t))) {
        fullyAcked++;
      }
    }
    ackPct = fullyAcked / totalBusinesses;
  }
  const ackScore = Math.round(ackPct * 20 * 100) / 100;

  // ── 3. Compliance Pass Rate (20 pts) ─────────────────────────────────────

  let compliancePct = 0;
  const totalChecks = complianceChecks.length;
  if (totalChecks > 0) {
    const passed = complianceChecks.filter(
      (c) => c.riskLevel === 'low' || c.riskLevel === 'medium',
    ).length;
    compliancePct = passed / totalChecks;
  }
  const complianceScore = Math.round(compliancePct * 20 * 100) / 100;

  // ── 4. APR Management (20 pts) ──────────────────────────────────────────

  let aprPct = 0;
  const roundsWithExpiry = fundingRounds.filter((r) => r.aprExpiryDate);
  if (roundsWithExpiry.length > 0) {
    const handled = roundsWithExpiry.filter((r) => {
      // Considered "handled" if alerts were sent OR the round is completed/restacked
      const alertsSent = r.alertSent60 || r.alertSent30 || r.alertSent15;
      const resolved = r.status === 'completed' || r.status === 'restacked';
      return alertsSent || resolved;
    }).length;
    aprPct = handled / roundsWithExpiry.length;
  } else {
    // No APR expirations to manage — full marks
    aprPct = 1;
  }
  const aprScore = Math.round(aprPct * 20 * 100) / 100;

  // ── 5. Approval Rate (10 pts) ───────────────────────────────────────────

  let approvalPct = 0;
  const totalApps = applications.length;
  if (totalApps > 0) {
    const approved = applications.filter(
      (a) => a.status === 'approved' || a.status === 'funded',
    ).length;
    approvalPct = approved / totalApps;
  }
  const approvalScore = Math.round(approvalPct * 10 * 100) / 100;

  // ── 6. Payment Performance (10 pts) ─────────────────────────────────────

  let paymentPct = 0;
  const totalPayments = paymentSchedules.length;
  if (totalPayments > 0) {
    const onTime = paymentSchedules.filter((p) => {
      if (p.status === 'paid' && p.paidAt && p.dueDate) {
        return p.paidAt <= p.dueDate;
      }
      return p.status === 'paid';
    }).length;
    paymentPct = onTime / totalPayments;
  } else {
    paymentPct = 1; // No payments due — full marks
  }
  const paymentScore = Math.round(paymentPct * 10 * 100) / 100;

  // ── Total score ─────────────────────────────────────────────────────────

  const score = Math.round(
    (consentScore + ackScore + complianceScore + aprScore + approvalScore + paymentScore) * 100,
  ) / 100;

  // ── Components array ────────────────────────────────────────────────────

  const components: HealthComponent[] = [
    {
      name: 'Consent Completion',
      key: 'consent',
      score: consentScore,
      maxPoints: 20,
      percentage: Math.round(consentPct * 100),
      detail: `${Math.round(consentPct * totalBusinesses)}/${totalBusinesses} businesses fully consented`,
    },
    {
      name: 'Acknowledgment Completion',
      key: 'acknowledgment',
      score: ackScore,
      maxPoints: 20,
      percentage: Math.round(ackPct * 100),
      detail: `${Math.round(ackPct * totalBusinesses)}/${totalBusinesses} businesses fully acknowledged`,
    },
    {
      name: 'Compliance Pass Rate',
      key: 'compliance',
      score: complianceScore,
      maxPoints: 20,
      percentage: Math.round(compliancePct * 100),
      detail: `${Math.round(compliancePct * totalChecks)}/${totalChecks} checks passing`,
    },
    {
      name: 'APR Management',
      key: 'apr',
      score: aprScore,
      maxPoints: 20,
      percentage: Math.round(aprPct * 100),
      detail: `${Math.round(aprPct * roundsWithExpiry.length)}/${roundsWithExpiry.length} expirations handled`,
    },
    {
      name: 'Approval Rate',
      key: 'approval',
      score: approvalScore,
      maxPoints: 10,
      percentage: Math.round(approvalPct * 100),
      detail: `${Math.round(approvalPct * totalApps)}/${totalApps} applications approved`,
    },
    {
      name: 'Payment Performance',
      key: 'payment',
      score: paymentScore,
      maxPoints: 10,
      percentage: Math.round(paymentPct * 100),
      detail: `${Math.round(paymentPct * totalPayments)}/${totalPayments} payments on time`,
    },
  ];

  // ── Trend calculation (vs previous 30 days) ─────────────────────────────

  const prevCompPct =
    prevComplianceChecks.length > 0
      ? prevComplianceChecks.filter(
          (c) => c.riskLevel === 'low' || c.riskLevel === 'medium',
        ).length / prevComplianceChecks.length
      : 1;

  const prevApprovalPct =
    prevApplications.length > 0
      ? prevApplications.filter(
          (a) => a.status === 'approved' || a.status === 'funded',
        ).length / prevApplications.length
      : 1;

  const prevPaymentPct =
    prevPayments.length > 0
      ? prevPayments.filter((p) => p.status === 'paid').length / prevPayments.length
      : 1;

  // Approximate previous score using same weights (consent/ack assumed stable)
  const prevScore = Math.round(
    consentScore +
      ackScore +
      prevCompPct * 20 +
      aprScore +
      prevApprovalPct * 10 +
      prevPaymentPct * 10,
  );

  const delta = Math.round((score - prevScore) * 100) / 100;
  const direction = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';

  // ── Action items (sorted by potential improvement) ──────────────────────

  const actionItems: ActionItem[] = [];

  const gaps = components
    .map((c) => ({
      ...c,
      gap: c.maxPoints - c.score,
    }))
    .filter((c) => c.gap > 0.5)
    .sort((a, b) => b.gap - a.gap);

  for (const gap of gaps.slice(0, 3)) {
    switch (gap.key) {
      case 'consent':
        actionItems.push({
          priority: 1,
          title: 'Complete consent collection',
          description: `${gap.detail}. Collect missing TCPA, data-sharing, and application consents to gain up to ${gap.gap.toFixed(1)} points.`,
          potentialGain: gap.gap,
        });
        break;
      case 'acknowledgment':
        actionItems.push({
          priority: 2,
          title: 'Gather missing acknowledgments',
          description: `${gap.detail}. Ensure all businesses have signed product reality, fee schedule, personal guarantee, and cash advance risk acknowledgments.`,
          potentialGain: gap.gap,
        });
        break;
      case 'compliance':
        actionItems.push({
          priority: 3,
          title: 'Resolve compliance findings',
          description: `${gap.detail}. Address high and critical risk findings to improve your pass rate.`,
          potentialGain: gap.gap,
        });
        break;
      case 'apr':
        actionItems.push({
          priority: 4,
          title: 'Manage APR expirations',
          description: `${gap.detail}. Set up alerts and restack plans for upcoming intro APR expirations.`,
          potentialGain: gap.gap,
        });
        break;
      case 'approval':
        actionItems.push({
          priority: 5,
          title: 'Improve application quality',
          description: `${gap.detail}. Review declined applications and strengthen credit profiles before resubmission.`,
          potentialGain: gap.gap,
        });
        break;
      case 'payment':
        actionItems.push({
          priority: 6,
          title: 'Address late payments',
          description: `${gap.detail}. Enable autopay and set up payment reminders to improve on-time rates.`,
          potentialGain: gap.gap,
        });
        break;
    }
  }

  return {
    score: Math.round(score),
    grade: scoreToGrade(Math.round(score)),
    components,
    trend: {
      direction,
      delta,
      previousScore: prevScore,
    },
    actionItems,
    computedAt: now.toISOString(),
  };
}
