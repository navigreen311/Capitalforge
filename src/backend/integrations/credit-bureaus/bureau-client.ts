// ============================================================
// CapitalForge — Unified Credit Bureau Client
//
// Responsibilities:
//   - pullCredit(bureau, ssn, consent)       — personal FICO/VantageScore
//   - pullBusinessCredit(bureau, ein)        — business SBSS/Paydex
//   - Per-bureau rate limiting (token bucket — in-memory stub)
//   - Response normalisation to CreditProfile shape
//   - Adapters for Experian, TransUnion, Equifax, D&B
//     (all stubbed with correct API patterns — replace HTTP stubs with
//     real SDK / REST client calls listed inline)
//
// STUB NOTE: Each adapter contains comments showing the real API
// product name, endpoint pattern, and auth mechanism to use in prod.
//
// PII Handling:
//   - SSN is NEVER logged (masked by logger PII filter)
//   - EIN is treated as non-PII for logging purposes
//   - Raw bureau responses containing PII are stored encrypted (stubbed)
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import logger from '../../config/logger.js';
import type { Bureau, ScoreType } from '../../../shared/types/index.js';

// ── Types ─────────────────────────────────────────────────────

export type ProfileType = 'personal' | 'business';

/** Consent attestation required before any bureau pull */
export interface ConsentAttestation {
  /** Business or individual ID the consent belongs to */
  subjectId:   string;
  /** ISO timestamp when consent was captured */
  capturedAt:  string;
  /** Consent record ID in the consent service */
  consentId:   string;
  /** IP address of consent capture (for audit) */
  ipAddress?:  string;
}

/** Normalised tradeline from any bureau */
export interface NormalisedTradeline {
  creditor:      string;
  accountType:   string;
  creditLimit:   number | null;
  balance:       number | null;
  paymentStatus: 'current' | '30_days_late' | '60_days_late' | '90_days_late' | 'charge_off' | 'unknown';
  openedAt:      string | null;
  closedAt:      string | null;
  isDerogatory:  boolean;
}

/** Normalised credit profile — common shape across all bureaus */
export interface CreditProfile {
  profileId:       string;
  bureau:          Bureau;
  profileType:     ProfileType;
  score:           number | null;
  scoreType:       ScoreType | null;
  /** 0–1 utilization ratio, null for D&B Paydex */
  utilization:     number | null;
  inquiryCount:    number | null;
  derogatoryCount: number | null;
  tradelines:      NormalisedTradeline[];
  /** Encrypted/redacted raw bureau response stored for audit */
  rawResponseRef:  string;
  pulledAt:        string;
}

/** Result of a personal credit pull */
export interface PersonalCreditResult {
  profile:       CreditProfile;
  /** Subject (SSN owner) identifier — NOT the raw SSN */
  subjectRef:    string;
  consentId:     string;
  bureau:        Bureau;
}

/** Result of a business credit pull */
export interface BusinessCreditResult {
  profile:       CreditProfile;
  ein:           string;
  bureau:        Bureau;
  dunsNumber?:   string; // D&B specific
}

// ── Rate Limiter (token bucket, in-memory) ────────────────────
// Replace with Redis-backed token bucket (e.g. ioredis + sliding window)
// per bureau SLA: Experian 5 req/s, TransUnion 10 req/s, Equifax 5 req/s, D&B 2 req/s

const RATE_LIMITS: Record<Bureau, { requestsPerMinute: number }> = {
  experian:   { requestsPerMinute: 60 },
  transunion: { requestsPerMinute: 60 },
  equifax:    { requestsPerMinute: 60 },
  dnb:        { requestsPerMinute: 30 },
};

interface BucketState {
  tokens:        number;
  lastRefillAt:  number; // Unix ms
}

const _rateBuckets = new Map<Bureau, BucketState>();

function checkRateLimit(bureau: Bureau): void {
  const limit = RATE_LIMITS[bureau];
  const now   = Date.now();

  let bucket = _rateBuckets.get(bureau);

  if (!bucket) {
    bucket = { tokens: limit.requestsPerMinute, lastRefillAt: now };
    _rateBuckets.set(bureau, bucket);
  }

  // Refill tokens proportionally to elapsed time
  const elapsed  = now - bucket.lastRefillAt;
  const refill   = Math.floor((elapsed / 60_000) * limit.requestsPerMinute);
  bucket.tokens  = Math.min(limit.requestsPerMinute, bucket.tokens + refill);
  bucket.lastRefillAt = now;

  if (bucket.tokens < 1) {
    throw new BureauRateLimitError(bureau, limit.requestsPerMinute);
  }

  bucket.tokens -= 1;
}

// ── Stub Tradeline Generator ───────────────────────────────────

function buildStubTradelines(count: number): NormalisedTradeline[] {
  const types = ['revolving', 'installment', 'auto', 'business_line', 'mortgage'];
  return Array.from({ length: count }, (_, i): NormalisedTradeline => ({
    creditor:      `Stub Creditor ${i + 1}`,
    accountType:   types[i % types.length],
    creditLimit:   5_000 + i * 2_500,
    balance:       Math.floor(Math.random() * (4_000 + i * 500)),
    paymentStatus: Math.random() > 0.12 ? 'current' : '30_days_late',
    openedAt:      new Date(Date.now() - (i + 1) * 180 * 86_400_000).toISOString(),
    closedAt:      null,
    isDerogatory:  Math.random() < 0.08,
  }));
}

// ── Bureau Adapters ────────────────────────────────────────────
// Each adapter is namespaced with the real API product name.
// Replace the stub body with the commented production implementation.

// ── Experian ──────────────────────────────────────────────────
// Real API: Experian Business Information Services (BIS) — OAuth2 client credentials
// Endpoint: POST https://sandbox.experian.com/businessinformation/businesses/v1/creditreports
// Auth:     Bearer token via POST https://us-api.experian.com/oauth2/expresstoken/v1
// Docs:     https://developer.experian.com/

async function experianPullPersonal(
  _ssn:     string, // SSN — NEVER log this
  _consent: ConsentAttestation,
): Promise<CreditProfile> {
  // STUB: production replacement:
  //   const token = await experianOauth2.clientCredentials(
  //     EXPERIAN_CLIENT_ID, EXPERIAN_CLIENT_SECRET,
  //     'https://sandbox.experian.com/oauth2/v1/token'
  //   );
  //   const resp = await axios.post(
  //     'https://sandbox.experian.com/consumerinfo/v2/creditreport',
  //     { ssn, consent: { id: consent.consentId } },
  //     { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
  //   );
  //   return normaliseExperianPersonal(resp.data);

  const base = 640 + Math.floor(Math.random() * 160);
  return {
    profileId:       uuidv4(),
    bureau:          'experian',
    profileType:     'personal',
    score:           base,
    scoreType:       'fico',
    utilization:     parseFloat((Math.random() * 0.65).toFixed(4)),
    inquiryCount:    Math.floor(Math.random() * 9),
    derogatoryCount: Math.floor(Math.random() * 2),
    tradelines:      buildStubTradelines(5),
    rawResponseRef:  `experian-raw-${uuidv4()}`,
    pulledAt:        new Date().toISOString(),
  };
}

async function experianPullBusiness(ein: string): Promise<CreditProfile> {
  // STUB: production replacement:
  //   POST https://sandbox.experian.com/businessinformation/businesses/v1/creditreports
  //   Body: { taxId: ein, reportType: 'BizOwnerProfile' }

  return {
    profileId:       uuidv4(),
    bureau:          'experian',
    profileType:     'business',
    score:           Math.floor(Math.random() * 100),
    scoreType:       'sbss',
    utilization:     parseFloat((Math.random() * 0.60).toFixed(4)),
    inquiryCount:    Math.floor(Math.random() * 6),
    derogatoryCount: Math.floor(Math.random() * 2),
    tradelines:      buildStubTradelines(6),
    rawResponseRef:  `experian-biz-raw-${uuidv4()}`,
    pulledAt:        new Date().toISOString(),
  };
}

// ── TransUnion ────────────────────────────────────────────────
// Real API: TransUnion TruVision Solutions — TU API (SOAP/REST hybrid)
// Endpoint: POST https://netaccess-test.transunion.com/IDS/CreditReport
// Auth:     Mutual TLS (client certificate) + username/password in SOAP header
// Docs:     TU Developer Portal (account required)

async function transunionPullPersonal(
  _ssn:     string,
  _consent: ConsentAttestation,
): Promise<CreditProfile> {
  // STUB: production replacement (REST variant):
  //   const client = new TUApiClient({ cert, key, endpoint: TU_ENDPOINT });
  //   const report = await client.getCreditReport({ ssn, consentId: consent.consentId });
  //   return normaliseTuPersonal(report);

  const base = 630 + Math.floor(Math.random() * 170);
  return {
    profileId:       uuidv4(),
    bureau:          'transunion',
    profileType:     'personal',
    score:           base,
    scoreType:       'fico',
    utilization:     parseFloat((Math.random() * 0.55).toFixed(4)),
    inquiryCount:    Math.floor(Math.random() * 7),
    derogatoryCount: Math.floor(Math.random() * 3),
    tradelines:      buildStubTradelines(4),
    rawResponseRef:  `tu-raw-${uuidv4()}`,
    pulledAt:        new Date().toISOString(),
  };
}

async function transunionPullBusiness(ein: string): Promise<CreditProfile> {
  // STUB: POST https://netaccess-test.transunion.com/IDS/BusinessCreditReport
  return {
    profileId:       uuidv4(),
    bureau:          'transunion',
    profileType:     'business',
    score:           Math.floor(Math.random() * 100),
    scoreType:       'sbss',
    utilization:     parseFloat((Math.random() * 0.50).toFixed(4)),
    inquiryCount:    Math.floor(Math.random() * 5),
    derogatoryCount: Math.floor(Math.random() * 2),
    tradelines:      buildStubTradelines(3),
    rawResponseRef:  `tu-biz-raw-${uuidv4()}`,
    pulledAt:        new Date().toISOString(),
  };
}

// ── Equifax ───────────────────────────────────────────────────
// Real API: Equifax Developer Platform — EFX API REST
// Endpoint: POST https://api.sandbox.equifax.com/consumer/credit/v1/equifax-complete-premier-report
// Auth:     OAuth2 Bearer token (client credentials)
// Docs:     https://developer.equifax.com/

async function equifaxPullPersonal(
  _ssn:     string,
  _consent: ConsentAttestation,
): Promise<CreditProfile> {
  // STUB: production replacement:
  //   const token = await equifaxOauth.getToken(EFX_CLIENT_ID, EFX_CLIENT_SECRET);
  //   const resp  = await axios.post(
  //     'https://api.sandbox.equifax.com/consumer/credit/v1/equifax-complete-premier-report',
  //     { consumers: { name: [{ identifier: 'current' }], socialNum: [{ number: ssn }] } },
  //     { headers: { Authorization: `Bearer ${token}` } }
  //   );
  //   return normaliseEquifaxPersonal(resp.data);

  const base = 650 + Math.floor(Math.random() * 150);
  return {
    profileId:       uuidv4(),
    bureau:          'equifax',
    profileType:     'personal',
    score:           base,
    scoreType:       'fico',
    utilization:     parseFloat((Math.random() * 0.60).toFixed(4)),
    inquiryCount:    Math.floor(Math.random() * 8),
    derogatoryCount: Math.floor(Math.random() * 3),
    tradelines:      buildStubTradelines(3),
    rawResponseRef:  `efx-raw-${uuidv4()}`,
    pulledAt:        new Date().toISOString(),
  };
}

async function equifaxPullBusiness(ein: string): Promise<CreditProfile> {
  // STUB: POST https://api.sandbox.equifax.com/business/credit/v1/small-business-report
  return {
    profileId:       uuidv4(),
    bureau:          'equifax',
    profileType:     'business',
    score:           Math.floor(Math.random() * 100),
    scoreType:       'sbss',
    utilization:     parseFloat((Math.random() * 0.55).toFixed(4)),
    inquiryCount:    Math.floor(Math.random() * 5),
    derogatoryCount: Math.floor(Math.random() * 2),
    tradelines:      buildStubTradelines(4),
    rawResponseRef:  `efx-biz-raw-${uuidv4()}`,
    pulledAt:        new Date().toISOString(),
  };
}

// ── D&B (Dun & Bradstreet) ────────────────────────────────────
// Real API: D&B Direct+ Data Layer — Business Information Report
// Endpoint: GET https://plus.dnb.com/v1/data/duns/{dunsNumber}?productId=CMPELK&versionId=v1
// Auth:     Bearer token via POST https://plus.dnb.com/v2/token (client_id/secret)
// Notes:    D&B uses Paydex (0–100) not FICO; no personal SSN pull
// Docs:     https://directplus.documentation.dnb.com/

async function dnbPullBusiness(ein: string): Promise<CreditProfile & { dunsNumber: string }> {
  // STUB: production replacement:
  //   const token = await dnbOauth.getToken(DNB_CLIENT_ID, DNB_CLIENT_SECRET);
  //   // Step 1: resolve DUNS from EIN
  //   const matchResp = await axios.post(
  //     'https://plus.dnb.com/v1/match/cleanseMatch',
  //     { countryISOAlpha2Code: 'US', registrationNumbers: [{ typeDnBCode: '6863', registrationNumber: ein }] },
  //     { headers: { Authorization: `Bearer ${token}` } }
  //   );
  //   const dunsNumber = matchResp.data.matchCandidates[0].organization.duns;
  //   // Step 2: pull credit report
  //   const creditResp = await axios.get(
  //     `https://plus.dnb.com/v1/data/duns/${dunsNumber}?productId=CMPELK&versionId=v1`,
  //     { headers: { Authorization: `Bearer ${token}` } }
  //   );
  //   return normaliseDnBCredit(creditResp.data, dunsNumber);

  const dunsNumber = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0');
  return {
    profileId:       uuidv4(),
    bureau:          'dnb',
    profileType:     'business',
    score:           60 + Math.floor(Math.random() * 40), // Paydex: 0–100
    scoreType:       'paydex',
    utilization:     null, // D&B Paydex does not model utilization
    inquiryCount:    Math.floor(Math.random() * 4),
    derogatoryCount: Math.floor(Math.random() * 2),
    tradelines:      buildStubTradelines(6),
    rawResponseRef:  `dnb-raw-${uuidv4()}`,
    pulledAt:        new Date().toISOString(),
    dunsNumber,
  };
}

// ── BureauClient ──────────────────────────────────────────────

export class BureauClient {

  // ── Personal Credit Pull ───────────────────────────────────

  /**
   * Pull a personal credit report with explicit consent attestation.
   *
   * @param bureau   Target credit bureau
   * @param ssn      Social Security Number — NEVER logged
   * @param consent  Consent attestation record (required by FCRA)
   * @returns        Normalised CreditProfile
   *
   * @throws BureauRateLimitError    if rate limit exceeded
   * @throws BureauConsentError      if consent attestation is invalid
   * @throws BureauUnsupportedError  if bureau does not support personal pulls
   */
  async pullCredit(
    bureau:  Bureau,
    ssn:     string,
    consent: ConsentAttestation,
  ): Promise<PersonalCreditResult> {
    this._validateConsent(consent);
    checkRateLimit(bureau);

    logger.info('[BureauClient] pullCredit initiated', {
      bureau,
      subjectId:  consent.subjectId,
      consentId:  consent.consentId,
      // ssn is intentionally NOT logged — masked by logger PII filter anyway
    });

    let profile: CreditProfile;

    switch (bureau) {
      case 'experian':
        profile = await experianPullPersonal(ssn, consent);
        break;
      case 'transunion':
        profile = await transunionPullPersonal(ssn, consent);
        break;
      case 'equifax':
        profile = await equifaxPullPersonal(ssn, consent);
        break;
      case 'dnb':
        throw new BureauUnsupportedError(
          'dnb',
          'D&B does not support personal SSN-based credit pulls. Use pullBusinessCredit() with an EIN.',
        );
      default:
        throw new BureauUnsupportedError(bureau as string, 'Unknown bureau');
    }

    logger.info('[BureauClient] pullCredit completed', {
      bureau,
      profileId: profile.profileId,
      scoreType: profile.scoreType,
      // score logged at debug level only
    });

    return {
      profile,
      subjectRef: `subject-${consent.subjectId}`,
      consentId:  consent.consentId,
      bureau,
    };
  }

  // ── Business Credit Pull ────────────────────────────────────

  /**
   * Pull a business credit report using an EIN.
   * No individual consent required (business entity, not personal data).
   *
   * @param bureau  Target credit bureau
   * @param ein     Employer Identification Number
   * @returns       Normalised BusinessCreditResult
   *
   * @throws BureauRateLimitError   if rate limit exceeded
   * @throws BureauValidationError  if EIN format is invalid
   */
  async pullBusinessCredit(
    bureau: Bureau,
    ein:    string,
  ): Promise<BusinessCreditResult> {
    this._validateEin(ein);
    checkRateLimit(bureau);

    logger.info('[BureauClient] pullBusinessCredit initiated', { bureau, ein });

    let profile: CreditProfile;
    let dunsNumber: string | undefined;

    switch (bureau) {
      case 'experian':
        profile = await experianPullBusiness(ein);
        break;
      case 'transunion':
        profile = await transunionPullBusiness(ein);
        break;
      case 'equifax':
        profile = await equifaxPullBusiness(ein);
        break;
      case 'dnb': {
        const dnbResult = await dnbPullBusiness(ein);
        dunsNumber = dnbResult.dunsNumber;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { dunsNumber: _dn, ...rest } = dnbResult;
        profile = rest;
        break;
      }
      default:
        throw new BureauUnsupportedError(bureau as string, 'Unknown bureau');
    }

    logger.info('[BureauClient] pullBusinessCredit completed', {
      bureau,
      profileId: profile.profileId,
      scoreType: profile.scoreType,
      ...(dunsNumber ? { dunsNumber } : {}),
    });

    return { profile, ein, bureau, dunsNumber };
  }

  // ── Rate Limit Status ──────────────────────────────────────

  /**
   * Return remaining token count for a bureau's rate bucket.
   * Useful for monitoring dashboards.
   */
  getRateLimitStatus(bureau: Bureau): { bureau: Bureau; tokensRemaining: number; requestsPerMinute: number } {
    const bucket = _rateBuckets.get(bureau);
    return {
      bureau,
      tokensRemaining:    bucket?.tokens ?? RATE_LIMITS[bureau].requestsPerMinute,
      requestsPerMinute:  RATE_LIMITS[bureau].requestsPerMinute,
    };
  }

  // ── Private Validators ─────────────────────────────────────

  private _validateConsent(consent: ConsentAttestation): void {
    if (!consent.subjectId || !consent.consentId || !consent.capturedAt) {
      throw new BureauConsentError(
        'Consent attestation must include subjectId, consentId, and capturedAt',
      );
    }

    const capturedMs = new Date(consent.capturedAt).getTime();
    if (isNaN(capturedMs)) {
      throw new BureauConsentError(`Invalid capturedAt timestamp: ${consent.capturedAt}`);
    }

    // Consent must not be older than 90 days (FCRA permissible purpose window)
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    if (Date.now() - capturedMs > ninetyDaysMs) {
      throw new BureauConsentError(
        `Consent is older than 90 days (capturedAt: ${consent.capturedAt}). Recapture required.`,
      );
    }
  }

  private _validateEin(ein: string): void {
    // EIN format: XX-XXXXXXX (9 digits, optional hyphen)
    const clean = ein.replace(/-/g, '');
    if (!/^\d{9}$/.test(clean)) {
      throw new BureauValidationError(`Invalid EIN format: ${ein}. Expected 9 digits (e.g. 12-3456789).`);
    }
  }

  /** Reset rate buckets — for testing only. @internal */
  _resetRateBuckets(): void {
    _rateBuckets.clear();
  }
}

// ── Domain Errors ──────────────────────────────────────────────

export class BureauRateLimitError extends Error {
  public readonly code = 'BUREAU_RATE_LIMIT_EXCEEDED';
  constructor(bureau: Bureau, requestsPerMinute: number) {
    super(`Rate limit exceeded for ${bureau}: max ${requestsPerMinute} requests/minute`);
    this.name = 'BureauRateLimitError';
  }
}

export class BureauConsentError extends Error {
  public readonly code = 'BUREAU_CONSENT_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'BureauConsentError';
  }
}

export class BureauValidationError extends Error {
  public readonly code = 'BUREAU_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'BureauValidationError';
  }
}

export class BureauUnsupportedError extends Error {
  public readonly code = 'BUREAU_UNSUPPORTED_OPERATION';
  constructor(bureau: string, message: string) {
    super(`Bureau '${bureau}': ${message}`);
    this.name = 'BureauUnsupportedError';
  }
}

export class BureauApiError extends Error {
  public readonly code = 'BUREAU_API_ERROR';
  public readonly bureau: Bureau;
  public readonly httpStatus?: number;
  constructor(bureau: Bureau, message: string, httpStatus?: number) {
    super(`${bureau} API error: ${message}`);
    this.name    = 'BureauApiError';
    this.bureau  = bureau;
    this.httpStatus = httpStatus;
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const bureauClient = new BureauClient();
