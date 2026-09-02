// ============================================================
// CapitalForge Constants
// ============================================================

// Event Types for Canonical Ledger
export const EVENT_TYPES = {
  // Consent
  CONSENT_CAPTURED: 'consent.captured',
  CONSENT_REVOKED: 'consent.revoked',

  // Application
  APPLICATION_CREATED: 'application.created',
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_APPROVED: 'application.approved',
  APPLICATION_DECLINED: 'card.declined',

  // Funding
  ROUND_STARTED: 'round.started',
  ROUND_COMPLETED: 'funding_round.completed',
  APR_EXPIRY_APPROACHING: 'apr.expiry.approaching',

  // Compliance
  COMPLIANCE_CHECK_COMPLETED: 'compliance.check.completed',
  RISK_ALERT_RAISED: 'risk.alert.raised',
  SUITABILITY_ASSESSED: 'suitability.assessed',
  NOGO_TRIGGERED: 'nogo.triggered',
  /**
   * A per-business compliance manifest was assembled.
   *
   * The manifest is a pure read and left NO trace that it had happened — no
   * ledger row, no audit record, a logger.info and nothing else. Its sibling
   * artefact, the regulator dossier, has recorded its own exports all along.
   * "Who pulled the client's whole compliance file, and when" is the first
   * question asked about an evidence assembly, and it had no answer.
   */
  COMPLIANCE_MANIFEST_ASSEMBLED: 'compliance.manifest.assembled',

  // Rules / reference data / release governance
  RULE_CREATED: 'rule.created',
  RULE_UPDATED: 'rule.updated',
  RULE_VERSION_DEPLOYED: 'rule.version.deployed',
  RULE_VERSION_ROLLED_BACK: 'rule.version.rolled_back',

  // Policy & workflow orchestration
  POLICY_EVALUATED: 'policy.evaluated',
  WORKFLOW_EVALUATED: 'workflow.evaluated',

  // ACH
  DEBIT_AUTHORIZED: 'debit.authorized',
  DEBIT_REVOKED: 'debit.revoked',
  DEBIT_UNAUTHORIZED_DETECTED: 'debit.unauthorized.detected',

  // Document
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_PROCESSED: 'document.processed',

  // Acknowledgment
  PRODUCT_REALITY_ACKNOWLEDGED: 'product.reality.acknowledged',

  // Onboarding
  BUSINESS_CREATED: 'business.created',
  BUSINESS_ONBOARDED: 'business.onboarded',
  KYB_VERIFIED: 'kyb.verified',
  KYC_VERIFIED: 'kyc.verified',

  // Offboarding
  OFFBOARDING_INITIATED: 'offboarding.initiated',
  OFFBOARDING_COMPLETED: 'offboarding.completed',

  // Restack
  /**
   * DEAD as of 2026-09-02. Nothing emits it.
   *
   * auto-restack.service.ts wrote this to the canonical ledger at readiness
   * score >= 70 — an immutable record asserting a client was ready for another
   * funding round, from numbers a caller typed into a query string. The engine
   * was deleted rather than fixed; restack-trigger.ts answers the same question
   * from the database and emits nothing.
   *
   * The constant stays because historical rows may carry the string, and a
   * reader resolving an eventType needs the name to still mean something.
   */
  RESTACK_TRIGGER_FIRED: 'restack.trigger.fired',

  // VoiceForge
  CALL_COMPLETED: 'call.completed',
  CALL_COMPLIANCE_VIOLATION: 'call.compliance.violation',
} as const;

// Aggregate Types
export const AGGREGATE_TYPES = {
  BUSINESS: 'business',
  APPLICATION: 'application',
  FUNDING_ROUND: 'funding_round',
  CONSENT: 'consent',
  COMPLIANCE: 'compliance',
  DOCUMENT: 'document',
  ACH: 'ach_authorization',
  USER: 'user',
  TENANT: 'tenant',
  /** Versioned reference data and release/feature-flag governance. */
  RULE: 'rule',
  /** Platform/tenant administration actions. */
  ADMIN: 'admin',
} as const;

// Risk Thresholds
export const RISK_THRESHOLDS = {
  SUITABILITY_NOGO: 30,
  SUITABILITY_HIGH_RISK: 50,
  SUITABILITY_MODERATE: 70,
  MAX_UTILIZATION_WARN: 0.7,
  MAX_UTILIZATION_CRITICAL: 0.9,
  MAX_INQUIRY_VELOCITY_90D: 6,
} as const;

// Issuer Rules (Chase 5/24, etc.)
export const ISSUER_RULES = {
  CHASE_524_WINDOW_MONTHS: 24,
  CHASE_524_MAX_CARDS: 5,
  AMEX_VELOCITY_COOLDOWN_DAYS: 90,
  CITI_8_65_DAYS: 65,
  CITI_1_8_DAYS: 8,
} as const;

// APR Alert Windows (days before expiry)
export const APR_ALERT_WINDOWS = [60, 30, 15] as const;

// Roles
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  ADVISOR: 'advisor',
  COMPLIANCE_OFFICER: 'compliance_officer',
  CLIENT: 'client',
  READONLY: 'readonly',
} as const;

// Permissions
export const PERMISSIONS = {
  BUSINESS_READ: 'business:read',
  /**
   * Reading natural-person identifiers on a business: beneficial owners with
   * dates of birth, addresses and ssnLast4; the client timeline, whose ledger
   * payloads carry consent evidence references and IP addresses; and the ACH
   * authorisation.
   *
   * Separate from BUSINESS_READ because a legal name and a date of birth are
   * not the same disclosure, and one permission covering both means the grant
   * is the only thing between them.
   *
   * ACH sits here by decision rather than by formal category: an authorisation
   * is against a business account, but on a small business the owner and the
   * business are effectively the same person, and personal guarantees are
   * everywhere in this venture. The formal distinction does not survive
   * contact with the product.
   */
  BUSINESS_READ_PII: 'business:read:pii',
  /**
   * Reading bureau-derived credit data — scores, history, and the
   * recommendations computed from them.
   *
   * Separate because compliance/bureau-report-handling-v1 already restricts
   * what may be done with this data downstream, and a permission that names it
   * is what lets a grant match that restriction.
   */
  BUSINESS_READ_CREDIT: 'business:read:credit',
  BUSINESS_WRITE: 'business:write',
  APPLICATION_SUBMIT: 'application:submit',
  APPLICATION_APPROVE: 'application:approve',
  COMPLIANCE_READ: 'compliance:read',
  COMPLIANCE_WRITE: 'compliance:write',
  CONSENT_MANAGE: 'consent:manage',
  DOCUMENT_READ: 'document:read',
  DOCUMENT_WRITE: 'document:write',
  ACH_MANAGE: 'ach:manage',
  ADMIN_TENANT: 'admin:tenant',
  ADMIN_USERS: 'admin:users',
  REPORTS_VIEW: 'reports:view',
} as const;

// ── Pre-submission declarations ───────────────────────────────
//
// The four things an advisor attests to before an application is submitted.
//
// They existed only as display strings in
// `components/applications/wizard/WizardStep5ReviewConfirm.tsx`, and the API
// checked `declarations.length >= 4 && declarations.every(Boolean)` — so
// `[1, 'yes', {}, []]` passed, and nothing anywhere said what was being
// declared. A caller could attest to four unnamed things, and an agent had
// nothing to read to know what it was confirming.
//
// Named here, in shared, because the wording is the attestation. The `id` is
// what the API requires and what the audit row stores; the `text` is what the
// person ticking actually saw. Storing only the id would leave an audit trail
// that cannot reproduce the sentence somebody agreed to, and the wording is the
// part that would matter if the attestation were ever challenged.
//
// Changing `text` changes what was attested. If it is reworded, the version
// below moves with it so old rows stay readable as what they were.
export const PRE_SUBMISSION_DECLARATION_VERSION = '1.0.0';

export const PRE_SUBMISSION_DECLARATIONS = [
  {
    id: 'consent_verified',
    text: 'I confirm consent has been verified',
  },
  {
    id: 'product_reality_signed',
    text: 'I confirm the Product-Reality Acknowledgment has been signed',
  },
  {
    id: 'no_misrepresentation',
    text: 'I confirm no misrepresentations on this application',
  },
  {
    id: 'business_purpose_legitimate',
    text: 'I confirm the business purpose is legitimate',
  },
] as const;

export type PreSubmissionDeclarationId =
  typeof PRE_SUBMISSION_DECLARATIONS[number]['id'];
