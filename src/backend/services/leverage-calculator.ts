// ============================================================
// CapitalForge — Leverage Calculator
//
// Computes the Maximum Safe Leverage model for a business:
//   maxTotalCredit  = f(monthlyRevenue, existingDebt, cashFlowRatio, industryRisk)
//   maxPerCard      = derived from maxTotalCredit and recommended round sizing
//   maxRounds       = based on incremental utilisation headroom
// ============================================================

// ── Industry Risk Multipliers ─────────────────────────────────
// Higher multiplier = lower risk = more leverage headroom
// Values represent a credit-availability factor (0 < x <= 1.0)

export const INDUSTRY_RISK_MULTIPLIERS: Record<string, number> = {
  // Lower risk
  technology:     0.90,
  healthcare:     0.85,
  professional_services: 0.85,
  real_estate:    0.80,
  manufacturing:  0.80,
  retail:         0.72,
  wholesale:      0.75,
  // Moderate risk
  construction:   0.68,
  transportation: 0.68,
  hospitality:    0.60,
  food_beverage:  0.58,
  // Higher risk
  entertainment:  0.52,
  cannabis:       0.35,
  gambling:       0.30,
  // Default for unknown industries
  default:        0.70,
} as const;

// ── Constants ────────────────────────────────────────────────

/** Base multiplier applied to monthly revenue to get raw leverage ceiling */
const BASE_REVENUE_MULTIPLIER = 6; // 6× monthly revenue as starting ceiling

/** Absolute floor on recommended max total credit ($5 000) */
const MIN_TOTAL_CREDIT = 5_000;

/** Absolute ceiling on recommended max total credit ($500 000) */
const MAX_TOTAL_CREDIT = 500_000;

/** Recommended per-card upper bound as % of max total credit */
const PER_CARD_RATIO = 0.20; // one card should not exceed 20% of total leverage

/** Minimum cash-flow ratio required to support any leverage at all */
const MIN_VIABLE_CASH_FLOW_RATIO = 0.05;

// ── Input / Output types ──────────────────────────────────────

export interface LeverageInput {
  /** Verified or stated monthly revenue in USD */
  monthlyRevenue: number;

  /** Total existing debt obligations (outstanding balances) in USD */
  existingDebt: number;

  /**
   * Cash-flow ratio: (monthly net cash flow) / (monthly revenue)
   * Acceptable range: 0.05 – 1.0  (negative means cash-flow negative)
   */
  cashFlowRatio: number;

  /**
   * Industry identifier — matched against INDUSTRY_RISK_MULTIPLIERS.
   * Falls back to "default" when unknown.
   */
  industry: string;
}

export interface LeverageResult {
  /** Maximum recommended total credit exposure across all cards/rounds */
  maxTotalCredit: number;

  /** Maximum recommended credit limit for any single card */
  maxPerCard: number;

  /** Maximum number of stacking rounds recommended */
  maxRounds: number;

  /** Annualised debt-service ratio used in the calculation */
  debtServiceRatio: number;

  /** The industry risk multiplier applied */
  industryMultiplier: number;

  /** Human-readable rationale summary */
  rationale: string;
}

// ── Core calculation ──────────────────────────────────────────

/**
 * Computes maximum safe leverage for a business profile.
 *
 * Formula:
 *   baseCeiling       = monthlyRevenue × BASE_REVENUE_MULTIPLIER
 *   debtAdjusted      = baseCeiling - existingDebt
 *   cashFlowAdjusted  = debtAdjusted × clamp(cashFlowRatio / 0.20, 0.25, 1.0)
 *   maxTotalCredit    = cashFlowAdjusted × industryMultiplier
 *                       clamped to [MIN_TOTAL_CREDIT, MAX_TOTAL_CREDIT]
 *
 * The cash-flow ratio is normalised against a target ratio of 0.20 (20%).
 * A business with 20% cash-flow margin gets 100% of the debt-adjusted ceiling.
 * Less healthy cash flow scales the ceiling down; cap at 25% to prevent collapse.
 */
export function calculateMaxSafeLeverage(input: LeverageInput): LeverageResult {
  const { monthlyRevenue, existingDebt, cashFlowRatio, industry } = input;

  // Guard: non-positive revenue makes stacking meaningless
  const safeRevenue = Math.max(monthlyRevenue, 0);

  // Industry multiplier
  const normalised = industry.toLowerCase().replace(/[\s-]/g, '_');
  const industryMultiplier =
    INDUSTRY_RISK_MULTIPLIERS[normalised] ?? INDUSTRY_RISK_MULTIPLIERS['default'];

  // Debt-service ratio: existing annual debt cost relative to annual revenue
  const annualRevenue = safeRevenue * 12;
  const debtServiceRatio = annualRevenue > 0 ? existingDebt / annualRevenue : 1;

  // Base ceiling from revenue
  const baseCeiling = safeRevenue * BASE_REVENUE_MULTIPLIER;

  // Subtract existing debt obligations — stacking adds credit ON TOP of existing burden
  const debtAdjusted = Math.max(baseCeiling - existingDebt, 0);

  // Cash-flow adjustment factor — target is 20% CFR; scale linearly, clamped
  const cashFlowFactor = cashFlowRatio <= MIN_VIABLE_CASH_FLOW_RATIO
    ? 0.10                              // barely viable — severely restrict
    : clamp(cashFlowRatio / 0.20, 0.25, 1.0);

  // Apply factors
  const rawMax = debtAdjusted * cashFlowFactor * industryMultiplier;

  // Clamp to absolute bounds
  const maxTotalCredit = clamp(Math.round(rawMax), MIN_TOTAL_CREDIT, MAX_TOTAL_CREDIT);

  // Per-card limit
  const maxPerCard = Math.max(
    Math.round(maxTotalCredit * PER_CARD_RATIO),
    2_500,
  );

  // Max rounds: each round typically uses 40–60% of remaining headroom.
  // Model: how many times can we multiply by 0.55 before total credit < $5k?
  // Simplified: floor(log(MIN_TOTAL_CREDIT / maxTotalCredit) / log(0.55)) but capped sensibly.
  const maxRounds = computeMaxRounds(maxTotalCredit);

  const rationale = buildRationale({
    safeRevenue,
    existingDebt,
    cashFlowRatio,
    industryMultiplier,
    debtServiceRatio,
    maxTotalCredit,
    maxPerCard,
    maxRounds,
  });

  return {
    maxTotalCredit,
    maxPerCard,
    maxRounds,
    debtServiceRatio,
    industryMultiplier,
    rationale,
  };
}

// ── Helpers ───────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeMaxRounds(maxTotalCredit: number): number {
  if (maxTotalCredit < 10_000)  return 1;
  if (maxTotalCredit < 30_000)  return 2;
  if (maxTotalCredit < 75_000)  return 3;
  if (maxTotalCredit < 150_000) return 4;
  return 5; // absolute cap — more rounds add compounding risk
}

interface RationaleParams {
  safeRevenue: number;
  existingDebt: number;
  cashFlowRatio: number;
  industryMultiplier: number;
  debtServiceRatio: number;
  maxTotalCredit: number;
  maxPerCard: number;
  maxRounds: number;
}

function buildRationale(p: RationaleParams): string {
  const lines: string[] = [
    `Monthly revenue: $${p.safeRevenue.toLocaleString()}.`,
    `Existing debt: $${p.existingDebt.toLocaleString()} (debt-service ratio: ${(p.debtServiceRatio * 100).toFixed(1)}%).`,
    `Cash-flow ratio: ${(p.cashFlowRatio * 100).toFixed(1)}%.`,
    `Industry risk multiplier: ${p.industryMultiplier.toFixed(2)}.`,
    `Max safe total credit: $${p.maxTotalCredit.toLocaleString()}.`,
    `Max per card: $${p.maxPerCard.toLocaleString()}.`,
    `Max recommended stacking rounds: ${p.maxRounds}.`,
  ];
  return lines.join(' ');
}
