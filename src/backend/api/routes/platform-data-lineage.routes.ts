// ============================================================
// CapitalForge — Platform Data Lineage Routes
//
// Endpoints:
//   GET  /api/platform/data-lineage/:businessId/events — mock lineage events
//   POST /api/platform/data-lineage/:businessId/export — mock lineage report
// ============================================================

import { Router, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

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

function mockEvents(businessId: string) {
  const baseTime = Date.now();
  return [
    {
      id: `dle_${businessId}_001`,
      businessId,
      eventType: 'data.created',
      source: 'onboarding-service',
      description: 'Business profile created during onboarding',
      timestamp: new Date(baseTime - 30 * 86_400_000).toISOString(),
      metadata: { fields: ['legalName', 'ein', 'address'], actor: 'system' },
    },
    {
      id: `dle_${businessId}_002`,
      businessId,
      eventType: 'data.enriched',
      source: 'kyb-service',
      description: 'Business data enriched with KYB verification results',
      timestamp: new Date(baseTime - 28 * 86_400_000).toISOString(),
      metadata: { provider: 'Middesk', fields: ['verificationStatus', 'sosFilingStatus'] },
    },
    {
      id: `dle_${businessId}_003`,
      businessId,
      eventType: 'data.updated',
      source: 'credit-service',
      description: 'Credit profile pulled and attached',
      timestamp: new Date(baseTime - 25 * 86_400_000).toISOString(),
      metadata: { bureau: 'Experian', fields: ['creditScore', 'tradelines'] },
    },
    {
      id: `dle_${businessId}_004`,
      businessId,
      eventType: 'data.shared',
      source: 'application-service',
      description: 'Data shared with issuer for card application',
      timestamp: new Date(baseTime - 20 * 86_400_000).toISOString(),
      metadata: { issuer: 'Chase', applicationId: 'app_mock_001', consentId: 'consent_001' },
    },
    {
      id: `dle_${businessId}_005`,
      businessId,
      eventType: 'data.accessed',
      source: 'reporting-service',
      description: 'Data accessed for compliance audit report generation',
      timestamp: new Date(baseTime - 10 * 86_400_000).toISOString(),
      metadata: { reportType: 'compliance-audit', accessedBy: 'compliance_officer' },
    },
    {
      id: `dle_${businessId}_006`,
      businessId,
      eventType: 'data.retained',
      source: 'retention-service',
      description: 'Retention policy evaluated — data marked for 7-year hold',
      timestamp: new Date(baseTime - 5 * 86_400_000).toISOString(),
      metadata: { retentionPolicy: '7-year-regulatory', expiresAt: new Date(baseTime + 7 * 365 * 86_400_000).toISOString() },
    },
  ];
}

platformDataLineageRouter.get('/:businessId/events', (req: Request, res: Response) => {
  const businessId = req.params.businessId as string;
  logger.info(`[platform-data-lineage] GET /${businessId}/events`);

  const events = mockEvents(businessId);

  return ok(res, {
    businessId,
    events,
    totalEvents: events.length,
  });
});

// ============================================================
// POST /api/platform/data-lineage/:businessId/export
// ============================================================

const ExportSchema = z.object({
  format: z.enum(['pdf', 'csv', 'json']).default('pdf'),
  includeMetadata: z.boolean().default(true),
});

platformDataLineageRouter.post('/:businessId/export', (req: Request, res: Response) => {
  const businessId = req.params.businessId as string;
  logger.info(`[platform-data-lineage] POST /${businessId}/export`);

  const parsed = ExportSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);

  const { format, includeMetadata } = parsed.data;
  const events = mockEvents(businessId);

  return ok(res, {
    businessId,
    fileName: `data-lineage-${businessId}-${new Date().toISOString().slice(0, 10)}.${format}`,
    format,
    mimeType: format === 'pdf' ? 'application/pdf' : format === 'csv' ? 'text/csv' : 'application/json',
    content: `[Mock ${format.toUpperCase()} data lineage report for business ${businessId} — ${events.length} events${includeMetadata ? ' with metadata' : ''}]`,
    eventCount: events.length,
    generatedAt: new Date().toISOString(),
  });
});
