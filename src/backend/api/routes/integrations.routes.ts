// ============================================================
// CapitalForge — Integrations, API Portal & Business Continuity Routes
//
// POST   /api/integrations/:provider/connect
// DELETE /api/integrations/:provider/disconnect
// POST   /api/integrations/:provider/webhook
// GET    /api/api-keys
// POST   /api/api-keys
// DELETE /api/api-keys/:id
// GET    /api/observability/health
// GET    /api/observability/metrics
// POST   /api/backups/trigger
// GET    /api/backups
// POST   /api/backups/export/:businessId
// GET    /api/backups/rto-rpo
// POST   /api/webhooks
// GET    /api/webhooks
// DELETE /api/webhooks/:id
// ============================================================

import { Router, Request, Response } from 'express';
import {
  integrationLayerService,
  type IntegrationProvider,
} from '../../services/integration-layer.service.js';
import {
  apiPortalService,
} from '../../services/api-portal.service.js';
import {
  businessContinuityService,
  type BackupType,
} from '../../services/business-continuity.service.js';

export const integrationsRouter = Router();

// ── Helpers ──────────────────────────────────────────────────

function ok(res: Response, data: unknown, statusCode = 200) {
  res.status(statusCode).json({ success: true, data });
}

function err(res: Response, message: string, statusCode = 400) {
  res.status(statusCode).json({ success: false, error: message });
}

const VALID_PROVIDERS: IntegrationProvider[] = ['plaid', 'quickbooks', 'xero', 'docusign', 'stripe'];

function resolveProvider(req: Request, res: Response): IntegrationProvider | null {
  const provider = req.params['provider'] as IntegrationProvider;
  if (!VALID_PROVIDERS.includes(provider)) {
    err(res, `Unknown provider: ${provider}. Valid: ${VALID_PROVIDERS.join(', ')}`, 400);
    return null;
  }
  return provider;
}

// Stub tenant resolution — replace with req.user.tenantId from auth middleware
function getTenantId(req: Request): string {
  return (req as unknown as Record<string, unknown>)['tenantId'] as string ?? 'demo-tenant';
}

// ============================================================
// INTEGRATION ROUTES
// ============================================================

// POST /api/integrations/:provider/connect
integrationsRouter.post('/integrations/:provider/connect', async (req: Request, res: Response) => {
  const provider = resolveProvider(req, res);
  if (!provider) return;

  const tenantId = getTenantId(req);

  try {
    let connection;
    switch (provider) {
      case 'plaid':
        connection = await integrationLayerService.plaid.connect(tenantId, req.body.publicToken);
        break;
      case 'quickbooks':
        connection = await integrationLayerService.quickbooks.connect(tenantId, req.body.oauthCode, req.body.realmId);
        break;
      case 'xero':
        connection = await integrationLayerService.xero.connect(tenantId, req.body.oauthCode, req.body.xeroTenantId);
        break;
      case 'docusign':
        connection = await integrationLayerService.docusign.connect(tenantId, req.body.oauthCode, req.body.accountId);
        break;
      case 'stripe':
        connection = await integrationLayerService.stripe.connect(tenantId, req.body.publishableKey, req.body.secretKey);
        break;
    }
    ok(res, connection, 201);
  } catch (e) {
    err(res, (e as Error).message, 500);
  }
});

// DELETE /api/integrations/:provider/disconnect
integrationsRouter.delete('/integrations/:provider/disconnect', async (req: Request, res: Response) => {
  const provider = resolveProvider(req, res);
  if (!provider) return;

  const tenantId = getTenantId(req);

  try {
    await (integrationLayerService[provider] as { disconnect: (t: string) => Promise<void> }).disconnect(tenantId);
    ok(res, { provider, status: 'disconnected' });
  } catch (e) {
    err(res, (e as Error).message, 404);
  }
});

// GET /api/integrations
integrationsRouter.get('/integrations', (req: Request, res: Response) => {
  const tenantId   = getTenantId(req);
  const connections = integrationLayerService.listConnections(tenantId);
  ok(res, connections);
});

// POST /api/integrations/:provider/webhook  (inbound webhook from provider)
integrationsRouter.post('/integrations/:provider/webhook', async (req: Request, res: Response) => {
  const provider = resolveProvider(req, res);
  if (!provider) return;

  const tenantId  = getTenantId(req);
  const signature = req.headers['stripe-signature'] as string | undefined
    ?? req.headers['x-docusign-signature'] as string | undefined
    ?? '';

  try {
    let event;
    switch (provider) {
      case 'plaid':
        event = await integrationLayerService.plaid.handleWebhook(tenantId, req.body);
        break;
      case 'quickbooks':
        event = await integrationLayerService.quickbooks.handleWebhook(tenantId, req.body);
        break;
      case 'xero':
        event = await integrationLayerService.xero.handleWebhook(tenantId, req.body);
        break;
      case 'docusign':
        event = await integrationLayerService.docusign.handleWebhook(tenantId, req.body);
        break;
      case 'stripe':
        event = await integrationLayerService.stripe.handleWebhook(tenantId, req.body, signature);
        break;
    }
    ok(res, event, 200);
  } catch (e) {
    err(res, (e as Error).message, 400);
  }
});

// POST /api/integrations/:provider/sync
integrationsRouter.post('/integrations/:provider/sync', async (req: Request, res: Response) => {
  const provider = resolveProvider(req, res);
  if (!provider) return;

  const tenantId = getTenantId(req);

  try {
    const result = await (integrationLayerService[provider] as { sync: (t: string) => Promise<unknown> }).sync(tenantId);
    ok(res, result);
  } catch (e) {
    err(res, (e as Error).message, 500);
  }
});

// GET /api/integrations/dead-letters
integrationsRouter.get('/integrations/dead-letters', (_req: Request, res: Response) => {
  ok(res, integrationLayerService.listDeadLettered());
});

// ============================================================
// API KEY ROUTES
// ============================================================

// GET /api/api-keys
integrationsRouter.get('/api-keys', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  ok(res, apiPortalService.listApiKeys(tenantId));
});

// POST /api/api-keys
integrationsRouter.post('/api-keys', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { name, scopes, expiresAt } = req.body as {
    name?: string;
    scopes?: string[];
    expiresAt?: string;
  };

  if (!name) return err(res, 'name is required');

  const keyWithSecret = apiPortalService.generateApiKey(
    tenantId,
    name,
    scopes ?? ['read'],
    expiresAt ? new Date(expiresAt) : undefined,
  );
  ok(res, keyWithSecret, 201);
});

// DELETE /api/api-keys/:id  (revoke)
integrationsRouter.delete('/api-keys/:id', (req: Request, res: Response) => {
  try {
    const key = apiPortalService.revokeApiKey(req.params['id']);
    ok(res, key);
  } catch (e) {
    err(res, (e as Error).message, 404);
  }
});

// ============================================================
// WEBHOOK SUBSCRIPTION ROUTES
// ============================================================

// GET /api/webhooks
integrationsRouter.get('/webhooks', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  ok(res, apiPortalService.listWebhookSubscriptions(tenantId));
});

// POST /api/webhooks
integrationsRouter.post('/webhooks', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { url, events } = req.body as { url?: string; events?: string[] };

  if (!url)    return err(res, 'url is required');
  if (!events?.length) return err(res, 'events array is required');

  const sub = apiPortalService.createWebhookSubscription(tenantId, url, events);
  ok(res, sub, 201);
});

// DELETE /api/webhooks/:id
integrationsRouter.delete('/webhooks/:id', (req: Request, res: Response) => {
  try {
    apiPortalService.deleteWebhookSubscription(req.params['id']);
    ok(res, { deleted: true });
  } catch (e) {
    err(res, (e as Error).message, 404);
  }
});

// ============================================================
// OBSERVABILITY ROUTES
// ============================================================

// GET /api/observability/health
integrationsRouter.get('/observability/health', (_req: Request, res: Response) => {
  ok(res, apiPortalService.getHealthMetrics());
});

// GET /api/observability/metrics
integrationsRouter.get('/observability/metrics', (req: Request, res: Response) => {
  const tenantId    = getTenantId(req);
  const periodStart = req.query['from']
    ? new Date(req.query['from'] as string)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const periodEnd   = req.query['to']
    ? new Date(req.query['to'] as string)
    : new Date();

  ok(res, apiPortalService.getTenantMetrics(tenantId, periodStart, periodEnd));
});

// GET /api/observability/rate-limits
integrationsRouter.get('/observability/rate-limits', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  ok(res, apiPortalService.getRateLimitConfig(tenantId));
});

// PUT /api/observability/rate-limits
integrationsRouter.put('/observability/rate-limits', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const updated  = apiPortalService.updateRateLimitConfig(tenantId, req.body);
  ok(res, updated);
});

// ============================================================
// BACKUP / DR ROUTES
// ============================================================

// POST /api/backups/trigger
integrationsRouter.post('/backups/trigger', async (req: Request, res: Response) => {
  const tenantId  = req.body.scope === 'tenant' ? getTenantId(req) : undefined;
  const type: BackupType = ['full', 'incremental', 'snapshot'].includes(req.body.backupType)
    ? req.body.backupType as BackupType
    : 'incremental';

  try {
    const record = await businessContinuityService.triggerBackup(type, tenantId);
    ok(res, record, 202);
  } catch (e) {
    err(res, (e as Error).message, 500);
  }
});

// GET /api/backups
integrationsRouter.get('/backups', (req: Request, res: Response) => {
  const tenantId = req.query['tenantId'] as string | undefined;
  const limit    = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 30;
  ok(res, businessContinuityService.listBackups({ tenantId, limit }));
});

// GET /api/backups/:id
integrationsRouter.get('/backups/:id', (req: Request, res: Response) => {
  const record = businessContinuityService.getBackup(req.params['id']);
  if (!record) return err(res, 'Backup record not found', 404);
  ok(res, record);
});

// GET /api/backups/rto-rpo
integrationsRouter.get('/backups/rto-rpo', (req: Request, res: Response) => {
  const tenantId = req.query['tenantId'] as string | undefined;
  ok(res, businessContinuityService.getRtoRpoStatus(tenantId));
});

// POST /api/backups/export/:businessId
integrationsRouter.post('/backups/export/:businessId', async (req: Request, res: Response) => {
  const tenantId    = getTenantId(req);
  const businessId  = req.params['businessId'];
  const requestedBy = req.body.requestedBy ?? 'system';

  try {
    const result = await businessContinuityService.exportClientCase(tenantId, businessId, requestedBy);
    ok(res, result, 201);
  } catch (e) {
    err(res, (e as Error).message, 500);
  }
});

// POST /api/backups/recovery-tests
integrationsRouter.post('/backups/recovery-tests', (req: Request, res: Response) => {
  const { testedBy, testType, backupId, startedAt, completedAt, outcome, rtoAchievedMinutes, notes } = req.body;
  if (!testedBy || !testType || !outcome) {
    return err(res, 'testedBy, testType, and outcome are required');
  }
  const log = businessContinuityService.logRecoveryTest({
    testedBy,
    testType,
    backupId,
    startedAt:           startedAt  ? new Date(startedAt)  : new Date(),
    completedAt:         completedAt ? new Date(completedAt) : undefined,
    outcome,
    rtoAchievedMinutes,
    notes: notes ?? '',
  });
  ok(res, log, 201);
});

// GET /api/backups/recovery-tests
integrationsRouter.get('/backups/recovery-tests', (req: Request, res: Response) => {
  const limit   = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
  const outcome = req.query['outcome'] as 'pass' | 'fail' | 'partial' | undefined;
  ok(res, businessContinuityService.listRecoveryTests({ limit, outcome }));
});
