// ============================================================
// CapitalForge — Tax Document Routes
//
// Endpoints:
//   GET  /api/tax/documents?clientId=X&year=Y  — refused
//   GET  /api/tax/documents/:id/download       — refused
//   GET  /api/tax/documents/:id/summary        — refused
//   POST /api/tax/documents/generate           — refused
//
// All four served fabricated tax documents.
//
// The list returned a 1099-INT marked status "final", with Box 1 — Interest
// Income of $2,345.67, naming CapitalForge Platform as the payer and the
// client as the recipient. A 1099-INT is an IRS information return. Beside it
// were an annual fee summary totalling $3,200.00 of deductible fees broken
// down to the line, and an IRC 163(j) interest limitation worksheet. Every
// figure was written into this file. Every client got the same ones, for
// every year, and /download served them as a document to keep.
//
// Nothing records any of it. There is no tax document table, no interest this
// platform paid anybody, and no fee total computed from the invoices that do
// exist. The amounts were not stale or approximate — they were invented, and
// marked final.
//
// So these refuse. A client filing an invented 1099, or handing that fee
// summary to an accountant, is a worse outcome than the page saying no forms
// have been prepared, which is what /financial-control/tax already says.
//
// What would make them real: a tax_documents table, generated from the
// invoices and interest actually on record, with a status that distinguishes
// a draft from something filed. That is a feature, and it is not what these
// were.
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const taxRouter = Router({ mergeParams: true });

/** One refusal, so the four cannot drift apart. */
function refuse(what: string) {
  return (req: Request, res: Response): void => {
    logger.info('[tax] refused — no tax documents are recorded', {
      path: req.path,
      tenantId: req.tenant?.tenantId,
    });

    const body: ApiResponse = {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          `${what} is not implemented. Nothing records a tax document for a client: there is ` +
          'no table behind these, and the figures previously returned — a 1099-INT with ' +
          '$2,345.67 of interest income marked final, a $3,200.00 deductible fee summary, and ' +
          'an IRC 163(j) worksheet — were written into the source and served identically to ' +
          'every client for every year.',
      },
    };
    res.status(501).json(body);
  };
}

taxRouter.get('/documents', refuse('Listing tax documents'));
taxRouter.get('/documents/:id/download', refuse('Downloading a tax document'));
taxRouter.get('/documents/:id/summary', refuse('Summarising a tax document'));
taxRouter.post('/documents/generate', refuse('Generating a tax document'));

export default taxRouter;
