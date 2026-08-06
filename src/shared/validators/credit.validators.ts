// ============================================================
// CapitalForge Credit Validators
// Zod schemas for credit pull requests, bureau types, score ranges
// ============================================================

import { z } from 'zod';

// ── Enumerations ─────────────────────────────────────────────

export const BureauSchema = z.enum(['equifax', 'transunion', 'experian', 'dnb']);

export const ScoreTypeSchema = z.enum([
  'fico',
  'vantage',
  'sbss',
  'paydex',
  'intelliscore',
  'equifax_business_risk',
  'equifax_onescore',
]);

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
  // Either an array of per-account tradelines or a summary object such as
  // `{ accounts: 18, avgAge: 9.4, revolving: 6 }`. Both shapes are in the
  // column today. The schema said array-or-null, so a stored summary failed
  // validation here and threw "tradelines is not iterable" in the readers
  // that trusted the same claim. Widened to describe what is actually there,
  // rather than asserting a shape the data does not have.
  tradelines: z.union([z.array(TradelineSchema), z.record(z.unknown())]).nullable(),
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
  /**
   * Points, and it can be negative — or null when no impact is estimable.
   *
   * Widened for the SBSS action, which used to quote `160 - score` against a
   * threshold the SBA retired on 2026-03-01. With no floor to close a gap
   * against there is no number to give, and a 0 would say "this will not help"
   * rather than "we cannot say how much". Consumers checked when this widened:
   * `credit-intelligence.service.ts` (writes a literal 0), and the optimizer's
   * own actions, which all still supply a number. No frontend surface reads
   * it, and nothing compares it to a threshold.
   */
  estimatedScoreImpact: z.number().int().nullable(),
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
    // Experian's business score, a different product on a different scale from
    // SBSS. Every business pull was written as `sbss` regardless of bureau,
    // which put a 1–100 figure on a 0–300 card.
    case 'intelliscore':
      if (score < 1 || score > 100) return `Intelliscore must be 1–100, got ${score}`;
      break;
    // Equifax's own business product. Higher is lower risk, and the scale
    // starts at 101 rather than 0 — a zero here would not be a bad score, it
    // would be an impossible one.
    case 'equifax_business_risk':
      // 101–992, Equifax's Business Credit Risk Score.
      //
      // This range check is not sufficient to identify the product, and the
      // gap is worth knowing. Equifax sells four commercial scores and a
      // reseller bundle prints several together:
      //
      //   Business Credit Risk     101–992   ← this one
      //   Business Failure Score   1000–1880 → rejected here, too high
      //   Payment Index            1–100     → rejected here, too low
      //   OneScore for Commercial  300–650   → ACCEPTED, and wrong
      //
      // OneScore sits entirely inside 101–992, so a OneScore entered here
      // passes validation silently — and it is the score Equifax leads with
      // in the Industry Report 2.0 bundle, so it is the one most likely to be
      // read off a PDF by mistake. sc_006 then compares it to 500, a
      // threshold meant for a different scale.
      //
      // Overlapping ranges cannot be told apart by their value. The defence
      // is labelling at the point of entry, not a tighter check here.
      // See docs/product/business-credit-scores.md.
      if (score < 101 || score > 992) {
        return `Equifax Business Risk Score must be 101–992, got ${score}`;
      }
      break;
    case 'equifax_onescore':
      // 300–650. Recorded separately from Business Credit Risk precisely
      // because the ranges overlap: a value here is unambiguous about which
      // product it is, which the value alone can never be.
      if (score < 300 || score > 650) {
        return `Equifax OneScore for Commercial must be 300–650, got ${score}`;
      }
      break;
    case 'paydex':
      if (score < 0 || score > 100) return `Paydex score must be 0–100, got ${score}`;
      break;
    default:
      return `Unknown scoreType: ${scoreType}`;
  }
  return null;
}
