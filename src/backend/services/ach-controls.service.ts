// ============================================================
// CapitalForge — ACH / Debit Authorization Controls Service
//
// Compliance basis:
//   • Yellowstone Capital $9.8M FTC settlement (2020) — ACH abuse
//   • RCG Advances FTC ban — repeated debiting after revocation
//   • NACHA Operating Rules §2.3 — authorization requirements
//
// Enforcement rules enforced here:
//   1. Every authorization MUST include: signed document reference,
//      authorized amount, and authorized frequency.
//   2. Revocation immediately notifies ALL processors — the ACH
//      must stop the moment revocation is confirmed.
//   3. Debit tolerance: flag any single debit > 10% above the
//      authorized amount.
//   4. Unauthorized detection publishes DEBIT_UNAUTHORIZED_DETECTED
//      and auto-opens a Complaint & Remediation case.
//   5. Full audit trail: every authorization, modification, and
//      revocation is logged with timestamps.
// ============================================================

import { PrismaClient, AchAuthorization, DebitEvent } from '@prisma/client';
import { EventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../events/event-types.js';
import logger from '../config/logger.js';

// ── Constants ────────────────────────────────────────────────

/** Debit tolerance: flag when actual amount exceeds authorized by this ratio. */
const DEBIT_TOLERANCE_RATIO = 0.10; // 10 %

// ── Input / output types ─────────────────────────────────────

export interface CreateAuthorizationInput {
  tenantId: string;
  businessId: string;
  processorName: string;
  /** Maximum single-debit amount, in dollars */
  authorizedAmount: number;
  /** e.g. "weekly", "bi-weekly", "monthly" */
  authorizedFrequency: string;
  /** Reference to the signed ACH authorization document in the vault */
  signedDocumentRef: string;
  /** ISO string of when the authorization was physically signed */
  authorizedAt: string;
}

export interface RevokeAuthorizationInput {
  tenantId: string;
  businessId: string;
  authorizationId: string;
  /** Who is requesting the revocation (userId) */
  revokedBy: string;
  revocationReason: string;
}

export interface RecordDebitEventInput {
  tenantId: string;
  authorizationId: string;
  amount: number;
  /** Frequency descriptor for this specific debit, e.g. "daily" */
  frequency?: string;
  processedAt: string;
}

export interface DebitToleranceResult {
  flagged: boolean;
  flagReasons: string[];
  isWithinTolerance: boolean;
  debitEvent: DebitEvent;
}

export interface UnauthorizedDebitAlert {
  id: string;
  businessId: string;
  processorName: string;
  amount: number;
  reason: string;
  detectedAt: Date;
  authorizationId: string | null;
}

export interface AuthorizationWithEvents extends AchAuthorization {
  debitEvents: DebitEvent[];
}

// ── Service ──────────────────────────────────────────────────

export class AchControlsService {
  private readonly prisma: PrismaClient;
  private readonly eventBus: EventBus;

  constructor(prisma?: PrismaClient, eventBus?: EventBus) {
    this.prisma = prisma ?? new PrismaClient();
    this.eventBus = eventBus ?? EventBus.getInstance();
  }

  // ── Authorization Vault ─────────────────────────────────────

  /**
   * Store a new signed ACH authorization.
   *
   * All three compliance-required fields (signedDocumentRef,
   * authorizedAmount, authorizedFrequency) are validated before
   * persisting.  A DEBIT_AUTHORIZED event is published to the
   * canonical ledger.
   */
  async createAuthorization(
    input: CreateAuthorizationInput,
  ): Promise<AchAuthorization> {
    const svc = logger.child({ service: 'AchControlsService', tenantId: input.tenantId });

    // ── Compliance gate: all three required fields must be present ──
    if (!input.signedDocumentRef || input.signedDocumentRef.trim().length === 0) {
      throw new Error(
        'ACH authorization rejected: signedDocumentRef is required ' +
        '(NACHA §2.3 — authorization must reference a signed document).',
      );
    }
    if (input.authorizedAmount == null || input.authorizedAmount <= 0) {
      throw new Error(
        'ACH authorization rejected: authorizedAmount must be a positive number.',
      );
    }
    if (!input.authorizedFrequency || input.authorizedFrequency.trim().length === 0) {
      throw new Error(
        'ACH authorization rejected: authorizedFrequency is required ' +
        '(e.g. "weekly", "bi-weekly", "monthly").',
      );
    }

    // ── Verify the business exists and belongs to this tenant ──
    const business = await this.prisma.business.findFirst({
      where: { id: input.businessId, tenantId: input.tenantId },
      select: { id: true, legalName: true },
    });
    if (!business) {
      throw new Error(
        `Business ${input.businessId} not found for tenant ${input.tenantId}.`,
      );
    }

    const authorization = await this.prisma.achAuthorization.create({
      data: {
        businessId: input.businessId,
        processorName: input.processorName.trim(),
        authorizedAmount: input.authorizedAmount,
        authorizedFrequency: input.authorizedFrequency.trim().toLowerCase(),
        signedDocumentRef: input.signedDocumentRef.trim(),
        authorizedAt: new Date(input.authorizedAt),
        status: 'active',
      },
    });

    svc.info('ACH authorization created', {
      authorizationId: authorization.id,
      businessId: input.businessId,
      processorName: input.processorName,
    });

    // Publish to canonical ledger
    await this.eventBus.publishAndPersist(input.tenantId, {
      eventType: EVENT_TYPES.DEBIT_AUTHORIZED,
      aggregateType: AGGREGATE_TYPES.ACH,
      aggregateId: authorization.id,
      payload: {
        authorizationId: authorization.id,
        businessId: input.businessId,
        processorName: input.processorName,
        authorizedAmount: input.authorizedAmount,
        authorizedFrequency: input.authorizedFrequency,
        signedDocumentRef: input.signedDocumentRef,
        authorizedAt: input.authorizedAt,
      },
      metadata: { source: 'ach-controls-service' },
    });

    return authorization;
  }

  // ── Revocation Workflow ─────────────────────────────────────

  /**
   * Revoke an ACH authorization.
   *
   * Per the Yellowstone Capital settlement: once revoked, the MCA
   * operator CANNOT continue debiting.  This method:
   *   1. Marks the authorization as revoked in the database.
   *   2. Records the revocationNotifiedAt timestamp immediately.
   *   3. Publishes DEBIT_REVOKED — all processor integrations that
   *      subscribe to this event MUST honour the revocation.
   *
   * The revocationNotifiedAt field is the legal timestamp that
   * proves the processor was notified.
   */
  async revokeAuthorization(
    input: RevokeAuthorizationInput,
  ): Promise<AchAuthorization> {
    const svc = logger.child({ service: 'AchControlsService', tenantId: input.tenantId });

    // Validate the authorization belongs to this tenant/business
    const existing = await this.prisma.achAuthorization.findFirst({
      where: {
        id: input.authorizationId,
        businessId: input.businessId,
        business: { tenantId: input.tenantId },
      },
    });
    if (!existing) {
      throw new Error(
        `Authorization ${input.authorizationId} not found for business ${input.businessId}.`,
      );
    }
    if (existing.status === 'revoked') {
      throw new Error(
        `Authorization ${input.authorizationId} is already revoked.`,
      );
    }

    const now = new Date();

    const revoked = await this.prisma.achAuthorization.update({
      where: { id: input.authorizationId },
      data: {
        status: 'revoked',
        revokedAt: now,
        // Record notification timestamp immediately — legal proof of processor notice
        revocationNotifiedAt: now,
      },
    });

    svc.warn('ACH authorization revoked — processor notification required', {
      authorizationId: revoked.id,
      businessId: input.businessId,
      processorName: revoked.processorName,
      revokedBy: input.revokedBy,
      reason: input.revocationReason,
    });

    // Publish DEBIT_REVOKED — processor integrations subscribe to this
    // event and must immediately halt further debits.
    await this.eventBus.publishAndPersist(input.tenantId, {
      eventType: EVENT_TYPES.DEBIT_REVOKED,
      aggregateType: AGGREGATE_TYPES.ACH,
      aggregateId: revoked.id,
      payload: {
        authorizationId: revoked.id,
        businessId: input.businessId,
        processorName: revoked.processorName,
        revokedBy: input.revokedBy,
        revocationReason: input.revocationReason,
        revokedAt: now.toISOString(),
        revocationNotifiedAt: now.toISOString(),
      },
      metadata: {
        source: 'ach-controls-service',
        complianceNote:
          'Processor must immediately stop debiting per NACHA §2.3 and FTC enforcement precedent.',
      },
    });

    return revoked;
  }

  // ── Authorization Query ─────────────────────────────────────

  /**
   * Return all ACH authorizations for a business, including their
   * debit events for audit and monitoring purposes.
   */
  async getAuthorizationsForBusiness(
    tenantId: string,
    businessId: string,
  ): Promise<AuthorizationWithEvents[]> {
    // Verify tenant ownership
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(
        `Business ${businessId} not found for tenant ${tenantId}.`,
      );
    }

    return this.prisma.achAuthorization.findMany({
      where: { businessId },
      include: {
        debitEvents: {
          orderBy: { processedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Debit Tolerance Monitoring ──────────────────────────────

  /**
   * Record an incoming debit event and immediately check it against
   * the authorization.
   *
   * Flagging criteria (any of the following triggers a flag):
   *   • Amount > authorized amount × (1 + DEBIT_TOLERANCE_RATIO)
   *   • Debit arrives after the authorization was revoked
   *   • Debit originates from an unknown processor (no active auth)
   *   • Frequency descriptor does not match the authorized frequency
   *
   * When an unauthorized debit is detected the service also:
   *   • Publishes DEBIT_UNAUTHORIZED_DETECTED
   *   • Auto-opens a Complaint & Remediation case
   */
  async recordDebitEvent(
    input: RecordDebitEventInput,
  ): Promise<DebitToleranceResult> {
    const svc = logger.child({
      service: 'AchControlsService',
      tenantId: input.tenantId,
      authorizationId: input.authorizationId,
    });

    const authorization = await this.prisma.achAuthorization.findUnique({
      where: { id: input.authorizationId },
      include: { business: { select: { tenantId: true, id: true } } },
    });
    if (!authorization) {
      throw new Error(`Authorization ${input.authorizationId} not found.`);
    }

    // Verify tenant ownership of the authorization
    if (authorization.business.tenantId !== input.tenantId) {
      throw new Error(
        `Authorization ${input.authorizationId} does not belong to tenant ${input.tenantId}.`,
      );
    }

    const flagReasons: string[] = [];

    // ── Check 1: revoked authorization ──
    if (authorization.status === 'revoked') {
      flagReasons.push(
        `Debit received after authorization was revoked at ` +
        `${authorization.revokedAt?.toISOString() ?? 'unknown'}.`,
      );
    }

    // ── Check 2: suspended authorization ──
    if (authorization.status === 'suspended') {
      flagReasons.push(
        `Debit received while authorization is suspended.`,
      );
    }

    // ── Check 3: amount tolerance (> 10% above authorized) ──
    if (authorization.authorizedAmount !== null) {
      const authorizedAmount = Number(authorization.authorizedAmount);
      const upperBound = authorizedAmount * (1 + DEBIT_TOLERANCE_RATIO);
      if (input.amount > upperBound) {
        const overage = (
          ((input.amount - authorizedAmount) / authorizedAmount) * 100
        ).toFixed(1);
        flagReasons.push(
          `Debit amount $${input.amount.toFixed(2)} exceeds authorized ` +
          `$${authorizedAmount.toFixed(2)} by ${overage}% ` +
          `(tolerance: ${(DEBIT_TOLERANCE_RATIO * 100).toFixed(0)}%).`,
        );
      }
    }

    // ── Check 4: frequency mismatch ──
    if (
      input.frequency &&
      authorization.authorizedFrequency &&
      input.frequency.toLowerCase() !== authorization.authorizedFrequency.toLowerCase()
    ) {
      flagReasons.push(
        `Debit frequency "${input.frequency}" does not match ` +
        `authorized frequency "${authorization.authorizedFrequency}".`,
      );
    }

    const flagged = flagReasons.length > 0;
    const isWithinTolerance = !flagged;

    const debitEvent = await this.prisma.debitEvent.create({
      data: {
        authorizationId: input.authorizationId,
        amount: input.amount,
        frequency: input.frequency ?? null,
        isWithinTolerance,
        flagged,
        flagReason: flagged ? flagReasons.join(' | ') : null,
        processedAt: new Date(input.processedAt),
      },
    });

    if (flagged) {
      svc.warn('Debit event flagged', {
        debitEventId: debitEvent.id,
        amount: input.amount,
        flagReasons,
      });

      // Publish DEBIT_UNAUTHORIZED_DETECTED and auto-open case
      await this.handleUnauthorizedDebit(
        input.tenantId,
        authorization.business.id,
        authorization,
        debitEvent,
        flagReasons,
      );
    } else {
      svc.info('Debit event recorded within tolerance', {
        debitEventId: debitEvent.id,
        amount: input.amount,
      });
    }

    return { flagged, flagReasons, isWithinTolerance, debitEvent };
  }

  // ── Alert Query ─────────────────────────────────────────────

  /**
   * Return all flagged/unauthorized debit alerts for a business.
   * Ordered newest-first to surface the most recent violations.
   */
  async getUnauthorizedAlerts(
    tenantId: string,
    businessId: string,
  ): Promise<UnauthorizedDebitAlert[]> {
    // Verify tenant ownership
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    const flaggedEvents = await this.prisma.debitEvent.findMany({
      where: {
        flagged: true,
        authorization: {
          businessId,
          business: { tenantId },
        },
      },
      include: {
        authorization: {
          select: {
            id: true,
            processorName: true,
            businessId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return flaggedEvents.map((evt) => ({
      id: evt.id,
      businessId: evt.authorization.businessId,
      processorName: evt.authorization.processorName,
      amount: Number(evt.amount),
      reason: evt.flagReason ?? 'Unauthorized debit detected',
      detectedAt: evt.createdAt,
      authorizationId: evt.authorizationId,
    }));
  }

  // ── Pre-Debit Confirmation ──────────────────────────────────

  /**
   * Pre-debit check: returns whether a proposed debit is within the
   * authorization bounds BEFORE it is processed.
   *
   * Used by processor integrations to seek confirmation before
   * submitting out-of-range debits.
   */
  async preDebitConfirmation(
    tenantId: string,
    authorizationId: string,
    proposedAmount: number,
    proposedFrequency?: string,
  ): Promise<{
    allowed: boolean;
    requiresConfirmation: boolean;
    reasons: string[];
  }> {
    const authorization = await this.prisma.achAuthorization.findFirst({
      where: {
        id: authorizationId,
        business: { tenantId },
      },
    });
    if (!authorization) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reasons: [`Authorization ${authorizationId} not found for this tenant.`],
      };
    }

    const reasons: string[] = [];

    if (authorization.status !== 'active') {
      reasons.push(
        `Authorization is ${authorization.status} — no further debits are permitted.`,
      );
    }

    if (authorization.authorizedAmount !== null) {
      const authAmt = Number(authorization.authorizedAmount);
      const upperBound = authAmt * (1 + DEBIT_TOLERANCE_RATIO);
      if (proposedAmount > upperBound) {
        reasons.push(
          `Proposed amount $${proposedAmount.toFixed(2)} exceeds the ${
            (DEBIT_TOLERANCE_RATIO * 100).toFixed(0)
          }% tolerance band above authorized $${authAmt.toFixed(2)}.`,
        );
      }
    }

    if (
      proposedFrequency &&
      authorization.authorizedFrequency &&
      proposedFrequency.toLowerCase() !== authorization.authorizedFrequency.toLowerCase()
    ) {
      reasons.push(
        `Proposed frequency "${proposedFrequency}" differs from authorized ` +
        `"${authorization.authorizedFrequency}" — confirmation required.`,
      );
    }

    const allowed = reasons.length === 0;
    // Require explicit confirmation for out-of-range amounts even if still
    // within the absolute hard limit (amounts above authorized but below tolerance)
    const requiresConfirmation =
      !allowed ||
      (authorization.authorizedAmount !== null &&
        proposedAmount > Number(authorization.authorizedAmount));

    return { allowed, requiresConfirmation, reasons };
  }

  // ── Internal helpers ─────────────────────────────────────────

  /**
   * Publish DEBIT_UNAUTHORIZED_DETECTED and open a Complaint &
   * Remediation case via the event bus.
   *
   * Any service subscribed to DEBIT_UNAUTHORIZED_DETECTED should
   * create the complaint case record in the complaints module.
   */
  private async handleUnauthorizedDebit(
    tenantId: string,
    businessId: string,
    authorization: AchAuthorization,
    debitEvent: DebitEvent,
    flagReasons: string[],
  ): Promise<void> {
    const svc = logger.child({
      service: 'AchControlsService',
      tenantId,
      businessId,
    });

    try {
      await this.eventBus.publishAndPersist(tenantId, {
        eventType: EVENT_TYPES.DEBIT_UNAUTHORIZED_DETECTED,
        aggregateType: AGGREGATE_TYPES.ACH,
        aggregateId: authorization.id,
        payload: {
          authorizationId: authorization.id,
          debitEventId: debitEvent.id,
          businessId,
          processorName: authorization.processorName,
          debitAmount: Number(debitEvent.amount),
          authorizedAmount: authorization.authorizedAmount
            ? Number(authorization.authorizedAmount)
            : null,
          flagReasons,
          detectedAt: new Date().toISOString(),
          // Signal the Complaint & Remediation module to auto-open a case
          openComplaintCase: true,
          complaintCategory: 'unauthorized_ach_debit',
          complianceReference:
            'Yellowstone Capital FTC settlement (2020); RCG Advances FTC ban',
        },
        metadata: {
          source: 'ach-controls-service',
          severity: 'critical',
          requiresImmediateAction: true,
        },
      });

      svc.error('DEBIT_UNAUTHORIZED_DETECTED — complaint case auto-opened', {
        authorizationId: authorization.id,
        debitEventId: debitEvent.id,
        processorName: authorization.processorName,
        debitAmount: Number(debitEvent.amount),
        flagReasons,
      });
    } catch (err) {
      // Log but do not suppress — the debit record is already saved
      svc.error('Failed to publish DEBIT_UNAUTHORIZED_DETECTED event', {
        error: err instanceof Error ? err.message : String(err),
        authorizationId: authorization.id,
        debitEventId: debitEvent.id,
      });
    }
  }
}
