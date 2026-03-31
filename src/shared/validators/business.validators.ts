// ============================================================
// CapitalForge Business Validators
// Zod schemas for business creation, owner creation, and updates
// ============================================================

import { z } from 'zod';

// ── Constants ────────────────────────────────────────────────

/** All two-letter US state and territory codes */
const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  // Territories
  'DC', 'PR', 'GU', 'VI', 'AS', 'MP',
] as const;

export type UsStateCode = (typeof US_STATE_CODES)[number];

const ENTITY_TYPES = [
  'llc',
  'corporation',
  'sole_proprietor',
  'partnership',
  's_corp',
  'c_corp',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

// ── Reusable primitives ───────────────────────────────────────

/**
 * EIN format: XX-XXXXXXX
 * Validates both hyphenated (12-3456789) and raw (123456789) forms,
 * normalising to the hyphenated canonical form.
 */
export const einSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/[^0-9]/g, ''))
  .refine((val) => val.length === 9, {
    message: 'EIN must be exactly 9 digits',
  })
  .transform((val) => `${val.slice(0, 2)}-${val.slice(2)}`);

/** Raw EIN string — pre-normalisation, used in partial validation contexts */
export const einRawSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-?\d{7}$/, 'EIN must be in format XX-XXXXXXX or XXXXXXXXX');

/** US state/territory code */
export const stateCodeSchema = z
  .string()
  .toUpperCase()
  .refine((val): val is UsStateCode => (US_STATE_CODES as readonly string[]).includes(val), {
    message: 'Must be a valid US state or territory code',
  });

/** Entity type */
export const entityTypeSchema = z.enum(ENTITY_TYPES, {
  errorMap: () => ({
    message: `Entity type must be one of: ${ENTITY_TYPES.join(', ')}`,
  }),
});

/** Monetary amount — non-negative */
export const moneySchema = z
  .number({ invalid_type_error: 'Must be a number' })
  .nonnegative('Must be 0 or greater')
  .finite();

/** Ownership percentage — 0.01 to 100 */
export const ownershipPercentSchema = z
  .number()
  .min(0.01, 'Ownership must be at least 0.01%')
  .max(100, 'Ownership cannot exceed 100%');

/** SSN: XXX-XX-XXXX or raw 9 digits */
export const ssnSchema = z
  .string()
  .trim()
  .regex(/^\d{3}-?\d{2}-?\d{4}$/, 'SSN must be in format XXX-XX-XXXX or 9 digits')
  .optional();

/** Postal address shape */
export const addressSchema = z.object({
  street1: z.string().min(1, 'Street address is required'),
  street2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: stateCodeSchema,
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'ZIP must be 5 or 9 digits (XXXXX or XXXXX-XXXX)'),
  country: z.string().length(2).default('US'),
});

// ── Business Creation ─────────────────────────────────────────

export const createBusinessSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, 'Legal name must be at least 2 characters')
    .max(200, 'Legal name cannot exceed 200 characters'),

  dba: z
    .string()
    .trim()
    .max(200, 'DBA cannot exceed 200 characters')
    .optional(),

  ein: einRawSchema.optional(),

  entityType: entityTypeSchema,

  stateOfFormation: stateCodeSchema.optional(),

  dateOfFormation: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'))
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),

  industry: z.string().trim().max(100).optional(),

  /** ISO 18245 Merchant Category Code (4 digits) */
  mcc: z
    .string()
    .regex(/^\d{4}$/, 'MCC must be exactly 4 digits')
    .optional(),

  annualRevenue: moneySchema.optional(),

  monthlyRevenue: moneySchema.optional(),

  advisorId: z.string().uuid('Advisor ID must be a valid UUID').optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

// ── Business Update ───────────────────────────────────────────

export const updateBusinessSchema = createBusinessSchema
  .partial()
  .extend({
    status: z
      .enum(['intake', 'onboarding', 'active', 'graduated', 'offboarding', 'closed'])
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

// ── Owner Creation ────────────────────────────────────────────

export const createOwnerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(100, 'First name cannot exceed 100 characters'),

  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(100, 'Last name cannot exceed 100 characters'),

  ownershipPercent: ownershipPercentSchema,

  ssn: ssnSchema,

  dateOfBirth: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'))
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .refine(
      (val) => {
        if (!val) return true;
        const age = (Date.now() - val.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        return age >= 18 && age <= 120;
      },
      { message: 'Owner must be between 18 and 120 years old' },
    ),

  address: addressSchema.optional(),

  isBeneficialOwner: z.boolean().default(true),
});

export type CreateOwnerInput = z.infer<typeof createOwnerSchema>;

// ── Compound validation helpers ───────────────────────────────

/**
 * Validates that the sum of ownership percentages for a set of owners
 * does not exceed 100%.
 */
export function validateTotalOwnership(percents: number[]): boolean {
  const total = percents.reduce((sum, p) => sum + p, 0);
  return Math.round(total * 100) <= 10_000; // avoid floating-point drift
}

/**
 * Validate a raw EIN string without transforming it.
 * Returns the normalised XX-XXXXXXX form or null on failure.
 */
export function parseEin(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}
