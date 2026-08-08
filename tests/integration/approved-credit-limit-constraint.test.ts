// ============================================================
// approved_limit_requires_approval — the CHECK constraint Prisma cannot see
//
// WHY THIS TEST EXISTS
//
// card_applications carries a CHECK constraint:
//
//   CHECK ("approvedCreditLimit" IS NULL OR status = 'approved')
//
// Prisma's schema language cannot express CHECK constraints. The constraint
// lives only in the migration, and `prisma migrate diff` cannot see it — so a
// future generated migration could drop it and every other test would still
// pass. This test is the thing that fails instead.
//
// If you are here because this test broke after a schema change: the
// constraint is gone, not the test. Put it back, or decide deliberately that
// a granted credit limit may sit on a declined application.
//
//   constraint: approved_limit_requires_approval
//   migration:  prisma/migrations/20260808150000_card_application_approved_credit_limit
//   column doc: prisma/schema.prisma, CardApplication.approvedCreditLimit
//
// WHAT IT IS GUARDING AGAINST
//
// CardApplication.creditLimit holds the amount REQUESTED at draft. It is
// populated on declined applications — 20000 on a Bank of America decline,
// 18000 on US Bank, 12000 on Wells Fargo — none of which was granted.
// approvedCreditLimit exists so an average limit has a real source; a granted
// limit sitting on a decline would recreate exactly the problem it was added
// to solve, one column over.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

let businessId: string;
const created: string[] = [];

beforeAll(async () => {
  const business = await prisma.business.findFirst({ select: { id: true } });
  if (!business) throw new Error('no business on record — seed the database first');
  businessId = business.id;
});

afterAll(async () => {
  if (created.length > 0) {
    await prisma.cardApplication.deleteMany({ where: { id: { in: created } } });
  }
  await prisma.$disconnect();
});

async function attempt(status: string, approvedCreditLimit: number | null): Promise<'accepted' | 'rejected'> {
  try {
    const row = await prisma.cardApplication.create({
      data: {
        businessId,
        issuer: 'Chase',
        cardProduct: 'constraint-test',
        status,
        approvedCreditLimit:
          approvedCreditLimit === null ? null : new Prisma.Decimal(approvedCreditLimit),
      },
      select: { id: true },
    });
    created.push(row.id);
    return 'accepted';
  } catch {
    return 'rejected';
  }
}

describe('approved_limit_requires_approval', () => {
  it('accepts a granted limit on an approved application', async () => {
    expect(await attempt('approved', 25_000)).toBe('accepted');
  });

  it('accepts a null limit on any status', async () => {
    // An approval recorded without a limit is normal — the column is nullable
    // on purpose, so "not recorded" stays distinguishable from a limit of zero.
    expect(await attempt('declined', null)).toBe('accepted');
    expect(await attempt('submitted', null)).toBe('accepted');
  });

  it('REJECTS a granted limit on a declined application', async () => {
    // The defect the column was added to end. If this starts passing, the
    // constraint has been dropped.
    expect(await attempt('declined', 20_000)).toBe('rejected');
  });

  it('REJECTS a granted limit on a submitted application', async () => {
    // Not yet decided, so there is no granted limit to record.
    expect(await attempt('submitted', 15_000)).toBe('rejected');
  });

  it('REJECTS a granted limit on a draft', async () => {
    expect(await attempt('draft', 10_000)).toBe('rejected');
  });
});
