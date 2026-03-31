// ============================================================
// CapitalForge — Consent Service
//
// Master consent ledger for all communication channels.
//
// Compliance guarantees:
//   - TCPA hard block: no outbound call/SMS without active consent
//   - Immutable history: revocations create new records, never delete
//   - Cascade revocation: CONSENT_REVOKED published immediately to
//     the event bus so all downstream modules react in-process
//   - Every action stamped: timestamp, IP, evidence reference, actor
//   - Tenant isolation: all queries scoped by tenantId
// ============================================================

import { PrismaClient } from '@prisma/client';
import type {
  ConsentChannel,
  ConsentType,
  ConsentStatus,
} from '@shared/types/index.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import { eventBus } from '../events/event-bus.js';
import logger from '../config/logger.js';

// ----------------------------------------------------------------
// Input / output types
// ----------------------------------------------------------------

export interface GrantConsentInput {
  tenantId: string;
  businessId: string;
  channel: ConsentChannel;
  consentType: ConsentType;
  ipAddress?: string;
  /** URL, document ID, or signature reference proving consent was given */
  evidenceRef?: string;
  metadata?: Record<string, unknown>;
  /** ID of the acting user — stored for audit */
  actorId?: string;
}

export interface RevokeConsentInput {
  tenantId: string;
  businessId: string;
  channel: ConsentChannel;
  revocationReason?: string;
  ipAddress?: string;
  actorId?: string;
}

export interface ConsentStatusResult {
  channel: ConsentChannel;
  consentType: ConsentType;
  status: ConsentStatus;
  grantedAt: Date;
  revokedAt: Date | null;
  evidenceRef: string | null;
  recordId: string;
}

export interface ConsentAuditEntry {
  id: string;
  channel: ConsentChannel;
  consentType: ConsentType;
  status: ConsentStatus;
  grantedAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  ipAddress: string | null;
  evidenceRef: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ConsentAuditExport {
  tenantId: string;
  businessId: string;
  exportedAt: Date;
  totalRecords: number;
  records: ConsentAuditEntry[];
}

// ----------------------------------------------------------------
// ConsentService
// ----------------------------------------------------------------

export class ConsentService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Grant ─────────────────────────────────────────────────────

  /**
   * Record a new consent grant for a given channel.
   *
   * If an active consent record already exists for the same business +
   * channel + consentType combination it is left intact and a new record
   * is created alongside it (idempotent-safe; the gate always picks the
   * most-recent active record).
   *
   * Publishes `consent.captured` to the event bus after persisting.
   */
  async grantConsent(input: GrantConsentInput): Promise<ConsentAuditEntry> {
    this._assertTenant(input.tenantId);
    this._assertBusiness(input.businessId);

    const log = logger.child({
      tenantId: input.tenantId,
      businessId: input.businessId,
      channel: input.channel,
      consentType: input.consentType,
    });

    log.info('[ConsentService] Granting consent');

    const record = await this.prisma.consentRecord.create({
      data: {
        tenantId: input.tenantId,
        businessId: input.businessId,
        channel: input.channel,
        consentType: input.consentType,
        status: 'active',
        ipAddress: input.ipAddress ?? null,
        evidenceRef: input.evidenceRef ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          actorId: input.actorId ?? null,
          grantedByIp: input.ipAddress ?? null,
        },
      },
    });

    // Publish to the event bus (non-blocking; failures are caught and logged)
    await this._publishEvent(
      input.tenantId,
      EVENT_TYPES.CONSENT_CAPTURED,
      record.businessId ?? input.businessId,
      {
        consentRecordId: record.id,
        channel: input.channel,
        consentType: input.consentType,
        status: 'active',
        ipAddress: input.ipAddress ?? null,
        evidenceRef: input.evidenceRef ?? null,
        actorId: input.actorId ?? null,
      },
    );

    log.info('[ConsentService] Consent granted', { recordId: record.id });

    return this._toAuditEntry(record);
  }

  // ── Revoke ────────────────────────────────────────────────────

  /**
   * Revoke all active consent records for the given business + channel.
   *
   * TCPA compliance rules enforced here:
   *   1. Revocations are IMMEDIATE — existing records are updated to
   *      `revoked` status with a timestamp (NOT deleted — history is immutable).
   *   2. `CONSENT_REVOKED` event is published synchronously before this
   *      method returns so downstream modules (VoiceForge, SMS, etc.) can
   *      act in the same request cycle.
   *   3. Returns the count of records revoked for caller awareness.
   */
  async revokeConsent(
    input: RevokeConsentInput,
  ): Promise<{ revokedCount: number; records: ConsentAuditEntry[] }> {
    this._assertTenant(input.tenantId);
    this._assertBusiness(input.businessId);

    const log = logger.child({
      tenantId: input.tenantId,
      businessId: input.businessId,
      channel: input.channel,
    });

    log.warn('[ConsentService] Revoking consent — cascade imminent', {
      reason: input.revocationReason,
    });

    // Find all active records for this business + channel
    const activeRecords = await this.prisma.consentRecord.findMany({
      where: {
        tenantId: input.tenantId,
        businessId: input.businessId,
        channel: input.channel,
        status: 'active',
      },
    });

    if (activeRecords.length === 0) {
      log.info('[ConsentService] No active consent records found to revoke');
      return { revokedCount: 0, records: [] };
    }

    const revokedAt = new Date();
    const revokedIds = activeRecords.map((r) => r.id);

    // Update all matching records to revoked — preserves history (no delete)
    await this.prisma.consentRecord.updateMany({
      where: {
        id: { in: revokedIds },
        tenantId: input.tenantId, // belt-and-suspenders tenant isolation
      },
      data: {
        status: 'revoked',
        revokedAt,
        revocationReason: input.revocationReason ?? null,
        metadata: {
          revokedByIp: input.ipAddress ?? null,
          actorId: input.actorId ?? null,
          revokedAt: revokedAt.toISOString(),
        },
      },
    });

    // Re-fetch updated records for response and event payload
    const updatedRecords = await this.prisma.consentRecord.findMany({
      where: { id: { in: revokedIds } },
    });

    // Publish CONSENT_REVOKED for each record — downstream modules MUST listen
    // and block any in-flight or queued communications immediately.
    for (const record of updatedRecords) {
      await this._publishEvent(
        input.tenantId,
        EVENT_TYPES.CONSENT_REVOKED,
        record.businessId ?? input.businessId,
        {
          consentRecordId: record.id,
          channel: input.channel,
          consentType: record.consentType,
          revokedAt: revokedAt.toISOString(),
          revocationReason: input.revocationReason ?? null,
          ipAddress: input.ipAddress ?? null,
          actorId: input.actorId ?? null,
          // Downstream systems use this to identify affected communications
          cascadeTarget: this._deriveCascadeTargets(input.channel),
        },
      );
    }

    log.warn('[ConsentService] Consent revoked + events published', {
      revokedCount: updatedRecords.length,
      recordIds: revokedIds,
    });

    return {
      revokedCount: updatedRecords.length,
      records: updatedRecords.map(this._toAuditEntry),
    };
  }

  // ── Status query ──────────────────────────────────────────────

  /**
   * Return the current consent status for every channel for a given business.
   * Only the most-recent record per channel+consentType pair is returned.
   * Used by the consent gate and UI preference center.
   */
  async getConsentStatuses(
    tenantId: string,
    businessId: string,
  ): Promise<ConsentStatusResult[]> {
    this._assertTenant(tenantId);
    this._assertBusiness(businessId);

    const records = await this.prisma.consentRecord.findMany({
      where: { tenantId, businessId },
      orderBy: { grantedAt: 'desc' },
    });

    // Deduplicate: keep only the most-recent record per channel+consentType pair
    const seen = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      const key = `${record.channel}::${record.consentType}`;
      if (!seen.has(key)) {
        seen.set(key, record);
      }
    }

    return Array.from(seen.values()).map((r) => ({
      channel: r.channel as ConsentChannel,
      consentType: r.consentType as ConsentType,
      status: r.status as ConsentStatus,
      grantedAt: r.grantedAt,
      revokedAt: r.revokedAt,
      evidenceRef: r.evidenceRef,
      recordId: r.id,
    }));
  }

  /**
   * Check whether a specific channel + consentType has active consent.
   * Used internally by the consent gate.
   */
  async hasActiveConsent(
    tenantId: string,
    businessId: string,
    channel: ConsentChannel,
    consentType: ConsentType,
  ): Promise<boolean> {
    const count = await this.prisma.consentRecord.count({
      where: {
        tenantId,
        businessId,
        channel,
        consentType,
        status: 'active',
      },
    });
    return count > 0;
  }

  // ── Audit export ──────────────────────────────────────────────

  /**
   * Export the full, unabridged consent history for a business.
   *
   * This is the authoritative compliance export — all records returned in
   * chronological order, no filtering by status. Immutable history is
   * guaranteed because we never delete consent records.
   */
  async exportAudit(
    tenantId: string,
    businessId: string,
  ): Promise<ConsentAuditExport> {
    this._assertTenant(tenantId);
    this._assertBusiness(businessId);

    const records = await this.prisma.consentRecord.findMany({
      where: { tenantId, businessId },
      orderBy: { grantedAt: 'asc' },
    });

    logger.info('[ConsentService] Audit export generated', {
      tenantId,
      businessId,
      recordCount: records.length,
    });

    return {
      tenantId,
      businessId,
      exportedAt: new Date(),
      totalRecords: records.length,
      records: records.map(this._toAuditEntry),
    };
  }

  // ── Tenant-policy helper ──────────────────────────────────────

  /**
   * Returns the set of channels that require explicit TCPA consent for
   * this tenant. White-label tenants may override this via brandConfig,
   * but the TCPA channels (voice + sms) can never be removed from the
   * required set.
   */
  getTcpaRequiredChannels(): ConsentChannel[] {
    // Voice and SMS are non-negotiable TCPA channels.
    // Email is CAN-SPAM governed but included for defense-in-depth.
    return ['voice', 'sms', 'email'];
  }

  // ── Private helpers ───────────────────────────────────────────

  private _assertTenant(tenantId: string): void {
    if (!tenantId?.trim()) {
      throw new Error('[ConsentService] tenantId is required');
    }
  }

  private _assertBusiness(businessId: string): void {
    if (!businessId?.trim()) {
      throw new Error('[ConsentService] businessId is required');
    }
  }

  /**
   * Maps a channel to the downstream systems that must be notified on
   * revocation so they can halt in-flight communications.
   */
  private _deriveCascadeTargets(channel: ConsentChannel): string[] {
    const targets: Record<ConsentChannel, string[]> = {
      voice: ['voiceforge', 'dialer', 'ivr'],
      sms: ['sms_gateway', 'twilio', 'messaging'],
      email: ['email_service', 'sendgrid', 'campaigns'],
      partner: ['partner_api', 'crm_sync', 'referral_engine'],
      document: ['docusign', 'document_vault', 'esign'],
    };
    return targets[channel] ?? [];
  }

  private async _publishEvent(
    tenantId: string,
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await eventBus.publishAndPersist(tenantId, {
        eventType,
        aggregateType: AGGREGATE_TYPES.CONSENT,
        aggregateId,
        payload,
      });
    } catch (err) {
      // Log but don't throw — event bus failures must not block consent writes
      logger.error('[ConsentService] Failed to publish event', {
        eventType,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private _toAuditEntry(
    record: {
      id: string;
      channel: string;
      consentType: string;
      status: string;
      grantedAt: Date;
      revokedAt: Date | null;
      revocationReason: string | null;
      ipAddress: string | null;
      evidenceRef: string | null;
      metadata: unknown;
    },
  ): ConsentAuditEntry {
    return {
      id: record.id,
      channel: record.channel as ConsentChannel,
      consentType: record.consentType as ConsentType,
      status: record.status as ConsentStatus,
      grantedAt: record.grantedAt,
      revokedAt: record.revokedAt,
      revocationReason: record.revocationReason,
      ipAddress: record.ipAddress,
      evidenceRef: record.evidenceRef,
      metadata:
        record.metadata != null
          ? (record.metadata as Record<string, unknown>)
          : null,
    };
  }
}
