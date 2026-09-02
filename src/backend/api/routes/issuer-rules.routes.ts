// ============================================================
// CapitalForge — Issuer Rules Engine Routes
//
// Endpoints:
//   GET  /api/issuers                         — list all active issuers with rules
//   GET  /api/issuers/:id                     — single issuer with rules
//   GET  /api/issuers/:id/eligibility         — check eligibility for a business
//   GET  /api/credit-unions                   — list credit unions with products
//   GET  /api/credit-unions/:id               — single credit union with products
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import {
  IssuerRulesEngine,
  IssuerNotFoundError,
  EligibilityBusinessNotFoundError,
  EligibilityContext,
} from '../../services/issuer-rules-engine.js';
import { createHash } from 'node:crypto';
import { logAiDecision } from '../../services/decision-explainability.service.js';
import logger from '../../config/logger.js';
import { isCreditUnionIssuerName, parseIssuer } from '../../../shared/constants/issuers.js';
import { tallyHeldCardsForFiveTwentyFour } from '../../services/held-cards.service.js';
import {
  CREDIT_UNION_MEMBERSHIP,
  type MembershipCost,
} from '../../../shared/constants/issuers.js';

/** Membership cost for a row, preferring the registry over the column. */
function membershipCostFromSlug(slug: string, columnFee: number | null): MembershipCost {
  const parsed = parseIssuer(slug);
  if (parsed?.kind === 'credit_union') return CREDIT_UNION_MEMBERSHIP[parsed.id].cost;
  if (columnFee === null) {
    return { kind: 'unconfirmed', note: 'No membership cost recorded for this credit union.' };
  }
  return columnFee > 0
    ? { kind: 'confirmed', amount: columnFee, source: 'credit_unions.joinFee' }
    : { kind: 'none' };
}


export const issuerRulesRouter = Router();

// Lazy singleton — avoids instantiating Prisma in tests that don't need it

// ── Helpers ──────────────────────────────────────────────────

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

function notFound(res: Response, message: string) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message },
  });
}

function serverError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('[issuer-rules] Server error', { error: message });
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
  });
}

// ============================================================
// GET /api/issuers — List all active issuers with rules
// ============================================================

issuerRulesRouter.get('/issuers', async (_req: Request, res: Response) => {
  try {
    logger.info('[issuer-rules] GET /issuers');

    const issuers = await sharedPrisma.issuer.findMany({
      where: { isActive: true },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: { severity: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return ok(res, {
      issuers,
      total: issuers.length,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// GET /api/issuers/:id — Single issuer with rules
// ============================================================

issuerRulesRouter.get('/issuers/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id!;
    logger.info('[issuer-rules] GET /issuers/:id', { id });

    const issuer = await sharedPrisma.issuer.findUnique({
      where: { id },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: { severity: 'asc' },
        },
      },
    });

    if (!issuer) {
      return notFound(res, `Issuer not found: ${id}`);
    }

    return ok(res, issuer);
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// GET /api/issuers/:id/eligibility?businessId=X
// Check eligibility for a business against an issuer's rules
// ============================================================

issuerRulesRouter.get(
  '/issuers/:id/eligibility',
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id!;
      const { businessId } = req.query;
      logger.info('[issuer-rules] GET /issuers/:id/eligibility', { id, businessId });

      const db = sharedPrisma;
      const engine = new IssuerRulesEngine(db);

      // Build context from business data if businessId is provided
      let context: EligibilityContext;

      if (businessId && typeof businessId === 'string') {
        context = await buildContextFromBusiness(db, businessId, id, req.tenant!.tenantId);
      } else {
        // Return a default context check (useful for testing / UI previews)
        context = getDefaultContext();
      }

      const result = await engine.checkIssuerEligibility(id, context);

      // ── Record that the question was asked ──────────────────
      //
      // The context is rebuilt from live data on every call — held cards, open
      // applications, inquiries, the issuer's current rules — so re-running
      // this URL next week produces a different answer with no trace of the
      // earlier one. This is the answer a placement strategy is built on.
      //
      // What is lost is not mainly the verdict. It is `unevaluatedRules` and
      // `caveats`, and those are the volatile part: a rule blocking today
      // because nobody recorded its threshold evaluates normally once somebody
      // does, and a held card attested next month silently improves the past.
      // So when a client is declined, nobody can show what the system said or
      // on what basis.
      //
      // `AiDecisionLog` has held exactly this shape all along, and its
      // moduleSource union names eight engines, none of which wrote a row —
      // the only writer was an admin endpoint a human posts to by hand. See
      // docs/gaps.md §7b.
      //
      // Recorded only when a business was named. A default-context preview is
      // a decision about nobody, and logging it would fill the record a
      // compliance officer reads with UI probes.
      let decisionLogId: string | null = null;
      let decisionRecorded: string | null = null;
      if (businessId && typeof businessId === 'string') {
        try {
          decisionLogId = await logAiDecision({
            tenantId: req.tenant!.tenantId,
            moduleSource: 'issuer_eligibility',
            decisionType: 'classification',
            // `businessId` is the key `getBusinessDecisionExplanations`
            // filters on — a JSONB path query against `output`. Omit it and
            // the row is written and never found again.
            output: { businessId, ...result } as unknown as Record<string, unknown>,
            // The context is hashed, not stored: two answers can be compared
            // without keeping a second copy of a client's credit profile.
            inputHash: createHash('sha256').update(JSON.stringify(context)).digest('hex'),
            // No confidence and no model version. This is rule evaluation, and
            // a confidence figure invented for it would be the exact thing
            // this log exists to catch.
          });
        } catch (logErr) {
          // Said out loud rather than swallowed. A decision the system failed
          // to record is a fact about this answer, and the caller is the only
          // one in a position to ask for it again.
          logger.error('[issuer-rules] eligibility decision was not recorded', {
            id,
            businessId,
            error: logErr instanceof Error ? logErr.message : String(logErr),
          });
          decisionRecorded =
            'This answer was not written to the decision log. It cannot be produced later '
            + 'as a record of what was said, or on what basis.';
        }
      }

      return ok(res, { ...result, decisionLogId, decisionNotRecorded: decisionRecorded });
    } catch (err) {
      // Typed, not string-matched. This was
      // `err.message.includes('not found')`, so any future error whose message
      // happened to contain those two words became a 404 — a genuine failure
      // reported as "no such issuer" to somebody deciding where to place a
      // client. Same hazard removed from the dossier route.
      if (
        err instanceof IssuerNotFoundError
        || err instanceof EligibilityBusinessNotFoundError
      ) {
        return notFound(res, err.message);
      }
      return serverError(res, err);
    }
  },
);

// ============================================================
// GET /api/credit-unions — List credit unions with products
// ============================================================

issuerRulesRouter.get('/credit-unions', async (_req: Request, res: Response) => {
  try {
    logger.info('[issuer-rules] GET /credit-unions');

    const creditUnions = await sharedPrisma.creditUnion.findMany({
      where: { isActive: true },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { productType: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Enrich each CU with membership summary details
    const enriched = creditUnions.map((cu) => ({
      ...cu,
      membership: {
        isOpen: cu.openMembership,
        criteria: cu.membershipCriteria ?? 'Contact credit union for details.',
        // From the registry, not the column: credit_unions.joinFee still
        // holds $50 for First Tech, a figure nothing here can source. Null
        // means "not known", and callers must not read it as "no fee".
        membershipCost: membershipCostFromSlug(cu.slug, cu.joinFee),
        joinUrl: `https://${cu.slug}.example.com/join`, // placeholder
      },
      productCount: cu.products.length,
    }));

    return ok(res, {
      creditUnions: enriched,
      total: enriched.length,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// GET /api/credit-unions/:id — Single credit union with products
// ============================================================

issuerRulesRouter.get('/credit-unions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id!;
    logger.info('[issuer-rules] GET /credit-unions/:id', { id });

    const creditUnion = await sharedPrisma.creditUnion.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { productType: 'asc' },
        },
      },
    });

    if (!creditUnion) {
      return notFound(res, `Credit union not found: ${id}`);
    }

    return ok(res, creditUnion);
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// Context Builders
// ============================================================

/**
 * Build an EligibilityContext from a business's stored data.
 * Pulls credit profiles, card applications, and business metadata.
 */
async function buildContextFromBusiness(
  db: PrismaClient,
  businessId: string,
  issuerId: string,
  tenantId: string,
): Promise<EligibilityContext> {
  // Scoped. This was `findUnique({ where: { id: businessId } })` — no tenant
  // filter at all, so any authenticated caller could pass any business id and
  // read back its credit score, business age and revenue as `currentValue` on
  // the rule violations.
  //
  // The mount-table guard does not reach here: it covers `:id` and
  // `:clientId` in a path, and this business id arrives as a query parameter
  // on `/issuers/:id/eligibility`. `npm run check:route-tenancy` cannot see it
  // either, for the same reason — its own comment says a business id arriving
  // as a query parameter is what it does not cover.
  const business = await db.business.findFirst({
    where: { id: businessId, tenantId },
    include: {
      creditProfiles: {
        orderBy: { pulledAt: 'desc' },
        take: 1,
      },
      cardApplications: true,
      heldCards: { select: { issuer: true, openedAt: true } },
    },
  });

  if (!business) {
    // Same answer for a business that does not exist and one belonging to
    // another tenant, so the response cannot be used to enumerate ids.
    throw new EligibilityBusinessNotFoundError(businessId);
  }

  // Get the issuer name for matching card applications
  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  const issuerName = issuer?.name ?? '';

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const twentyFourMonthsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);

  const latestCredit = business.creditProfiles[0] ?? null;

  // Count cards opened in the past 24 months, for Chase 5/24.
  //
  // Across all *bank* issuers — 5/24 counts cards from everywhere, which is why
  // this deliberately does not filter to Chase. It previously did not filter at
  // all, so a credit union application counted towards the limit. That is the
  // inverse of the rule: credit union applications do not drive 5/24, and
  // counting them tells a client who took the recommended credit union cards
  // that they have exhausted their Chase eligibility when they have not.
  // Following the advice would have been penalised by the advice.
  const cardsInWindow = business.cardApplications.filter(
    (app) =>
      app.status === 'approved' &&
      app.decidedAt &&
      app.decidedAt > twentyFourMonthsAgo,
  );
  const creditUnionCardsInWindow = cardsInWindow.filter((app) =>
    isCreditUnionIssuerName(app.issuer),
  );
  const applicationsIn524 = cardsInWindow.length - creditUnionCardsInWindow.length;

  // Cards the client arrived with, which applications cannot see.
  //
  // `CardApplication` records what this system submitted. A client who opened
  // four bank cards before onboarding counted as zero, so the answer could only
  // ever be too low — and too low reads as headroom.
  const heldTally = tallyHeldCardsForFiveTwentyFour(
    business.heldCards ?? [],
    twentyFourMonthsAgo,
    now,
  );

  const newCardsLast24Months = applicationsIn524 + heldTally.counted;

  // Count applications to this specific issuer
  const issuerApps = business.cardApplications.filter(
    // Both sides through the boundary. This compared a CardApplication's
    // display name against the Issuer table's display name, which agree only
    // when both were typed the same way — "US Bank" against "U.S. Bank" did
    // not match, and the result was an empty history that reads as a client
    // who has never applied to this issuer.
    (app) => {
      const stored = parseIssuer(app.issuer);
      const wanted = parseIssuer(issuerName);
      return stored && wanted
        ? stored.id === wanted.id
        : app.issuer.toLowerCase() === issuerName.toLowerCase();
    },
  );
  const issuerAppsInPeriod = issuerApps.filter(
    (app) => app.submittedAt && app.submittedAt > sixMonthsAgo,
  ).length;

  // Most recent app to this issuer
  const lastIssuerApp = issuerApps
    .filter((app) => app.submittedAt)
    .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0))[0];

  // Most recent decline from this issuer
  const lastDecline = issuerApps
    .filter((app) => app.status === 'declined' && app.decidedAt)
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))[0];

  // Count inquiries (approximated from total applications)
  const inquiriesLast6Months = business.cardApplications.filter(
    (app) => app.submittedAt && app.submittedAt > sixMonthsAgo,
  ).length;
  const inquiriesLast12Months = business.cardApplications.filter(
    (app) => app.submittedAt && app.submittedAt > twelveMonthsAgo,
  ).length;

  // Open cards with this issuer
  const openCardsWithIssuer = issuerApps.filter(
    (app) => app.status === 'approved',
  ).length;

  // Total recent apps
  const totalAppsInPeriod = business.cardApplications.filter(
    (app) => app.submittedAt && app.submittedAt > sixMonthsAgo,
  ).length;

  // Business age in months
  let businessAgeMonths: number | null = null;
  if (business.dateOfFormation) {
    const formation = new Date(business.dateOfFormation);
    businessAgeMonths =
      (now.getFullYear() - formation.getFullYear()) * 12 +
      (now.getMonth() - formation.getMonth());
  }

  // Previously held products with this issuer
  const previousProducts = issuerApps
    .filter((app) => app.status === 'approved')
    .map((app) => app.cardProduct);

  return {
    newCardsLast24Months,
    // Reported rather than merely subtracted: an exemption that only shows up
    // as a smaller number is indistinguishable from cards being missed.
    creditUnionCardsExcludedFrom524:
      creditUnionCardsInWindow.length + heldTally.creditUnionExcluded,
    // Where the number came from, so the caveat can describe it rather than
    // guess. `unplaceable` is why an answer may be "at most N".
    fiveTwentyFourFromApplications: applicationsIn524,
    fiveTwentyFourFromHeldCards: heldTally.counted,
    heldCardsOfUnknownAge: heldTally.unplaceable,
    issuerAppsInPeriod,
    lastApplicationDate: lastIssuerApp?.submittedAt?.toISOString() ?? null,
    lastDeclineDate: lastDecline?.decidedAt?.toISOString() ?? null,
    creditScore: latestCredit?.score ?? null,
    inquiriesLast6Months,
    inquiriesLast12Months,
    utilization: latestCredit?.utilization ? Number(latestCredit.utilization) : null,
    businessAgeMonths,
    annualRevenue: business.annualRevenue ? Number(business.annualRevenue) : null,
    openCardsWithIssuer,
    hasExistingRelationship: openCardsWithIssuer > 0,
    totalAppsInPeriod,
    previousProducts,
  };
}

/**
 * Default context for testing / when no business ID is provided.
 */
function getDefaultContext(): EligibilityContext {
  return {
    newCardsLast24Months: 0,
    issuerAppsInPeriod: 0,
    lastApplicationDate: null,
    lastDeclineDate: null,
    creditScore: 750,
    inquiriesLast6Months: 0,
    inquiriesLast12Months: 0,
    utilization: 0.15,
    businessAgeMonths: 24,
    annualRevenue: 500000,
    openCardsWithIssuer: 0,
    hasExistingRelationship: false,
    totalAppsInPeriod: 0,
    previousProducts: [],
  };
}
