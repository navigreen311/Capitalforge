// ============================================================
// CapitalForge — Synthetic Identity Fraud Detection
//
// Heuristic-based detection for synthetic identity fraud patterns
// common in credit card stacking fraud. Each check produces a
// weighted signal; signals are aggregated into a FraudRiskScore.
//
// Disposition:
//   low      (0–29)   → proceed normally
//   medium   (30–59)  → proceed with elevated monitoring
//   high     (60–84)  → manual review required
//   critical (85–100) → hard stop, escalate to compliance
// ============================================================

export type FraudRiskDisposition = 'low' | 'medium' | 'high' | 'critical';

export interface FraudSignal {
  /** Machine-readable signal identifier */
  code: string;
  /** Short human-readable description */
  description: string;
  /** Weighted score contribution (0–100) */
  weight: number;
  /** Whether the signal alone warrants manual review */
  flagForReview: boolean;
}

export interface FraudDetectionInput {
  // ── Individual (owner) data ─────────────────────────────────
  /** SSN (last 4 or full — used only for age-derivation heuristic) */
  ssn?: string;
  /** Applicant date of birth (ISO string) */
  dateOfBirth?: string;
  /** Residential address history (most recent first) */
  addressHistory?: Array<{
    street: string;
    city: string;
    state: string;
    zip: string;
    movedInDate?: string;
  }>;
  /** Estimated credit file age in months (from bureau) */
  creditFileAgeMonths?: number;
  /** Number of tradelines on file */
  tradelineCount?: number;
  /** Highest single credit limit across all open tradelines */
  highestCreditLimit?: number;
  /** Total utilisation ratio (0.0 – 1.0) across all tradelines */
  totalUtilization?: number;
  /** Number of hard inquiries in the past 6 months */
  inquiriesLast6Mo?: number;

  // ── Business / entity data ──────────────────────────────────
  /** Business EIN */
  ein?: string;
  /** Legal entity name as registered */
  entityName?: string;
  /** Date the entity was formed (ISO string) */
  entityFormationDate?: string;
  /** Whether the EIN was verified against IRS records (stub) */
  einVerified?: boolean;
  /** Age of EIN in months (from IRS stub) */
  einAgeMonths?: number;
  /** Number of prior addresses associated with this EIN */
  einAddressCount?: number;
}

export interface FraudDetectionOutput {
  /** Aggregate fraud risk score 0–100 */
  riskScore: number;
  disposition: FraudRiskDisposition;
  signals: FraudSignal[];
  /** Whether a compliance officer must review before proceeding */
  requiresManualReview: boolean;
  /** High-level narrative for audit trail */
  summary: string;
  evaluatedAt: Date;
}

// ── Score → disposition mapping ───────────────────────────────────────────────

function scoreToDisposition(score: number): FraudRiskDisposition {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

// ── Individual heuristic checks ───────────────────────────────────────────────

/**
 * SSN-Age Mismatch
 * The first 3 digits (area number) of an SSN issued before 2011 encode
 * the state of issuance, which correlates with the applicant's birth region.
 * A brand-new SSN on a person who claims to be 40+ is a strong synthetic signal.
 *
 * Post-2011 SSNs use randomised assignment, so we apply a softer heuristic:
 * if the credit file age is < 24 months but the person claims to be ≥ 35,
 * that gap is suspicious.
 */
function checkSsnAgeMismatch(input: FraudDetectionInput): FraudSignal | null {
  const { dateOfBirth, creditFileAgeMonths } = input;
  if (!dateOfBirth || creditFileAgeMonths === undefined) return null;

  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;

  const ageYears =
    (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  if (ageYears >= 35 && creditFileAgeMonths < 24) {
    return {
      code: 'SSN_AGE_MISMATCH',
      description:
        `Applicant is ${Math.floor(ageYears)} years old but credit file is only ` +
        `${creditFileAgeMonths} months old — possible synthetic/piggybacked identity.`,
      weight: 35,
      flagForReview: true,
    };
  }

  if (ageYears >= 25 && creditFileAgeMonths < 12) {
    return {
      code: 'SSN_THIN_FILE_ADULT',
      description:
        `Adult applicant (${Math.floor(ageYears)} yrs) has a very thin credit file ` +
        `(${creditFileAgeMonths} months). May indicate a recently manufactured identity.`,
      weight: 20,
      flagForReview: false,
    };
  }

  return null;
}

/**
 * Address Velocity
 * Synthetic identities often have multiple addresses attached in a short
 * period as bad actors try to establish legitimacy across many jurisdictions.
 */
function checkAddressVelocity(input: FraudDetectionInput): FraudSignal | null {
  const { addressHistory } = input;
  if (!addressHistory || addressHistory.length === 0) return null;

  const VELOCITY_WINDOW_MONTHS = 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - VELOCITY_WINDOW_MONTHS);

  const recentMoves = addressHistory.filter((a) => {
    if (!a.movedInDate) return false;
    const d = new Date(a.movedInDate);
    return !isNaN(d.getTime()) && d >= cutoff;
  });

  if (recentMoves.length >= 4) {
    return {
      code: 'ADDRESS_VELOCITY_CRITICAL',
      description:
        `${recentMoves.length} address changes in the past ${VELOCITY_WINDOW_MONTHS} months — ` +
        'highly unusual, consistent with synthetic identity manufacturing.',
      weight: 40,
      flagForReview: true,
    };
  }

  if (recentMoves.length >= 2) {
    return {
      code: 'ADDRESS_VELOCITY_ELEVATED',
      description:
        `${recentMoves.length} address changes in the past ${VELOCITY_WINDOW_MONTHS} months — ` +
        'elevated mobility; monitor closely.',
      weight: 15,
      flagForReview: false,
    };
  }

  return null;
}

/**
 * Thin File + High Limits
 * A credit file with very few tradelines but unexpectedly high limits is a
 * classic stacking fraud signal. Fraudsters "park" large limits via
 * authorised-user additions before applying for fresh cards.
 */
function checkThinFileHighLimits(input: FraudDetectionInput): FraudSignal | null {
  const { tradelineCount, highestCreditLimit, creditFileAgeMonths } = input;
  if (
    tradelineCount === undefined ||
    highestCreditLimit === undefined ||
    creditFileAgeMonths === undefined
  ) {
    return null;
  }

  const isThinFile = tradelineCount <= 3 && creditFileAgeMonths < 36;
  const hasHighLimit = highestCreditLimit >= 20000;

  if (isThinFile && hasHighLimit) {
    return {
      code: 'THIN_FILE_HIGH_LIMIT',
      description:
        `Only ${tradelineCount} tradeline(s) on a ${creditFileAgeMonths}-month-old file, ` +
        `yet highest single limit is $${highestCreditLimit.toLocaleString()}. ` +
        'Consistent with authorised-user stacking or synthetic identity.',
      weight: 30,
      flagForReview: true,
    };
  }

  // Extreme case: no tradelines at all but still claiming an identity
  if (tradelineCount === 0 && creditFileAgeMonths > 0) {
    return {
      code: 'NO_TRADELINES',
      description:
        `Credit file exists (${creditFileAgeMonths} months) but contains zero tradelines. ` +
        'May indicate a recently obtained or synthetic SSN.',
      weight: 25,
      flagForReview: false,
    };
  }

  return null;
}

/**
 * High Inquiry Velocity
 * Many hard inquiries in a short window indicate rapid application across
 * multiple issuers — a stacking fraud hallmark.
 */
function checkInquiryVelocity(input: FraudDetectionInput): FraudSignal | null {
  const { inquiriesLast6Mo } = input;
  if (inquiriesLast6Mo === undefined) return null;

  if (inquiriesLast6Mo >= 10) {
    return {
      code: 'INQUIRY_VELOCITY_CRITICAL',
      description:
        `${inquiriesLast6Mo} hard inquiries in the past 6 months — ` +
        'extreme velocity consistent with organised credit fraud.',
      weight: 35,
      flagForReview: true,
    };
  }

  if (inquiriesLast6Mo >= 6) {
    return {
      code: 'INQUIRY_VELOCITY_HIGH',
      description:
        `${inquiriesLast6Mo} hard inquiries in the past 6 months — ` +
        'elevated; review for coordinated stacking pattern.',
      weight: 15,
      flagForReview: false,
    };
  }

  return null;
}

/**
 * EIN-Entity Mismatch / EIN Anomalies
 * Checks for mismatches between the EIN characteristics and the entity
 * profile. A freshly-issued EIN on an entity that claims multi-year history
 * is a red flag. Also checks for excessive address churn on the EIN.
 */
function checkEinEntityMismatch(input: FraudDetectionInput): FraudSignal | null {
  const { einVerified, einAgeMonths, entityFormationDate, einAddressCount } = input;

  // Unverifiable EIN
  if (einVerified === false) {
    return {
      code: 'EIN_NOT_VERIFIED',
      description:
        'EIN could not be verified against IRS records. Application cannot proceed without a valid EIN.',
      weight: 50,
      flagForReview: true,
    };
  }

  // EIN newer than claimed entity age
  if (einAgeMonths !== undefined && entityFormationDate) {
    const formed = new Date(entityFormationDate);
    if (!isNaN(formed.getTime())) {
      const entityAgeMonths =
        (Date.now() - formed.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

      // EIN should not be younger than the entity, with a 6-month grace window
      const gap = entityAgeMonths - einAgeMonths;
      if (gap > 6) {
        return {
          code: 'EIN_ENTITY_AGE_MISMATCH',
          description:
            `Entity claims formation ${Math.floor(entityAgeMonths)} months ago but EIN is only ` +
            `${einAgeMonths} months old (${Math.floor(gap)}-month discrepancy). ` +
            'Possible shell entity or EIN substitution.',
          weight: 40,
          flagForReview: true,
        };
      }
    }
  }

  // EIN address churn
  if (einAddressCount !== undefined && einAddressCount >= 5) {
    return {
      code: 'EIN_ADDRESS_CHURN',
      description:
        `${einAddressCount} distinct addresses on record for this EIN. ` +
        'Unusual for a legitimate operating entity.',
      weight: 20,
      flagForReview: false,
    };
  }

  return null;
}

// ── Aggregate evaluator ───────────────────────────────────────────────────────

export async function detectFraud(
  input: FraudDetectionInput,
): Promise<FraudDetectionOutput> {
  const evaluatedAt = new Date();

  const rawSignals: Array<FraudSignal | null> = [
    checkSsnAgeMismatch(input),
    checkAddressVelocity(input),
    checkThinFileHighLimits(input),
    checkInquiryVelocity(input),
    checkEinEntityMismatch(input),
  ];

  const signals = rawSignals.filter((s): s is FraudSignal => s !== null);

  // Cap aggregate score at 100
  const riskScore = Math.min(
    100,
    signals.reduce((acc, s) => acc + s.weight, 0),
  );

  const disposition = scoreToDisposition(riskScore);
  const requiresManualReview =
    disposition === 'high' ||
    disposition === 'critical' ||
    signals.some((s) => s.flagForReview);

  const summary =
    signals.length === 0
      ? 'No fraud signals detected. Identity appears consistent.'
      : `${signals.length} fraud signal(s) detected. ` +
        `Aggregate risk score: ${riskScore}/100 (${disposition}). ` +
        `Signals: ${signals.map((s) => s.code).join(', ')}.`;

  return {
    riskScore,
    disposition,
    signals,
    requiresManualReview,
    summary,
    evaluatedAt,
  };
}
