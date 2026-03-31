// ============================================================
// CapitalForge — Consent Routes
//
// Mounts the Universal Consent & Preference Center API under:
//   /api/businesses/:id/consent
//
// Routes:
//   POST   /api/businesses/:id/consent              — Grant consent
//   DELETE /api/businesses/:id/consent/:channel     — Revoke (cascade)
//   GET    /api/businesses/:id/consent              — All current statuses
//   GET    /api/businesses/:id/consent/audit        — Full immutable history
//
// Every route requires authentication. The tenantId is sourced from
// the verified JWT (req.tenant) — it is NEVER accepted from the
// request body or path params to prevent cross-tenant manipulation.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { ConsentService } from '../../services/consent.service.js';
import {
  GrantConsentBodySchema,
  RevokeConsentBodySchema,
  ConsentChannelParamSchema,
  ConsentAuditQuerySchema,
} from '@shared/validators/consent.validators.js';
import type { ApiResponse } from '@shared/types/index.js';
import type {
  ConsentAuditEntry,
  ConsentStatusResult,
  ConsentAuditExport,
} from '../../services/consent.service.js';
import logger from '../../config/logger.js';

// ----------------------------------------------------------------
// Router setup
// ----------------------------------------------------------------

const router = Router({ mergeParams: true });

// All consent routes require a valid tenant JWT
router.use(tenantMiddleware);

// Shared service instance — one per router mount (test-injectable via factory)
let _service: ConsentService | null = null;
function getService(): ConsentService {
  _service ??= new ConsentService();
  return _service;
}

/** For testing: inject a mock ConsentService */
export function _injectConsentService(svc: ConsentService): void {
  _service = svc;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim();
  }
  return req.socket?.remoteAddress ?? undefined;
}

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiResponse = {
    success: false,
    error: { code, message, details },
  };
  res.status(status).json(body);
}

// ----------------------------------------------------------------
// POST /api/businesses/:id/consent
// Grant consent for a channel
// ----------------------------------------------------------------

router.post(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    const businessId = req.params['id'];

    if (!tenantId) {
      sendError(res, 401, 'UNAUTHORIZED', 'Tenant context is required.');
      return;
    }

    const bodyParsed = GrantConsentBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body.', bodyParsed.error.flatten());
      return;
    }

    const { channel, consentType, evidenceRef, metadata } = bodyParsed.data;
    const ipAddress = clientIp(req);
    const actorId = req.tenant?.userId;

    try {
      const record = await getService().grantConsent({
        tenantId,
        businessId,
        channel,
        consentType,
        ipAddress,
        evidenceRef,
        metadata,
        actorId,
      });

      logger.info('[consent.routes] Consent granted', {
        tenantId,
        businessId,
        channel,
        consentType,
        recordId: record.id,
      });

      const body: ApiResponse<ConsentAuditEntry> = {
        success: true,
        data: record,
      };
      res.status(201).json(body);
    } catch (err) {
      logger.error('[consent.routes] Failed to grant consent', {
        tenantId,
        businessId,
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to record consent grant.');
    }
  },
);

// ----------------------------------------------------------------
// DELETE /api/businesses/:id/consent/:channel
// Revoke consent for a channel — cascades to all downstream modules
// ----------------------------------------------------------------

router.delete(
  '/:channel',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    const businessId = req.params['id'];

    if (!tenantId) {
      sendError(res, 401, 'UNAUTHORIZED', 'Tenant context is required.');
      return;
    }

    // Validate the channel path param
    const paramParsed = ConsentChannelParamSchema.safeParse({
      channel: req.params['channel'],
    });
    if (!paramParsed.success) {
      sendError(
        res, 400, 'INVALID_CHANNEL',
        `"${req.params['channel']}" is not a valid consent channel. ` +
        `Valid channels: voice, sms, email, partner, document.`,
      );
      return;
    }

    const bodyParsed = RevokeConsentBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body.', bodyParsed.error.flatten());
      return;
    }

    const { channel } = paramParsed.data;
    const { revocationReason } = bodyParsed.data ?? {};
    const ipAddress = clientIp(req);
    const actorId = req.tenant?.userId;

    try {
      const result = await getService().revokeConsent({
        tenantId,
        businessId,
        channel,
        revocationReason,
        ipAddress,
        actorId,
      });

      logger.warn('[consent.routes] Consent revoked', {
        tenantId,
        businessId,
        channel,
        revokedCount: result.revokedCount,
        actorId,
      });

      const body: ApiResponse<typeof result> = {
        success: true,
        data: result,
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[consent.routes] Failed to revoke consent', {
        tenantId,
        businessId,
        channel,
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to revoke consent.');
    }
  },
);

// ----------------------------------------------------------------
// GET /api/businesses/:id/consent/audit
// Full immutable history — MUST be registered BEFORE the generic
// GET /:channel route to avoid "audit" being matched as a channel param
// ----------------------------------------------------------------

router.get(
  '/audit',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    const businessId = req.params['id'];

    if (!tenantId) {
      sendError(res, 401, 'UNAUTHORIZED', 'Tenant context is required.');
      return;
    }

    const queryParsed = ConsentAuditQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters.', queryParsed.error.flatten());
      return;
    }

    try {
      const exportData = await getService().exportAudit(tenantId, businessId);

      // Apply optional filters from query params post-fetch
      // (avoids adding complexity to the service layer)
      const { channel, consentType, since, until } = queryParsed.data ?? {};
      let records = exportData.records;

      if (channel) {
        records = records.filter((r) => r.channel === channel);
      }
      if (consentType) {
        records = records.filter((r) => r.consentType === consentType);
      }
      if (since) {
        const sinceDate = new Date(since);
        records = records.filter((r) => r.grantedAt >= sinceDate);
      }
      if (until) {
        const untilDate = new Date(until);
        records = records.filter((r) => r.grantedAt <= untilDate);
      }

      const filtered: ConsentAuditExport = {
        ...exportData,
        records,
        totalRecords: records.length,
      };

      logger.info('[consent.routes] Audit export requested', {
        tenantId,
        businessId,
        recordCount: filtered.totalRecords,
        actorId: req.tenant?.userId,
      });

      const body: ApiResponse<ConsentAuditExport> = {
        success: true,
        data: filtered,
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[consent.routes] Failed to export audit', {
        tenantId,
        businessId,
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate consent audit export.');
    }
  },
);

// ----------------------------------------------------------------
// GET /api/businesses/:id/consent
// Current consent status for all channels
// ----------------------------------------------------------------

router.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    const businessId = req.params['id'];

    if (!tenantId) {
      sendError(res, 401, 'UNAUTHORIZED', 'Tenant context is required.');
      return;
    }

    try {
      const statuses = await getService().getConsentStatuses(tenantId, businessId);

      const body: ApiResponse<ConsentStatusResult[]> = {
        success: true,
        data: statuses,
        meta: { total: statuses.length },
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[consent.routes] Failed to fetch consent statuses', {
        tenantId,
        businessId,
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve consent statuses.');
    }
  },
);

export default router;
