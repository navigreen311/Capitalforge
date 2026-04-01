// ============================================================
// CapitalForge — Master Reference Data Governance Service
//
// Governed single source of truth for:
//   - Issuer rules (Chase, Amex, Citi, Discover, etc.)
//   - Card product catalogue
//   - MCC (Merchant Category Code) classifications
//   - State disclosure requirements
//   - Fee taxonomies
//
// Capabilities:
//   1. Version-tracked records with semantic versioning
//   2. Change-approval workflow (draft → pending → approved → active)
//   3. Data quality checks (schema validation, referential integrity)
//   4. Tenant-scoped overrides on top of platform defaults
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../../config/logger.js';

// ============================================================
// Domain types
// ============================================================

export type RefDataDomain =
  | 'issuer_rules'
  | 'card_products'
  | 'mcc_classifications'
  | 'state_disclosures'
  | 'fee_taxonomy';

export type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'active' | 'superseded';

export interface RefDataVersion {
  id: string;
  tenantId: string | null; // null = platform-wide default
  domain: RefDataDomain;
  entityId: string;         // logical identity of the record
  semver: string;           // "1.0.0"
  status: ApprovalStatus;
  payload: Record<string, unknown>;
  qualityScore: number;     // 0–100; computed by runQualityChecks()
  qualityIssues: QualityIssue[];
  createdBy: string;
  createdAt: Date;
  submittedForReviewAt?: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  activatedAt?: Date;
  supersededAt?: Date;
  changeNote: string;
}

export interface QualityIssue {
  field: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface IssuerRule {
  issuerId: string;
  issuerName: string;
  maxCards24Months: number;
  velocityWindowDays: number;
  maxAppsInWindow: number;
  cooldownDays: number;
  lifetimeCap?: number;
  productFamilyRestrictions?: Record<string, unknown>;
}

export interface CardProduct {
  productId: string;
  issuerId: string;
  productName: string;
  network: 'Visa' | 'Mastercard' | 'Amex' | 'Discover';
  creditType: 'secured' | 'unsecured' | 'charge';
  annualFee: number;
  rewardsTier: string;
  signupBonusPoints?: number;
  minCreditScore: number;
  maxCreditLine?: number;
}

export interface MccClassification {
  mccCode: string;
  categoryName: string;
  parentCategory: string;
  businessPurposeEligible: boolean;
  rewardsMultiplier: number;
  highRiskFlag: boolean;
  regulatoryNotes?: string;
}

export interface StateDisclosureRequirement {
  stateCode: string;
  disclosureType: string;
  templateId: string;
  mandatoryFields: string[];
  deliveryMethods: string[];
  timingRequirement: string;
  regulatoryReference: string;
  effectiveDate: string;
  expiryDate?: string;
}

export interface FeeTaxonomy {
  feeCode: string;
  feeName: string;
  category: 'origination' | 'periodic' | 'transactional' | 'penalty' | 'service';
  aprEquivalent: boolean;
  regulationZCategory?: string;
  maxAllowedAmount?: number;
  disclosureRequired: boolean;
  states: string[]; // state codes where applicable; '*' = all
}

export interface CreateRefDataInput {
  tenantId?: string;
  domain: RefDataDomain;
  entityId: string;
  payload: Record<string, unknown>;
  changeNote: string;
  createdBy: string;
}

export interface ApproveRefDataInput {
  versionId: string;
  reviewedBy: string;
  approve: boolean;
  rejectionReason?: string;
}

// ============================================================
// Quality check rules per domain
// ============================================================

const QUALITY_RULES: Record<RefDataDomain, Array<(payload: Record<string, unknown>) => QualityIssue | null>> = {
  issuer_rules: [
    (p) => (typeof p['issuerId'] !== 'string' || !p['issuerId'])
      ? { field: 'issuerId', rule: 'required_string', severity: 'error', message: 'issuerId is required' }
      : null,
    (p) => (typeof p['maxCards24Months'] !== 'number' || (p['maxCards24Months'] as number) < 0)
      ? { field: 'maxCards24Months', rule: 'non_negative_number', severity: 'error', message: 'maxCards24Months must be a non-negative number' }
      : null,
    (p) => (typeof p['velocityWindowDays'] !== 'number')
      ? { field: 'velocityWindowDays', rule: 'required_number', severity: 'warning', message: 'velocityWindowDays should be specified' }
      : null,
  ],
  card_products: [
    (p) => (!p['productId'])
      ? { field: 'productId', rule: 'required', severity: 'error', message: 'productId is required' }
      : null,
    (p) => (!['Visa', 'Mastercard', 'Amex', 'Discover'].includes(p['network'] as string))
      ? { field: 'network', rule: 'enum', severity: 'error', message: 'network must be Visa, Mastercard, Amex, or Discover' }
      : null,
    (p) => (typeof p['annualFee'] !== 'number')
      ? { field: 'annualFee', rule: 'required_number', severity: 'warning', message: 'annualFee should be numeric' }
      : null,
  ],
  mcc_classifications: [
    (p) => (!p['mccCode'] || String(p['mccCode']).length !== 4)
      ? { field: 'mccCode', rule: 'mcc_format', severity: 'error', message: 'mccCode must be a 4-character string' }
      : null,
    (p) => (typeof p['rewardsMultiplier'] !== 'number')
      ? { field: 'rewardsMultiplier', rule: 'required_number', severity: 'warning', message: 'rewardsMultiplier should be numeric' }
      : null,
  ],
  state_disclosures: [
    (p) => (!p['stateCode'] || String(p['stateCode']).length !== 2)
      ? { field: 'stateCode', rule: 'state_format', severity: 'error', message: 'stateCode must be a 2-character ISO state code' }
      : null,
    (p) => (!p['templateId'])
      ? { field: 'templateId', rule: 'required', severity: 'error', message: 'templateId is required' }
      : null,
    (p) => (!p['regulatoryReference'])
      ? { field: 'regulatoryReference', rule: 'required', severity: 'warning', message: 'regulatoryReference should be provided' }
      : null,
  ],
  fee_taxonomy: [
    (p) => (!p['feeCode'])
      ? { field: 'feeCode', rule: 'required', severity: 'error', message: 'feeCode is required' }
      : null,
    (p) => (!['origination', 'periodic', 'transactional', 'penalty', 'service'].includes(p['category'] as string))
      ? { field: 'category', rule: 'enum', severity: 'error', message: 'category must be one of: origination, periodic, transactional, penalty, service' }
      : null,
    (p) => (typeof p['disclosureRequired'] !== 'boolean')
      ? { field: 'disclosureRequired', rule: 'required_boolean', severity: 'error', message: 'disclosureRequired must be a boolean' }
      : null,
  ],
};

// ============================================================
// In-memory store (replace with Prisma in production)
// ============================================================

const store: RefDataVersion[] = [];

// ============================================================
// Service
// ============================================================

export class ReferenceDataService {
  // ── Helpers ─────────────────────────────────────────────────

  private runQualityChecks(domain: RefDataDomain, payload: Record<string, unknown>): {
    score: number;
    issues: QualityIssue[];
  } {
    const rules = QUALITY_RULES[domain] ?? [];
    const issues: QualityIssue[] = rules
      .map((fn) => fn(payload))
      .filter((i): i is QualityIssue => i !== null);

    const errors   = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const score    = Math.max(0, 100 - errors * 20 - warnings * 5);

    return { score, issues };
  }

  private bumpPatch(semver: string): string {
    const parts = semver.split('.').map(Number);
    parts[2] = (parts[2] ?? 0) + 1;
    return parts.join('.');
  }

  private latestVersion(domain: RefDataDomain, entityId: string, tenantId?: string): RefDataVersion | undefined {
    return store
      .filter(
        (v) =>
          v.domain === domain &&
          v.entityId === entityId &&
          v.tenantId === (tenantId ?? null),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  // ── Core CRUD ───────────────────────────────────────────────

  /** Create a new draft version for a reference data entity. */
  async createVersion(input: CreateRefDataInput): Promise<RefDataVersion> {
    const { tenantId, domain, entityId, payload, changeNote, createdBy } = input;

    const prev = this.latestVersion(domain, entityId, tenantId);
    const semver = prev ? this.bumpPatch(prev.semver) : '1.0.0';

    const { score, issues } = this.runQualityChecks(domain, payload);

    const version: RefDataVersion = {
      id: uuidv4(),
      tenantId: tenantId ?? null,
      domain,
      entityId,
      semver,
      status: 'draft',
      payload,
      qualityScore: score,
      qualityIssues: issues,
      createdBy,
      createdAt: new Date(),
      changeNote,
    };

    store.push(version);

    await eventBus.publishAndPersist({
      id: uuidv4(),
      type: EVENT_TYPES.RULE_CREATED,
      aggregateType: AGGREGATE_TYPES.RULE,
      aggregateId: entityId,
      tenantId: tenantId ?? 'platform',
      payload: { versionId: version.id, domain, semver, qualityScore: score },
      occurredAt: new Date(),
    });

    logger.info({ versionId: version.id, domain, entityId, semver }, 'ref-data version created');
    return version;
  }

  /** Submit a draft for approval review. */
  async submitForReview(versionId: string): Promise<RefDataVersion> {
    const version = store.find((v) => v.id === versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);
    if (version.status !== 'draft') throw new Error(`Version must be in draft status to submit for review`);

    const errorIssues = version.qualityIssues.filter((i) => i.severity === 'error');
    if (errorIssues.length > 0) {
      throw new Error(`Cannot submit version with ${errorIssues.length} quality error(s): ${errorIssues.map((i) => i.message).join('; ')}`);
    }

    version.status = 'pending_review';
    version.submittedForReviewAt = new Date();

    logger.info({ versionId, domain: version.domain }, 'ref-data version submitted for review');
    return version;
  }

  /** Approve or reject a pending-review version. */
  async processApproval(input: ApproveRefDataInput): Promise<RefDataVersion> {
    const { versionId, reviewedBy, approve, rejectionReason } = input;
    const version = store.find((v) => v.id === versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);
    if (version.status !== 'pending_review') throw new Error(`Version must be pending_review to process approval`);

    version.reviewedBy  = reviewedBy;
    version.reviewedAt  = new Date();

    if (approve) {
      version.status = 'approved';
      logger.info({ versionId, reviewedBy }, 'ref-data version approved');
    } else {
      version.status = 'rejected';
      version.rejectionReason = rejectionReason;
      logger.info({ versionId, reviewedBy, rejectionReason }, 'ref-data version rejected');
    }

    return version;
  }

  /** Activate an approved version; supersede the previously active one. */
  async activateVersion(versionId: string, activatedBy: string): Promise<RefDataVersion> {
    const version = store.find((v) => v.id === versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);
    if (version.status !== 'approved') throw new Error(`Version must be approved before activation`);

    // Supersede current active version in same scope
    const nowMs = Date.now();
    store
      .filter(
        (v) =>
          v.id !== versionId &&
          v.domain === version.domain &&
          v.entityId === version.entityId &&
          v.tenantId === version.tenantId &&
          v.status === 'active',
      )
      .forEach((v) => {
        v.status = 'superseded';
        v.supersededAt = new Date(nowMs);
      });

    version.status      = 'active';
    version.activatedAt = new Date();

    await eventBus.publishAndPersist({
      id: uuidv4(),
      type: EVENT_TYPES.RULE_UPDATED,
      aggregateType: AGGREGATE_TYPES.RULE,
      aggregateId: version.entityId,
      tenantId: version.tenantId ?? 'platform',
      payload: { versionId, domain: version.domain, semver: version.semver, activatedBy },
      occurredAt: new Date(),
    });

    logger.info({ versionId, activatedBy }, 'ref-data version activated');
    return version;
  }

  /** List versions for a domain/entity combination. */
  listVersions(domain: RefDataDomain, entityId: string, tenantId?: string): RefDataVersion[] {
    return store
      .filter(
        (v) =>
          v.domain === domain &&
          v.entityId === entityId &&
          v.tenantId === (tenantId ?? null),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Fetch the currently active version for a domain/entity. */
  getActive(domain: RefDataDomain, entityId: string, tenantId?: string): RefDataVersion | null {
    return (
      store.find(
        (v) =>
          v.domain === domain &&
          v.entityId === entityId &&
          v.tenantId === (tenantId ?? null) &&
          v.status === 'active',
      ) ?? null
    );
  }

  /** List all entities for a domain (one row per entityId, latest version). */
  listEntities(domain: RefDataDomain, tenantId?: string): RefDataVersion[] {
    const byEntity = new Map<string, RefDataVersion>();
    for (const v of store) {
      if (v.domain !== domain) continue;
      if (v.tenantId !== (tenantId ?? null)) continue;
      const existing = byEntity.get(v.entityId);
      if (!existing || v.createdAt > existing.createdAt) {
        byEntity.set(v.entityId, v);
      }
    }
    return Array.from(byEntity.values());
  }

  /** Re-run quality checks against a specific version (e.g. after rules change). */
  recheckQuality(versionId: string): RefDataVersion {
    const version = store.find((v) => v.id === versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);

    const { score, issues } = this.runQualityChecks(version.domain, version.payload);
    version.qualityScore  = score;
    version.qualityIssues = issues;

    logger.info({ versionId, score }, 'ref-data quality recheck complete');
    return version;
  }

  /** Expose store for testing/admin. */
  _store(): RefDataVersion[] {
    return store;
  }

  _reset(): void {
    store.length = 0;
  }
}
