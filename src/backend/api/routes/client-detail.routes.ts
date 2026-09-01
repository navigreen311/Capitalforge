// ============================================================
// CapitalForge Client Detail Routes
//
// Mounted under: /api/clients/:clientId
//
// GET    /                        — client profile
// GET    /owners                  — business owners
// GET    /acknowledgments         — product acknowledgments
// GET    /ach-authorization       — ACH authorization status
// GET    /credit/business         — business credit scores
// GET    /credit/history          — 12-month score history      [STUB]
// GET    /credit/recommendations  — credit optimization tips    [STUB]
// GET    /repayment               — repayment schedule          [STUB]
// GET    /timeline                — client event timeline
// GET    /compliance              — compliance checks
// GET    /documents               — documents for this business
// POST   /compliance/run          — trigger compliance check    [STUB]
// POST   /consent/request         — request re-consent          [STUB]
// PATCH  /                        — update business fields
//
// Endpoints marked [STUB] have no implementation behind them and return
// sample data flagged via `meta.stub` — see ./_stub-response.ts.
// ============================================================

import { Router, type Response, type NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { Prisma } from '@prisma/client';
import { prisma as sharedPrisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { ComplianceService } from '../../services/compliance.service.js';
import { emailService } from '../../services/email.service.js';
import { isValidTimezone } from '../../services/timezone.js';

/**
 * Business columns a client-detail PATCH may write.
 *
 * tenantId is absent by design: it decides which tenant owns the record.
 */
const UPDATABLE_BUSINESS_FIELDS = new Set([
  'legalName',
  'dba',
  'ein',
  'entityType',
  'stateOfFormation',
  'dateOfFormation',
  'industry',
  'naicsCode',
  'mcc',
  'annualRevenue',
  'monthlyRevenue',
  'phoneNumber',
  'timezone',
  'status',
  'advisorId',
  'fundingReadinessScore',
  // The edit-profile form has always sent these. `website` and `employees`
  // were rejected outright as un-updatable; `naicsCode` was on this list
  // before it was a column, so it passed the allowlist and then failed at
  // the database — a 500 where the other two at least said no.
  'employees',
  'website',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'zip',
  'businessEmail',
]);
import type { ComplianceCheckType } from '../../../shared/types/index.js';

const complianceService = new ComplianceService();

const VALID_CHECK_TYPES = new Set<ComplianceCheckType>([
  'udap',
  'state_law',
  'vendor',
  'kyb',
  'kyc',
  'aml',
]);

// ── Dependency setup ──────────────────────────────────────────

const prisma = sharedPrisma;

// ── Helpers ───────────────────────────────────────────────────

/**
 * The tenant is taken from the verified access token only.
 *
 * This previously read `tenant.id` — a field TenantContext does not have (it
 * is `tenantId`) — and fell back to the literal string 'unknown'. Every query
 * in this module therefore filtered on tenantId = 'unknown', matched nothing,
 * and fell through to the sample data below. The mock path was not a
 * fallback for rare failures; it was the only path this module ever took.
 */
function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Tenant context is missing — authentication middleware did not run.');
  }
  return tenantId;
}

function ok(res: Response, data: unknown, meta?: Record<string, unknown>): void {
  const body: ApiResponse = { success: true, data, ...(meta ? { meta } : {}) };
  res.status(200).json(body);
}

function err(res: Response, status: number, code: string, message: string): void {
  const body: ApiResponse = { success: false, error: { code, message } };
  res.status(status).json(body);
}

/** Prisma raises P2025 when an update/delete targets a row that is not there. */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2025';
}

/**
 * Compliance score derived from the checks actually on record.
 *
 * ComplianceCheck carries `riskScore` (higher = worse), so the score is its
 * inverse, averaged. Returns null when no check has a score: "we cannot tell"
 * is a real answer, and is safer here than the hardcoded 78 this endpoint
 * used to report regardless of input, or a 0 that would read as total failure.
 */
function scoreFromChecks(checks: { riskScore: number | null }[]): number | null {
  const scored = checks
    .map((c) => c.riskScore)
    .filter((n): n is number => typeof n === 'number');
  if (scored.length === 0) return null;
  const averageRisk = scored.reduce((sum, n) => sum + n, 0) / scored.length;
  return Math.max(0, Math.min(100, Math.round(100 - averageRisk)));
}



// ── Credit recommendations ────────────────────────────────────
//
// Deterministic rules over the figures a bureau pull actually carries.
// Each recommendation names the observation that produced it, so an advisor
// can see why it was raised rather than being handed an unexplained list.

interface CreditRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  basis: string;
}

function buildCreditRecommendations(profile: {
  id: string;
  utilization: Prisma.Decimal | null;
  inquiryCount: number | null;
  derogatoryCount: number | null;
  score: number | null;
  scoreType: string | null;
}): CreditRecommendation[] {
  const out: CreditRecommendation[] = [];
  const utilization = profile.utilization === null ? null : Number(profile.utilization);

  if (utilization !== null && utilization > 0.3) {
    out.push({
      id: `${profile.id}:utilization`,
      priority: utilization > 0.5 ? 'high' : 'medium',
      title: 'Reduce revolving utilisation below 30%',
      basis: `Utilisation is ${Math.round(utilization * 100)}% on the latest pull.`,
    });
  }

  if ((profile.derogatoryCount ?? 0) > 0) {
    out.push({
      id: `${profile.id}:derogatory`,
      priority: 'high',
      title: 'Review and dispute derogatory marks',
      basis: `${profile.derogatoryCount} derogatory mark(s) on the latest pull.`,
    });
  }

  if ((profile.inquiryCount ?? 0) >= 6) {
    out.push({
      id: `${profile.id}:inquiries`,
      priority: 'medium',
      title: 'Pause new applications to let inquiries age',
      basis: `${profile.inquiryCount} inquiries on the latest pull.`,
    });
  }

  // No point-impact estimates are attached. Predicting a score change requires
  // a model this system does not have, and the previous sample data asserted
  // ranges like "25-40 points" with nothing behind them.
  return out;
}

// ── Router ────────────────────────────────────────────────────

export const clientDetailRouter = Router({ mergeParams: true });

// ── Ownership is checked at the mount, not here ─────────────────────────────
//
// `api/routes/index.ts` installs requireOwnedBusiness('clientId') on
// /clients/:clientId before this router, so every handler below is reached only
// for a client belonging to the caller's tenant.
//
// It was briefly duplicated inside this router. One mechanism run twice is a
// second query, not a second layer — and the copy that is easy to forget is the
// one further from the mount table that decides what `:clientId` means.
//
// Handlers here still filter on tenantId where they already did. That is not
// redundancy either: a `where` naming both columns is the thing an index serves,
// and it keeps each query true on its own terms.

// GET / — client profile
clientDetailRouter.get('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client profile', { clientId, tenantId });
    const business = await prisma.business.findFirst({ where: { id: clientId, tenantId } });
    if (!business) {
      err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
      return;
    }
    ok(res, business);
  } catch (error) {
    logger.error('Prisma query failed for client profile', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_PROFILE_FAILED', 'Unable to load the client profile.');
  }
});

// GET /owners
clientDetailRouter.get('/owners', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client owners', { clientId, tenantId });
    const owners = await prisma.businessOwner.findMany({ where: { businessId: clientId } });
    // No owners on file is a real answer, and the UI needs to show it as such.
    ok(res, owners, { total: owners.length });
  } catch (error) {
    logger.error('Prisma query failed for owners', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_OWNERS_FAILED', 'Unable to load business owners.');
  }
});

// GET /acknowledgments
clientDetailRouter.get('/acknowledgments', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client acknowledgments', { clientId, tenantId });
    const acks = await prisma.productAcknowledgment.findMany({ where: { businessId: clientId } });
    ok(res, acks, { total: acks.length });
  } catch (error) {
    logger.error('Prisma query failed for acknowledgments', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_ACKNOWLEDGMENTS_FAILED', 'Unable to load acknowledgments.');
  }
});

// GET /ach-authorization
clientDetailRouter.get('/ach-authorization', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET ACH authorization', { clientId, tenantId });
    const ach = await prisma.achAuthorization.findFirst({ where: { businessId: clientId } });
    if (!ach) {
      // Reporting a fabricated "active" authorization for a client who never
      // signed one is a compliance problem, not a cosmetic one.
      err(res, 404, 'ACH_AUTHORIZATION_NOT_FOUND', 'No ACH authorization on file for this client.');
      return;
    }
    ok(res, ach);
  } catch (error) {
    logger.error('Prisma query failed for ACH authorization', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_ACH_FAILED', 'Unable to load the ACH authorization.');
  }
});

// GET /credit/business
clientDetailRouter.get('/credit/business', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET business credit', { clientId, tenantId });
    const profiles = await prisma.creditProfile.findMany({
      where: { businessId: clientId, profileType: 'business' },
    });
    ok(res, { scores: profiles }, { total: profiles.length });
  } catch (error) {
    logger.error('Prisma query failed for business credit', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_CREDIT_FAILED', 'Unable to load business credit.');
  }
});

// GET /credit/personal — personal bureau scores for the owners
clientDetailRouter.get('/credit/personal', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    const profiles = await prisma.creditProfile.findMany({
      where: { businessId: clientId, profileType: 'personal' },
      orderBy: { pulledAt: 'desc' },
    });

    // Latest pull per bureau. Personal and business scores run on different
    // scales, so they are served separately rather than merged into one list.
    const latestByBureau = new Map<string, (typeof profiles)[number]>();
    for (const p of profiles) {
      if (!latestByBureau.has(p.bureau)) latestByBureau.set(p.bureau, p);
    }

    ok(res, { scores: [...latestByBureau.values()] }, { total: latestByBureau.size });
  } catch (error) {
    logger.error('Prisma query failed for personal credit', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_PERSONAL_CREDIT_FAILED', 'Unable to load personal credit.');
  }
});

// GET /credit/history — score movement across the pulls on record
clientDetailRouter.get('/credit/history', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    // CreditProfile rows are individual bureau pulls stamped with pulledAt, so
    // history is the pulls themselves. No separate snapshot model is needed —
    // which is what this endpoint previously claimed while serving a
    // synthesised twelve-month curve identical for every client.
    // Personal and business scores run on different scales — FICO 300-850,
    // PAYDEX 0-100 — so charting them on one axis is meaningless. The caller
    // asks for the set it is plotting.
    //
    // Required, not defaulted. Omitting it used to return both scales in one
    // series — PAYDEX 80 sitting next to FICO 762 under the same `month` — and
    // a caller plotting `months` on one axis got a chart that looked like a
    // 682-point collapse. Defaulting to one type would have hidden the same
    // mistake behind a plausible answer; a caller that has not said which
    // scale it wants is a caller that cannot read the response correctly.
    const profileType = typeof req.query['profileType'] === 'string' ? req.query['profileType'] : null;

    if (profileType === null) {
      err(
        res,
        400,
        'PROFILE_TYPE_REQUIRED',
        'profileType is required and must be "personal" or "business". '
          + 'Personal (FICO 300-850) and business (PAYDEX 0-100) scores are not comparable, '
          + 'so they are never returned in one series.',
      );
      return;
    }

    if (profileType !== 'personal' && profileType !== 'business') {
      err(res, 400, 'INVALID_PROFILE_TYPE', 'profileType must be "personal" or "business".');
      return;
    }

    const profiles = await prisma.creditProfile.findMany({
      where: { businessId: clientId, profileType },
      orderBy: { pulledAt: 'asc' },
    });

    // One point per bureau per month, so a month with two pulls from the same
    // bureau reports the later one rather than double-counting.
    const byMonth = new Map<string, Record<string, number | null>>();
    for (const p of profiles) {
      const month = p.pulledAt.toISOString().slice(0, 7);
      const entry = byMonth.get(month) ?? {};
      entry[p.bureau] = p.score;
      byMonth.set(month, entry);
    }

    const months = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, scores]) => ({ month, ...scores }));

    const bureaus = [...new Set(profiles.map((p) => p.bureau))];
    const latest = profiles.length > 0 ? profiles[profiles.length - 1] : null;
    const first = profiles.length > 0 ? profiles[0] : null;

    ok(res, {
      months,
      bureaus,
      pullCount: profiles.length,
      // Movement is only meaningful across two pulls from the same bureau.
      changeSinceFirstPull:
        latest && first && latest.bureau === first.bureau && latest.score !== null && first.score !== null
          ? latest.score - first.score
          : null,
      latestPullAt: latest?.pulledAt.toISOString() ?? null,
    }, { total: months.length });
  } catch (error) {
    logger.error('Prisma query failed for credit history', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_CREDIT_HISTORY_FAILED', 'Unable to load credit history.');
  }
});

// GET /credit/recommendations — derived from the credit profile on record
clientDetailRouter.get('/credit/recommendations', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    const profiles = await prisma.creditProfile.findMany({
      where: { businessId: clientId },
      orderBy: { pulledAt: 'desc' },
    });

    if (profiles.length === 0) {
      // No pull, no basis. Previously three confident recommendations were
      // returned regardless, including a specific point-impact range.
      ok(res, [], { total: 0, basis: 'no_credit_profile_on_record' });
      return;
    }

    const latest = profiles[0]!;
    const recommendations = buildCreditRecommendations(latest);

    ok(res, recommendations, {
      total: recommendations.length,
      basis: 'latest_credit_profile',
      pulledAt: latest.pulledAt.toISOString(),
      bureau: latest.bureau,
    });
  } catch (error) {
    logger.error('Prisma query failed for credit recommendations', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_CREDIT_RECOMMENDATIONS_FAILED', 'Unable to load recommendations.');
  }
});

// GET /repayment — obligations aggregated from the plan and the cards
clientDetailRouter.get('/repayment', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    const [plan, cards] = await Promise.all([
      prisma.repaymentPlan.findFirst({
        where: { businessId: clientId, tenantId, status: 'active' },
        include: { schedules: { orderBy: { dueDate: 'asc' } } },
      }),
      prisma.cardApplication.findMany({
        where: { businessId: clientId, status: { in: ['approved', 'active'] } },
        orderBy: { introAprExpiry: 'asc' },
      }),
    ]);

    const schedules = plan?.schedules ?? [];
    const upcoming = schedules.filter((s) => s.status !== 'paid');
    const nextPayment = upcoming[0] ?? null;
    const withAutopay = upcoming.filter((s) => s.autopayEnabled).length;

    const aprExpirySchedule = cards
      .filter((c) => c.introAprExpiry !== null)
      .map((c) => ({
        applicationId: c.id,
        issuer: c.issuer,
        cardProduct: c.cardProduct,
        expiryDate: c.introAprExpiry!.toISOString(),
        daysRemaining: Math.ceil((c.introAprExpiry!.getTime() - Date.now()) / 86_400_000),
        currentApr: c.introApr === null ? null : Number(c.introApr),
        postExpiryApr: c.regularApr === null ? null : Number(c.regularApr),
        creditLimit: c.creditLimit === null ? null : Number(c.creditLimit),
      }));

    // Payoff order: the card whose intro rate lapses soonest carries the
    // nearest cost, so it is paid first. Cards with no expiry on record sort
    // last rather than being given an invented date.
    const payoffWaterfall = [...aprExpirySchedule]
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .map((c, index) => ({
        applicationId: c.applicationId,
        issuer: c.issuer,
        cardProduct: c.cardProduct,
        creditLimit: c.creditLimit,
        priority: index + 1,
        reason:
          c.daysRemaining <= 0
            ? 'Intro APR has already lapsed'
            : `Intro APR lapses in ${c.daysRemaining} days`,
      }));

    ok(res, {
      hasPlan: plan !== null,
      planId: plan?.id ?? null,
      strategy: plan?.strategy ?? null,
      totalBalance: plan ? Number(plan.totalBalance) : null,
      // Null rather than 0 when there is no plan: no obligation on record is
      // not the same claim as a zero monthly obligation.
      totalMonthlyObligations: plan?.monthlyPayment == null ? null : Number(plan.monthlyPayment),
      nextPayment: nextPayment
        ? {
            id: nextPayment.id,
            issuer: nextPayment.issuer,
            date: nextPayment.dueDate.toISOString(),
            amount: Number(nextPayment.minimumPayment),
            recommendedPayment:
              nextPayment.recommendedPayment === null ? null : Number(nextPayment.recommendedPayment),
            autopay: nextPayment.autopayEnabled,
          }
        : null,
      autopayPct: upcoming.length > 0 ? Math.round((withAutopay / upcoming.length) * 100) : null,
      cardsAtRisk: aprExpirySchedule.filter((c) => c.daysRemaining <= 30).length,
      // cardApplicationId and cardProduct let a caller line a payment up with
      // the card it belongs to. Issuer alone does not: a client with two Chase
      // cards has two schedules that look identical.
      paymentCalendar: upcoming.map((s) => {
        const card = s.cardApplicationId
          ? (cards.find((c) => c.id === s.cardApplicationId) ?? null)
          : null;
        return {
          id: s.id,
          date: s.dueDate.toISOString(),
          issuer: s.issuer,
          cardApplicationId: s.cardApplicationId,
          // Null when the schedule predates the card link or the card is not
          // among this client's approved cards — not guessed from the issuer.
          cardProduct: card?.cardProduct ?? null,
          amount: Number(s.minimumPayment),
          recommendedPayment:
            s.recommendedPayment === null ? null : Number(s.recommendedPayment),
          status: s.status,
          autopayEnabled: s.autopayEnabled,
        };
      }),
      aprExpirySchedule,
      payoffWaterfall,
    });
  } catch (error) {
    logger.error('Prisma query failed for repayment', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_REPAYMENT_FAILED', 'Unable to load repayment detail.');
  }
});

// GET /timeline
clientDetailRouter.get('/timeline', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client timeline', { clientId, tenantId });
    const events = await prisma.ledgerEvent.findMany({
      where: { aggregateId: clientId },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    ok(res, events, { total: events.length });
  } catch (error) {
    logger.error('Prisma query failed for timeline', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_TIMELINE_FAILED', 'Unable to load the client timeline.');
  }
});

// GET /compliance — compliance checks for this business
clientDetailRouter.get('/compliance', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client compliance', { clientId, tenantId });
    const checks = await prisma.complianceCheck.findMany({
      where: { businessId: clientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, { complianceScore: scoreFromChecks(checks), maxScore: 100, checks }, { total: checks.length });
  } catch (error) {
    logger.error('Prisma query failed for compliance', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_COMPLIANCE_FAILED', 'Unable to load compliance checks.');
  }
});

// GET /compliance/status — alias for compliance status
clientDetailRouter.get('/compliance/status', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client compliance status', { clientId, tenantId });
    const checks = await prisma.complianceCheck.findMany({
      where: { businessId: clientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, { complianceScore: scoreFromChecks(checks), maxScore: 100, checks });
  } catch (error) {
    logger.error('Prisma query failed for compliance status', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_COMPLIANCE_STATUS_FAILED', 'Unable to load compliance status.');
  }
});

// GET /documents — documents for this business
clientDetailRouter.get('/documents', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client documents', { clientId, tenantId });
    const docs = await prisma.document.findMany({
      where: { businessId: clientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, docs, { total: docs.length });
  } catch (error) {
    logger.error('Prisma query failed for documents', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_DOCUMENTS_FAILED', 'Unable to load documents.');
  }
});

// POST /compliance/run — runs the compliance service and persists the result
clientDetailRouter.post('/compliance/run', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);
  const { checkType, stateCode } = (req.body ?? {}) as { checkType?: string; stateCode?: string };

  const requested = (checkType ?? 'kyb') as ComplianceCheckType;
  if (!VALID_CHECK_TYPES.has(requested)) {
    err(
      res,
      400,
      'INVALID_CHECK_TYPE',
      `checkType must be one of: ${[...VALID_CHECK_TYPES].join(', ')}.`,
    );
    return;
  }

  try {
    const business = await prisma.business.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });
    if (!business) {
      err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
      return;
    }

    // This actually runs and persists a check, and emits the ledger event the
    // service publishes. It previously returned a fixed "completed" result
    // with three sample findings and started nothing.
    const result = await complianceService.runComplianceCheck({
      businessId: clientId,
      tenantId,
      checkType: requested,
      ...(stateCode ? { stateCode } : {}),
    });

    logger.info('Compliance check completed', { clientId, tenantId, checkType: requested });
    ok(res, result);
  } catch (error) {
    logger.error('Compliance run failed', { clientId, tenantId, checkType: requested, error });
    err(res, 500, 'COMPLIANCE_RUN_FAILED', 'Unable to run the compliance check.');
  }
});

// POST /consent/request — sends a re-consent request by email
clientDetailRouter.post('/consent/request', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);
  const { channel, recipientEmail } = (req.body ?? {}) as {
    channel?: string;
    recipientEmail?: string;
  };

  const requestedChannel = channel ?? 'email';

  try {
    const business = await prisma.business.findFirst({
      where: { id: clientId, tenantId },
      include: { owners: { orderBy: { ownershipPercent: 'desc' }, take: 1 } },
    });

    if (!business) {
      err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
      return;
    }

    const owner = business.owners[0]!;
    const to = recipientEmail?.trim() || null;

    if (!to) {
      // The schema holds no client contact address — User.email belongs to
      // staff, and BusinessOwner has no email column — so the caller has to
      // supply one. Saying so beats reporting a send that could not happen,
      // which is what this endpoint used to do.
      err(
        res,
        422,
        'RECIPIENT_EMAIL_REQUIRED',
        'recipientEmail is required: no client contact address is stored against a business or its owners.',
      );
      return;
    }

    const result = await emailService.sendConsentRequest(
      {
        id: business.id,
        email: to,
        name: owner ? `${owner.firstName} ${owner.lastName}`.trim() : business.legalName,
        businessName: business.legalName,
      },
      requestedChannel,
    );

    const mode = await emailService.getMode();

    logger.info('Consent request dispatched', { clientId, tenantId, channel: requestedChannel, mode });

    ok(res, {
      clientId,
      channel: requestedChannel,
      recipientEmail: to,
      messageId: result.id ?? null,
      // `delivered` distinguishes a real send from the console fallback used
      // when no email provider is configured, so a developer-mode dispatch is
      // never reported as having reached the client.
      delivered: mode === 'resend',
      transport: mode,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Consent request failed', { clientId, tenantId, error });
    err(res, 500, 'CONSENT_REQUEST_FAILED', 'Unable to send the consent request.');
  }
});

// PATCH / — update business fields
clientDetailRouter.patch('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const clientId = req.params.clientId!;
  const tenantId = getTenantId(req);
  const updates = req.body;

  if (!updates || Object.keys(updates).length === 0) {
    err(res, 400, 'INVALID_BODY', 'Request body must contain fields to update');
    return;
  }

  const fields = Object.keys(updates);
  const rejected = fields.filter((f) => !UPDATABLE_BUSINESS_FIELDS.has(f));
  if (rejected.length > 0) {
    // Unfiltered, this wrote any column on Business — including tenantId,
    // which would have moved the client into another tenant.
    err(
      res,
      400,
      'FIELD_NOT_UPDATABLE',
      `These fields cannot be updated: ${rejected.join(', ')}.`,
    );
    return;
  }

  if (updates.timezone !== undefined && updates.timezone !== null) {
    if (typeof updates.timezone !== 'string' || !isValidTimezone(updates.timezone)) {
      err(
        res,
        422,
        'INVALID_TIMEZONE',
        'timezone must be an IANA name such as "America/Chicago". '
          + 'It decides whether outreach reaches this client inside their local contact window.',
      );
      return;
    }
  }

  // The body reaches Prisma as-is, so a field whose JSON type does not match
  // its column throws inside the driver and surfaces as a 500. `dateOfFormation`
  // is a DateTime column and every date input in the app produces "YYYY-MM-DD",
  // so editing a client's formation date failed every time — as a server error,
  // which reads like a broken backend rather than a value needing conversion.
  const data: Record<string, unknown> = { ...updates };

  if (data.dateOfFormation !== undefined && data.dateOfFormation !== null) {
    if (typeof data.dateOfFormation !== 'string' && !(data.dateOfFormation instanceof Date)) {
      err(res, 422, 'INVALID_DATE', 'dateOfFormation must be a date string (YYYY-MM-DD).');
      return;
    }
    const parsedDate = new Date(data.dateOfFormation as string);
    if (Number.isNaN(parsedDate.getTime())) {
      err(res, 422, 'INVALID_DATE', 'dateOfFormation is not a real date.');
      return;
    }
    data.dateOfFormation = parsedDate;
  }

  // Empty strings from a cleared form field mean "unset", not "the empty
  // string" — storing "" would make a blank read as a recorded value.
  for (const key of ['dba', 'ein', 'website', 'addressLine1', 'addressLine2',
                     'city', 'state', 'zip', 'businessEmail', 'phoneNumber',
                     'industry', 'naicsCode', 'mcc'] as const) {
    if (data[key] === '') data[key] = null;
  }

  try {
    logger.debug('PATCH client profile', { clientId, tenantId, fields });

    // Scoped to the tenant. This matched on id alone, so a caller could
    // update any business in any tenant by guessing or reusing an id.
    const result = await prisma.business.updateMany({
      where: { id: clientId, tenantId },
      data,
    });

    if (result.count === 0) {
      err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
      return;
    }

    const updated = await prisma.business.findFirst({ where: { id: clientId, tenantId } });
    ok(res, updated);
  } catch (error) {
    if (isNotFound(error)) {
      err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
      return;
    }
    // This previously echoed the caller's own edits back as if they had been
    // persisted, so a failed update looked like a successful one.
    logger.error('Prisma update failed for client profile', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_UPDATE_FAILED', 'Unable to update the client.');
  }
});
