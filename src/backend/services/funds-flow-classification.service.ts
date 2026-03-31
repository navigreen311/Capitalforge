// ============================================================
// CapitalForge — Funds-Flow Classification & Licensing Watch
//
// Core responsibilities:
//   1. Payment-flow role classifier (5 canonical types)
//   2. "Possible money-transmission" alert generation
//   3. Processor / merchant-of-record decision tree
//   4. Licensing review escalation
//   5. AML/KYC program readiness monitor
//   6. Suspicious transaction pattern detection
//
// Classifier roles (classification values):
//   merchant             — standard goods/services payment
//   bill_payment         — payment to utility/biller on behalf of payer
//   account_funding      — loading funds into a stored-value or DDA account
//   cash_disbursement    — cash-equivalent disbursement (ATM, cash-back, etc.)
//   money_transmission_risk — pattern consistent with unlicensed money transmission
//
// Money-transmission risk is raised when the flow involves
// receiving funds from one party and remitting to a different
// party without being the beneficial recipient (principal).
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';

// ── Enumerations ──────────────────────────────────────────────────

export type PaymentFlowRole =
  | 'merchant'
  | 'bill_payment'
  | 'account_funding'
  | 'cash_disbursement'
  | 'money_transmission_risk';

export type ProcessorRole = 'payment_facilitator' | 'merchant_of_record' | 'iso' | 'direct_acquirer';

export type LicensingStatus =
  | 'not_required'
  | 'review_required'
  | 'escalated'
  | 'licensed'
  | 'pending_application';

export type ClassificationStatus = 'active' | 'superseded' | 'under_review';

export type AmlReadinessLevel = 'adequate' | 'needs_improvement' | 'deficient' | 'critical_gap';

// ── Data types ────────────────────────────────────────────────────

export interface WorkflowClassificationInput {
  tenantId: string;
  workflowName: string;
  /** Does the platform receive funds from payer before forwarding to payee? */
  receivesAndRemits: boolean;
  /** Is the platform the ultimate beneficial recipient of the funds? */
  isBeneficialRecipient: boolean;
  /** Primary MCC for the transaction category */
  mcc?: string;
  /** Does the flow involve loading a stored-value or prepaid account? */
  involvesStoredValue: boolean;
  /** Does the flow include a cash-back or ATM-equivalent element? */
  includesCashElement: boolean;
  /** Does the flow involve paying a utility or recurring biller on behalf of a consumer? */
  isBillPayment: boolean;
  /** Is the platform acting as merchant-of-record (taking title to goods/services)? */
  isMerchantOfRecord: boolean;
  /** Number of unique payees funds are remitted to per month (unbounded flows elevate risk) */
  uniquePayeeCountMonthly?: number;
  /** Average transaction amount in USD */
  averageTransactionAmountUsd?: number;
  /** Optional legal opinion document reference */
  legalOpinionRef?: string;
}

export interface FundsFlowClassificationRecord {
  id: string;
  tenantId: string;
  workflowName: string;
  classification: PaymentFlowRole;
  riskBasis: string;
  regulatoryFramework: string;
  processorRole: ProcessorRole;
  licensingStatus: LicensingStatus;
  moneyTransmissionAlert: boolean;
  alertDetails?: string;
  legalOpinionRef?: string;
  status: ClassificationStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AmlReadinessReport {
  tenantId: string;
  overallReadiness: AmlReadinessLevel;
  score: number;
  gaps: AmlGap[];
  evaluatedAt: Date;
}

export interface AmlGap {
  area: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  remediation: string;
}

export interface SuspiciousPatternAlert {
  patternId: string;
  workflowName: string;
  patternType: string;
  description: string;
  riskScore: number;
  recommendedAction: string;
  detectedAt: Date;
}

export interface LicensingEscalation {
  workflowId: string;
  workflowName: string;
  classification: PaymentFlowRole;
  licensingStatus: LicensingStatus;
  affectedStates: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  escalationReason: string;
  counselReferralRequired: boolean;
}

// ── MCC categories ────────────────────────────────────────────────

const CASH_LIKE_MCCS = new Set([
  '6010', // Financial Institutions — Manual Cash Disbursements
  '6011', // Financial Institutions — Automated Cash Disbursements
  '6051', // Non-Financial Institutions — Foreign Currency, Travellers' Cheques
  '7995', // Gambling / Lottery
  '4829', // Wire Transfer Money Orders
  '6540', // POI — Funding Transactions
]);

const BILL_PAYMENT_MCCS = new Set([
  '4900', // Utility Services
  '4814', // Telephone Services
  '4812', // Telephone Equipment
  '4816', // Computer Network/Information Services
  '6300', // Insurance
]);

const STORED_VALUE_MCCS = new Set([
  '6540', // POI — Funding (Visa AFT)
  '6012', // Financial Institutions — Merchandise/Services
]);

// ── Decision tree ─────────────────────────────────────────────────

/**
 * Classify payment flow role using a deterministic decision tree.
 * Returns the classification and supporting rationale.
 */
export function classifyPaymentFlow(
  input: WorkflowClassificationInput,
): { classification: PaymentFlowRole; riskBasis: string; regulatoryFramework: string } {

  // --- Branch 1: Money-transmission risk ---
  // Core test: receives funds from one party and remits to a different
  // beneficial party without being the MOR or beneficial recipient.
  if (
    input.receivesAndRemits &&
    !input.isBeneficialRecipient &&
    !input.isMerchantOfRecord
  ) {
    return {
      classification: 'money_transmission_risk',
      riskBasis:
        'Platform receives and remits funds between different parties without being the ' +
        'beneficial recipient or merchant-of-record — pattern consistent with unlicensed ' +
        'money transmission in most US state jurisdictions.',
      regulatoryFramework:
        'State Money Transmission Acts (e.g., NYMTA § 649; CA FLL § 2030); ' +
        'FinCEN MSB registration (31 CFR § 1022); BSA/AML obligations (31 USC § 5318).',
    };
  }

  // --- Branch 2: Cash disbursement ---
  const mccIsCashLike = input.mcc ? CASH_LIKE_MCCS.has(input.mcc) : false;
  if (input.includesCashElement || mccIsCashLike) {
    return {
      classification: 'cash_disbursement',
      riskBasis:
        'Flow includes cash-equivalent disbursement (ATM, cash-back, or MCC in 6010/6011/' +
        '6051/7995 range). Elevated BSA/AML reporting obligations apply.',
      regulatoryFramework:
        'BSA Currency Transaction Report (31 USC § 5313); Visa/Mastercard cash-disbursement ' +
        'programme rules; FinCEN MSB guidance FIN-2013-G001.',
    };
  }

  // --- Branch 3: Account funding (AFT) ---
  const mccIsStoredValue = input.mcc ? STORED_VALUE_MCCS.has(input.mcc) : false;
  if (input.involvesStoredValue || mccIsStoredValue) {
    return {
      classification: 'account_funding',
      riskBasis:
        'Flow loads funds into a stored-value, prepaid, or DDA account (Visa AFT / ' +
        'Mastercard MTT classification). Processor must be enabled for account-funding ' +
        'transactions and must apply enhanced velocity monitoring.',
      regulatoryFramework:
        'Visa Core Rules § 5.8 (AFT); Mastercard Transaction Processing Rules § 3.8; ' +
        'CFPB Prepaid Rule (12 CFR 1005 Subpart E); State money-transmission statutes.',
    };
  }

  // --- Branch 4: Bill payment ---
  const mccIsBillPayment = input.mcc ? BILL_PAYMENT_MCCS.has(input.mcc) : false;
  if (input.isBillPayment || mccIsBillPayment) {
    return {
      classification: 'bill_payment',
      riskBasis:
        'Flow routes funds from payer to a utility or recurring biller on the payer\'s ' +
        'behalf. Bill-payment exemptions under several state MTAs may apply if platform ' +
        'collects and remits only to named billers without holding funds.',
      regulatoryFramework:
        'NACHA WEB/TEL/PPD bill-payment rules; state MTA bill-payment exemptions ' +
        '(e.g., CA FLL § 2010(l)); Visa Bill Payment rules.',
    };
  }

  // --- Branch 5: Standard merchant payment (default) ---
  return {
    classification: 'merchant',
    riskBasis:
      'Flow is a standard goods/services merchant payment. Platform is acting as or ' +
      'through a licensed acquirer; no money-transmission risk identified.',
    regulatoryFramework:
      'Visa/Mastercard merchant acquiring rules; UCC Article 4A (funds transfer); ' +
      'NACHA Operating Rules (ACH).',
  };
}

/**
 * Determine processor/merchant-of-record role from classification inputs.
 */
export function determineProcessorRole(
  input: WorkflowClassificationInput,
): ProcessorRole {
  if (input.isMerchantOfRecord) return 'merchant_of_record';
  if (input.receivesAndRemits && input.isBeneficialRecipient) return 'payment_facilitator';
  if (!input.receivesAndRemits) return 'direct_acquirer';
  return 'iso';
}

/**
 * Determine licensing status from classification and flow attributes.
 */
export function determineLicensingStatus(
  classification: PaymentFlowRole,
  processorRole: ProcessorRole,
  input: WorkflowClassificationInput,
): LicensingStatus {
  if (classification === 'money_transmission_risk') return 'escalated';
  if (classification === 'account_funding' || classification === 'cash_disbursement') {
    return 'review_required';
  }
  if (classification === 'bill_payment' && input.receivesAndRemits && !input.isMerchantOfRecord) {
    return 'review_required';
  }
  if (processorRole === 'payment_facilitator' && (input.uniquePayeeCountMonthly ?? 0) > 100) {
    return 'review_required';
  }
  return 'not_required';
}

// ── Suspicious pattern detection ──────────────────────────────────

const SUSPICIOUS_PATTERNS: Array<{
  id: string;
  name: string;
  description: string;
  test: (input: WorkflowClassificationInput) => boolean;
  riskScore: number;
  action: string;
}> = [
  {
    id: 'SP-001',
    name: 'High-volume many-to-one disbursement',
    description:
      'Workflow routes funds from large number of payers to single payee — may ' +
      'constitute unlicensed money pooling.',
    test: (i) =>
      (i.uniquePayeeCountMonthly ?? 0) === 1 &&
      i.receivesAndRemits &&
      !i.isBeneficialRecipient,
    riskScore: 85,
    action: 'Engage licensing counsel; obtain legal opinion before proceeding.',
  },
  {
    id: 'SP-002',
    name: 'High-value cash-disbursement workflow',
    description:
      'Average transaction exceeds $10,000 in a cash-disbursement flow — ' +
      'triggers mandatory CTR filing requirements.',
    test: (i) =>
      i.includesCashElement &&
      (i.averageTransactionAmountUsd ?? 0) > 10_000,
    riskScore: 90,
    action: 'File FinCEN CTR; ensure BSA officer sign-off on each transaction.',
  },
  {
    id: 'SP-003',
    name: 'Account-funding via gambling MCC',
    description:
      'Account-funding flow routed through gambling MCC (7995) — ' +
      'Visa/Mastercard prohibit this combination.',
    test: (i) => i.involvesStoredValue && i.mcc === '7995',
    riskScore: 95,
    action:
      'Block workflow immediately; notify processor; re-classify with alternate MCC or restructure.',
  },
  {
    id: 'SP-004',
    name: 'Unbounded payee fan-out without MOR status',
    description:
      'Workflow remits to >500 unique payees/month without merchant-of-record status — ' +
      'hallmark of unlicensed payment processing.',
    test: (i) =>
      (i.uniquePayeeCountMonthly ?? 0) > 500 &&
      !i.isMerchantOfRecord &&
      i.receivesAndRemits,
    riskScore: 88,
    action:
      'Obtain money-transmission licences or restructure as aggregator with licensed payfac.',
  },
  {
    id: 'SP-005',
    name: 'Wire-transfer MCC on non-MOR flow',
    description:
      'MCC 4829 (wire-transfer) used in a flow where platform is not beneficial recipient — ' +
      'explicit money-transmission indicator.',
    test: (i) => i.mcc === '4829' && !i.isBeneficialRecipient,
    riskScore: 92,
    action:
      'Register as MSB with FinCEN; obtain state money-transmission licences; ' +
      'implement full BSA/AML programme.',
  },
];

export function detectSuspiciousPatterns(
  workflowName: string,
  input: WorkflowClassificationInput,
): SuspiciousPatternAlert[] {
  const alerts: SuspiciousPatternAlert[] = [];
  const now = new Date();

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(input)) {
      alerts.push({
        patternId:           pattern.id,
        workflowName,
        patternType:         pattern.name,
        description:         pattern.description,
        riskScore:           pattern.riskScore,
        recommendedAction:   pattern.action,
        detectedAt:          now,
      });
    }
  }

  return alerts;
}

// ── AML readiness evaluation ───────────────────────────────────────

export interface AmlReadinessInput {
  tenantId: string;
  hasBsaOfficerDesignated: boolean;
  hasWrittenAmlPolicy: boolean;
  hasOfacScreeningProcess: boolean;
  hasCtrFilingProcess: boolean;
  hasSarFilingProcess: boolean;
  hasEmployeeAmlTraining: boolean;
  hasIndependentAudit: boolean;
  hasBeneficialOwnershipProcedures: boolean;
  lastAuditDate?: Date;
}

export function evaluateAmlReadiness(input: AmlReadinessInput): AmlReadinessReport {
  const gaps: AmlGap[] = [];
  let score = 100;

  if (!input.hasBsaOfficerDesignated) {
    score -= 20;
    gaps.push({
      area: 'BSA Compliance Officer',
      severity: 'critical',
      description: 'No designated BSA Compliance Officer on file.',
      remediation: 'Appoint a qualified BSA Compliance Officer; document in Board minutes.',
    });
  }

  if (!input.hasWrittenAmlPolicy) {
    score -= 20;
    gaps.push({
      area: 'Written AML/BSA Policy',
      severity: 'critical',
      description: 'No written AML/BSA programme policy found.',
      remediation:
        'Draft and adopt a written AML/BSA policy covering all five BSA pillars ' +
        '(31 USC § 5318(h)).',
    });
  }

  if (!input.hasOfacScreeningProcess) {
    score -= 15;
    gaps.push({
      area: 'OFAC Screening',
      severity: 'high',
      description: 'No documented OFAC/SDN screening process.',
      remediation:
        'Implement automated OFAC/SDN screening at customer onboarding and periodically ' +
        'for existing customers. Maintain screening logs.',
    });
  }

  if (!input.hasCtrFilingProcess) {
    score -= 15;
    gaps.push({
      area: 'Currency Transaction Reports',
      severity: 'high',
      description: 'No process for FinCEN CTR filing on transactions ≥ $10,000.',
      remediation:
        'Implement automated CTR detection and filing workflow via FinCEN BSA E-Filing.',
    });
  }

  if (!input.hasSarFilingProcess) {
    score -= 15;
    gaps.push({
      area: 'Suspicious Activity Reports',
      severity: 'high',
      description: 'No SAR filing process documented.',
      remediation:
        'Establish SAR investigation workflow with 30-day filing deadline from detection ' +
        '(31 CFR § 1022.320).',
    });
  }

  if (!input.hasEmployeeAmlTraining) {
    score -= 10;
    gaps.push({
      area: 'Employee AML Training',
      severity: 'medium',
      description: 'No documented AML training programme for relevant employees.',
      remediation:
        'Implement annual AML training curriculum; track completion and maintain records.',
    });
  }

  if (!input.hasIndependentAudit) {
    score -= 10;
    gaps.push({
      area: 'Independent Audit',
      severity: 'medium',
      description: 'No independent AML programme audit on record.',
      remediation:
        'Commission annual independent audit of AML programme by qualified third party.',
    });
  }

  if (!input.hasBeneficialOwnershipProcedures) {
    score -= 10;
    gaps.push({
      area: 'Beneficial Ownership',
      severity: 'medium',
      description: 'No beneficial-ownership collection procedures documented.',
      remediation:
        'Implement FinCEN beneficial-ownership rule procedures (31 CFR § 1010.230).',
    });
  }

  if (
    input.lastAuditDate &&
    Date.now() - input.lastAuditDate.getTime() > 365 * 24 * 60 * 60 * 1000
  ) {
    score -= 5;
    gaps.push({
      area: 'Audit Currency',
      severity: 'low',
      description: 'Last independent audit is more than 12 months old.',
      remediation: 'Schedule an updated independent AML audit.',
    });
  }

  const normalised = Math.max(0, score);

  const overallReadiness: AmlReadinessLevel =
    normalised >= 85 ? 'adequate' :
    normalised >= 65 ? 'needs_improvement' :
    normalised >= 40 ? 'deficient' :
    'critical_gap';

  return {
    tenantId:         input.tenantId,
    overallReadiness,
    score:            normalised,
    gaps,
    evaluatedAt:      new Date(),
  };
}

// ── FundsFlowClassificationService ───────────────────────────────

export class FundsFlowClassificationService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Classify a payment workflow, persist the result, emit events
   * for money-transmission risk and licensing escalations.
   */
  async classifyWorkflow(
    input: WorkflowClassificationInput,
  ): Promise<FundsFlowClassificationRecord> {
    const id = uuidv4();
    const now = new Date();

    const { classification, riskBasis, regulatoryFramework } =
      classifyPaymentFlow(input);

    const processorRole = determineProcessorRole(input);
    const licensingStatus = determineLicensingStatus(classification, processorRole, input);

    const moneyTransmissionAlert = classification === 'money_transmission_risk';
    const alertDetails = moneyTransmissionAlert
      ? `Workflow "${input.workflowName}" classified as money-transmission risk. ` +
        `Processor role: ${processorRole}. ` +
        'Licensing review escalated immediately. Engage licensed money-transmission ' +
        'counsel before operating this workflow.'
      : undefined;

    // Persist to funds_flow_classifications
    await this.prisma.fundsFlowClassification.create({
      data: {
        id,
        tenantId:            input.tenantId,
        workflowName:        input.workflowName,
        classification,
        riskBasis,
        regulatoryFramework,
        legalOpinionRef:     input.legalOpinionRef ?? null,
        status:              'active',
      },
    });

    // Emit event for money-transmission risk
    if (moneyTransmissionAlert) {
      await eventBus.publish(input.tenantId, {
        eventType:     EVENT_TYPES.RISK_ALERT_RAISED,
        aggregateType: AGGREGATE_TYPES.COMPLIANCE,
        aggregateId:   id,
        payload: {
          classificationId: id,
          workflowName: input.workflowName,
          classification,
          licensingStatus,
          alertDetails,
        },
      });
    }

    // Detect suspicious patterns and emit if found
    const suspiciousAlerts = detectSuspiciousPatterns(input.workflowName, input);
    if (suspiciousAlerts.length > 0) {
      await eventBus.publish(input.tenantId, {
        eventType:     EVENT_TYPES.RISK_ALERT_RAISED,
        aggregateType: AGGREGATE_TYPES.COMPLIANCE,
        aggregateId:   id,
        payload: {
          type:              'suspicious_transaction_patterns',
          classificationId:  id,
          workflowName:      input.workflowName,
          patternsDetected:  suspiciousAlerts.length,
          patterns:          suspiciousAlerts,
        },
      });
    }

    logger.info('Funds-flow workflow classified', {
      classificationId: id,
      tenantId:         input.tenantId,
      workflowName:     input.workflowName,
      classification,
      processorRole,
      licensingStatus,
      moneyTransmissionAlert,
      suspiciousPatterns: suspiciousAlerts.length,
    });

    return {
      id,
      tenantId:               input.tenantId,
      workflowName:           input.workflowName,
      classification,
      riskBasis,
      regulatoryFramework,
      processorRole,
      licensingStatus,
      moneyTransmissionAlert,
      alertDetails,
      legalOpinionRef:        input.legalOpinionRef,
      status:                 'active',
      createdAt:              now,
      updatedAt:              now,
    };
  }

  /**
   * List all classifications for a tenant.
   */
  async listClassifications(
    tenantId: string,
    opts: { classification?: PaymentFlowRole; limit?: number } = {},
  ): Promise<FundsFlowClassificationRecord[]> {
    const rows = await this.prisma.fundsFlowClassification.findMany({
      where: {
        tenantId,
        ...(opts.classification ? { classification: opts.classification } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
    });

    type RawRow = {
      id: string; tenantId: string; workflowName: string; classification: string;
      riskBasis: string | null; regulatoryFramework: string | null;
      legalOpinionRef: string | null; status: string;
      reviewedBy: string | null; reviewedAt: Date | null;
      createdAt: Date; updatedAt: Date;
    };

    return (rows as RawRow[]).map((r) => ({
      id:                     r.id,
      tenantId:               r.tenantId,
      workflowName:           r.workflowName,
      classification:         r.classification as PaymentFlowRole,
      riskBasis:              r.riskBasis ?? '',
      regulatoryFramework:    r.regulatoryFramework ?? '',
      processorRole:          'iso' as ProcessorRole, // not stored separately; resolved at classify time
      licensingStatus:        'not_required' as LicensingStatus,
      moneyTransmissionAlert: r.classification === 'money_transmission_risk',
      legalOpinionRef:        r.legalOpinionRef ?? undefined,
      status:                 r.status as ClassificationStatus,
      reviewedBy:             r.reviewedBy ?? undefined,
      reviewedAt:             r.reviewedAt ?? undefined,
      createdAt:              r.createdAt,
      updatedAt:              r.updatedAt,
    }));
  }

  /**
   * Return the current licensing status for all workflows that are
   * either escalated or under review, optionally for a given tenant.
   */
  async getLicensingStatus(
    tenantId: string,
  ): Promise<LicensingEscalation[]> {
    const rows = await this.prisma.fundsFlowClassification.findMany({
      where: {
        tenantId,
        classification: { in: ['money_transmission_risk', 'account_funding', 'cash_disbursement'] },
        status: 'active',
      },
      orderBy: { createdAt: 'desc' },
    });

    type RawEscRow = { id: string; workflowName: string; classification: string };

    return (rows as RawEscRow[]).map((r): LicensingEscalation => {
      const classification = r.classification as PaymentFlowRole;
      const isEscalated = classification === 'money_transmission_risk';

      return {
        workflowId:              r.id,
        workflowName:            r.workflowName,
        classification,
        licensingStatus:         isEscalated ? 'escalated' : 'review_required',
        affectedStates:          ['ALL'], // stub; in production derive from geo-restrictions
        urgency:                 isEscalated ? 'critical' : 'high',
        escalationReason:
          isEscalated
            ? 'Workflow classified as money-transmission risk; unlicensed operation may violate ' +
              'state Money Transmission Acts and FinCEN MSB registration requirements.'
            : 'Workflow involves account-funding or cash-disbursement; verify processor ' +
              'programme approval and state licensing requirements.',
        counselReferralRequired: isEscalated,
      };
    });
  }

  /**
   * Evaluate AML/KYC programme readiness for a tenant.
   */
  evaluateAmlReadiness(input: AmlReadinessInput): AmlReadinessReport {
    return evaluateAmlReadiness(input);
  }

  /**
   * Run suspicious-pattern detection against a workflow description
   * without persisting a full classification.
   */
  scanForSuspiciousPatterns(
    workflowName: string,
    input: WorkflowClassificationInput,
  ): SuspiciousPatternAlert[] {
    return detectSuspiciousPatterns(workflowName, input);
  }
}
