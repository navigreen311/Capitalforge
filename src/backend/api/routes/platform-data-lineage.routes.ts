// ============================================================
// CapitalForge — Platform Data Lineage Routes
//
// Endpoints:
//   GET  /api/platform/data-lineage/:businessId/events — reports that nothing
//        records a lineage event; it does not answer with one
//   POST /api/platform/data-lineage/:businessId/export — refused, 501
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import { z, ZodError } from 'zod';
import type { ApiResponse } from '../../../shared/types/index.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import { businessBelongsToTenant } from '../../services/business-ownership.js';

export const platformDataLineageRouter = Router();

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

function validationError(res: Response, err: ZodError) {
  const details: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    details[key] = details[key] || [];
    details[key].push(issue.message);
  }
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details },
    statusCode: 400,
  });
}

// ============================================================
// GET /api/platform/data-lineage/:businessId/events
// ============================================================

// ── GET /api/platform/data-lineage/:businessId/events ────────
//
// Nothing records a data-lineage event, so this reports that rather than
// answering.
//
// It used to call `mockEvents(businessId)`, which generated six events for
// whatever id it was handed — "Business profile created during onboarding",
// "enriched with KYB verification results", "Retention policy evaluated — data
// marked for 7-year hold" — each with a source service, an actor and a
// timestamp counted backwards from now. A lineage is the record of what
// happened to a client's data. Generating one is the single least appropriate
// place in this product to invent a history.
//
// An empty list would be the wrong fix. `events: []` says this client's data has
// no recorded history, which is a claim about the client. `recorded: false` says
// nothing anywhere records one, which is a claim about the system — and it is
// the true one.
platformDataLineageRouter.get(
  '/:businessId/events',
  async (req: Request, res: Response) => {
    const businessId = req.params.businessId as string;
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      };
      return res.status(401).json(body);
    }

    // Scoped even though the answer carries no client data: an unscoped id would
    // still confirm which business ids exist on other tenants.
    if (!(await businessBelongsToTenant(sharedPrisma, businessId, tenantId))) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `No business found with id ${businessId}.` },
      };
      return res.status(404).json(body);
    }

    return ok(res, {
      businessId,
      recorded: false,
      notRecordedReason:
        'No data-lineage event has ever been recorded. No table holds one and no '
        + 'service writes one, so there is no history to show for any client. This '
        + 'is not the same as a client whose data has not changed.',
      events: [],
      totalEvents: 0,
    });
  },
);

// ============================================================
// POST /api/platform/data-lineage/:businessId/export
// ============================================================

const ExportSchema = z.object({
  format: z.enum(['pdf', 'csv', 'json']).default('pdf'),
  includeMetadata: z.boolean().default(true),
});

// ── POST /api/platform/data-lineage/:businessId/export ───────
//
// Refused. It built a downloadable lineage report — filename, format, size —
// from the same generated events, so a compliance officer could save a document
// describing six things that never happened to a client's data.
platformDataLineageRouter.post('/:businessId/export', (req: Request, res: Response) => {
  const parsed = ExportSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);

  const body: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'Data-lineage export is not implemented. Nothing records a lineage event, so '
        + 'there is nothing to export. This used to return a report built from six '
        + 'generated events — profile created, KYB enrichment, retention policy '
        + 'evaluated — for whatever business id was supplied.',
    },
  };
  return res.status(501).json(body);
});
