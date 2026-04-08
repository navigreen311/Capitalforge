// ============================================================
// CapitalForge — Funding Simulator & Sandbox Routes
//
// Endpoints:
//
//   POST /api/simulator/run
//     Run a full scenario simulation with optional what-if
//     parameter overrides (FICO, revenue, existing debt, etc.).
//
//   POST /api/simulator/compare
//     Run two scenarios (baseline + alternative) and return
//     a side-by-side delta comparison.
//
//   GET  /api/sandbox/profiles
//     List pre-built synthetic client archetypes.
//     Query params: ficoTier, industry, revenueBand, tags
//
//   POST /api/sandbox/profiles
//     Create a custom sandbox profile for a tenant.
//
//   POST /api/sandbox/practice
//     Submit an advisor funding plan against a named archetype
//     and receive scored practice feedback.
//
//   POST /api/sandbox/regression
//     Run the full 50-archetype regression test suite.
//
// All routes require a valid JWT (req.tenant set upstream).
// ============================================================

import { Router, type Request, type Response } from 'express';
import { z, type ZodError } from 'zod';
import {
  FundingSimulatorService,
  type SimulatorProfile,
  type WhatIfOverrides,
} from '../../services/funding-simulator.service.js';
import {
  SandboxService,
  type CreateCustomProfileInput,
  type AdvisorFundingPlan,
  type FicoTier,
  type IndustryCategory,
  type RevenueBand,
} from '../../services/sandbox.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

// ============================================================
// Shared service instances
// ============================================================

const simulator = new FundingSimulatorService();
const sandbox   = new SandboxService(simulator);

// ============================================================
// Validation schemas
// ============================================================

const SimulatorProfileSchema = z.object({
  ficoScore:         z.number().int().min(300).max(850),
  utilizationRatio:  z.number().min(0).max(1),
  derogatoryCount:   z.number().int().min(0),
  inquiries12m:      z.number().int().min(0),
  creditAgeMonths:   z.number().int().min(0),
  annualRevenue:     z.number().nonnegative(),
  yearsInOperation:  z.number().min(0),
  existingDebt:      z.number().nonnegative(),
  targetCreditLimit: z.number().positive(),
  businessId:        z.string().optional(),
});

const WhatIfOverridesSchema = z.object({
  ficoScore:        z.number().int().min(300).max(850).optional(),
  utilizationRatio: z.number().min(0).max(1).optional(),
  derogatoryCount:  z.number().int().min(0).optional(),
  inquiries12m:     z.number().int().min(0).optional(),
  creditAgeMonths:  z.number().int().min(0).optional(),
  annualRevenue:    z.number().nonnegative().optional(),
  existingDebt:     z.number().nonnegative().optional(),
}).refine(
  (v) => Object.values(v).some((val) => val !== undefined),
  { message: 'At least one override field must be provided.' },
);

const RunScenarioBodySchema = z.object({
  profile:   SimulatorProfileSchema,
  label:     z.string().max(120).optional(),
  overrides: WhatIfOverridesSchema.optional(),
});

const CompareScenarioBodySchema = z.object({
  baseline: z.object({
    profile:   SimulatorProfileSchema,
    label:     z.string().max(120).optional(),
    overrides: WhatIfOverridesSchema.optional(),
  }),
  alternative: z.object({
    profile:   SimulatorProfileSchema,
    label:     z.string().max(120).optional(),
    overrides: WhatIfOverridesSchema.optional(),
  }),
});

const SandboxProfileQuerySchema = z.object({
  ficoTier:    z.enum(['subprime', 'near_prime', 'prime', 'super_prime']).optional(),
  industry:    z.enum([
    'retail', 'restaurant', 'healthcare', 'technology', 'construction',
    'professional_services', 'real_estate', 'logistics', 'manufacturing', 'hospitality',
  ]).optional(),
  revenueBand: z.enum(['micro', 'small', 'mid', 'established', 'large']).optional(),
  tags:        z.string().optional(), // comma-separated
});

const CreateCustomProfileBodySchema = z.object({
  profileName: z.string().min(1).max(120),
  archetype:   z.string().min(1).max(60),
  profile:     SimulatorProfileSchema,
  tags:        z.array(z.string()).default([]),
});

const AdvisorFundingPlanSchema = z.object({
  archetypeId: z.string().min(1),
  selectedCards: z.array(z.object({
    issuer:       z.string().min(1),
    cardProduct:  z.string().min(1),
    round:        z.number().int().min(1).max(10),
    rationale:    z.string().max(500).default(''),
  })).min(0),
  riskAssessment:       z.string().max(2000).default(''),
  alternativeConsidered: z.boolean().default(false),
});

// ============================================================
// Helpers
// ============================================================

function requireAuth(req: Request, res: Response): boolean {
  if (!req.tenant) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    } satisfies ApiResponse);
    return false;
  }
  return true;
}

function handleZodError(err: ZodError, res: Response): void {
  res.status(422).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body.',
      details: err.flatten().fieldErrors,
    },
  } satisfies ApiResponse);
}

function handleError(err: unknown, res: Response, context: string): void {
  logger.error(`[SimulatorRoutes] Error in ${context}`, { err });

  if (err instanceof Error && err.message.includes('not found')) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: err.message },
    } satisfies ApiResponse);
    return;
  }

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ============================================================
// Simulator Router
// ============================================================

export const simulatorRouter = Router({ mergeParams: true });

// ── POST /api/simulator/run ────────────────────────────────
//
// Run a full scenario simulation.
// Optionally supply what-if overrides to mutate the profile.

simulatorRouter.post(
  '/run',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = RunScenarioBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const { profile, label, overrides } = parsed.data;

      const result = simulator.runScenario(
        profile as SimulatorProfile,
        label ?? 'Scenario',
        overrides as WhatIfOverrides | undefined,
      );

      res.status(200).json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /simulator/run');
    }
  },
);

// ── POST /api/simulator/compare ───────────────────────────
//
// Run two scenarios and return delta metrics.

simulatorRouter.post(
  '/compare',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = CompareScenarioBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const { baseline, alternative } = parsed.data;

      const baselineResult = simulator.runScenario(
        baseline.profile as SimulatorProfile,
        baseline.label ?? 'Baseline',
        baseline.overrides as WhatIfOverrides | undefined,
      );

      const alternativeResult = simulator.runScenario(
        alternative.profile as SimulatorProfile,
        alternative.label ?? 'Alternative',
        alternative.overrides as WhatIfOverrides | undefined,
      );

      const comparison = simulator.compareScenarios(baselineResult, alternativeResult);

      res.status(200).json({
        success: true,
        data: comparison,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /simulator/compare');
    }
  },
);

// ============================================================
// Sandbox Router
// ============================================================

export const sandboxRouter = Router({ mergeParams: true });

// ── GET /api/sandbox/profiles ─────────────────────────────
//
// List pre-built synthetic archetypes with optional filters.

sandboxRouter.get(
  '/profiles',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = SandboxProfileQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const { ficoTier, industry, revenueBand, tags: tagsRaw } = parsed.data;
      const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

      const archetypes = sandbox.listArchetypes({
        ficoTier:    ficoTier as FicoTier | undefined,
        industry:    industry as IndustryCategory | undefined,
        revenueBand: revenueBand as RevenueBand | undefined,
        tags,
      });

      // Also return tenant custom profiles
      const custom = sandbox.listCustomProfiles(req.tenant!.tenantId);

      res.status(200).json({
        success: true,
        data: {
          archetypes,
          customProfiles: custom,
          totals: {
            archetypes: archetypes.length,
            customProfiles: custom.length,
          },
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'GET /sandbox/profiles');
    }
  },
);

// ── POST /api/sandbox/profiles ────────────────────────────
//
// Create a custom sandbox profile for this tenant.

sandboxRouter.post(
  '/profiles',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = CreateCustomProfileBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const { profileName, archetype, profile, tags } = parsed.data;

      const input: CreateCustomProfileInput = {
        tenantId: req.tenant!.tenantId,
        profileName,
        archetype,
        profile: profile as SimulatorProfile,
        tags,
      };

      const created = sandbox.createCustomProfile(input);

      res.status(201).json({
        success: true,
        data: created,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /sandbox/profiles');
    }
  },
);

// ── POST /api/sandbox/practice ────────────────────────────
//
// Score an advisor's submitted funding plan against the model.

sandboxRouter.post(
  '/practice',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = AdvisorFundingPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const plan: AdvisorFundingPlan = {
        ...parsed.data,
        advisorId: req.tenant!.userId,
      };

      const result = sandbox.runPracticeMode(plan);

      res.status(200).json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /sandbox/practice');
    }
  },
);

// ── POST /api/sandbox/regression ─────────────────────────
//
// Run the full regression suite against all 50 archetypes.
// Returns pass/fail per archetype with drift details.

sandboxRouter.post(
  '/regression',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    try {
      const result = sandbox.runRegressionSuite();

      const statusCode = result.failed > 0 ? 207 : 200; // 207 = multi-status (some failures)

      res.status(statusCode).json({
        success: result.failed === 0,
        data: result,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /sandbox/regression');
    }
  },
);

// ── POST /api/sandbox/simulate-round ─────────────────────
//
// Simulate a funding round for a named archetype.

sandboxRouter.post(
  '/simulate-round',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const BodySchema = z.object({
      archetypeId:  z.string().min(1),
      roundNumber:  z.number().int().min(1).max(10).default(1),
    });

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const { archetypeId, roundNumber } = parsed.data;
      const result = sandbox.simulateFundingRound(archetypeId, roundNumber);

      res.status(200).json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /sandbox/simulate-round');
    }
  },
);

// ── POST /api/simulator/export-comparison ─────────────────
//
// Return a mock text comparison report for two scenarios.

const ExportComparisonBodySchema = z.object({
  baselineLabel:     z.string().max(120).default('Baseline'),
  alternativeLabel:  z.string().max(120).default('Alternative'),
  baselineProfile:   SimulatorProfileSchema,
  alternativeProfile: SimulatorProfileSchema,
  format:            z.enum(['text', 'csv']).default('text'),
});

simulatorRouter.post(
  '/export-comparison',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = ExportComparisonBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const { baselineLabel, alternativeLabel, baselineProfile, alternativeProfile, format } = parsed.data;

      const baselineResult = simulator.runScenario(
        baselineProfile as SimulatorProfile,
        baselineLabel,
      );
      const alternativeResult = simulator.runScenario(
        alternativeProfile as SimulatorProfile,
        alternativeLabel,
      );
      const comparison = simulator.compareScenarios(baselineResult, alternativeResult);

      // Build a human-readable text report
      const reportLines = [
        `=== CapitalForge Scenario Comparison Report ===`,
        `Generated: ${new Date().toISOString()}`,
        ``,
        `Baseline:    ${baselineLabel}`,
        `Alternative: ${alternativeLabel}`,
        ``,
        `── Baseline Summary ──`,
        `  FICO Score:        ${baselineProfile.ficoScore}`,
        `  Annual Revenue:    $${baselineProfile.annualRevenue.toLocaleString()}`,
        `  Target Credit:     $${baselineProfile.targetCreditLimit.toLocaleString()}`,
        `  Approval Prob:     ${(comparison.baseline?.approvalProbability ?? 0).toFixed(1)}%`,
        ``,
        `── Alternative Summary ──`,
        `  FICO Score:        ${alternativeProfile.ficoScore}`,
        `  Annual Revenue:    $${alternativeProfile.annualRevenue.toLocaleString()}`,
        `  Target Credit:     $${alternativeProfile.targetCreditLimit.toLocaleString()}`,
        `  Approval Prob:     ${(comparison.alternative?.approvalProbability ?? 0).toFixed(1)}%`,
        ``,
        `── Delta ──`,
        `  Approval Delta:    ${comparison.delta?.approvalProbability ?? 'N/A'}`,
        ``,
        `=== End of Report ===`,
      ];

      const reportText = reportLines.join('\n');

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="comparison-report.csv"');
        const csv = [
          'Metric,Baseline,Alternative',
          `FICO,${baselineProfile.ficoScore},${alternativeProfile.ficoScore}`,
          `Revenue,${baselineProfile.annualRevenue},${alternativeProfile.annualRevenue}`,
          `TargetCredit,${baselineProfile.targetCreditLimit},${alternativeProfile.targetCreditLimit}`,
        ].join('\n');
        res.status(200).send(csv);
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          report: reportText,
          comparison,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /simulator/export-comparison');
    }
  },
);

// ── POST /api/simulator/save-scenario ─────────────────────
//
// Save a named scenario to a client (mock persistence).

const SaveScenarioBodySchema = z.object({
  clientId: z.string().min(1),
  label:    z.string().min(1).max(120),
  profile:  SimulatorProfileSchema,
  overrides: WhatIfOverridesSchema.optional(),
  notes:    z.string().max(2000).default(''),
});

simulatorRouter.post(
  '/save-scenario',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = SaveScenarioBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const { clientId, label, profile, overrides, notes } = parsed.data;

      // Mock: run the scenario and return a saved reference
      const result = simulator.runScenario(
        profile as SimulatorProfile,
        label,
        overrides as WhatIfOverrides | undefined,
      );

      const savedScenario = {
        id:        `scenario-${clientId}-${Date.now()}`,
        clientId,
        label,
        notes,
        savedAt:   new Date().toISOString(),
        savedBy:   req.tenant!.userId,
        result,
      };

      logger.info('Scenario saved', { clientId, label, scenarioId: savedScenario.id });

      res.status(201).json({
        success: true,
        data:    savedScenario,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res, 'POST /simulator/save-scenario');
    }
  },
);

export default simulatorRouter;
