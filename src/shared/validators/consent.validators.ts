// ============================================================
// CapitalForge — Consent Zod Validators
//
// Used by the consent routes to validate incoming request bodies
// before they reach the service layer. All parsing is strict —
// unknown keys are stripped and required fields must be present.
// ============================================================

import { z } from 'zod';

// ----------------------------------------------------------------
// Shared enum schemas — derived from shared/types ConsentChannel,
// ConsentType, ConsentStatus so the two stay in sync.
// ----------------------------------------------------------------

export const ConsentChannelSchema = z.enum([
  'voice',
  'sms',
  'email',
  'partner',
  'document',
]);

export const ConsentTypeSchema = z.enum([
  'tcpa',
  'data_sharing',
  'referral',
  'application',
  'product_reality',
]);

export const ConsentStatusSchema = z.enum(['active', 'revoked', 'expired']);

// ----------------------------------------------------------------
// Grant consent — POST /api/businesses/:id/consent
// ----------------------------------------------------------------

/**
 * Request body for granting consent on a specific channel.
 *
 * `evidenceRef` should reference a document ID, signature ID, or
 * URL that proves consent was affirmatively given. Highly recommended
 * for TCPA channels (voice/sms) and required during any audit.
 */
export const GrantConsentBodySchema = z.object({
  channel: ConsentChannelSchema,
  consentType: ConsentTypeSchema,
  /** IP address of the consenting party, captured server-side when possible */
  ipAddress: z
    .string()
    .ip({ message: 'ipAddress must be a valid IPv4 or IPv6 address' })
    .optional(),
  /**
   * Evidence reference — document vault ID, DocuSign envelope ID,
   * signed URL, or any opaque string that links back to proof.
   */
  evidenceRef: z
    .string()
    .min(1)
    .max(500)
    .optional(),
  /** Arbitrary key/value pairs stored verbatim — e.g. form version, user agent */
  metadata: z.record(z.unknown()).optional(),
});

export type GrantConsentBody = z.infer<typeof GrantConsentBodySchema>;

// ----------------------------------------------------------------
// Revoke consent — DELETE /api/businesses/:id/consent/:channel
// ----------------------------------------------------------------

/**
 * Optional request body for revocation.
 * The channel comes from the URL path parameter; this schema
 * validates the body which carries the reason.
 */
export const RevokeConsentBodySchema = z
  .object({
    revocationReason: z
      .string()
      .min(1, 'Revocation reason must not be empty if provided')
      .max(1000)
      .optional(),
    ipAddress: z
      .string()
      .ip({ message: 'ipAddress must be a valid IPv4 or IPv6 address' })
      .optional(),
  })
  .optional()
  .default({});

export type RevokeConsentBody = z.infer<typeof RevokeConsentBodySchema>;

// ----------------------------------------------------------------
// Channel path param — shared across routes
// ----------------------------------------------------------------

export const ConsentChannelParamSchema = z.object({
  channel: ConsentChannelSchema,
});

export type ConsentChannelParam = z.infer<typeof ConsentChannelParamSchema>;

// ----------------------------------------------------------------
// Audit query params — GET /api/businesses/:id/consent/audit
// ----------------------------------------------------------------

/**
 * Optional query parameters for the audit export endpoint.
 * When omitted, the full history is returned.
 */
export const ConsentAuditQuerySchema = z
  .object({
    /** Filter to a specific channel */
    channel: ConsentChannelSchema.optional(),
    /** Filter to a specific consentType */
    consentType: ConsentTypeSchema.optional(),
    /** Only return records at or after this ISO timestamp */
    since: z
      .string()
      .datetime({ message: 'since must be an ISO 8601 datetime string' })
      .optional(),
    /** Only return records at or before this ISO timestamp */
    until: z
      .string()
      .datetime({ message: 'until must be an ISO 8601 datetime string' })
      .optional(),
  })
  .optional()
  .default({});

export type ConsentAuditQuery = z.infer<typeof ConsentAuditQuerySchema>;

// ----------------------------------------------------------------
// Response shape schemas (for documentation / OpenAPI generation)
// ----------------------------------------------------------------

export const ConsentStatusResultSchema = z.object({
  channel: ConsentChannelSchema,
  consentType: ConsentTypeSchema,
  status: ConsentStatusSchema,
  grantedAt: z.date(),
  revokedAt: z.date().nullable(),
  evidenceRef: z.string().nullable(),
  recordId: z.string().uuid(),
});

export const ConsentAuditEntrySchema = z.object({
  id: z.string().uuid(),
  channel: ConsentChannelSchema,
  consentType: ConsentTypeSchema,
  status: ConsentStatusSchema,
  grantedAt: z.date(),
  revokedAt: z.date().nullable(),
  revocationReason: z.string().nullable(),
  ipAddress: z.string().nullable(),
  evidenceRef: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
});
