// ============================================================
// CapitalForge — Referral & Affiliate Attribution Service
//
// Core responsibilities:
//   1. Referral source attribution (advisor / partner / client / channel)
//   2. Compliance-safe referral agreement generation
//   3. Referral fee calculation and payment tracking
//   4. Data-sharing consent management for partner data flows
//
// Fee calculation model:
//   Flat fee   — fixed dollar amount per qualified referral
//   Percentage — % of program fee or funded amount
//   Tiered     — escalating rate based on volume thresholds
//
// Attribution source types:
//   advisor | partner | client | organic | paid_search |
//   social | event | webinar | direct
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import logger from '../config/logger.js';

// ── Types ─────────────────────────────────────────────────────────

export type ReferralSourceType =
  | 'advisor'
  | 'partner'
  | 'client'
  | 'organic'
  | 'paid_search'
  | 'social'
  | 'event'
  | 'webinar'
  | 'direct';

export type ReferralFeeStatus =
  | 'pending'
  | 'approved'
  | 'paid'
  | 'declined'
  | 'clawback';

export type FeeStructureType = 'flat' | 'percentage' | 'tiered';

// ── Fee structures ────────────────────────────────────────────────

export interface FlatFeeStructure {
  type: 'flat';
  /** Amount in USD cents to avoid float rounding */
  amountCents: number;
}

export interface PercentageFeeStructure {
  type: 'percentage';
  /** Percentage of base amount, e.g. 5.0 = 5% */
  percentage: number;
  /** What the percentage applies to */
  basis: 'program_fee' | 'funded_amount' | 'first_year_revenue';
}

export interface TieredFeeStructure {
  type: 'tiered';
  tiers: Array<{
    minReferrals: number;
    maxReferrals: number | null;
    amountCents: number;
  }>;
}

export type FeeStructure = FlatFeeStructure | PercentageFeeStructure | TieredFeeStructure;

// ── Referral agreement ────────────────────────────────────────────

export interface ReferralAgreementClause {
  section: string;
  title: string;
  text: string;
}

export interface ReferralAgreement {
  agreementId: string;
  tenantId: string;
  partnerId?: string;
  sourceType: ReferralSourceType;
  version: string;
  generatedAt: Date;
  clauses: ReferralAgreementClause[];
  /** Summary of fee terms for disclosure purposes */
  feeDisclosure: string;
  /** Whether this agreement has been countersigned */
  executed: boolean;
}

// ── Attribution result ────────────────────────────────────────────

export interface ReferralAttributionResult {
  attributionId: string;
  tenantId: string;
  businessId: string;
  sourceType: ReferralSourceType;
  sourceId: string | null;
  partnerId: string | null;
  channel: string | null;
  feeAmount: number | null;      // USD dollars (decimal)
  feeStatus: ReferralFeeStatus;
  consentDocId: string | null;
  createdAt: Date;
}

// ── Fee calculation ───────────────────────────────────────────────

export interface FeeCalculationInput {
  structure: FeeStructure;
  /** USD dollars — program fee charged to business */
  programFeeDollars?: number;
  /** USD dollars — total funded amount */
  fundedAmountDollars?: number;
  /** USD dollars — projected first-year revenue */
  firstYearRevenueDollars?: number;
  /** Number of referrals in current period (for tiered) */
  referralCountThisPeriod?: number;
}

export interface FeeCalculationResult {
  feeStructureType: FeeStructureType;
  calculatedFeeDollars: number;
  basis: string;
  breakdown: string;
}

// ── Consent management ────────────────────────────────────────────

export interface ReferralConsentInput {
  tenantId: string;
  businessId: string;
  partnerId: string;
  /** What data categories are being shared */
  dataCategories: string[];
  /** The consent evidence reference (e.g. signed doc ID, call recording ID) */
  evidenceRef: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface ReferralConsentRecord {
  consentId: string;
  tenantId: string;
  businessId: string;
  partnerId: string;
  dataCategories: string[];
  status: 'active' | 'revoked';
  evidenceRef: string;
  grantedAt: Date;
  revokedAt: Date | null;
}

// ── Inputs ────────────────────────────────────────────────────────

export interface CreateAttributionInput {
  tenantId: string;
  businessId: string;
  sourceType: ReferralSourceType;
  sourceId?: string;
  partnerId?: string;
  channel?: string;
  feeStructure?: FeeStructure;
  programFeeDollars?: number;
  fundedAmountDollars?: number;
  referralCountThisPeriod?: number;
  consentDocId?: string;
}

// ── Compliance-safe agreement template ───────────────────────────

const AGREEMENT_VERSION = '1.0';

/** Build a compliance-safe referral agreement with required clauses. */
export function generateReferralAgreement(params: {
  tenantId: string;
  partnerId?: string;
  partnerName: string;
  sourceType: ReferralSourceType;
  feeStructure: FeeStructure;
  stateOfOperation?: string;
}): ReferralAgreement {
  const { tenantId, partnerId, partnerName, sourceType, feeStructure, stateOfOperation } = params;

  const feeDisclosure = buildFeeDisclosure(feeStructure);

  const clauses: ReferralAgreementClause[] = [
    {
      section: '1',
      title: 'Scope of Referral Relationship',
      text:
        `This Referral Agreement ("Agreement") establishes the terms under which ${partnerName} ` +
        '("Referring Party") may introduce prospective clients to CapitalForge ("Company"). ' +
        'The Referring Party acts solely as an independent referral source and does not represent, ' +
        'advise, or act as agent for the Company or any financial institution.',
    },
    {
      section: '2',
      title: 'No Financial Advice; Independent Status',
      text:
        'The Referring Party shall not provide financial, credit, or investment advice to referred ' +
        'clients on behalf of the Company. The Referring Party is an independent contractor and not ' +
        'an employee, joint-venture partner, or franchise of the Company. Nothing herein creates ' +
        'an agency relationship.',
    },
    {
      section: '3',
      title: 'Prohibited Representations',
      text:
        'The Referring Party shall not: (a) guarantee approval or specific credit outcomes; ' +
        '(b) claim government affiliation or SBA endorsement; (c) represent fee waivers that ' +
        'are not authorised in writing; (d) make income or revenue projections; or ' +
        '(e) misrepresent the nature, cost, or terms of any financial product offered by the Company.',
    },
    {
      section: '4',
      title: 'Referral Fee Structure and Disclosure',
      text:
        `Compensation for qualified referrals shall be as follows: ${feeDisclosure}. ` +
        'Fees are earned only upon successful onboarding of the referred client and receipt of ' +
        'program fees by the Company. The Referring Party acknowledges that fee disclosure to ' +
        'referred clients is required under applicable state law where mandated.',
    },
    {
      section: '5',
      title: 'Data Sharing and Privacy',
      text:
        'The Referring Party shall obtain documented consent from each referred client before ' +
        'sharing personally identifiable information, financial data, or contact information with ' +
        'the Company. Such consent shall comply with applicable federal and state privacy laws ' +
        'including the Gramm-Leach-Bliley Act (GLBA). The Company will process shared data ' +
        'solely for the purpose of evaluating and onboarding the referred client.',
    },
    {
      section: '6',
      title: 'Compliance with Applicable Law',
      text:
        `The Referring Party shall comply with all applicable federal, state${stateOfOperation ? ` (including ${stateOfOperation})` : ''}, ` +
        'and local laws governing commercial loan brokering, referral arrangements, and financial ' +
        'services marketing. Where a state commercial financing broker registration or license is ' +
        'required, the Referring Party represents it holds such credentials and will provide ' +
        'evidence upon request.',
    },
    {
      section: '7',
      title: 'Record-Keeping and Audit Rights',
      text:
        'The Referring Party shall maintain records of each referral, consent obtained, and ' +
        'communications with referred clients for a minimum of five (5) years. The Company ' +
        'reserves the right to audit referral records upon reasonable notice to verify ' +
        'compliance with this Agreement.',
    },
    {
      section: '8',
      title: 'Termination',
      text:
        'Either party may terminate this Agreement with thirty (30) days written notice. ' +
        'The Company may terminate immediately upon material breach, regulatory action, or ' +
        'finding of misrepresentation. Earned fees for referrals completed prior to termination ' +
        'remain payable subject to clawback provisions.',
    },
    {
      section: '9',
      title: 'Clawback',
      text:
        'Referral fees are subject to clawback if: (a) the referred client is determined to have ' +
        'been referred via prohibited representations; (b) the referred client reverses or cancels ' +
        'within 60 days; or (c) the Referring Party is found to have violated any provision ' +
        'of this Agreement.',
    },
    {
      section: '10',
      title: 'Entire Agreement',
      text:
        'This Agreement constitutes the entire understanding between the parties regarding ' +
        'the referral relationship and supersedes any prior representations, negotiations, or ' +
        'understandings. Amendments must be in writing and signed by both parties.',
    },
  ];

  return {
    agreementId: uuidv4(),
    tenantId,
    partnerId,
    sourceType,
    version: AGREEMENT_VERSION,
    generatedAt: new Date(),
    clauses,
    feeDisclosure,
    executed: false,
  };
}

// ── Fee calculation ───────────────────────────────────────────────

/** Calculate a referral fee from a fee structure and deal parameters. */
export function calculateReferralFee(input: FeeCalculationInput): FeeCalculationResult {
  const { structure } = input;

  if (structure.type === 'flat') {
    const dollars = structure.amountCents / 100;
    return {
      feeStructureType: 'flat',
      calculatedFeeDollars: dollars,
      basis: 'flat fee',
      breakdown: `Flat referral fee of $${dollars.toFixed(2)}`,
    };
  }

  if (structure.type === 'percentage') {
    let baseDollars = 0;
    let basisLabel = '';

    if (structure.basis === 'program_fee') {
      baseDollars = input.programFeeDollars ?? 0;
      basisLabel = 'program fee';
    } else if (structure.basis === 'funded_amount') {
      baseDollars = input.fundedAmountDollars ?? 0;
      basisLabel = 'funded amount';
    } else {
      baseDollars = input.firstYearRevenueDollars ?? 0;
      basisLabel = 'first-year revenue';
    }

    const fee = (baseDollars * structure.percentage) / 100;
    return {
      feeStructureType: 'percentage',
      calculatedFeeDollars: Math.round(fee * 100) / 100,
      basis: basisLabel,
      breakdown:
        `${structure.percentage}% of ${basisLabel} ($${baseDollars.toFixed(2)}) = $${fee.toFixed(2)}`,
    };
  }

  // Tiered
  const count = input.referralCountThisPeriod ?? 1;
  const matchedTier = structure.tiers.find(
    (t) => count >= t.minReferrals && (t.maxReferrals === null || count <= t.maxReferrals),
  );

  if (!matchedTier) {
    return {
      feeStructureType: 'tiered',
      calculatedFeeDollars: 0,
      basis: 'tiered',
      breakdown: 'No matching tier found for current referral count',
    };
  }

  const dollars = matchedTier.amountCents / 100;
  return {
    feeStructureType: 'tiered',
    calculatedFeeDollars: dollars,
    basis: 'tiered',
    breakdown:
      `Tier matched for ${count} referral(s) (min ${matchedTier.minReferrals} / ` +
      `max ${matchedTier.maxReferrals ?? '∞'}): $${dollars.toFixed(2)} per referral`,
  };
}

/** Build a plain-language fee disclosure string. */
function buildFeeDisclosure(structure: FeeStructure): string {
  if (structure.type === 'flat') {
    return `Flat fee of $${(structure.amountCents / 100).toFixed(2)} per qualified referral`;
  }
  if (structure.type === 'percentage') {
    return `${structure.percentage}% of the ${structure.basis.replace(/_/g, ' ')} for each qualified referral`;
  }
  const tierDescriptions = structure.tiers
    .map(
      (t) =>
        `$${(t.amountCents / 100).toFixed(2)} per referral for ` +
        `${t.minReferrals}–${t.maxReferrals ?? '∞'} referrals`,
    )
    .join('; ');
  return `Tiered fee structure: ${tierDescriptions}`;
}

// ── Analytics helpers ─────────────────────────────────────────────

export interface ReferralAnalytics {
  tenantId: string;
  totalAttributions: number;
  bySource: Record<string, number>;
  totalFeePending: number;
  totalFeePaid: number;
  conversionRate: number;
  period: { from: Date; to: Date };
}

// ── ReferralService ───────────────────────────────────────────────

export class ReferralService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Create attribution ────────────────────────────────────────

  /**
   * Record a referral attribution for a business.
   * Optionally calculates and stores the referral fee.
   */
  async createAttribution(input: CreateAttributionInput): Promise<ReferralAttributionResult> {
    const attributionId = uuidv4();

    let feeAmount: number | null = null;

    if (input.feeStructure) {
      const calc = calculateReferralFee({
        structure:                 input.feeStructure,
        programFeeDollars:         input.programFeeDollars,
        fundedAmountDollars:       input.fundedAmountDollars,
        referralCountThisPeriod:   input.referralCountThisPeriod,
      });
      feeAmount = calc.calculatedFeeDollars;
    }

    await this.prisma.referralAttribution.create({
      data: {
        id:          attributionId,
        tenantId:    input.tenantId,
        businessId:  input.businessId,
        sourceType:  input.sourceType,
        sourceId:    input.sourceId   ?? null,
        partnerId:   input.partnerId  ?? null,
        channel:     input.channel    ?? null,
        feeAmount:   feeAmount !== null ? feeAmount : undefined,
        feeStatus:   'pending',
        consentDocId: input.consentDocId ?? null,
      },
    });

    await eventBus.publish(input.tenantId, {
      eventType:     'referral.attribution.created',
      aggregateType: 'referral',
      aggregateId:   attributionId,
      payload: {
        businessId:  input.businessId,
        sourceType:  input.sourceType,
        partnerId:   input.partnerId ?? null,
        feeAmount,
      },
    });

    logger.info('Referral attribution created', {
      attributionId,
      tenantId: input.tenantId,
      businessId: input.businessId,
      sourceType: input.sourceType,
    });

    return {
      attributionId,
      tenantId:    input.tenantId,
      businessId:  input.businessId,
      sourceType:  input.sourceType,
      sourceId:    input.sourceId   ?? null,
      partnerId:   input.partnerId  ?? null,
      channel:     input.channel    ?? null,
      feeAmount,
      feeStatus:   'pending',
      consentDocId: input.consentDocId ?? null,
      createdAt:   new Date(),
    };
  }

  // ── List attributions for a business ─────────────────────────

  async listAttributions(businessId: string, tenantId: string) {
    return this.prisma.referralAttribution.findMany({
      where: { businessId, tenantId },
      orderBy: { createdAt: 'desc' },
      include: { partner: true },
    });
  }

  // ── Update fee status ─────────────────────────────────────────

  async updateFeeStatus(
    attributionId: string,
    tenantId: string,
    status: ReferralFeeStatus,
  ): Promise<boolean> {
    const existing = await this.prisma.referralAttribution.findFirst({
      where: { id: attributionId, tenantId },
    });
    if (!existing) return false;

    await this.prisma.referralAttribution.update({
      where: { id: attributionId },
      data: {
        feeStatus: status,
        paidAt:    status === 'paid' ? new Date() : undefined,
      },
    });

    await eventBus.publish(tenantId, {
      eventType:     'referral.fee.status_updated',
      aggregateType: 'referral',
      aggregateId:   attributionId,
      payload: { attributionId, status },
    });

    return true;
  }

  // ── Generate referral agreement ───────────────────────────────

  generateAgreement(params: {
    tenantId: string;
    partnerId?: string;
    partnerName: string;
    sourceType: ReferralSourceType;
    feeStructure: FeeStructure;
    stateOfOperation?: string;
  }): ReferralAgreement {
    return generateReferralAgreement(params);
  }

  // ── Consent management ────────────────────────────────────────

  /**
   * Record data-sharing consent for a referral partner data flow.
   * Persists to ConsentRecord with channel=partner and type=referral.
   */
  async captureConsent(input: ReferralConsentInput): Promise<ReferralConsentRecord> {
    const consentId = uuidv4();

    await this.prisma.consentRecord.create({
      data: {
        id:          consentId,
        tenantId:    input.tenantId,
        businessId:  input.businessId,
        channel:     'partner',
        consentType: 'referral',
        status:      'active',
        grantedAt:   new Date(),
        evidenceRef: input.evidenceRef,
        ipAddress:   input.ipAddress ?? null,
        metadata: {
          partnerId:      input.partnerId,
          dataCategories: input.dataCategories,
          ...(input.metadata ?? {}),
        } as object,
      },
    });

    await eventBus.publish(input.tenantId, {
      eventType:     'consent.captured',
      aggregateType: 'consent',
      aggregateId:   consentId,
      payload: {
        businessId:     input.businessId,
        partnerId:      input.partnerId,
        consentType:    'referral',
        dataCategories: input.dataCategories,
      },
    });

    logger.info('Referral consent captured', {
      consentId,
      tenantId:   input.tenantId,
      businessId: input.businessId,
      partnerId:  input.partnerId,
    });

    return {
      consentId,
      tenantId:       input.tenantId,
      businessId:     input.businessId,
      partnerId:      input.partnerId,
      dataCategories: input.dataCategories,
      status:         'active',
      evidenceRef:    input.evidenceRef,
      grantedAt:      new Date(),
      revokedAt:      null,
    };
  }

  /**
   * Revoke data-sharing consent for a referral partner data flow.
   */
  async revokeConsent(
    consentId: string,
    tenantId: string,
    reason: string,
  ): Promise<boolean> {
    const existing = await this.prisma.consentRecord.findFirst({
      where: { id: consentId, tenantId, consentType: 'referral' },
    });
    if (!existing) return false;

    await this.prisma.consentRecord.update({
      where: { id: consentId },
      data: {
        status:           'revoked',
        revokedAt:        new Date(),
        revocationReason: reason,
      },
    });

    await eventBus.publish(tenantId, {
      eventType:     'consent.revoked',
      aggregateType: 'consent',
      aggregateId:   consentId,
      payload: { consentId, reason },
    });

    return true;
  }

  /**
   * Retrieve active consent records for a business-partner pair.
   */
  async getActiveConsents(businessId: string, partnerId: string, tenantId: string) {
    return this.prisma.consentRecord.findMany({
      where: {
        tenantId,
        businessId,
        consentType: 'referral',
        status:      'active',
        metadata:    { path: ['partnerId'], equals: partnerId },
      },
    });
  }

  // ── Analytics ─────────────────────────────────────────────────

  /**
   * Compute referral analytics for a tenant over a date range.
   */
  async getAnalytics(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<ReferralAnalytics> {
    const attributions = await this.prisma.referralAttribution.findMany({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
      },
    });

    const bySource: Record<string, number> = {};
    let totalFeePending = 0;
    let totalFeePaid = 0;

    for (const a of attributions) {
      bySource[a.sourceType] = (bySource[a.sourceType] ?? 0) + 1;
      const fee = a.feeAmount ? Number(a.feeAmount) : 0;
      if (a.feeStatus === 'pending' || a.feeStatus === 'approved') totalFeePending += fee;
      if (a.feeStatus === 'paid') totalFeePaid += fee;
    }

    const totalBusinesses = await this.prisma.business.count({
      where: { tenantId, createdAt: { gte: from, lte: to } },
    });

    const conversionRate =
      totalBusinesses > 0 ? attributions.length / totalBusinesses : 0;

    return {
      tenantId,
      totalAttributions: attributions.length,
      bySource,
      totalFeePending: Math.round(totalFeePending * 100) / 100,
      totalFeePaid:    Math.round(totalFeePaid * 100) / 100,
      conversionRate:  Math.round(conversionRate * 10000) / 10000,
      period: { from, to },
    };
  }
}
