// ============================================================
// CapitalForge — Application Zod Validators
// Covers: creation, status transition, list filters, and
// the maker-checker approval payload.
// ============================================================

import { z } from 'zod';

// ── Re-usable primitives ──────────────────────────────────────

const uuidSchema = z.string().uuid('Must be a valid UUID');

const applicationStatusSchema = z.enum([
  'draft',
  'pending_consent',
  'submitted',
  'approved',
  'declined',
  'reconsideration',
]);

// ── Create application ────────────────────────────────────────

/**
 * Body accepted by POST /api/businesses/:id/applications
 */
export const CreateApplicationSchema = z.object({
  /** Foreign key to FundingRound (optional) */
  fundingRoundId: uuidSchema.optional(),

  /** Card issuer name — free text, normalised to lower-case by the service */
  issuer: z
    .string()
    .min(1, 'Issuer is required')
    .max(100, 'Issuer must be 100 characters or fewer')
    .transform((v) => v.trim()),

  /** Specific card product name */
  cardProduct: z
    .string()
    .min(1, 'Card product is required')
    .max(200, 'Card product must be 200 characters or fewer')
    .transform((v) => v.trim()),

  /** Optional: financial terms known at creation time */
  creditLimit: z.number().positive('Credit limit must be positive').optional(),
  introApr: z
    .number()
    .min(0, 'Intro APR must be >= 0')
    .max(100, 'Intro APR must be <= 100')
    .optional(),
  introAprExpiry: z.coerce.date().optional(),
  regularApr: z
    .number()
    .min(0, 'Regular APR must be >= 0')
    .max(100, 'Regular APR must be <= 100')
    .optional(),
  annualFee: z.number().min(0, 'Annual fee must be >= 0').optional(),
  cashAdvanceFee: z.number().min(0, 'Cash advance fee must be >= 0').optional(),

  /** Advisors assigned to this application (multi-advisor support) */
  assignedAdvisorIds: z.array(uuidSchema).min(1, 'At least one advisor must be assigned'),
});

export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;

// ── Status transition ─────────────────────────────────────────

/**
 * Allowed status transitions (directed graph).
 * Stored here as a single source of truth shared by both
 * the validator and the service's state-machine guard.
 */
export const VALID_TRANSITIONS: Record<
  z.infer<typeof applicationStatusSchema>,
  Array<z.infer<typeof applicationStatusSchema>>
> = {
  draft: ['pending_consent'],
  pending_consent: ['submitted', 'draft'],        // back to draft if consent is revoked
  submitted: ['approved', 'declined'],
  approved: [],                                   // terminal
  declined: ['reconsideration'],
  reconsideration: ['submitted', 'declined'],     // resubmit or close
};

/**
 * Body accepted by PUT /api/applications/:id/status
 */
export const TransitionStatusSchema = z
  .object({
    /** Target status */
    status: applicationStatusSchema,

    /** Required when transitioning TO submitted — ID of the approving user (maker-checker) */
    approvedByUserId: uuidSchema.optional(),

    /** Required when declining */
    declineReason: z
      .string()
      .min(1)
      .max(2000)
      .optional(),

    /** Free-form note that gets appended to the audit trail */
    note: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'submitted' && !data.approvedByUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvedByUserId'],
        message: 'approvedByUserId is required when submitting (maker-checker)',
      });
    }
    if (data.status === 'declined' && !data.declineReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['declineReason'],
        message: 'declineReason is required when declining an application',
      });
    }
  });

export type TransitionStatusInput = z.infer<typeof TransitionStatusSchema>;

// ── List / filter ─────────────────────────────────────────────

/**
 * Query params accepted by GET /api/businesses/:id/applications
 */
export const ListApplicationsSchema = z.object({
  status: applicationStatusSchema.optional(),
  fundingRoundId: uuidSchema.optional(),
  issuer: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'submittedAt', 'decidedAt', 'issuer'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListApplicationsInput = z.infer<typeof ListApplicationsSchema>;

// ── Maker-checker approval ────────────────────────────────────

/**
 * Internal payload used by the service when recording a
 * maker-checker approval decision.
 */
export const MakerCheckerApprovalSchema = z.object({
  applicationId: uuidSchema,
  /** The user granting approval (must be different from the creator) */
  approverUserId: uuidSchema,
  approvedAt: z.coerce.date().default(() => new Date()),
  note: z.string().max(2000).optional(),
});

export type MakerCheckerApprovalInput = z.infer<typeof MakerCheckerApprovalSchema>;
