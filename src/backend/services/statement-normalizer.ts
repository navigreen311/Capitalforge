// ============================================================
// CapitalForge — Statement Normalizer
//
// Converts raw issuer-specific statement data into a canonical
// NormalizedStatement schema used by the reconciliation engine.
//
// Supported issuers (first-class parsers):
//   Chase, American Express (Amex), Capital One, Citi, Bank of America,
//   US Bank, Discover, Wells Fargo, Barclays, Synchrony
//
// Edge cases handled:
//   - Partial statements (missing fields filled with null, never thrown)
//   - Multi-currency: DETECTED AND WARNED ABOUT, NOT CONVERTED. This said
//     "amounts converted via spot-rate table"; no spot-rate table exists
//     anywhere in this repository and nothing converts anything. Non-USD
//     transactions are flagged, `currency` on the output is the literal
//     'USD', and consolidating a multi-currency balance is left to a reader.
//   - Inconsistent date formats (ISO, MM/DD/YYYY, MM-DD-YYYY, etc.)
//   - Amount formats with currency symbols and comma separators
//   - Repeated rows within a single statement: collapsed out of
//     `transactions` and carried on `removedDuplicates`, for the engine to
//     report as duplicate-charge candidates
// ============================================================

import logger from '../config/logger.js';

// ── Canonical Schema ──────────────────────────────────────────

export interface NormalizedTransaction {
  /** Merchant / description as it appears on the statement */
  description: string;
  /** Positive = charge, Negative = credit / payment */
  amount: number;
  /** ISO-8601 date string */
  transactionDate: string;
  /** Posting date if different from transaction date */
  postingDate?: string | null;
  category?: string | null;
  referenceNumber?: string | null;
  isCashAdvance: boolean;
  isFee: boolean;
  isInterest: boolean;
  /** Detected currency code, defaults to USD */
  currency: string;
}

export interface NormalizedStatement {
  /** Issuer slug (e.g. "chase", "amex", "capital_one") */
  issuer: string;
  statementDate: string | null;
  dueDate: string | null;
  closingBalance: number | null;
  previousBalance: number | null;
  minimumPayment: number | null;
  interestCharged: number | null;
  feesCharged: number | null;
  creditLimit: number | null;
  availableCredit: number | null;
  rewardsEarned: number | null;
  transactions: NormalizedTransaction[];
  /** Detected primary currency */
  currency: string;
  /** True when statement appears truncated / missing pages */
  isPartial: boolean;
  /** True when non-USD transactions were detected */
  hasMultiCurrency: boolean;
  /**
   * Rows this statement carried more than once, removed from `transactions`.
   *
   * Kept rather than counted: whether a repeated row is an import artefact or
   * the issuer charging twice cannot be decided here, and deleting it decided
   * the question silently — in favour of the reading that hides a double
   * charge. `detectFeeAnomalies` reports these as candidates and
   * `detectBalanceMismatch` names their sum as the amount it may be off by.
   */
  removedDuplicates: NormalizedTransaction[];
  /** Human-readable warnings about edge cases encountered */
  warnings: string[];
}

// ── Raw Input Schema ─────────────────────────────────────────

/** Flexible raw input — all fields optional to accommodate partial statements */
export interface RawStatementData {
  issuer?: string;
  // Date fields (any common format accepted)
  statementDate?: string | null;
  dueDate?: string | null;
  // Balance fields (strings with $ or pure numbers)
  closingBalance?: string | number | null;
  previousBalance?: string | number | null;
  minimumPayment?: string | number | null;
  minimumPaymentDue?: string | number | null;   // Amex alias
  newBalance?: string | number | null;           // Chase alias
  interestCharged?: string | number | null;
  totalInterestCharged?: string | number | null; // Citi alias
  feesCharged?: string | number | null;
  totalFees?: string | number | null;            // Capital One alias
  creditLimit?: string | number | null;
  availableCredit?: string | number | null;
  rewardsEarned?: string | number | null;
  rewards?: string | number | null;              // generic alias
  transactions?: RawTransaction[];
  // Catch-all for unknown issuer fields
  [key: string]: unknown;
}

export interface RawTransaction {
  description?: string | null;
  merchant?: string | null;
  amount?: string | number | null;
  transactionAmount?: string | number | null;
  date?: string | null;
  transactionDate?: string | null;
  postedDate?: string | null;
  postingDate?: string | null;
  category?: string | null;
  referenceNumber?: string | null;
  refNumber?: string | null;
  type?: string | null;
  currency?: string | null;
  [key: string]: unknown;
}

// ── Issuer Slug Normalization ─────────────────────────────────

const ISSUER_SLUG_MAP: Record<string, string> = {
  chase: 'chase',
  'jpmorgan chase': 'chase',
  'jp morgan': 'chase',
  amex: 'amex',
  'american express': 'amex',
  'capital one': 'capital_one',
  capitalone: 'capital_one',
  citi: 'citi',
  citibank: 'citi',
  citicard: 'citi',
  'bank of america': 'bank_of_america',
  boa: 'bank_of_america',
  bofa: 'bank_of_america',
  'us bank': 'us_bank',
  usbank: 'us_bank',
  discover: 'discover',
  'wells fargo': 'wells_fargo',
  wellsfargo: 'wells_fargo',
  barclays: 'barclays',
  synchrony: 'synchrony',
};

/**
 * Fold an issuer as a human typed it onto a stable slug.
 *
 * Exported because the held-card catalogue matcher needs exactly this
 * mapping, and a second copy of it would drift from this one without
 * anything failing — the shape that put `lake_michigan` in the rules engine
 * against `lake_michigan_cu` in the card catalogue, where a Record lookup
 * resolved the mismatch to `undefined` and read as "no special handling".
 *
 * The fallback is deliberate and load-bearing for callers: an issuer absent
 * from the map becomes its own whitespace-collapsed slug rather than
 * `unknown`, which is how `td_bank` and `pnc` resolve without being listed.
 */
export function normalizeIssuerSlug(raw?: string): string {
  if (!raw) return 'unknown';
  const key = raw.toLowerCase().trim();
  return ISSUER_SLUG_MAP[key] ?? key.replace(/\s+/g, '_');
}

// ── Amount Parsing ────────────────────────────────────────────

/**
 * Parse a potentially formatted dollar string into a float.
 * Handles: "$1,234.56", "1234.56", "(123.45)" (negative), "1.234,56" (European)
 * Returns null if parsing fails.
 */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;

  let s = String(raw).trim();

  // Detect negative via parentheses: "(123.45)"
  const isNegative = s.startsWith('(') && s.endsWith(')');
  if (isNegative) s = s.slice(1, -1);

  // Strip currency symbol and spaces
  s = s.replace(/[€£¥₹$\s]/g, '');

  // Handle European-style "1.234,56" → "1234.56"
  if (/^\d{1,3}(\.\d{3})+(,\d{2})?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Standard: remove commas
    s = s.replace(/,/g, '');
  }

  const value = parseFloat(s);
  if (isNaN(value)) return null;
  return isNegative ? -value : value;
}

// ── Date Parsing ─────────────────────────────────────────────

const DATE_PATTERNS: Array<{ regex: RegExp; parse: (m: RegExpMatchArray) => string }> = [
  // ISO: 2026-01-15
  {
    regex: /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/,
    parse: (m) => `${m[1]!}-${m[2]!}-${m[3]!}`,
  },
  // MM/DD/YYYY
  {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: (m) => `${m[3]!}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`,
  },
  // MM-DD-YYYY
  {
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    parse: (m) => `${m[3]!}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`,
  },
  // MM/DD/YY
  {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
    parse: (m) => `20${m[3]!}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`,
  },
  // DD MMM YYYY e.g. "15 Jan 2026"
  {
    regex: /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/,
    parse: (m) => {
      const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      };
      const month = months[m[2]!.toLowerCase().slice(0, 3)] ?? '01';
      return `${m[3]!}-${month}-${m[1]!.padStart(2, '0')}`;
    },
  },
];

export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  for (const { regex, parse } of DATE_PATTERNS) {
    const m = s.match(regex);
    if (m) return parse(m);
  }
  return null;
}

// ── Transaction Classification ────────────────────────────────

const CASH_ADVANCE_KEYWORDS = [
  'cash advance', 'cash withdrawal', 'atm withdrawal', 'cash access', 'convenience check',
];
const FEE_KEYWORDS = [
  'annual fee', 'late fee', 'foreign transaction fee', 'balance transfer fee',
  'cash advance fee', 'returned payment fee', 'overlimit fee', 'fee',
];
const INTEREST_KEYWORDS = [
  'interest charge', 'finance charge', 'purchase apr', 'cash apr',
  'balance transfer apr', 'interest', 'periodic rate',
];

function classifyTransaction(desc: string): {
  isCashAdvance: boolean;
  isFee: boolean;
  isInterest: boolean;
} {
  const lower = desc.toLowerCase();
  const isCashAdvance = CASH_ADVANCE_KEYWORDS.some((kw) => lower.includes(kw));
  const isFee = !isCashAdvance && FEE_KEYWORDS.some((kw) => lower.includes(kw));
  const isInterest = !isCashAdvance && !isFee && INTEREST_KEYWORDS.some((kw) => lower.includes(kw));
  return { isCashAdvance, isFee, isInterest };
}

// ── Duplicate Transaction Detection ──────────────────────────

/**
 * Collapse rows this statement carries more than once — and keep what was
 * collapsed.
 *
 * The removed rows used to be counted and dropped. That inverted the module:
 * a same-day, same-amount, same-merchant charge is the canonical duplicate and
 * the one a cardholder disputes, and it was deleted one step before
 * `detectFeeAnomalies` went looking for duplicates. What could still be found
 * was the same description and amount on *different* dates — two identical
 * subscription renewals, two identical fuel stops. The true positives were
 * removed and the false positives were reported.
 *
 * It reached the arithmetic too. The issuer's closing balance still contained
 * the charge that had been dropped, so the expected balance came out low by
 * exactly that amount and a real double charge surfaced as a
 * `balance_mismatch` — critical over $50 — attributed to nothing.
 *
 * Both readings stay possible and neither can be settled from the data: the
 * repeated row may be an import artefact, or the issuer may have charged
 * twice. So the rows are carried out rather than judged here.
 */
function deduplicateTransactions(txns: NormalizedTransaction[]): {
  deduped: NormalizedTransaction[];
  duplicateCount: number;
  removed: NormalizedTransaction[];
} {
  const seen = new Set<string>();
  const deduped: NormalizedTransaction[] = [];
  const removed: NormalizedTransaction[] = [];

  for (const txn of txns) {
    const key = `${txn.transactionDate}|${txn.amount}|${txn.description.slice(0, 30).toLowerCase()}`;
    if (seen.has(key)) {
      removed.push(txn);
    } else {
      seen.add(key);
      deduped.push(txn);
    }
  }
  return { deduped, duplicateCount: removed.length, removed };
}

// ── Currency Detection ────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
};

function detectCurrency(raw: string | number | null | undefined, defaultCurrency = 'USD'): string {
  if (!raw || typeof raw !== 'string') return defaultCurrency;
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(sym)) return code;
  }
  // Look for 3-letter currency code prefix/suffix
  const match = raw.match(/\b([A-Z]{3})\b/);
  if (match) return match[1]!;
  return defaultCurrency;
}

// ── Transaction Normalizer ────────────────────────────────────

function normalizeTransaction(raw: RawTransaction): NormalizedTransaction {
  const description =
    (raw.description ?? raw.merchant ?? 'Unknown').trim();

  const rawAmount = raw.amount ?? raw.transactionAmount;
  const amount = parseAmount(rawAmount) ?? 0;

  const rawDate = raw.date ?? raw.transactionDate ?? null;
  const transactionDate = parseDate(rawDate) ?? new Date().toISOString().slice(0, 10);

  const rawPostingDate = raw.postedDate ?? raw.postingDate ?? null;
  const postingDate = parseDate(rawPostingDate);

  const currency = detectCurrency(
    typeof rawAmount === 'string' ? rawAmount : (raw.currency ?? null),
  );

  const { isCashAdvance, isFee, isInterest } = classifyTransaction(description);

  return {
    description,
    amount,
    transactionDate,
    postingDate,
    category: typeof raw.category === 'string' ? raw.category : null,
    referenceNumber: (raw.referenceNumber ?? raw.refNumber ?? null) as string | null,
    isCashAdvance,
    isFee,
    isInterest,
    currency,
  };
}

// ── Primary Normalizer ────────────────────────────────────────

export class StatementNormalizer {
  /**
   * Normalize raw statement data from any issuer into the canonical schema.
   *
   * Never throws — partial data results in null fields and populated warnings[].
   */
  normalize(raw: RawStatementData): NormalizedStatement {
    const svc = logger.child({ service: 'StatementNormalizer' });
    const warnings: string[] = [];

    const issuer = normalizeIssuerSlug(raw.issuer);

    // ── Amount fields — resolve issuer aliases ──────────────────
    const closingBalance = parseAmount(
      raw.closingBalance ?? raw.newBalance ?? null,
    );
    const previousBalance = parseAmount(raw.previousBalance ?? null);
    const minimumPayment = parseAmount(
      raw.minimumPayment ?? raw.minimumPaymentDue ?? null,
    );
    const interestCharged = parseAmount(
      raw.interestCharged ?? raw.totalInterestCharged ?? null,
    );
    const feesCharged = parseAmount(
      raw.feesCharged ?? raw.totalFees ?? null,
    );
    const creditLimit = parseAmount(raw.creditLimit ?? null);
    const availableCredit = parseAmount(raw.availableCredit ?? null);
    const rewardsEarned = parseAmount(raw.rewardsEarned ?? raw.rewards ?? null);

    // ── Date fields ────────────────────────────────────────────
    const statementDate = parseDate(raw.statementDate ?? null);
    const dueDate = parseDate(raw.dueDate ?? null);

    if (!statementDate) {
      warnings.push('statementDate could not be parsed — treated as unknown.');
    }
    if (!dueDate) {
      warnings.push('dueDate could not be parsed — minimum payment scheduling may be inaccurate.');
    }

    // ── Transactions ───────────────────────────────────────────
    const rawTxns = Array.isArray(raw.transactions) ? raw.transactions : [];
    const normalizedTxns = rawTxns.map((t) => normalizeTransaction(t));

    // Deduplicate
    const { deduped, duplicateCount, removed } = deduplicateTransactions(normalizedTxns);
    if (duplicateCount > 0) {
      warnings.push(
        `${duplicateCount} repeated transaction row(s) collapsed. They are carried on `
        + 'removedDuplicates and reported as duplicate-charge candidates rather than '
        + 'discarded, and the balance check names the amount it may be off by.',
      );
    }

    // ── Multi-currency detection ───────────────────────────────
    const currencies = new Set(deduped.map((t) => t.currency));
    currencies.add('USD'); // always present as primary
    const hasMultiCurrency = currencies.size > 1;
    if (hasMultiCurrency) {
      warnings.push(
        `Non-USD transactions detected: ${Array.from(currencies).filter((c) => c !== 'USD').join(', ')}. ` +
        'Multi-currency balances are not automatically consolidated.',
      );
    }

    // ── Partial statement detection ────────────────────────────
    const requiredFields = [closingBalance, minimumPayment, dueDate];
    const missingCount = requiredFields.filter((v) => v === null).length;
    const isPartial = missingCount >= 2;
    if (isPartial) {
      warnings.push(
        'Statement appears to be partial — multiple key fields are missing. ' +
        'Manual review required.',
      );
    }

    // ── Consistency check: derived available credit ────────────
    if (
      creditLimit !== null &&
      closingBalance !== null &&
      availableCredit !== null
    ) {
      const derived = creditLimit - closingBalance;
      const tolerance = 1.0; // $1 tolerance for rounding
      if (Math.abs(derived - availableCredit) > tolerance) {
        warnings.push(
          `Available credit mismatch: reported $${availableCredit.toFixed(2)}, ` +
          `derived from limit/balance $${derived.toFixed(2)}.`,
        );
      }
    }

    svc.info('Statement normalized', {
      issuer,
      transactionCount: deduped.length,
      duplicateCount,
      warnings: warnings.length,
    });

    return {
      issuer,
      statementDate,
      dueDate,
      closingBalance,
      previousBalance,
      minimumPayment,
      interestCharged,
      feesCharged,
      creditLimit,
      availableCredit,
      rewardsEarned,
      transactions: deduped,
      removedDuplicates: removed,
      currency: 'USD',
      isPartial,
      hasMultiCurrency,
      warnings,
    };
  }
}
