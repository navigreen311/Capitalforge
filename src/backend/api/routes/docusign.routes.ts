// ============================================================
// CapitalForge — DocuSign Routes
//
// POST /api/docusign/send          — send document for e-signature
// GET  /api/docusign/status/:id    — check envelope status
// POST /api/docusign/webhook       — webhook receiver for DocuSign
//                                    completion events
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { z, ZodError } from 'zod';

import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { DocuSignService, docuSignService } from '../../services/docusign.service.js';
import {
  DocuSignWebhookHandler,
  docuSignWebhookHandler,
} from '../../integrations/docusign/index.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Request Validators ────────────────────────────────────────

/**
 * The caller names a document. It does not describe one.
 *
 * This used to take signerEmail, signerName, documentBase64, documentName,
 * businessId and docType from the request body — so the only caller sent
 * `signerEmail: 'client@example.com'`, `signerName: 'Client Signer'` and
 * `documentBase64: btoa(doc.name)`, the filename encoded as if it were a
 * document. The comments said "In production, fetched from client record",
 * which is an intention, not a safeguard.
 *
 * Everything else is now derived server-side from the document and the
 * business it belongs to. A caller cannot supply a signer or a payload it
 * invented, because it does not supply them at all.
 */
import { prisma as sharedPrisma } from '../../config/database.js';
import { storageService as storage } from '../../services/storage.service.js';

const SendForSignatureSchema = z.object({
  documentId:      z.string().min(1, 'documentId is required'),
  /** Optional overrides for the covering email only — never the parties. */
  envelopeSubject: z.string().min(1).optional(),
  envelopeMessage: z.string().optional(),
});

const EnvelopeIdParamSchema = z.object({
  envelopeId: z.string().min(1, 'Envelope ID is required'),
});

// ── Router Factory ────────────────────────────────────────────

export function createDocuSignRouter(
  service?: DocuSignService,
  webhookHandler?: DocuSignWebhookHandler,
): Router {
  const router = Router();
  const svc = service ?? docuSignService;
  const webhook = webhookHandler ?? docuSignWebhookHandler;

  // ── POST /api/docusign/send ─────────────────────────────────
  // Requires authentication (tenant context)
  router.post('/send', tenantMiddleware, async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant;

    if (!tenant) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      };
      res.status(401).json(body);
      return;
    }

    // Validate request body
    let input;
    try {
      input = SendForSignatureSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const body: ApiResponse = {
          success: false,
          error: {
            code:    'VALIDATION_ERROR',
            message: 'Invalid send-for-signature request.',
            details: err.flatten().fieldErrors as Record<string, string[]>,
          },
        };
        res.status(422).json(body);
        return;
      }
      throw err;
    }

    try {
      const resolved = await resolveSignatureRequest(input.documentId, tenant.tenantId);

      if ('error' in resolved) {
        // Refuse rather than substitute. A placeholder signer means the
        // envelope goes to nobody, or worse, to somebody.
        const body: ApiResponse = {
          success: false,
          error: { code: resolved.error.code, message: resolved.error.message },
        };
        res.status(resolved.error.status).json(body);
        return;
      }

      const result = await svc.sendForSignature({
        ...resolved.request,
        envelopeSubject: input.envelopeSubject ?? resolved.request.envelopeSubject,
        envelopeMessage: input.envelopeMessage ?? resolved.request.envelopeMessage,
        tenantId: tenant.tenantId,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[DocuSignRoutes] Error sending for signature', {
        documentId: input.documentId,
        tenantId:   tenant.tenantId,
        error:      err instanceof Error ? err.message : String(err),
      });

      const body: ApiResponse = {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to send document for signature.' },
      };
      res.status(500).json(body);
    }
  });

  // ── GET /api/docusign/status/:envelopeId ────────────────────
  // Requires authentication (tenant context)
  router.get('/status/:envelopeId', tenantMiddleware, async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant;

    if (!tenant) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      };
      res.status(401).json(body);
      return;
    }

    // Validate params
    let params;
    try {
      params = EnvelopeIdParamSchema.parse({ envelopeId: req.params['envelopeId'] });
    } catch (err) {
      if (err instanceof ZodError) {
        const body: ApiResponse = {
          success: false,
          error: {
            code:    'VALIDATION_ERROR',
            message: 'Invalid envelope ID.',
            details: err.flatten().fieldErrors as Record<string, string[]>,
          },
        };
        res.status(422).json(body);
        return;
      }
      throw err;
    }

    try {
      const result = await svc.getEnvelopeStatus(params.envelopeId, tenant.tenantId);

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[DocuSignRoutes] Error fetching envelope status', {
        envelopeId: params.envelopeId,
        tenantId:   tenant.tenantId,
        error:      err instanceof Error ? err.message : String(err),
      });

      const body: ApiResponse = {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch envelope status.' },
      };
      res.status(500).json(body);
    }
  });

  // ── POST /api/docusign/webhook ──────────────────────────────
  // Public endpoint — no auth required (DocuSign Connect calls this)
  // HMAC signature verification is handled inside the webhook handler
  router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
    try {
      // Extract envelope status from webhook payload
      const body = req.body as Record<string, unknown>;
      const data = (body['data'] as Record<string, unknown>) ?? {};
      const summary = (data['envelopeSummary'] as Record<string, unknown>) ?? {};
      const envelopeId = (data['envelopeId'] as string) ?? '';
      const event = (body['event'] as string) ?? '';

      logger.info('[DocuSignRoutes] Webhook received', { event, envelopeId });

      // Delegate to the webhook handler for signature verification and processing
      await webhook.handle(req, res);

      // Update acknowledgment records based on envelope event
      if (envelopeId) {
        switch (event) {
          case 'envelope-completed': {
            const completedAt = (summary['completedDateTime'] as string) ?? new Date().toISOString();
            await svc.handleWebhookCompletion(envelopeId, 'completed', completedAt);
            break;
          }
          case 'envelope-declined': {
            const declinedAt = (summary['declinedDateTime'] as string) ?? new Date().toISOString();
            await svc.handleWebhookCompletion(envelopeId, 'declined', declinedAt);
            break;
          }
          case 'envelope-voided': {
            const voidedAt = (summary['voidedDateTime'] as string) ?? new Date().toISOString();
            await svc.handleWebhookCompletion(envelopeId, 'voided', voidedAt);
            break;
          }
          default:
            logger.debug('[DocuSignRoutes] Webhook event not mapped to acknowledgment update', { event });
        }
      }
    } catch (err) {
      logger.error('[DocuSignRoutes] Webhook processing error', {
        error: err instanceof Error ? err.message : String(err),
      });

      // Always return 200 to DocuSign to prevent retries
      if (!res.headersSent) {
        res.status(200).json({
          success: true,
          data: { received: true, error: (err as Error).message },
        });
      }
    }
  });

  return router;
}

// ── Default export ────────────────────────────────────────────

export const docuSignRouter = createDocuSignRouter();

// ── Resolving a signature request from a document ────────────

interface ResolvedSignatureRequest {
  request: {
    signerEmail: string;
    signerName: string;
    documentBase64: string;
    documentName: string;
    envelopeSubject: string;
    envelopeMessage: string;
    businessId: string;
    docType: string;
  };
}

interface ResolutionFailure {
  error: { code: string; message: string; status: number };
}

/**
 * Turn a document id into everything the envelope needs — or a refusal.
 *
 * Every field here used to arrive from the browser. The signer was a
 * hardcoded `client@example.com`, and the document was its own filename
 * base64-encoded. Deriving them here is what makes those unrepresentable.
 *
 * Each failure is a distinct refusal rather than a fallback, because every
 * fallback available is worse than not sending: an envelope to a placeholder
 * address reaches nobody, and an envelope to a *real* wrong address is a
 * client's contract in a stranger's inbox.
 */
async function resolveSignatureRequest(
  documentId: string,
  tenantId: string,
): Promise<ResolvedSignatureRequest | ResolutionFailure> {
  const document = await sharedPrisma.document.findFirst({
    where: { id: documentId, tenantId },
    include: {
      business: {
        include: {
          // Highest stake first: the person who signs for the business.
          owners: { orderBy: { ownershipPercent: 'desc' } },
        },
      },
    },
  });

  if (!document) {
    return {
      error: { code: 'NOT_FOUND', message: `Document ${documentId} was not found.`, status: 404 },
    };
  }

  const business = document.business;
  if (!business) {
    return {
      error: {
        code: 'DOCUMENT_HAS_NO_BUSINESS',
        message: 'That document is not attached to a client, so there is nobody to send it to.',
        status: 422,
      },
    };
  }

  // `BusinessOwner` has no email column, so the business address is the only
  // recorded destination. Recorded in docs/gaps.md: signing ought to go to a
  // named owner, and that needs a column before it can.
  const signerEmail = business.businessEmail;
  if (signerEmail === null || signerEmail.trim() === '') {
    return {
      error: {
        code: 'NO_SIGNER_EMAIL',
        message:
          `No email is recorded for ${business.legalName}, so this document cannot be sent for `
          + 'signature. Add a business email on the client profile first.',
        status: 422,
      },
    };
  }

  const owner = business.owners[0];
  const signerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : business.legalName;

  let content: Buffer;
  try {
    content = await storage.readFile(document.storageKey);
  } catch (err) {
    logger.error('[DocuSignRoutes] Document bytes unavailable', {
      documentId,
      storageKey: document.storageKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      error: {
        code: 'DOCUMENT_UNAVAILABLE',
        message: 'The stored file for that document could not be read, so nothing was sent.',
        status: 422,
      },
    };
  }

  if (content.length === 0) {
    return {
      error: {
        code: 'DOCUMENT_EMPTY',
        message: 'That document is empty, so there is nothing to sign.',
        status: 422,
      },
    };
  }

  return {
    request: {
      signerEmail,
      signerName,
      documentBase64: content.toString('base64'),
      documentName: document.title,
      envelopeSubject: `CapitalForge: Please sign ${document.title}`,
      envelopeMessage: `Please review and sign "${document.title}".`,
      businessId: business.id,
      docType: document.documentType,
    },
  };
}
