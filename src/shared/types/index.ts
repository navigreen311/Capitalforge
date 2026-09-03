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
  | 'equifax_business_risk'
  /**
   * Equifax OneScore for Commercial, 300–650.
   *
   * A distinct product from Business Credit Risk, and the reason it needs its
   * own slot: **300–650 sits entirely inside 101–992**, so a OneScore recorded
   * as `equifax_business_risk` passes every range check and is then compared
   * against sc_006's threshold of 500 — a number that means nothing on this
   * scale.
   *
   * Overlapping ranges cannot be told apart by value. The defence is a slot to
   * record it correctly, plus naming the ambiguity where a value falls in the
   * overlap. It is also the score Equifax leads with in the Industry Report
   * 2.0 bundle, so it is the one most likely to be read off a PDF by mistake.
   */
  | 'equifax_onescore';
export type CreditProfileType = 'personal' | 'business';

// Funding
/**
 * The statuses a card application can hold.
 *
 * `cancelled` was missing, and `rewards.routes.ts` has been writing it — so a
 * status nothing declared was reaching the column, and every query that
 * described the live set as `NOT IN (approved, declined)` counted cancelled
 * cards among the active ones. The dashboard's headline "applications" figure
 * was one of them.
 *
 * An undeclared value cannot be reasoned about: nothing that enumerates this
 * union had any way to know it existed.
 */
export type ApplicationStatus =
  | 'draft'
  | 'pending_consent'
  | 'submitted'
  | 'approved'
  | 'declined'
  | 'reconsideration'
  | 'cancelled';

/**
 * The statuses that take an application out of the active set.
 *
 * Exported so the two places that count active applications, and the series
 * behind them, read one list. They each carried their own literal, which is
 * how `cancelled` came to be missing from all of them at once.
 */
export const CLOSED_APPLICATION_STATUSES = ['approved', 'declined', 'cancelled'] as const;
export type RoundStatus = 'planning' | 'in_progress' | 'completed' | 'cancelled';

// Consent
/**
 * The channels a consent can be recorded against.
 *
 * An array as well as a union, because four separate lists of channels had
 * grown up around it and none of them matched:
 *
 *   ConsentChannel            voice sms email partner document
 *   the scan route's z.enum   voice sms email         document  chat video_script
 *   DisclosureTemplate        voice sms email                   chat            all
 *   the frontend CHANNELS     voice sms email         document  chat
 *
 * `partner` existed only in consent, `chat` in everything except consent, and
 * `document` was missing from the disclosure templates — so a disclosure could
 * not be marked as applying to a document at all. Nothing failed; the lists
 * simply disagreed, quietly, about what a channel is.
 */
export const CONSENT_CHANNELS = ['voice', 'sms', 'email', 'partner', 'document'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

/**
 * The channels a COMMUNICATION SCAN can be run against: every consent channel,
 * plus two that are scanned but never consented to.
 *
 * The two extras are deliberate and are not consent channels:
 *
 *   `chat`         — a live chat transcript. Consent is not captured over chat
 *                    in this system, but chat is scanned, and the frontend
 *                    channel picker offers it.
 *   `video_script` — the text a video is generated FROM, scanned before render.
 *                    Kept distinct from `document` because the scan record is
 *                    read later to answer "what was checked, and what was it":
 *                    a script recorded as a document misdescribes both the
 *                    artefact scanned and the audience it reaches. Named
 *                    `video_script` rather than `video` because nothing here
 *                    has inspected a video.
 *
 * Superset rather than a separate list, so the overlap cannot drift again.
 */
export const SCAN_CHANNELS = [...CONSENT_CHANNELS, 'chat', 'video_script'] as const;
export type ScanChannel = (typeof SCAN_CHANNELS)[number];
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
