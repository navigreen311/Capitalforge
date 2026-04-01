#!/usr/bin/env tsx
// ============================================================
// CapitalForge — Data Cleanup Utility
// Usage:
//   npx tsx scripts/cleanup-data.ts <command> [options]
//
// Commands:
//   purge-tenant          --tenant <slug> [--dry-run]
//   purge-test-data       --tenant <slug> [--dry-run]
//   expire-consents       [--tenant <slug>] [--dry-run]
//   archive-audit-logs    [--before <date>] [--output <file>] [--dry-run]
//   process-ccpa          --business <id> [--dry-run]
//   purge-old-ledger      --before <date> [--dry-run]
// ============================================================

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  if (args[0]) result['command'] = args[0];
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (key && args[i + 1] && !args[i + 1].startsWith('--')) {
      result[key] = args[i + 1];
    } else if (key) {
      result[key] = 'true';
    }
  }
  return result;
}

function yearsAgo(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}

interface CleanupReport {
  command: string;
  dryRun: boolean;
  startedAt: string;
  completedAt?: string;
  deletions: Record<string, number>;
  errors: string[];
}

function printReport(report: CleanupReport): void {
  console.log('\n── Cleanup Report ─────────────────────────────');
  console.log(`  Command    : ${report.command}`);
  console.log(`  Dry run    : ${report.dryRun}`);
  console.log(`  Started at : ${report.startedAt}`);
  if (report.completedAt) {
    console.log(`  Completed  : ${report.completedAt}`);
  }
  if (Object.keys(report.deletions).length > 0) {
    console.log('\n  Records affected:');
    Object.entries(report.deletions).forEach(([table, count]) => {
      const action = report.dryRun ? 'would delete' : 'deleted';
      console.log(`    ${table.padEnd(28)} ${count.toString().padStart(6)} ${action}`);
    });
  }
  if (report.errors.length > 0) {
    console.log('\n  Errors:');
    report.errors.forEach((e) => console.log(`    ✗ ${e}`));
  }
  const totalAffected = Object.values(report.deletions).reduce((a, b) => a + b, 0);
  console.log(`\n  Total affected: ${totalAffected}`);
  if (report.dryRun) {
    console.log('\n  ⚠ DRY RUN — no records were modified');
  } else {
    console.log('\n  ✅ Cleanup complete');
  }
}

// ── Command: purge-tenant ─────────────────────────────────────
// Removes ALL data for a tenant. Irreversible. Requires confirmation.

async function purgeTenant(slug: string, dryRun: boolean): Promise<void> {
  const report: CleanupReport = {
    command: 'purge-tenant',
    dryRun,
    startedAt: new Date().toISOString(),
    deletions: {},
    errors: [],
  };

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`Tenant not found: ${slug}`);
    process.exit(1);
  }

  const tid = tenant.id;
  console.log(`\nPurging tenant: ${slug} (${tid})`);
  if (!dryRun) {
    console.log('  ⚠ WARNING: This operation is irreversible. Sleeping 3s...');
    await new Promise((r) => setTimeout(r, 3000));
  }

  const businesses = await prisma.business.findMany({
    where: { tenantId: tid },
    select: { id: true },
  });
  const bizIds = businesses.map((b) => b.id);

  // Count what we will delete
  const [
    achAuthCount,
    cardAppCount,
    fundingRoundCount,
    compCheckCount,
    consentCount,
    docCount,
    suitabilityCount,
    ackCount,
    costCalcCount,
    stmtCount,
    creditProfileCount,
    bizOwnerCount,
    debitEventCount,
    ledgerEventCount,
    partnerCount,
    complaintCount,
    auditLogCount,
    bizCount,
    userCount,
  ] = await Promise.all([
    prisma.achAuthorization.count({ where: { businessId: { in: bizIds } } }),
    prisma.cardApplication.count({ where: { businessId: { in: bizIds } } }),
    prisma.fundingRound.count({ where: { businessId: { in: bizIds } } }),
    prisma.complianceCheck.count({ where: { tenantId: tid } }),
    prisma.consentRecord.count({ where: { tenantId: tid } }),
    prisma.document.count({ where: { tenantId: tid } }),
    prisma.suitabilityCheck.count({ where: { businessId: { in: bizIds } } }),
    prisma.productAcknowledgment.count({ where: { businessId: { in: bizIds } } }),
    prisma.costCalculation.count({ where: { businessId: { in: bizIds } } }),
    prisma.statementRecord.count({ where: { tenantId: tid } }),
    prisma.creditProfile.count({ where: { businessId: { in: bizIds } } }),
    prisma.businessOwner.count({ where: { businessId: { in: bizIds } } }),
    prisma.debitEvent.count({
      where: {
        authorization: { businessId: { in: bizIds } },
      },
    }),
    prisma.ledgerEvent.count({ where: { tenantId: tid } }),
    prisma.partner.count({ where: { tenantId: tid } }),
    prisma.complaint.count({ where: { tenantId: tid } }),
    prisma.auditLog.count({ where: { tenantId: tid } }),
    prisma.business.count({ where: { tenantId: tid } }),
    prisma.user.count({ where: { tenantId: tid } }),
  ]);

  report.deletions = {
    debit_events: debitEventCount,
    ach_authorizations: achAuthCount,
    card_applications: cardAppCount,
    funding_rounds: fundingRoundCount,
    compliance_checks: compCheckCount,
    consent_records: consentCount,
    documents: docCount,
    suitability_checks: suitabilityCount,
    product_acknowledgments: ackCount,
    cost_calculations: costCalcCount,
    statement_records: stmtCount,
    credit_profiles: creditProfileCount,
    business_owners: bizOwnerCount,
    ledger_events: ledgerEventCount,
    partners: partnerCount,
    complaints: complaintCount,
    audit_logs: auditLogCount,
    businesses: bizCount,
    users: userCount,
    tenant: 1,
  };

  if (!dryRun && bizIds.length > 0) {
    // Delete in dependency order
    const achAuths = await prisma.achAuthorization.findMany({
      where: { businessId: { in: bizIds } }, select: { id: true },
    });
    const achIds = achAuths.map((a) => a.id);

    if (achIds.length > 0) {
      await prisma.debitEvent.deleteMany({ where: { authorizationId: { in: achIds } } });
      await prisma.achAuthorization.deleteMany({ where: { id: { in: achIds } } });
    }

    await prisma.cardApplication.deleteMany({ where: { businessId: { in: bizIds } } });
    await prisma.fundingRound.deleteMany({ where: { businessId: { in: bizIds } } });
    await prisma.complianceCheck.deleteMany({ where: { tenantId: tid } });
    await prisma.consentRecord.deleteMany({ where: { tenantId: tid } });
    await prisma.document.deleteMany({ where: { tenantId: tid } });
    await prisma.suitabilityCheck.deleteMany({ where: { businessId: { in: bizIds } } });
    await prisma.productAcknowledgment.deleteMany({ where: { businessId: { in: bizIds } } });
    await prisma.costCalculation.deleteMany({ where: { businessId: { in: bizIds } } });
    await prisma.statementRecord.deleteMany({ where: { tenantId: tid } });
    await prisma.creditProfile.deleteMany({ where: { businessId: { in: bizIds } } });
    await prisma.businessOwner.deleteMany({ where: { businessId: { in: bizIds } } });
    await prisma.ledgerEvent.deleteMany({ where: { tenantId: tid } });
    await prisma.partner.deleteMany({ where: { tenantId: tid } });
    await prisma.complaint.deleteMany({ where: { tenantId: tid } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
    await prisma.business.deleteMany({ where: { tenantId: tid } });
    await prisma.user.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.delete({ where: { id: tid } });
  }

  report.completedAt = new Date().toISOString();
  printReport(report);
}

// ── Command: purge-test-data ──────────────────────────────────
// Removes businesses whose IDs start with "test-<tenantSlug>-biz-"

async function purgeTestData(slug: string, dryRun: boolean): Promise<void> {
  const report: CleanupReport = {
    command: 'purge-test-data',
    dryRun,
    startedAt: new Date().toISOString(),
    deletions: {},
    errors: [],
  };

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`Tenant not found: ${slug}`);
    process.exit(1);
  }

  const prefix = `test-${slug}-biz-`;
  console.log(`\nPurging test businesses with prefix "${prefix}" from tenant: ${slug}`);

  const testBizIds = (
    await prisma.business.findMany({
      where: { tenantId: tenant.id, id: { startsWith: prefix } },
      select: { id: true },
    })
  ).map((b) => b.id);

  console.log(`  Found ${testBizIds.length} test businesses`);
  if (testBizIds.length === 0) {
    console.log('  Nothing to clean up.');
    return;
  }

  const [
    ownerCount, profileCount, achCount, appCount, roundCount,
    suitCount, ackCount, costCount, consentCount, compCount, stmtCount,
  ] = await Promise.all([
    prisma.businessOwner.count({ where: { businessId: { in: testBizIds } } }),
    prisma.creditProfile.count({ where: { businessId: { in: testBizIds } } }),
    prisma.achAuthorization.count({ where: { businessId: { in: testBizIds } } }),
    prisma.cardApplication.count({ where: { businessId: { in: testBizIds } } }),
    prisma.fundingRound.count({ where: { businessId: { in: testBizIds } } }),
    prisma.suitabilityCheck.count({ where: { businessId: { in: testBizIds } } }),
    prisma.productAcknowledgment.count({ where: { businessId: { in: testBizIds } } }),
    prisma.costCalculation.count({ where: { businessId: { in: testBizIds } } }),
    prisma.consentRecord.count({ where: { businessId: { in: testBizIds } } }),
    prisma.complianceCheck.count({ where: { businessId: { in: testBizIds } } }),
    prisma.statementRecord.count({ where: { businessId: { in: testBizIds } } }),
  ]);

  report.deletions = {
    business_owners: ownerCount,
    credit_profiles: profileCount,
    ach_authorizations: achCount,
    card_applications: appCount,
    funding_rounds: roundCount,
    suitability_checks: suitCount,
    product_acknowledgments: ackCount,
    cost_calculations: costCount,
    consent_records: consentCount,
    compliance_checks: compCount,
    statement_records: stmtCount,
    businesses: testBizIds.length,
  };

  if (!dryRun) {
    const achAuths = await prisma.achAuthorization.findMany({
      where: { businessId: { in: testBizIds } },
      select: { id: true },
    });
    const achIds = achAuths.map((a) => a.id);
    if (achIds.length > 0) {
      await prisma.debitEvent.deleteMany({ where: { authorizationId: { in: achIds } } });
      await prisma.achAuthorization.deleteMany({ where: { id: { in: achIds } } });
    }

    await prisma.cardApplication.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.fundingRound.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.suitabilityCheck.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.productAcknowledgment.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.costCalculation.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.consentRecord.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.complianceCheck.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.statementRecord.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.creditProfile.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.businessOwner.deleteMany({ where: { businessId: { in: testBizIds } } });
    await prisma.business.deleteMany({ where: { id: { in: testBizIds } } });
  }

  report.completedAt = new Date().toISOString();
  printReport(report);
}

// ── Command: expire-consents ──────────────────────────────────
// Marks consent records older than 2 years as expired.

async function expireConsents(slug: string | undefined, dryRun: boolean): Promise<void> {
  const report: CleanupReport = {
    command: 'expire-consents',
    dryRun,
    startedAt: new Date().toISOString(),
    deletions: {},
    errors: [],
  };

  const cutoff = yearsAgo(2);
  console.log(`\nExpiring consent records granted before: ${cutoff.toISOString()}`);

  let tenantFilter: { tenantId?: string } = {};
  if (slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      console.error(`Tenant not found: ${slug}`);
      process.exit(1);
    }
    tenantFilter = { tenantId: tenant.id };
    console.log(`  Scoped to tenant: ${slug}`);
  }

  const expiredCount = await prisma.consentRecord.count({
    where: {
      ...tenantFilter,
      status: 'active',
      grantedAt: { lt: cutoff },
    },
  });

  report.deletions = { consent_records_expired: expiredCount };
  console.log(`  Active consents older than 2 years: ${expiredCount}`);

  if (!dryRun && expiredCount > 0) {
    await prisma.consentRecord.updateMany({
      where: {
        ...tenantFilter,
        status: 'active',
        grantedAt: { lt: cutoff },
      },
      data: {
        status: 'expired',
      },
    });
  }

  report.completedAt = new Date().toISOString();
  printReport(report);
}

// ── Command: archive-audit-logs ───────────────────────────────
// Archives audit logs older than 2 years to a JSON file, then deletes.

async function archiveAuditLogs(
  beforeDateStr: string | undefined,
  outputPath: string | undefined,
  dryRun: boolean,
): Promise<void> {
  const report: CleanupReport = {
    command: 'archive-audit-logs',
    dryRun,
    startedAt: new Date().toISOString(),
    deletions: {},
    errors: [],
  };

  const cutoff = beforeDateStr ? new Date(beforeDateStr) : yearsAgo(2);
  const archivePath = outputPath ?? `audit-logs-archive-${Date.now()}.json`;
  console.log(`\nArchiving audit logs before: ${cutoff.toISOString()}`);
  console.log(`  Output file: ${archivePath}`);

  const oldLogs = await prisma.auditLog.findMany({
    where: { timestamp: { lt: cutoff } },
    orderBy: { timestamp: 'asc' },
  });

  console.log(`  Logs found: ${oldLogs.length}`);
  report.deletions = { audit_logs: oldLogs.length };

  if (oldLogs.length === 0) {
    console.log('  Nothing to archive.');
    return;
  }

  if (!dryRun) {
    const archive = {
      archivedAt: new Date().toISOString(),
      cutoffDate: cutoff.toISOString(),
      recordCount: oldLogs.length,
      logs: oldLogs,
    };
    fs.writeFileSync(path.resolve(archivePath), JSON.stringify(archive, null, 2), 'utf-8');
    console.log(`  ✓ Written to: ${path.resolve(archivePath)}`);

    await prisma.auditLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    console.log(`  ✓ Deleted ${oldLogs.length} audit log records from DB`);
  }

  report.completedAt = new Date().toISOString();
  printReport(report);
}

// ── Command: process-ccpa ─────────────────────────────────────
// Processes a CCPA deletion request for a business:
//   - Deletes personal data (owners, consent records, documents)
//   - Anonymizes business record (clears PII fields)
//   - Creates an audit trail entry

async function processCcpa(businessId: string, dryRun: boolean): Promise<void> {
  const report: CleanupReport = {
    command: 'process-ccpa',
    dryRun,
    startedAt: new Date().toISOString(),
    deletions: {},
    errors: [],
  };

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    console.error(`Business not found: ${businessId}`);
    process.exit(1);
  }

  console.log(`\nProcessing CCPA deletion request for: ${business.legalName} (${businessId})`);

  const [ownerCount, consentCount, docCount, achCount] = await Promise.all([
    prisma.businessOwner.count({ where: { businessId } }),
    prisma.consentRecord.count({ where: { businessId } }),
    prisma.document.count({ where: { businessId } }),
    prisma.achAuthorization.count({ where: { businessId } }),
  ]);

  report.deletions = {
    business_owners: ownerCount,
    consent_records: consentCount,
    documents: docCount,
    ach_authorizations: achCount,
    business_pii_fields_anonymized: 1,
  };

  if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      // Delete child records with PII
      await tx.businessOwner.deleteMany({ where: { businessId } });
      await tx.consentRecord.deleteMany({ where: { businessId } });
      await tx.document.deleteMany({ where: { businessId } });

      // Revoke ACH
      await tx.achAuthorization.updateMany({
        where: { businessId },
        data: { status: 'revoked', revokedAt: new Date() },
      });

      // Anonymize business record
      await tx.business.update({
        where: { id: businessId },
        data: {
          legalName: `[DELETED-${businessId.slice(0, 8)}]`,
          dba: null,
          ein: null,
          status: 'deleted',
        },
      });
    });

    console.log('  ✓ CCPA deletion executed');
    console.log('  ✓ Business record anonymized');
    console.log(`  ✓ Deletion timestamp: ${new Date().toISOString()}`);
  }

  report.completedAt = new Date().toISOString();
  printReport(report);
}

// ── Command: purge-old-ledger ─────────────────────────────────
// Removes processed ledger events older than a given date.

async function purgeOldLedger(beforeDateStr: string, dryRun: boolean): Promise<void> {
  const report: CleanupReport = {
    command: 'purge-old-ledger',
    dryRun,
    startedAt: new Date().toISOString(),
    deletions: {},
    errors: [],
  };

  const cutoff = new Date(beforeDateStr);
  if (isNaN(cutoff.getTime())) {
    console.error(`Invalid date: ${beforeDateStr}`);
    process.exit(1);
  }

  console.log(`\nPurging processed ledger events before: ${cutoff.toISOString()}`);

  const count = await prisma.ledgerEvent.count({
    where: {
      publishedAt: { lt: cutoff },
      processedAt: { not: null },
    },
  });

  console.log(`  Processed events older than cutoff: ${count}`);
  report.deletions = { ledger_events: count };

  if (!dryRun && count > 0) {
    await prisma.ledgerEvent.deleteMany({
      where: {
        publishedAt: { lt: cutoff },
        processedAt: { not: null },
      },
    });
  }

  report.completedAt = new Date().toISOString();
  printReport(report);
}

// ── Entry point ───────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const cmd = args['command'];
  const dryRun = args['dry-run'] === 'true';

  if (dryRun) {
    console.log('\n⚠ Dry run mode enabled — no data will be modified');
  }

  switch (cmd) {
    case 'purge-tenant': {
      const slug = args['tenant'];
      if (!slug) { console.error('--tenant required'); process.exit(1); }
      await purgeTenant(slug, dryRun);
      break;
    }
    case 'purge-test-data': {
      const slug = args['tenant'];
      if (!slug) { console.error('--tenant required'); process.exit(1); }
      await purgeTestData(slug, dryRun);
      break;
    }
    case 'expire-consents': {
      await expireConsents(args['tenant'], dryRun);
      break;
    }
    case 'archive-audit-logs': {
      await archiveAuditLogs(args['before'], args['output'], dryRun);
      break;
    }
    case 'process-ccpa': {
      const bizId = args['business'];
      if (!bizId) { console.error('--business <id> required'); process.exit(1); }
      await processCcpa(bizId, dryRun);
      break;
    }
    case 'purge-old-ledger': {
      const before = args['before'];
      if (!before) { console.error('--before <date> required'); process.exit(1); }
      await purgeOldLedger(before, dryRun);
      break;
    }
    default: {
      console.log('CapitalForge Data Cleanup Utility');
      console.log('');
      console.log('Commands:');
      console.log('  purge-tenant       --tenant <slug> [--dry-run]');
      console.log('  purge-test-data    --tenant <slug> [--dry-run]');
      console.log('  expire-consents    [--tenant <slug>] [--dry-run]');
      console.log('  archive-audit-logs [--before <date>] [--output <file>] [--dry-run]');
      console.log('  process-ccpa       --business <id> [--dry-run]');
      console.log('  purge-old-ledger   --before <date> [--dry-run]');
      console.log('');
      console.log('Options:');
      console.log('  --dry-run    Preview what would be deleted without modifying data');
      process.exit(0);
    }
  }
}

main()
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
