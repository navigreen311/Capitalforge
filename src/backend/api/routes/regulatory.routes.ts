// ============================================================
// CapitalForge — Regulatory Intelligence & Funds-Flow Routes
//
// All routes require authentication (tenantMiddleware).
// COMPLIANCE_READ permission required for GET endpoints.
// COMPLIANCE_WRITE permission required for POST endpoints.
//
// Endpoints:
//
//   Regulatory Intelligence:
//     GET  /api/regulatory/alerts                   — list alerts (filter by status/source)
//     POST /api/regulatory/alerts/:id/review        — mark alert reviewed / resolved
//     GET  /api/regulatory/impact/:ruleId           — detailed impact assessment for an alert
//
//   Funds-Flow Classification:
//     POST /api/funds-flow/classify                 — classify a payment workflow
//     GET  /api/funds-flow/classifications          — list saved classifications
//     GET  /api/funds-flow/licensing-status         — workflows needing licensing review
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

import {
  RegulatoryIntelligenceService,
} from '../../services/regulatory-intelligence.service.js';
import type {
  RegulatoryAlertRecord,
  ImpactAssessment,
  AlertReviewInput,
  AlertStatus,
  RegulatorySource,
} from '../../services/regulatory-intelligence.service.js';

import {
  FundsFlowClassificationService,
} from '../../services/funds-flow-classification.service.js';
import type {
  FundsFlowClassificationRecord,
  WorkflowClassificationInput,
  LicensingEscalation,
  AmlReadinessInput,
  PaymentFlowRole,
} from '../../services/funds-flow-classification.service.js';

export const regulatoryRouter = Router();

// ── Lazy-initialised service instances ────────────────────────────

let prisma: PrismaClient | null = null;
let regulatorySvc: RegulatoryIntelligenceService | null = null;
let fundsFlowSvc: FundsFlowClassificationService | null = null;

function getRegulatoryService(): RegulatoryIntelligenceService {
  if (!regulatorySvc) {
    prisma = prisma ?? new PrismaClient();
    regulatorySvc = new RegulatoryIntelligenceService(prisma);
  }
  return regulatorySvc;
}

function getFundsFlowService(): FundsFlowClassificationService {
  if (!fundsFlowSvc) {
    prisma = prisma ?? new PrismaClient();
    fundsFlowSvc = new FundsFlowClassificationService(prisma);
  }
  return fundsFlowSvc;
}

// ── Permission guard ──────────────────────────────────────────────

function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ctx = req.tenant;
    if (!ctx) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
      return;
    }
    if (!ctx.permissions.includes(permission)) {
      next(forbidden(`Permission "${permission}" is required for this action.`));
      return;
    }
    next();
  };
}

// ── Validation schemas ────────────────────────────────────────────

const AlertsQuerySchema = z.object({
  status: z
    .enum(['new', 'under_review', 'resolved', 'dismissed'])
    .optional(),
  source: z
    .enum(['FTC', 'CFPB', 'State_AG', 'Visa', 'Mastercard', 'OCC', 'FDIC', 'FRB', 'FinCEN', 'State_DFS'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const ReviewAlertBodySchema = z.object({
  newStatus: z.enum(['under_review', 'resolved', 'dismissed']),
  notes: z.string().max(2000).optional(),
});

const ClassifyWorkflowBodySchema = z.object({
  workflowName:               z.string().min(1).max(200),
  receivesAndRemits:          z.boolean(),
  isBeneficialRecipient:      z.boolean(),
  mcc:                        z.string().max(4).optional(),
  involvesStoredValue:        z.boolean(),
  includesCashElement:        z.boolean(),
  isBillPayment:              z.boolean(),
  isMerchantOfRecord:         z.boolean(),
  uniquePayeeCountMonthly:    z.number().int().nonnegative().optional(),
  averageTransactionAmountUsd:z.number().nonnegative().optional(),
  legalOpinionRef:            z.string().max(200).optional(),
});

const ClassificationsQuerySchema = z.object({
  classification: z
    .enum(['merchant', 'bill_payment', 'account_funding', 'cash_disbursement', 'money_transmission_risk'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// ── ─────────────────────────────────────────────────────────── ──
// REGULATORY INTELLIGENCE ROUTES
// ── ─────────────────────────────────────────────────────────── ──

// ─────────────────────────────────────────────────────────────────
// GET /api/regulatory/alerts
// List regulatory alerts for the requesting tenant.
// Optional query params: status, source, limit
// ─────────────────────────────────────────────────────────────────
regulatoryRouter.get(
  '/regulatory/alerts',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = AlertsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest('Invalid query parameters.', parsed.error.flatten());
      }

      const { status, source, limit } = parsed.data;

      const svc = getRegulatoryService();
      const alerts: RegulatoryAlertRecord[] = await svc.listAlerts(tenantId, {
        status: status as AlertStatus | undefined,
        source: source as RegulatorySource | undefined,
        limit,
      });

      logger.info('Regulatory alerts listed', {
        requestId: req.requestId,
        tenantId,
        count: alerts.length,
        status,
        source,
      });

      const body: ApiResponse<{ alerts: RegulatoryAlertRecord[]; total: number }> = {
        success: true,
        data: { alerts, total: alerts.length },
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/regulatory/alerts/:id/review
// Mark a regulatory alert as reviewed / resolved / dismissed.
// Body: { newStatus, notes? }
// ─────────────────────────────────────────────────────────────────
regulatoryRouter.post(
  '/regulatory/alerts/:id/review',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: alertId } = req.params;
      const { tenantId, userId } = req.tenant!;

      if (!alertId || alertId.trim().length === 0) {
        throw badRequest('Alert ID is required.');
      }

      const parsed = ReviewAlertBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const { newStatus, notes } = parsed.data;

      const svc = getRegulatoryService();

      const input: AlertReviewInput = {
        alertId:    alertId.trim(),
        tenantId,
        reviewedBy: userId ?? 'system',
        newStatus:  newStatus as AlertStatus,
        notes,
      };

      let updated: RegulatoryAlertRecord;
      try {
        updated = await svc.reviewAlert(input);
      } catch (svcErr: unknown) {
        const msg = svcErr instanceof Error ? svcErr.message : String(svcErr);
        if (msg.includes('not found')) {
          throw notFound(`Regulatory alert ${alertId}`);
        }
        throw svcErr;
      }

      logger.info('Regulatory alert reviewed', {
        requestId: req.requestId,
        tenantId,
        alertId,
        newStatus,
        reviewedBy: input.reviewedBy,
      });

      const body: ApiResponse<RegulatoryAlertRecord> = {
        success: true,
        data: updated,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/regulatory/impact/:ruleId
// Return the detailed impact assessment for a regulatory alert.
// ─────────────────────────────────────────────────────────────────
regulatoryRouter.get(
  '/regulatory/impact/:ruleId',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ruleId } = req.params;
      const { tenantId } = req.tenant!;

      if (!ruleId || ruleId.trim().length === 0) {
        throw badRequest('Rule ID is required.');
      }

      const svc = getRegulatoryService();

      let assessment: ImpactAssessment;
      try {
        assessment = await svc.getImpactAssessment(ruleId.trim(), tenantId);
      } catch (svcErr: unknown) {
        const msg = svcErr instanceof Error ? svcErr.message : String(svcErr);
        if (msg.includes('not found')) {
          throw notFound(`Regulatory alert ${ruleId}`);
        }
        throw svcErr;
      }

      logger.info('Regulatory impact assessment retrieved', {
        requestId: req.requestId,
        tenantId,
        ruleId,
        impactScore: assessment.impactScore,
        urgency: assessment.urgency,
      });

      const body: ApiResponse<ImpactAssessment> = {
        success: true,
        data: assessment,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ── ─────────────────────────────────────────────────────────── ──
// FUNDS-FLOW CLASSIFICATION ROUTES
// ── ─────────────────────────────────────────────────────────── ──

// ─────────────────────────────────────────────────────────────────
// POST /api/funds-flow/classify
// Classify a payment workflow and persist the result.
// ─────────────────────────────────────────────────────────────────
regulatoryRouter.post(
  '/funds-flow/classify',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = ClassifyWorkflowBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const input: WorkflowClassificationInput = {
        tenantId,
        ...parsed.data,
      };

      const svc = getFundsFlowService();
      const result: FundsFlowClassificationRecord = await svc.classifyWorkflow(input);

      const statusCode = result.moneyTransmissionAlert ? 200 : 201;

      logger.info('Funds-flow workflow classified', {
        requestId:              req.requestId,
        tenantId,
        workflowName:           result.workflowName,
        classification:         result.classification,
        processorRole:          result.processorRole,
        licensingStatus:        result.licensingStatus,
        moneyTransmissionAlert: result.moneyTransmissionAlert,
      });

      const body: ApiResponse<FundsFlowClassificationRecord> = {
        success: true,
        data: result,
      };

      res.status(statusCode).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/funds-flow/classifications
// List saved workflow classifications for the tenant.
// Optional query params: classification, limit
// ─────────────────────────────────────────────────────────────────
regulatoryRouter.get(
  '/funds-flow/classifications',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = ClassificationsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest('Invalid query parameters.', parsed.error.flatten());
      }

      const { classification, limit } = parsed.data;

      const svc = getFundsFlowService();
      const classifications: FundsFlowClassificationRecord[] = await svc.listClassifications(
        tenantId,
        { classification: classification as PaymentFlowRole | undefined, limit },
      );

      logger.info('Funds-flow classifications listed', {
        requestId: req.requestId,
        tenantId,
        count: classifications.length,
        classification,
      });

      const body: ApiResponse<{
        classifications: FundsFlowClassificationRecord[];
        total: number;
      }> = {
        success: true,
        data: { classifications, total: classifications.length },
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/funds-flow/licensing-status
// Return all workflows currently requiring licensing review or
// escalated for money-transmission analysis.
// ─────────────────────────────────────────────────────────────────
regulatoryRouter.get(
  '/funds-flow/licensing-status',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const svc = getFundsFlowService();
      const escalations: LicensingEscalation[] = await svc.getLicensingStatus(tenantId);

      logger.info('Licensing status retrieved', {
        requestId: req.requestId,
        tenantId,
        escalationCount: escalations.length,
      });

      const body: ApiResponse<{
        escalations: LicensingEscalation[];
        total: number;
        hasCritical: boolean;
      }> = {
        success: true,
        data: {
          escalations,
          total: escalations.length,
          hasCritical: escalations.some((e) => e.urgency === 'critical'),
        },
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
