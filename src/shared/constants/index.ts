// ============================================================
// CapitalForge Constants
// ============================================================

// Event Types for Canonical Ledger
export const EVENT_TYPES = {
  // Consent
  CONSENT_CAPTURED: 'consent.captured',
  CONSENT_REVOKED: 'consent.revoked',

  // Application
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_APPROVED: 'card.approved',
  APPLICATION_DECLINED: 'card.declined',

  // Funding
  ROUND_STARTED: 'round.started',
  ROUND_COMPLETED: 'round.completed',
  APR_EXPIRY_APPROACHING: 'apr.expiry.approaching',

  // Compliance
  COMPLIANCE_CHECK_COMPLETED: 'compliance.check.completed',
  RISK_ALERT_RAISED: 'risk.alert.raised',
  SUITABILITY_ASSESSED: 'suitability.assessed',
  NOGO_TRIGGERED: 'nogo.triggered',

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
