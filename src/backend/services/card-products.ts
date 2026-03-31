// ============================================================
// CapitalForge — Card Product Catalog
//
// Static seed data for all supported business credit cards.
// Each entry captures issuer identity, APR windows, fees,
// rewards structure, credit network, and the estimated
// credit-limit band the optimizer uses for modeling.
//
// To add a new card: append a CardProduct object to CARD_CATALOG
// and update CARD_CATALOG_VERSION.
// ============================================================

export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'discover';
export type RewardsType = 'cash_back' | 'points' | 'miles';
export type Issuer =
  | 'chase'
  | 'amex'
  | 'capital_one'
  | 'citi'
  | 'bank_of_america'
  | 'us_bank'
  | 'wells_fargo'
  | 'discover'
  | 'td_bank'
  | 'pnc';

// ── Reward tier ───────────────────────────────────────────────

export interface RewardTier {
  /** Human-readable category (e.g. "Office Supplies", "Travel", "All purchases") */
  category: string;
  /** Multiplier / rate — use 0.02 for 2 %, 3 for 3x points, etc. */
  rate: number;
  /** Either 'percent' (cash back) or 'multiplier' (points/miles) */
  unit: 'percent' | 'multiplier';
  /** Optional spend cap per period where the elevated rate applies */
  annualCap?: number;
}

// ── Main product interface ────────────────────────────────────

export interface CardProduct {
  /** Unique stable slug — never rename after creating */
  id: string;
  name: string;
  issuer: Issuer;
  network: CardNetwork;

  // ── APR ──────────────────────────────────────────────────
  /** Intro APR (percentage, e.g. 0 for 0 %). null = no intro offer. */
  introAprPercent: number | null;
  /** Length of the intro APR period in months. null = no intro offer. */
  introAprMonths: number | null;
  /** Ongoing variable APR range (low end) */
  regularAprLow: number;
  /** Ongoing variable APR range (high end) */
  regularAprHigh: number;

  // ── Fees ─────────────────────────────────────────────────
  annualFee: number;
  /** Cash advance fee as a percent of the transaction (e.g. 0.05 = 5 %) */
  cashAdvanceFeePercent: number;
  /** Minimum cash advance fee in dollars */
  cashAdvanceFeeMin: number;
  foreignTransactionFeePercent: number;

  // ── Credit limit ─────────────────────────────────────────
  /** Typical floor for approved applicants (USD) */
  creditLimitMin: number;
  /** Typical ceiling for strong applicants (USD) */
  creditLimitMax: number;

  // ── Rewards ──────────────────────────────────────────────
  rewardsType: RewardsType;
  rewardsTiers: RewardTier[];
  /** Welcome / sign-up bonus description */
  signupBonus: string | null;

  // ── Eligibility signals ───────────────────────────────────
  /** Minimum personal FICO the issuer generally wants to see */
  minFicoEstimate: number;
  /** Whether the issuer typically reports to personal credit bureaus */
  reportsToPersonalBureau: boolean;
  /** Whether the issuer requires a personal guarantee */
  requiresPersonalGuarantee: boolean;

  // ── Catalog metadata ──────────────────────────────────────
  isActive: boolean;
  /** ISO date string — when this product record was last verified */
  lastVerified: string;
}

// ============================================================
// Catalog version — bump when any card data changes.
// ============================================================
export const CARD_CATALOG_VERSION = '2026-03-31';

// ============================================================
// Card catalog — 18 popular business cards
// ============================================================
export const CARD_CATALOG: ReadonlyArray<CardProduct> = [
  // ── Chase ────────────────────────────────────────────────────────

  {
    id: 'chase-ink-business-cash',
    name: 'Chase Ink Business Cash',
    issuer: 'chase',
    network: 'visa',
    introAprPercent: 0,
    introAprMonths: 12,
    regularAprLow: 18.49,
    regularAprHigh: 24.49,
    annualFee: 0,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 15,
    foreignTransactionFeePercent: 0.03,
    creditLimitMin: 3000,
    creditLimitMax: 25000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'Office supplies & phone services', rate: 0.05, unit: 'percent', annualCap: 25000 },
      { category: 'Gas & restaurants', rate: 0.02, unit: 'percent', annualCap: 25000 },
      { category: 'All other purchases', rate: 0.01, unit: 'percent' },
    ],
    signupBonus: '$750 cash back after $6,000 spend in first 3 months',
    minFicoEstimate: 680,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  {
    id: 'chase-ink-business-preferred',
    name: 'Chase Ink Business Preferred',
    issuer: 'chase',
    network: 'visa',
    introAprPercent: null,
    introAprMonths: null,
    regularAprLow: 20.49,
    regularAprHigh: 26.49,
    annualFee: 95,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 15,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 5000,
    creditLimitMax: 50000,
    rewardsType: 'points',
    rewardsTiers: [
      { category: 'Travel, shipping, ads, internet/cable/phone', rate: 3, unit: 'multiplier', annualCap: 150000 },
      { category: 'All other purchases', rate: 1, unit: 'multiplier' },
    ],
    signupBonus: '100,000 bonus points after $8,000 spend in first 3 months',
    minFicoEstimate: 700,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  {
    id: 'chase-ink-business-unlimited',
    name: 'Chase Ink Business Unlimited',
    issuer: 'chase',
    network: 'visa',
    introAprPercent: 0,
    introAprMonths: 12,
    regularAprLow: 18.49,
    regularAprHigh: 24.49,
    annualFee: 0,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 15,
    foreignTransactionFeePercent: 0.03,
    creditLimitMin: 3000,
    creditLimitMax: 25000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'All purchases', rate: 0.015, unit: 'percent' },
    ],
    signupBonus: '$750 cash back after $6,000 spend in first 3 months',
    minFicoEstimate: 680,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── American Express ──────────────────────────────────────────────

  {
    id: 'amex-blue-business-plus',
    name: 'Amex Blue Business Plus',
    issuer: 'amex',
    network: 'amex',
    introAprPercent: 0,
    introAprMonths: 15,
    regularAprLow: 18.49,
    regularAprHigh: 27.49,
    annualFee: 0,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0.025,
    creditLimitMin: 2000,
    creditLimitMax: 20000,
    rewardsType: 'points',
    rewardsTiers: [
      { category: 'All purchases', rate: 2, unit: 'multiplier', annualCap: 50000 },
      { category: 'All purchases over cap', rate: 1, unit: 'multiplier' },
    ],
    signupBonus: '15,000 Membership Rewards points after $3,000 spend in first 3 months',
    minFicoEstimate: 670,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  {
    id: 'amex-blue-business-cash',
    name: 'Amex Blue Business Cash',
    issuer: 'amex',
    network: 'amex',
    introAprPercent: 0,
    introAprMonths: 12,
    regularAprLow: 18.49,
    regularAprHigh: 27.49,
    annualFee: 0,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0.025,
    creditLimitMin: 2000,
    creditLimitMax: 20000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'All purchases', rate: 0.02, unit: 'percent', annualCap: 50000 },
      { category: 'All purchases over cap', rate: 0.01, unit: 'percent' },
    ],
    signupBonus: '$250 statement credit after $3,000 spend in first 3 months',
    minFicoEstimate: 670,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  {
    id: 'amex-business-gold',
    name: 'Amex Business Gold Card',
    issuer: 'amex',
    network: 'amex',
    introAprPercent: null,
    introAprMonths: null,
    regularAprLow: 19.99,
    regularAprHigh: 28.99,
    annualFee: 375,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 5000,
    creditLimitMax: 0, // charge card — no preset spending limit
    rewardsType: 'points',
    rewardsTiers: [
      { category: 'Top 2 eligible spend categories each month', rate: 4, unit: 'multiplier', annualCap: 150000 },
      { category: 'All other purchases', rate: 1, unit: 'multiplier' },
    ],
    signupBonus: '100,000 Membership Rewards points after $15,000 spend in first 3 months',
    minFicoEstimate: 700,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── Capital One ───────────────────────────────────────────────────

  {
    id: 'capital-one-spark-cash-plus',
    name: 'Capital One Spark Cash Plus',
    issuer: 'capital_one',
    network: 'mastercard',
    introAprPercent: null,
    introAprMonths: null,
    regularAprLow: 0, // charge card — no APR
    regularAprHigh: 0,
    annualFee: 150,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 10000,
    creditLimitMax: 100000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'All purchases', rate: 0.02, unit: 'percent' },
    ],
    signupBonus: '$1,200 cash bonus after $30,000 spend in first 3 months',
    minFicoEstimate: 700,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  {
    id: 'capital-one-spark-cash-select',
    name: 'Capital One Spark Cash Select',
    issuer: 'capital_one',
    network: 'mastercard',
    introAprPercent: 0,
    introAprMonths: 12,
    regularAprLow: 18.49,
    regularAprHigh: 24.49,
    annualFee: 0,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 2000,
    creditLimitMax: 20000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'All purchases', rate: 0.015, unit: 'percent' },
    ],
    signupBonus: '$750 cash bonus after $6,000 spend in first 3 months',
    minFicoEstimate: 660,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  {
    id: 'capital-one-spark-miles',
    name: 'Capital One Spark Miles for Business',
    issuer: 'capital_one',
    network: 'mastercard',
    introAprPercent: null,
    introAprMonths: null,
    regularAprLow: 26.24,
    regularAprHigh: 32.24,
    annualFee: 95,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 5000,
    creditLimitMax: 50000,
    rewardsType: 'miles',
    rewardsTiers: [
      { category: 'Hotels & rental cars via Capital One Travel', rate: 5, unit: 'multiplier' },
      { category: 'All other purchases', rate: 2, unit: 'multiplier' },
    ],
    signupBonus: '50,000 miles after $4,500 spend in first 3 months',
    minFicoEstimate: 680,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── Citi ──────────────────────────────────────────────────────────

  {
    id: 'citi-costco-anywhere-business',
    name: 'Costco Anywhere Visa Business (Citi)',
    issuer: 'citi',
    network: 'visa',
    introAprPercent: null,
    introAprMonths: null,
    regularAprLow: 20.49,
    regularAprHigh: 20.49,
    annualFee: 0, // requires Costco membership
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 2000,
    creditLimitMax: 30000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'Gas (including Costco)', rate: 0.04, unit: 'percent' },
      { category: 'Restaurants & travel', rate: 0.03, unit: 'percent' },
      { category: 'Costco purchases', rate: 0.02, unit: 'percent' },
      { category: 'All other purchases', rate: 0.01, unit: 'percent' },
    ],
    signupBonus: null,
    minFicoEstimate: 660,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── Bank of America ───────────────────────────────────────────────

  {
    id: 'boa-business-advantage-cash',
    name: 'Bank of America Business Advantage Cash Rewards',
    issuer: 'bank_of_america',
    network: 'mastercard',
    introAprPercent: 0,
    introAprMonths: 9,
    regularAprLow: 18.49,
    regularAprHigh: 28.49,
    annualFee: 0,
    cashAdvanceFeePercent: 0.04,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0.03,
    creditLimitMin: 1000,
    creditLimitMax: 25000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'Choice category (gas, office, travel, etc.)', rate: 0.03, unit: 'percent', annualCap: 50000 },
      { category: 'Dining', rate: 0.02, unit: 'percent' },
      { category: 'All other purchases', rate: 0.01, unit: 'percent' },
    ],
    signupBonus: '$300 statement credit after $3,000 spend in first 90 days',
    minFicoEstimate: 660,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  {
    id: 'boa-business-advantage-travel',
    name: 'Bank of America Business Advantage Travel Rewards',
    issuer: 'bank_of_america',
    network: 'visa',
    introAprPercent: 0,
    introAprMonths: 9,
    regularAprLow: 18.49,
    regularAprHigh: 28.49,
    annualFee: 0,
    cashAdvanceFeePercent: 0.04,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 1000,
    creditLimitMax: 20000,
    rewardsType: 'points',
    rewardsTiers: [
      { category: 'Travel purchases via BofA Travel Center', rate: 3, unit: 'multiplier' },
      { category: 'All other purchases', rate: 1.5, unit: 'multiplier' },
    ],
    signupBonus: '30,000 online bonus points after $3,000 spend in first 90 days',
    minFicoEstimate: 660,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── U.S. Bank ─────────────────────────────────────────────────────

  {
    id: 'us-bank-business-leverage',
    name: 'U.S. Bank Business Leverage Visa',
    issuer: 'us_bank',
    network: 'visa',
    introAprPercent: null,
    introAprMonths: null,
    regularAprLow: 21.24,
    regularAprHigh: 29.24,
    annualFee: 95,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 2000,
    creditLimitMax: 30000,
    rewardsType: 'points',
    rewardsTiers: [
      { category: 'Top 2 spend categories each month', rate: 2, unit: 'multiplier' },
      { category: 'All other purchases', rate: 1, unit: 'multiplier' },
    ],
    signupBonus: '75,000 points after $7,500 spend in first 120 days',
    minFicoEstimate: 680,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  {
    id: 'us-bank-business-triple-cash',
    name: 'U.S. Bank Business Triple Cash Rewards',
    issuer: 'us_bank',
    network: 'visa',
    introAprPercent: 0,
    introAprMonths: 15,
    regularAprLow: 19.24,
    regularAprHigh: 28.24,
    annualFee: 0,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 1000,
    creditLimitMax: 25000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'Gas, office supply, cell/internet/cable', rate: 0.03, unit: 'percent' },
      { category: 'Restaurants', rate: 0.03, unit: 'percent' },
      { category: 'All other purchases', rate: 0.01, unit: 'percent' },
    ],
    signupBonus: '$500 cash back after $4,500 spend in first 150 days',
    minFicoEstimate: 660,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── Wells Fargo ───────────────────────────────────────────────────

  {
    id: 'wells-fargo-business-platinum',
    name: 'Wells Fargo Business Platinum',
    issuer: 'wells_fargo',
    network: 'visa',
    introAprPercent: 0,
    introAprMonths: 9,
    regularAprLow: 17.99,
    regularAprHigh: 27.99,
    annualFee: 0,
    cashAdvanceFeePercent: 0.04,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0.03,
    creditLimitMin: 500,
    creditLimitMax: 25000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'All purchases (cash-back option)', rate: 0.015, unit: 'percent' },
    ],
    signupBonus: '$300 cash back after $3,000 spend in first 3 months',
    minFicoEstimate: 640,
    reportsToPersonalBureau: true,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── Discover ──────────────────────────────────────────────────────

  {
    id: 'discover-it-business',
    name: 'Discover it Business Card',
    issuer: 'discover',
    network: 'discover',
    introAprPercent: 0,
    introAprMonths: 12,
    regularAprLow: 17.24,
    regularAprHigh: 28.24,
    annualFee: 0,
    cashAdvanceFeePercent: 0.05,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0,
    creditLimitMin: 500,
    creditLimitMax: 20000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'Gas & office supply stores', rate: 0.02, unit: 'percent' },
      { category: 'All other purchases', rate: 0.01, unit: 'percent' },
    ],
    signupBonus: 'Cashback match at end of first year (unlimited)',
    minFicoEstimate: 640,
    reportsToPersonalBureau: false,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── TD Bank ───────────────────────────────────────────────────────

  {
    id: 'td-business-solutions',
    name: 'TD Business Solutions Credit Card',
    issuer: 'td_bank',
    network: 'visa',
    introAprPercent: 0,
    introAprMonths: 12,
    regularAprLow: 18.24,
    regularAprHigh: 27.24,
    annualFee: 0,
    cashAdvanceFeePercent: 0.04,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0.03,
    creditLimitMin: 500,
    creditLimitMax: 15000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'All purchases', rate: 0.02, unit: 'percent' },
    ],
    signupBonus: '$200 cash back after $1,000 spend in first 90 days',
    minFicoEstimate: 620,
    reportsToPersonalBureau: true,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },

  // ── PNC ───────────────────────────────────────────────────────────

  {
    id: 'pnc-cash-rewards-business',
    name: 'PNC Cash Rewards Visa Business',
    issuer: 'pnc',
    network: 'visa',
    introAprPercent: 0,
    introAprMonths: 9,
    regularAprLow: 19.24,
    regularAprHigh: 29.24,
    annualFee: 0,
    cashAdvanceFeePercent: 0.04,
    cashAdvanceFeeMin: 10,
    foreignTransactionFeePercent: 0.03,
    creditLimitMin: 500,
    creditLimitMax: 15000,
    rewardsType: 'cash_back',
    rewardsTiers: [
      { category: 'Gas', rate: 0.04, unit: 'percent' },
      { category: 'Restaurants', rate: 0.03, unit: 'percent' },
      { category: 'Office supply & recurring', rate: 0.02, unit: 'percent' },
      { category: 'All other purchases', rate: 0.015, unit: 'percent' },
    ],
    signupBonus: '$200 cash back after $3,000 spend in first 3 months',
    minFicoEstimate: 630,
    reportsToPersonalBureau: true,
    requiresPersonalGuarantee: true,
    isActive: true,
    lastVerified: '2026-03-01',
  },
] as const;

// ── Lookup helpers ────────────────────────────────────────────

/** Look up a single card by its stable slug id. */
export function getCardById(id: string): CardProduct | undefined {
  return CARD_CATALOG.find((c) => c.id === id);
}

/** Filter by issuer. */
export function getCardsByIssuer(issuer: Issuer): CardProduct[] {
  return CARD_CATALOG.filter((c) => c.issuer === issuer && c.isActive);
}

/** Filter by network. */
export function getCardsByNetwork(network: CardNetwork): CardProduct[] {
  return CARD_CATALOG.filter((c) => c.network === network && c.isActive);
}

/** All active cards. */
export function getActiveCards(): CardProduct[] {
  return CARD_CATALOG.filter((c) => c.isActive);
}

/** Cards with a valid intro APR offer (0 % intro APR for any duration). */
export function getCardsWithIntroApr(): CardProduct[] {
  return CARD_CATALOG.filter(
    (c) => c.isActive && c.introAprPercent === 0 && c.introAprMonths !== null,
  );
}
