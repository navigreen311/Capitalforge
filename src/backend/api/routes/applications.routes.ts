// ============================================================
// CapitalForge — Applications API Routes (Wizard Support)
//
// New endpoints to support the New Application wizard:
//   GET    /api/applications          — paginated list with status grouping
//   POST   /api/applications          — create application with compliance gates
//   GET    /api/applications/:id      — detail with relations
//   PATCH  /api/applications/:id      — update fields
//   POST   /api/applications/:id/submit — submit with pre-submission checks
//   GET    /api/applications/compliance-gate/:businessId — compliance gate check
//   GET    /api/applications/velocity/:businessId        — velocity awareness
//
// Auth: tenantMiddleware on all routes.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import type { ApiResponse, TenantContext } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';
import { eventBus } from '../../events/event-bus.js';
import { ApplicationGateChecker } from '../../services/application-gates.js';
import {
  EVENT_TYPES,
  AGGREGATE_TYPES,
  PRE_SUBMISSION_DECLARATIONS,
  PRE_SUBMISSION_DECLARATION_VERSION,
} from '../../../shared/constants/index.js';

const router = Router();
const prisma = sharedPrisma;

// ── Helpers ───────────────────────────────────────────────────

function getTenantContext(req: Request): TenantContext {
  if (!req.tenant) {
    throw new Error('Tenant context not attached — ensure tenantMiddleware runs first.');
  }
  return req.tenant;
}

function ok(res: Response, data: unknown, meta?: Record<string, unknown>): void {
  const body: ApiResponse = { success: true, data, ...(meta ? { meta } : {}) };
  res.status(200).json(body);
}

function created(res: Response, data: unknown): void {
  const body: ApiResponse = { success: true, data };
  res.status(201).json(body);
}

function err(res: Response, status: number, code: string, message: string, details?: unknown): void {
  const body: ApiResponse = { success: false, error: { code, message, details } };
  res.status(status).json(body);
}

// ── GET /api/applications — paginated list with status grouping ──

router.get(
  '/applications',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({ route: 'GET /applications', requestId: req.requestId });

    try {
      const ctx = getTenantContext(req);
      const {
        status,
        businessId,
        page = '1',
        pageSize = '50',
        groupByStatus,
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));

      // Build filter
      const where: Record<string, unknown> = {};
      // Scope to tenant's businesses
      where.business = { tenantId: ctx.tenantId };
      if (status) where.status = status;
      if (businessId) where.businessId = businessId;

      const [applications, total] = await Promise.all([
        prisma.cardApplication.findMany({
          where,
          include: {
            business: {
              select: {
                id: true,
                legalName: true,
                tenantId: true,
                // The pipeline board shows who owns each application.
                advisor: { select: { firstName: true, lastName: true } },
              },
            },
            fundingRound: { select: { id: true, roundNumber: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * size,
          take: size,
        }),
        prisma.cardApplication.count({ where }),
      ]);

      // Map to API shape
      const items = applications.map((app) => ({
        id: app.id,
        businessId: app.businessId,
        businessName: app.business.legalName,
        issuer: app.issuer,
        cardProduct: app.cardProduct,
        status: app.status,
        // Null, not 0, when no limit was recorded — matching the detail routes
        // below. An application with no amount on file is not an application
        // for nothing, and the board counts how many applications its money
        // figures actually cover: a 0 here inflated that count with rows
        // carrying no amount at all.
        requestedLimit: app.creditLimit ? Number(app.creditLimit) : null,
        approvedLimit: app.status === 'approved' && app.creditLimit ? Number(app.creditLimit) : undefined,
        fundingRoundId: app.fundingRoundId,
        roundNumber: app.fundingRound?.roundNumber,
        // Null when no advisor is assigned, rather than a placeholder name.
        // The pipeline board renders it as unassigned.
        advisorName: app.business.advisor
          ? `${app.business.advisor.firstName} ${app.business.advisor.lastName}`.trim()
          : null,
        // Whether consent was captured before this application was filed.
        // Surfaced because the board shows a consent chip per card, and it was
        // previously drawn from sample data — a fabricated "complete" against a
        // real application is the wrong way round for a compliance signal.
        consentCapturedAt: app.consentCapturedAt ? app.consentCapturedAt.toISOString() : null,
        submittedAt: app.submittedAt,
        decidedAt: app.decidedAt,
        // The reason recorded against a declined application. Already
        // returned by the detail route; on the list too so a register of
        // decisions can show why each was refused without fetching every row
        // one at a time.
        declineReason: app.declineReason,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
      }));

      // Optional: group by status for kanban view
      if (groupByStatus === 'true') {
        const grouped: Record<string, typeof items> = {};
        for (const item of items) {
          // One lookup, not three. The create-then-push pair read as two
          // separate index accesses, so nothing connected the guard to the use.
          (grouped[item.status] ??= []).push(item);
        }
        ok(res, grouped, { page: pageNum, pageSize: size, total });
        return;
      }

      ok(res, items, { page: pageNum, pageSize: size, total });
    } catch (error) {
      log.error('Failed to list applications', { error });
      err(res, 500, 'INTERNAL_ERROR', 'Failed to list applications');
    }
  },
);

// ── GET /api/applications/compliance-gate/:businessId — check compliance gates ──

router.get(
  '/applications/compliance-gate/:businessId',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({ route: 'GET /applications/compliance-gate', requestId: req.requestId });

    try {
      const ctx = getTenantContext(req);
      const businessId = req.params.businessId!;

      // Verify business belongs to tenant
      const business = await prisma.business.findFirst({
        where: { id: businessId, tenantId: ctx.tenantId },
        select: { id: true, legalName: true, status: true },
      });

      if (!business) {
        err(res, 404, 'NOT_FOUND', 'Business not found');
        return;
      }

      // Check consent records
      const consentRecords = await prisma.consentRecord.findMany({
        where: { businessId, tenantId: ctx.tenantId, status: 'active' },
        select: { consentType: true, grantedAt: true, channel: true },
      });

      const hasApplicationConsent = consentRecords.some((c) => c.consentType === 'application');
      const hasTcpaConsent = consentRecords.some((c) => c.consentType === 'tcpa');
      const hasDataSharingConsent = consentRecords.some((c) => c.consentType === 'data_sharing');

      // Check acknowledgments
      const acknowledgments = await prisma.productAcknowledgment.findMany({
        where: { businessId },
        select: { acknowledgmentType: true, signedAt: true },
      });

      const hasProductReality = acknowledgments.some((a) => a.acknowledgmentType === 'product_reality');
      const hasFeeSchedule = acknowledgments.some((a) => a.acknowledgmentType === 'fee_schedule');

      // Check suitability
      const latestSuitability = await prisma.suitabilityCheck.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        select: { score: true, recommendation: true, noGoTriggered: true, noGoReasons: true },
      });

      const suitabilityStatus = latestSuitability
        ? latestSuitability.noGoTriggered
          ? 'not_suitable'
          : latestSuitability.recommendation === 'proceed'
            ? 'suitable'
            : 'review_required'
        : 'not_assessed';

      const gates = [
        {
          id: 'tcpa-consent',
          label: 'TCPA Consent',
          status: hasTcpaConsent ? 'pass' : 'missing',
          detail: hasTcpaConsent
            ? `Granted ${consentRecords.find((c) => c.consentType === 'tcpa')?.grantedAt.toISOString().split('T')[0]}`
            : 'TCPA consent not on file',
          critical: true,
        },
        {
          id: 'application-consent',
          label: 'Application Consent',
          status: hasApplicationConsent ? 'pass' : 'missing',
          detail: hasApplicationConsent
            ? `Granted ${consentRecords.find((c) => c.consentType === 'application')?.grantedAt.toISOString().split('T')[0]}`
            : 'Application consent not on file',
          critical: true,
        },
        {
          id: 'product-reality',
          label: 'Product-Reality Acknowledgment',
          status: hasProductReality ? 'pass' : 'missing',
          detail: hasProductReality
            ? `Signed ${acknowledgments.find((a) => a.acknowledgmentType === 'product_reality')?.signedAt.toISOString().split('T')[0]}`
            : 'Not signed',
          critical: true,
        },
        {
          id: 'suitability',
          label: 'Suitability Assessment',
          status: suitabilityStatus === 'suitable' ? 'pass' : suitabilityStatus === 'not_suitable' ? 'fail' : 'warning',
          detail: latestSuitability
            ? `Score: ${latestSuitability.score} — ${latestSuitability.recommendation}`
            : 'No suitability assessment found',
          critical: suitabilityStatus === 'not_suitable',
          score: latestSuitability?.score,
        },
        {
          id: 'data-sharing',
          label: 'Data Sharing Consent',
          status: hasDataSharingConsent ? 'pass' : 'warning',
          detail: hasDataSharingConsent ? 'Active' : 'Not on file (optional)',
          critical: false,
        },
      ];

      const canProceed = !gates.some((g) => g.critical && g.status !== 'pass');

      ok(res, { businessId, businessName: business.legalName, gates, canProceed });
    } catch (error) {
      log.error('Failed to check compliance gate', { error });
      err(res, 500, 'INTERNAL_ERROR', 'Failed to check compliance gate');
    }
  },
);

// ── GET /api/applications/velocity/:businessId — velocity awareness ──

router.get(
  '/applications/velocity/:businessId',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({ route: 'GET /applications/velocity', requestId: req.requestId });

    try {
      const ctx = getTenantContext(req);
      const businessId = req.params.businessId!;

      // Count recent applications per issuer (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const recentApps = await prisma.cardApplication.findMany({
        where: {
          businessId,
          business: { tenantId: ctx.tenantId },
          createdAt: { gte: ninetyDaysAgo },
        },
        select: { issuer: true, createdAt: true, status: true },
      });

      // Group by issuer
      const byIssuer: Record<string, number> = {};
      for (const app of recentApps) {
        byIssuer[app.issuer] = (byIssuer[app.issuer] || 0) + 1;
      }

      ok(res, {
        businessId,
        recentApplicationCount: recentApps.length,
        last90DaysByIssuer: byIssuer,
        applications: recentApps,
      });
    } catch (error) {
      log.error('Failed to check velocity', { error });
      err(res, 500, 'INTERNAL_ERROR', 'Failed to check velocity');
    }
  },
);

// ── POST /api/applications — create new application ──

router.post(
  '/applications',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({ route: 'POST /applications', requestId: req.requestId });

    try {
      const ctx = getTenantContext(req);
      const {
        businessId,
        fundingRoundId,
        issuer,
        cardProduct,
        requestedLimit,
        businessPurpose,
        intendedUseCategory,
        declarations,
        status: requestedStatus,
      } = req.body;

      if (!businessId || !issuer || !cardProduct) {
        err(res, 400, 'VALIDATION_ERROR', 'businessId, issuer, and cardProduct are required');
        return;
      }

      // Verify business belongs to tenant
      const business = await prisma.business.findFirst({
        where: { id: businessId, tenantId: ctx.tenantId },
      });

      if (!business) {
        err(res, 404, 'NOT_FOUND', 'Business not found');
        return;
      }

      // If submitting directly, validate declarations
      const isSubmit = requestedStatus === 'submitted';
      if (isSubmit) {
        if (!declarations || !Array.isArray(declarations) || declarations.length < 4) {
          err(res, 422, 'GATE_CHECK_FAILED', 'All 4 declarations must be acknowledged before submission');
          return;
        }

        // Check compliance gates
        const consentRecords = await prisma.consentRecord.findMany({
          where: { businessId, tenantId: ctx.tenantId, status: 'active' },
        });
        const hasConsent = consentRecords.some(
          (c) => c.consentType === 'tcpa' || c.consentType === 'application',
        );

        const acknowledgments = await prisma.productAcknowledgment.findMany({
          where: { businessId },
        });
        const hasAck = acknowledgments.some(
          (a) => a.acknowledgmentType === 'product_reality',
        );

        const suitability = await prisma.suitabilityCheck.findFirst({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
        });

        if (suitability?.noGoTriggered) {
          err(res, 422, 'GATE_CHECK_FAILED', 'Client suitability check indicates not suitable');
          return;
        }
      }

      // Validate funding round if provided
      if (fundingRoundId) {
        const round = await prisma.fundingRound.findFirst({
          where: { id: fundingRoundId, businessId },
        });
        if (!round) {
          err(res, 404, 'NOT_FOUND', 'Funding round not found');
          return;
        }
      }

      const application = await prisma.cardApplication.create({
        data: {
          businessId,
          fundingRoundId: fundingRoundId || null,
          issuer: issuer.trim(),
          cardProduct: cardProduct.trim(),
          creditLimit: requestedLimit ? Number(requestedLimit) : null,
          status: isSubmit ? 'submitted' : 'draft',
          // Null on create, submitted or not. Same reason as the submit route:
          // an application created directly as `submitted` has not captured
          // per-application consent, and stamping now would record the moment
          // of creation as the moment of consent.
          consentCapturedAt: null,
          submittedAt: isSubmit ? new Date() : null,
        },
        include: {
          business: { select: { id: true, legalName: true } },
          fundingRound: { select: { id: true, roundNumber: true } },
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: isSubmit ? 'application.submitted' : 'application.created',
          resource: 'CardApplication',
          resourceId: application.id,
          metadata: {
            issuer,
            cardProduct,
            requestedLimit,
            businessPurpose,
            intendedUseCategory,
            declarations: isSubmit ? declarations : undefined,
          },
        },
      });

      // Canonical ledger event. The auditLog row above is an operational
      // access record; the ledger is the immutable chain of custody relied
      // on for regulatory inquiry, so a card application — the most
      // consequential act in the product — must appear in it.
      await eventBus.publishAndPersist(ctx.tenantId, {
        eventType: isSubmit ? EVENT_TYPES.APPLICATION_SUBMITTED : EVENT_TYPES.APPLICATION_CREATED,
        aggregateType: AGGREGATE_TYPES.APPLICATION,
        aggregateId: application.id,
        payload: {
          applicationId:  application.id,
          businessId:     application.businessId,
          businessName:   application.business.legalName,
          issuer:         application.issuer,
          cardProduct:    application.cardProduct,
          requestedLimit: application.creditLimit ? Number(application.creditLimit) : null,
          fundingRoundId: application.fundingRoundId,
          status:         application.status,
          submittedAt:    application.submittedAt?.toISOString() ?? null,
          createdBy:      ctx.userId,
          ...(isSubmit ? { declarations } : {}),
        },
      });

      created(res, {
        id: application.id,
        businessId: application.businessId,
        businessName: application.business.legalName,
        issuer: application.issuer,
        cardProduct: application.cardProduct,
        status: application.status,
        requestedLimit: application.creditLimit ? Number(application.creditLimit) : null,
        fundingRoundId: application.fundingRoundId,
        roundNumber: application.fundingRound?.roundNumber,
        submittedAt: application.submittedAt?.toISOString(),
        createdAt: application.createdAt.toISOString(),
      });
    } catch (error) {
      log.error('Failed to create application', { error });
      err(res, 500, 'INTERNAL_ERROR', 'Failed to create application');
    }
  },
);

// ── PATCH /api/applications/:id — update application fields ──

router.patch(
  '/applications/:id',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({ route: 'PATCH /applications/:id', requestId: req.requestId });

    try {
      const ctx = getTenantContext(req);
      const id = req.params.id!;
      const updates = req.body;

      if (!updates || Object.keys(updates).length === 0) {
        err(res, 400, 'INVALID_BODY', 'Request body must contain fields to update');
        return;
      }

      // Verify application exists and belongs to tenant
      const existing = await prisma.cardApplication.findFirst({
        where: { id },
        include: { business: { select: { tenantId: true } } },
      });

      if (!existing || existing.business.tenantId !== ctx.tenantId) {
        err(res, 404, 'NOT_FOUND', 'Application not found');
        return;
      }

      // Only allow updates on draft/pending_consent applications
      if (!['draft', 'pending_consent'].includes(existing.status)) {
        err(res, 422, 'INVALID_STATE', 'Cannot update application in current status');
        return;
      }

      // Whitelist updatable fields
      const allowedFields = [
        'issuer', 'cardProduct', 'creditLimit', 'introApr',
        'introAprExpiry', 'regularApr', 'annualFee', 'cashAdvanceFee',
        'fundingRoundId',
      ];
      const safeUpdates: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (key in updates) safeUpdates[key] = updates[key];
      }

      const application = await prisma.cardApplication.update({
        where: { id },
        data: safeUpdates,
        include: {
          business: { select: { id: true, legalName: true } },
          fundingRound: { select: { id: true, roundNumber: true } },
        },
      });

      ok(res, {
        id: application.id,
        businessId: application.businessId,
        businessName: application.business.legalName,
        issuer: application.issuer,
        cardProduct: application.cardProduct,
        status: application.status,
        requestedLimit: application.creditLimit ? Number(application.creditLimit) : null,
        updatedAt: application.updatedAt.toISOString(),
      });
    } catch (error) {
      log.error('Failed to update application', { error });
      err(res, 500, 'INTERNAL_ERROR', 'Failed to update application');
    }
  },
);

// ── POST /api/applications/:id/submit — submit with compliance checks ──

router.post(
  '/applications/:id/submit',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({ route: 'POST /applications/:id/submit', requestId: req.requestId });

    try {
      const ctx = getTenantContext(req);
      const id = req.params.id!;
      const { declarations } = req.body;

      // Verify application
      const application = await prisma.cardApplication.findFirst({
        where: { id },
        include: {
          business: { select: { id: true, legalName: true, tenantId: true } },
        },
      });

      if (!application || application.business.tenantId !== ctx.tenantId) {
        err(res, 404, 'NOT_FOUND', 'Application not found');
        return;
      }

      if (application.status !== 'draft' && application.status !== 'pending_consent') {
        err(res, 422, 'INVALID_TRANSITION', `Cannot submit application in "${application.status}" status`);
        return;
      }

      // ── The four declarations, by name ──────────────────────
      //
      // This was `declarations.length >= 4 && declarations.every(Boolean)`, so
      // `[1, 'yes', {}, []]` passed and nothing anywhere said what was being
      // declared. The four sentences existed only as display strings in the
      // wizard; they are in shared/constants now, and the API requires each one
      // by id.
      //
      // An array of booleans cannot say WHICH thing was confirmed. Positional
      // truth is not an attestation — reorder the checkboxes and the same
      // payload attests to different things.
      const declared = declarations as Record<string, unknown> | undefined;
      if (!declared || typeof declared !== 'object' || Array.isArray(declared)) {
        err(
          res,
          422,
          'DECLARATIONS_REQUIRED',
          'declarations must be an object keyed by declaration id.',
          {
            required: PRE_SUBMISSION_DECLARATIONS.map((d) => ({ id: d.id, text: d.text })),
          },
        );
        return;
      }

      const missing = PRE_SUBMISSION_DECLARATIONS.filter((d) => declared[d.id] !== true);
      if (missing.length > 0) {
        // Named, so a caller learns which attestation it failed to make rather
        // than being told a count.
        err(res, 422, 'DECLARATIONS_INCOMPLETE', 'Every pre-submission declaration must be confirmed.', {
          missing: missing.map((d) => ({ id: d.id, text: d.text })),
        });
        return;
      }

      // ── The six pre-submission gates, the same ones the status path runs ──
      //
      // This route ran its own three inline checks — a consent record of type
      // tcpa OR application on ANY channel, a product_reality acknowledgment,
      // and suitability noGoTriggered — and nothing else. The status path
      // (PUT /applications/:id/status) runs ApplicationGateChecker.checkAll,
      // which is six: product_reality, consent_captured, suitability, kyb_kyc,
      // maker_checker and, for credit-union issuers, cu_membership_disclosure.
      //
      // So two routes reached `submitted` with different controls, and the one
      // named "submit" was the weaker of the two. specification.md section 1
      // states "maker-checker on submit" as a property of the system; it was a
      // property of the other path. Burkham's compliance library says no agent
      // submits, and maker-checker is the control that enforces it — on the
      // route nobody was using.
      //
      // The inline checks are gone rather than kept alongside. Two
      // implementations of one gate disagree the first time either changes, and
      // the looser one was here.
      const businessId = application.businessId;

      const meta =
        application.adverseActionNotice != null &&
        typeof application.adverseActionNotice === 'object' &&
        !Array.isArray(application.adverseActionNotice)
          ? (application.adverseActionNotice as Record<string, unknown>)
          : {};
      // From the column, falling back to the Json for rows the backfill could
      // not resolve. The column is the one the database can enforce.
      const createdByUserId =
        application.createdByUserId
        ?? (typeof meta.createdByUserId === 'string' ? meta.createdByUserId : '');
      const approverUserId =
        typeof (req.body as { approvedByUserId?: unknown }).approvedByUserId === 'string'
          ? ((req.body as { approvedByUserId: string }).approvedByUserId)
          : '';

      const gateSummary = await new ApplicationGateChecker(prisma).checkAll(
        id,
        businessId,
        ctx.tenantId,
        { createdByUserId, approverUserId },
        // No issuerType argument, matching the status path — and gate 6
        // (cu_membership_disclosure) is therefore unreachable from either
        // route. CardApplication has an `issuer` name and no issuer TYPE
        // column, so nothing anywhere can pass 'credit_union'. Left as it is
        // rather than invented here: giving this route a source the other one
        // does not have would recreate the divergence this change removes.
      );

      if (!gateSummary.allPassed) {
        err(res, 422, 'COMPLIANCE_CHECK_FAILED', 'Pre-submission gate checks failed', {
          failedGates: gateSummary.failedGates,
          // The reason per gate, not just its name: "maker_checker" alone does
          // not tell an advisor whether they forgot an approver or named
          // themselves.
          issues: gateSummary.results
            .filter((r) => !r.passed)
            .map((r) => ({ gate: r.gate, reason: r.reason })),
        });
        return;
      }

      // Update to submitted
      const updated = await prisma.cardApplication.update({
        where: { id },
        data: {
          status: 'submitted',
          submittedAt: new Date(),
          // consentCapturedAt is NOT written here.
          //
          // It was set to `new Date()` on submit, so the gate read it, passed,
          // and then this write destroyed the value that satisfied it. The
          // field that records when consent was captured recorded when the
          // application was submitted — for every application that has ever
          // been submitted through this route.
          //
          // It is stamped by the `pending_consent` transition, which is when
          // consent is actually captured per application, and that is the value
          // that matters.
        },
        include: {
          business: { select: { id: true, legalName: true } },
          fundingRound: { select: { id: true, roundNumber: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'application.submitted',
          resource: 'CardApplication',
          resourceId: id,
          metadata: {
            previousStatus: application.status,
            // Ids and the wording version, not the raw payload. `[true,true,
            // true,true]` in an audit row records that four things were
            // confirmed without recording which four.
            declarations: PRE_SUBMISSION_DECLARATIONS.map((d) => d.id),
            declarationVersion: PRE_SUBMISSION_DECLARATION_VERSION,
          },
        },
      });

      const businessName = updated.business.legalName;

      // Canonical ledger event for the status transition (see POST /applications).
      await eventBus.publishAndPersist(ctx.tenantId, {
        eventType: EVENT_TYPES.APPLICATION_SUBMITTED,
        aggregateType: AGGREGATE_TYPES.APPLICATION,
        aggregateId: updated.id,
        payload: {
          applicationId:  updated.id,
          businessId:     updated.businessId,
          businessName,
          issuer:         updated.issuer,
          cardProduct:    updated.cardProduct,
          previousStatus: application.status,
          status:         updated.status,
          submittedAt:    updated.submittedAt?.toISOString() ?? null,
          declarations,
          submittedBy:    ctx.userId,
        },
      });

      ok(res, {
        id: updated.id,
        businessId: updated.businessId,
        businessName,
        issuer: updated.issuer,
        cardProduct: updated.cardProduct,
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString(),
        message: 'Application submitted successfully',
      });
    } catch (error) {
      log.error('Failed to submit application', { error });
      err(res, 500, 'INTERNAL_ERROR', 'Failed to submit application');
    }
  },
);

export default router;
