// ============================================================
// CapitalForge — KYB / KYC Verification Service
//
// Responsibilities:
//   1. Business Entity Verification (Secretary of State stub)
//   2. Beneficial Ownership mapping (>= 25% owners)
//   3. OFAC / Sanctions screening (hard stop on match)
//   4. Synthetic Identity fraud detection (manual review on high risk)
//   5. KYB / KYC status management & persistence via Prisma
//   6. Publishes KYB_VERIFIED and KYC_VERIFIED events to the ledger
//
// Key rules enforced here:
//   - KYB must pass before any application can be submitted
//   - ALL beneficial owners (>= 25% ownership) must pass KYC
//   - OFAC hard match = immediate halt, no override
//   - Synthetic identity suspicion (high/critical) = manual review gate
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../../shared/constants/index.js';
import {
  screenSanctions,
  isHardOFACStop,
  type SanctionsScreeningOutput,
} from './sanctions-screening.js';
import { detectFraud, type FraudDetectionOutput } from './fraud-detection.js';
import type {
  KybVerificationRequest,
  KycVerificationRequest,
  KybStatus,
  KycStatus,
} from '../../shared/validators/kyb-kyc.validators.js';

// ── Prisma singleton ─────────────────────────────────────────────────────────

let _prisma: PrismaClient | null = null;

/** Allow injection for tests */
export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

/** @deprecated Use getPrisma() internally */
const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ── CapitalForge-specific error class ────────────────────────────────────────

export class KybKycError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 422,
  ) {
    super(message);
    this.name = 'KybKycError';
  }
}

// ── Secretary of State verification stub ─────────────────────────────────────

interface SosVerificationResult {
  verified: boolean;
  sosFilingNumber?: string;
  entityStatus?: string; // 'active' | 'dissolved' | 'suspended' | 'not_found'
  warnings: string[];
}

/**
 * STUB: In production, connect to a provider such as:
 *  - Middesk (https://middesk.com)
 *  - LexisNexis Business Instant ID
 *  - OpenCorporates API
 *
 * This stub validates basic formatting and returns a synthetic result.
 */
async function verifyWithSecretaryOfState(
  legalName: string,
  ein: string,
  stateOfFormation: string,
  entityType: string,
): Promise<SosVerificationResult> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 50));

  const warnings: string[] = [];

  // Basic sanity checks the real API would catch
  if (!ein.match(/^\d{2}-\d{7}$/)) {
    return { verified: false, entityStatus: 'invalid_ein', warnings: ['EIN format invalid'] };
  }

  // Sole proprietors often do not have SoS filings — softer check
  if (entityType === 'sole_proprietor') {
    warnings.push('Sole proprietorships may not have Secretary of State filings; manual verification recommended.');
    return {
      verified: true,
      sosFilingNumber: undefined,
      entityStatus: 'active',
      warnings,
    };
  }

  // Simulate a known-bad EIN prefix for testing
  if (ein.startsWith('00-')) {
    return {
      verified: false,
      entityStatus: 'not_found',
      warnings: ['Entity not found in Secretary of State records'],
    };
  }

  return {
    verified: true,
    sosFilingNumber: `SOS-${stateOfFormation}-${Date.now()}`,
    entityStatus: 'active',
    warnings,
  };
}

// ── Result types returned by this service ─────────────────────────────────────

export interface KybVerificationResult {
  businessId: string;
  status: KybStatus;
  sosResult: SosVerificationResult;
  sanctionsResult: SanctionsScreeningOutput;
  /** Human-readable explanation of the outcome */
  summary: string;
  verifiedAt?: Date;
}

export interface KycVerificationResult {
  ownerId: string;
  businessId: string;
  status: KycStatus;
  sanctionsResult: SanctionsScreeningOutput;
  fraudResult: FraudDetectionOutput;
  /** Human-readable explanation of the outcome */
  summary: string;
  verifiedAt?: Date;
}

export interface VerificationStatusResult {
  businessId: string;
  kybStatus: KybStatus;
  kybVerifiedAt: Date | null;
  /** Whether this business is cleared to submit funding applications */
  readyForApplications: boolean;
  owners?: Array<{
    ownerId: string;
    fullName: string;
    ownershipPercent: string;
    isBeneficialOwner: boolean;
    kycStatus: KycStatus;
    kycVerifiedAt: Date | null;
  }>;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildOwnerFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`;
}

/** Persist a ComplianceCheck record for audit purposes */
async function persistComplianceCheck(params: {
  tenantId: string;
  businessId: string;
  checkType: 'kyb' | 'kyc';
  riskScore: number;
  riskLevel: string;
  findings: Record<string, unknown>;
}): Promise<void> {
  await prisma.complianceCheck.create({
    data: {
      tenantId: params.tenantId,
      businessId: params.businessId,
      checkType: params.checkType,
      riskScore: params.riskScore,
      riskLevel: params.riskLevel,
      findings: params.findings as Prisma.JsonObject,
    },
  });
}

// ── KYB Verification ──────────────────────────────────────────────────────────

/**
 * Performs full KYB verification for a business entity.
 *
 * Flow:
 *   1. Resolve business + assert it belongs to the tenant
 *   2. OFAC / sanctions screen on business name & EIN
 *   3. Secretary of State entity verification
 *   4. Persist compliance check record
 *   5. Update Business.status if KYB passes
 *   6. Publish KYB_VERIFIED event
 */
export async function verifyKyb(
  businessId: string,
  tenantId: string,
  request: KybVerificationRequest,
): Promise<KybVerificationResult> {
  // ── 1. Fetch business ───────────────────────────────────────
  const business = await prisma.business.findFirst({
    where: { id: businessId, tenantId },
  });

  if (!business) {
    throw new KybKycError(
      `Business ${businessId} not found for tenant ${tenantId}`,
      'BUSINESS_NOT_FOUND',
      404,
    );
  }

  // ── 2. Sanctions screening ──────────────────────────────────
  const sanctionsResult = await screenSanctions({
    name: request.legalName,
    country: request.registeredAddress.country,
    taxId: request.ein,
  });

  if (isHardOFACStop(sanctionsResult)) {
    // Persist the finding even on hard stop
    await persistComplianceCheck({
      tenantId,
      businessId,
      checkType: 'kyb',
      riskScore: 100,
      riskLevel: 'critical',
      findings: {
        step: 'sanctions_screening',
        sanctionsResult,
        halt: 'OFAC_HARD_MATCH',
      },
    });

    await prisma.business.update({
      where: { id: businessId },
      data: { status: 'onboarding' }, // freeze in onboarding — not active
    });

    return {
      businessId,
      status: 'sanctions_hold',
      sosResult: { verified: false, warnings: ['Verification halted due to OFAC match'] },
      sanctionsResult,
      summary:
        'KYB FAILED: Hard OFAC/sanctions match detected. This business cannot proceed. ' +
        'No override is permitted. Escalate to compliance officer.',
    };
  }

  // ── 3. Secretary of State verification ─────────────────────
  const sosResult = await verifyWithSecretaryOfState(
    request.legalName,
    request.ein,
    request.stateOfFormation,
    request.entityType,
  );

  // ── 4. Determine overall KYB status ────────────────────────
  let kybStatus: KybStatus;
  let riskScore: number;
  let riskLevel: string;
  let summary: string;
  let verifiedAt: Date | undefined;

  const requiresManualReview = sanctionsResult.requiresManualReview;

  if (!sosResult.verified) {
    kybStatus = 'failed';
    riskScore = 70;
    riskLevel = 'high';
    summary =
      `KYB FAILED: Secretary of State verification failed. ` +
      `Entity status: ${sosResult.entityStatus ?? 'unknown'}. ` +
      `Warnings: ${sosResult.warnings.join('; ') || 'none'}.`;
  } else if (requiresManualReview) {
    kybStatus = 'in_review';
    riskScore = 50;
    riskLevel = 'medium';
    summary =
      'KYB IN REVIEW: Secretary of State verification passed, but a possible sanctions match ' +
      'requires compliance officer review before the business is cleared.';
  } else {
    kybStatus = 'verified';
    riskScore = 10;
    riskLevel = 'low';
    verifiedAt = new Date();
    summary =
      `KYB VERIFIED: Entity "${request.legalName}" confirmed active in ${request.stateOfFormation}. ` +
      `SoS filing: ${sosResult.sosFilingNumber ?? 'N/A'}. No sanctions matches. ` +
      (sosResult.warnings.length > 0 ? `Warnings: ${sosResult.warnings.join('; ')}.` : '');
  }

  // ── 5. Persist compliance check ────────────────────────────
  await persistComplianceCheck({
    tenantId,
    businessId,
    checkType: 'kyb',
    riskScore,
    riskLevel,
    findings: {
      request: {
        legalName: request.legalName,
        ein: request.ein,
        entityType: request.entityType,
        stateOfFormation: request.stateOfFormation,
        dateOfFormation: request.dateOfFormation,
      },
      sosResult,
      sanctionsResult,
      status: kybStatus,
      summary,
    },
  });

  // ── 6. Update business record ───────────────────────────────
  const businessUpdateData: Prisma.BusinessUpdateInput = {
    ein: request.ein,
    entityType: request.entityType,
    stateOfFormation: request.stateOfFormation,
    dateOfFormation: new Date(request.dateOfFormation),
    dba: request.dba,
    mcc: request.mcc,
    industry: request.industry,
    ...(request.annualRevenueCents !== undefined && {
      annualRevenue: new Prisma.Decimal(request.annualRevenueCents / 100),
    }),
    // Advance status to 'onboarding' unless already further along
    ...(business.status === 'intake' && { status: 'onboarding' }),
  };

  await prisma.business.update({
    where: { id: businessId },
    data: businessUpdateData,
  });

  // ── 7. Publish event if fully verified ─────────────────────
  if (kybStatus === 'verified') {
    await eventBus.publishAndPersist(tenantId, {
      eventType: EVENT_TYPES.KYB_VERIFIED,
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId: businessId,
      payload: {
        businessId,
        legalName: request.legalName,
        ein: request.ein,
        stateOfFormation: request.stateOfFormation,
        sosFilingNumber: sosResult.sosFilingNumber,
        verifiedAt: verifiedAt!.toISOString(),
      },
      metadata: { tenantId, triggeredBy: 'kyb_verification_service' },
    });
  }

  return {
    businessId,
    status: kybStatus,
    sosResult,
    sanctionsResult,
    summary,
    verifiedAt,
  };
}

// ── KYC Verification ──────────────────────────────────────────────────────────

/**
 * Performs full KYC verification for an individual business owner.
 *
 * Rules enforced:
 *   - KYB must be verified before KYC is allowed
 *   - Only beneficial owners (>= 25% ownership) are required to go through KYC,
 *     but KYC can be run on any owner
 *   - OFAC hard match = sanctions_hold
 *   - Fraud high/critical = fraud_review (manual review required)
 *
 * Flow:
 *   1. Assert KYB is verified for the business
 *   2. Resolve BusinessOwner record
 *   3. OFAC / sanctions screen on owner name
 *   4. Fraud detection heuristics
 *   5. Persist compliance check
 *   6. Update BusinessOwner.kycStatus
 *   7. Publish KYC_VERIFIED event (if all beneficial owners are now verified)
 */
export async function verifyKyc(
  businessId: string,
  ownerId: string,
  tenantId: string,
  request: KycVerificationRequest,
): Promise<KycVerificationResult> {
  // ── 1. Assert KYB is verified ───────────────────────────────
  const business = await prisma.business.findFirst({
    where: { id: businessId, tenantId },
    include: { owners: true },
  });

  if (!business) {
    throw new KybKycError(
      `Business ${businessId} not found for tenant ${tenantId}`,
      'BUSINESS_NOT_FOUND',
      404,
    );
  }

  // Determine KYB status from latest compliance check
  const latestKybCheck = await prisma.complianceCheck.findFirst({
    where: { businessId, checkType: 'kyb' },
    orderBy: { createdAt: 'desc' },
  });

  const kybVerified =
    latestKybCheck !== null &&
    (latestKybCheck.findings as Record<string, unknown>)?.status === 'verified';

  if (!kybVerified) {
    throw new KybKycError(
      'KYB must be verified before KYC can be performed for any owner. ' +
        'Complete business entity verification first.',
      'KYB_NOT_VERIFIED',
      422,
    );
  }

  // ── 2. Resolve owner ────────────────────────────────────────
  const owner = business.owners.find((o) => o.id === ownerId);

  if (!owner) {
    throw new KybKycError(
      `Owner ${ownerId} not found on business ${businessId}`,
      'OWNER_NOT_FOUND',
      404,
    );
  }

  // ── 3. Sanctions screening ──────────────────────────────────
  const fullName = buildOwnerFullName(request.firstName, request.lastName);

  const sanctionsResult = await screenSanctions({
    name: fullName,
    country: request.address.country,
    dateOfBirth: request.dateOfBirth,
    taxId: request.ssn,
  });

  if (isHardOFACStop(sanctionsResult)) {
    await persistComplianceCheck({
      tenantId,
      businessId,
      checkType: 'kyc',
      riskScore: 100,
      riskLevel: 'critical',
      findings: {
        ownerId,
        ownerName: fullName,
        step: 'sanctions_screening',
        sanctionsResult,
        halt: 'OFAC_HARD_MATCH',
      },
    });

    await prisma.businessOwner.update({
      where: { id: ownerId },
      data: { kycStatus: 'sanctions_hold' },
    });

    return {
      ownerId,
      businessId,
      status: 'sanctions_hold',
      sanctionsResult,
      fraudResult: {
        riskScore: 0,
        disposition: 'low',
        signals: [],
        requiresManualReview: false,
        summary: 'Fraud check skipped — OFAC hard match was a prior hard stop.',
        evaluatedAt: new Date(),
      },
      summary:
        `KYC FAILED: Hard OFAC/sanctions match for owner "${fullName}". ` +
        'No override permitted. Escalate to compliance officer immediately.',
    };
  }

  // ── 4. Fraud detection ──────────────────────────────────────
  const fraudResult = await detectFraud({
    ssn: request.ssn,
    dateOfBirth: request.dateOfBirth,
    addressHistory: request.addressHistory,
    creditFileAgeMonths: request.creditData?.creditFileAgeMonths,
    tradelineCount: request.creditData?.tradelineCount,
    highestCreditLimit: request.creditData?.highestCreditLimit,
    totalUtilization: request.creditData?.totalUtilization,
    inquiriesLast6Mo: request.creditData?.inquiriesLast6Mo,
  });

  // ── 5. Determine KYC status ─────────────────────────────────
  let kycStatus: KycStatus;
  let riskScore: number;
  let riskLevel: string;
  let summary: string;
  let verifiedAt: Date | undefined;

  const possibleSanctionsMatch = sanctionsResult.result === 'possible_match';
  const fraudRequiresReview = fraudResult.requiresManualReview;

  if (possibleSanctionsMatch || fraudRequiresReview) {
    kycStatus = fraudResult.disposition === 'critical' ? 'fraud_review' : 'in_review';
    riskScore = Math.max(fraudResult.riskScore, possibleSanctionsMatch ? 50 : 0);
    riskLevel = riskScore >= 85 ? 'critical' : riskScore >= 60 ? 'high' : 'medium';
    summary =
      `KYC IN REVIEW for "${fullName}": ` +
      (possibleSanctionsMatch ? 'Possible sanctions match flagged for review. ' : '') +
      (fraudRequiresReview
        ? `Fraud signals detected (score ${fraudResult.riskScore}/100): ${fraudResult.summary}`
        : '');
  } else {
    kycStatus = 'verified';
    riskScore = Math.max(fraudResult.riskScore, 5);
    riskLevel = 'low';
    verifiedAt = new Date();
    summary =
      `KYC VERIFIED for "${fullName}". ` +
      'No sanctions matches and no significant fraud signals detected. ' +
      `Fraud risk score: ${fraudResult.riskScore}/100.`;
  }

  // ── 6. Persist compliance check ────────────────────────────
  await persistComplianceCheck({
    tenantId,
    businessId,
    checkType: 'kyc',
    riskScore,
    riskLevel,
    findings: {
      ownerId,
      ownerName: fullName,
      ownershipPercent: request.ownershipPercent,
      isBeneficialOwner: request.ownershipPercent >= 25,
      sanctionsResult,
      fraudResult,
      status: kycStatus,
      summary,
    },
  });

  // ── 7. Update BusinessOwner record ─────────────────────────
  await prisma.businessOwner.update({
    where: { id: ownerId },
    data: {
      firstName: request.firstName,
      lastName: request.lastName,
      ownershipPercent: new Prisma.Decimal(request.ownershipPercent),
      dateOfBirth: new Date(request.dateOfBirth),
      ssn: request.ssn, // In production this must be encrypted at rest
      address: request.address as Prisma.JsonObject,
      isBeneficialOwner: request.ownershipPercent >= 25,
      kycStatus,
      kycVerifiedAt: kycStatus === 'verified' ? verifiedAt : null,
    },
  });

  // ── 8. Check if all beneficial owners are now verified ─────
  if (kycStatus === 'verified') {
    await checkAndPublishAllOwnersVerified(businessId, tenantId, business.legalName);
  }

  return {
    ownerId,
    businessId,
    status: kycStatus,
    sanctionsResult,
    fraudResult,
    summary,
    verifiedAt,
  };
}

/**
 * After each individual KYC pass, re-check whether ALL beneficial owners
 * (>= 25% ownership) are now verified. If so, publish KYC_VERIFIED for
 * the business aggregate.
 */
async function checkAndPublishAllOwnersVerified(
  businessId: string,
  tenantId: string,
  businessLegalName: string,
): Promise<void> {
  const allOwners = await prisma.businessOwner.findMany({
    where: { businessId },
  });

  const beneficialOwners = allOwners.filter(
    (o) => parseFloat(o.ownershipPercent.toString()) >= 25,
  );

  if (beneficialOwners.length === 0) return;

  const allVerified = beneficialOwners.every((o) => o.kycStatus === 'verified');

  if (!allVerified) return;

  await eventBus.publishAndPersist(tenantId, {
    eventType: EVENT_TYPES.KYC_VERIFIED,
    aggregateType: AGGREGATE_TYPES.BUSINESS,
    aggregateId: businessId,
    payload: {
      businessId,
      businessLegalName,
      verifiedOwnerIds: beneficialOwners.map((o) => o.id),
      verifiedOwnerCount: beneficialOwners.length,
      verifiedAt: new Date().toISOString(),
    },
    metadata: {
      tenantId,
      triggeredBy: 'kyc_verification_service',
      note: 'All beneficial owners (>= 25% ownership) have passed KYC',
    },
  });
}

// ── Verification Status Query ─────────────────────────────────────────────────

/**
 * Returns the current KYB and KYC verification status for a business.
 * Used by the application submission guard to enforce KYB-first rule.
 */
export async function getVerificationStatus(
  businessId: string,
  tenantId: string,
  includeOwners = true,
): Promise<VerificationStatusResult> {
  const business = await prisma.business.findFirst({
    where: { id: businessId, tenantId },
    include: includeOwners ? { owners: true } : undefined,
  });

  if (!business) {
    throw new KybKycError(
      `Business ${businessId} not found for tenant ${tenantId}`,
      'BUSINESS_NOT_FOUND',
      404,
    );
  }

  // Determine KYB status from latest compliance check
  const latestKybCheck = await prisma.complianceCheck.findFirst({
    where: { businessId, checkType: 'kyb' },
    orderBy: { createdAt: 'desc' },
  });

  const kybFindings = latestKybCheck?.findings as Record<string, unknown> | null;
  const kybStatus: KybStatus = (kybFindings?.status as KybStatus) ?? 'pending';
  const kybVerifiedAt: Date | null =
    kybStatus === 'verified' ? (latestKybCheck?.createdAt ?? null) : null;

  // Map owners
  const owners = includeOwners && 'owners' in business
    ? business.owners.map((o) => ({
        ownerId: o.id,
        fullName: buildOwnerFullName(o.firstName, o.lastName),
        ownershipPercent: o.ownershipPercent.toString(),
        isBeneficialOwner: o.isBeneficialOwner,
        kycStatus: o.kycStatus as KycStatus,
        kycVerifiedAt: o.kycVerifiedAt,
      }))
    : undefined;

  // Business is ready for applications when:
  //   - KYB is verified
  //   - All beneficial owners have verified KYC
  const beneficialOwnerKycPending =
    owners !== undefined &&
    owners.some(
      (o) =>
        o.isBeneficialOwner &&
        parseFloat(o.ownershipPercent) >= 25 &&
        o.kycStatus !== 'verified',
    );

  const readyForApplications = kybStatus === 'verified' && !beneficialOwnerKycPending;

  return {
    businessId,
    kybStatus,
    kybVerifiedAt,
    readyForApplications,
    owners,
  };
}

// ── Class-based wrapper (test-friendly API) ───────────────────

/**
 * Class wrapper around the standalone KYB/KYC functions.
 * Accepts an injected PrismaClient so tests can pass a mock.
 */
export class KybKycService {
  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      setPrismaClient(prismaClient);
    }
  }

  async verifyKyb(input: {
    businessId: string;
    tenantId: string;
    legalName: string;
    ein: string;
    entityType: string;
    stateOfFormation: string;
    dateOfFormation?: string;
    mcc?: string;
    industry?: string;
  }): Promise<{
    status: string;
    riskLevel: string;
    businessId: string;
    summary: string;
  }> {
    const { businessId, tenantId, ...rest } = input;
    const request = {
      legalName: rest.legalName,
      ein: rest.ein,
      entityType: rest.entityType as 'llc' | 'corporation' | 'sole_proprietor' | 'partnership' | 's_corp' | 'c_corp',
      stateOfFormation: rest.stateOfFormation,
      dateOfFormation: rest.dateOfFormation ?? new Date().toISOString().split('T')[0]!,
      registeredAddress: {
        street: '123 Main St',
        city: 'Wilmington',
        state: rest.stateOfFormation,
        zip: '19801',
        country: 'US',
      },
      mcc: rest.mcc,
      industry: rest.industry,
    };
    const result = await verifyKyb(businessId, tenantId, request as Parameters<typeof verifyKyb>[2]);
    // Throw on OFAC/sanctions hard stop so callers can catch it
    if (result.status === 'sanctions_hold') {
      throw new KybKycError(
        result.summary,
        'OFAC_HARD_MATCH',
        422,
      );
    }
    // Map result: determine riskLevel based on status
    const riskLevelMap: Record<string, string> = {
      verified: 'low',
      in_review: 'medium',
      failed: 'high',
      sanctions_hold: 'critical',
      pending: 'low',
    };
    return {
      status: result.status,
      riskLevel: riskLevelMap[result.status] ?? 'low',
      businessId: result.businessId,
      summary: result.summary,
    };
  }

  async verifyKyc(input: {
    ownerId: string;
    businessId: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    ssn: string;
    dateOfBirth: string;
  }): Promise<{
    status: string;
    ownerId: string;
    businessId: string;
  }> {
    const { ownerId, businessId, tenantId, ...rest } = input;
    const request = {
      firstName: rest.firstName,
      lastName: rest.lastName,
      ownershipPercent: 100,
      ssn: rest.ssn,
      dateOfBirth: rest.dateOfBirth,
      address: {
        street: '123 Main St',
        city: 'Wilmington',
        state: 'DE',
        zip: '19801',
        country: 'US',
      },
    };
    const result = await verifyKyc(businessId, ownerId, tenantId, request as Parameters<typeof verifyKyc>[3]);
    return {
      status: result.status,
      ownerId: result.ownerId,
      businessId: result.businessId,
    };
  }
}
