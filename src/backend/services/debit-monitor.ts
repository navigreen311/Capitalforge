// ============================================================
// CapitalForge — Debit Monitor
//
// Monitors incoming debit events against stored ACH authorizations.
// Operates as a standalone service that can be called by the debit
// event webhook handler or run as a periodic reconciliation job.
//
// Detection rules (all auto-trigger complaint case creation):
//   1. Amount > authorized amount × 1.10  (>10% overage)
//   2. Frequency exceeds authorized frequency
//   3. Debit arrives after authorization was revoked
//   4. Debit from an unknown / unregistered processor
//
// All violations publish DEBIT_UNAUTHORIZED_DETECTED and delegate
// case creation to the Complaint & Remediation module via the event
// bus.
// ============================================================

import { PrismaClient, AchAuthorization, DebitEvent } from '@prisma/client';
import { EventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../events/event-types.js';
import logger from '../config/logger.js';

// ── Constants ────────────────────────────────────────────────

const AMOUNT_TOLERANCE_RATIO = 0.10; // 10 %

// ── Frequency hierarchy ──────────────────────────────────────
// Maps canonical frequency names to a daily-equivalent multiplier
// for simple frequency comparison.

const FREQUENCY_DAILY_EQUIV: Record<string, number> = {
  daily: 1,
  'twice-weekly': 3.5,
  weekly: 7,
  'bi-weekly': 14,
  'twice-monthly': 15,
  monthly: 30,
  quarterly: 90,
  annually: 365,
};

// ── Types ────────────────────────────────────────────────────

export type ViolationType =
  | 'AMOUNT_OVER_TOLERANCE'
  | 'FREQUENCY_EXCEEDED'
  | 'POST_REVOCATION_DEBIT'
  | 'UNKNOWN_PROCESSOR'
  | 'SUSPENDED_AUTHORIZATION';

export interface MonitorViolation {
  type: ViolationType;
  description: string;
}

export interface MonitorResult {
  /** True when at least one violation was detected. */
  unauthorized: boolean;
  violations: MonitorViolation[];
  debitEvent: DebitEvent | null;
  authorization: AchAuthorization | null;
}

export interface UnknownProcessorDebitInput {
  tenantId: string;
  businessId: string;
  processorName: string;
  amount: number;
  processedAt: string;
  /** Optional reference ID from the processor's side */
  externalRef?: string;
}

// ── DebitMonitor ─────────────────────────────────────────────

export class DebitMonitor {
  private readonly prisma: PrismaClient;
  private readonly eventBus: EventBus;

  constructor(prisma?: PrismaClient, eventBus?: EventBus) {
    this.prisma = prisma ?? new PrismaClient();
    this.eventBus = eventBus ?? EventBus.getInstance();
  }

  // ── Primary monitor entry point ───────────────────────────

  /**
   * Evaluate a debit event (by its database ID) against the linked
   * authorization and return a full MonitorResult.
   *
   * Called after DebitEvent records are created — either by
   * AchControlsService.recordDebitEvent() or by a reconciliation job.
   */
  async evaluateDebitEvent(
    tenantId: string,
    debitEventId: string,
  ): Promise<MonitorResult> {
    const mon = logger.child({
      service: 'DebitMonitor',
      tenantId,
      debitEventId,
    });

    const debitEvent = await this.prisma.debitEvent.findUnique({
      where: { id: debitEventId },
      include: {
        authorization: {
          include: { business: { select: { id: true, tenantId: true } } },
        },
      },
    });

    if (!debitEvent) {
      mon.warn('DebitEvent not found during evaluation');
      return { unauthorized: false, violations: [], debitEvent: null, authorization: null };
    }

    const authorization = debitEvent.authorization;

    if (authorization.business.tenantId !== tenantId) {
      mon.warn('Tenant mismatch during debit evaluation');
      return { unauthorized: false, violations: [], debitEvent, authorization };
    }

    const violations = this.detectViolations(debitEvent, authorization);
    const unauthorized = violations.length > 0;

    if (unauthorized) {
      mon.warn('Debit monitor detected violations', {
        debitEventId,
        authorizationId: authorization.id,
        violations: violations.map((v) => v.type),
      });

      // Persist flagged state if not already set
      if (!debitEvent.flagged) {
        await this.prisma.debitEvent.update({
          where: { id: debitEventId },
          data: {
            flagged: true,
            isWithinTolerance: false,
            flagReason: violations.map((v) => v.description).join(' | '),
          },
        });
      }

      await this.publishUnauthorizedEvent(
        tenantId,
        authorization.business.id,
        authorization,
        debitEvent,
        violations,
      );
    }

    return { unauthorized, violations, debitEvent, authorization };
  }

  /**
   * Handle a debit from a processor that has NO matching authorization
   * for this business.  This is an immediate hard violation.
   */
  async handleUnknownProcessorDebit(
    input: UnknownProcessorDebitInput,
  ): Promise<MonitorResult> {
    const mon = logger.child({
      service: 'DebitMonitor',
      tenantId: input.tenantId,
      businessId: input.businessId,
    });

    // Verify business exists
    const business = await this.prisma.business.findFirst({
      where: { id: input.businessId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(
        `Business ${input.businessId} not found for tenant ${input.tenantId}.`,
      );
    }

    // Check whether an authorization exists for this processor
    const existingAuth = await this.prisma.achAuthorization.findFirst({
      where: {
        businessId: input.businessId,
        processorName: { equals: input.processorName, mode: 'insensitive' },
        status: 'active',
      },
    });

    if (existingAuth) {
      // Authorization exists — route to normal evaluation
      mon.info('Authorization found for processor — routing to standard evaluation', {
        processorName: input.processorName,
        authorizationId: existingAuth.id,
      });
      return { unauthorized: false, violations: [], debitEvent: null, authorization: existingAuth };
    }

    const violation: MonitorViolation = {
      type: 'UNKNOWN_PROCESSOR',
      description:
        `Debit of $${input.amount.toFixed(2)} received from processor ` +
        `"${input.processorName}" which has no active authorization ` +
        `for business ${input.businessId}.`,
    };

    mon.error('Unknown processor debit detected', {
      processorName: input.processorName,
      amount: input.amount,
      externalRef: input.externalRef,
    });

    // Publish without a DebitEvent record (no authorization to link to)
    await this.eventBus.publishAndPersist(input.tenantId, {
      eventType: EVENT_TYPES.DEBIT_UNAUTHORIZED_DETECTED,
      aggregateType: AGGREGATE_TYPES.ACH,
      aggregateId: `unknown-${input.businessId}-${Date.now()}`,
      payload: {
        businessId: input.businessId,
        processorName: input.processorName,
        debitAmount: input.amount,
        externalRef: input.externalRef ?? null,
        processedAt: input.processedAt,
        violations: [violation],
        openComplaintCase: true,
        complaintCategory: 'unauthorized_ach_debit',
        violationType: 'UNKNOWN_PROCESSOR',
      },
      metadata: {
        source: 'debit-monitor',
        severity: 'critical',
        requiresImmediateAction: true,
      },
    });

    return { unauthorized: true, violations: [violation], debitEvent: null, authorization: null };
  }

  /**
   * Reconcile all debit events for a business over a date range.
   * Returns a summary of any newly detected violations.
   */
  async reconcileBusiness(
    tenantId: string,
    businessId: string,
    since: Date,
    until: Date = new Date(),
  ): Promise<{ scanned: number; violations: number; results: MonitorResult[] }> {
    const mon = logger.child({
      service: 'DebitMonitor',
      tenantId,
      businessId,
    });

    // Verify tenant ownership
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    const events = await this.prisma.debitEvent.findMany({
      where: {
        processedAt: { gte: since, lte: until },
        authorization: {
          businessId,
          business: { tenantId },
        },
      },
      select: { id: true },
      orderBy: { processedAt: 'asc' },
    });

    mon.info('Reconciliation started', {
      businessId,
      since: since.toISOString(),
      until: until.toISOString(),
      eventCount: events.length,
    });

    const results: MonitorResult[] = [];
    for (const evt of events) {
      const result = await this.evaluateDebitEvent(tenantId, evt.id);
      results.push(result);
    }

    const violationsCount = results.filter((r) => r.unauthorized).length;
    mon.info('Reconciliation complete', {
      scanned: events.length,
      violations: violationsCount,
    });

    return { scanned: events.length, violations: violationsCount, results };
  }

  // ── Violation detection logic ──────────────────────────────

  private detectViolations(
    debitEvent: DebitEvent,
    authorization: AchAuthorization,
  ): MonitorViolation[] {
    const violations: MonitorViolation[] = [];

    // ── Rule 1: Post-revocation debit ──
    if (authorization.status === 'revoked') {
      violations.push({
        type: 'POST_REVOCATION_DEBIT',
        description:
          `Debit of $${Number(debitEvent.amount).toFixed(2)} processed at ` +
          `${debitEvent.processedAt.toISOString()} after authorization was ` +
          `revoked at ${authorization.revokedAt?.toISOString() ?? 'unknown'}.`,
      });
    }

    // ── Rule 2: Suspended authorization ──
    if (authorization.status === 'suspended') {
      violations.push({
        type: 'SUSPENDED_AUTHORIZATION',
        description:
          `Debit received while authorization ${authorization.id} is suspended.`,
      });
    }

    // ── Rule 3: Amount tolerance (>10% above authorized) ──
    if (authorization.authorizedAmount !== null) {
      const authAmt = Number(authorization.authorizedAmount);
      const debitAmt = Number(debitEvent.amount);
      const upperBound = authAmt * (1 + AMOUNT_TOLERANCE_RATIO);

      if (debitAmt > upperBound) {
        const overagePct = (((debitAmt - authAmt) / authAmt) * 100).toFixed(1);
        violations.push({
          type: 'AMOUNT_OVER_TOLERANCE',
          description:
            `Debit amount $${debitAmt.toFixed(2)} exceeds authorized ` +
            `$${authAmt.toFixed(2)} by ${overagePct}% ` +
            `(maximum tolerance: ${(AMOUNT_TOLERANCE_RATIO * 100).toFixed(0)}%).`,
        });
      }
    }

    // ── Rule 4: Frequency exceeded ──
    if (debitEvent.frequency && authorization.authorizedFrequency) {
      const actualEquiv = FREQUENCY_DAILY_EQUIV[debitEvent.frequency.toLowerCase()];
      const authorizedEquiv =
        FREQUENCY_DAILY_EQUIV[authorization.authorizedFrequency.toLowerCase()];

      // A lower daily-equivalent number means MORE frequent
      if (
        actualEquiv !== undefined &&
        authorizedEquiv !== undefined &&
        actualEquiv < authorizedEquiv
      ) {
        violations.push({
          type: 'FREQUENCY_EXCEEDED',
          description:
            `Debit frequency "${debitEvent.frequency}" is more frequent than ` +
            `authorized frequency "${authorization.authorizedFrequency}".`,
        });
      }
    }

    return violations;
  }

  // ── Event publishing ───────────────────────────────────────

  private async publishUnauthorizedEvent(
    tenantId: string,
    businessId: string,
    authorization: AchAuthorization,
    debitEvent: DebitEvent,
    violations: MonitorViolation[],
  ): Promise<void> {
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
          violations: violations.map((v) => ({ type: v.type, description: v.description })),
          detectedAt: new Date().toISOString(),
          openComplaintCase: true,
          complaintCategory: 'unauthorized_ach_debit',
          complianceReference:
            'Yellowstone Capital FTC settlement (2020); RCG Advances FTC ban',
        },
        metadata: {
          source: 'debit-monitor',
          severity: 'critical',
          requiresImmediateAction: true,
        },
      });
    } catch (err) {
      logger.error('DebitMonitor: Failed to publish unauthorized debit event', {
        error: err instanceof Error ? err.message : String(err),
        authorizationId: authorization.id,
        debitEventId: debitEvent.id,
      });
    }
  }
}
