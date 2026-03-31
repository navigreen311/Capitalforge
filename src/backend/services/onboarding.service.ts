// ============================================================
// CapitalForge Onboarding Service
//
// Responsibilities:
//   - Business creation (with MCC classification & readiness scoring)
//   - Business owner addition
//   - EIN lookup (stub — wire to IRS TIN-match API in production)
//   - MCC classification helper
//   - Funding readiness score calculation & persistence
// ============================================================

import { PrismaClient, type Business, type BusinessOwner } from '@prisma/client';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../../shared/constants/index.js';
import { eventBus } from '../events/event-bus.js';
import {
  calculateFundingReadiness,
  type FundingReadinessInput,
  type FundingReadinessResult,
} from './funding-readiness.js';
import type {
  CreateBusinessInput,
  UpdateBusinessInput,
  CreateOwnerInput,
} from '../../shared/validators/business.validators.js';

// ── Prisma singleton ──────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

// Allow injection for tests
export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── MCC Classification ────────────────────────────────────────

/**
 * Industry → MCC mapping table (abbreviated).
 * In production this would be a full 700+ entry dataset.
 */
const INDUSTRY_TO_MCC: Record<string, string> = {
  'restaurant':              '5812',
  'food service':            '5812',
  'retail':                  '5999',
  'clothing':                '5621',
  'apparel':                 '5621',
  'grocery':                 '5411',
  'supermarket':             '5411',
  'gas station':             '5541',
  'fuel':                    '5541',
  'hotel':                   '7011',
  'lodging':                 '7011',
  'travel':                  '4722',
  'airline':                 '4511',
  'healthcare':              '8099',
  'medical':                 '8049',
  'dental':                  '8021',
  'pharmacy':                '5912',
  'software':                '7372',
  'technology':              '7372',
  'it services':             '7374',
  'consulting':              '7389',
  'accounting':              '8931',
  'legal':                   '8111',
  'law':                     '8111',
  'real estate':             '6552',
  'construction':            '1731',
  'contractor':              '1711',
  'plumbing':                '1711',
  'electrical':              '1731',
  'auto repair':             '7538',
  'auto dealer':             '5511',
  'insurance':               '6411',
  'financial services':      '6199',
  'beauty salon':            '7230',
  'hair':                    '7230',
  'gym':                     '7941',
  'fitness':                 '7941',
  'trucking':                '4213',
  'logistics':               '4215',
  'cleaning':                '7349',
  'janitorial':              '7349',
  'photography':             '7221',
  'marketing':               '7311',
  'advertising':             '7311',
  'education':               '8299',
  'childcare':               '8351',
  'daycare':                 '8351',
  'pet':                     '5995',
  'veterinary':              '0742',
};

/**
 * Classify an industry string into an ISO 18245 MCC.
 * Returns null if no confident match is found.
 */
export function classifyMcc(industry: string): string | null {
  if (!industry) return null;
  const lower = industry.toLowerCase();

  for (const [keyword, mcc] of Object.entries(INDUSTRY_TO_MCC)) {
    if (lower.includes(keyword)) return mcc;
  }
  return null;
}

// ── EIN Lookup (stub) ─────────────────────────────────────────

export interface EinLookupResult {
  valid: boolean;
  /** Normalised XX-XXXXXXX form */
  normalised: string | null;
  /** Registered legal name from IRS (stub always returns null) */
  registeredName: string | null;
  source: 'irs_tin_match' | 'format_only';
}

/**
 * EIN lookup stub.
 *
 * In production, integrate with:
 *   - IRS TIN Matching API (bulk or interactive)
 *   - Middesk or Stripe Identity for KYB verification
 *
 * Currently performs format validation only.
 */
export async function lookupEin(rawEin: string): Promise<EinLookupResult> {
  const digits = rawEin.replace(/[^0-9]/g, '');

  if (digits.length !== 9) {
    return { valid: false, normalised: null, registeredName: null, source: 'format_only' };
  }

  // Reject obvious invalid prefixes (00, 07-09, 17, 18, 19, 28, 29, 49, 69, 70, 78, 79, 89)
  const prefix = parseInt(digits.slice(0, 2), 10);
  const INVALID_PREFIXES = new Set([0, 7, 8, 9, 17, 18, 19, 28, 29, 49, 69, 70, 78, 79, 89]);
  if (INVALID_PREFIXES.has(prefix)) {
    return { valid: false, normalised: null, registeredName: null, source: 'format_only' };
  }

  const normalised = `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return { valid: true, normalised, registeredName: null, source: 'format_only' };
}

// ── Business operations ───────────────────────────────────────

export interface CreateBusinessResult {
  business: Business;
  readiness: FundingReadinessResult;
}

/**
 * Create a new business record, compute its initial funding readiness score,
 * and publish a BUSINESS_CREATED event to the event bus.
 */
export async function createBusiness(
  tenantId: string,
  input: CreateBusinessInput,
): Promise<CreateBusinessResult> {
  const prisma = getPrisma();

  // MCC classification — use provided MCC or auto-classify from industry
  const mcc = input.mcc ?? (input.industry ? classifyMcc(input.industry) : null) ?? undefined;

  // Normalise EIN if provided
  let normalizedEin: string | undefined;
  if (input.ein) {
    const lookup = await lookupEin(input.ein);
    normalizedEin = lookup.normalised ?? undefined;
  }

  // Compute initial funding readiness score
  const readinessInput: FundingReadinessInput = {
    annualRevenue:    input.annualRevenue != null ? Number(input.annualRevenue) : null,
    monthlyRevenue:   input.monthlyRevenue != null ? Number(input.monthlyRevenue) : null,
    dateOfFormation:  input.dateOfFormation,
    mcc:              mcc ?? null,
    industry:         input.industry ?? null,
    // No credit or debt data at creation time — owners added separately
    personalCreditScore: null,
    businessCreditScore: null,
    existingDebtBalance: null,
  };

  const readiness = calculateFundingReadiness(readinessInput);

  const business = await prisma.business.create({
    data: {
      tenantId,
      legalName:        input.legalName,
      dba:              input.dba,
      ein:              normalizedEin,
      entityType:       input.entityType,
      stateOfFormation: input.stateOfFormation,
      dateOfFormation:  input.dateOfFormation,
      industry:         input.industry,
      mcc:              mcc,
      annualRevenue:    input.annualRevenue != null ? input.annualRevenue : undefined,
      monthlyRevenue:   input.monthlyRevenue != null ? input.monthlyRevenue : undefined,
      fundingReadinessScore: readiness.score,
      advisorId:        input.advisorId,
      status:           'intake',
    },
  });

  // Publish BUSINESS_CREATED event to canonical ledger
  await eventBus.publishAndPersist(tenantId, {
    eventType:     EVENT_TYPES.BUSINESS_CREATED,
    aggregateType: AGGREGATE_TYPES.BUSINESS,
    aggregateId:   business.id,
    payload: {
      businessId:           business.id,
      legalName:            business.legalName,
      entityType:           business.entityType,
      fundingReadinessScore: readiness.score,
      fundingTrack:         readiness.track,
    },
    metadata: {
      advisorId: input.advisorId ?? null,
    },
  });

  return { business, readiness };
}

/**
 * Retrieve a single business by ID, scoped to the given tenant.
 * Returns null if not found or belongs to a different tenant.
 */
export async function getBusinessById(
  tenantId: string,
  businessId: string,
): Promise<Business | null> {
  const prisma = getPrisma();

  return prisma.business.findFirst({
    where: { id: businessId, tenantId },
  });
}

/**
 * Update a business's profile fields.
 * Recalculates funding readiness score if financial or formation fields change.
 */
export async function updateBusiness(
  tenantId: string,
  businessId: string,
  input: UpdateBusinessInput,
): Promise<Business | null> {
  const prisma = getPrisma();

  const existing = await prisma.business.findFirst({ where: { id: businessId, tenantId } });
  if (!existing) return null;

  // Determine if readiness-relevant fields are changing
  const recomputeReadiness =
    input.annualRevenue !== undefined ||
    input.monthlyRevenue !== undefined ||
    input.dateOfFormation !== undefined ||
    input.mcc !== undefined ||
    input.industry !== undefined;

  let newScore: number | undefined;
  if (recomputeReadiness) {
    // Re-classify MCC if industry changed
    const newMcc =
      input.mcc ??
      (input.industry ? classifyMcc(input.industry) : null) ??
      existing.mcc ??
      undefined;

    const readinessInput: FundingReadinessInput = {
      annualRevenue:
        input.annualRevenue != null
          ? Number(input.annualRevenue)
          : existing.annualRevenue != null
            ? Number(existing.annualRevenue)
            : null,
      monthlyRevenue:
        input.monthlyRevenue != null
          ? Number(input.monthlyRevenue)
          : existing.monthlyRevenue != null
            ? Number(existing.monthlyRevenue)
            : null,
      dateOfFormation:
        input.dateOfFormation ?? existing.dateOfFormation ?? null,
      mcc:      newMcc ?? null,
      industry: input.industry ?? existing.industry ?? null,
    };

    newScore = calculateFundingReadiness(readinessInput).score;
  }

  // MCC auto-classification on industry update
  const mcc =
    input.mcc ??
    (input.industry ? classifyMcc(input.industry) ?? undefined : undefined);

  // Normalise EIN if provided in update
  let normalizedEin: string | undefined;
  if (input.ein) {
    const lookup = await lookupEin(input.ein);
    normalizedEin = lookup.normalised ?? undefined;
  }

  return prisma.business.update({
    where: { id: businessId },
    data: {
      ...(input.legalName        !== undefined && { legalName: input.legalName }),
      ...(input.dba              !== undefined && { dba: input.dba }),
      ...(normalizedEin          !== undefined && { ein: normalizedEin }),
      ...(input.entityType       !== undefined && { entityType: input.entityType }),
      ...(input.stateOfFormation !== undefined && { stateOfFormation: input.stateOfFormation }),
      ...(input.dateOfFormation  !== undefined && { dateOfFormation: input.dateOfFormation }),
      ...(input.industry         !== undefined && { industry: input.industry }),
      ...(mcc                    !== undefined && { mcc }),
      ...(input.annualRevenue    !== undefined && { annualRevenue: input.annualRevenue }),
      ...(input.monthlyRevenue   !== undefined && { monthlyRevenue: input.monthlyRevenue }),
      ...(input.status           !== undefined && { status: input.status }),
      ...(newScore               !== undefined && { fundingReadinessScore: newScore }),
    },
  });
}

// ── Owner operations ──────────────────────────────────────────

export interface AddOwnerResult {
  owner: BusinessOwner;
  updatedReadiness?: FundingReadinessResult;
}

/**
 * Add a beneficial owner to a business.
 * If personalCreditScore is passed through metadata (future: from credit pull),
 * the readiness score is recalculated and persisted.
 */
export async function addOwner(
  tenantId: string,
  businessId: string,
  input: CreateOwnerInput,
  /** Optional: personal credit score obtained from a prior credit pull */
  personalCreditScore?: number,
): Promise<AddOwnerResult> {
  const prisma = getPrisma();

  const business = await prisma.business.findFirst({ where: { id: businessId, tenantId } });
  if (!business) {
    throw new Error(`Business ${businessId} not found for tenant ${tenantId}`);
  }

  const owner = await prisma.businessOwner.create({
    data: {
      businessId,
      firstName:        input.firstName,
      lastName:         input.lastName,
      ownershipPercent: input.ownershipPercent,
      ssn:              input.ssn,
      dateOfBirth:      input.dateOfBirth,
      address:          input.address as Record<string, unknown> | undefined,
      isBeneficialOwner: input.isBeneficialOwner,
      kycStatus:        'pending',
    },
  });

  // Recalculate readiness if we have a credit score for this owner
  let updatedReadiness: FundingReadinessResult | undefined;
  if (personalCreditScore !== undefined) {
    const readinessInput: FundingReadinessInput = {
      annualRevenue:      business.annualRevenue != null ? Number(business.annualRevenue) : null,
      monthlyRevenue:     business.monthlyRevenue != null ? Number(business.monthlyRevenue) : null,
      dateOfFormation:    business.dateOfFormation,
      mcc:                business.mcc,
      industry:           business.industry,
      personalCreditScore,
    };
    updatedReadiness = calculateFundingReadiness(readinessInput);
    await prisma.business.update({
      where: { id: businessId },
      data:  { fundingReadinessScore: updatedReadiness.score },
    });
  }

  return { owner, updatedReadiness };
}

/**
 * Refresh the funding readiness score for an existing business.
 * Useful after credit pulls, revenue updates, or debt payoffs.
 */
export async function refreshReadinessScore(
  tenantId: string,
  businessId: string,
  overrides?: Partial<FundingReadinessInput>,
): Promise<FundingReadinessResult> {
  const prisma = getPrisma();

  const business = await prisma.business.findFirst({ where: { id: businessId, tenantId } });
  if (!business) {
    throw new Error(`Business ${businessId} not found for tenant ${tenantId}`);
  }

  const readinessInput: FundingReadinessInput = {
    annualRevenue:   business.annualRevenue != null ? Number(business.annualRevenue) : null,
    monthlyRevenue:  business.monthlyRevenue != null ? Number(business.monthlyRevenue) : null,
    dateOfFormation: business.dateOfFormation,
    mcc:             business.mcc,
    industry:        business.industry,
    ...overrides,
  };

  const readiness = calculateFundingReadiness(readinessInput);

  await prisma.business.update({
    where: { id: businessId },
    data:  { fundingReadinessScore: readiness.score },
  });

  return readiness;
}

// ── Class-based wrapper (test-friendly API) ───────────────────

/**
 * Class wrapper around the standalone onboarding functions.
 * Accepts an injected PrismaClient so tests can pass a mock.
 */
export class OnboardingService {
  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      setPrismaClient(prismaClient);
    }
  }

  async createBusiness(input: {
    tenantId: string;
    advisorId?: string;
    legalName: string;
    ein?: string;
    entityType: string;
    stateOfFormation?: string;
    industry?: string;
    annualRevenue?: number;
    monthlyRevenue?: number;
    mcc?: string;
  }) {
    const { tenantId, ...rest } = input;
    const result = await createBusiness(tenantId, rest as Parameters<typeof createBusiness>[1]);
    return result.business;
  }

  async addOwner(input: {
    businessId: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    ssn?: string;
    ownershipPercent: number;
    isBeneficialOwner?: boolean;
  }) {
    const { tenantId, businessId, ...rest } = input;
    const result = await addOwner(tenantId, businessId, rest as Parameters<typeof addOwner>[2]);
    await eventBus.publishAndPersist(tenantId, {
      eventType: 'owner.added',
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId: businessId,
      payload: {
        ownerId: result.owner.id,
        businessId,
        firstName: result.owner.firstName,
        lastName: result.owner.lastName,
        isBeneficialOwner: result.owner.isBeneficialOwner,
      },
    });
    return result.owner;
  }
}
