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
  rtoLastTestedMinutes?:    number;
  rtoMet:                   boolean;
}

export interface CaseExportResult {
  exportId:      string;
  businessId:    string;
  tenantId:      string;
  includedFiles: string[];
  exportedAt:    Date;
  downloadUrl:   string;  // signed URL; stub returns placeholder
  expiresAt:     Date;
  sizeBytes:     number;
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
  _simulateBackupCompletion(record.id);

  return record;
}

function _simulateBackupCompletion(recordId: string): void {
  // In production this runs in a background worker, not inline
  const record = backupStore.get(recordId);
  if (!record) return;
  record.status       = 'completed';
  record.completedAt  = new Date();
  record.sizeBytes    = BigInt(Math.floor(Math.random() * 500_000_000) + 50_000_000);
  record.checksum     = `sha256:${uuidv4().replace(/-/g, '')}`;
  backupStore.set(recordId, record);
}

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
    rpoBreached:               currentRpoMins !== undefined && currentRpoMins > RPO_TARGET_MINUTES,
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
    downloadUrl: `https://api.capitalforge.io/exports/${exportId}?token=stub_${uuidv4()}`,
    expiresAt,
    sizeBytes:   Math.floor(Math.random() * 2_000_000) + 100_000,
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

// ── Seed a few demo backup records ───────────────────────────
(function seedDemoBackups() {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  for (let i = 6; i >= 0; i--) {
    const ts = new Date(now - i * 24 * 60 * 60 * 1000);
    const r: BackupRecord = {
      id:              uuidv4(),
      backupType:      i % 7 === 0 ? 'full' : 'incremental',
      status:          'completed',
      sizeBytes:       BigInt(Math.floor(Math.random() * 400_000_000) + 50_000_000),
      storageLocation: `s3://capitalforge-backups/platform/${ts.toISOString().slice(0, 10)}/backup.dump`,
      retentionDays:   RETENTION_DAYS,
      expiresAt:       new Date(ts.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
      createdAt:       ts,
      completedAt:     new Date(ts.getTime() + 30 * 60 * 1000),
      checksum:        `sha256:${uuidv4().replace(/-/g, '')}`,
    };
    backupStore.set(r.id, r);
  }
})();

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
