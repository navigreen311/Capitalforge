// ============================================================
// CapitalForge — Workflow, Policy & Rules Versioning Routes
//
// Endpoints:
//
//  Workflow Rules
//   POST   /api/workflow/rules          — create a workflow rule
//   GET    /api/workflow/rules          — list tenant workflow rules
//   POST   /api/workflow/evaluate       — evaluate rules for a deal
//
//  Policy Rules
//   GET    /api/policy/rules            — list tenant policy rules
//   POST   /api/policy/rules            — create a policy rule
//
//  Rules Versioning
//   GET    /api/rules/versions          — list rule versions
//   POST   /api/rules/versions/:id/deploy    — deploy to next stage
//   POST   /api/rules/versions/:id/rollback  — rollback a version
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import {
  workflowEngineService,
  type DealContext,
  type RuleCondition,
  type WorkflowAction,
} from '../../services/workflow-engine.service.js';
import {
  policyOrchestrationService,
  type PolicyRuleType,
} from '../../services/policy-orchestration.service.js';
import {
  rulesVersioningService,
  type RuleCategory,
  type DeploymentStage,
} from '../../services/rules-versioning.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ============================================================
// Validation schemas
// ============================================================

const ConditionSchema = z.object({
  field:    z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'exists', 'not_exists']),
  value:    z.unknown().optional(),
});

const ActionSchema = z.object({
  type:          z.enum([
    'require_approval', 'block_progression', 'require_document', 'notify_advisor',
    'notify_compliance', 'flag_for_review', 'trigger_compliance_check',
    'require_committee_review', 'send_disclosure', 'pause_workflow',
  ]),
  label:         z.string().min(1),
  blocking:      z.boolean(),
  requiredRoles: z.array(z.string()).optional(),
  config:        z.record(z.unknown()).optional(),
});

const CreateWorkflowRuleSchema = z.object({
  name:         z.string().min(1),
  conditions:   z.array(ConditionSchema).min(1),
  actions:      z.array(ActionSchema).min(1),
  priority:     z.number().int().optional(),
  triggerEvent: z.string().optional(),
});

const DealSchema = z.object({
  riskTier:         z.enum(['low', 'medium', 'high', 'critical']),
  status:           z.string().min(1),
  fundingRoundId:   z.string().optional(),
  targetCredit:     z.number().optional(),
  annualRevenue:    z.number().optional(),
  creditScore:      z.number().optional(),
  stateOfFormation: z.string().optional(),
  entityType:       z.string().optional(),
  businessAgeMonths: z.number().int().optional(),
});

const EvaluateWorkflowSchema = z.object({
  businessId: z.string().uuid('businessId must be a UUID'),
  deal:       DealSchema,
  compliance: z.object({
    kycStatus:        z.string().optional(),
    kybStatus:        z.string().optional(),
    sanctionsCleared: z.boolean().optional(),
    udapRiskLevel:    z.string().optional(),
    suitabilityScore: z.number().optional(),
  }).optional(),
  documents:  z.object({
    requiredTypes: z.array(z.string()).optional(),
    uploadedTypes: z.array(z.string()).optional(),
  }).optional(),
  approvals:  z.object({
    counselSignoff:    z.boolean().optional(),
    accountantSignoff: z.boolean().optional(),
    committeeApproved: z.boolean().optional(),
  }).optional(),
});

const CreatePolicyRuleSchema = z.object({
  name:       z.string().min(1),
  ruleType:   z.enum([
    'eligibility', 'disclosure', 'document_gate', 'fee_disclosure',
    'compliance_hold', 'advisor_qualification', 'state_law', 'kyc_kyb', 'suitability_gate',
  ]),
  conditions:  z.array(ConditionSchema).min(1),
  actions:     z.array(ActionSchema).min(1),
  priority:    z.number().int().optional(),
  stopOnMatch: z.boolean().optional(),
  version:     z.string().optional(),
});

const DeployVersionSchema = z.object({
  targetStage: z.enum(['test', 'staging', 'production']),
});

const RollbackSchema = z.object({
  reason: z.string().min(5, 'Rollback reason must be at least 5 characters'),
});

// ============================================================
// Router
// ============================================================

export const workflowRouter = Router();

// ── Helpers ──────────────────────────────────────────────────

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
      message: 'Invalid request body.',
      details: err.flatten().fieldErrors,
    },
  } satisfies ApiResponse);
}

function handleError(err: unknown, res: Response, context: string): void {
  logger.error(`[WorkflowRoutes] Unexpected error in ${context}`, { err });
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message },
  } satisfies ApiResponse);
}

// ============================================================
// Workflow Rule endpoints
// ============================================================

// POST /api/workflow/rules
workflowRouter.post(
  '/workflow/rules',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateWorkflowRuleSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    try {
      const rule = await workflowEngineService.createRule({
        tenantId:     req.tenant!.tenantId,
        name:         parsed.data.name,
        conditions:   parsed.data.conditions as RuleCondition[],
        actions:      parsed.data.actions    as WorkflowAction[],
        priority:     parsed.data.priority,
        triggerEvent: parsed.data.triggerEvent,
      });

      res.status(201).json({ success: true, data: rule } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /workflow/rules');
    }
  },
);

// GET /api/workflow/rules
workflowRouter.get(
  '/workflow/rules',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rules = await workflowEngineService.listRules(req.tenant!.tenantId);
      res.status(200).json({ success: true, data: rules } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'GET /workflow/rules');
    }
  },
);

// POST /api/workflow/evaluate
workflowRouter.post(
  '/workflow/evaluate',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = EvaluateWorkflowSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const context: DealContext = {
      tenantId:   req.tenant!.tenantId,
      businessId: parsed.data.businessId,
      deal:       parsed.data.deal,
      compliance: parsed.data.compliance,
      documents:  parsed.data.documents,
      approvals:  parsed.data.approvals,
    };

    try {
      const result = await workflowEngineService.evaluateRules(context);
      res.status(200).json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /workflow/evaluate');
    }
  },
);

// ============================================================
// Policy Rule endpoints
// ============================================================

// GET /api/policy/rules
workflowRouter.get(
  '/policy/rules',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ruleType = req.query['type'] as PolicyRuleType | undefined;
      const rules = await policyOrchestrationService.listRules(req.tenant!.tenantId, ruleType);
      res.status(200).json({ success: true, data: rules } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'GET /policy/rules');
    }
  },
);

// POST /api/policy/rules
workflowRouter.post(
  '/policy/rules',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreatePolicyRuleSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    try {
      const definition = policyOrchestrationService.buildRule({
        tenantId:    req.tenant!.tenantId,
        name:        parsed.data.name,
        ruleType:    parsed.data.ruleType as PolicyRuleType,
        conditions:  parsed.data.conditions,
        actions:     parsed.data.actions,
        priority:    parsed.data.priority,
        stopOnMatch: parsed.data.stopOnMatch,
        version:     parsed.data.version,
      });

      const rule = await policyOrchestrationService.createRule(definition);
      res.status(201).json({ success: true, data: rule } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /policy/rules');
    }
  },
);

// ============================================================
// Rules Versioning endpoints
// ============================================================

// GET /api/rules/versions
workflowRouter.get(
  '/rules/versions',
  requireAuth,
  (req: Request, res: Response): void => {
    try {
      const ruleId = req.query['ruleId'] as string | undefined;
      const versions = rulesVersioningService.listVersions(req.tenant!.tenantId, ruleId);
      res.status(200).json({ success: true, data: versions } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'GET /rules/versions');
    }
  },
);

// POST /api/rules/versions/:id/deploy
workflowRouter.post(
  '/rules/versions/:id/deploy',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const versionId = req.params['id'];
    const parsed = DeployVersionSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    try {
      const deployed = await rulesVersioningService.deployVersion({
        versionId,
        targetStage: parsed.data.targetStage as DeploymentStage,
        deployedBy:  req.tenant!.userId,
        tenantId:    req.tenant!.tenantId,
      });

      res.status(200).json({ success: true, data: deployed } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message },
        } satisfies ApiResponse);
        return;
      }
      handleError(err, res, 'POST /rules/versions/:id/deploy');
    }
  },
);

// POST /api/rules/versions/:id/rollback
workflowRouter.post(
  '/rules/versions/:id/rollback',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const versionId = req.params['id'];
    const parsed = RollbackSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    try {
      const rolledBack = await rulesVersioningService.rollback({
        versionId,
        reason:       parsed.data.reason,
        rolledBackBy: req.tenant!.userId,
        tenantId:     req.tenant!.tenantId,
      });

      res.status(200).json({ success: true, data: rolledBack } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message },
        } satisfies ApiResponse);
        return;
      }
      handleError(err, res, 'POST /rules/versions/:id/rollback');
    }
  },
);

export default workflowRouter;
