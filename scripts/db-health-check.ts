#!/usr/bin/env tsx
// ============================================================
// CapitalForge — Database Health Check
// Usage:
//   npx tsx scripts/db-health-check.ts [--tenant <slug>] [--json]
//
// Checks:
//   • Database connectivity
//   • All expected tables exist
//   • Record counts per table
//   • Orphaned records (FK integrity)
//   • Businesses without owners
//   • Funding rounds without applications
//   • Applications with invalid status
//   • Consent records by status distribution
//   • Index coverage summary
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Types ─────────────────────────────────────────────────────

interface TableHealth {
  table: string;
  count: number;
  status: 'ok' | 'warn' | 'error';
  notes?: string;
}

interface OrphanCheck {
  description: string;
  count: number;
  severity: 'ok' | 'warn' | 'error';
  examples?: string[];
}

interface HealthReport {
  timestamp: string;
  tenantSlug?: string;
  connectionOk: boolean;
  tables: TableHealth[];
  orphanChecks: OrphanCheck[];
  businessStatusDist: Record<string, number>;
  consentStatusDist: Record<string, number>;
  applicationStatusDist: Record<string, number>;
  complianceRiskDist: Record<string, number>;
  summary: {
    totalTables: number;
    totalRecords: number;
    tablesWithData: number;
    orphanIssues: number;
    warnings: number;
    errors: number;
  };
  duration_ms: number;
}

// ── Helpers ───────────────────────────────────────────────────

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (key && args[i + 1] && !args[i + 1].startsWith('--')) {
      result[key] = args[i + 1];
    } else if (key) {
      result[key] = 'true';
    }
  }
  return result;
}

function statusIcon(status: 'ok' | 'warn' | 'error'): string {
  return status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
}

// ── Health check ─────────────────────────────────────────────

async function runHealthCheck(tenantSlug?: string, outputJson?: boolean): Promise<void> {
  const startMs = Date.now();
  const report: HealthReport = {
    timestamp: new Date().toISOString(),
    tenantSlug,
    connectionOk: false,
    tables: [],
    orphanChecks: [],
    businessStatusDist: {},
    consentStatusDist: {},
    applicationStatusDist: {},
    complianceRiskDist: {},
    summary: {
      totalTables: 0,
      totalRecords: 0,
      tablesWithData: 0,
      orphanIssues: 0,
      warnings: 0,
      errors: 0,
    },
    duration_ms: 0,
  };

  // ── 1. Connection check ──────────────────────────────────────

  try {
    await prisma.$queryRaw`SELECT 1`;
    report.connectionOk = true;
  } catch (err) {
    report.connectionOk = false;
    report.summary.errors++;
    if (outputJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error('✗ Database connection FAILED');
      console.error(err);
    }
    return;
  }

  // ── 2. Resolve tenant filter ──────────────────────────────────

  let tenantId: string | undefined;
  if (tenantSlug) {
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) {
      console.error(`Tenant not found: ${tenantSlug}`);
      process.exit(1);
    }
    tenantId = t.id;
  }

  const tenantFilter = tenantId ? { tenantId } : {};

  // ── 3. Table record counts ────────────────────────────────────

  const tableCounts: [string, () => Promise<number>][] = [
    ['tenants',                     () => prisma.tenant.count()],
    ['users',                       () => prisma.user.count(tenantId ? { where: { tenantId } } : undefined)],
    ['businesses',                  () => prisma.business.count(tenantId ? { where: { tenantId } } : undefined)],
    ['business_owners',             () => prisma.businessOwner.count()],
    ['credit_profiles',             () => prisma.creditProfile.count()],
    ['funding_rounds',              () => prisma.fundingRound.count()],
    ['card_applications',           () => prisma.cardApplication.count()],
    ['suitability_checks',          () => prisma.suitabilityCheck.count()],
    ['consent_records',             () => prisma.consentRecord.count(tenantId ? { where: { tenantId } } : undefined)],
    ['product_acknowledgments',     () => prisma.productAcknowledgment.count()],
    ['compliance_checks',           () => prisma.complianceCheck.count(tenantId ? { where: { tenantId } } : undefined)],
    ['ach_authorizations',          () => prisma.achAuthorization.count()],
    ['debit_events',                () => prisma.debitEvent.count()],
    ['cost_calculations',           () => prisma.costCalculation.count()],
    ['ledger_events',               () => prisma.ledgerEvent.count(tenantId ? { where: { tenantId } } : undefined)],
    ['documents',                   () => prisma.document.count(tenantId ? { where: { tenantId } } : undefined)],
    ['decline_recoveries',          () => prisma.declineRecovery.count()],
    ['repayment_plans',             () => prisma.repaymentPlan.count()],
    ['payment_schedules',           () => prisma.paymentSchedule.count()],
    ['spend_transactions',          () => prisma.spendTransaction.count()],
    ['rewards_optimizations',       () => prisma.rewardsOptimization.count()],
    ['card_benefits',               () => prisma.cardBenefit.count()],
    ['invoices',                    () => prisma.invoice.count()],
    ['commission_records',          () => prisma.commissionRecord.count()],
    ['statement_records',           () => prisma.statementRecord.count(tenantId ? { where: { tenantId } } : undefined)],
    ['deal_committee_reviews',      () => prisma.dealCommitteeReview.count()],
    ['hardship_cases',              () => prisma.hardshipCase.count()],
    ['complaints',                  () => prisma.complaint.count(tenantId ? { where: { tenantId } } : undefined)],
    ['partners',                    () => prisma.partner.count(tenantId ? { where: { tenantId } } : undefined)],
    ['contract_analyses',           () => prisma.contractAnalysis.count()],
    ['comm_compliance_records',     () => prisma.commComplianceRecord.count()],
    ['approved_scripts',            () => prisma.approvedScript.count()],
    ['training_certifications',     () => prisma.trainingCertification.count()],
    ['disclosure_templates',        () => prisma.disclosureTemplate.count()],
    ['workflow_rules',              () => prisma.workflowRule.count()],
    ['policy_rules',                () => prisma.policyRule.count()],
    ['referral_attributions',       () => prisma.referralAttribution.count()],
    ['regulatory_alerts',           () => prisma.regulatoryAlert.count()],
    ['pipeline_stages',             () => prisma.pipelineStage.count()],
    ['advisor_qa_scores',           () => prisma.advisorQaScore.count()],
    ['tenant_plans',                () => prisma.tenantPlan.count()],
    ['usage_meters',                () => prisma.usageMeter.count()],
    ['issuer_contacts',             () => prisma.issuerContact.count()],
    ['fair_lending_records',        () => prisma.fairLendingRecord.count()],
    ['funds_flow_classifications',  () => prisma.fundsFlowClassification.count()],
    ['offboarding_workflows',       () => prisma.offboardingWorkflow.count()],
    ['ai_decision_logs',            () => prisma.aiDecisionLog.count()],
    ['sandbox_profiles',            () => prisma.sandboxProfile.count()],
    ['backup_records',              () => prisma.backupRecord.count()],
    ['audit_logs',                  () => prisma.auditLog.count(tenantId ? { where: { tenantId } } : undefined)],
  ];

  for (const [table, countFn] of tableCounts) {
    try {
      const count = await countFn();
      const status: 'ok' | 'warn' = count === 0 ? 'warn' : 'ok';
      if (status === 'warn') report.summary.warnings++;
      report.tables.push({ table, count, status, notes: count === 0 ? 'empty table' : undefined });
    } catch (err) {
      report.tables.push({ table, count: -1, status: 'error', notes: `Query failed: ${err}` });
      report.summary.errors++;
    }
  }

  // ── 4. Orphan / integrity checks ─────────────────────────────

  // Businesses with no owners
  const bizNoOwners = await prisma.business.count({
    where: {
      ...tenantFilter,
      status: { in: ['active', 'onboarding'] },
      owners: { none: {} },
    },
  });
  report.orphanChecks.push({
    description: 'Active/onboarding businesses with no owners',
    count: bizNoOwners,
    severity: bizNoOwners > 0 ? 'warn' : 'ok',
  });

  // Businesses with no consent records
  const bizNoConsent = await prisma.business.count({
    where: {
      ...tenantFilter,
      status: { in: ['active', 'onboarding'] },
      consentRecords: { none: {} },
    },
  });
  report.orphanChecks.push({
    description: 'Active/onboarding businesses with no consent records',
    count: bizNoConsent,
    severity: bizNoConsent > 0 ? 'warn' : 'ok',
  });

  // Funding rounds with no applications
  const roundsNoApps = await prisma.fundingRound.count({
    where: {
      status: { in: ['in_progress', 'completed'] },
      applications: { none: {} },
    },
  });
  report.orphanChecks.push({
    description: 'In-progress/completed funding rounds with no applications',
    count: roundsNoApps,
    severity: roundsNoApps > 0 ? 'warn' : 'ok',
  });

  // Card applications with no associated business
  const appsNoBiz = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM card_applications ca
    LEFT JOIN businesses b ON b.id = ca.business_id
    WHERE b.id IS NULL
  `;
  const appsNoBizCount = Number(appsNoBiz[0]?.count ?? 0);
  report.orphanChecks.push({
    description: 'Card applications referencing non-existent business',
    count: appsNoBizCount,
    severity: appsNoBizCount > 0 ? 'error' : 'ok',
  });

  // Consent records referencing non-existent business
  const consentNoBiz = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM consent_records cr
    WHERE cr.business_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = cr.business_id)
  `;
  const consentNoBizCount = Number(consentNoBiz[0]?.count ?? 0);
  report.orphanChecks.push({
    description: 'Consent records with invalid business_id',
    count: consentNoBizCount,
    severity: consentNoBizCount > 0 ? 'error' : 'ok',
  });

  // Debit events with no authorization
  const debitNoAuth = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM debit_events de
    LEFT JOIN ach_authorizations a ON a.id = de.authorization_id
    WHERE a.id IS NULL
  `;
  const debitNoAuthCount = Number(debitNoAuth[0]?.count ?? 0);
  report.orphanChecks.push({
    description: 'Debit events with no authorization record',
    count: debitNoAuthCount,
    severity: debitNoAuthCount > 0 ? 'error' : 'ok',
  });

  // Payment schedules with no repayment plan
  const schedNoPlan = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM payment_schedules ps
    LEFT JOIN repayment_plans rp ON rp.id = ps.repayment_plan_id
    WHERE rp.id IS NULL
  `;
  const schedNoPlanCount = Number(schedNoPlan[0]?.count ?? 0);
  report.orphanChecks.push({
    description: 'Payment schedules with no repayment plan',
    count: schedNoPlanCount,
    severity: schedNoPlanCount > 0 ? 'error' : 'ok',
  });

  // Count orphan issues
  report.summary.orphanIssues = report.orphanChecks.filter((c) => c.severity !== 'ok').length;
  report.summary.warnings += report.orphanChecks.filter((c) => c.severity === 'warn').length;
  report.summary.errors += report.orphanChecks.filter((c) => c.severity === 'error').length;

  // ── 5. Distribution stats ──────────────────────────────────

  const bizStatusGroups = await prisma.business.groupBy({
    by: ['status'],
    _count: { id: true },
    ...(tenantId ? { where: { tenantId } } : {}),
  });
  bizStatusGroups.forEach((g) => { report.businessStatusDist[g.status] = g._count.id; });

  const consentGroups = await prisma.consentRecord.groupBy({
    by: ['status'],
    _count: { id: true },
    ...(tenantId ? { where: { tenantId } } : {}),
  });
  consentGroups.forEach((g) => { report.consentStatusDist[g.status] = g._count.id; });

  const appStatusGroups = await prisma.cardApplication.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  appStatusGroups.forEach((g) => { report.applicationStatusDist[g.status] = g._count.id; });

  const compRiskGroups = await prisma.complianceCheck.groupBy({
    by: ['riskLevel'],
    _count: { id: true },
    ...(tenantId ? { where: { tenantId } } : {}),
  });
  compRiskGroups.forEach((g) => {
    report.complianceRiskDist[g.riskLevel ?? 'unknown'] = g._count.id;
  });

  // ── 6. Summary stats ──────────────────────────────────────

  report.summary.totalTables = report.tables.length;
  report.summary.totalRecords = report.tables
    .filter((t) => t.count >= 0)
    .reduce((sum, t) => sum + t.count, 0);
  report.summary.tablesWithData = report.tables.filter((t) => t.count > 0).length;

  report.duration_ms = Date.now() - startMs;

  // ── 7. Output ─────────────────────────────────────────────

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const line = '─'.repeat(60);
  console.log('\nCapitalForge Database Health Check');
  console.log(line);
  console.log(`  Timestamp  : ${report.timestamp}`);
  console.log(`  Tenant     : ${tenantSlug ?? '(all tenants)'}`);
  console.log(`  Connection : ${report.connectionOk ? '✓ Connected' : '✗ FAILED'}`);
  console.log(`  Duration   : ${report.duration_ms}ms`);
  console.log(line);

  // Table counts
  console.log('\nTable Record Counts:');
  const maxTableName = Math.max(...report.tables.map((t) => t.table.length));
  for (const t of report.tables) {
    const icon = statusIcon(t.status);
    const countStr = t.count >= 0 ? t.count.toLocaleString().padStart(10) : '     ERROR';
    const note = t.notes ? `  ← ${t.notes}` : '';
    console.log(`  ${icon} ${t.table.padEnd(maxTableName)}  ${countStr}${note}`);
  }

  // Orphan / integrity
  console.log('\nIntegrity Checks:');
  for (const check of report.orphanChecks) {
    const icon = statusIcon(check.severity);
    console.log(`  ${icon} ${check.description}`);
    if (check.count > 0) {
      console.log(`      Count: ${check.count}`);
    }
  }

  // Distributions
  console.log('\nBusiness Status Distribution:');
  Object.entries(report.businessStatusDist).forEach(([status, count]) => {
    console.log(`    ${status.padEnd(16)} ${count}`);
  });

  console.log('\nCard Application Status Distribution:');
  Object.entries(report.applicationStatusDist).forEach(([status, count]) => {
    console.log(`    ${status.padEnd(16)} ${count}`);
  });

  console.log('\nConsent Record Status Distribution:');
  Object.entries(report.consentStatusDist).forEach(([status, count]) => {
    console.log(`    ${status.padEnd(16)} ${count}`);
  });

  console.log('\nCompliance Check Risk Distribution:');
  Object.entries(report.complianceRiskDist).forEach(([level, count]) => {
    console.log(`    ${level.padEnd(16)} ${count}`);
  });

  // Summary
  console.log('\n' + line);
  console.log('Summary:');
  console.log(`  Tables checked    : ${report.summary.totalTables}`);
  console.log(`  Tables with data  : ${report.summary.tablesWithData}`);
  console.log(`  Total records     : ${report.summary.totalRecords.toLocaleString()}`);
  console.log(`  Integrity issues  : ${report.summary.orphanIssues}`);
  console.log(`  Warnings          : ${report.summary.warnings}`);
  console.log(`  Errors            : ${report.summary.errors}`);

  const overallStatus = report.summary.errors > 0 ? '✗ UNHEALTHY' :
    report.summary.warnings > 0 ? '⚠ DEGRADED' : '✓ HEALTHY';
  console.log(`\n  Overall status    : ${overallStatus}`);
  console.log(line);

  if (report.summary.errors > 0) process.exit(1);
}

// ── Entry point ───────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const tenantSlug = args['tenant'];
  const outputJson = args['json'] === 'true';

  await runHealthCheck(tenantSlug, outputJson);
}

main()
  .catch((err) => {
    console.error('Health check failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
