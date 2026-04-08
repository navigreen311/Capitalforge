// ============================================================
// CapitalForge — Platform Offboarding Routes
//
// Endpoints:
//   PATCH /api/platform/offboarding/:id/advance   — advance offboarding stage
//   GET   /api/platform/offboarding/:id/audit-log — mock audit log
// ============================================================

import { Router, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const platformOffboardingRouter = Router();

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
// Stage progression map
// ============================================================

const STAGE_ORDER = ['requested', 'retention_hold', 'data_export', 'deleting', 'completed'] as const;
type OffboardingStage = (typeof STAGE_ORDER)[number];

function nextStage(current: string): OffboardingStage | null {
  const idx = STAGE_ORDER.indexOf(current as OffboardingStage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

// In-memory stage tracker (keyed by offboarding id)
const stageTracker: Record<string, OffboardingStage> = {};

// ============================================================
// PATCH /api/platform/offboarding/:id/advance
// ============================================================

const AdvanceSchema = z.object({
  notes: z.string().optional(),
});

platformOffboardingRouter.patch('/:id/advance', (req: Request, res: Response) => {
  const offboardingId = req.params.id as string;
  logger.info(`[platform-offboarding] PATCH /${offboardingId}/advance`);

  const parsed = AdvanceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);

  const currentStage = stageTracker[offboardingId] ?? 'requested';
  const next = nextStage(currentStage);

  if (!next) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'ALREADY_COMPLETED',
        message: `Offboarding ${offboardingId} is already at terminal stage "${currentStage}".`,
      },
      statusCode: 400,
    });
  }

  stageTracker[offboardingId] = next;

  return ok(res, {
    offboardingId,
    previousStage: currentStage,
    currentStage: next,
    notes: parsed.data.notes ?? null,
    advancedAt: new Date().toISOString(),
    isTerminal: next === 'completed',
  });
});

// ============================================================
// GET /api/platform/offboarding/:id/audit-log
// ============================================================

platformOffboardingRouter.get('/:id/audit-log', (req: Request, res: Response) => {
  const offboardingId = req.params.id as string;
  logger.info(`[platform-offboarding] GET /${offboardingId}/audit-log`);

  const currentStage = stageTracker[offboardingId] ?? 'requested';
  const baseTime = Date.now();

  // Build audit entries up to the current stage
  const currentIdx = STAGE_ORDER.indexOf(currentStage as OffboardingStage);
  const entries = STAGE_ORDER.slice(0, currentIdx + 1).map((stage, i) => ({
    id: `audit_${offboardingId}_${String(i + 1).padStart(3, '0')}`,
    offboardingId,
    stage,
    action: i === 0 ? 'Offboarding request created' : `Stage advanced to "${stage}"`,
    performedBy: 'system',
    timestamp: new Date(baseTime - (currentIdx - i) * 3_600_000).toISOString(),
    metadata: { automated: i > 0 },
  }));

  return ok(res, {
    offboardingId,
    currentStage,
    entries,
    totalEntries: entries.length,
  });
});
