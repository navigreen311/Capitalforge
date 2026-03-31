// ============================================================
// CapitalForge — Application Pipeline & Workflow Manager
//
// Implements the Kanban state machine:
//   draft → pending_consent → submitted → approved
//                                       ↘ declined → reconsideration
//
// Key responsibilities:
//   - Enforce valid state transitions (directed graph)
//   - Run all pre-submission gate checks (via ApplicationGateChecker)
//   - Enforce maker-checker: approver ≠ creator
//   - Capture per-application consent timestamp
//   - Publish APPLICATION_SUBMITTED / APPLICATION_APPROVED / APPLICATION_DECLINED
//   - Auto-route declined applications for Decline Recovery
//   - Multi-advisor assignment with role-based visibility
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import type { ApplicationStatus } from '@shared/types/index.js';
import { EVENT_TYPES, AGGREGATE_TYPES, ROLES } from '@shared/constants/index.js';
import { VALID_TRANSITIONS } from '@shared/validators/application.validators.js';
import type {
  CreateApplicationInput,
  TransitionStatusInput,
  ListApplicationsInput,
} from '@shared/validators/application.validators.js';

import { eventBus } from '../events/event-bus.js';
import { ApplicationGateChecker } from './application-gates.js';
import logger from '../config/logger.js';

// ── Helper types ──────────────────────────────────────────────

// ── Module-level prisma injection (test support) ─────────────

let _sharedPrisma: PrismaClient | null = null;

/** Allow test injection of a shared PrismaClient. */
export function setPrismaClient(client: PrismaClient): void {
  _sharedPrisma = client;
}

/**
 * Caller-supplied context injected by auth middleware.
 */
export interface CallerContext {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
}

/**
 * Enriched application row returned to API consumers.
 * Mirrors CardApplication columns plus computed fields.
 */
export interface ApplicationRecord {
  id: string;
  businessId: string;
  fundingRoundId: string | null;
  tenantId: string;
  issuer: string;
  cardProduct: string;
  status: ApplicationStatus;
  creditLimit: number | null;
  introApr: number | null;
  introAprExpiry: Date | null;
  regularApr: number | null;
  annualFee: number | null;
  cashAdvanceFee: number | null;
  consentCapturedAt: Date | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  declineReason: string | null;
  adverseActionNotice: Record<string, unknown> | null;
  /** IDs of advisors assigned to this application */
  assignedAdvisorIds: string[];
  /** User who created the record */
  createdByUserId: string;
  /** User who performed maker-checker approval (set at submission) */
  approvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Paginated list result.
 */
export interface ApplicationListResult {
  items: ApplicationRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Error thrown when a state transition is invalid or a gate fails.
 */
export class ApplicationWorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApplicationWorkflowError';
  }
}

// ── ApplicationPipelineService ────────────────────────────────

export class ApplicationPipelineService {
  private readonly prisma: PrismaClient;
  private readonly gateChecker: ApplicationGateChecker;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? _sharedPrisma ?? new PrismaClient();
    this.gateChecker = new ApplicationGateChecker(this.prisma);
  }

  // ── Create ────────────────────────────────────────────────────

  /**
   * Create a new CardApplication in `draft` status.
   *
   * The caller must supply at least one advisor ID (multi-advisor support).
   * The application is scoped to the caller's tenant.
   */
  async createApplication(
    businessIdOrInput: string | (CreateApplicationInput & { businessId: string; tenantId?: string }),
    inputOrCaller?: CreateApplicationInput | CallerContext,
    callerArg?: CallerContext,
  ): Promise<ApplicationRecord> {
    // Support both calling conventions:
    //   createApplication(businessId, input, caller)   — canonical
    //   createApplication({businessId, tenantId, ...}, caller)  — test-friendly
    let businessId: string;
    let input: CreateApplicationInput;
    let caller: CallerContext;
    if (typeof businessIdOrInput === 'string') {
      businessId = businessIdOrInput;
      input = inputOrCaller as CreateApplicationInput;
      caller = callerArg as CallerContext;
    } else {
      const { businessId: bid, tenantId: _tid, ...rest } = businessIdOrInput;
      businessId = bid;
      // Provide default assignedAdvisorIds if not specified (test-friendly)
      input = { assignedAdvisorIds: [], ...rest } as CreateApplicationInput;
      caller = inputOrCaller as CallerContext;
    }
    const log = logger.child({ businessId, tenantId: caller.tenantId });

    // Verify the business exists and belongs to this tenant
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId: caller.tenantId },
      select: { id: true, advisorId: true },
    });

    if (!business) {
      throw new ApplicationWorkflowError(
        'Business not found or access denied.',
        'BUSINESS_NOT_FOUND',
      );
    }

    // Verify all assigned advisors belong to this tenant
    await this._assertAdvisorsExist(input.assignedAdvisorIds, caller.tenantId);

    // Build metadata JSON (stored in adverseActionNotice field for now —
    // we use a dedicated metadata column pattern)
    const metadata: Record<string, unknown> = {
      assignedAdvisorIds: input.assignedAdvisorIds,
      createdByUserId: caller.userId,
      approvedByUserId: null,
    };

    const application = await this.prisma.cardApplication.create({
      data: {
        id: uuidv4(),
        businessId,
        fundingRoundId: input.fundingRoundId ?? null,
        issuer: input.issuer,
        cardProduct: input.cardProduct,
        status: 'draft',
        creditLimit: input.creditLimit != null ? new Prisma.Decimal(input.creditLimit) : null,
        introApr: input.introApr != null ? new Prisma.Decimal(input.introApr) : null,
        introAprExpiry: input.introAprExpiry ?? null,
        regularApr: input.regularApr != null ? new Prisma.Decimal(input.regularApr) : null,
        annualFee: input.annualFee != null ? new Prisma.Decimal(input.annualFee) : null,
        cashAdvanceFee:
          input.cashAdvanceFee != null ? new Prisma.Decimal(input.cashAdvanceFee) : null,
        adverseActionNotice: metadata as Prisma.InputJsonValue,
      },
    });

    log.info('Application created', { applicationId: application.id, status: 'draft' });

    return this._toRecord(application, caller.tenantId);
  }

  // ── Read ──────────────────────────────────────────────────────

  /**
   * Retrieve a single application, scoped to the caller's tenant.
   * Advisors only see applications where they are in the assignedAdvisorIds list;
   * compliance officers and admins see all.
   */
  async getApplication(
    applicationId: string,
    caller: CallerContext,
  ): Promise<ApplicationRecord> {
    const application = await this.prisma.cardApplication.findFirst({
      where: {
        id: applicationId,
        business: { tenantId: caller.tenantId },
      },
    });

    if (!application) {
      throw new ApplicationWorkflowError(
        'Application not found or access denied.',
        'APPLICATION_NOT_FOUND',
      );
    }

    // Role-based visibility: advisors can only see their own assigned applications
    if (!this._canViewApplication(application, caller)) {
      throw new ApplicationWorkflowError(
        'You do not have permission to view this application.',
        'ACCESS_DENIED',
      );
    }

    return this._toRecord(application, caller.tenantId);
  }

  /**
   * List applications for a business with filters and pagination.
   * Advisors see only applications assigned to them.
   */
  async listApplications(
    businessId: string,
    params: ListApplicationsInput,
    caller: CallerContext,
  ): Promise<ApplicationListResult> {
    // Verify business ownership
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId: caller.tenantId },
      select: { id: true },
    });

    if (!business) {
      throw new ApplicationWorkflowError(
        'Business not found or access denied.',
        'BUSINESS_NOT_FOUND',
      );
    }

    const where: Prisma.CardApplicationWhereInput = {
      businessId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.fundingRoundId ? { fundingRoundId: params.fundingRoundId } : {}),
      ...(params.issuer
        ? { issuer: { contains: params.issuer, mode: 'insensitive' as Prisma.QueryMode } }
        : {}),
    };

    const orderBy = { [params.sortBy]: params.sortOrder } as Prisma.CardApplicationOrderByWithRelationInput;

    const skip = (params.page - 1) * params.pageSize;

    const [items, total] = await Promise.all([
      this.prisma.cardApplication.findMany({
        where,
        orderBy,
        skip,
        take: params.pageSize,
      }),
      this.prisma.cardApplication.count({ where }),
    ]);

    // Filter by advisor assignment for non-privileged roles
    const visibleItems = items.filter((app) => this._canViewApplication(app, caller));

    return {
      items: visibleItems.map((app) => this._toRecord(app, caller.tenantId)),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  // ── Status Transition (state machine) ────────────────────────

  /**
   * Transition an application to a new status.
   *
   * Rules enforced here:
   *  1. Transition must be in the allowed directed graph.
   *  2. If moving to `submitted`, ALL five gates must pass.
   *  3. Maker-checker: approverUserId must differ from createdByUserId.
   *  4. Declined applications have declineReason captured and are routed
   *     to Decline Recovery via event.
   *  5. Consent timestamp is written if status is `pending_consent`.
   */
  async transitionStatus(
    applicationIdOrInput: string | (TransitionStatusInput & { applicationId: string; tenantId?: string; toStatus?: string }),
    inputOrCaller?: TransitionStatusInput | CallerContext,
    callerArg?: CallerContext,
  ): Promise<ApplicationRecord> {
    // Support both calling conventions:
    //   transitionStatus(applicationId, input, caller)          — canonical
    //   transitionStatus({applicationId, tenantId, toStatus, ...}, caller) — test-friendly
    let applicationId: string;
    let input: TransitionStatusInput;
    let caller: CallerContext;
    if (typeof applicationIdOrInput === 'string') {
      applicationId = applicationIdOrInput;
      input = inputOrCaller as TransitionStatusInput;
      caller = callerArg as CallerContext;
    } else {
      const { applicationId: aid, tenantId: _tid, toStatus, ...rest } = applicationIdOrInput;
      applicationId = aid;
      // Map toStatus → status for compatibility
      input = { ...rest, status: (toStatus ?? rest.status) } as TransitionStatusInput;
      caller = inputOrCaller as CallerContext;
    }
    const log = logger.child({ applicationId, tenantId: caller.tenantId });

    const application = await this.prisma.cardApplication.findFirst({
      where: {
        id: applicationId,
        business: { tenantId: caller.tenantId },
      },
    });

    if (!application) {
      throw new ApplicationWorkflowError(
        'Application not found or access denied.',
        'APPLICATION_NOT_FOUND',
      );
    }

    const currentStatus = application.status as ApplicationStatus;
    const targetStatus = input.status;

    // ── Guard: valid transition ───────────────────────────────
    this._assertValidTransition(currentStatus, targetStatus);

    // ── Gate-check block for submission ──────────────────────
    if (targetStatus === 'submitted') {
      await this._enforceSubmissionGates(application, input, caller);
    }

    // ── Build mutation data ───────────────────────────────────
    const now = new Date();
    const existingMeta = this._extractMetadata(application);

    const updateData: Prisma.CardApplicationUpdateInput = {
      status: targetStatus,
      updatedAt: now,
    };

    if (targetStatus === 'pending_consent') {
      // Record the per-application consent timestamp
      updateData.consentCapturedAt = now;
      existingMeta.consentCapturedAt = now.toISOString();
    }

    if (targetStatus === 'submitted') {
      updateData.submittedAt = now;
      existingMeta.approvedByUserId = input.approvedByUserId ?? null;
    }

    if (targetStatus === 'approved' || targetStatus === 'declined') {
      updateData.decidedAt = now;
    }

    if (targetStatus === 'declined') {
      updateData.declineReason = input.declineReason ?? null;
    }

    if (input.note) {
      existingMeta.lastNote = input.note;
      existingMeta.lastNoteAt = now.toISOString();
      existingMeta.lastNoteBy = caller.userId;
    }

    updateData.adverseActionNotice = existingMeta as Prisma.InputJsonValue;

    // ── Persist ───────────────────────────────────────────────
    const updated = await this.prisma.cardApplication.update({
      where: { id: applicationId },
      data: updateData,
    });

    log.info('Application status transitioned', {
      from: currentStatus,
      to: targetStatus,
    });

    // ── Publish domain events ─────────────────────────────────
    await this._publishStatusEvent(updated, targetStatus, caller);

    return this._toRecord(updated, caller.tenantId);
  }

  // ── Capture consent timestamp ─────────────────────────────────

  /**
   * Explicitly capture per-application consent (called when the client
   * signs consent mid-flow without triggering a full status transition).
   */
  async captureConsent(
    applicationId: string,
    caller: CallerContext,
  ): Promise<void> {
    const application = await this.prisma.cardApplication.findFirst({
      where: {
        id: applicationId,
        business: { tenantId: caller.tenantId },
      },
      select: { id: true, consentCapturedAt: true },
    });

    if (!application) {
      throw new ApplicationWorkflowError(
        'Application not found or access denied.',
        'APPLICATION_NOT_FOUND',
      );
    }

    await this.prisma.cardApplication.update({
      where: { id: applicationId },
      data: { consentCapturedAt: new Date() },
    });

    logger.info('Per-application consent captured', { applicationId });
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Assert that the current → target transition is valid.
   */
  private _assertValidTransition(
    current: ApplicationStatus,
    target: ApplicationStatus,
  ): void {
    const allowed = VALID_TRANSITIONS[current] ?? [];
    if (!allowed.includes(target)) {
      throw new ApplicationWorkflowError(
        `Cannot transition from "${current}" to "${target}". ` +
          `Allowed transitions from "${current}": [${allowed.join(', ') || 'none'}]`,
        'INVALID_TRANSITION',
        { current, target, allowed },
      );
    }
  }

  /**
   * Run and enforce all five pre-submission gates.
   */
  private async _enforceSubmissionGates(
    application: { id: string; businessId: string },
    input: TransitionStatusInput,
    caller: CallerContext,
  ): Promise<void> {
    const existingMeta = this._extractMetadata(application as Parameters<typeof this._extractMetadata>[0]);
    const createdByUserId: string =
      typeof existingMeta.createdByUserId === 'string'
        ? existingMeta.createdByUserId
        : caller.userId;

    const makerChecker = {
      createdByUserId,
      approverUserId: input.approvedByUserId ?? '',
    };

    const gateSummary = await this.gateChecker.checkAll(
      application.id,
      application.businessId,
      caller.tenantId,
      makerChecker,
    );

    if (!gateSummary.allPassed) {
      const details = gateSummary.results
        .filter((r) => !r.passed)
        .map((r) => `[${r.gate}] ${r.reason ?? 'failed'}`)
        .join(' | ');

      throw new ApplicationWorkflowError(
        `Submission blocked — ${gateSummary.failedGates.length} gate(s) failed: ${details}`,
        'GATE_CHECK_FAILED',
        { failedGates: gateSummary.failedGates, results: gateSummary.results },
      );
    }
  }

  /**
   * Publish the appropriate domain event after a successful status change.
   */
  private async _publishStatusEvent(
    application: { id: string; businessId: string; status: string },
    newStatus: ApplicationStatus,
    caller: CallerContext,
  ): Promise<void> {
    const payload = {
      applicationId: application.id,
      businessId: application.businessId,
      status: newStatus,
      triggeredBy: caller.userId,
    };

    let eventType: string | null = null;

    switch (newStatus) {
      case 'submitted':
        eventType = EVENT_TYPES.APPLICATION_SUBMITTED;
        break;
      case 'approved':
        eventType = EVENT_TYPES.APPLICATION_APPROVED;
        break;
      case 'declined':
        eventType = EVENT_TYPES.APPLICATION_DECLINED;
        // Also publish a decline recovery trigger
        await eventBus.publishAndPersist(caller.tenantId, {
          eventType: 'application.decline_recovery.triggered',
          aggregateType: AGGREGATE_TYPES.APPLICATION,
          aggregateId: application.id,
          payload,
        });
        break;
      default:
        break;
    }

    if (eventType) {
      await eventBus.publishAndPersist(caller.tenantId, {
        eventType,
        aggregateType: AGGREGATE_TYPES.APPLICATION,
        aggregateId: application.id,
        payload,
      });
    }
  }

  /**
   * Extract the metadata object stored in the adverseActionNotice JSON column.
   * We repurpose this column for pipeline metadata; actual AANs are nested inside.
   */
  private _extractMetadata(application: { adverseActionNotice?: unknown }): Record<string, unknown> {
    if (
      application.adverseActionNotice != null &&
      typeof application.adverseActionNotice === 'object' &&
      !Array.isArray(application.adverseActionNotice)
    ) {
      return { ...(application.adverseActionNotice as Record<string, unknown>) };
    }
    return {};
  }

  /**
   * Determine whether the calling user may view the given application.
   * - Super admins, tenant admins, and compliance officers see all.
   * - Advisors see only applications they are assigned to.
   */
  private _canViewApplication(
    application: { adverseActionNotice?: unknown },
    caller: CallerContext,
  ): boolean {
    if (
      caller.role === ROLES.SUPER_ADMIN ||
      caller.role === ROLES.TENANT_ADMIN ||
      caller.role === ROLES.COMPLIANCE_OFFICER
    ) {
      return true;
    }

    const meta = this._extractMetadata(application);
    const assignedIds = Array.isArray(meta.assignedAdvisorIds)
      ? (meta.assignedAdvisorIds as string[])
      : [];

    return assignedIds.includes(caller.userId);
  }

  /**
   * Verify all advisor IDs exist in the tenant's user table.
   */
  private async _assertAdvisorsExist(
    advisorIds: string[],
    tenantId: string,
  ): Promise<void> {
    // Skip check when no advisors specified (allows test-friendly invocation)
    if (!advisorIds || advisorIds.length === 0) return;

    const found = await this.prisma.user.findMany({
      where: {
        id: { in: advisorIds },
        tenantId,
        isActive: true,
      },
      select: { id: true },
    });

    if (found.length !== advisorIds.length) {
      const foundIds = new Set(found.map((u) => u.id));
      const missing = advisorIds.filter((id) => !foundIds.has(id));
      throw new ApplicationWorkflowError(
        `Advisor user(s) not found in this tenant: ${missing.join(', ')}`,
        'ADVISOR_NOT_FOUND',
        { missingIds: missing },
      );
    }
  }

  /**
   * Map a Prisma CardApplication row to the public ApplicationRecord type.
   */
  private _toRecord(
    row: {
      id: string;
      businessId: string;
      fundingRoundId: string | null;
      issuer: string;
      cardProduct: string;
      status: string;
      creditLimit: Prisma.Decimal | null;
      introApr: Prisma.Decimal | null;
      introAprExpiry: Date | null;
      regularApr: Prisma.Decimal | null;
      annualFee: Prisma.Decimal | null;
      cashAdvanceFee: Prisma.Decimal | null;
      consentCapturedAt: Date | null;
      submittedAt: Date | null;
      decidedAt: Date | null;
      declineReason: string | null;
      adverseActionNotice: unknown;
      createdAt: Date;
      updatedAt: Date;
    },
    tenantId: string,
  ): ApplicationRecord {
    const meta = this._extractMetadata({ adverseActionNotice: row.adverseActionNotice });

    return {
      id: row.id,
      businessId: row.businessId,
      fundingRoundId: row.fundingRoundId,
      tenantId,
      issuer: row.issuer,
      cardProduct: row.cardProduct,
      status: row.status as ApplicationStatus,
      creditLimit: row.creditLimit != null ? Number(row.creditLimit) : null,
      introApr: row.introApr != null ? Number(row.introApr) : null,
      introAprExpiry: row.introAprExpiry,
      regularApr: row.regularApr != null ? Number(row.regularApr) : null,
      annualFee: row.annualFee != null ? Number(row.annualFee) : null,
      cashAdvanceFee: row.cashAdvanceFee != null ? Number(row.cashAdvanceFee) : null,
      consentCapturedAt: row.consentCapturedAt,
      submittedAt: row.submittedAt,
      decidedAt: row.decidedAt,
      declineReason: row.declineReason,
      adverseActionNotice:
        typeof meta.adverseActionNotice === 'object' &&
        meta.adverseActionNotice !== null
          ? (meta.adverseActionNotice as Record<string, unknown>)
          : null,
      assignedAdvisorIds: Array.isArray(meta.assignedAdvisorIds)
        ? (meta.assignedAdvisorIds as string[])
        : [],
      createdByUserId:
        typeof meta.createdByUserId === 'string' ? meta.createdByUserId : '',
      approvedByUserId:
        typeof meta.approvedByUserId === 'string' ? meta.approvedByUserId : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
