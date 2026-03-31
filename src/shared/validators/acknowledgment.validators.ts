// ============================================================
// CapitalForge — Acknowledgment Zod Validators
// ============================================================

import { z } from 'zod';

// ---- Enum schemas ------------------------------------------

export const AcknowledgmentTypeSchema = z.enum([
  'product_reality',
  'fee_schedule',
  'personal_guarantee',
  'cash_advance_risk',
]);

export type AcknowledgmentType = z.infer<typeof AcknowledgmentTypeSchema>;

// ---- Request schemas ---------------------------------------

/**
 * Body for POST /api/businesses/:id/acknowledgments
 *
 * The client submits the acknowledgment type plus an attestation
 * that they have read and agree to the current version of the text.
 * The service resolves the current version and renders the template.
 */
export const CreateAcknowledgmentSchema = z.object({
  acknowledgmentType: AcknowledgmentTypeSchema,

  /**
   * Client-side confirmation that they have read the disclosure.
   * Must be explicitly true — a falsy value is rejected.
   */
  agreedToCurrentVersion: z.literal(true, {
    errorMap: () => ({
      message:
        'You must explicitly agree to the current version of this acknowledgment (agreedToCurrentVersion must be true).',
    }),
  }),

  /**
   * Optional: the signer's full legal name as typed by them.
   * Used as the human-readable signature reference.
   */
  signerName: z
    .string()
    .min(2, 'Signer name must be at least 2 characters.')
    .max(200, 'Signer name must be 200 characters or fewer.')
    .optional(),

  /**
   * Optional: IP address of the signer (populated server-side
   * from req.ip; included here so the service layer can accept
   * it from trusted sources).
   */
  signerIp: z
    .string()
    .ip({ version: 'v4', message: 'Invalid IPv4 address.' })
    .or(z.string().ip({ version: 'v6', message: 'Invalid IPv6 address.' }))
    .optional(),

  /**
   * Optional free-form metadata (user agent, session ID, etc.)
   */
  metadata: z.record(z.unknown()).optional(),
});

export type CreateAcknowledgmentInput = z.infer<typeof CreateAcknowledgmentSchema>;

/**
 * Path param validation for :type in
 * GET /api/businesses/:id/acknowledgments/:type/latest
 */
export const AcknowledgmentTypeParamSchema = z.object({
  type: AcknowledgmentTypeSchema,
});

/**
 * Query param validation for listing acknowledgments.
 * Allows optional filtering by type.
 */
export const ListAcknowledgmentsQuerySchema = z.object({
  type: AcknowledgmentTypeSchema.optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= 200, 'limit must be between 1 and 200.')
    .optional(),
  offset: z
    .string()
    .regex(/^\d+$/, 'offset must be a non-negative integer.')
    .transform(Number)
    .optional(),
});

export type ListAcknowledgmentsQuery = z.infer<typeof ListAcknowledgmentsQuerySchema>;

// ---- Response shapes (not Zod — used for typing API responses) ---

export interface AcknowledgmentRecord {
  id: string;
  businessId: string;
  acknowledgmentType: AcknowledgmentType;
  version: string;
  signedAt: Date;
  signatureRef: string | null;
  documentVaultId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AcknowledgmentStatusResult {
  type: AcknowledgmentType;
  currentVersion: string;
  isSigned: boolean;
  signedVersion: string | null;
  signedAt: Date | null;
  isCurrentVersionSigned: boolean;
}

export interface GateCheckResult {
  passed: boolean;
  /** Types that are required but not yet signed at the current version. */
  missing: AcknowledgmentType[];
}
