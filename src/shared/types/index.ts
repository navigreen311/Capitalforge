// ============================================================
// CapitalForge Shared Types
// ============================================================

// Tenant & Identity
export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
  /**
   * Optional. Not populated by requireAuth (the access token carries no email
   * claim) — present only where a caller attaches it. Consumers must handle
   * its absence.
   */
  email?: string;
}

// Event Bus
export interface LedgerEventPayload {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type EventHandler = (event: LedgerEventPayload) => Promise<void>;

// Business
export type BusinessStatus = 'intake' | 'onboarding' | 'active' | 'graduated' | 'offboarding' | 'closed';
export type EntityType = 'llc' | 'corporation' | 'sole_proprietor' | 'partnership' | 's_corp' | 'c_corp';

// Credit
export type Bureau = 'equifax' | 'transunion' | 'experian' | 'dnb';
/**
 * The score products this system stores, by the name of the product.
 *
 * `intelliscore` is Experian's business score (Intelliscore Plus, 1–100) and
 * is not the same product as FICO's SBSS (0–300). Every business pull used to
 * be written as `sbss` whatever bureau produced it, which made the Experian
 * Business card on /credit-builder permanently unfillable: it reads
 * `intelliscore`, and nothing in the system emitted that string. The card, the
 * Intelliscore line on the trajectory chart and the "Experian Intelliscore
 * ≥ 60" stacking criterion were all reading a key that was never written.
 */
export type ScoreType =
  | 'fico'
  | 'vantage'
  | 'sbss'
  | 'paydex'
  | 'intelliscore'
  /**
   * Equifax Business Credit Risk Score, 101–992. Equifax's own product, and
   * not SBSS — which is FICO's, runs 0–300, and was what the Equifax business
   * adapter wrote. Nothing produced this string, so the "Equifax Business
   * Credit ≥ 500" stacking criterion could not be assessed for any client.
   */
  | 'equifax_business_risk';
export type CreditProfileType = 'personal' | 'business';

// Funding
export type ApplicationStatus = 'draft' | 'pending_consent' | 'submitted' | 'approved' | 'declined' | 'reconsideration';
export type RoundStatus = 'planning' | 'in_progress' | 'completed' | 'cancelled';

// Consent
export type ConsentChannel = 'voice' | 'sms' | 'email' | 'partner' | 'document';
export type ConsentType = 'tcpa' | 'data_sharing' | 'referral' | 'application' | 'product_reality';
export type ConsentStatus = 'active' | 'revoked' | 'expired';

// Compliance
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ComplianceCheckType = 'udap' | 'state_law' | 'vendor' | 'kyb' | 'kyc' | 'aml';

// ACH
export type AchAuthStatus = 'active' | 'revoked' | 'suspended';

// Suitability
export interface SuitabilityResult {
  score: number;
  maxSafeLeverage: number;
  noGoTriggered: boolean;
  noGoReasons: string[];
  recommendation: string;
  alternativeProducts: string[];
}

// Cost of Capital
export interface CostBreakdown {
  programFees: number;
  percentOfFunding: number;
  annualFees: number;
  cashAdvanceFees: number;
  processorFees: number;
  totalCost: number;
  effectiveApr: number | null;
}

// API Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /**
   * Pagination envelope, plus any endpoint-specific summary values.
   *
   * Routes across the API already return extra keys here (aggregate counts,
   * risk-score rollups, status messages), so the shape allows additional
   * entries alongside the three well-known pagination fields rather than
   * rejecting every one of those responses.
   */
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    [key: string]: unknown;
  };
}

// Pagination
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
