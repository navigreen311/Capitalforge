// ============================================================
// CapitalForge — Spend Governance & Use-of-Funds Monitor
//
// Compliance basis:
//   • IRS Rev. Rul. 2004-111 — business-purpose substantiation
//   • Visa/Mastercard network rules — personal-use prohibition on
//     commercial accounts, MCC-based risk monitoring
//   • Treasury Circular 230 — adequate records for deductibility
//   • CFPB UDAAP — misleading representations of business-use
//
// Enforcement rules applied here:
//   1. Every transaction scored 0–100 by MCC risk profile.
//   2. Cash-like MCCs (6010–6012, 6051, 4829) trigger immediate
//      flag + SPEND_CASH_LIKE_DETECTED event.
//   3. Chargeback ratio per card is monitored; >1 % triggers alert.
//   4. Suspicious payment-rail routing (P2P, crypto on-ramp, etc.)
//      is flagged for manual review.
//   5. Every transaction is tagged with a business-purpose ledger
//      entry for tax substantiation and IRS audit readiness.
// ============================================================

import { PrismaClient, SpendTransaction } from '@prisma/client';
import { EventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../events/event-types.js';
import logger from '../config/logger.js';

// ── MCC Risk Catalogue ────────────────────────────────────────

/**
 * Merchant Category Code (MCC) risk classifications.
 *
 * Risk scores (0–100):
 *   0–29   = low       — normal business spend
 *   30–59  = moderate  — warrants category tagging
 *   60–79  = high      — flag for review
 *   80–100 = critical  — immediate flag + event
 *
 * Cash-like MCCs that violate card network rules for business
 * card programs:
 *   6010, 6011, 6012 — ATM / cash disbursements
 *   6051             — Quasi-cash (crypto, prepaid, money orders)
 *   4829             — Money transfers / wire
 *   6540             — POI funding transactions
 */
export const MCC_RISK_MAP: Record<string, MccRiskProfile> = {
  // ── Critical / Cash-Like ────────────────────────────────────
  '6010': { label: 'Manual Cash Disbursements — Banks', riskScore: 95, isCashLike: true, category: 'cash_advance', suspiciousRail: false },
  '6011': { label: 'ATM Cash Disbursements', riskScore: 95, isCashLike: true, category: 'cash_advance', suspiciousRail: false },
  '6012': { label: 'Merchandise / Services — Customer Financial Institutions', riskScore: 85, isCashLike: true, category: 'cash_advance', suspiciousRail: false },
  '6051': { label: 'Quasi-Cash / Cryptocurrency / Stored Value', riskScore: 98, isCashLike: true, category: 'quasi_cash', suspiciousRail: true },
  '4829': { label: 'Money Transfer / Wire', riskScore: 90, isCashLike: true, category: 'money_transfer', suspiciousRail: true },
  '6540': { label: 'POI Funding Transactions', riskScore: 92, isCashLike: true, category: 'cash_advance', suspiciousRail: true },

  // ── High Risk — Suspicious Payment Rails ───────────────────
  '7995': { label: 'Gambling / Betting', riskScore: 80, isCashLike: false, category: 'gambling', suspiciousRail: true },
  '5933': { label: 'Pawn Shops', riskScore: 75, isCashLike: false, category: 'personal_likely', suspiciousRail: false },
  '6300': { label: 'Insurance — Not Elsewhere Classified', riskScore: 30, isCashLike: false, category: 'insurance', suspiciousRail: false },

  // ── Moderate — Personal-Use Likely ─────────────────────────
  '5411': { label: 'Grocery Stores / Supermarkets', riskScore: 55, isCashLike: false, category: 'personal_likely', suspiciousRail: false },
  '5812': { label: 'Restaurants / Eating Places', riskScore: 25, isCashLike: false, category: 'meals_entertainment', suspiciousRail: false },
  '5813': { label: 'Bars / Taverns / Liquor Stores', riskScore: 40, isCashLike: false, category: 'entertainment', suspiciousRail: false },
  '5999': { label: 'Miscellaneous Retail', riskScore: 35, isCashLike: false, category: 'retail', suspiciousRail: false },
  '7011': { label: 'Hotels / Lodging', riskScore: 20, isCashLike: false, category: 'travel', suspiciousRail: false },
  '7512': { label: 'Car Rental', riskScore: 20, isCashLike: false, category: 'travel', suspiciousRail: false },
  '4511': { label: 'Airlines / Air Carriers', riskScore: 15, isCashLike: false, category: 'travel', suspiciousRail: false },

  // ── Low Risk — Clearly Business ────────────────────────────
  '5940': { label: 'Bicycle / Sporting Goods', riskScore: 30, isCashLike: false, category: 'retail', suspiciousRail: false },
  '7372': { label: 'Computer Programming / Data Processing', riskScore: 5, isCashLike: false, category: 'technology', suspiciousRail: false },
  '7371': { label: 'Computer Repair', riskScore: 5, isCashLike: false, category: 'technology', suspiciousRail: false },
  '5045': { label: 'Computers / Peripherals / Software', riskScore: 5, isCashLike: false, category: 'technology', suspiciousRail: false },
  '5065': { label: 'Electrical Parts / Equipment', riskScore: 5, isCashLike: false, category: 'supplies', suspiciousRail: false },
  '5112': { label: 'Office / School Supplies', riskScore: 5, isCashLike: false, category: 'office_supplies', suspiciousRail: false },
  '5734': { label: 'Computer Software Stores', riskScore: 5, isCashLike: false, category: 'technology', suspiciousRail: false },
  '8011': { label: 'Medical Services', riskScore: 20, isCashLike: false, category: 'medical', suspiciousRail: false },
  '8049': { label: 'Optometrists / Ophthalmologists', riskScore: 20, isCashLike: false, category: 'medical', suspiciousRail: false },
  '8099': { label: 'Health Practitioners — Not Elsewhere Classified', riskScore: 20, isCashLike: false, category: 'medical', suspiciousRail: false },
};

/** MCC codes that always count as cash-like, regardless of mapping. */
export const CASH_LIKE_MCC_RANGES: Array<[number, number]> = [
  [6010, 6012],
  [6051, 6051],
  [4829, 4829],
  [6540, 6540],
];

/** Suspicious payment-rail MCC codes. */
export const SUSPICIOUS_RAIL_MCCS = new Set([
  '6051', '4829', '6540', '7995',
]);

// ── Input / Output Types ──────────────────────────────────────

export interface MccRiskProfile {
  label: string;
  riskScore: number;        // 0–100
  isCashLike: boolean;
  category: string;
  suspiciousRail: boolean;
}

export interface RecordTransactionInput {
  tenantId: string;
  businessId: string;
  cardApplicationId?: string;
  amount: number;
  merchantName?: string;
  mcc?: string;
  businessPurpose?: string;
  evidenceDocId?: string;
  transactionDate: string;
}

export interface TransactionRiskAssessment {
  riskScore: number;
  isCashLike: boolean;
  flagged: boolean;
  flagReason: string | null;
  mccCategory: string | null;
  suspiciousRail: boolean;
}

export interface RiskSummary {
  businessId: string;
  totalTransactions: number;
  totalAmount: number;
  flaggedCount: number;
  cashLikeCount: number;
  cashLikeAmount: number;
  averageRiskScore: number;
  chargebackRatio: number;
  highRiskTransactions: SpendTransaction[];
  cashLikeTransactions: SpendTransaction[];
  suspiciousRailTransactions: SpendTransaction[];
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export interface TransactionListFilters {
  mcc?: string;
  flagged?: boolean;
  isCashLike?: boolean;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  cardApplicationId?: string;
  page?: number;
  pageSize?: number;
}

export interface TransactionListResult {
  transactions: SpendTransaction[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Thresholds ────────────────────────────────────────────────

/** Chargeback ratio above which we alert (Visa standard: 1 %). */
const CHARGEBACK_RATIO_THRESHOLD = 0.01;

/** Risk score above which we flag a transaction for review. */
const RISK_SCORE_FLAG_THRESHOLD = 60;

// ── Service ───────────────────────────────────────────────────

export class SpendGovernanceService {
  private readonly prisma: PrismaClient;
  private readonly eventBus: EventBus;

  constructor(prisma?: PrismaClient, eventBus?: EventBus) {
    this.prisma = prisma ?? new PrismaClient();
    this.eventBus = eventBus ?? EventBus.getInstance();
  }

  // ── MCC Risk Scoring ─────────────────────────────────────────

  /**
   * Score an MCC code on a 0–100 risk scale.
   *
   * Algorithm:
   *   1. Direct MCC lookup → use mapped score.
   *   2. Numeric range check for cash-like bands (6010-6012, etc.).
   *   3. Default to 20 (low-moderate) if unknown.
   */
  scoreMcc(mcc: string | null | undefined): MccRiskProfile {
    if (!mcc) {
      return {
        label: 'Unknown MCC',
        riskScore: 20,
        isCashLike: false,
        category: 'unknown',
        suspiciousRail: false,
      };
    }

    // Direct lookup
    if (MCC_RISK_MAP[mcc]) {
      return MCC_RISK_MAP[mcc];
    }

    // Numeric range check for cash-like MCCs
    const mccNum = parseInt(mcc, 10);
    if (!isNaN(mccNum)) {
      for (const [lo, hi] of CASH_LIKE_MCC_RANGES) {
        if (mccNum >= lo && mccNum <= hi) {
          return {
            label: `Cash-Like MCC ${mcc}`,
            riskScore: 90,
            isCashLike: true,
            category: 'cash_advance',
            suspiciousRail: false,
          };
        }
      }
    }

    // Default: unknown merchant category
    return {
      label: `Unclassified MCC ${mcc}`,
      riskScore: 20,
      isCashLike: false,
      category: 'unclassified',
      suspiciousRail: false,
    };
  }

  /**
   * Assess transaction risk based on MCC, amount, and routing signals.
   * Returns the full risk assessment without persisting anything.
   */
  assessTransactionRisk(
    mcc: string | null | undefined,
    amount: number,
    merchantName?: string,
  ): TransactionRiskAssessment {
    const profile = this.scoreMcc(mcc);

    // Boost risk score for large cash-like amounts
    let riskScore = profile.riskScore;
    if (profile.isCashLike && amount > 500) {
      riskScore = Math.min(100, riskScore + 5);
    }
    if (profile.isCashLike && amount > 2000) {
      riskScore = Math.min(100, riskScore + 10);
    }

    // Suspicious merchant-name signals (P2P apps, crypto exchanges)
    const suspiciousNames = /venmo|zelle|cashapp|paypal|crypto|bitcoin|coinbase|binance|wire/i;
    const merchantSuspicious =
      merchantName != null && suspiciousNames.test(merchantName);
    if (merchantSuspicious) {
      riskScore = Math.min(100, riskScore + 15);
    }

    const flagged =
      profile.isCashLike ||
      profile.suspiciousRail ||
      merchantSuspicious ||
      riskScore >= RISK_SCORE_FLAG_THRESHOLD;

    const flagReasons: string[] = [];
    if (profile.isCashLike) {
      flagReasons.push(
        `Cash-like MCC ${mcc} (${profile.label}) violates card network business-use rules.`,
      );
    }
    if (profile.suspiciousRail) {
      flagReasons.push(
        `MCC ${mcc} indicates suspicious payment-rail routing (money transfer / quasi-cash).`,
      );
    }
    if (merchantSuspicious) {
      flagReasons.push(
        `Merchant name "${merchantName}" matches known P2P / crypto payment rail patterns.`,
      );
    }
    if (!profile.isCashLike && riskScore >= RISK_SCORE_FLAG_THRESHOLD) {
      flagReasons.push(
        `MCC risk score ${riskScore}/100 exceeds flag threshold ${RISK_SCORE_FLAG_THRESHOLD}.`,
      );
    }

    return {
      riskScore,
      isCashLike: profile.isCashLike,
      flagged,
      flagReason: flagReasons.length > 0 ? flagReasons.join(' | ') : null,
      mccCategory: profile.category,
      suspiciousRail: profile.suspiciousRail || merchantSuspicious,
    };
  }

  // ── Transaction Recording ────────────────────────────────────

  /**
   * Record a new spend transaction.
   *
   * Steps:
   *   1. Validate business belongs to tenant.
   *   2. Score MCC and assess risk.
   *   3. Persist SpendTransaction.
   *   4. Publish events for cash-like or high-risk transactions.
   */
  async recordTransaction(
    input: RecordTransactionInput,
  ): Promise<SpendTransaction> {
    const svc = logger.child({
      service: 'SpendGovernanceService',
      tenantId: input.tenantId,
      businessId: input.businessId,
    });

    // Verify business exists in this tenant
    const business = await this.prisma.business.findFirst({
      where: { id: input.businessId, tenantId: input.tenantId },
      select: { id: true, legalName: true },
    });
    if (!business) {
      throw new Error(
        `Business ${input.businessId} not found for tenant ${input.tenantId}.`,
      );
    }

    const assessment = this.assessTransactionRisk(
      input.mcc,
      input.amount,
      input.merchantName,
    );

    const transaction = await this.prisma.spendTransaction.create({
      data: {
        tenantId: input.tenantId,
        businessId: input.businessId,
        cardApplicationId: input.cardApplicationId ?? null,
        amount: input.amount,
        merchantName: input.merchantName ?? null,
        mcc: input.mcc ?? null,
        mccCategory: assessment.mccCategory,
        riskScore: assessment.riskScore,
        isCashLike: assessment.isCashLike,
        businessPurpose: input.businessPurpose ?? null,
        evidenceDocId: input.evidenceDocId ?? null,
        flagged: assessment.flagged,
        flagReason: assessment.flagReason,
        transactionDate: new Date(input.transactionDate),
      },
    });

    svc.info('Spend transaction recorded', {
      transactionId: transaction.id,
      mcc: input.mcc,
      riskScore: assessment.riskScore,
      isCashLike: assessment.isCashLike,
      flagged: assessment.flagged,
    });

    // Publish events for flagged transactions
    if (assessment.isCashLike) {
      await this.publishCashLikeDetected(input.tenantId, transaction, assessment);
    } else if (assessment.flagged) {
      await this.publishHighRiskTransaction(input.tenantId, transaction, assessment);
    }

    return transaction;
  }

  // ── Transaction Listing ──────────────────────────────────────

  /**
   * List transactions for a business with optional filters and
   * cursor-based pagination.
   */
  async listTransactions(
    tenantId: string,
    businessId: string,
    filters: TransactionListFilters = {},
  ): Promise<TransactionListResult> {
    // Verify tenant ownership
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 50, 200);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenantId, businessId };

    if (filters.mcc != null) where['mcc'] = filters.mcc;
    if (filters.flagged != null) where['flagged'] = filters.flagged;
    if (filters.isCashLike != null) where['isCashLike'] = filters.isCashLike;
    if (filters.cardApplicationId != null) {
      where['cardApplicationId'] = filters.cardApplicationId;
    }

    const dateRange: Record<string, Date> = {};
    if (filters.startDate) dateRange['gte'] = new Date(filters.startDate);
    if (filters.endDate) dateRange['lte'] = new Date(filters.endDate);
    if (Object.keys(dateRange).length > 0) {
      where['transactionDate'] = dateRange;
    }

    const amountRange: Record<string, number> = {};
    if (filters.minAmount != null) amountRange['gte'] = filters.minAmount;
    if (filters.maxAmount != null) amountRange['lte'] = filters.maxAmount;
    if (Object.keys(amountRange).length > 0) {
      where['amount'] = amountRange;
    }

    const [transactions, total] = await Promise.all([
      this.prisma.spendTransaction.findMany({
        where: where as Parameters<typeof this.prisma.spendTransaction.findMany>[0]['where'],
        orderBy: { transactionDate: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.spendTransaction.count({
        where: where as Parameters<typeof this.prisma.spendTransaction.count>[0]['where'],
      }),
    ]);

    return { transactions, total, page, pageSize };
  }

  // ── Risk Summary ─────────────────────────────────────────────

  /**
   * Compute an aggregate risk summary for a business covering:
   *   • Total / flagged / cash-like transaction counts and amounts
   *   • Average risk score
   *   • Chargeback ratio (flagged / total) as a proxy metric
   *   • Worst-case transactions for each risk category
   *   • Overall risk level determination
   *
   * IRS substantiation readiness: a high cash-like ratio indicates
   * inadequate business-purpose records that could trigger an audit.
   */
  async getRiskSummary(tenantId: string, businessId: string): Promise<RiskSummary> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    const all = await this.prisma.spendTransaction.findMany({
      where: { tenantId, businessId },
      orderBy: { transactionDate: 'desc' },
    });

    const totalTransactions = all.length;
    const totalAmount = all.reduce((sum, t) => sum + Number(t.amount), 0);

    const flagged = all.filter((t) => t.flagged);
    const cashLike = all.filter((t) => t.isCashLike);
    const cashLikeAmount = cashLike.reduce((sum, t) => sum + Number(t.amount), 0);

    const avgRiskScore =
      totalTransactions > 0
        ? all.reduce((sum, t) => sum + (t.riskScore ?? 0), 0) / totalTransactions
        : 0;

    // Chargeback ratio: flagged-to-total ratio (proxy — replace with
    // actual chargeback data when issuer webhook integration is live)
    const chargebackRatio = totalTransactions > 0
      ? flagged.length / totalTransactions
      : 0;

    if (chargebackRatio > CHARGEBACK_RATIO_THRESHOLD) {
      logger.warn('Chargeback ratio threshold exceeded', {
        tenantId,
        businessId,
        chargebackRatio: chargebackRatio.toFixed(4),
        threshold: CHARGEBACK_RATIO_THRESHOLD,
      });
    }

    const suspiciousRail = all.filter(
      (t) => t.mcc != null && SUSPICIOUS_RAIL_MCCS.has(t.mcc),
    );

    const highRisk = all
      .filter((t) => (t.riskScore ?? 0) >= RISK_SCORE_FLAG_THRESHOLD)
      .slice(0, 10);

    // Determine aggregate risk level
    let riskLevel: RiskSummary['riskLevel'] = 'low';
    if (cashLike.length > 0 || chargebackRatio > CHARGEBACK_RATIO_THRESHOLD) {
      riskLevel = 'critical';
    } else if (suspiciousRail.length > 0 || avgRiskScore >= 60) {
      riskLevel = 'high';
    } else if (avgRiskScore >= 40 || flagged.length > totalTransactions * 0.1) {
      riskLevel = 'moderate';
    }

    return {
      businessId,
      totalTransactions,
      totalAmount,
      flaggedCount: flagged.length,
      cashLikeCount: cashLike.length,
      cashLikeAmount,
      averageRiskScore: parseFloat(avgRiskScore.toFixed(2)),
      chargebackRatio: parseFloat(chargebackRatio.toFixed(4)),
      highRiskTransactions: highRisk,
      cashLikeTransactions: cashLike.slice(0, 10),
      suspiciousRailTransactions: suspiciousRail.slice(0, 10),
      riskLevel,
    };
  }

  // ── Internal Event Publishing ────────────────────────────────

  private async publishCashLikeDetected(
    tenantId: string,
    transaction: SpendTransaction,
    assessment: TransactionRiskAssessment,
  ): Promise<void> {
    try {
      await this.eventBus.publishAndPersist(tenantId, {
        eventType: 'spend.cash_like.detected',
        aggregateType: AGGREGATE_TYPES.BUSINESS,
        aggregateId: transaction.businessId,
        payload: {
          transactionId: transaction.id,
          businessId: transaction.businessId,
          amount: Number(transaction.amount),
          mcc: transaction.mcc,
          mccCategory: assessment.mccCategory,
          riskScore: assessment.riskScore,
          flagReason: assessment.flagReason,
          transactionDate: transaction.transactionDate.toISOString(),
        },
        metadata: {
          source: 'spend-governance-service',
          severity: 'critical',
          complianceNote:
            'Cash-like MCC violates card network commercial use rules and may trigger account closure.',
        },
      });
    } catch (err) {
      logger.error('Failed to publish spend.cash_like.detected event', {
        error: err instanceof Error ? err.message : String(err),
        transactionId: transaction.id,
      });
    }
  }

  private async publishHighRiskTransaction(
    tenantId: string,
    transaction: SpendTransaction,
    assessment: TransactionRiskAssessment,
  ): Promise<void> {
    try {
      await this.eventBus.publishAndPersist(tenantId, {
        eventType: EVENT_TYPES.RISK_ALERT_RAISED,
        aggregateType: AGGREGATE_TYPES.BUSINESS,
        aggregateId: transaction.businessId,
        payload: {
          transactionId: transaction.id,
          businessId: transaction.businessId,
          amount: Number(transaction.amount),
          mcc: transaction.mcc,
          riskScore: assessment.riskScore,
          suspiciousRail: assessment.suspiciousRail,
          flagReason: assessment.flagReason,
        },
        metadata: {
          source: 'spend-governance-service',
          severity: 'high',
        },
      });
    } catch (err) {
      logger.error('Failed to publish risk alert event', {
        error: err instanceof Error ? err.message : String(err),
        transactionId: transaction.id,
      });
    }
  }
}
