// ============================================================
// CapitalForge — Document Vault API Routes
//
// POST   /api/businesses/:id/documents        — upload document
// GET    /api/businesses/:id/documents        — list with filters
// GET    /api/documents/:id                   — retrieve with presigned URL
// PUT    /api/documents/:id/legal-hold        — toggle legal hold
// GET    /api/documents/export/:businessId    — compliance dossier export
//
// All routes are tenant-scoped via TenantContext from requireAuth.
// DOCUMENT_READ / DOCUMENT_WRITE permissions enforced via RBAC.
// Legal hold toggle requires COMPLIANCE_WRITE.
// Dossier export requires COMPLIANCE_READ.
// ============================================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { PERMISSIONS } from '@shared/constants/index.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';
import {
  DocumentVaultService,
  DocumentNotFoundError,
  DocumentOnLegalHoldError,
  type DocumentRecord,
  type DocumentType,
  type ListDocumentsResult,
  type RetrieveResult,
} from '../../services/document-vault.service.js';
import {
  ComplianceDossierService,
  BusinessNotFoundForDossierError,
  type ComplianceDossier,
} from '../../services/compliance-dossier.js';

// ── Router & lazy singletons ───────────────────────────────────

export const documentRouter = Router();

let _vaultService: DocumentVaultService | null = null;
let _dossierService: ComplianceDossierService | null = null;
let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

function getVaultService(): DocumentVaultService {
  if (!_vaultService) _vaultService = new DocumentVaultService(getPrisma());
  return _vaultService;
}

function getDossierService(): ComplianceDossierService {
  if (!_dossierService) _dossierService = new ComplianceDossierService(getPrisma());
  return _dossierService;
}

// ── Allowed document types for validation ─────────────────────

const ALLOWED_DOCUMENT_TYPES = new Set<DocumentType>([
  'consent_form',
  'acknowledgment',
  'application',
  'disclosure',
  'adverse_action',
  'contract',
  'statement',
  'receipt',
]);

function isValidDocumentType(v: unknown): v is DocumentType {
  return typeof v === 'string' && ALLOWED_DOCUMENT_TYPES.has(v as DocumentType);
}

// ── Helpers ────────────────────────────────────────────────────

function badRequest(res: Response, message: string): void {
  res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message },
  } satisfies ApiResponse<never>);
}

function notFound(res: Response, message: string): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message },
  } satisfies ApiResponse<never>);
}

function serverError(res: Response, message: string, err: unknown): void {
  logger.error(message, { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse<never>);
}

// ── POST /api/businesses/:id/documents ─────────────────────────
//
// Upload a document for a specific business.
// Body: multipart/form-data — BUT since this is a stub (no multer),
// we accept raw JSON with a base64-encoded `content` field.
// In production, wire a multipart parser (e.g. multer + S3 presigned).
//
// Required body fields:
//   documentType: DocumentType
//   title:        string
//   content:      string (base64-encoded file bytes)
// Optional:
//   mimeType:     string
//   metadata:     object

documentRouter.post(
  '/businesses/:id/documents',
  requireAuth,
  requirePermissions(PERMISSIONS.DOCUMENT_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const reqLog = logger.child({
      requestId:  req.requestId,
      tenantId:   req.tenantContext?.tenantId,
      route:      'POST /businesses/:id/documents',
    });

    const businessId = req.params['id'];
    const ctx        = req.tenantContext!;

    const { documentType, title, content, mimeType, metadata } = req.body as {
      documentType?: unknown;
      title?:        unknown;
      content?:      unknown;
      mimeType?:     unknown;
      metadata?:     unknown;
    };

    // Validate required fields
    if (!isValidDocumentType(documentType)) {
      badRequest(res, `documentType must be one of: ${[...ALLOWED_DOCUMENT_TYPES].join(', ')}`);
      return;
    }

    if (typeof title !== 'string' || title.trim() === '') {
      badRequest(res, 'title is required and must be a non-empty string');
      return;
    }

    if (typeof content !== 'string' || content.trim() === '') {
      badRequest(res, 'content is required (base64-encoded file bytes)');
      return;
    }

    let contentBuffer: Buffer;
    try {
      contentBuffer = Buffer.from(content, 'base64');
    } catch {
      badRequest(res, 'content must be a valid base64 string');
      return;
    }

    try {
      const document = await getVaultService().upload({
        tenantId:     ctx.tenantId,
        businessId,
        uploadedBy:   ctx.userId,
        documentType,
        title:        title.trim(),
        mimeType:     typeof mimeType === 'string' ? mimeType : undefined,
        content:      contentBuffer,
        metadata:     typeof metadata === 'object' && metadata !== null
          ? (metadata as Record<string, unknown>)
          : undefined,
      });

      reqLog.info('[upload] Document uploaded', { documentId: document.id });

      const body: ApiResponse<DocumentRecord> = { success: true, data: document };
      res.status(201).json(body);
    } catch (err) {
      serverError(res, 'Document upload failed', err);
    }
  },
);

// ── GET /api/businesses/:id/documents ──────────────────────────
//
// List documents for a business with optional query filters:
//   documentType  — filter by type
//   legalHold     — 'true' | 'false'
//   since         — ISO date string (inclusive)
//   page          — default 1
//   pageSize      — default 20, max 100

documentRouter.get(
  '/businesses/:id/documents',
  requireAuth,
  requirePermissions(PERMISSIONS.DOCUMENT_READ),
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const ctx        = req.tenantContext!;

    const {
      documentType,
      legalHold: legalHoldStr,
      since,
      page:     pageStr,
      pageSize: pageSizeStr,
    } = req.query as Record<string, string | undefined>;

    // Parse legalHold filter
    let legalHoldFilter: boolean | undefined;
    if (legalHoldStr === 'true')       legalHoldFilter = true;
    else if (legalHoldStr === 'false') legalHoldFilter = false;

    // Validate documentType filter if provided
    if (documentType !== undefined && !isValidDocumentType(documentType)) {
      badRequest(res, `documentType must be one of: ${[...ALLOWED_DOCUMENT_TYPES].join(', ')}`);
      return;
    }

    try {
      const result = await getVaultService().list({
        tenantId:     ctx.tenantId,
        businessId,
        documentType: documentType as DocumentType | undefined,
        legalHold:    legalHoldFilter,
        since,
        page:         pageStr     ? parseInt(pageStr, 10)     : undefined,
        pageSize:     pageSizeStr ? parseInt(pageSizeStr, 10) : undefined,
      });

      const body: ApiResponse<ListDocumentsResult> = {
        success: true,
        data:    result,
        meta: {
          page:     result.page,
          pageSize: result.pageSize,
          total:    result.total,
        },
      };
      res.status(200).json(body);
    } catch (err) {
      serverError(res, 'Failed to list documents', err);
    }
  },
);

// ── GET /api/documents/export/:businessId ──────────────────────
//
// IMPORTANT: This route MUST be registered before GET /api/documents/:id
// to prevent Express matching "export" as a document ID.
//
// Returns the full compliance dossier as a JSON payload.
// In production, this should stream a ZIP archive.
//
// Query params:
//   since — ISO date (optional)
//   until — ISO date (optional)

documentRouter.get(
  '/documents/export/:businessId',
  requireAuth,
  requirePermissions(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['businessId'];
    const ctx        = req.tenantContext!;

    const { since, until } = req.query as { since?: string; until?: string };

    const reqLog = logger.child({
      requestId:  req.requestId,
      tenantId:   ctx.tenantId,
      businessId,
      route:      'GET /documents/export/:businessId',
    });

    reqLog.info('[dossier] Compliance dossier export requested');

    try {
      const dossier = await getDossierService().assemble({
        tenantId:    ctx.tenantId,
        businessId,
        requestedBy: ctx.userId,
        since,
        until,
      });

      // Set headers to hint at downloadable content
      res.setHeader('Content-Disposition', `attachment; filename="compliance-dossier-${businessId}.json"`);
      res.setHeader('Content-Type', 'application/json');

      const body: ApiResponse<ComplianceDossier> = { success: true, data: dossier };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof BusinessNotFoundForDossierError) {
        notFound(res, err.message);
        return;
      }
      serverError(res, 'Failed to assemble compliance dossier', err);
    }
  },
);

// ── GET /api/documents/:id ─────────────────────────────────────
//
// Retrieve a single document by ID, including a presigned download URL.
// The URL is a stub in development — replace with real S3 presigning.

documentRouter.get(
  '/documents/:id',
  requireAuth,
  requirePermissions(PERMISSIONS.DOCUMENT_READ),
  async (req: Request, res: Response): Promise<void> => {
    const documentId = req.params['id'];
    const ctx        = req.tenantContext!;

    try {
      const result = await getVaultService().retrieve(documentId, ctx.tenantId);

      const body: ApiResponse<RetrieveResult> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof DocumentNotFoundError) {
        notFound(res, `Document not found: ${documentId}`);
        return;
      }
      serverError(res, 'Failed to retrieve document', err);
    }
  },
);

// ── PUT /api/documents/:id/legal-hold ─────────────────────────
//
// Toggle legal hold on a document.
// Body: { hold: boolean }
//
// When hold === true:
//   - The document is frozen — no deletion by any actor.
// When hold === false:
//   - Legal hold is lifted; document can again be deleted.
//
// Requires COMPLIANCE_WRITE permission.

documentRouter.put(
  '/documents/:id/legal-hold',
  requireAuth,
  requirePermissions(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const documentId = req.params['id'];
    const ctx        = req.tenantContext!;

    const { hold } = req.body as { hold?: unknown };

    if (typeof hold !== 'boolean') {
      badRequest(res, 'hold must be a boolean (true to set hold, false to release)');
      return;
    }

    const reqLog = logger.child({
      requestId:  req.requestId,
      tenantId:   ctx.tenantId,
      documentId,
      hold,
      route:      'PUT /documents/:id/legal-hold',
    });

    reqLog.info('[legal-hold] Legal hold toggle requested');

    try {
      const updated = await getVaultService().setLegalHold(
        documentId,
        ctx.tenantId,
        hold,
        ctx.userId,
      );

      const body: ApiResponse<DocumentRecord> = { success: true, data: updated };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof DocumentNotFoundError) {
        notFound(res, `Document not found: ${documentId}`);
        return;
      }
      serverError(res, 'Failed to update legal hold', err);
    }
  },
);

// ── POST /api/documents/upload ────────────────────────────────
//
// Mock document upload. Accepts JSON with filename and documentType,
// returns a mock upload result with id, filename, and status.
// This is a simplified endpoint for the Document Vault UI.

documentRouter.post(
  '/documents/upload',
  requireAuth,
  requirePermissions(PERMISSIONS.DOCUMENT_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const ctx = req.tenantContext!;

    const { filename, documentType, businessId, description } = req.body as {
      filename?: string;
      documentType?: string;
      businessId?: string;
      description?: string;
    };

    if (!filename || typeof filename !== 'string' || filename.trim() === '') {
      badRequest(res, 'filename is required and must be a non-empty string');
      return;
    }
    if (!documentType || typeof documentType !== 'string' || documentType.trim() === '') {
      badRequest(res, 'documentType is required');
      return;
    }

    const reqLog = logger.child({
      requestId: req.requestId,
      tenantId: ctx.tenantId,
      route: 'POST /documents/upload',
    });

    try {
      const doc = await getPrisma().document.create({
        data: {
          tenantId: ctx.tenantId,
          businessId: businessId ?? null,
          documentType,
          title: filename.trim(),
          storageKey: `uploads/${Date.now()}_${filename.trim()}`,
          metadata: description ? { description } : undefined,
          uploadedBy: ctx.userId ?? 'system',
        },
      });

      reqLog.info('[upload] Document uploaded via /documents/upload', { documentId: doc.id });

      const data = { id: doc.id, filename: doc.title, status: 'uploaded' as const };
      const body: ApiResponse<typeof data> = { success: true, data };
      res.status(201).json(body);
    } catch (err) {
      serverError(res, 'Document upload failed', err);
    }
  },
);

// ── PATCH /api/documents/:id/legal-hold ──────────────────────
//
// Toggle legal hold on a document via PATCH.
// Body: { legalHold: boolean }

documentRouter.patch(
  '/documents/:id/legal-hold',
  requireAuth,
  requirePermissions(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const documentId = req.params['id'];
    const ctx = req.tenantContext!;

    const { legalHold } = req.body as { legalHold?: unknown };

    if (typeof legalHold !== 'boolean') {
      badRequest(res, 'legalHold must be a boolean');
      return;
    }

    const reqLog = logger.child({
      requestId: req.requestId,
      tenantId: ctx.tenantId,
      documentId,
      legalHold,
      route: 'PATCH /documents/:id/legal-hold',
    });

    reqLog.info('[legal-hold] Legal hold toggle via PATCH');

    try {
      const updated = await getVaultService().setLegalHold(
        documentId,
        ctx.tenantId,
        legalHold,
        ctx.userId,
      );

      const body: ApiResponse<DocumentRecord> = { success: true, data: updated };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof DocumentNotFoundError) {
        notFound(res, `Document not found: ${documentId}`);
        return;
      }
      serverError(res, 'Failed to update legal hold', err);
    }
  },
);

// ── DELETE /api/documents/:id ─────────────────────────────────
//
// Hard-delete a document from the vault.
// BLOCKED when legalHold === true — returns 409 Conflict.
// Requires DOCUMENT_WRITE permission.

documentRouter.delete(
  '/documents/:id',
  requireAuth,
  requirePermissions(PERMISSIONS.DOCUMENT_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const documentId = req.params['id'];
    const ctx        = req.tenantContext!;

    try {
      await getVaultService().delete(documentId, ctx.tenantId, ctx.userId);

      res.status(204).send();
    } catch (err) {
      if (err instanceof DocumentNotFoundError) {
        notFound(res, `Document not found: ${documentId}`);
        return;
      }
      if (err instanceof DocumentOnLegalHoldError) {
        res.status(409).json({
          success: false,
          error: {
            code:    'DOCUMENT_ON_LEGAL_HOLD',
            message: err.message,
          },
        } satisfies ApiResponse<never>);
        return;
      }
      serverError(res, 'Failed to delete document', err);
    }
  },
);
