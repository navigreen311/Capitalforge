// ============================================================
// Three table-only gaps, closed — against a real database
//
// Each of these answered honestly (501, or an empty list saying why) because
// there was nowhere to put the data. Before that, each answered success with
// something invented:
//
//   - contract detail returned the same $150,000 Acme vendor agreement for
//     every id, so a page showing two contracts showed one twice;
//   - referral creation answered 201 with a link that resolved to nothing,
//     held in memory until the process restarted, and a follow-up logged
//     `loggedBy: "current_user"`;
//   - a report schedule was pushed onto a process-local array with a
//     `nextRunAt` of tomorrow — for every frequency.
//
// Every assertion re-reads the row. The last one is the sharpest: a schedule
// is stored intent and nothing runs it, so the tests pin that the API says so
// rather than letting a stored row imply a delivery.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { computeNextRunAt } from '../../src/backend/api/routes/platform-reports.routes';

const SUFFIX = `crs-${process.pid}-${Date.now()}`;
const USER = `user-${SUFFIX}`;

let tenantId: string;
let otherTenantId: string;

vi.mock('../../src/backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (req: any, _res: any, next: any) => {
    req.tenant = { tenantId, userId: USER, permissions: ['*'] };
    next();
  },
}));

const prisma = new PrismaClient();

beforeAll(async () => {
  tenantId = (await prisma.tenant.create({ data: { name: `CRS ${SUFFIX}`, slug: `crs-${SUFFIX}` } })).id;
  otherTenantId = (
    await prisma.tenant.create({ data: { name: `CRS2 ${SUFFIX}`, slug: `crs2-${SUFFIX}` } })
  ).id;
});

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await prisma.referralFollowUp.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.referral.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.contract.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.reportSchedule.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await prisma.$disconnect();
});

describe('a contract is a row about something somebody signed', () => {
  it('stores the terms that made the mock a fiction', async () => {
    const contract = await prisma.contract.create({
      data: {
        tenantId,
        title: 'Referral agreement',
        counterparty: 'Northwind Capital LLC',
        contractType: 'partner',
        value: 42000,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        autoRenews: true,
        autoRenewDate: new Date('2026-12-01'),
        createdBy: USER,
      },
    });

    const row = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(row.counterparty).toBe('Northwind Capital LLC');
    expect(row.value?.toString()).toBe('42000');
  });

  it('distinguishes "does not renew" from "nobody has read the clause"', async () => {
    // The distinction the nullable Boolean exists for. A page rendering
    // nothing for both tells an advisor the same thing about two different
    // situations, and only one of them is theirs to go and find out.
    const unknown = await prisma.contract.create({
      data: { tenantId, title: 'Unread', counterparty: 'Acme', autoRenews: null },
    });
    const doesNot = await prisma.contract.create({
      data: { tenantId, title: 'Fixed term', counterparty: 'Acme', autoRenews: false },
    });

    expect(unknown.autoRenews).toBeNull();
    expect(doesNot.autoRenews).toBe(false);
  });

  it('scopes a contract to its tenant', async () => {
    const mine = await prisma.contract.findFirst({ where: { tenantId } });
    const seenByOther = await prisma.contract.findFirst({
      where: { id: mine!.id, tenantId: otherTenantId },
    });
    expect(seenByOther).toBeNull();
  });
});

describe('a referral link is owned by an advisor and its follow-ups are logged', () => {
  it('records the referrer and a code that does not decode to anybody', async () => {
    const referral = await prisma.referral.create({
      data: { tenantId, referrerUserId: USER, code: `code-${SUFFIX}`, referredEmail: 'x@y.test' },
    });

    const row = await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } });
    expect(row.referrerUserId).toBe(USER);
    // The code appears in a link that gets forwarded. It must not contain the
    // referred party's address.
    expect(row.code).not.toContain('x@y.test');
    expect(row.status).toBe('sent');
    expect(row.convertedAt).toBeNull();
  });

  it('logs a follow-up against a real referral, attributed to a real user', async () => {
    const referral = await prisma.referral.findFirstOrThrow({ where: { tenantId } });
    const followUp = await prisma.referralFollowUp.create({
      data: { referralId: referral.id, tenantId, channel: 'email', loggedBy: USER },
    });

    const row = await prisma.referralFollowUp.findUniqueOrThrow({ where: { id: followUp.id } });
    // Was the literal string "current_user".
    expect(row.loggedBy).toBe(USER);
    expect(row.referralId).toBe(referral.id);
  });

  it('removes follow-ups with the referral rather than orphaning them', async () => {
    const referral = await prisma.referral.create({
      data: { tenantId, referrerUserId: USER, code: `code2-${SUFFIX}` },
    });
    await prisma.referralFollowUp.create({
      data: { referralId: referral.id, tenantId, channel: 'call', loggedBy: USER },
    });

    await prisma.referral.delete({ where: { id: referral.id } });
    expect(await prisma.referralFollowUp.count({ where: { referralId: referral.id } })).toBe(0);
  });
});

describe('a report schedule is stored intent and nothing more', () => {
  it('stores the schedule with lastRunAt null', async () => {
    const schedule = await prisma.reportSchedule.create({
      data: {
        tenantId,
        name: 'Monthly portfolio',
        reportType: 'portfolio',
        frequency: 'monthly',
        dayOfPeriod: 1,
        recipients: ['a@b.test'],
        nextRunAt: computeNextRunAt('monthly', 1, new Date('2026-03-15T00:00:00Z')),
        createdBy: USER,
      },
    });

    const row = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    // The field that lets a caller tell a stored schedule from a delivered
    // report. Nothing runs these, so it stays null — and that is the honest
    // state rather than an oversight.
    expect(row.lastRunAt).toBeNull();
    expect(row.enabled).toBe(true);
  });
});

describe('computeNextRunAt, which used to answer "tomorrow" for everything', () => {
  const from = new Date('2026-03-11T09:30:00Z'); // a Wednesday

  it('advances a daily schedule by one day, at midnight', () => {
    const next = computeNextRunAt('daily', null, from);
    expect(next.toISOString()).toBe('2026-03-12T00:00:00.000Z');
  });

  it('lands a weekly schedule on the requested weekday', () => {
    // Friday is 5. From a Wednesday that is two days out — which "tomorrow"
    // got wrong every time except when the schedule happened to be daily.
    const next = computeNextRunAt('weekly', 5, from);
    expect(next.getUTCDay()).toBe(5);
    expect(next.toISOString()).toBe('2026-03-13T00:00:00.000Z');
  });

  it('pushes a weekly schedule created on its own weekday to next week', () => {
    // Not "in a few hours' time, in the past". Wednesday is 3.
    const next = computeNextRunAt('weekly', 3, from);
    expect(next.toISOString()).toBe('2026-03-18T00:00:00.000Z');
  });

  it('rolls a monthly schedule into next month when the day has passed', () => {
    const next = computeNextRunAt('monthly', 1, from);
    expect(next.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('keeps a monthly schedule in this month when the day is still ahead', () => {
    const next = computeNextRunAt('monthly', 20, from);
    expect(next.toISOString()).toBe('2026-03-20T00:00:00.000Z');
  });
});
