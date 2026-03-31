// ============================================================
// CapitalForge — OFAC / PEP Sanctions Screening Service
//
// This is a STUB implementation. In production, replace the
// watchlist data and matching logic with a real OFAC SDN feed
// (https://sanctionslist.ofac.treas.gov) and a vendor like
// Refinitiv, LexisNexis, or ComplyAdvantage.
//
// Screening outcomes:
//   no_match       — safe to proceed
//   possible_match — confidence < HARD_MATCH_THRESHOLD → manual review
//   match          — hard stop, no override permitted
// ============================================================

export type ScreeningResult = 'no_match' | 'possible_match' | 'match';

export interface SanctionsScreeningInput {
  /** Full legal name of the individual or entity */
  name: string;
  /** ISO 3166-1 alpha-2 country code (optional, improves accuracy) */
  country?: string;
  /** Date of birth ISO string — for individuals (optional) */
  dateOfBirth?: string;
  /** EIN or SSN — used as a secondary identifier stub (optional) */
  taxId?: string;
}

export interface SanctionsScreeningOutput {
  result: ScreeningResult;
  /** 0.0 – 1.0 confidence that subject is on a watchlist */
  confidenceScore: number;
  /** Human-readable explanation of the match decision */
  reason: string;
  /** Whether the record must be escalated to a compliance officer */
  requiresManualReview: boolean;
  /** Matched watchlist entry names (redacted in prod; shown here for debugging) */
  matchedEntries: string[];
  screenedAt: Date;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Confidence at or above this → hard MATCH stop. */
const HARD_MATCH_THRESHOLD = 0.85;

/** Confidence at or above this (but below HARD) → POSSIBLE_MATCH / manual review. */
const POSSIBLE_MATCH_THRESHOLD = 0.55;

// ── Stub watchlists ───────────────────────────────────────────────────────────
// These names are entirely fictional and for testing/demonstration only.

const OFAC_SDN_STUB: ReadonlyArray<{ name: string; country?: string }> = [
  { name: 'Sanctioned Corp LLC', country: 'IR' },
  { name: 'Blocked Entity International', country: 'KP' },
  { name: 'John Doe Sanctioned', country: 'RU' },
  { name: 'ACME Restricted Holdings', country: 'SY' },
  { name: 'Shadow Finance Ltd', country: 'CU' },
];

const PEP_WATCHLIST_STUB: ReadonlyArray<{ name: string; country?: string }> = [
  { name: 'PEP Individual One', country: 'VE' },
  { name: 'Politically Exposed Person', country: 'BY' },
];

type WatchlistEntry = { name: string; country?: string };
const ALL_WATCHLISTS: ReadonlyArray<WatchlistEntry> = [
  ...OFAC_SDN_STUB,
  ...PEP_WATCHLIST_STUB,
];

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Naive fuzzy name similarity score using normalised Levenshtein distance.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
function nameSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const s2 = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  if (s1 === s2) return 1.0;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshtein(s1, s2);
  return 1 - distance / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/** Boost score slightly when the country also matches a watchlist entry's country. */
function countryBoost(
  entry: WatchlistEntry,
  inputCountry?: string,
): number {
  if (!entry.country || !inputCountry) return 0;
  return entry.country.toUpperCase() === inputCountry.toUpperCase() ? 0.1 : 0;
}

// ── Main screening function ───────────────────────────────────────────────────

export async function screenSanctions(
  input: SanctionsScreeningInput,
): Promise<SanctionsScreeningOutput> {
  const screenedAt = new Date();
  const matchedEntries: string[] = [];
  let highestScore = 0;

  for (const entry of ALL_WATCHLISTS) {
    const nameScore = nameSimilarity(input.name, entry.name);
    const boost = countryBoost(entry, input.country);
    const combinedScore = Math.min(1.0, nameScore + boost);

    if (combinedScore >= POSSIBLE_MATCH_THRESHOLD) {
      matchedEntries.push(entry.name);
    }

    if (combinedScore > highestScore) {
      highestScore = combinedScore;
    }
  }

  // Determine result category
  let result: ScreeningResult;
  let reason: string;
  let requiresManualReview: boolean;

  if (highestScore >= HARD_MATCH_THRESHOLD) {
    result = 'match';
    reason =
      `Hard OFAC/PEP match detected (confidence ${(highestScore * 100).toFixed(1)}%). ` +
      `Matched watchlist entries: ${matchedEntries.join(', ')}. ` +
      'This is a hard stop — no override is permitted.';
    requiresManualReview = true;
  } else if (highestScore >= POSSIBLE_MATCH_THRESHOLD) {
    result = 'possible_match';
    reason =
      `Possible OFAC/PEP match detected (confidence ${(highestScore * 100).toFixed(1)}%). ` +
      `Possible matched entries: ${matchedEntries.join(', ')}. ` +
      'Escalated to compliance officer for manual review.';
    requiresManualReview = true;
  } else {
    result = 'no_match';
    reason = `No watchlist match found (highest similarity ${(highestScore * 100).toFixed(1)}%).`;
    requiresManualReview = false;
  }

  return {
    result,
    confidenceScore: parseFloat(highestScore.toFixed(4)),
    reason,
    requiresManualReview,
    matchedEntries: result === 'no_match' ? [] : matchedEntries,
    screenedAt,
  };
}

/** Convenience wrapper that returns true when the subject is a hard OFAC stop. */
export function isHardOFACStop(output: SanctionsScreeningOutput): boolean {
  return output.result === 'match';
}
