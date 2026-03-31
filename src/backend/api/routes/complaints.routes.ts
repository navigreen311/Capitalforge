// ============================================================
// CapitalForge — Complaint & Regulator Response Routes
//
// All routes require authentication (tenantMiddleware).
// COMPLIANCE_READ  required for GET endpoints.
// COMPLIANCE_WRITE required for POST / PUT endpoints.
//
// Complaint Endpoints:
//   POST   /api/complaints                        — create complaint
//   GET    /api/complaints                        — list with filters
//   PUT    /api/complaints/:id                    — update (lifecycle + fields)
//   POST   /api/complaints/:id/evidence           — attach evidence
//   GET    /api/complaints/analytics              — root-cause analytics
//
// Regulator Inquiry Endpoints:
//   POST   /api/regulator/inquiries               — create inquiry
//   GET    /api/regulator/inquiries               — list inquiries
//   PUT    /api/regulator/inquiries/:id           — update inquiry
//   POST   /api/regulator/inquiries/:id/export-dossier — one-click dossier
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { ComplaintService } from '../../services/complaint.service.js';
import { RegulatorResponseService } from '../../services/regulator-response.service.js';
import type {
  CreateComplaintInput,
  UpdateComplaintInput,
  AttachEvidenceInput,
  ComplaintListFilters,
  ComplaintRecord,
  ComplaintListResult,
  RootCauseAnalytics,
} from '../../services/complaint.service.js';
import type {
  CreateInquiryInput,
  UpdateInquiryInput,
  InquiryListFilters,
  RegulatorInquiryRecord,
  InquiryListResult,
  ComplianceDossier,
  LegalHoldSummary,
} from '../../services/regulator-response.service.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

export const complaintsRouter = Router();

// ── Lazy service instances ─────────────────────────────────────────

let prisma: PrismaClient | null = null;
let complaintSvc: ComplaintService | null = null;
let regulatorSvc: RegulatorResponseService | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

function getComplaintService(): ComplaintService {
  if (!complaintSvc) complaintSvc = new ComplaintService(getPrisma());
  return complaintSvc;
}

function getRegulatoryService(): RegulatorResponseService {
  if (!regulatorSvc) regulatorSvc = new RegulatorResponseService(getPrisma());
  return regulatorSvc;
}

// ── Permission guard ───────────────────────────────────────────────

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

// ── Input validation schemas ───────────────────────────────────────

const CreateComplaintSchema = z.object({
  businessId:           z.string().uuid().optional(),
  category:             z.enum(['billing', 'service', 'unauthorized_debit', 'compliance', 'other']),
  subcategory:          z.string().max(100).optional(),
  source:               z.enum(['portal', 'email', 'phone', 'regulator_referral', 'legal', 'other']),
  severity:             z.enum(['low', 'medium', 'high', 'critical']).optional(),
  description:          z.string().min(10).max(10000),
  assignedTo:           z.string().max(255).optional(),
  initialEvidenceDocIds: z.array(z.string()).max(50).optional(),
  initialCallRecordIds:  z.array(z.string()).max(50).optional(),
});

const UpdateComplaintSchema = z.object({
  status:      z.enum(['open', 'investigating', 'resolved', 'closed']).optional(),
  severity:    z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedTo:  z.string().max(255).optional(),
  escalatedTo: z.string().max(255).optional(),
  rootCause:   z.string().max(2000).optional(),
  resolution:  z.string().max(5000).optional(),
  subcategory: z.string().max(100).optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'At least one field must be provided.',
});

const AttachEvidenceSchema = z.object({
  evidenceItems: z.array(z.object({
    type:        z.enum(['document', 'call_record', 'debit_event', 'screenshot', 'other']),
    referenceId: z.string().min(1).max(255),
    title:       z.string().min(1).max(255),
    notes:       z.string().max(1000).optional(),
  })).min(1).max(50),
  addedBy: z.string().max(255).optional(),
});

const ComplaintListQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  category:   z.enum(['billing', 'service', 'unauthorized_debit', 'compliance', 'other']).optional(),
  status:     z.enum(['open', 'investigating', 'resolved', 'closed']).optional(),
  severity:   z.enum(['low', 'medium', 'high', 'critical']).optional(),
  page:       z.coerce.number().int().positive().optional(),
  pageSize:   z.coerce.number().int().positive().max(100).optional(),
});

const CreateInquirySchema = z.object({
  businessId:      z.string().uuid().optional(),
  matterType:      z.enum(['FTC', 'CFPB', 'state_AG', 'audit']),
  referenceNumber: z.string().max(100).optional(),
  agencyName:      z.string().min(2).max(255),
  description:     z.string().min(10).max(10000),
  severity:        z.enum(['routine', 'elevated', 'critical']).optional(),
  responseDueDate: z.coerce.date().optional(),
  assignedCounsel: z.string().max(255).optional(),
  assignedTo:      z.string().max(255).optional(),
});

const UpdateInquirySchema = z.object({
  status:          z.enum(['open', 'legal_hold', 'response_drafted', 'response_submitted', 'closed']).optional(),
  severity:        z.enum(['routine', 'elevated', 'critical']).optional(),
  responseDueDate: z.coerce.date().optional(),
  assignedCounsel: z.string().max(255).optional(),
  assignedTo:      z.string().max(255).optional(),
  responseNotes:   z.string().max(10000).optional(),
  resolution:      z.string().max(5000).optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'At least one field must be provided.',
});

const InquiryListQuerySchema = z.object({
  matterType: z.enum(['FTC', 'CFPB', 'state_AG', 'audit']).optional(),
  status:     z.enum(['open', 'legal_hold', 'response_drafted', 'response_submitted', 'closed']).optional(),
  page:       z.coerce.number().int().positive().optional(),
  pageSize:   z.coerce.number().int().positive().max(100).optional(),
});

// ============================================================
// COMPLAINT ROUTES
// ============================================================

// ─────────────────────────────────────────────────────────────────
// POST /api/complaints
// Create a new complaint. Auto-attaches call records and, for
// unauthorized_debit category, builds an ACH evidence bundle.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.post(
  '/complaints',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = CreateComplaintSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const input: CreateComplaintInput = {
        tenantId,
        ...parsed.data,
      };

      const svc    = getComplaintService();
      const result = await svc.createComplaint(input);

      logger.info('Complaint created', {
        requestId: req.requestId,
        tenantId,
        complaintId: result.id,
        category:    result.category,
        severity:    result.severity,
      });

      const body: ApiResponse<ComplaintRecord> = { success: true, data: result };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/complaints
// List complaints with optional filters.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.get(
  '/complaints',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = ComplaintListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest('Invalid query parameters.', parsed.error.flatten());
      }

      const filters: ComplaintListFilters = {
        tenantId,
        ...parsed.data,
      };

      const svc    = getComplaintService();
      const result = await svc.listComplaints(filters);

      logger.info('Complaints listed', {
        requestId: req.requestId,
        tenantId,
        total:    result.total,
        page:     result.page,
        pageSize: result.pageSize,
      });

      const body: ApiResponse<ComplaintListResult> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/complaints/analytics
// Root-cause analysis dashboard data.
// NOTE: Must be registered before /:id to avoid route collision.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.get(
  '/complaints/analytics',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const svc    = getComplaintService();
      const result = await svc.getRootCauseAnalytics(tenantId);

      logger.info('Complaint analytics retrieved', {
        requestId:      req.requestId,
        tenantId,
        totalComplaints: result.totalComplaints,
      });

      const body: ApiResponse<RootCauseAnalytics> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// PUT /api/complaints/:id
// Update complaint status, severity, assignment, root cause, etc.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.put(
  '/complaints/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id }       = req.params;

      const parsed = UpdateComplaintSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const update: UpdateComplaintInput = parsed.data as UpdateComplaintInput;

      const svc = getComplaintService();
      let result: ComplaintRecord;

      try {
        result = await svc.updateComplaint(String(id), tenantId, update);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          throw notFound(`Complaint ${id}`);
        }
        if (err instanceof Error && err.message.includes('Invalid status transition')) {
          throw badRequest(err.message);
        }
        throw err;
      }

      logger.info('Complaint updated', {
        requestId:   req.requestId,
        tenantId,
        complaintId: id,
        status:      result.status,
      });

      const body: ApiResponse<ComplaintRecord> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/complaints/:id/evidence
// Attach evidence items (documents, call records, screenshots, etc.)
// to an existing complaint.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.post(
  '/complaints/:id/evidence',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id }       = req.params;

      const parsed = AttachEvidenceSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const input: AttachEvidenceInput = {
        complaintId:   String(id),
        tenantId,
        evidenceItems: parsed.data.evidenceItems,
        addedBy:       parsed.data.addedBy ?? req.tenant!.userId,
      };

      const svc = getComplaintService();
      let result: ComplaintRecord;

      try {
        result = await svc.attachEvidence(input);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          throw notFound(`Complaint ${id}`);
        }
        throw err;
      }

      logger.info('Evidence attached to complaint', {
        requestId:     req.requestId,
        tenantId,
        complaintId:   id,
        itemCount:     parsed.data.evidenceItems.length,
      });

      const body: ApiResponse<ComplaintRecord> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// REGULATOR INQUIRY ROUTES
// ============================================================

// ─────────────────────────────────────────────────────────────────
// POST /api/regulator/inquiries
// Create a new regulator inquiry. Auto-classifies matter type.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.post(
  '/regulator/inquiries',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = CreateInquirySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const input: CreateInquiryInput = {
        tenantId,
        ...parsed.data,
      };

      const svc    = getRegulatoryService();
      const result = await svc.createInquiry(input);

      logger.info('Regulator inquiry created', {
        requestId:  req.requestId,
        tenantId,
        inquiryId:  result.id,
        matterType: result.matterType,
        severity:   result.severity,
      });

      const body: ApiResponse<RegulatorInquiryRecord> = { success: true, data: result };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/regulator/inquiries
// List regulator inquiries with optional filters.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.get(
  '/regulator/inquiries',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = InquiryListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest('Invalid query parameters.', parsed.error.flatten());
      }

      const filters: InquiryListFilters = {
        tenantId,
        ...parsed.data,
      };

      const svc    = getRegulatoryService();
      const result = await svc.listInquiries(filters);

      logger.info('Regulator inquiries listed', {
        requestId: req.requestId,
        tenantId,
        total:    result.total,
        page:     result.page,
        pageSize: result.pageSize,
      });

      const body: ApiResponse<InquiryListResult> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// PUT /api/regulator/inquiries/:id
// Update inquiry status, deadlines, assigned counsel, notes, etc.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.put(
  '/regulator/inquiries/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id }       = req.params;

      const parsed = UpdateInquirySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const update: UpdateInquiryInput = parsed.data as UpdateInquiryInput;

      const svc = getRegulatoryService();
      let result: RegulatorInquiryRecord;

      try {
        result = await svc.updateInquiry(String(id), tenantId, update);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          throw notFound(`Regulator inquiry ${id}`);
        }
        throw err;
      }

      // Activate legal hold automatically when status transitions to legal_hold
      if (update.status === 'legal_hold') {
        await svc.activateLegalHold(String(id), tenantId, req.tenant!.userId);
      }

      logger.info('Regulator inquiry updated', {
        requestId:  req.requestId,
        tenantId,
        inquiryId:  id,
        status:     result.status,
      });

      const body: ApiResponse<RegulatorInquiryRecord> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/regulator/inquiries/:id/export-dossier
// Generate a one-click compliance dossier for the regulator inquiry.
// ─────────────────────────────────────────────────────────────────
complaintsRouter.post(
  '/regulator/inquiries/:id/export-dossier',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id }       = req.params;

      const svc = getRegulatoryService();
      let dossier: ComplianceDossier;

      try {
        dossier = await svc.exportDossier(String(id), tenantId, req.tenant!.userId);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          throw notFound(`Regulator inquiry ${id}`);
        }
        throw err;
      }

      logger.info('Compliance dossier exported', {
        requestId:     req.requestId,
        tenantId,
        inquiryId:     id,
        exportId:      dossier.exportId,
        documentCount: dossier.totalDocuments,
      });

      const body: ApiResponse<ComplianceDossier> = { success: true, data: dossier };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
