// ============================================================
// CapitalForge — Tax Document Routes (Mock)
//
// Endpoints:
//   GET  /api/tax/documents?clientId=X&year=Y  — list tax documents
//   GET  /api/tax/documents/:id/download       — download document text
//   GET  /api/tax/documents/:id/summary        — key figures summary
//   POST /api/tax/documents/generate           — generate new document
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z, type ZodError } from 'zod';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const taxRouter = Router({ mergeParams: true });

// ── Auth & Error Helpers ─────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    } satisfies ApiResponse);
    return;
  }
  next();
}

function handleZodError(err: ZodError, res: Response): void {
  res.status(422).json({
    success: false,
    error: {
      code:    'VALIDATION_ERROR',
      message: 'Invalid request parameters.',
      details: err.flatten().fieldErrors,
    },
  } satisfies ApiResponse);
}

function handleError(err: unknown, res: Response, context: string): void {
  logger.error(`[TaxRoutes] Error in ${context}`, { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ── Mock Data ────────────────────────────────────────────────

interface TaxDocument {
  id: string;
  clientId: string;
  year: number;
  type: string;
  title: string;
  status: string;
  createdAt: string;
  interest: number;
  deductible: number;
  fees: number;
  content: string;
}

function buildMockDocuments(clientId: string, year: number): TaxDocument[] {
  return [
    {
      id: `tax-doc-${clientId}-${year}-001`,
      clientId,
      year,
      type: '1099-INT',
      title: `1099-INT Interest Income — ${year}`,
      status: 'final',
      createdAt: `${year}-01-31T00:00:00.000Z`,
      interest: 2_345.67,
      deductible: 1_890.00,
      fees: 455.67,
      content: [
        `1099-INT Tax Document — Tax Year ${year}`,
        `Client: ${clientId}`,
        ``,
        `Payer: CapitalForge Platform`,
        `Recipient: Business Client ${clientId}`,
        ``,
        `Box 1 — Interest Income:           $2,345.67`,
        `Box 4 — Federal Tax Withheld:       $0.00`,
        `Box 10 — Market Discount:           $0.00`,
        ``,
        `This is informational only. Consult your tax advisor.`,
      ].join('\n'),
    },
    {
      id: `tax-doc-${clientId}-${year}-002`,
      clientId,
      year,
      type: 'fee-summary',
      title: `Annual Fee Summary — ${year}`,
      status: 'final',
      createdAt: `${year}-02-15T00:00:00.000Z`,
      interest: 0,
      deductible: 3_200.00,
      fees: 3_200.00,
      content: [
        `Annual Fee Summary — Tax Year ${year}`,
        `Client: ${clientId}`,
        ``,
        `Card Annual Fees:         $1,400.00`,
        `Cash Advance Fees:          $600.00`,
        `Program Fees:               $800.00`,
        `Processor Fees:             $400.00`,
        `──────────────────────────────────`,
        `Total Deductible Fees:    $3,200.00`,
        ``,
        `These fees may be deductible as ordinary business expenses.`,
      ].join('\n'),
    },
    {
      id: `tax-doc-${clientId}-${year}-003`,
      clientId,
      year,
      type: '163j-worksheet',
      title: `IRC 163(j) Interest Limitation Worksheet — ${year}`,
      status: 'final',
      createdAt: `${year}-03-01T00:00:00.000Z`,
      interest: 5_600.00,
      deductible: 4_200.00,
      fees: 1_400.00,
      content: [
        `IRC §163(j) Interest Limitation Worksheet — ${year}`,
        `Client: ${clientId}`,
        ``,
        `Total Business Interest Expense:    $5,600.00`,
        `30% ATI Limitation:                 $4,200.00`,
        `Disallowed Interest Carryforward:   $1,400.00`,
        ``,
        `Consult your CPA regarding carryforward elections.`,
      ].join('\n'),
    },
  ];
}

// ── Validation Schemas ───────────────────────────────────────

const DocumentListQuerySchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  year:     z.coerce.number().int().min(2000).max(2100).optional(),
});

const GenerateDocumentBodySchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  year:     z.coerce.number().int().min(2000).max(2100),
  type:     z.enum(['1099-INT', 'fee-summary', '163j-worksheet']).default('fee-summary'),
});

// ── GET /api/tax/documents ───────────────────────────────────

taxRouter.get(
  '/documents',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = DocumentListQuerySchema.safeParse(req.query);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const { clientId, year } = parsed.data;
    const taxYear = year ?? new Date().getFullYear();

    try {
      const documents = buildMockDocuments(clientId, taxYear);

      res.status(200).json({
        success: true,
        data:    documents.map(({ content, ...doc }) => doc),
        meta:    { total: documents.length, clientId, year: taxYear },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'GET /tax/documents');
    }
  },
);

// ── GET /api/tax/documents/:id/download ──────────────────────

taxRouter.get(
  '/documents/:id/download',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const docId = req.params['id'] as string;

    try {
      // Parse the doc ID to extract clientId and year
      const match = docId.match(/^tax-doc-(.+)-(\d{4})-\d+$/);
      if (!match) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Tax document "${docId}" not found.` },
        } satisfies ApiResponse);
        return;
      }

      const [, clientId, yearStr] = match;
      const docs = buildMockDocuments(clientId!, Number(yearStr));
      const doc = docs.find((d) => d.id === docId);

      if (!doc) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Tax document "${docId}" not found.` },
        } satisfies ApiResponse);
        return;
      }

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${docId}.txt"`);
      res.status(200).send(doc.content);
    } catch (err) {
      handleError(err, res, 'GET /tax/documents/:id/download');
    }
  },
);

// ── GET /api/tax/documents/:id/summary ───────────────────────

taxRouter.get(
  '/documents/:id/summary',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const docId = req.params['id'] as string;

    try {
      const match = docId.match(/^tax-doc-(.+)-(\d{4})-\d+$/);
      if (!match) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Tax document "${docId}" not found.` },
        } satisfies ApiResponse);
        return;
      }

      const [, clientId, yearStr] = match;
      const docs = buildMockDocuments(clientId!, Number(yearStr));
      const doc = docs.find((d) => d.id === docId);

      if (!doc) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Tax document "${docId}" not found.` },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id:          doc.id,
          type:        doc.type,
          year:        doc.year,
          interest:    doc.interest,
          deductible:  doc.deductible,
          fees:        doc.fees,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'GET /tax/documents/:id/summary');
    }
  },
);

// ── POST /api/tax/documents/generate ─────────────────────────

taxRouter.post(
  '/documents/generate',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GenerateDocumentBodySchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const { clientId, year, type } = parsed.data;

    try {
      const docs = buildMockDocuments(clientId, year);
      const doc = docs.find((d) => d.type === type) ?? docs[0]!;

      const generated = {
        id:        `tax-doc-${clientId}-${year}-gen-${Date.now()}`,
        clientId,
        year,
        type,
        title:     doc.title,
        status:    'generated' as const,
        createdAt: new Date().toISOString(),
        interest:  doc.interest,
        deductible: doc.deductible,
        fees:      doc.fees,
      };

      logger.info('Tax document generated', { clientId, year, type, docId: generated.id });

      res.status(201).json({
        success: true,
        data:    generated,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /tax/documents/generate');
    }
  },
);

export default taxRouter;
