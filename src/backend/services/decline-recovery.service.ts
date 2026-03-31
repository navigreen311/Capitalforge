// ============================================================
// CapitalForge — Decline Recovery Service
//
// Responsibilities:
//   1. Decode and categorize decline reasons (credit / utilization /
//      velocity / fraud / other)
//   2. Track adverse action notices per CardApplication
//   3. Generate ECOA-compliant reconsideration letters
//   4. Manage per-issuer reapply cooldown calendars
//   5. Auto-trigger when application status transitions to "declined"
//   6. Emit DECLINE_RECOVERY_CREATED and RECONSIDERATION_GENERATED events
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES, ISSUER_RULES } from '@shared/constants/index.js';
import logger from '../config/logger.js';

// ── Prisma singleton ──────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

/** Allow tests to inject a mock client. */
export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Decline Category Types ────────────────────────────────────

export type DeclineCategory =
  | 'credit'
  | 'utilization'
  | 'velocity'
  | 'fraud'
  | 'other';

export const DECLINE_CATEGORIES: Record<DeclineCategory, string> = {
  credit:      'Credit score or credit history',
  utilization: 'Credit utilization too high',
  velocity:    'Too many recent applications or new accounts',
  fraud:       'Fraud alert, freeze, or security concern',
  other:       'Other / unclassified reason',
};

// ── Reason Code Dictionaries ──────────────────────────────────

/** Maps normalized reason text patterns to a DeclineCategory. */
const REASON_PATTERN_MAP: Array<{ pattern: RegExp; category: DeclineCategory }> = [
  // Credit
  { pattern: /credit score|fico|too low|insufficient credit history|derogatory|charge.?off|collection|bankruptcy|public record/i, category: 'credit' },
  // Utilization
  { pattern: /utilization|balance.{0,20}too high|revolving balance|credit usage|high balances|proportion/i, category: 'utilization' },
  // Velocity
  { pattern: /too many.{0,30}inquir|too many.{0,30}account|recently opened|new accounts|5\/24|chase.*rule|velocity|recent applications/i, category: 'velocity' },
  // Fraud
  { pattern: /fraud|security alert|identity theft|freeze|suspicious|cannot verify identity/i, category: 'fraud' },
];

/** Known ECOA / FCRA numeric reason codes → human-readable label + category. */
export const REASON_CODE_MAP: Record<string, { label: string; category: DeclineCategory }> = {
  '01': { label: 'Delinquent past or present credit obligations', category: 'credit' },
  '02': { label: 'Level of delinquency on accounts', category: 'credit' },
  '03': { label: 'Too few bank revolving accounts', category: 'credit' },
  '04': { label: 'Too many bank or revolving accounts', category: 'velocity' },
  '05': { label: 'Too many accounts with balances', category: 'utilization' },
  '06': { label: 'Too many consumer finance company accounts', category: 'velocity' },
  '07': { label: 'Account payment history too new to rate', category: 'credit' },
  '08': { label: 'Too many recent inquiries last 12 months', category: 'velocity' },
  '09': { label: 'Too many accounts recently opened', category: 'velocity' },
  '10': { label: 'Proportion of balances to credit limits too high', category: 'utilization' },
  '11': { label: 'Amount owed on revolving accounts too high', category: 'utilization' },
  '12': { label: 'Length of revolving credit history too short', category: 'credit' },
  '13': { label: 'Time since delinquency too recent', category: 'credit' },
  '14': { label: 'Length of credit history too short', category: 'credit' },
  '15': { label: 'Lack of recent revolving account information', category: 'credit' },
  '16': { label: 'Lack of recent installment loan information', category: 'credit' },
  '17': { label: 'No recent non-mortgage balance information', category: 'credit' },
  '18': { label: 'Number of accounts with delinquency', category: 'credit' },
  '19': { label: 'Too few accounts currently paid as agreed', category: 'credit' },
  '20': { label: 'Time since derogatory public record or collection', category: 'credit' },
  '21': { label: 'Amount past due on accounts', category: 'credit' },
  '22': { label: 'Serious delinquency, and public record or collection filed', category: 'credit' },
  '99': { label: 'Fraud alert on file', category: 'fraud' },
};

// ── Issuer Cooldown Calendar ──────────────────────────────────

/** Days to wait before reapplying, by issuer. */
export const ISSUER_COOLDOWN_DAYS: Record<string, number> = {
  chase:          30,
  amex:           ISSUER_RULES.AMEX_VELOCITY_COOLDOWN_DAYS,   // 90
  citi:           ISSUER_RULES.CITI_8_65_DAYS,                // 65
  bank_of_america: 30,
  capital_one:    60,
  us_bank:        30,
  wells_fargo:    30,
  barclays:       90,
  synchrony:      30,
  discover:       30,
  default:        60,
};

function getIssuerCooldownDays(issuer: string): number {
  const normalized = issuer.toLowerCase().replace(/\s+/g, '_');
  return ISSUER_COOLDOWN_DAYS[normalized] ?? ISSUER_COOLDOWN_DAYS['default'];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ── Decline Reason Types ──────────────────────────────────────

export interface DeclineReason {
  code?: string;
  rawText: string;
  category: DeclineCategory;
  label: string;
}

export interface CooldownCalendar {
  issuer:             string;
  declinedAt:         Date;
  cooldownDays:       number;
  reapplyEligibleAt:  Date;
  daysRemaining:      number;
  isEligibleNow:      boolean;
}

export interface ReconsiderationLetter {
  letterId:      string;
  businessId:    string;
  issuer:        string;
  generatedAt:   Date;
  subject:       string;
  body:          string;
  declineReasons: DeclineReason[];
}

export interface DeclineRecoveryRecord {
  id:                     string;
  tenantId:               string;
  businessId:             string;
  applicationId:          string;
  issuer:                 string;
  declineReasons:         DeclineReason[];
  adverseActionRaw:       string | null;
  reconsiderationStatus:  string;
  reconsiderationNotes:   string | null;
  reapplyCooldownDate:    Date | null;
  letterGenerated:        boolean;
  createdAt:              Date;
  updatedAt:              Date;
}

// ── Core: Categorize Decline Reasons ─────────────────────────

/**
 * Decode a raw decline reason string or ECOA reason code into a
 * structured DeclineReason with category assignment.
 */
export function categorizeDeclineReason(rawText: string, code?: string): DeclineReason {
  // Try numeric code lookup first
  if (code && REASON_CODE_MAP[code]) {
    const mapped = REASON_CODE_MAP[code];
    return {
      code,
      rawText,
      category: mapped.category,
      label:    mapped.label,
    };
  }

  // Pattern-match against the raw text
  for (const entry of REASON_PATTERN_MAP) {
    if (entry.pattern.test(rawText)) {
      return {
        code,
        rawText,
        category: entry.category,
        label:    rawText.trim() || DECLINE_CATEGORIES[entry.category],
      };
    }
  }

  return {
    code,
    rawText,
    category: 'other',
    label:    rawText.trim() || DECLINE_CATEGORIES.other,
  };
}

/**
 * Categorize an array of raw reason strings or { code, text } objects.
 */
export function categorizeDeclineReasons(
  reasons: Array<string | { code?: string; text: string }>,
): DeclineReason[] {
  return reasons.map((r) => {
    if (typeof r === 'string') return categorizeDeclineReason(r);
    return categorizeDeclineReason(r.text, r.code);
  });
}

// ── Core: Cooldown Calendar ───────────────────────────────────

/**
 * Build the reapply cooldown calendar for an issuer from the decline date.
 */
export function buildCooldownCalendar(issuer: string, declinedAt: Date): CooldownCalendar {
  const cooldownDays      = getIssuerCooldownDays(issuer);
  const reapplyEligibleAt = addDays(declinedAt, cooldownDays);
  const now               = new Date();
  const msRemaining       = reapplyEligibleAt.getTime() - now.getTime();
  const daysRemaining     = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  return {
    issuer,
    declinedAt,
    cooldownDays,
    reapplyEligibleAt,
    daysRemaining,
    isEligibleNow: msRemaining <= 0,
  };
}

// ── Core: Reconsideration Letter Generation ───────────────────

/**
 * Generate an ECOA-compliant reconsideration letter for a decline.
 * This letter references the specific adverse reasons and requests
 * human reconsideration of the automated decision.
 */
export function generateReconsiderationLetter(
  businessId:     string,
  businessName:   string,
  issuer:         string,
  declineReasons: DeclineReason[],
  applicationId:  string,
): ReconsiderationLetter {
  const letterId    = uuidv4();
  const generatedAt = new Date();

  const reasonList = declineReasons
    .map((r, i) => `  ${i + 1}. ${r.label}`)
    .join('\n');

  const creditReasons      = declineReasons.filter((r) => r.category === 'credit');
  const utilizationReasons = declineReasons.filter((r) => r.category === 'utilization');
  const velocityReasons    = declineReasons.filter((r) => r.category === 'velocity');

  // Build tailored context paragraphs per category
  const contextParagraphs: string[] = [];

  if (creditReasons.length > 0) {
    contextParagraphs.push(
      `Regarding credit history factors: Our records reflect a recently improved credit profile. ` +
      `Any derogatory items referenced are either resolved, in active dispute, or do not accurately ` +
      `represent our current creditworthiness. We can provide supporting documentation upon request.`,
    );
  }

  if (utilizationReasons.length > 0) {
    contextParagraphs.push(
      `Regarding utilization: Current utilization ratios reflect strategic financing activity. ` +
      `Available credit lines are being actively managed and balances are being reduced. ` +
      `We anticipate materially lower utilization within the next billing cycle.`,
    );
  }

  if (velocityReasons.length > 0) {
    contextParagraphs.push(
      `Regarding recent inquiry or account velocity: Recent credit applications are part of a ` +
      `planned and structured business financing strategy — not indicative of financial distress. ` +
      `Each application serves a specific business purpose with documented cash-flow justification.`,
    );
  }

  const contextSection =
    contextParagraphs.length > 0
      ? contextParagraphs.join('\n\n')
      : `We believe this application merits further review given our business profile and financial trajectory.`;

  const subject = `Request for Reconsideration — Credit Card Application (Ref: ${applicationId})`;

  const body = `Date: ${generatedAt.toDateString()}

To the Credit Reconsideration Department,
${issuer} — Business Credit Division

Re: Reconsideration of Recent Credit Application
Applicant: ${businessName} (Business ID: ${businessId})
Application Reference: ${applicationId}

Dear Reconsideration Team,

I am writing to formally request reconsideration of the recent adverse action taken on the above-referenced business credit application. We received notice that our application was declined, with the following reasons cited:

${reasonList}

We respectfully request that your team conduct a manual review of this application in light of the following:

${contextSection}

We are committed to responsible credit use and believe our business profile — including revenue trends, payment history, and overall financial health — supports approval of this application. We welcome the opportunity to provide any additional documentation or clarification that would assist in your review.

This reconsideration request is submitted in accordance with our rights under the Equal Credit Opportunity Act (ECOA) and the Fair Credit Reporting Act (FCRA). We understand that we are entitled to a written statement of reasons for any adverse action taken.

Please do not hesitate to contact us to discuss this request further.

Sincerely,

[Authorized Signatory]
${businessName}

---
This letter was generated in accordance with ECOA (15 U.S.C. § 1691) and FCRA (15 U.S.C. § 1681) requirements.
Letter ID: ${letterId}
Generated: ${generatedAt.toISOString()}
`;

  return {
    letterId,
    businessId,
    issuer,
    generatedAt,
    subject,
    body,
    declineReasons,
  };
}

// ── Service: Create Decline Recovery Record ───────────────────

export interface CreateDeclineRecoveryInput {
  tenantId:        string;
  businessId:      string;
  applicationId:   string;
  issuer:          string;
  declineReasons:  Array<string | { code?: string; text: string }>;
  adverseActionRaw?: string;
  declinedAt?:     Date;
}

/**
 * Primary entry point — called automatically when an application
 * transitions to "declined". Creates a DeclineRecovery record,
 * categorizes reasons, computes cooldown, and emits an event.
 */
export async function createDeclineRecovery(
  input: CreateDeclineRecoveryInput,
): Promise<DeclineRecoveryRecord> {
  const prisma      = getPrisma();
  const declinedAt  = input.declinedAt ?? new Date();
  const cooldown    = buildCooldownCalendar(input.issuer, declinedAt);
  const reasons     = categorizeDeclineReasons(input.declineReasons);

  const record = await prisma.declineRecovery.create({
    data: {
      tenantId:              input.tenantId,
      businessId:            input.businessId,
      applicationId:         input.applicationId,
      issuer:                input.issuer,
      declineReasons:        reasons as unknown as object,
      adverseActionRaw:      input.adverseActionRaw ?? null,
      reconsiderationStatus: 'pending',
      reapplyCooldownDate:   cooldown.reapplyEligibleAt,
      letterGenerated:       false,
    },
  });

  await eventBus.publishAndPersist(input.tenantId, {
    eventType:     'decline.recovery.created',
    aggregateType: AGGREGATE_TYPES.APPLICATION,
    aggregateId:   input.applicationId,
    payload: {
      recoveryId:    record.id,
      businessId:    input.businessId,
      applicationId: input.applicationId,
      issuer:        input.issuer,
      categoryBreakdown: buildCategoryBreakdown(reasons),
      cooldownDays:  cooldown.cooldownDays,
      reapplyEligibleAt: cooldown.reapplyEligibleAt.toISOString(),
    },
  });

  logger.info('[DeclineRecovery] Recovery record created', {
    recoveryId:    record.id,
    applicationId: input.applicationId,
    businessId:    input.businessId,
    issuer:        input.issuer,
    reasonCount:   reasons.length,
  });

  return mapDbRecord(record, reasons);
}

// ── Service: List Declines for a Business ────────────────────

export async function listDeclinesByBusiness(
  businessId: string,
  tenantId:   string,
): Promise<DeclineRecoveryRecord[]> {
  const prisma = getPrisma();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: any[] = await (prisma as any).declineRecovery.findMany({
    where:   { businessId, tenantId },
    orderBy: { createdAt: 'desc' },
  });

  return records.map((r) => mapDbRecord(r, r.declineReasons as unknown as DeclineReason[]));
}

// ── Service: Get Single Decline Recovery ─────────────────────

export async function getDeclineRecovery(
  recoveryId: string,
  tenantId:   string,
): Promise<DeclineRecoveryRecord | null> {
  const prisma = getPrisma();

  const record = await prisma.declineRecovery.findFirst({
    where: { id: recoveryId, tenantId },
  });

  if (!record) return null;

  return mapDbRecord(record, record.declineReasons as unknown as DeclineReason[]);
}

// ── Service: Generate and Store Reconsideration Letter ───────

export interface GenerateLetterResult {
  letter:        ReconsiderationLetter;
  recoveryId:    string;
  updatedStatus: string;
}

export async function generateAndStoreReconsiderationLetter(
  recoveryId:   string,
  tenantId:     string,
  businessName: string,
): Promise<GenerateLetterResult> {
  const prisma = getPrisma();

  const record = await prisma.declineRecovery.findFirst({
    where: { id: recoveryId, tenantId },
  });

  if (!record) {
    throw new Error(`DeclineRecovery record ${recoveryId} not found.`);
  }

  const reasons = record.declineReasons as unknown as DeclineReason[];
  const letter  = generateReconsiderationLetter(
    record.businessId,
    businessName,
    record.issuer,
    reasons,
    record.applicationId,
  );

  const updated = await prisma.declineRecovery.update({
    where: { id: recoveryId },
    data:  {
      letterGenerated:       true,
      reconsiderationStatus: 'letter_sent',
      reconsiderationNotes:  `Letter ${letter.letterId} generated at ${letter.generatedAt.toISOString()}.`,
    },
  });

  await eventBus.publishAndPersist(tenantId, {
    eventType:     'decline.reconsideration.generated',
    aggregateType: AGGREGATE_TYPES.APPLICATION,
    aggregateId:   record.applicationId,
    payload: {
      recoveryId,
      letterId:      letter.letterId,
      businessId:    record.businessId,
      issuer:        record.issuer,
      applicationId: record.applicationId,
    },
  });

  logger.info('[DeclineRecovery] Reconsideration letter generated', {
    recoveryId,
    letterId:   letter.letterId,
    businessId: record.businessId,
    issuer:     record.issuer,
  });

  return {
    letter,
    recoveryId,
    updatedStatus: updated.reconsiderationStatus,
  };
}

// ── Service: Get Cooldown Calendar ───────────────────────────

export async function getDeclineCooldown(
  recoveryId: string,
  tenantId:   string,
): Promise<CooldownCalendar | null> {
  const prisma = getPrisma();

  const record = await prisma.declineRecovery.findFirst({
    where: { id: recoveryId, tenantId },
  });

  if (!record) return null;

  const declinedAt = record.createdAt; // proxy: decline happened at record creation
  return buildCooldownCalendar(record.issuer, declinedAt);
}

// ── Auto-trigger Hook ─────────────────────────────────────────

/**
 * Register event bus listener to auto-create a DeclineRecovery
 * whenever APPLICATION_DECLINED is published.
 *
 * Call this once at application bootstrap.
 */
export function registerDeclineAutoTrigger(): void {
  eventBus.subscribe(
    EVENT_TYPES.APPLICATION_DECLINED,
    async (event) => {
      const payload = event.payload as {
        tenantId?:       string;
        businessId?:     string;
        applicationId?:  string;
        issuer?:         string;
        declineReasons?: Array<string | { code?: string; text: string }>;
        adverseActionRaw?: string;
        declinedAt?:     string;
      };

      if (!payload.tenantId || !payload.businessId || !payload.applicationId || !payload.issuer) {
        logger.warn('[DeclineRecovery] Auto-trigger: incomplete payload, skipping', { payload });
        return;
      }

      try {
        await createDeclineRecovery({
          tenantId:        payload.tenantId,
          businessId:      payload.businessId,
          applicationId:   payload.applicationId,
          issuer:          payload.issuer,
          declineReasons:  payload.declineReasons ?? [],
          adverseActionRaw: payload.adverseActionRaw,
          declinedAt:      payload.declinedAt ? new Date(payload.declinedAt) : undefined,
        });
      } catch (err) {
        logger.error('[DeclineRecovery] Auto-trigger failed', {
          applicationId: payload.applicationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    { handlerName: 'decline-recovery-auto-trigger' },
  );

  logger.info('[DeclineRecovery] Auto-trigger registered for APPLICATION_DECLINED events');
}

// ── Private helpers ───────────────────────────────────────────

function buildCategoryBreakdown(reasons: DeclineReason[]): Record<DeclineCategory, number> {
  const breakdown: Record<DeclineCategory, number> = {
    credit:      0,
    utilization: 0,
    velocity:    0,
    fraud:       0,
    other:       0,
  };
  for (const r of reasons) {
    breakdown[r.category]++;
  }
  return breakdown;
}

function mapDbRecord(
  record: {
    id:                    string;
    tenantId:              string;
    businessId:            string;
    applicationId:         string;
    issuer:                string;
    adverseActionRaw:      string | null;
    reconsiderationStatus: string;
    reconsiderationNotes:  string | null;
    reapplyCooldownDate:   Date | null;
    letterGenerated:       boolean;
    createdAt:             Date;
    updatedAt:             Date;
  },
  reasons: DeclineReason[],
): DeclineRecoveryRecord {
  return {
    id:                    record.id,
    tenantId:              record.tenantId,
    businessId:            record.businessId,
    applicationId:         record.applicationId,
    issuer:                record.issuer,
    declineReasons:        reasons,
    adverseActionRaw:      record.adverseActionRaw,
    reconsiderationStatus: record.reconsiderationStatus,
    reconsiderationNotes:  record.reconsiderationNotes,
    reapplyCooldownDate:   record.reapplyCooldownDate,
    letterGenerated:       record.letterGenerated,
    createdAt:             record.createdAt,
    updatedAt:             record.updatedAt,
  };
}
