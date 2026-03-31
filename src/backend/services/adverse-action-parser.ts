// ============================================================
// CapitalForge — Adverse Action Notice Parser
//
// Responsibilities:
//   1. Parse adverse action notice text or JSON payloads
//   2. Extract reason codes and map to DeclineCategory
//   3. Detect account closure notices vs. denial letters
//   4. Route denials → DeclineRecovery service
//   5. Route account closures → alert events
//   6. Support both structured (JSON) and unstructured (plain text) input
// ============================================================

import { eventBus } from '../events/event-bus.js';
import { AGGREGATE_TYPES } from '@shared/constants/index.js';
import {
  categorizeDeclineReason,
  createDeclineRecovery,
  type DeclineReason,
} from './decline-recovery.service.js';
import logger from '../config/logger.js';

// ── Notice Types ──────────────────────────────────────────────

export type NoticeType = 'denial' | 'account_closure' | 'credit_limit_reduction' | 'unknown';

export interface ParsedAdverseAction {
  noticeType:      NoticeType;
  issuer:          string | null;
  applicationRef:  string | null;
  accountRef:      string | null;
  reasons:         DeclineReason[];
  rawText:         string;
  parsedAt:        Date;
  confidence:      'high' | 'medium' | 'low';
}

export interface AdverseActionRoutingResult {
  noticeType:  NoticeType;
  recoveryId?: string;
  alertId?:    string;
  routed:      boolean;
  message:     string;
}

// ── Notice-Type Detection Patterns ───────────────────────────

const CLOSURE_PATTERNS = [
  /account.{0,30}(closed|closure|terminated|cancelled)/i,
  /we.{0,20}(are|have).{0,20}clos(ing|ed).{0,20}(your|the).{0,20}account/i,
  /account.{0,30}will be closed/i,
  /card.{0,20}(cancelled|terminated|closed)/i,
];

const DENIAL_PATTERNS = [
  /we.{0,30}(are|have|were).{0,30}unable.{0,20}to approve/i,
  /your.{0,30}application.{0,30}(has been|was).{0,30}(denied|declined|not approved)/i,
  /we.{0,30}declin(ed|ing).{0,20}your.{0,20}(application|request)/i,
  /adverse action.{0,30}(notice|letter)/i,
  /credit.{0,20}(application|request).{0,30}(denied|declined|not approved)/i,
];

const LIMIT_REDUCTION_PATTERNS = [
  /credit.{0,20}limit.{0,30}(reduc|lower|decreas)/i,
  /reducing.{0,20}your.{0,20}credit.{0,20}limit/i,
];

// ── Reason Extraction Patterns ────────────────────────────────

/** Matches "Reason: <text>", "Reason Code: <code>", numbered reasons, etc. */
const REASON_LINE_PATTERNS = [
  /reason(?:\s+code)?[:\s]+(\d{1,2})[:\s\-–]*(.*)/gi,
  /^\s*(?:\d+[\.\):]|\-|•)\s+(.+)/gm,
  /adverse.{0,10}reason[s]?[:\s]+(.+)/gi,
  /principal reason[s]?[:\s]+(.+)/gi,
];

const ISSUER_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /chase|jpmorgan/i,       name: 'chase' },
  { pattern: /american express|amex/i, name: 'amex' },
  { pattern: /citi(?:bank|group|card)?/i, name: 'citi' },
  { pattern: /bank of america/i,      name: 'bank_of_america' },
  { pattern: /capital one/i,          name: 'capital_one' },
  { pattern: /us bank|u\.s\. bank/i,  name: 'us_bank' },
  { pattern: /wells fargo/i,          name: 'wells_fargo' },
  { pattern: /barclays/i,             name: 'barclays' },
  { pattern: /synchrony/i,            name: 'synchrony' },
  { pattern: /discover/i,             name: 'discover' },
];

const APP_REF_PATTERN   = /(?:application|reference|ref|app).{0,10}(?:#|number|no\.?|id)[:\s]+([A-Z0-9\-]{4,30})/i;
const ACCOUNT_REF_PATTERN = /(?:account|acct).{0,10}(?:number|no\.?|ending in|last 4)[:\s]+([X*\d\-]{4,20})/i;

// ── JSON Schema Detection ─────────────────────────────────────

interface StructuredNotice {
  type?:         string;
  noticeType?:   string;
  issuer?:       string;
  reasons?:      Array<string | { code?: string; text?: string; reason?: string }>;
  reasonCodes?:  string[];
  applicationId?: string;
  accountNumber?: string;
  raw?:          string;
}

// ── Core: Parse Adverse Action Notice ────────────────────────

/**
 * Parse an adverse action notice from either plain text or a JSON payload.
 * Extracts reason codes, maps them to categories, and detects the notice type.
 */
export function parseAdverseActionNotice(
  input: string | Record<string, unknown>,
): ParsedAdverseAction {
  const parsedAt = new Date();

  // ---- Handle structured JSON input --------------------------
  if (typeof input === 'object') {
    return parseStructuredNotice(input as StructuredNotice, parsedAt);
  }

  // ---- Handle plain text input --------------------------------
  return parsePlainTextNotice(input, parsedAt);
}

function parseStructuredNotice(
  notice: StructuredNotice,
  parsedAt: Date,
): ParsedAdverseAction {
  // Detect type from structured field
  const typeField  = (notice.type ?? notice.noticeType ?? '').toLowerCase();
  let noticeType:  NoticeType = 'unknown';

  if (typeField.includes('denial') || typeField.includes('declined') || typeField.includes('denied')) {
    noticeType = 'denial';
  } else if (typeField.includes('closure') || typeField.includes('closed')) {
    noticeType = 'account_closure';
  } else if (typeField.includes('reduction') || typeField.includes('limit')) {
    noticeType = 'credit_limit_reduction';
  }

  // Extract reasons from structured payload
  const rawReasons: Array<{ code?: string; rawText: string }> = [];

  if (Array.isArray(notice.reasons)) {
    for (const r of notice.reasons) {
      if (typeof r === 'string') {
        rawReasons.push({ rawText: r });
      } else if (typeof r === 'object' && r !== null) {
        rawReasons.push({
          code:    r.code,
          rawText: r.text ?? r.reason ?? JSON.stringify(r),
        });
      }
    }
  }

  if (Array.isArray(notice.reasonCodes)) {
    for (const code of notice.reasonCodes) {
      rawReasons.push({ code: String(code), rawText: `Code ${code}` });
    }
  }

  const reasons = rawReasons.map((r) => categorizeDeclineReason(r.rawText, r.code));

  // If noticeType is still unknown, try to infer from reasons
  if (noticeType === 'unknown' && reasons.length > 0) {
    noticeType = 'denial';
  }

  const rawText = notice.raw ?? JSON.stringify(notice);

  return {
    noticeType,
    issuer:         notice.issuer ?? null,
    applicationRef: notice.applicationId ?? null,
    accountRef:     notice.accountNumber ?? null,
    reasons,
    rawText,
    parsedAt,
    confidence:     reasons.length > 0 ? 'high' : 'medium',
  };
}

function parsePlainTextNotice(
  text: string,
  parsedAt: Date,
): ParsedAdverseAction {
  // ---- Detect notice type ------------------------------------
  let noticeType: NoticeType = 'unknown';

  if (CLOSURE_PATTERNS.some((p) => p.test(text))) {
    noticeType = 'account_closure';
  } else if (DENIAL_PATTERNS.some((p) => p.test(text))) {
    noticeType = 'denial';
  } else if (LIMIT_REDUCTION_PATTERNS.some((p) => p.test(text))) {
    noticeType = 'credit_limit_reduction';
  }

  // ---- Extract issuer ----------------------------------------
  let issuer: string | null = null;
  for (const { pattern, name } of ISSUER_PATTERNS) {
    if (pattern.test(text)) {
      issuer = name;
      break;
    }
  }

  // ---- Extract application reference -------------------------
  const appRefMatch   = APP_REF_PATTERN.exec(text);
  const applicationRef = appRefMatch?.[1] ?? null;

  // ---- Extract account reference ------------------------------
  const accountRefMatch = ACCOUNT_REF_PATTERN.exec(text);
  const accountRef      = accountRefMatch?.[1] ?? null;

  // ---- Extract reason codes / reason lines -------------------
  const extractedReasons: Array<{ code?: string; rawText: string }> = [];

  for (const pattern of REASON_LINE_PATTERNS) {
    let match: RegExpExecArray | null;
    const clonedPattern = new RegExp(pattern.source, pattern.flags);
    while ((match = clonedPattern.exec(text)) !== null) {
      if (match[2] !== undefined) {
        // Pattern captured both code and text (e.g. "Reason Code: 08 — Too many inquiries")
        extractedReasons.push({ code: match[1].trim(), rawText: match[2].trim() });
      } else if (match[1] !== undefined) {
        const candidate = match[1].trim();
        // Skip very short matches (< 5 chars) — likely noise
        if (candidate.length >= 5) {
          extractedReasons.push({ rawText: candidate });
        }
      }
    }
  }

  const reasons = extractedReasons.map((r) => categorizeDeclineReason(r.rawText, r.code));

  // Deduplicate by rawText
  const seen   = new Set<string>();
  const unique = reasons.filter((r) => {
    if (seen.has(r.rawText)) return false;
    seen.add(r.rawText);
    return true;
  });

  const confidence: ParsedAdverseAction['confidence'] =
    noticeType !== 'unknown' && unique.length > 0 ? 'high'
    : noticeType !== 'unknown' || unique.length > 0 ? 'medium'
    : 'low';

  return {
    noticeType,
    issuer,
    applicationRef,
    accountRef,
    reasons:    unique,
    rawText:    text,
    parsedAt,
    confidence,
  };
}

// ── Routing: Denial → DeclineRecovery ────────────────────────

export interface RouteAdverseActionInput {
  parsedNotice:  ParsedAdverseAction;
  tenantId:      string;
  businessId:    string;
  applicationId: string;
  issuer?:       string;
}

/**
 * Route a parsed adverse action to the appropriate handler:
 *   - Denial       → DeclineRecovery service
 *   - Closure      → Risk alert event
 *   - Limit Reduction → Alert event
 */
export async function routeAdverseAction(
  input: RouteAdverseActionInput,
): Promise<AdverseActionRoutingResult> {
  const { parsedNotice, tenantId, businessId, applicationId } = input;
  const issuer = input.issuer ?? parsedNotice.issuer ?? 'unknown';

  switch (parsedNotice.noticeType) {
    case 'denial': {
      // Route to Decline Recovery
      try {
        const recovery = await createDeclineRecovery({
          tenantId,
          businessId,
          applicationId,
          issuer,
          declineReasons:  parsedNotice.reasons.map((r) => ({ code: r.code, text: r.rawText })),
          adverseActionRaw: parsedNotice.rawText,
        });

        logger.info('[AdverseActionParser] Denial routed to DeclineRecovery', {
          recoveryId:    recovery.id,
          applicationId,
          businessId,
          issuer,
        });

        return {
          noticeType: 'denial',
          recoveryId: recovery.id,
          routed:     true,
          message:    `Denial routed to DeclineRecovery (id: ${recovery.id}).`,
        };
      } catch (err) {
        logger.error('[AdverseActionParser] Failed to route denial to DeclineRecovery', {
          applicationId,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          noticeType: 'denial',
          routed:     false,
          message:    `Routing failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'account_closure': {
      const alertId = await publishClosureAlert(tenantId, businessId, applicationId, issuer, parsedNotice);

      logger.info('[AdverseActionParser] Account closure routed to alerts', {
        alertId,
        businessId,
        issuer,
        accountRef: parsedNotice.accountRef,
      });

      return {
        noticeType: 'account_closure',
        alertId,
        routed:     true,
        message:    `Account closure alert published (alertId: ${alertId}).`,
      };
    }

    case 'credit_limit_reduction': {
      const alertId = await publishLimitReductionAlert(tenantId, businessId, applicationId, issuer, parsedNotice);

      logger.info('[AdverseActionParser] Credit limit reduction routed to alerts', {
        alertId,
        businessId,
        issuer,
        accountRef: parsedNotice.accountRef,
      });

      return {
        noticeType: 'credit_limit_reduction',
        alertId,
        routed:     true,
        message:    `Credit limit reduction alert published (alertId: ${alertId}).`,
      };
    }

    default: {
      logger.warn('[AdverseActionParser] Unknown notice type — could not route', {
        noticeType:    parsedNotice.noticeType,
        applicationId,
        businessId,
        confidence:    parsedNotice.confidence,
      });

      return {
        noticeType: 'unknown',
        routed:     false,
        message:    'Notice type could not be determined. Manual review required.',
      };
    }
  }
}

/**
 * Convenience: parse and immediately route an adverse action notice.
 */
export async function parseAndRouteAdverseAction(
  rawInput:      string | Record<string, unknown>,
  tenantId:      string,
  businessId:    string,
  applicationId: string,
  issuerOverride?: string,
): Promise<{ parsed: ParsedAdverseAction; routing: AdverseActionRoutingResult }> {
  const parsed  = parseAdverseActionNotice(rawInput);
  const routing = await routeAdverseAction({
    parsedNotice:  parsed,
    tenantId,
    businessId,
    applicationId,
    issuer: issuerOverride,
  });

  return { parsed, routing };
}

// ── Private: Alert Publishers ─────────────────────────────────

async function publishClosureAlert(
  tenantId:      string,
  businessId:    string,
  applicationId: string,
  issuer:        string,
  notice:        ParsedAdverseAction,
): Promise<string> {
  const result = await eventBus.publishAndPersist(tenantId, {
    eventType:     'risk.alert.raised',
    aggregateType: AGGREGATE_TYPES.APPLICATION,
    aggregateId:   applicationId,
    payload: {
      alertType:     'account_closure',
      businessId,
      applicationId,
      issuer,
      accountRef:    notice.accountRef,
      reasons:       notice.reasons,
      rawText:       notice.rawText,
      parsedAt:      notice.parsedAt.toISOString(),
    },
    metadata: {
      source:     'adverse_action_parser',
      confidence: notice.confidence,
    },
  });

  return result?.id ?? 'alert-unknown';
}

async function publishLimitReductionAlert(
  tenantId:      string,
  businessId:    string,
  applicationId: string,
  issuer:        string,
  notice:        ParsedAdverseAction,
): Promise<string> {
  const result = await eventBus.publishAndPersist(tenantId, {
    eventType:     'risk.alert.raised',
    aggregateType: AGGREGATE_TYPES.APPLICATION,
    aggregateId:   applicationId,
    payload: {
      alertType:     'credit_limit_reduction',
      businessId,
      applicationId,
      issuer,
      accountRef:    notice.accountRef,
      reasons:       notice.reasons,
      rawText:       notice.rawText,
      parsedAt:      notice.parsedAt.toISOString(),
    },
    metadata: {
      source:     'adverse_action_parser',
      confidence: notice.confidence,
    },
  });

  return result?.id ?? 'alert-unknown';
}
