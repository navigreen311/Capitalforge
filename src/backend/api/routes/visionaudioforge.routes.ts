// ============================================================
// CapitalForge — VisionAudioForge API Routes
//
// Document intelligence, OCR, ID liveness, and agent orchestration.
// All routes are tenant-scoped via tenantMiddleware per-route.
//
// All file uploads use JSON with base64-encoded content
// (same convention as document.routes.ts).
//
// Endpoints:
//   POST /api/vaf/process                    — process document (OCR + structured data)
//   GET  /api/vaf/results/:id                — retrieve a prior processing result
//   POST /api/vaf/agents/:agentType/run      — trigger an agent run (maker-checker)
//   GET  /api/vaf/agents/status              — list all agent runs
//   POST /api/vaf/ocr/statement              — ingest bank/credit statement
//   POST /api/vaf/ocr/adverse-action         — parse adverse action letter
//   POST /api/vaf/verify/id-liveness         — ID liveness detection
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound } from '../../middleware/error-handler.js';
import {
  VisionAudioForgeService,
  AgentRunNotFoundError,
  AgentApprovalError,
  type ProcessDocumentResult,
  type AgentRunResult,
  type AgentType,
  type DocumentCategory,
} from '../../services/visionaudioforge.service.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

export const visionAudioForgeRouter = Router();

// ── Lazy-initialised service instance ────────────────────────────

let _vafService: VisionAudioForgeService | null = null;

function getVafService(): VisionAudioForgeService {
  if (!_vafService) _vafService = new VisionAudioForgeService();
  return _vafService;
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
      next(new AppError(403, 'FORBIDDEN', `Permission "${permission}" is required.`));
      return;
    }
    next();
  };
}

// ── Valid document categories ─────────────────────────────────────

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'bank_statement',
  'adverse_action_letter',
  'contract',
  'kyb_document',
  'receipt_invoice',
  'id_document',
  'unknown',
];

const AGENT_TYPES: AgentType[] = [
  'statement',
  'kyb',
  'contract',
  'acknowledgment',
  'evidence_bundle',
];

// ── Validation schemas ────────────────────────────────────────────

const ProcessDocumentBodySchema = z.object({
  businessId:  z.string().uuid().optional(),
  uploadedBy:  z.string().optional(),
  fileContent: z.string().min(1, 'fileContent (base64) is required'),
  mimeType:    z.string().min(1).max(100),
  fileName:    z.string().min(1).max(500),
  category:    z.enum(DOCUMENT_CATEGORIES as [DocumentCategory, ...DocumentCategory[]]).optional(),
  autoFile:    z.boolean().optional(),
  metadata:    z.record(z.unknown()).optional(),
});

const AgentRunBodySchema = z.object({
  businessId:      z.string().uuid().optional(),
  triggeredBy:     z.string().min(1),
  payload:         z.record(z.unknown()),
  requireApproval: z.boolean().optional(),
});

const OcrStatementBodySchema = z.object({
  businessId:  z.string().uuid('businessId must be a valid UUID'),
  fileContent: z.string().min(1, 'fileContent (base64) is required'),
  mimeType:    z.string().min(1).max(100),
  fileName:    z.string().min(1).max(500),
  uploadedBy:  z.string().optional(),
});

const OcrAdverseActionBodySchema = z.object({
  businessId:  z.string().uuid('businessId must be a valid UUID'),
  fileContent: z.string().min(1, 'fileContent (base64) is required'),
  mimeType:    z.string().min(1).max(100),
  fileName:    z.string().min(1).max(500),
  uploadedBy:  z.string().optional(),
});

const IdLivenessBodySchema = z.object({
  businessId:           z.string().uuid().optional(),
  uploadedBy:           z.string().optional(),
  idImageContent:       z.string().min(1, 'idImageContent (base64) is required'),
  mimeType:             z.string().min(1).max(100),
  fileName:             z.string().min(1).max(500),
  referencePhotoContent: z.string().optional(),
});

// ── Helper: decode base64 to Buffer ──────────────────────────────

function decodeBase64(value: string, fieldName: string): Buffer {
  try {
    return Buffer.from(value, 'base64');
  } catch {
    throw badRequest(`${fieldName} must be a valid base64 string.`);
  }
}

// ─────────────────────────────────────────────────────────────────
// POST /api/vaf/process
// Central document processing — OCR + structured data extraction.
// Body: { businessId?, uploadedBy?, fileContent (base64), mimeType,
//         fileName, category?, autoFile?, metadata? }
// ─────────────────────────────────────────────────────────────────
visionAudioForgeRouter.post(
  '/vaf/process',
  tenantMiddleware,
  requirePermission(PERMISSIONS.DOCUMENT_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = ProcessDocumentBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const { fileContent, ...rest } = parsed.data;
      const fileBuffer = decodeBase64(fileContent, 'fileContent');

      const result: ProcessDocumentResult = await getVafService().processDocument({
        tenantId,
        ...rest,
        fileBuffer,
      });

      logger.info('VAF document processed', {
        requestId:      req.requestId,
        tenantId,
        processingId:   result.processingId,
        category:       result.category,
        processingMs:   result.processingMs,
        vaultDocumentId: result.vaultDocumentId,
      });

      const body: ApiResponse<ProcessDocumentResult> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/vaf/results/:id
// Retrieve a prior processing result by processingId.
// ─────────────────────────────────────────────────────────────────
visionAudioForgeRouter.get(
  '/vaf/results/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.DOCUMENT_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const processingId = req.params['id'];

      if (!processingId) {
        throw badRequest('Processing ID is required.');
      }

      const result = getVafService().getResult(processingId);

      if (!result) {
        throw notFound(`Processing result ${processingId}`);
      }

      logger.info('VAF result retrieved', {
        requestId:    req.requestId,
        processingId,
      });

      const body: ApiResponse<ProcessDocumentResult> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/vaf/agents/:agentType/run
// Trigger an agent run (maker-checker pattern).
// agentType: statement | kyb | contract | acknowledgment | evidence_bundle
// Body: { businessId?, triggeredBy, payload, requireApproval? }
// ─────────────────────────────────────────────────────────────────
visionAudioForgeRouter.post(
  '/vaf/agents/:agentType/run',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const agentType = req.params['agentType'] as AgentType;

      if (!AGENT_TYPES.includes(agentType)) {
        throw badRequest(
          `Invalid agentType. Must be one of: ${AGENT_TYPES.join(', ')}`,
        );
      }

      const parsed = AgentRunBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const run: AgentRunResult = await getVafService().triggerAgentRun({
        tenantId,
        agentType,
        ...parsed.data,
      });

      logger.info('VAF agent run triggered', {
        requestId:      req.requestId,
        tenantId,
        runId:          run.runId,
        agentType:      run.agentType,
        approvalStatus: run.approvalStatus,
      });

      const body: ApiResponse<AgentRunResult> = { success: true, data: run };
      res.status(202).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/vaf/agents/status
// List all agent runs. Optional query param: ?agentType=<type>
// NOTE: This route must be registered BEFORE /agents/:agentType/run
// is not an issue here since they differ by method & path structure,
// but keep this route registration before parameterised paths.
// ─────────────────────────────────────────────────────────────────
visionAudioForgeRouter.get(
  '/vaf/agents/status',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const agentTypeFilter = req.query['agentType'] as AgentType | undefined;

      if (agentTypeFilter && !AGENT_TYPES.includes(agentTypeFilter)) {
        throw badRequest(`agentType must be one of: ${AGENT_TYPES.join(', ')}`);
      }

      const runs: AgentRunResult[] = getVafService().listAgentRuns(agentTypeFilter);

      logger.info('VAF agent runs listed', {
        requestId:  req.requestId,
        agentType:  agentTypeFilter,
        count:      runs.length,
      });

      const body: ApiResponse<AgentRunResult[]> = { success: true, data: runs };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/vaf/ocr/statement
// Ingest a bank/credit statement and extract structured transaction data.
// Body: { businessId, fileContent (base64), mimeType, fileName, uploadedBy? }
// ─────────────────────────────────────────────────────────────────
visionAudioForgeRouter.post(
  '/vaf/ocr/statement',
  tenantMiddleware,
  requirePermission(PERMISSIONS.DOCUMENT_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId, userId } = req.tenant!;

      const parsed = OcrStatementBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const { fileContent, businessId, mimeType, fileName, uploadedBy } = parsed.data;
      const buffer = decodeBase64(fileContent, 'fileContent');

      const result = await getVafService().ingestStatement(
        tenantId,
        businessId,
        buffer,
        mimeType,
        fileName,
        uploadedBy ?? userId,
      );

      logger.info('VAF statement ingested', {
        requestId:    req.requestId,
        tenantId,
        processingId: result.processingId,
        businessId,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/vaf/ocr/adverse-action
// Parse an adverse action / denial letter for regulatory reasons
// and dispute rights extraction.
// Body: { businessId, fileContent (base64), mimeType, fileName, uploadedBy? }
// ─────────────────────────────────────────────────────────────────
visionAudioForgeRouter.post(
  '/vaf/ocr/adverse-action',
  tenantMiddleware,
  requirePermission(PERMISSIONS.DOCUMENT_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId, userId } = req.tenant!;

      const parsed = OcrAdverseActionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const { fileContent, businessId, mimeType, fileName, uploadedBy } = parsed.data;
      const buffer = decodeBase64(fileContent, 'fileContent');

      const result = await getVafService().parseAdverseActionLetter(
        tenantId,
        businessId,
        buffer,
        mimeType,
        fileName,
        uploadedBy ?? userId,
      );

      logger.info('VAF adverse action letter parsed', {
        requestId:    req.requestId,
        tenantId,
        processingId: result.processingId,
        businessId,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/vaf/verify/id-liveness
// Biometric ID liveness detection + document authenticity check.
// Body: { businessId?, uploadedBy?, idImageContent (base64),
//         mimeType, fileName, referencePhotoContent? (base64) }
// ─────────────────────────────────────────────────────────────────
visionAudioForgeRouter.post(
  '/vaf/verify/id-liveness',
  tenantMiddleware,
  requirePermission(PERMISSIONS.DOCUMENT_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId, userId } = req.tenant!;

      const parsed = IdLivenessBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const {
        idImageContent,
        referencePhotoContent,
        businessId,
        mimeType,
        fileName,
        uploadedBy,
      } = parsed.data;

      const idImageBuffer = decodeBase64(idImageContent, 'idImageContent');
      const referencePhotoBuffer = referencePhotoContent
        ? decodeBase64(referencePhotoContent, 'referencePhotoContent')
        : undefined;

      const result = await getVafService().detectIdLiveness({
        tenantId,
        businessId,
        uploadedBy: uploadedBy ?? userId,
        idImageBuffer,
        mimeType,
        fileName,
        referencePhotoBuffer,
      });

      logger.info('VAF ID liveness check completed', {
        requestId:       req.requestId,
        tenantId,
        processingId:    result.processingId,
        livenessVerdict: result.livenessData.livenessVerdict,
        livenessScore:   result.livenessData.livenessScore,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
