#!/usr/bin/env tsx
// ============================================================
// CapitalForge — Data Migration Utility
// Usage:
//   npx tsx scripts/migrate-data.ts export   --tenant <slug> --output <file.json>
//   npx tsx scripts/migrate-data.ts import   --source <file.json> --tenant <new-slug>
//   npx tsx scripts/migrate-data.ts transform --source <file.json> --from 1 --to 2 --output <file.json>
//   npx tsx scripts/migrate-data.ts validate  --source <file.json>
// ============================================================

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ── Types ─────────────────────────────────────────────────────

interface TenantExport {
  schemaVersion: number;
  exportedAt: string;
  sourceTenantId: string;
  sourceTenantSlug: string;
  tenant: Record<string, unknown>;
  users: Record<string, unknown>[];
  businesses: Record<string, unknown>[];
  businessOwners: Record<string, unknown>[];
  creditProfiles: Record<string, unknown>[];
  fundingRounds: Record<string, unknown>[];
  cardApplications: Record<string, unknown>[];
  consentRecords: Record<string, unknown>[];
  complianceChecks: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  suitabilityChecks: Record<string, unknown>[];
  achAuthorizations: Record<string, unknown>[];
  costCalculations: Record<string, unknown>[];
  statementRecords: Record<string, unknown>[];
  complaints: Record<string, unknown>[];
  partners: Record<string, unknown>[];
  ledgerEvents: Record<string, unknown>[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: Record<string, number>;
}

// ── CLI argument parsing ──────────────────────────────────────

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  if (args[0]) result['command'] = args[0];
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (key && args[i + 1] && !args[i + 1].startsWith('--')) {
      result[key] = args[i + 1];
    }
  }
  return result;
}

// ── Export ────────────────────────────────────────────────────

async function exportTenant(slug: string, outputPath: string): Promise<void> {
  console.log(`\nExporting tenant: ${slug}`);

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new Error(`Tenant not found: ${slug}`);
  }

  const tid = tenant.id;
  console.log(`  Tenant ID: ${tid}`);

  const [
    users,
    businesses,
  ] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: tid } }),
    prisma.business.findMany({ where: { tenantId: tid } }),
  ]);

  const bizIds = businesses.map((b) => b.id);

  const [
    businessOwners,
    creditProfiles,
    fundingRounds,
    cardApplications,
    consentRecords,
    complianceChecks,
    documents,
    suitabilityChecks,
    achAuthorizations,
    costCalculations,
    statementRecords,
    complaints,
    partners,
    ledgerEvents,
  ] = await Promise.all([
    prisma.businessOwner.findMany({ where: { businessId: { in: bizIds } } }),
    prisma.creditProfile.findMany({ where: { businessId: { in: bizIds } } }),
    prisma.fundingRound.findMany({ where: { businessId: { in: bizIds } } }),
    prisma.cardApplication.findMany({ where: { businessId: { in: bizIds } } }),
    prisma.consentRecord.findMany({ where: { tenantId: tid } }),
    prisma.complianceCheck.findMany({ where: { tenantId: tid } }),
    prisma.document.findMany({ where: { tenantId: tid } }),
    prisma.suitabilityCheck.findMany({ where: { businessId: { in: bizIds } } }),
    prisma.achAuthorization.findMany({ where: { businessId: { in: bizIds } } }),
    prisma.costCalculation.findMany({ where: { businessId: { in: bizIds } } }),
    prisma.statementRecord.findMany({ where: { tenantId: tid } }),
    prisma.complaint.findMany({ where: { tenantId: tid } }),
    prisma.partner.findMany({ where: { tenantId: tid } }),
    prisma.ledgerEvent.findMany({ where: { tenantId: tid } }),
  ]);

  const exportData: TenantExport = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    sourceTenantId: tid,
    sourceTenantSlug: slug,
    tenant: tenant as unknown as Record<string, unknown>,
    users: users as unknown as Record<string, unknown>[],
    businesses: businesses as unknown as Record<string, unknown>[],
    businessOwners: businessOwners as unknown as Record<string, unknown>[],
    creditProfiles: creditProfiles as unknown as Record<string, unknown>[],
    fundingRounds: fundingRounds as unknown as Record<string, unknown>[],
    cardApplications: cardApplications as unknown as Record<string, unknown>[],
    consentRecords: consentRecords as unknown as Record<string, unknown>[],
    complianceChecks: complianceChecks as unknown as Record<string, unknown>[],
    documents: documents as unknown as Record<string, unknown>[],
    suitabilityChecks: suitabilityChecks as unknown as Record<string, unknown>[],
    achAuthorizations: achAuthorizations as unknown as Record<string, unknown>[],
    costCalculations: costCalculations as unknown as Record<string, unknown>[],
    statementRecords: statementRecords as unknown as Record<string, unknown>[],
    complaints: complaints as unknown as Record<string, unknown>[],
    partners: partners as unknown as Record<string, unknown>[],
    ledgerEvents: ledgerEvents as unknown as Record<string, unknown>[],
  };

  const absPath = path.resolve(outputPath);
  fs.writeFileSync(absPath, JSON.stringify(exportData, null, 2), 'utf-8');

  console.log('\nExport complete:');
  console.log(`  Output file  : ${absPath}`);
  console.log(`  Users        : ${users.length}`);
  console.log(`  Businesses   : ${businesses.length}`);
  console.log(`  Applications : ${cardApplications.length}`);
  console.log(`  Events       : ${ledgerEvents.length}`);
}

// ── Validate ─────────────────────────────────────────────────

function validateExport(data: TenantExport): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!data.schemaVersion) errors.push('Missing schemaVersion');
  if (!data.sourceTenantId) errors.push('Missing sourceTenantId');
  if (!data.tenant) errors.push('Missing tenant object');

  // Array checks
  const arrays: (keyof TenantExport)[] = [
    'users', 'businesses', 'businessOwners', 'creditProfiles',
    'fundingRounds', 'cardApplications', 'consentRecords',
    'complianceChecks', 'documents', 'suitabilityChecks',
    'achAuthorizations', 'costCalculations', 'statementRecords',
    'complaints', 'partners', 'ledgerEvents',
  ];
  for (const arr of arrays) {
    if (!Array.isArray(data[arr])) {
      errors.push(`${String(arr)} must be an array`);
    }
  }

  // Business-level referential integrity
  const bizIds = new Set((data.businesses || []).map((b) => (b as { id: string }).id));
  const orphanedOwners = (data.businessOwners || []).filter(
    (o) => !bizIds.has((o as { businessId: string }).businessId),
  );
  if (orphanedOwners.length > 0) {
    errors.push(`${orphanedOwners.length} orphaned businessOwners found`);
  }

  const orphanedProfiles = (data.creditProfiles || []).filter(
    (p) => !bizIds.has((p as { businessId: string }).businessId),
  );
  if (orphanedProfiles.length > 0) {
    errors.push(`${orphanedProfiles.length} orphaned creditProfiles found`);
  }

  // Warn on empty datasets
  if ((data.users || []).length === 0) warnings.push('No users in export');
  if ((data.businesses || []).length === 0) warnings.push('No businesses in export');
  if ((data.consentRecords || []).length === 0) warnings.push('No consent records — verify compliance data completeness');

  const stats: Record<string, number> = {};
  for (const arr of arrays) {
    stats[String(arr)] = Array.isArray(data[arr]) ? (data[arr] as unknown[]).length : 0;
  }

  return { valid: errors.length === 0, errors, warnings, stats };
}

// ── Import ────────────────────────────────────────────────────

async function importTenant(sourcePath: string, newTenantSlug: string): Promise<void> {
  console.log(`\nImporting into tenant: ${newTenantSlug}`);
  console.log(`Source file: ${sourcePath}`);

  const rawData = fs.readFileSync(path.resolve(sourcePath), 'utf-8');
  const data = JSON.parse(rawData) as TenantExport;

  // Validate before import
  const validation = validateExport(data);
  if (!validation.valid) {
    console.error('\nValidation failed:');
    validation.errors.forEach((e) => console.error(`  ✗ ${e}`));
    throw new Error('Import aborted due to validation errors');
  }
  if (validation.warnings.length > 0) {
    console.warn('\nValidation warnings:');
    validation.warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  }
  console.log('  ✓ Validation passed');

  // Build ID remapping tables
  const idMap = new Map<string, string>();
  const remap = (oldId: string): string => {
    if (!idMap.has(oldId)) {
      idMap.set(oldId, randomUUID());
    }
    return idMap.get(oldId)!;
  };

  const sourceTenantId = data.sourceTenantId;
  const newTenantId = randomUUID();
  idMap.set(sourceTenantId, newTenantId);

  // Pre-map all business and user IDs
  for (const biz of data.businesses) {
    remap((biz as { id: string }).id);
  }
  for (const user of data.users) {
    remap((user as { id: string }).id);
  }

  await prisma.$transaction(async (tx) => {
    // Tenant
    const tenantSrc = data.tenant as {
      name: string; plan: string; isActive: boolean; brandConfig: unknown;
    };
    await tx.tenant.create({
      data: {
        id: newTenantId,
        name: `${tenantSrc.name} (Imported)`,
        slug: newTenantSlug,
        plan: tenantSrc.plan || 'starter',
        isActive: tenantSrc.isActive ?? true,
        brandConfig: (tenantSrc.brandConfig as Record<string, unknown>) || {},
      },
    });
    console.log(`  ✓ Tenant created: ${newTenantSlug} (${newTenantId})`);

    // Users
    for (const u of data.users) {
      const user = u as {
        id: string; email: string; passwordHash?: string;
        firstName: string; lastName: string; role: string;
        mfaEnabled: boolean; isActive: boolean;
      };
      await tx.user.create({
        data: {
          id: remap(user.id),
          tenantId: newTenantId,
          email: user.email,
          passwordHash: user.passwordHash,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          mfaEnabled: user.mfaEnabled,
          isActive: user.isActive,
        },
      });
    }
    console.log(`  ✓ Users: ${data.users.length}`);

    // Businesses
    for (const b of data.businesses) {
      const biz = b as {
        id: string; advisorId?: string; legalName: string; dba?: string; ein?: string;
        entityType: string; stateOfFormation?: string; dateOfFormation?: string;
        mcc?: string; industry?: string; annualRevenue?: string; monthlyRevenue?: string;
        fundingReadinessScore?: number; status: string;
      };
      await tx.business.create({
        data: {
          id: remap(biz.id),
          tenantId: newTenantId,
          advisorId: biz.advisorId ? idMap.get(biz.advisorId) : undefined,
          legalName: biz.legalName,
          dba: biz.dba,
          ein: biz.ein,
          entityType: biz.entityType,
          stateOfFormation: biz.stateOfFormation,
          dateOfFormation: biz.dateOfFormation ? new Date(biz.dateOfFormation) : undefined,
          mcc: biz.mcc,
          industry: biz.industry,
          annualRevenue: biz.annualRevenue ? biz.annualRevenue : undefined,
          monthlyRevenue: biz.monthlyRevenue ? biz.monthlyRevenue : undefined,
          fundingReadinessScore: biz.fundingReadinessScore,
          status: biz.status,
        },
      });
    }
    console.log(`  ✓ Businesses: ${data.businesses.length}`);

    // Business owners
    for (const o of data.businessOwners) {
      const owner = o as {
        id: string; businessId: string; firstName: string; lastName: string;
        ownershipPercent: string; ssn?: string; dateOfBirth?: string;
        address?: unknown; isBeneficialOwner: boolean; kycStatus: string;
        kycVerifiedAt?: string;
      };
      const newBizId = idMap.get(owner.businessId);
      if (!newBizId) continue;
      await tx.businessOwner.create({
        data: {
          id: remap(owner.id),
          businessId: newBizId,
          firstName: owner.firstName,
          lastName: owner.lastName,
          ownershipPercent: owner.ownershipPercent,
          dateOfBirth: owner.dateOfBirth ? new Date(owner.dateOfBirth) : undefined,
          address: owner.address as Record<string, unknown> || {},
          isBeneficialOwner: owner.isBeneficialOwner,
          kycStatus: owner.kycStatus,
          kycVerifiedAt: owner.kycVerifiedAt ? new Date(owner.kycVerifiedAt) : undefined,
        },
      });
    }
    console.log(`  ✓ Business owners: ${data.businessOwners.length}`);

    // Consent records
    for (const c of data.consentRecords) {
      const consent = c as {
        id: string; businessId?: string; channel: string; consentType: string;
        status: string; grantedAt: string; revokedAt?: string;
        revocationReason?: string; ipAddress?: string; evidenceRef?: string;
        metadata?: unknown;
      };
      await tx.consentRecord.create({
        data: {
          id: remap(consent.id),
          tenantId: newTenantId,
          businessId: consent.businessId ? idMap.get(consent.businessId) : undefined,
          channel: consent.channel,
          consentType: consent.consentType,
          status: consent.status,
          grantedAt: new Date(consent.grantedAt),
          revokedAt: consent.revokedAt ? new Date(consent.revokedAt) : undefined,
          revocationReason: consent.revocationReason,
          ipAddress: consent.ipAddress,
          evidenceRef: consent.evidenceRef,
          metadata: consent.metadata as Record<string, unknown> || {},
        },
      });
    }
    console.log(`  ✓ Consent records: ${data.consentRecords.length}`);

    // Compliance checks
    for (const cc of data.complianceChecks) {
      const check = cc as {
        id: string; businessId?: string; checkType: string; riskScore?: number;
        riskLevel?: string; findings?: unknown; stateJurisdiction?: string;
        resolvedAt?: string; createdAt: string;
      };
      await tx.complianceCheck.create({
        data: {
          id: remap(check.id),
          tenantId: newTenantId,
          businessId: check.businessId ? idMap.get(check.businessId) : undefined,
          checkType: check.checkType,
          riskScore: check.riskScore,
          riskLevel: check.riskLevel,
          findings: check.findings as Record<string, unknown> || {},
          stateJurisdiction: check.stateJurisdiction,
          resolvedAt: check.resolvedAt ? new Date(check.resolvedAt) : undefined,
          createdAt: new Date(check.createdAt),
        },
      });
    }
    console.log(`  ✓ Compliance checks: ${data.complianceChecks.length}`);

    console.log('\n  Import transaction complete — all records written.');
  });

  console.log(`\n✅ Import complete → tenant: ${newTenantSlug}`);
}

// ── Transform ─────────────────────────────────────────────────

async function transformData(
  sourcePath: string,
  fromVersion: number,
  toVersion: number,
  outputPath: string,
): Promise<void> {
  console.log(`\nTransforming schema v${fromVersion} → v${toVersion}`);

  const rawData = fs.readFileSync(path.resolve(sourcePath), 'utf-8');
  const data = JSON.parse(rawData) as TenantExport;

  if (data.schemaVersion !== fromVersion) {
    throw new Error(
      `Source schema version mismatch: expected v${fromVersion}, got v${data.schemaVersion}`,
    );
  }

  let transformed = { ...data };

  if (fromVersion === 1 && toVersion === 2) {
    // v1→v2: add fundingReadinessScore default, normalize entityType to lowercase
    transformed = {
      ...data,
      schemaVersion: 2,
      businesses: data.businesses.map((b) => {
        const biz = b as { entityType?: string; fundingReadinessScore?: number };
        return {
          ...b,
          entityType: biz.entityType?.toLowerCase() ?? 'llc',
          fundingReadinessScore: biz.fundingReadinessScore ?? 0,
        };
      }),
    };
    console.log('  ✓ Applied v1→v2 transformations: entityType normalization, fundingReadinessScore default');
  } else {
    throw new Error(`No transform defined for v${fromVersion}→v${toVersion}`);
  }

  const absOutput = path.resolve(outputPath);
  fs.writeFileSync(absOutput, JSON.stringify(transformed, null, 2), 'utf-8');
  console.log(`\n✅ Transformed data written to: ${absOutput}`);
}

// ── Validate command ──────────────────────────────────────────

function validateCommand(sourcePath: string): void {
  console.log(`\nValidating: ${sourcePath}`);
  const rawData = fs.readFileSync(path.resolve(sourcePath), 'utf-8');
  const data = JSON.parse(rawData) as TenantExport;
  const result = validateExport(data);

  if (result.errors.length > 0) {
    console.error('\nErrors:');
    result.errors.forEach((e) => console.error(`  ✗ ${e}`));
  }
  if (result.warnings.length > 0) {
    console.warn('\nWarnings:');
    result.warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  }

  console.log('\nRecord counts:');
  Object.entries(result.stats).forEach(([key, count]) => {
    console.log(`  ${key.padEnd(22)} ${count}`);
  });

  if (result.valid) {
    console.log('\n✅ Validation passed');
  } else {
    console.error('\n✗ Validation failed');
    process.exit(1);
  }
}

// ── Entry point ───────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const cmd = args['command'];

  if (cmd === 'export') {
    const slug = args['tenant'];
    const output = args['output'];
    if (!slug || !output) {
      console.error('Usage: migrate-data.ts export --tenant <slug> --output <file.json>');
      process.exit(1);
    }
    await exportTenant(slug, output);
  } else if (cmd === 'import') {
    const source = args['source'];
    const tenant = args['tenant'];
    if (!source || !tenant) {
      console.error('Usage: migrate-data.ts import --source <file.json> --tenant <new-slug>');
      process.exit(1);
    }
    await importTenant(source, tenant);
  } else if (cmd === 'transform') {
    const source = args['source'];
    const from = parseInt(args['from'] || '0', 10);
    const to = parseInt(args['to'] || '0', 10);
    const output = args['output'];
    if (!source || !from || !to || !output) {
      console.error('Usage: migrate-data.ts transform --source <file.json> --from 1 --to 2 --output <file.json>');
      process.exit(1);
    }
    await transformData(source, from, to, output);
  } else if (cmd === 'validate') {
    const source = args['source'];
    if (!source) {
      console.error('Usage: migrate-data.ts validate --source <file.json>');
      process.exit(1);
    }
    validateCommand(source);
  } else {
    console.log('CapitalForge Data Migration Utility');
    console.log('');
    console.log('Commands:');
    console.log('  export    --tenant <slug> --output <file.json>');
    console.log('  import    --source <file.json> --tenant <new-slug>');
    console.log('  transform --source <file.json> --from 1 --to 2 --output <file.json>');
    console.log('  validate  --source <file.json>');
    process.exit(0);
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
