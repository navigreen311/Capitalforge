// ============================================================
// Recovery tests are evidence, against a real database
//
// A recovery test is the artefact an auditor asks for: proof that a restore
// was actually attempted, by whom, and whether it met the objective. It lived
// in a process-local `Map`, which is the worst place for it — a drill that
// disappears on restart is indistinguishable from one nobody ran.
//
// Two assertions here are about persistence. The rest are about the things a
// table alone would not fix: who the record names, whether a "pass" actually
// met the recovery time objective, and what happens to a figure nobody
// measured.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  logRecoveryTest,
  listRecoveryTests,
  getRecoveryTest,
  getRtoRpoStatus,
  triggerBackup,
} from '../../src/backend/services/business-continuity.service';

const prisma = new PrismaClient();
const SUFFIX = `rt-${process.pid}-${Date.now()}`;
const TENANT = `tenant-${SUFFIX}`;
const OPERATOR = `user-${SUFFIX}`;

/** The RTO target the service measures against. */
const RTO_TARGET_MINUTES = 240;

const created: string[] = [];

async function log(over: Partial<Parameters<typeof logRecoveryTest>[0]> = {}) {
  const entry = await logRecoveryTest({
    tenantId: TENANT,
    testType: 'full_restore',
    startedAt: new Date('2026-03-01T00:00:00Z'),
    completedAt: new Date('2026-03-01T01:30:00Z'),
    outcome: 'pass',
    rtoAchievedMinutes: 90,
    performedBy: 'ops-team',
    loggedBy: OPERATOR,
    ...over,
  });
  created.push(entry.id);
  return entry;
}

beforeAll(async () => {
  await prisma.tenant.create({ data: { id: TENANT, name: `RT ${SUFFIX}`, slug: `rt-${SUFFIX}` } });
});

afterAll(async () => {
  await prisma.recoveryTest.deleteMany({ where: { tenantId: TENANT } });
  await prisma.backupRecord.deleteMany({ where: { tenantId: TENANT } });
  await prisma.tenant.deleteMany({ where: { id: TENANT } });
  await prisma.$disconnect();
});

describe('the record survives the process', () => {
  it('writes a row rather than a Map entry', async () => {
    const entry = await log();
    const row = await prisma.recoveryTest.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.testType).toBe('full_restore');
    expect(row.outcome).toBe('pass');
  });

  it('reads one back by id', async () => {
    const entry = await log({ testType: 'tabletop' });
    const found = await getRecoveryTest(entry.id);
    expect(found?.testType).toBe('tabletop');
  });
});

describe('who the record names', () => {
  it('keeps the operator and the recorder apart', async () => {
    // The old handler took one `testedBy` string from the request body, so the
    // log named whoever the caller said it named. A drill is often run by an
    // infrastructure engineer or an external vendor and recorded by somebody
    // else; collapsing the two loses which is which, and neither is evidence
    // on its own.
    const entry = await log({ performedBy: 'Acme DR Services', loggedBy: OPERATOR });
    const row = await prisma.recoveryTest.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.performedBy).toBe('Acme DR Services');
    expect(row.loggedBy).toBe(OPERATOR);
  });
});

describe('a pass is not the same as meeting the objective', () => {
  it('marks a slow pass as outside the RTO', async () => {
    // The case worth finding. A restore can succeed and still take longer than
    // the business agreed to tolerate, and an outcome alone cannot say so.
    const entry = await log({ outcome: 'pass', rtoAchievedMinutes: RTO_TARGET_MINUTES + 60 });
    expect(entry.outcome).toBe('pass');
    expect(entry.withinRto).toBe(false);
  });

  it('marks a fast pass as inside it', async () => {
    const entry = await log({ outcome: 'pass', rtoAchievedMinutes: 30 });
    expect(entry.withinRto).toBe(true);
  });

  it('reports null — not false — when nobody timed the restore', async () => {
    // The third state. `?? 9999` used to stand in for an unmeasured restore
    // time, so a drill that passed without anyone timing it reported the
    // objective as missed. Not measured and missed are different findings.
    const entry = await log({ outcome: 'pass', rtoAchievedMinutes: null });
    expect(entry.withinRto).toBeNull();
  });
});

describe('duration is derived, never stored', () => {
  it('computes it from the two timestamps', async () => {
    const entry = await log({
      startedAt: new Date('2026-03-02T00:00:00Z'),
      completedAt: new Date('2026-03-02T02:00:00Z'),
    });
    expect(entry.durationMinutes).toBe(120);
  });

  it('reports null when no end time was recorded', async () => {
    // A drill whose duration nobody wrote down and one that took no time are
    // different facts. Zero says the second.
    const entry = await log({ completedAt: null });
    expect(entry.durationMinutes).toBeNull();
  });

  it('has no stored duration column to disagree with them', async () => {
    // A stored duration is a third fact that can drift from the two it comes
    // from — and the one that drifts is the one an auditor reads.
    const entry = await log();
    const row = (await prisma.recoveryTest.findUniqueOrThrow({
      where: { id: entry.id },
    })) as Record<string, unknown>;
    expect(row).not.toHaveProperty('durationMinutes');
  });
});

describe('filtering and ordering', () => {
  it('filters by outcome', async () => {
    await log({ outcome: 'fail', rtoAchievedMinutes: null });
    const failing = await listRecoveryTests({ outcome: 'fail', tenantId: TENANT });
    expect(failing.length).toBeGreaterThanOrEqual(1);
    expect(failing.every((l) => l.outcome === 'fail')).toBe(true);
  });

  it('returns newest first', async () => {
    const rows = await listRecoveryTests({ tenantId: TENANT, limit: 10 });
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(rows[i]!.createdAt.getTime());
    }
  });
});

describe('the RTO/RPO status reads the table', () => {
  it('reports a last successful recovery that outlives the process', async () => {
    await triggerBackup('full', TENANT);
    const status = await getRtoRpoStatus(TENANT);

    // Previously computed from the Map, so this was forgotten on restart —
    // and it is exactly what gets asked for after one.
    expect(status.rtoTargetMinutes).toBe(RTO_TARGET_MINUTES);
    expect(typeof status.rtoMet).toBe('boolean');
    expect(typeof status.rtoMeasurable).toBe('boolean');
  });
});
