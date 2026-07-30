// ============================================================
// PostgreSQL datasource — integration tests
//
// These run against a real database (the CI integration job provisions
// postgres:16-alpine and applies migrations first). Everything else in this
// repository mocks Prisma, so nothing else would notice if the datasource
// stopped behaving the way the code assumes.
//
// What is asserted here is specifically the behaviour that is NOT available
// on SQLite, and that six queries were rewritten to avoid while the schema
// still declared `provider = "sqlite"`:
//
//   - JSONB `path` filters, in both `findMany` and `updateMany`
//   - `mode: 'insensitive'` on `equals` — SQLite's `=` is case-sensitive and
//     no flag could express this, so the predicate had moved into app code
//   - `mode: 'insensitive'` on `contains`
//
// A regression that put the schema back on a provider without these features
// would fail here rather than at runtime in front of a user.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Unique per run so repeated runs against the same database do not collide.
const SUFFIX = `it-${process.pid}-${Date.now()}`;

let tenantId: string;
let businessId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `Integration Tenant ${SUFFIX}`, slug: `integration-${SUFFIX}` },
  });
  tenantId = tenant.id;

  const business = await prisma.business.create({
    data: { tenantId, legalName: `Integration Business ${SUFFIX}`, entityType: 'llc' },
  });
  businessId = business.id;
});

afterAll(async () => {
  // Children first — the schema has real foreign keys on PostgreSQL.
  await prisma.document.deleteMany({ where: { businessId } });
  await prisma.achAuthorization.deleteMany({ where: { businessId } });
  await prisma.consentRecord.deleteMany({ where: { businessId } });
  await prisma.aiDecisionLog.deleteMany({ where: { tenantId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('PostgreSQL datasource', () => {
  it('reports postgres as the active provider', async () => {
    const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
    expect(rows[0]?.version).toMatch(/PostgreSQL/i);
  });

  it('stores Json columns as jsonb', async () => {
    const rows = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'ai_decision_logs' AND column_name = 'output'
    `;
    // jsonb is what makes the path filters below indexable and possible.
    expect(rows[0]?.data_type).toBe('jsonb');
  });
});

describe('JSONB path filters', () => {
  it('filters a findMany by a nested JSON property', async () => {
    await prisma.aiDecisionLog.create({
      data: {
        tenantId,
        moduleSource: 'integration-test',
        decisionType: 'path-filter',
        output: { businessId, verdict: 'ok' } as Prisma.InputJsonValue,
      },
    });
    await prisma.aiDecisionLog.create({
      data: {
        tenantId,
        moduleSource: 'integration-test',
        decisionType: 'path-filter',
        output: { businessId: 'some-other-business', verdict: 'ok' } as Prisma.InputJsonValue,
      },
    });

    const matched = await prisma.aiDecisionLog.findMany({
      where: { tenantId, output: { path: ['businessId'], equals: businessId } },
    });

    // The point of the filter is that it discriminates — both rows belong to
    // the tenant, so a filter that silently matched everything would pass a
    // weaker assertion.
    expect(matched).toHaveLength(1);
    expect((matched[0].output as Record<string, unknown>).businessId).toBe(businessId);
  });

  it('filters an updateMany by a nested JSON property', async () => {
    await prisma.document.create({
      data: {
        tenantId,
        businessId,
        documentType: 'contract',
        title: 'target',
        storageKey: `${SUFFIX}/target.pdf`,
        metadata: { envelopeId: `env-${SUFFIX}` } as Prisma.InputJsonValue,
      },
    });
    await prisma.document.create({
      data: {
        tenantId,
        businessId,
        documentType: 'contract',
        title: 'bystander',
        storageKey: `${SUFFIX}/bystander.pdf`,
        metadata: { envelopeId: 'env-unrelated' } as Prisma.InputJsonValue,
      },
    });

    const result = await prisma.document.updateMany({
      where: {
        documentType: 'contract',
        metadata: { path: ['envelopeId'], equals: `env-${SUFFIX}` },
      },
      data: { title: 'updated-by-path-filter' },
    });

    expect(result.count).toBe(1);

    const bystander = await prisma.document.findFirst({
      where: { businessId, title: 'bystander' },
    });
    expect(bystander).not.toBeNull();
  });
});

describe('case-insensitive matching', () => {
  beforeAll(async () => {
    await prisma.achAuthorization.create({
      data: {
        businessId,
        processorName: 'Rapid Capital ACH',
        status: 'active',
        authorizedAt: new Date(),
      },
    });
  });

  it('matches equals regardless of case', async () => {
    // This is the one SQLite could not express at all: its `=` is
    // case-sensitive, so the predicate had to be evaluated in application
    // code after reading every active authorization for the business.
    const found = await prisma.achAuthorization.findFirst({
      where: {
        businessId,
        status: 'active',
        processorName: { equals: 'rapid capital ach', mode: 'insensitive' },
      },
    });

    expect(found).not.toBeNull();
    expect(found?.processorName).toBe('Rapid Capital ACH');
  });

  it('still discriminates on a genuinely different value', async () => {
    const found = await prisma.achAuthorization.findFirst({
      where: {
        businessId,
        status: 'active',
        processorName: { equals: 'rogue mca llc', mode: 'insensitive' },
      },
    });

    expect(found).toBeNull();
  });

  it('matches contains regardless of case', async () => {
    const found = await prisma.achAuthorization.findMany({
      where: { businessId, processorName: { contains: 'RAPID', mode: 'insensitive' } },
    });

    expect(found).toHaveLength(1);
  });
});
