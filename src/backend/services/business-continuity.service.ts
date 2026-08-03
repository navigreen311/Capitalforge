// ============================================================
// CapitalForge — Business Continuity / DR Service
// Automated backup tracking, RTO/RPO monitoring,
// one-click client case export, recovery testing log.
// ============================================================

import { v4 as uuidv4 } from 'uuid';

// ── Types ────────────────────────────────────────────────────

export type BackupType    = 'full' | 'incremental' | 'snapshot';
export type BackupStatus  = 'pending' | 'running' | 'completed' | 'failed';

export interface BackupRecord {
  id:              string;
  tenantId?:       string;    // null = platform-wide backup
  backupType:      BackupType;
  status:          BackupStatus;
  sizeBytes?:      bigint;
  storageLocation?: string;
  retentionDays:   number;
  expiresAt?:      Date;
  createdAt:       Date;
  completedAt?:    Date;
  errorMessage?:   string;
  checksum?:       string;
}

export interface RtoRpoStatus {
  lastBackupAt?:            Date;
  lastSuccessfulRecoveryAt?: Date;
  rtoTargetMinutes:         number;   // Recovery Time Objective
  rpoTargetMinutes:         number;   // Recovery Point Objective
  currentRpoMinutes?:       number;   // time since last backup
  rpoBreached:              boolean;
  /** False when no backup exists to measure against, so a caller can tell
   *  "inside the objective" from "nothing to measure". */
  rpoMeasurable:            boolean;
  rtoLastTestedMinutes?:    number;
  rtoMet:                   boolean;
}

export interface CaseExportResult {
  exportId:      string;
  businessId:    string;
  tenantId:      string;
  includedFiles: string[];
  exportedAt:    Date;
  /** Null until something writes an export artefact. It used to be a URL
   *  under api.capitalforge.io with a token prefixed "stub_". */
  downloadUrl:   string | null;
  expiresAt:     Date;
  /** Null until a file exists to measure. */
  sizeBytes:     number | null;
}

export interface RecoveryTestLog {
  id:              string;
  testedBy:        string;
  testType:        'full_restore' | 'partial_restore' | 'failover_drill' | 'tabletop';
  backupId?:       string;
  startedAt:       Date;
  completedAt?:    Date;
  durationMinutes?: number;
  outcome:         'pass' | 'fail' | 'partial';
  rtoAchievedMinutes?: number;
  notes:           string;
  createdAt:       Date;
}

// ── In-memory stores ─────────────────────────────────────────

const backupStore       = new Map<string, BackupRecord>();
const recoveryTestStore = new Map<string, RecoveryTestLog>();

// ── Constants ────────────────────────────────────────────────

const RETENTION_DAYS     = 90;
const RTO_TARGET_MINUTES = 240;  // 4-hour RTO
const RPO_TARGET_MINUTES = 1440; // 24-hour RPO

// ============================================================
// Backup Tracking
// ============================================================

/**
 * Trigger a new backup record (platform-level or tenant-scoped).
 * The actual backup job is executed by the infrastructure layer (e.g. pg_dump, S3 snapshot).
 * This service tracks the record and lifecycle.
 */
export async function triggerBackup(
  backupType: BackupType,
  tenantId?: string,
): Promise<BackupRecord> {
  const now        = new Date();
  const expiresAt  = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const record: BackupRecord = {
    id:              uuidv4(),
    tenantId,
    backupType,
    status:          'running',
    retentionDays:   RETENTION_DAYS,
    expiresAt,
    createdAt:       now,
    storageLocation: `s3://capitalforge-backups/${tenantId ?? 'platform'}/${now.toISOString().slice(0, 10)}/${uuidv4()}.dump`,
  };
  backupStore.set(record.id, record);

  // STUB — dispatch async backup job to job queue (e.g. BullMQ)
  // In production: await backupQueue.add('backup', { recordId: record.id, backupType, tenantId })
  // Simulate completion for now
  // Nothing marks this complete. A backup is completed by whatever performed
  // it reporting back, and nothing does yet, so it stays as it was created.

  return record;
}

// _simulateBackupCompletion is gone. It marked a record completed and gave it
// a size from Math.random() and a checksum from a uuid — a checksum being the
// one field whose whole purpose is to prove the bytes are what they claim.

export function updateBackupStatus(
  id: string,
  status: BackupStatus,
  patch?: Partial<Pick<BackupRecord, 'sizeBytes' | 'checksum' | 'errorMessage' | 'completedAt'>>,
): BackupRecord {
  const record = backupStore.get(id);
  if (!record) throw new Error(`Backup record ${id} not found`);
  Object.assign(record, { status, ...patch });
  backupStore.set(id, record);
  return record;
}

export function listBackups(options?: {
  tenantId?: string;
  backupType?: BackupType;
  status?: BackupStatus;
  limit?: number;
}): BackupRecord[] {
  let records = Array.from(backupStore.values());

  if (options?.tenantId)   records = records.filter((r) => r.tenantId === options.tenantId);
  if (options?.backupType) records = records.filter((r) => r.backupType === options.backupType);
  if (options?.status)     records = records.filter((r) => r.status === options.status);

  // Sort newest first
  records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return options?.limit ? records.slice(0, options.limit) : records;
}

export function getBackup(id: string): BackupRecord | undefined {
  return backupStore.get(id);
}

/**
 * Purge backups that have exceeded their retention window.
 * Call this on a daily schedule.
 */
export function purgeExpiredBackups(): { purged: number } {
  const now    = new Date();
  let purged   = 0;
  for (const [id, record] of backupStore.entries()) {
    if (record.expiresAt && record.expiresAt < now) {
      backupStore.delete(id);
      purged += 1;
    }
  }
  return { purged };
}

// ============================================================
// RTO / RPO Monitoring
// ============================================================

export function getRtoRpoStatus(tenantId?: string): RtoRpoStatus {
  const records = listBackups({ tenantId, status: 'completed' });
  const lastBackup = records[0];

  const nowMs           = Date.now();
  const lastBackupMs    = lastBackup?.completedAt?.getTime() ?? lastBackup?.createdAt.getTime();
  const currentRpoMins  = lastBackupMs
    ? Math.floor((nowMs - lastBackupMs) / 60_000)
    : undefined;

  const testLogs     = Array.from(recoveryTestStore.values())
    .filter((t) => t.outcome === 'pass')
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  const lastTest     = testLogs[0];

  return {
    lastBackupAt:              lastBackup?.completedAt ?? lastBackup?.createdAt,
    lastSuccessfulRecoveryAt:  lastTest?.completedAt,
    rtoTargetMinutes:          RTO_TARGET_MINUTES,
    rpoTargetMinutes:          RPO_TARGET_MINUTES,
    currentRpoMinutes:         currentRpoMins,
    // No backup at all is a breach, not a pass. This read `currentRpoMins
    // !== undefined && ...`, so with nothing on record it answered false —
    // the recovery point objective reported as met by a platform that had
    // never backed anything up. Same shape as a compliance score of 100 from
    // an empty check table.
    rpoBreached:               currentRpoMins === undefined || currentRpoMins > RPO_TARGET_MINUTES,
    // Lets a caller tell "inside the objective" from "nothing to measure".
    rpoMeasurable:             currentRpoMins !== undefined,
    rtoLastTestedMinutes:      lastTest?.rtoAchievedMinutes,
    rtoMet:                    lastTest ? (lastTest.rtoAchievedMinutes ?? 9999) <= RTO_TARGET_MINUTES : false,
  };
}

// ============================================================
// One-Click Case Export
// ============================================================

export async function exportClientCase(
  tenantId: string,
  businessId: string,
  requestedBy: string,
): Promise<CaseExportResult> {
  // STUB — in production:
  //  1. Query all related records (Business, CreditProfiles, Applications, Documents, ConsentRecords, etc.)
  //  2. Bundle into a zip archive
  //  3. Upload to S3 with a presigned URL
  //  4. Log to AuditLog

  const exportId  = uuidv4();
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h link expiry

  const includedFiles = [
    'business_profile.json',
    'owners.json',
    'credit_profiles.json',
    'funding_rounds.json',
    'card_applications.json',
    'compliance_checks.json',
    'consent_records.json',
    'documents_manifest.json',
    'suitability_checks.json',
    'cost_calculations.json',
    'audit_log.json',
  ];

  return {
    exportId,
    businessId,
    tenantId,
    includedFiles,
    exportedAt:  now,
    // No download URL and no size. The URL pointed at api.capitalforge.io
    // with a token literally prefixed "stub_", and the size was a random
    // number between 100KB and 2.1MB — a figure describing a file that was
    // never written. Nothing here produces an export artefact yet, so the
    // caller is told what is included and nothing about a file.
    downloadUrl: null,
    expiresAt,
    sizeBytes:   null,
  };
}

// ============================================================
// Recovery Testing Log
// ============================================================

export function logRecoveryTest(entry: Omit<RecoveryTestLog, 'id' | 'createdAt'>): RecoveryTestLog {
  const log: RecoveryTestLog = {
    id:        uuidv4(),
    ...entry,
    createdAt: new Date(),
  };
  if (log.startedAt && log.completedAt) {
    log.durationMinutes = Math.floor(
      (log.completedAt.getTime() - log.startedAt.getTime()) / 60_000,
    );
  }
  recoveryTestStore.set(log.id, log);
  return log;
}

export function listRecoveryTests(options?: { limit?: number; outcome?: RecoveryTestLog['outcome'] }): RecoveryTestLog[] {
  let logs = Array.from(recoveryTestStore.values());
  if (options?.outcome) logs = logs.filter((l) => l.outcome === options.outcome);
  logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return options?.limit ? logs.slice(0, options.limit) : logs;
}

export function getRecoveryTest(id: string): RecoveryTestLog | undefined {
  return recoveryTestStore.get(id);
}

// No demo backups.
//
// A module-level IIFE ran on every process start and seeded seven days of
// "completed" backups — sizes between 50MB and 450MB from Math.random(),
// storage locations under s3://capitalforge-backups/, sha256 checksums built
// from a uuid, each finishing thirty minutes after it began.
//
// So listBackups always returned a successful week, and getRtoRpoStatus
// computed the recovery point objective from the most recent of them. Anyone
// asking when this platform last backed up, or whether it was inside its RPO,
// was answered from that. Nothing had run. backup_records exists and nothing
// writes to it.
//
// With the seeder gone the list is empty and the RPO is unknown, which is
// what is actually true.

export const businessContinuityService = {
  triggerBackup,
  updateBackupStatus,
  listBackups,
  getBackup,
  purgeExpiredBackups,
  getRtoRpoStatus,
  exportClientCase,
  logRecoveryTest,
  listRecoveryTests,
  getRecoveryTest,
};
