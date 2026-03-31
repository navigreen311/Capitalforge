// ============================================================
// CapitalForge — Compliance & Risk Service
//
// Core responsibilities:
//   1. UDAP/UDAAP risk scoring for client interactions
//   2. 10-category risk register scoring per deal
//   3. State law compliance checks
//   4. Vendor enforcement history lookups
//   5. Persist ComplianceCheck records and emit ledger events
//
// Risk Register Categories (10):
//   1.  Credit / Cash-Flow Risk
//   2.  Pricing / Hidden-Cost Risk
//   3.  Operational Risk
//   4.  Representation / Fraud Risk
//   5.  Network / Issuer Rule Risk
//   6.  Chargeback Risk
//   7.  Regulatory / UDAAP Risk
//   8.  Reputational Risk
//   9.  Tax / Accounting Risk
//   10. AML / KYC Risk
//
// Overall risk score = weighted average of 10 category scores.
// Mapped to RiskLevel: low (1-30), medium (31-55), high (56-75),
//                      critical (76-100).
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import type { RiskLevel, ComplianceCheckType } from '@shared/types/index.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import { eventBus } from '../events/event-bus.js';
import { scoreUdapRisk } from './udap-scorer.js';
import {
  getStateLawProfile,
  getRequiredDisclosures,
  getComplianceSteps,
} from './state-law-mapper.js';
import type { UdapScorerInput, UdapScorerOutput } from './udap-scorer.js';
import type { StateLawProfile } from './state-law-mapper.js';

// ── Risk register ─────────────────────────────────────────────────

export type RiskCategory =
  | 'credit_cash_flow'
  | 'pricing_hidden_cost'
  | 'operational'
  | 'representation_fraud'
  | 'network_issuer_rule'
  | 'chargeback'
  | 'regulatory_udaap'
  | 'reputational'
  | 'tax_accounting'
  | 'aml_kyc';

export interface CategoryScore {
  category: RiskCategory;
  /** 1–10 raw score */
  score: number;
  /** Enforcement-severity weight (1–3); higher = more regulatory attention */
  weight: number;
  /** Specific factors that contributed to this category's score */
  factors: string[];
}

export interface RiskRegisterResult {
  categoryScores: CategoryScore[];
  /** Weighted average across all categories, 1–100 */
  overallScore: number;
  riskLevel: RiskLevel;
  criticalCategories: RiskCategory[];
  summary: string;
  evaluatedAt: Date;
}

// ── Vendor enforcement history ────────────────────────────────────

export interface VendorEnforcementRecord {
  vendorId: string;
  vendorName: string;
  enforcementActions: EnforcementAction[];
  riskLevel: RiskLevel;
  lastCheckedAt: Date;
  /** STUB — in production, integrate with CFPB enforcement database, FTC actions, and state AG records */
  isStubData: boolean;
}

export interface EnforcementAction {
  id: string;
  agency: 'FTC' | 'CFPB' | 'State_AG' | 'FDIC' | 'OCC' | 'FRB' | 'NCUA' | 'Other';
  actionType: 'consent_order' | 'civil_money_penalty' | 'cease_and_desist' | 'warning_letter' | 'criminal_referral';
  date: string;
  amount?: number;
  description: string;
  docketNumber?: string;
  sourceUrl?: string;
}

// ── Compliance check result ───────────────────────────────────────

export interface ComplianceCheckResult {
  checkId: string;
  businessId: string;
  tenantId: string;
  checkType: ComplianceCheckType;
  riskScore: number;
  riskLevel: RiskLevel;
  findings: ComplianceFinding[];
  riskRegister?: RiskRegisterResult;
  udapResult?: UdapScorerOutput;
  stateLawProfile?: StateLawProfile;
  vendorHistory?: VendorEnforcementRecord;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface ComplianceFinding {
  id: string;
  severity: 'info' | 'warning' | 'violation' | 'critical';
  category: string;
  description: string;
  remediation?: string;
  legalCitation?: string;
}

// ── Input types ───────────────────────────────────────────────────

export interface RiskRegisterInput {
  businessId: string;
  tenantId: string;
  /** Monthly revenue in USD */
  monthlyRevenue?: number;
  /** Total existing debt obligations in USD */
  existingDebt?: number;
  /** Credit utilisation 0.0–1.0 */
  creditUtilization?: number;
  /** Personal FICO score */
  ficoScore?: number;
  /** Months since business formation */
  businessAgeMonths?: number;
  /** Proposed new credit amount */
  proposedFundingAmount?: number;
  /** Industry MCC code */
  mcc?: string;
  /** Has KYC/KYB been completed? */
  kycCompleted?: boolean;
  /** Has AML check been run? */
  amlCleared?: boolean;
  /** State of formation (two-letter code) */
  stateCode?: string;
  /** Advisor-supplied interaction text for UDAP screening */
  interactionText?: string;
  /** List of vendor IDs to check for enforcement history */
  vendorIds?: string[];
}

export interface ComplianceCheckInput {
  businessId: string;
  tenantId: string;
  checkType: ComplianceCheckType;
  stateCode?: string;
  interactionText?: string;
  vendorId?: string;
  riskRegisterInput?: RiskRegisterInput;
}

// ── Category weight map ───────────────────────────────────────────
// Weight 3 = highest regulatory scrutiny / enforcement precedent

const CATEGORY_WEIGHTS: Record<RiskCategory, number> = {
  credit_cash_flow:       2,
  pricing_hidden_cost:    3,
  operational:            1,
  representation_fraud:   3,
  network_issuer_rule:    2,
  chargeback:             2,
  regulatory_udaap:       3,
  reputational:           1,
  tax_accounting:         2,
  aml_kyc:                3,
};

// ── Stub vendor enforcement database ─────────────────────────────
// In production, replace with live CFPB/FTC API lookups and a
// maintained internal vendor risk database.

const VENDOR_ENFORCEMENT_DB: Record<string, VendorEnforcementRecord> = {
  'vendor-high-risk-001': {
    vendorId: 'vendor-high-risk-001',
    vendorName: 'Apex Funding Solutions (Stub)',
    enforcementActions: [
      {
        id: uuidv4(),
        agency: 'CFPB',
        actionType: 'consent_order',
        date: '2022-03-15',
        amount: 1250000,
        description:
          'CFPB consent order for misleading fee representations and UDAAP violations in ' +
          'commercial financing context. Required refund of fees and implementation of ' +
          'enhanced disclosure programme.',
        docketNumber: 'CFPB-2022-0003',
        sourceUrl: 'https://www.consumerfinance.gov/enforcement/actions/',
      },
    ],
    riskLevel: 'high',
    lastCheckedAt: new Date('2026-01-01'),
    isStubData: true,
  },
  'vendor-critical-001': {
    vendorId: 'vendor-critical-001',
    vendorName: 'Pinnacle Business Capital (Stub)',
    enforcementActions: [
      {
        id: uuidv4(),
        agency: 'FTC',
        actionType: 'civil_money_penalty',
        date: '2021-07-22',
        amount: 5000000,
        description:
          'FTC action for deceptive marketing of business funding programs including ' +
          '"no upfront fee" and government affiliation claims. Prohibited from commercial ' +
          'financing activities.',
        docketNumber: 'FTC-X-2021-0041',
        sourceUrl: 'https://www.ftc.gov/enforcement/cases-proceedings',
      },
      {
        id: uuidv4(),
        agency: 'State_AG',
        actionType: 'cease_and_desist',
        date: '2021-09-10',
        amount: 750000,
        description: 'California AG cease-and-desist for UCL violations mirroring FTC findings.',
        docketNumber: 'CA-AG-2021-1192',
      },
    ],
    riskLevel: 'critical',
    lastCheckedAt: new Date('2026-01-01'),
    isStubData: true,
  },
};

// ── Risk level mapping ────────────────────────────────────────────

function scoreToRiskLevel(score: number): RiskLevel {
  if (score <= 30) return 'low';
  if (score <= 55) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}

// ── Risk register scoring ─────────────────────────────────────────

export function scoreRiskRegister(input: RiskRegisterInput): RiskRegisterResult {
  const scores: CategoryScore[] = [];

  // 1. Credit / Cash-Flow Risk
  {
    const factors: string[] = [];
    let raw = 1;

    if (input.ficoScore !== undefined) {
      if (input.ficoScore < 580) { raw += 5; factors.push(`FICO score ${input.ficoScore} — subprime`); }
      else if (input.ficoScore < 670) { raw += 3; factors.push(`FICO score ${input.ficoScore} — near-prime`); }
      else if (input.ficoScore < 740) { raw += 1; factors.push(`FICO score ${input.ficoScore} — good`); }
    }

    if (input.creditUtilization !== undefined) {
      if (input.creditUtilization > 0.9) { raw += 3; factors.push(`Credit utilisation ${(input.creditUtilization * 100).toFixed(0)}% — critical`); }
      else if (input.creditUtilization > 0.7) { raw += 2; factors.push(`Credit utilisation ${(input.creditUtilization * 100).toFixed(0)}% — elevated`); }
    }

    if (input.businessAgeMonths !== undefined && input.businessAgeMonths < 12) {
      raw += 2;
      factors.push(`Business age ${input.businessAgeMonths} months — seasoning risk`);
    }

    const debtToRevenue = (input.existingDebt ?? 0) / Math.max(input.monthlyRevenue ?? 1, 1);
    if (debtToRevenue > 6) { raw += 3; factors.push(`Debt-to-monthly-revenue ${debtToRevenue.toFixed(1)}x — high leverage`); }
    else if (debtToRevenue > 3) { raw += 1; factors.push(`Debt-to-monthly-revenue ${debtToRevenue.toFixed(1)}x — moderate leverage`); }

    scores.push({ category: 'credit_cash_flow', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.credit_cash_flow, factors });
  }

  // 2. Pricing / Hidden-Cost Risk
  {
    const factors: string[] = [];
    let raw = 1;

    if (input.proposedFundingAmount !== undefined) {
      if (input.proposedFundingAmount > 250000) { raw += 2; factors.push('Large funding amount — fee complexity elevated'); }
    }
    // No interaction text check here (handled by UDAP scorer); use baseline
    if (input.interactionText) {
      const udap = scoreUdapRisk({ interactionText: input.interactionText });
      const feeViolations = udap.violations.filter(
        (v) => v.type === 'misleading_fee_representation' || v.type === 'no_upfront_fee_claim',
      );
      if (feeViolations.length > 0) {
        raw += feeViolations.length * 2;
        factors.push(`${feeViolations.length} UDAP fee-related violation(s) detected in interaction text`);
      }
    }

    scores.push({ category: 'pricing_hidden_cost', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.pricing_hidden_cost, factors });
  }

  // 3. Operational Risk
  {
    const factors: string[] = [];
    let raw = 2; // baseline for any deal

    if (input.businessAgeMonths !== undefined && input.businessAgeMonths < 6) {
      raw += 3;
      factors.push('Business < 6 months old — operational track record unproven');
    }

    // MCC high-risk codes (cash-intensive or high-chargeback industries)
    const HIGH_RISK_MCCS = ['5912', '7995', '5993', '7273', '5999', '7801', '7802'];
    if (input.mcc && HIGH_RISK_MCCS.includes(input.mcc)) {
      raw += 2;
      factors.push(`MCC ${input.mcc} — high-risk industry category`);
    }

    scores.push({ category: 'operational', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.operational, factors });
  }

  // 4. Representation / Fraud Risk
  {
    const factors: string[] = [];
    let raw = 1;

    if (input.interactionText) {
      const udap = scoreUdapRisk({ interactionText: input.interactionText });
      const fraudViolations = udap.violations.filter(
        (v) =>
          v.type === 'guaranteed_approval_claim' ||
          v.type === 'government_affiliation_claim' ||
          v.type === 'coaching_misrepresentation' ||
          v.type === 'income_projection_misrepresentation',
      );
      if (fraudViolations.length > 0) {
        raw += fraudViolations.length * 3;
        factors.push(`${fraudViolations.length} UDAP fraud/misrepresentation violation(s) in interaction`);
      }
      if (udap.hardStop) {
        raw = 10;
        factors.push('UDAP hard-stop triggered — critical misrepresentation detected');
      }
    }

    scores.push({ category: 'representation_fraud', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.representation_fraud, factors });
  }

  // 5. Network / Issuer Rule Risk
  {
    const factors: string[] = [];
    let raw = 1;

    if (input.proposedFundingAmount !== undefined && input.proposedFundingAmount > 150000) {
      raw += 2;
      factors.push('High funding amount — Chase 5/24, Amex velocity rules more likely to trigger');
    }

    if (input.businessAgeMonths !== undefined && input.businessAgeMonths < 24) {
      raw += 1;
      factors.push('Business < 24 months — limited issuer relationship history');
    }

    scores.push({ category: 'network_issuer_rule', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.network_issuer_rule, factors });
  }

  // 6. Chargeback Risk
  {
    const factors: string[] = [];
    let raw = 1;

    const HIGH_CHARGEBACK_MCCS = ['5912', '7995', '5816', '7801'];
    if (input.mcc && HIGH_CHARGEBACK_MCCS.includes(input.mcc)) {
      raw += 3;
      factors.push(`MCC ${input.mcc} — historically high chargeback rate`);
    }

    scores.push({ category: 'chargeback', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.chargeback, factors });
  }

  // 7. Regulatory / UDAAP Risk
  {
    const factors: string[] = [];
    let raw = 1;

    if (input.interactionText) {
      const udap = scoreUdapRisk({ interactionText: input.interactionText });
      if (udap.score > 60) { raw += 5; factors.push(`UDAP score ${udap.score}/100 — high regulatory exposure`); }
      else if (udap.score > 30) { raw += 3; factors.push(`UDAP score ${udap.score}/100 — moderate regulatory exposure`); }
      else if (udap.score > 0) { raw += 1; factors.push(`UDAP score ${udap.score}/100 — low-level flags`); }
    }

    if (input.stateCode) {
      const profile = getStateLawProfile(input.stateCode);
      if (profile?.requiresBrokerLicense) {
        raw += 1;
        factors.push(`${input.stateCode} requires broker registration — verify compliance`);
      }
      if (profile?.pendingLegislation) {
        raw += 1;
        factors.push(`${input.stateCode} has pending legislation — monitor DFS/AG guidance`);
      }
    }

    scores.push({ category: 'regulatory_udaap', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.regulatory_udaap, factors });
  }

  // 8. Reputational Risk
  {
    const factors: string[] = [];
    let raw = 1;

    if (input.vendorIds && input.vendorIds.length > 0) {
      for (const vid of input.vendorIds) {
        const vendor = VENDOR_ENFORCEMENT_DB[vid];
        if (vendor) {
          if (vendor.riskLevel === 'critical') { raw += 4; factors.push(`Vendor ${vendor.vendorName} has CRITICAL enforcement history`); }
          else if (vendor.riskLevel === 'high') { raw += 2; factors.push(`Vendor ${vendor.vendorName} has HIGH enforcement history`); }
        }
      }
    }

    scores.push({ category: 'reputational', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.reputational, factors });
  }

  // 9. Tax / Accounting Risk
  {
    const factors: string[] = [];
    let raw = 1;

    if (input.proposedFundingAmount !== undefined && input.proposedFundingAmount > 100000) {
      raw += 1;
      factors.push('Large funding amount — IRC § 163(j) business interest limitation may apply; advise tax counsel');
    }

    if (input.mcc === '7995' || input.mcc === '7801') {
      raw += 2;
      factors.push('Industry has elevated BSA/cash-reporting obligations');
    }

    scores.push({ category: 'tax_accounting', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.tax_accounting, factors });
  }

  // 10. AML / KYC Risk
  {
    const factors: string[] = [];
    let raw = 1;

    if (input.kycCompleted === false) {
      raw += 4;
      factors.push('KYC/KYB not completed — required before disbursement');
    }
    if (input.amlCleared === false) {
      raw += 4;
      factors.push('AML check not run — OFAC/PEP screening required');
    }

    const HIGH_RISK_MCCS_AML = ['5912', '7995', '7801', '5993'];
    if (input.mcc && HIGH_RISK_MCCS_AML.includes(input.mcc)) {
      raw += 2;
      factors.push(`MCC ${input.mcc} — elevated BSA/AML scrutiny`);
    }

    scores.push({ category: 'aml_kyc', score: Math.min(10, raw), weight: CATEGORY_WEIGHTS.aml_kyc, factors });
  }

  // ── Weighted average ──────────────────────────────────────────

  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);
  const weightedAvg = weightedSum / totalWeight; // 1–10 scale
  const overallScore = Math.round((weightedAvg / 10) * 100); // normalise to 0–100

  const riskLevel = scoreToRiskLevel(overallScore);
  const criticalCategories = scores
    .filter((s) => s.score >= 8)
    .map((s) => s.category);

  const summary = buildRiskSummary(overallScore, riskLevel, criticalCategories);

  return {
    categoryScores: scores,
    overallScore,
    riskLevel,
    criticalCategories,
    summary,
    evaluatedAt: new Date(),
  };
}

function buildRiskSummary(
  score: number,
  level: RiskLevel,
  critical: RiskCategory[],
): string {
  const levelLabel = level.toUpperCase();
  if (critical.length > 0) {
    return (
      `${levelLabel} risk (${score}/100). Critical categories: ${critical.join(', ')}. ` +
      'Immediate review required before proceeding.'
    );
  }
  return `${levelLabel} risk (${score}/100). No critical categories identified.`;
}

// ── ComplianceService class ───────────────────────────────────────

export class ComplianceService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Public methods ─────────────────────────────────────────────

  /**
   * Run a full compliance check and persist the result.
   * Emits a compliance.check.completed ledger event on success.
   */
  async runComplianceCheck(input: ComplianceCheckInput): Promise<ComplianceCheckResult> {
    const checkId = uuidv4();
    const createdAt = new Date();
    const findings: ComplianceFinding[] = [];

    let riskScore = 0;
    let udapResult: UdapScorerOutput | undefined;
    let stateLawProfile: StateLawProfile | undefined;
    let vendorHistory: VendorEnforcementRecord | undefined;
    let riskRegister: RiskRegisterResult | undefined;

    // ── Route by check type ──────────────────────────────────────

    if (input.checkType === 'udap' && input.interactionText) {
      udapResult = scoreUdapRisk({
        interactionText: input.interactionText,
        disclosureSent: false,
        consentOnFile: false,
      });
      riskScore = udapResult.score;
      this._udapToFindings(udapResult, findings);
    }

    if (input.checkType === 'state_law' && input.stateCode) {
      stateLawProfile = getStateLawProfile(input.stateCode) ?? undefined;
      if (stateLawProfile) {
        riskScore = stateLawProfile.hasSpecificStateLaw ? 45 : 15;
        this._stateLawToFindings(stateLawProfile, findings);
      } else {
        riskScore = 20;
        findings.push({
          id: uuidv4(),
          severity: 'warning',
          category: 'state_law',
          description: `State code "${input.stateCode}" not recognised. Federal baseline applies.`,
          remediation: 'Verify state code and consult legal counsel for jurisdiction-specific requirements.',
        });
      }
    }

    if (input.checkType === 'vendor' && input.vendorId) {
      vendorHistory = await this.getVendorHistory(input.vendorId);
      riskScore = this._vendorRiskToScore(vendorHistory.riskLevel);
      this._vendorToFindings(vendorHistory, findings);
    }

    if (input.checkType === 'kyb' || input.checkType === 'kyc' || input.checkType === 'aml') {
      if (input.riskRegisterInput) {
        riskRegister = scoreRiskRegister(input.riskRegisterInput);
        riskScore = riskRegister.overallScore;
        this._riskRegisterToFindings(riskRegister, findings);
      }
    }

    // ── Full risk register for comprehensive checks ───────────────

    if (!riskRegister && input.riskRegisterInput) {
      riskRegister = scoreRiskRegister(input.riskRegisterInput);
      if (riskScore === 0) riskScore = riskRegister.overallScore;
    }

    const riskLevel = scoreToRiskLevel(riskScore);

    // ── Persist to database ───────────────────────────────────────

    await this.prisma.complianceCheck.create({
      data: {
        id:                checkId,
        tenantId:          input.tenantId,
        businessId:        input.businessId,
        checkType:         input.checkType,
        riskScore,
        riskLevel,
        findings:          findings as unknown as object,
        stateJurisdiction: input.stateCode ?? null,
      },
    });

    // ── Emit ledger event ─────────────────────────────────────────

    await eventBus.publish(input.tenantId, {
      eventType:     EVENT_TYPES.COMPLIANCE_CHECK_COMPLETED,
      aggregateType: AGGREGATE_TYPES.COMPLIANCE,
      aggregateId:   checkId,
      payload: {
        businessId: input.businessId,
        checkType:  input.checkType,
        riskScore,
        riskLevel,
        findingCount: findings.length,
      },
    });

    if (riskLevel === 'critical' || riskLevel === 'high') {
      await eventBus.publish(input.tenantId, {
        eventType:     EVENT_TYPES.RISK_ALERT_RAISED,
        aggregateType: AGGREGATE_TYPES.COMPLIANCE,
        aggregateId:   checkId,
        payload: {
          businessId: input.businessId,
          riskLevel,
          riskScore,
          checkType: input.checkType,
          criticalFindings: findings.filter((f) => f.severity === 'critical' || f.severity === 'violation'),
        },
      });
    }

    return {
      checkId,
      businessId: input.businessId,
      tenantId:   input.tenantId,
      checkType:  input.checkType,
      riskScore,
      riskLevel,
      findings,
      riskRegister,
      udapResult,
      stateLawProfile,
      vendorHistory,
      createdAt,
    };
  }

  /**
   * Calculate and return the current risk score for a business
   * without persisting a new compliance check record.
   */
  async getRiskScore(businessId: string, tenantId: string): Promise<{
    riskScore: number;
    riskLevel: RiskLevel;
    lastCheckAt: Date | null;
  }> {
    const latest = await this.prisma.complianceCheck.findFirst({
      where: { businessId, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { riskScore: true, riskLevel: true, createdAt: true },
    });

    if (!latest || latest.riskScore === null) {
      return { riskScore: 0, riskLevel: 'low', lastCheckAt: null };
    }

    return {
      riskScore: latest.riskScore,
      riskLevel: (latest.riskLevel as RiskLevel) ?? 'low',
      lastCheckAt: latest.createdAt,
    };
  }

  /**
   * Retrieve vendor enforcement history.
   * In production, augment with live CFPB/FTC API lookups.
   */
  async getVendorHistory(vendorId: string): Promise<VendorEnforcementRecord> {
    const known = VENDOR_ENFORCEMENT_DB[vendorId];
    if (known) return known;

    // Unknown vendor — return clean record
    return {
      vendorId,
      vendorName: 'Unknown Vendor',
      enforcementActions: [],
      riskLevel: 'low',
      lastCheckedAt: new Date(),
      isStubData: true,
    };
  }

  /**
   * Score interaction text for UDAP/UDAAP risk without persisting.
   */
  scoreInteraction(input: UdapScorerInput): UdapScorerOutput {
    return scoreUdapRisk(input);
  }

  /**
   * Return required disclosures and compliance steps for a state.
   */
  getStateRequirements(stateCode: string) {
    return {
      profile:     getStateLawProfile(stateCode),
      disclosures: getRequiredDisclosures(stateCode),
      steps:       getComplianceSteps(stateCode),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────

  private _udapToFindings(
    udap: UdapScorerOutput,
    findings: ComplianceFinding[],
  ): void {
    for (const v of udap.violations) {
      findings.push({
        id: uuidv4(),
        severity: v.severityWeight >= 9 ? 'critical' : v.severityWeight >= 7 ? 'violation' : 'warning',
        category: `udap.${v.type}`,
        description: v.description,
        remediation: `Remove or correct the following language: "${v.evidence}". Consult compliance counsel before proceeding.`,
        legalCitation: 'FTC Act § 5; Dodd-Frank § 1031 (UDAAP)',
      });
    }
    if (udap.hardStop) {
      findings.push({
        id: uuidv4(),
        severity: 'critical',
        category: 'udap.hard_stop',
        description: 'UDAP hard stop triggered. Deal must be halted pending legal review.',
        remediation: 'Escalate to compliance officer immediately. Do not proceed until resolved.',
        legalCitation: 'FTC Act § 5; Dodd-Frank § 1031',
      });
    }
  }

  private _stateLawToFindings(
    profile: StateLawProfile,
    findings: ComplianceFinding[],
  ): void {
    if (profile.requiresBrokerLicense) {
      findings.push({
        id: uuidv4(),
        severity: 'violation',
        category: 'state_law.license',
        description: `${profile.stateName} requires active broker/provider registration with ${profile.regulatoryBody}.`,
        remediation: 'Verify registration status before arranging any transactions in this state.',
        legalCitation: profile.primaryCitation,
      });
    }
    if (profile.pendingLegislation) {
      findings.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'state_law.pending_legislation',
        description: `${profile.stateName} has pending legislative changes that may affect disclosure requirements.`,
        remediation: 'Monitor DFS/AG guidance and re-assess before going live in this state.',
        legalCitation: profile.primaryCitation,
      });
    }
    if (profile.hasSpecificStateLaw) {
      findings.push({
        id: uuidv4(),
        severity: 'info',
        category: 'state_law.specific_law',
        description: `${profile.stateName} has ${profile.requiredDisclosures.length} required disclosures under ${profile.primaryCitation}.`,
        remediation: 'Use the state-specific disclosure form and complete all required compliance steps.',
        legalCitation: profile.primaryCitation,
      });
    }
  }

  private _vendorToFindings(
    vendor: VendorEnforcementRecord,
    findings: ComplianceFinding[],
  ): void {
    for (const action of vendor.enforcementActions) {
      const severity = vendor.riskLevel === 'critical' ? 'critical' : 'violation';
      findings.push({
        id: uuidv4(),
        severity,
        category: `vendor.enforcement.${action.actionType}`,
        description:
          `Vendor "${vendor.vendorName}" has a ${action.actionType.replace(/_/g, ' ')} from ` +
          `${action.agency} (${action.date})${action.amount ? ` — $${action.amount.toLocaleString()}` : ''}. ` +
          action.description,
        remediation:
          'Do not proceed with this vendor without senior compliance officer sign-off. ' +
          'Consider alternative vendors with clean enforcement history.',
        legalCitation: action.docketNumber
          ? `Docket: ${action.docketNumber}`
          : undefined,
      });
    }
  }

  private _riskRegisterToFindings(
    register: RiskRegisterResult,
    findings: ComplianceFinding[],
  ): void {
    for (const cat of register.categoryScores) {
      if (cat.score >= 8) {
        findings.push({
          id: uuidv4(),
          severity: 'critical',
          category: `risk_register.${cat.category}`,
          description: `Category "${cat.category}" scored ${cat.score}/10 (critical). Factors: ${cat.factors.join('; ')}.`,
          remediation: 'Address all listed risk factors before proceeding.',
        });
      } else if (cat.score >= 6) {
        findings.push({
          id: uuidv4(),
          severity: 'violation',
          category: `risk_register.${cat.category}`,
          description: `Category "${cat.category}" scored ${cat.score}/10 (elevated). Factors: ${cat.factors.join('; ')}.`,
          remediation: 'Review and mitigate the identified risk factors.',
        });
      }
    }
  }

  private _vendorRiskToScore(level: RiskLevel): number {
    const map: Record<RiskLevel, number> = {
      low: 15,
      medium: 45,
      high: 65,
      critical: 85,
    };
    return map[level];
  }
}
