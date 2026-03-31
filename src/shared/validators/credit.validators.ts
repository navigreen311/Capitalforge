// ============================================================
// CapitalForge Credit Validators
// Zod schemas for credit pull requests, bureau types, score ranges
// ============================================================

import { z } from 'zod';

// ── Enumerations ─────────────────────────────────────────────

export const BureauSchema = z.enum(['equifax', 'transunion', 'experian', 'dnb']);

export const ScoreTypeSchema = z.enum(['fico', 'vantage', 'sbss', 'paydex']);

export const CreditProfileTypeSchema = z.enum(['personal', 'business']);

// ── Score range schemas (per bureau/type) ────────────────────

// FICO personal: 300–850
export const FicoScoreSchema = z.number().int().min(300).max(850);

// VantageScore 3.0/4.0: 300–850
export const VantageScoreSchema = z.number().int().min(300).max(850);

// FICO SBSS (Small Business Scoring Service): 0–300
export const SbssScoreSchema = z.number().int().min(0).max(300);

// Dun & Bradstreet Paydex: 0–100
export const PaydexScoreSchema = z.number().int().min(0).max(100);

// Union score — validated contextually by scoreType
export const CreditScoreSchema = z.number().int().min(0).max(850);

// ── Utilization ──────────────────────────────────────────────

// Stored as a decimal fraction 0.0–1.0
export const UtilizationSchema = z.number().min(0).max(1);

// ── Tradeline ────────────────────────────────────────────────

export const TradelineSchema = z.object({
  creditor: z.string().min(1),
  accountType: z.string().min(1),
  creditLimit: z.number().nonnegative().optional(),
  balance: z.number().nonnegative().optional(),
  paymentStatus: z.string().optional(),
  openedAt: z.string().datetime().optional(),
  closedAt: z.string().datetime().optional(),
  isDerogatory: z.boolean().default(false),
});

export type Tradeline = z.infer<typeof TradelineSchema>;

// ── Credit Pull Request ───────────────────────────────────────

export const CreditPullRequestSchema = z.object({
  bureaus: z
    .array(BureauSchema)
    .min(1, 'At least one bureau must be specified')
    .max(4, 'Cannot exceed 4 bureaus per pull'),
  profileType: CreditProfileTypeSchema,
  /**
   * When true, skip bureau API call and use cached data if pulled
   * within the last cacheTtlHours hours. Defaults to false.
   */
  useCache: z.boolean().default(false),
  cacheTtlHours: z.number().int().min(1).max(168).default(24), // 1h–7d
});

export type CreditPullRequest = z.infer<typeof CreditPullRequestSchema>;

// ── Credit Profile (stored / API response shape) ─────────────

export const CreditProfileSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  profileType: CreditProfileTypeSchema,
  bureau: BureauSchema,
  score: CreditScoreSchema.nullable(),
  scoreType: ScoreTypeSchema.nullable(),
  utilization: UtilizationSchema.nullable(),
  inquiryCount: z.number().int().nonnegative().nullable(),
  derogatoryCount: z.number().int().nonnegative().nullable(),
  tradelines: z.array(TradelineSchema).nullable(),
  rawData: z.record(z.unknown()).nullable(),
  pulledAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type CreditProfileDto = z.infer<typeof CreditProfileSchema>;

// ── Optimization Action ───────────────────────────────────────

export const OptimizationActionSchema = z.object({
  priority: z.number().int().min(1),
  category: z.enum([
    'utilization',
    'derogatory',
    'tradeline',
    'inquiry',
    'score_mix',
    'payment_history',
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  estimatedScoreImpact: z.number().int(),       // points, can be negative
  estimatedTimeframeDays: z.number().int().min(0),
  actionable: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
});

export type OptimizationAction = z.infer<typeof OptimizationActionSchema>;

// ── Roadmap Response ─────────────────────────────────────────

export const CreditRoadmapSchema = z.object({
  businessId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  currentScoreSummary: z.object({
    highestFico: CreditScoreSchema.nullable(),
    highestSbss: SbssScoreSchema.nullable(),
    averageUtilization: UtilizationSchema.nullable(),
    totalInquiries90d: z.number().int().nonnegative(),
    inquiryVelocityRisk: z.boolean(),
    utilizationRisk: z.enum(['none', 'warning', 'critical']),
  }),
  actions: z.array(OptimizationActionSchema),
  nextRecommendedPullDate: z.string().datetime().nullable(),
});

export type CreditRoadmap = z.infer<typeof CreditRoadmapSchema>;

// ── Validation helpers ────────────────────────────────────────

/**
 * Validate a score value against the expected range for a given scoreType.
 * Returns an error string if out of range, otherwise null.
 */
export function validateScoreForType(score: number, scoreType: string): string | null {
  switch (scoreType) {
    case 'fico':
      if (score < 300 || score > 850) return `FICO score must be 300–850, got ${score}`;
      break;
    case 'vantage':
      if (score < 300 || score > 850) return `VantageScore must be 300–850, got ${score}`;
      break;
    case 'sbss':
      if (score < 0 || score > 300) return `SBSS score must be 0–300, got ${score}`;
      break;
    case 'paydex':
      if (score < 0 || score > 100) return `Paydex score must be 0–100, got ${score}`;
      break;
    default:
      return `Unknown scoreType: ${scoreType}`;
  }
  return null;
}
