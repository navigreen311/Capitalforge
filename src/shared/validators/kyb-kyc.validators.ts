// ============================================================
// CapitalForge — KYB / KYC Zod Validation Schemas
// ============================================================

import { z } from 'zod';

// ── Re-usable primitives ──────────────────────────────────────────────────────

const nonEmptyString = z.string().min(1, 'Field is required');

const usStateCode = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Must be a 2-letter US state code (e.g. CA)');

const einSchema = z
  .string()
  .regex(/^\d{2}-\d{7}$/, 'EIN must be in format XX-XXXXXXX');

const ssnSchema = z
  .string()
  .regex(
    /^(?:\d{3}-\d{2}-\d{4}|\d{9})$/,
    'SSN must be 9 digits or in format XXX-XX-XXXX',
  );

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((d) => !isNaN(new Date(d).getTime()), 'Invalid date');

const ownershipPercent = z
  .number()
  .min(0, 'Ownership percent cannot be negative')
  .max(100, 'Ownership percent cannot exceed 100');

// ── Address schema ────────────────────────────────────────────────────────────

export const AddressSchema = z.object({
  street: nonEmptyString,
  city: nonEmptyString,
  state: usStateCode,
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  country: z.string().length(2).default('US'),
});

export type Address = z.infer<typeof AddressSchema>;

// ── KYB — Business Entity Verification ───────────────────────────────────────

/**
 * Body sent to POST /api/businesses/:id/verify/kyb
 */
export const KybVerificationRequestSchema = z.object({
  /** Legal name exactly as registered with the Secretary of State */
  legalName: nonEmptyString,
  entityType: z.enum(['llc', 'corporation', 'sole_proprietor', 'partnership', 's_corp', 'c_corp']),
  ein: einSchema,
  stateOfFormation: usStateCode,
  /**
   * Date the entity was formed — must be in the past.
   * Used to validate EIN age consistency.
   */
  dateOfFormation: isoDateString.refine(
    (d) => new Date(d) <= new Date(),
    'Date of formation cannot be in the future',
  ),
  registeredAddress: AddressSchema,
  /** Optional DBA name */
  dba: z.string().optional(),
  /** MCC (Merchant Category Code) — 4 digits */
  mcc: z
    .string()
    .regex(/^\d{4}$/, 'MCC must be exactly 4 digits')
    .optional(),
  industry: z.string().max(100).optional(),
  /** Annual revenue in USD cents to avoid floating-point issues */
  annualRevenueCents: z.number().int().min(0).optional(),
});

export type KybVerificationRequest = z.infer<typeof KybVerificationRequestSchema>;

// ── KYC — Individual Owner Verification ──────────────────────────────────────

/**
 * Body sent to POST /api/businesses/:id/verify/kyc/:ownerId
 */
export const KycVerificationRequestSchema = z.object({
  firstName: nonEmptyString,
  lastName: nonEmptyString,
  /**
   * Ownership percentage of this individual in the business.
   * Must be >= 25 to trigger the beneficial-owner KYC requirement.
   */
  ownershipPercent,
  ssn: ssnSchema,
  dateOfBirth: isoDateString.refine(
    (d) => {
      const age =
        (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return age >= 18;
    },
    'Owner must be at least 18 years old',
  ),
  address: AddressSchema,
  /**
   * Optional credit bureau data provided from a prior pull.
   * When present, enables fraud-detection heuristics.
   */
  creditData: z
    .object({
      creditFileAgeMonths: z.number().int().min(0).optional(),
      tradelineCount: z.number().int().min(0).optional(),
      highestCreditLimit: z.number().min(0).optional(),
      totalUtilization: z.number().min(0).max(1).optional(),
      inquiriesLast6Mo: z.number().int().min(0).optional(),
    })
    .optional(),
  /**
   * Previous addresses for velocity checking (newest first).
   */
  addressHistory: z
    .array(
      z.object({
        street: nonEmptyString,
        city: nonEmptyString,
        state: usStateCode,
        zip: z.string().regex(/^\d{5}(-\d{4})?$/),
        movedInDate: isoDateString.optional(),
      }),
    )
    .max(20)
    .optional(),
});

export type KycVerificationRequest = z.infer<typeof KycVerificationRequestSchema>;

// ── Verification Status query params ─────────────────────────────────────────

/**
 * Query params accepted by GET /api/businesses/:id/verification-status
 */
export const VerificationStatusQuerySchema = z.object({
  includeOwners: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true'),
});

export type VerificationStatusQuery = z.infer<typeof VerificationStatusQuerySchema>;

// ── Internal shared result types ──────────────────────────────────────────────

export const KybStatusSchema = z.enum([
  'pending',
  'in_review',
  'verified',
  'failed',
  'sanctions_hold',
]);

export type KybStatus = z.infer<typeof KybStatusSchema>;

export const KycStatusSchema = z.enum([
  'pending',
  'in_review',
  'verified',
  'failed',
  'sanctions_hold',
  'fraud_review',
]);

export type KycStatus = z.infer<typeof KycStatusSchema>;
