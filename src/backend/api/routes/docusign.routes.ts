// ============================================================
// CapitalForge — DocuSign Routes
//
// POST /api/docusign/send          — send document for e-signature
// GET  /api/docusign/status/:id    — check envelope status
// POST /api/docusign/webhook       — webhook receiver for DocuSign
//                                    completion events
// ============================================================

import { Router, type Request, type Response } from 'express';
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

const SendForSignatureSchema = z.object({
  signerEmail:     z.string().email('Valid signer email is required'),
  signerName:      z.string().min(1, 'Signer name is required'),
  documentBase64:  z.string().min(1, 'Document content is required'),
  documentName:    z.string().min(1, 'Document name is required'),
  envelopeSubject: z.string().min(1, 'Envelope subject is required'),
  envelopeMessage: z.string().optional(),
  businessId:      z.string().min(1, 'Business ID is required'),
  docType:         z.string().min(1, 'Document type is required'),
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
      const result = await svc.sendForSignature({
        ...input,
        tenantId: tenant.tenantId,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[DocuSignRoutes] Error sending for signature', {
        businessId: input.businessId,
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

      // If envelope-completed, also update acknowledgment records
      if (event === 'envelope-completed' && envelopeId) {
        const completedAt = (summary['completedDateTime'] as string) ?? new Date().toISOString();
        await svc.handleWebhookCompletion(envelopeId, 'completed', completedAt);
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
