// ============================================================
// CapitalForge — Funding Strategy Simulator Service
//
// Scenario lab that lets advisors and clients explore funding
// strategies before committing to a real application run.
//
// Core capabilities:
//   1. Multi-round stack modeling — projects approvals,
//      credit totals, and round timing across up to 4 rounds.
//   2. Approval probability engine — per-card and aggregate
//      probability surfaces for a given profile.
//   3. Worst-case repayment path with interest shock — models
//      what happens when all intro APR windows expire at once.
//   4. Alternative product comparison — stacking vs SBA 7(a)
//      vs traditional line of credit vs MCA.
//   5. What-if parameter overrides — change FICO, revenue,
//      or existing debt to see the delta in outcomes.
//
// No database writes are performed — all results are
// in-memory and returned directly to the caller.
// ============================================================

import {
  StackingOptimizerService,
  type OptimizerInput,
  type PersonalCreditProfile,
} from './stacking-optimizer.service.js';

// ============================================================
// Input / Output Types
// ============================================================

export interface SimulatorProfile {
  /** Personal FICO score (300–850) */
  ficoScore: number;
  /** Personal revolving utilization 0–1 */
  utilizationRatio: number;
  /** Derogatory marks */
  derogatoryCount: number;
  /** Hard inquiries in last 12 months */
  inquiries12m: number;
  /** Total credit age in months */
  creditAgeMonths: number;
  /** Annual business revenue (USD) */
  annualRevenue: number;
  /** Years the business has been operating */
  yearsInOperation: number;
  /** Total existing business debt (USD) */
  existingDebt: number;
  /** Target total new credit to acquire */
  targetCreditLimit: number;
  /** Business identifier (optional for sandbox runs) */
  businessId?: string;
}

export interface WhatIfOverrides {
  ficoScore?: number;
  utilizationRatio?: number;
  derogatoryCount?: number;
  inquiries12m?: number;
  creditAgeMonths?: number;
  annualRevenue?: number;
  existingDebt?: number;
}

// ── Multi-round stack model ───────────────────────────────────

export interface RoundProjection {
  roundNumber: number;
  /** Cards recommended this round */
  cardCount: number;
  /** Sum of estimated credit limits for this round */
  estimatedCreditTotal: number;
  /** Weighted average approval probability across cards in round */
  avgApprovalProbability: number;
  /** Recommended days to wait before this round (0 for round 1) */
  recommendedDelayDays: number;
  /** Projected aggregate FICO impact (inquiry reduction) */
  ficoImpactEstimate: number;
  /** Running cumulative credit after this round */
  cumulativeCreditTotal: number;
}

export interface MultiRoundModel {
  rounds: RoundProjection[];
  totalEstimatedCredit: number;
  totalCards: number;
  targetMet: boolean;
  totalDuration: string;
  /** Confidence rating: 'high' | 'medium' | 'low' */
  confidenceRating: 'high' | 'medium' | 'low';
}

// ── Approval probability ────────────────────────────────────

export interface ApprovalProbabilityReport {
  overallStackApprovalRate: number;
  atLeastOneApproval: number;
  allApprovedProbability: number;
  cardBreakdown: Array<{
    issuer: string;
    cardName: string;
    approvalProbability: number;
    minFicoRequired: number;
    ficoGap: number;
  }>;
  riskFactors: string[];
  positiveFactors: string[];
}

// ── Interest shock / worst-case repayment ───────────────────

export interface RepaymentMonthSnapshot {
  month: number;
  remainingBalance: number;
  interestCharge: number;
  requiredPayment: number;
  isShockMonth: boolean;
}

export interface WorstCaseRepaymentPath {
  /** Month index (1-based) when all intro APRs expire */
  interestShockMonth: number;
  /** Total balance at shock month */
  balanceAtShock: number;
  /** New minimum monthly payment after shock */
  postShockMonthlyPayment: number;
  /** Pre-shock (intro) monthly payment */
  preShockMonthlyPayment: number;
  /** Payment increase ratio (postShock / preShock) */
  paymentIncreaseRatio: number;
  /** Total interest cost over 24 months in worst case */
  totalInterest24m: number;
  /** Monthly snapshots for chart rendering (24 months) */
  monthlySchedule: RepaymentMonthSnapshot[];
  /** Revenue coverage ratio: revenue / postShockPayment */
  revenueCoverageRatio: number;
  /** Whether revenue adequately covers post-shock payments */
  isSustainable: boolean;
  /** Advisor alerts */
  alerts: string[];
}

// ── Alternative product comparison ─────────────────────────

export interface ProductOption {
  productType: 'credit_card_stack' | 'sba_7a' | 'line_of_credit' | 'mca';
  productName: string;
  estimatedAmount: number;
  /** Effective annual cost rate (APR or factor equivalent) */
  effectiveApr: number;
  /** Typical approval timeline in business days */
  approvalTimelineDays: number;
  /** Estimated approval probability for this business profile */
  approvalProbability: number;
  /** Monthly payment estimate */
  estimatedMonthlyPayment: number;
  /** Total cost over 24 months */
  totalCost24m: number;
  pros: string[];
  cons: string[];
  /** Suitability score 0–100 for this profile */
  suitabilityScore: number;
}

export interface AlternativeComparison {
  profileSummary: {
    ficoScore: number;
    annualRevenue: number;
    existingDebt: number;
    debtServiceRatio: number;
  };
  options: ProductOption[];
  recommendation: {
    primaryChoice: ProductOption['productType'];
    rationale: string;
    warnings: string[];
  };
}

// ── Scenario result ──────────────────────────────────────────

export interface ScenarioResult {
  scenarioId: string;
  generatedAt: string;
  label: string;
  profile: SimulatorProfile;
  appliedOverrides: WhatIfOverrides | null;
  multiRoundModel: MultiRoundModel;
  approvalProbabilityReport: ApprovalProbabilityReport;
  worstCaseRepayment: WorstCaseRepaymentPath;
  alternativeComparison: AlternativeComparison;
  /** Delta metrics when comparing against a baseline scenario */
  deltaVsBaseline?: ScenarioDelta;
}

export interface ScenarioDelta {
  ficoScoreDelta: number;
  creditTotalDelta: number;
  approvalRateDelta: number;
  totalInterestDelta: number;
  monthlyPaymentDelta: number;
}

// ============================================================
// Constants
// ============================================================

const DEFAULT_INTRO_APR_MONTHS = 15;
const DEFAULT_INTRO_APR = 0;
const DEFAULT_REGULAR_APR = 0.2199;  // 21.99 %
const CASH_ADVANCE_APR_PREMIUM = 0.05;
const ROUND_DELAY_DAYS = [0, 45, 90, 135];

// SBA 7(a) benchmarks
const SBA_7A_APR = 0.1125;       // Prime + ~2.75% as of 2025
const SBA_7A_TIMELINE_DAYS = 60;
const SBA_7A_MAX_LOAN = 5_000_000;

// Traditional LOC benchmarks
const LOC_APR = 0.0875;
const LOC_TIMELINE_DAYS = 30;
const LOC_MAX = 500_000;

// MCA benchmarks
const MCA_FACTOR_RATE = 1.35;    // effective APR ~80–150%
const MCA_EFFECTIVE_APR = 0.98;
const MCA_TIMELINE_DAYS = 3;

// ============================================================
// FundingSimulatorService
// ============================================================

export class FundingSimulatorService {
  private readonly optimizer: StackingOptimizerService;

  constructor(optimizer?: StackingOptimizerService) {
    this.optimizer = optimizer ?? new StackingOptimizerService();
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Run a full scenario simulation.  Applies optional what-if
   * overrides to the base profile before computing all outputs.
   */
  runScenario(
    profile: SimulatorProfile,
    label = 'Scenario',
    overrides?: WhatIfOverrides,
  ): ScenarioResult {
    const effective = this._applyOverrides(profile, overrides);
    const optimizerResult = this._runOptimizer(effective);

    const multiRoundModel = this._buildMultiRoundModel(optimizerResult);
    const approvalReport = this._buildApprovalReport(optimizerResult, effective);
    const worstCase = this._buildWorstCaseRepayment(optimizerResult, effective);
    const altComparison = this._buildAlternativeComparison(effective);

    return {
      scenarioId: this._uuid(),
      generatedAt: new Date().toISOString(),
      label,
      profile: effective,
      appliedOverrides: overrides ?? null,
      multiRoundModel,
      approvalProbabilityReport: approvalReport,
      worstCaseRepayment: worstCase,
      alternativeComparison: altComparison,
    };
  }

  /**
   * Compare two scenarios and compute delta metrics.
   */
  compareScenarios(
    baseline: ScenarioResult,
    alternative: ScenarioResult,
  ): { baseline: ScenarioResult; alternative: ScenarioResult; delta: ScenarioDelta } {
    const delta: ScenarioDelta = {
      ficoScoreDelta: alternative.profile.ficoScore - baseline.profile.ficoScore,
      creditTotalDelta:
        alternative.multiRoundModel.totalEstimatedCredit -
        baseline.multiRoundModel.totalEstimatedCredit,
      approvalRateDelta:
        alternative.approvalProbabilityReport.overallStackApprovalRate -
        baseline.approvalProbabilityReport.overallStackApprovalRate,
      totalInterestDelta:
        alternative.worstCaseRepayment.totalInterest24m -
        baseline.worstCaseRepayment.totalInterest24m,
      monthlyPaymentDelta:
        alternative.worstCaseRepayment.postShockMonthlyPayment -
        baseline.worstCaseRepayment.postShockMonthlyPayment,
    };

    return {
      baseline: { ...baseline, deltaVsBaseline: undefined },
      alternative: { ...alternative, deltaVsBaseline: delta },
      delta,
    };
  }

  // ── Private — optimizer bridge ─────────────────────────────

  private _runOptimizer(
    profile: SimulatorProfile,
  ): ReturnType<StackingOptimizerService['optimize']> {
    const input: OptimizerInput = {
      personalCredit: {
        ficoScore: profile.ficoScore,
        utilizationRatio: profile.utilizationRatio,
        derogatoryCount: profile.derogatoryCount,
        inquiries12m: profile.inquiries12m,
        creditAgeMonths: profile.creditAgeMonths,
      } satisfies PersonalCreditProfile,
      businessProfile: {
        businessId: profile.businessId ?? 'simulator-run',
        yearsInOperation: profile.yearsInOperation,
        annualRevenue: profile.annualRevenue,
        targetCreditLimit: profile.targetCreditLimit,
      },
      existingCards: [],
      recentApplicationDates: [],
      excludeCardIds: [],
    };

    return this.optimizer.optimize(input);
  }

  // ── Private — multi-round model ────────────────────────────

  private _buildMultiRoundModel(
    result: ReturnType<StackingOptimizerService['optimize']>,
  ): MultiRoundModel {
    const rounds = result.plan.rounds;
    const projections: RoundProjection[] = [];
    let cumulative = 0;
    let totalDays = 0;

    for (let i = 0; i < rounds.length; i++) {
      const roundCards = rounds[i];
      if (!roundCards || roundCards.length === 0) continue;

      const roundCredit = roundCards.reduce(
        (s, rc) => s + rc.estimatedCreditLimit,
        0,
      );
      const avgProb =
        roundCards.reduce((s, rc) => s + rc.approvalProbability, 0) /
        roundCards.length;

      const delayDays = ROUND_DELAY_DAYS[i] ?? i * 45;
      totalDays += delayDays;
      cumulative += roundCredit;

      // Each card in a round costs approximately -5 FICO from inquiries
      const ficoImpact = -(roundCards.length * 5);

      projections.push({
        roundNumber: i + 1,
        cardCount: roundCards.length,
        estimatedCreditTotal: roundCredit,
        avgApprovalProbability: parseFloat(avgProb.toFixed(4)),
        recommendedDelayDays: delayDays,
        ficoImpactEstimate: ficoImpact,
        cumulativeCreditTotal: cumulative,
      });
    }

    const totalCards = result.plan.summary.totalCards;
    const totalEstimatedCredit = result.plan.totalEstimatedCredit;
    const avgApproval = result.plan.summary.approvalScoreAvg / 40; // convert back to 0-1

    let confidenceRating: MultiRoundModel['confidenceRating'];
    if (avgApproval >= 0.75) {
      confidenceRating = 'high';
    } else if (avgApproval >= 0.50) {
      confidenceRating = 'medium';
    } else {
      confidenceRating = 'low';
    }

    const totalMonths = Math.ceil(totalDays / 30);
    const durationLabel =
      totalMonths <= 1
        ? '< 1 month'
        : `~${totalMonths} months`;

    return {
      rounds: projections,
      totalEstimatedCredit,
      totalCards,
      targetMet: result.plan.summary.targetCreditLimitMet,
      totalDuration: durationLabel,
      confidenceRating,
    };
  }

  // ── Private — approval probability report ─────────────────

  private _buildApprovalReport(
    result: ReturnType<StackingOptimizerService['optimize']>,
    profile: SimulatorProfile,
  ): ApprovalProbabilityReport {
    const allCards = result.plan.allCards;
    const riskFactors: string[] = [];
    const positiveFactors: string[] = [];

    // Build per-card breakdown
    const cardBreakdown = allCards.map((rc) => ({
      issuer: rc.card.issuer,
      cardName: rc.card.name,
      approvalProbability: rc.approvalProbability,
      minFicoRequired: rc.card.minFicoEstimate,
      ficoGap: profile.ficoScore - rc.card.minFicoEstimate,
    }));

    // Aggregate probabilities
    const overallStackApprovalRate =
      allCards.length > 0
        ? allCards.reduce((s, rc) => s + rc.approvalProbability, 0) /
          allCards.length
        : 0;

    // P(at least one approval) = 1 - P(all declined)
    const pAllDeclined = allCards.reduce(
      (p, rc) => p * (1 - rc.approvalProbability),
      1,
    );
    const atLeastOneApproval = 1 - pAllDeclined;

    // P(all approved) = product of individual probabilities
    const allApprovedProbability = allCards.reduce(
      (p, rc) => p * rc.approvalProbability,
      1,
    );

    // Risk factors
    if (profile.ficoScore < 680) {
      riskFactors.push(`FICO ${profile.ficoScore} is below the 680 threshold preferred by most premium card issuers.`);
    }
    if (profile.utilizationRatio > 0.5) {
      riskFactors.push(`Utilization at ${(profile.utilizationRatio * 100).toFixed(0)}% will suppress approval odds and credit limit offers.`);
    }
    if (profile.derogatoryCount > 0) {
      riskFactors.push(`${profile.derogatoryCount} derogatory mark(s) on file — issuers apply a significant penalty.`);
    }
    if (profile.inquiries12m > 5) {
      riskFactors.push(`${profile.inquiries12m} inquiries in the past 12 months signals application velocity risk.`);
    }
    if (profile.existingDebt > profile.annualRevenue * 0.5) {
      riskFactors.push('Existing debt exceeds 50% of annual revenue — debt-service ratio is elevated.');
    }

    // Positive factors
    if (profile.ficoScore >= 750) {
      positiveFactors.push(`Strong FICO ${profile.ficoScore} qualifies for premium products with higher credit limits.`);
    }
    if (profile.utilizationRatio < 0.2) {
      positiveFactors.push('Low utilization signals responsible credit management to issuers.');
    }
    if (profile.derogatoryCount === 0) {
      positiveFactors.push('Clean credit file with no derogatory marks.');
    }
    if (profile.annualRevenue >= 500_000) {
      positiveFactors.push(`Annual revenue of $${profile.annualRevenue.toLocaleString()} supports substantial credit lines.`);
    }
    if (profile.yearsInOperation >= 3) {
      positiveFactors.push(`${profile.yearsInOperation} years in operation demonstrates business stability.`);
    }

    return {
      overallStackApprovalRate: parseFloat(overallStackApprovalRate.toFixed(4)),
      atLeastOneApproval: parseFloat(atLeastOneApproval.toFixed(4)),
      allApprovedProbability: parseFloat(allApprovedProbability.toFixed(4)),
      cardBreakdown,
      riskFactors,
      positiveFactors,
    };
  }

  // ── Private — worst-case repayment ─────────────────────────

  private _buildWorstCaseRepayment(
    result: ReturnType<StackingOptimizerService['optimize']>,
    profile: SimulatorProfile,
  ): WorstCaseRepaymentPath {
    const totalCredit = result.plan.totalEstimatedCredit;
    // Worst case: 80% utilization of all approved credit
    const drawdownBalance = totalCredit * 0.80;

    // Pre-shock: all balances at 0% intro APR
    const preShockMonthlyPayment = drawdownBalance * 0.02; // 2% min payment

    // Interest shock occurs when all intro APRs expire simultaneously
    const interestShockMonth = DEFAULT_INTRO_APR_MONTHS + 1;
    const balanceAtShock = drawdownBalance; // worst case: no paydown during intro

    // Post-shock: full regular APR on total balance
    const monthlyRate = DEFAULT_REGULAR_APR / 12;
    const postShockInterestCharge = balanceAtShock * monthlyRate;
    const postShockMonthlyPayment = Math.max(
      balanceAtShock * 0.02,              // 2% min payment
      postShockInterestCharge + 50,       // interest + small principal
    );
    const paymentIncreaseRatio = postShockMonthlyPayment / Math.max(preShockMonthlyPayment, 1);

    // Build 24-month schedule
    const monthlySchedule: RepaymentMonthSnapshot[] = [];
    let runningBalance = drawdownBalance;
    let totalInterest = 0;

    for (let month = 1; month <= 24; month++) {
      const isShockMonth = month === interestShockMonth;
      const isPreShock = month < interestShockMonth;

      const interestCharge = isPreShock
        ? 0
        : runningBalance * monthlyRate;

      const payment = isPreShock
        ? preShockMonthlyPayment
        : postShockMonthlyPayment;

      totalInterest += interestCharge;
      runningBalance = Math.max(0, runningBalance + interestCharge - payment);

      monthlySchedule.push({
        month,
        remainingBalance: Math.round(runningBalance),
        interestCharge: Math.round(interestCharge),
        requiredPayment: Math.round(payment),
        isShockMonth,
      });
    }

    // Revenue sustainability check
    const monthlyRevenue = profile.annualRevenue / 12;
    const revenueCoverageRatio = monthlyRevenue / Math.max(postShockMonthlyPayment, 1);
    const isSustainable = revenueCoverageRatio >= 5; // post-shock payment < 20% of monthly revenue

    const alerts: string[] = [];
    if (!isSustainable) {
      alerts.push(
        `Post-shock payment of $${Math.round(postShockMonthlyPayment).toLocaleString()}/mo represents ` +
        `${(100 / revenueCoverageRatio).toFixed(0)}% of monthly revenue — exceeds the 20% safe threshold.`,
      );
    }
    if (paymentIncreaseRatio > 3) {
      alerts.push(
        `Payment will increase ${paymentIncreaseRatio.toFixed(1)}x when intro APR windows expire. ` +
        `Client must plan for this transition before month ${interestShockMonth}.`,
      );
    }
    if (drawdownBalance > profile.annualRevenue) {
      alerts.push('Total drawn balance exceeds annual revenue — elevated repayment risk if revenue dips.');
    }

    return {
      interestShockMonth,
      balanceAtShock: Math.round(balanceAtShock),
      postShockMonthlyPayment: Math.round(postShockMonthlyPayment),
      preShockMonthlyPayment: Math.round(preShockMonthlyPayment),
      paymentIncreaseRatio: parseFloat(paymentIncreaseRatio.toFixed(2)),
      totalInterest24m: Math.round(totalInterest),
      monthlySchedule,
      revenueCoverageRatio: parseFloat(revenueCoverageRatio.toFixed(2)),
      isSustainable,
      alerts,
    };
  }

  // ── Private — alternative product comparison ───────────────

  private _buildAlternativeComparison(
    profile: SimulatorProfile,
  ): AlternativeComparison {
    const monthlyRevenue = profile.annualRevenue / 12;
    const dscr = monthlyRevenue > 0
      ? (monthlyRevenue - profile.existingDebt / 12) / monthlyRevenue
      : 0;

    const options: ProductOption[] = [
      this._buildStackingOption(profile),
      this._buildSBAOption(profile),
      this._buildLOCOption(profile),
      this._buildMCAOption(profile),
    ];

    // Determine best recommendation
    const primaryChoice = this._pickBestProduct(profile, options);
    const chosen = options.find((o) => o.productType === primaryChoice)!;

    const warnings: string[] = [];
    if (profile.ficoScore < 620) {
      warnings.push('FICO below 620 severely restricts traditional financing options.');
    }
    if (dscr < 0.15) {
      warnings.push('Debt-service coverage ratio is tight — additional debt may create cash flow strain.');
    }
    if (profile.yearsInOperation < 2) {
      warnings.push('Businesses under 2 years in operation do not qualify for SBA 7(a) programs.');
    }

    return {
      profileSummary: {
        ficoScore: profile.ficoScore,
        annualRevenue: profile.annualRevenue,
        existingDebt: profile.existingDebt,
        debtServiceRatio: parseFloat(((profile.existingDebt / Math.max(profile.annualRevenue, 1)) * 100).toFixed(1)),
      },
      options,
      recommendation: {
        primaryChoice,
        rationale: `${chosen.productName} offers the highest suitability score (${chosen.suitabilityScore}/100) for this profile given FICO ${profile.ficoScore}, $${profile.annualRevenue.toLocaleString()} revenue, and ${profile.yearsInOperation} years in operation.`,
        warnings,
      },
    };
  }

  private _buildStackingOption(profile: SimulatorProfile): ProductOption {
    const estimatedAmount = Math.min(profile.targetCreditLimit, profile.annualRevenue * 0.8);
    const postShockApr = DEFAULT_REGULAR_APR;
    const monthly = estimatedAmount * 0.80 * (postShockApr / 12);
    const total24m = monthly * 9; // only 9 months of interest in 24m (15m intro + 9m post)

    let suitability = 60;
    if (profile.ficoScore >= 720) suitability += 20;
    else if (profile.ficoScore >= 680) suitability += 10;
    if (profile.utilizationRatio < 0.3) suitability += 10;
    if (profile.derogatoryCount === 0) suitability += 10;
    suitability = Math.min(100, suitability);

    const approvalProb = profile.ficoScore >= 720 ? 0.85
      : profile.ficoScore >= 680 ? 0.70
      : profile.ficoScore >= 640 ? 0.50
      : 0.25;

    return {
      productType: 'credit_card_stack',
      productName: 'Credit Card Stacking',
      estimatedAmount,
      effectiveApr: postShockApr,
      approvalTimelineDays: 14,
      approvalProbability: approvalProb,
      estimatedMonthlyPayment: Math.round(monthly),
      totalCost24m: Math.round(total24m),
      pros: [
        '0% intro APR window (typically 12–21 months) for interest-free leverage.',
        'No collateral required.',
        'Fast approval (1–2 weeks).',
        'Revolving access — can reuse paid-down credit.',
        'Rewards and benefits offset effective cost.',
      ],
      cons: [
        'Interest shock when intro APR expires.',
        'Requires strong personal credit.',
        'Multiple hard inquiries affect FICO temporarily.',
        'Annual fees on premium cards.',
      ],
      suitabilityScore: suitability,
    };
  }

  private _buildSBAOption(profile: SimulatorProfile): ProductOption {
    const maxEligible = Math.min(SBA_7A_MAX_LOAN, profile.annualRevenue * 3);
    const amount = Math.min(profile.targetCreditLimit, maxEligible);
    const termMonths = 84; // 7 years typical
    const monthlyRate = SBA_7A_APR / 12;
    const monthly = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
    const total24m = monthly * 24;

    let suitability = 50;
    if (profile.yearsInOperation >= 2) suitability += 15;
    if (profile.ficoScore >= 680) suitability += 15;
    if (profile.annualRevenue >= 250_000) suitability += 10;
    if (profile.existingDebt / Math.max(profile.annualRevenue, 1) < 0.4) suitability += 10;
    if (profile.yearsInOperation < 2) suitability -= 30; // disqualifying
    suitability = Math.max(0, Math.min(100, suitability));

    const approvalProb = (profile.ficoScore >= 680 && profile.yearsInOperation >= 2) ? 0.65
      : profile.yearsInOperation < 2 ? 0.05
      : 0.35;

    return {
      productType: 'sba_7a',
      productName: 'SBA 7(a) Loan',
      estimatedAmount: amount,
      effectiveApr: SBA_7A_APR,
      approvalTimelineDays: SBA_7A_TIMELINE_DAYS,
      approvalProbability: approvalProb,
      estimatedMonthlyPayment: Math.round(monthly),
      totalCost24m: Math.round(total24m),
      pros: [
        `Low fixed APR (~${(SBA_7A_APR * 100).toFixed(2)}%).`,
        'Longer repayment terms reduce monthly payment burden.',
        'Government guarantee lowers lender risk.',
      ],
      cons: [
        'Requires 2+ years in business.',
        '60-day approval timeline.',
        'Extensive documentation required.',
        'Collateral often required for amounts > $25k.',
        'Personal guarantee required.',
      ],
      suitabilityScore: suitability,
    };
  }

  private _buildLOCOption(profile: SimulatorProfile): ProductOption {
    const amount = Math.min(profile.targetCreditLimit, LOC_MAX, profile.annualRevenue * 0.5);
    const termMonths = 24;
    const monthlyRate = LOC_APR / 12;
    const monthly = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
    const total24m = monthly * 24;

    let suitability = 45;
    if (profile.ficoScore >= 700) suitability += 20;
    else if (profile.ficoScore >= 660) suitability += 10;
    if (profile.annualRevenue >= 200_000) suitability += 15;
    if (profile.yearsInOperation >= 1) suitability += 10;
    if (profile.existingDebt < profile.annualRevenue * 0.3) suitability += 10;
    suitability = Math.min(100, suitability);

    const approvalProb = profile.ficoScore >= 700 ? 0.72
      : profile.ficoScore >= 660 ? 0.55
      : 0.30;

    return {
      productType: 'line_of_credit',
      productName: 'Traditional Line of Credit',
      estimatedAmount: amount,
      effectiveApr: LOC_APR,
      approvalTimelineDays: LOC_TIMELINE_DAYS,
      approvalProbability: approvalProb,
      estimatedMonthlyPayment: Math.round(monthly),
      totalCost24m: Math.round(total24m),
      pros: [
        `Competitive APR (~${(LOC_APR * 100).toFixed(2)}%) — lower than card stacking post-shock.`,
        'Draw only what you need — interest on drawn amount only.',
        'Revolving — replenishes as you pay down.',
        '30-day approval timeline.',
      ],
      cons: [
        'Lower credit limits than stacking.',
        'May require collateral.',
        'Interest accrues immediately — no intro period.',
        'Annual review and renewal risk.',
      ],
      suitabilityScore: suitability,
    };
  }

  private _buildMCAOption(profile: SimulatorProfile): ProductOption {
    // MCA based on daily sales advance
    const amount = Math.min(profile.targetCreditLimit, profile.annualRevenue * 0.25);
    const totalRepay = amount * MCA_FACTOR_RATE;
    const dailyRate = totalRepay / (6 * 30); // typical 6-month term
    const monthly = dailyRate * 30;
    const total24m = totalRepay; // typically fully repaid in 6 months

    let suitability = 20;
    if (profile.annualRevenue >= 100_000) suitability += 15;
    if (profile.ficoScore < 580) suitability += 20; // MCA doesn't require strong FICO
    if (profile.yearsInOperation < 1) suitability += 10;
    // Heavy penalties
    if (profile.ficoScore >= 700) suitability -= 20; // better options available
    suitability = Math.max(0, Math.min(100, suitability));

    const approvalProb = profile.annualRevenue >= 100_000 ? 0.88 : 0.65;

    return {
      productType: 'mca',
      productName: 'Merchant Cash Advance',
      estimatedAmount: amount,
      effectiveApr: MCA_EFFECTIVE_APR,
      approvalTimelineDays: MCA_TIMELINE_DAYS,
      approvalProbability: approvalProb,
      estimatedMonthlyPayment: Math.round(monthly),
      totalCost24m: Math.round(total24m),
      pros: [
        '3-day approval — fastest funding available.',
        'No fixed monthly payment — based on revenue percentage.',
        'Minimal credit requirements.',
        'No collateral needed.',
      ],
      cons: [
        `Extremely high effective APR (~${(MCA_EFFECTIVE_APR * 100).toFixed(0)}%).`,
        'Factor rate 1.2–1.5x on principal — expensive.',
        'Daily/weekly remittances strain cash flow.',
        'Not a regulated loan product — limited consumer protections.',
        'Stacking MCAs is a high-risk path to a debt spiral.',
      ],
      suitabilityScore: suitability,
    };
  }

  private _pickBestProduct(
    profile: SimulatorProfile,
    options: ProductOption[],
  ): ProductOption['productType'] {
    // If desperate situation: FICO < 600 and short tenure → MCA may be only option
    if (profile.ficoScore < 600 && profile.yearsInOperation < 1) {
      return 'mca';
    }

    // Sort by suitability score descending
    const sorted = [...options].sort((a, b) => b.suitabilityScore - a.suitabilityScore);
    return sorted[0]!.productType;
  }

  // ── Private — helpers ─────────────────────────────────────

  private _applyOverrides(
    base: SimulatorProfile,
    overrides?: WhatIfOverrides,
  ): SimulatorProfile {
    if (!overrides) return base;
    return {
      ...base,
      ficoScore: overrides.ficoScore ?? base.ficoScore,
      utilizationRatio: overrides.utilizationRatio ?? base.utilizationRatio,
      derogatoryCount: overrides.derogatoryCount ?? base.derogatoryCount,
      inquiries12m: overrides.inquiries12m ?? base.inquiries12m,
      creditAgeMonths: overrides.creditAgeMonths ?? base.creditAgeMonths,
      annualRevenue: overrides.annualRevenue ?? base.annualRevenue,
      existingDebt: overrides.existingDebt ?? base.existingDebt,
    };
  }

  private _uuid(): string {
    return `sim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// Singleton convenience export
export const fundingSimulator = new FundingSimulatorService();
