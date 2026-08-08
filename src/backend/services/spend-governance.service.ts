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
import { prisma as sharedPrisma } from '../config/database.js';
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

/**
 * Why this shape has no ratio field.
 *
 * It carried `chargebackRatio`, which was `flagged / total` — not a
 * chargeback rate. No chargeback data exists anywhere in this system
 * (grep the Prisma schema; there is no such column). Rendered to an
 * advisor it asserted that a client had chargebacks, from a numerator
 * that counted something else entirely.
 *
 * It is not renamed to `flaggedRatio` because `flaggedCount` and
 * `totalTransactions` are both already here and the ratio is derivable
 * from them. A bare scalar with its denominator detached is the form
 * that invited the misread in the first place: 0.5 from a denominator
 * of 2 rendered identically to 0.5 from a denominator of 200. Callers
 * render "N of M", so the denominator travels with the number.
 */
export interface RiskSummary {
  businessId: string;
  totalTransactions: number;
  totalAmount: number;
  flaggedCount: number;
  cashLikeCount: number;
  cashLikeAmount: number;
  highRiskCount: number;
  suspiciousRailCount: number;

  /**
   * Rows are `null` on `riskScore` until something scores them, and the
   * seed writes them that way. Summing with `?? 0` made an unscored book
   * average to 0 — the lowest possible risk — so "nothing has been
   * scored" and "everything is safe" produced the same number.
   *
   * Both are `null` when no row carries a score, and `scoredCount` says
   * how many of `totalTransactions` are behind them.
   */
  averageRiskScore: number | null;
  maxRiskScore: number | null;
  scoredCount: number;

  /**
   * The rows behind `flaggedCount`.
   *
   * The three category arrays below do not cover it: each keys off a
   * different field (`riskScore`, `isCashLike`, `mcc`) and `flagged` is
   * a fourth, independent one. `assessTransactionRisk` can flag on
   * merchant name alone — a $50 Zelle transfer at MCC 5812 scores 40,
   * is not cash-like and is not on a suspicious rail, so it appears in
   * none of the three. Without this array, that flag is a number on a
   * screen with no row an advisor can open.
   */
  flaggedTransactions: SpendTransaction[];

  highRiskTransactions: SpendTransaction[];
  cashLikeTransactions: SpendTransaction[];
  suspiciousRailTransactions: SpendTransaction[];

  /** Sample cap applied to every array above; the `*Count` fields are exact. */
  sampleLimit: number;

  riskLevel: 'low' | 'moderate' | 'high' | 'critical';

  /**
   * The terms that fired, in the order tested. A level with no evidence
   * beside it is a verdict an advisor cannot check, and the sample it
   * rests on belongs next to it: `critical` off one cash-like row is a
   * real finding, but the reader has to be able to see that it is one row.
   */
  riskLevelBasis: string[];
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

/** Risk score above which we flag a transaction for review. */
const RISK_SCORE_FLAG_THRESHOLD = 60;

/** Risk score above which a single transaction lifts the book to moderate. */
const RISK_SCORE_MODERATE_THRESHOLD = 40;

/**
 * Rows returned per category array. The `*Count` fields alongside them are
 * exact and uncapped, and `sampleLimit` ships in the response so a caller
 * can say "showing 10 of 34" rather than silently presenting a sample as
 * the whole set.
 */
const SUMMARY_SAMPLE_LIMIT = 10;

// ── Service ───────────────────────────────────────────────────

export class SpendGovernanceService {
  private readonly prisma: PrismaClient;
  private readonly eventBus: EventBus;

  constructor(prisma?: PrismaClient, eventBus?: EventBus) {
    this.prisma = prisma ?? sharedPrisma;
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
        where: where as NonNullable<Parameters<typeof this.prisma.spendTransaction.findMany>[0]>['where'],
        orderBy: { transactionDate: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.spendTransaction.count({
        where: where as NonNullable<Parameters<typeof this.prisma.spendTransaction.count>[0]>['where'],
      }),
    ]);

    return { transactions, total, page, pageSize };
  }

  // ── Risk Summary ─────────────────────────────────────────────

  /**
   * Compute an aggregate risk summary for a business covering:
   *   • Total / flagged / cash-like / high-risk / suspicious-rail counts
   *   • Average and maximum risk score over *scored* rows, with the
   *     scored count so the reader knows the denominator
   *   • The rows behind each count, capped at `sampleLimit`
   *   • Overall risk level, with the terms that produced it
   *
   * Every count in here ships with the rows behind it. A count an
   * advisor cannot trace to a transaction is an accusation with no
   * evidence attached, and this summary previously reported
   * `flaggedCount: 1` with no array containing that row.
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

    const suspiciousRail = all.filter(
      (t) => t.mcc != null && SUSPICIOUS_RAIL_MCCS.has(t.mcc),
    );

    // Scored rows only. An unscored row is absent evidence, not a zero, and
    // averaging `?? 0` over it moves the result toward "safe" — the one
    // direction a risk figure must never drift on its own.
    const scores = all
      .map((t) => t.riskScore)
      .filter((s): s is number => s != null);

    const averageRiskScore =
      scores.length > 0
        ? parseFloat(
            (scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(2),
          )
        : null;
    const maxRiskScore = scores.length > 0 ? Math.max(...scores) : null;

    const highRisk = all.filter(
      (t) => t.riskScore != null && t.riskScore >= RISK_SCORE_FLAG_THRESHOLD,
    );

    // ── Risk level ────────────────────────────────────────────
    //
    // Every term is a count of a categorically-defined event, or a single
    // transaction's own score. None is a rate. A rate needs a denominator
    // the reader cannot see, and the two that used to be here — a
    // flagged-to-total ratio measured against the Visa *chargeback*
    // standard of 1 %, and a mean polluted by unscored rows — produced a
    // level that was neither checkable nor, in the seed's case, true.
    //
    // Counts mean the same thing at n=1 as at n=200. One cash-like
    // withdrawal on a two-week-old account is critical on its first day,
    // which is exactly when a minimum-sample rule would have hidden it.
    // The sample travels in `riskLevelBasis` instead, so the reader
    // discounts it themselves.
    const basis: string[] = [];
    let riskLevel: RiskSummary['riskLevel'] = 'low';

    if (cashLike.length > 0) {
      riskLevel = 'critical';
      basis.push(
        `${cashLike.length} cash-like transaction${cashLike.length === 1 ? '' : 's'} — violates card network commercial-use rules`,
      );
    } else if (suspiciousRail.length > 0 || (maxRiskScore ?? 0) >= RISK_SCORE_FLAG_THRESHOLD) {
      riskLevel = 'high';
      if (suspiciousRail.length > 0) {
        basis.push(
          `${suspiciousRail.length} transaction${suspiciousRail.length === 1 ? '' : 's'} on a suspicious payment rail`,
        );
      }
      if ((maxRiskScore ?? 0) >= RISK_SCORE_FLAG_THRESHOLD) {
        basis.push(
          `highest transaction risk score ${maxRiskScore}/100 (threshold ${RISK_SCORE_FLAG_THRESHOLD})`,
        );
      }
    } else if (flagged.length > 0 || (maxRiskScore ?? 0) >= RISK_SCORE_MODERATE_THRESHOLD) {
      riskLevel = 'moderate';
      if (flagged.length > 0) {
        basis.push(
          `${flagged.length} of ${totalTransactions} transaction${totalTransactions === 1 ? '' : 's'} flagged`,
        );
      }
      if ((maxRiskScore ?? 0) >= RISK_SCORE_MODERATE_THRESHOLD) {
        basis.push(
          `highest transaction risk score ${maxRiskScore}/100 (threshold ${RISK_SCORE_MODERATE_THRESHOLD})`,
        );
      }
    } else if (totalTransactions === 0) {
      basis.push('No transaction is on record');
    } else {
      basis.push(
        `No cash-like, suspicious-rail or flagged transaction among ${totalTransactions}`,
      );
    }

    // The score-driven terms are the ones that go quiet on unscored rows,
    // so say when they could not have fired rather than letting `low` read
    // as a measurement that was taken.
    if (scores.length < totalTransactions) {
      basis.push(
        `${totalTransactions - scores.length} of ${totalTransactions} transaction${totalTransactions === 1 ? '' : 's'} carry no risk score`,
      );
    }

    if (flagged.length > 0) {
      logger.info('Flagged transactions present in risk summary', {
        tenantId,
        businessId,
        flaggedCount: flagged.length,
        totalTransactions,
        riskLevel,
      });
    }

    return {
      businessId,
      totalTransactions,
      totalAmount,
      flaggedCount: flagged.length,
      cashLikeCount: cashLike.length,
      cashLikeAmount,
      highRiskCount: highRisk.length,
      suspiciousRailCount: suspiciousRail.length,
      averageRiskScore,
      maxRiskScore,
      scoredCount: scores.length,
      flaggedTransactions: flagged.slice(0, SUMMARY_SAMPLE_LIMIT),
      highRiskTransactions: highRisk.slice(0, SUMMARY_SAMPLE_LIMIT),
      cashLikeTransactions: cashLike.slice(0, SUMMARY_SAMPLE_LIMIT),
      suspiciousRailTransactions: suspiciousRail.slice(0, SUMMARY_SAMPLE_LIMIT),
      sampleLimit: SUMMARY_SAMPLE_LIMIT,
      riskLevel,
      riskLevelBasis: basis,
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
