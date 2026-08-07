// ============================================================
// Backup tracking, against a real database
//
// These lived in tests/unit/services/integration-layer.test.ts while backup
// records were held in a process-local Map. Persisting them to
// `backup_records` — the point of the change — made these integration tests,
// and the CI unit job has no Postgres service, so they belong here.
//
// Moved rather than mocked. A mock Prisma would have kept them green in the
// unit job while testing a store that no longer exists, which is the same
// shape as the seeder that reported seven days of successful backups nobody
// had run.
// ============================================================

import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  triggerBackup,
  listBackups,
  getRtoRpoStatus,
  purgeExpiredBackups,
} from '../../src/backend/services/business-continuity.service';

const prisma = new PrismaClient();

const SUFFIX = `bk-${process.pid}-${Date.now()}`;
const T1 = `tenant-${SUFFIX}-1`;
const T2 = `tenant-${SUFFIX}-2`;

afterAll(async () => {
  await prisma.backupRecord.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await prisma.$disconnect();
});

// ============================================================
// BUSINESS CONTINUITY — BACKUP TRACKING
// ============================================================

describe('Backup tracking', () => {
  it('triggers a backup and returns running record', async () => {
    const record = await triggerBackup('incremental', T1);
    expect(record.backupType).toBe('incremental');
    expect(record.tenantId).toBe(T1);
    expect(record.retentionDays).toBe(90);
    expect(record.storageLocation).toMatch(/^s3:/);
  });

  it('lists backups and returns newest first', async () => {
    await triggerBackup('full');
    await triggerBackup('incremental');
    const records = await listBackups({ limit: 10 });
    expect(records.length).toBeGreaterThanOrEqual(2);
    // Newest first
    expect(records[0].createdAt.getTime()).toBeGreaterThanOrEqual(records[1].createdAt.getTime());
  });

  it('returns RTO/RPO status', async () => {
    const status = await getRtoRpoStatus();
    expect(typeof status.rtoTargetMinutes).toBe('number');
    expect(typeof status.rpoTargetMinutes).toBe('number');
    expect(typeof status.rpoBreached).toBe('boolean');
  });

  it('purges expired backups', async () => {
    // Expired on the row, not on a returned object. The previous version
    // mutated the record the service handed back and asserted `purged >= 0`,
    // which passed whether anything was purged or not — and would have gone on
    // passing after the store moved to the database, against a row it never
    // touched.
    const record = await triggerBackup('snapshot', T2);
    await prisma.backupRecord.update({
      where: { id: record.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const { purged } = await purgeExpiredBackups();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await prisma.backupRecord.findUnique({ where: { id: record.id } })).toBeNull();
  });
});
