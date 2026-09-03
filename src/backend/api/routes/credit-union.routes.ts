// ============================================================
// CapitalForge — Credit Union Routes
//
// Endpoints:
//   GET  /api/credit-unions/:slug/products           — list products for a CU
//   GET  /api/credit-unions/:slug/eligibility        — check business eligibility
//   POST /api/credit-unions/:slug/membership/verify  — mock membership verification
//   GET  /api/credit-unions/strategy-note            — CU strategy text
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';
import {
  CREDIT_UNION_MEMBERSHIP,
  parseIssuer,
} from '../../../shared/constants/issuers.js';

/**
 * The join-fee step, from the registry rather than the column.
 *
 * Two problems here, and the column caused both. `credit_unions.joinFee` is
 * nullable, and the old expression was `joinFee ? paid : 'No join fee
 * required.'` — so a fee nobody had recorded rendered as a positive statement
 * that none was owed, which is the one thing a client should not be told
 * wrongly before turning up at a branch. The column also holds $50 for First
 * Tech, a figure this codebase could never source and has now stopped
 * asserting everywhere else.
 *
 * The registry wins for any credit union it knows. The column is consulted
 * only for one it does not, and a missing value says so.
 */
function joinFeeStep(slug: string, columnFee: number | null): string {
  const parsed = parseIssuer(slug);
  if (parsed?.kind === 'credit_union') {
    const cost = CREDIT_UNION_MEMBERSHIP[parsed.id].cost;
    switch (cost.kind) {
      case 'none':
        return 'No join fee required.';
      case 'confirmed':
        return `Pay the one-time join fee of $${cost.amount.toFixed(2)}.`;
      case 'unconfirmed':
        return `Membership is required and carries a fee we cannot confirm — ${cost.note} Check the current amount with the credit union before quoting it.`;
    }
  }
  if (columnFee === null) {
    return 'Whether a join fee applies is not recorded — check with the credit union.';
  }
  return columnFee > 0
    ? `Pay the one-time join fee of $${columnFee.toFixed(2)}.`
    : 'No join fee required.';
}


export const creditUnionRouter = Router();

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
  logger.error('[credit-union] Server error', { error: message });
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
  });
}

// ============================================================
// GET /api/credit-unions/strategy-note
// Returns the CU strategy text for display on the frontend.
// NOTE: this must be registered before /:slug routes to avoid
// "strategy-note" being captured as a slug param.
// ============================================================

creditUnionRouter.get('/strategy-note', async (_req: Request, res: Response) => {
  try {
    logger.info('[credit-union] GET /strategy-note');

    return ok(res, {
      title: 'Credit Union Strategy',
      note:
        'Credit unions are member-owned cooperatives that often provide lower rates, ' +
        'reduced fees, and more flexible underwriting for business credit products. ' +
        'Because they are not publicly traded, credit unions can prioritize member ' +
        'benefit over shareholder return. For businesses building credit stacks, ' +
        'CU products can serve as strong foundational cards with lower APRs and ' +
        'minimal annual fees, especially when paired with a relationship-based ' +
        'membership that unlocks future lending opportunities.',
      tips: [
        'Join before applying — most CUs require membership before product access.',
        'CU hard pulls are often lighter weight and may not count toward issuer velocity limits.',
        'Some CUs report to all three bureaus, strengthening your business credit file.',
        'Look for CUs with open membership via association ($5–$15 join fee).',
      ],
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// GET /api/credit-unions/:slug/products
// List all active products for a specific credit union by slug.
// ============================================================

creditUnionRouter.get('/:slug/products', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    logger.info('[credit-union] GET /:slug/products', { slug });

    const db = sharedPrisma;

    const creditUnion = await db.creditUnion.findUnique({
      where: { slug },
    });

    if (!creditUnion) {
      return notFound(res, `Credit union not found: ${slug}`);
    }

    const products = await db.creditUnionProduct.findMany({
      where: { creditUnionId: creditUnion.id, isActive: true },
      orderBy: { productType: 'asc' },
    });

    return ok(res, {
      creditUnionId: creditUnion.id,
      creditUnionName: creditUnion.name,
      slug: creditUnion.slug,
      products,
      total: products.length,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// GET /api/credit-unions/:slug/eligibility?businessId=X
// Check if a business is eligible for this CU's products.
// Performs state check and credit score check.
// ============================================================

creditUnionRouter.get(
  '/:slug/eligibility',
  async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      const businessId = typeof req.query.businessId === 'string'
        ? req.query.businessId
        : undefined;
      logger.info('[credit-union] GET /:slug/eligibility', { slug, businessId });

      const db = sharedPrisma;

      // Fetch the credit union
      const creditUnion = await db.creditUnion.findUnique({
        where: { slug },
      });

      if (!creditUnion) {
        return notFound(res, `Credit union not found: ${slug}`);
      }

      // Fetch active products separately to avoid Prisma include inference issues
      const products = await db.creditUnionProduct.findMany({
        where: { creditUnionId: creditUnion.id, isActive: true },
      });

      // If no businessId, return basic product requirements
      if (!businessId) {
        const productRequirements = products.map((p) => ({
          productId: p.id,
          productName: p.productName,
          productType: p.productType,
          scoreMinimum: p.scoreMinimum ?? null,
          businessAgeMinimum: p.businessAgeMinimum ?? null,
          revenueMinimum: p.revenueMinimum ?? null,
        }));

        return ok(res, {
          creditUnion: { id: creditUnion.id, name: creditUnion.name, slug },
          eligible: null,
          reason: 'No businessId provided — returning product requirements only.',
          productRequirements,
        });
      }

      // Fetch the business with its latest credit profile.
      //
      // Scoped. This was `findUnique({ where: { id: businessId } })`, so any
      // authenticated caller could pass any business id and read its legal
      // name, state of formation, revenue and credit score back out of the
      // eligibility answer. The business id arrives as a query parameter, which
      // is the shape `requireOwnedBusiness` cannot cover — it verifies
      // `req.params`, and this id is never in a path.
      const business = await db.business.findFirst({
        where: { id: businessId, tenantId: req.tenant!.tenantId },
      });

      if (!business) {
        // Same answer for a business that does not exist and one belonging to
        // another tenant, so the response cannot be used to enumerate ids.
        return notFound(res, `Business not found: ${businessId}`);
      }

      const creditProfiles = await db.creditProfile.findMany({
        where: { businessId },
        orderBy: { pulledAt: 'desc' },
        take: 1,
      });

      const latestCredit = creditProfiles[0] ?? null;
      const creditScore = latestCredit?.score ?? null;

      // Business age in months
      let businessAgeMonths: number | null = null;
      if (business.dateOfFormation) {
        const now = new Date();
        const formation = new Date(business.dateOfFormation);
        businessAgeMonths =
          (now.getFullYear() - formation.getFullYear()) * 12 +
          (now.getMonth() - formation.getMonth());
      }

      const annualRevenue = business.annualRevenue
        ? Number(business.annualRevenue)
        : null;

      // State check: if CU has membership criteria mentioning specific states,
      // compare against business stateOfFormation
      const businessState = business.stateOfFormation ?? null;
      const membershipCriteria = creditUnion.membershipCriteria ?? '';

      // Simple state-based membership check
      let stateEligible = true;
      let stateNote = 'No geographic restriction detected.';
      if (
        membershipCriteria &&
        businessState &&
        membershipCriteria.toLowerCase().includes('state:')
      ) {
        const allowedStates = membershipCriteria
          .toLowerCase()
          .split('state:')[1]
          ?.split(',')
          .map((s: string) => s.trim());
        if (
          allowedStates &&
          !allowedStates.includes(businessState.toLowerCase())
        ) {
          stateEligible = false;
          stateNote = `Business state (${businessState}) is not in the CU's service area.`;
        }
      }

      // Per-product eligibility
      const productEligibility = products.map((p) => {
        const checks: { field: string; pass: boolean; detail: string }[] = [];

        // Credit score check
        if (p.scoreMinimum != null && p.scoreMinimum > 0) {
          if (creditScore != null) {
            const pass = creditScore >= p.scoreMinimum;
            checks.push({
              field: 'creditScore',
              pass,
              detail: pass
                ? `Score ${creditScore} meets minimum ${p.scoreMinimum}.`
                : `Score ${creditScore} below minimum ${p.scoreMinimum}.`,
            });
          } else {
            checks.push({
              field: 'creditScore',
              pass: false,
              detail: `No credit score on file. Minimum required: ${p.scoreMinimum}.`,
            });
          }
        }

        // Business age check
        if (p.businessAgeMinimum != null && p.businessAgeMinimum > 0) {
          if (businessAgeMonths != null) {
            const pass = businessAgeMonths >= p.businessAgeMinimum;
            checks.push({
              field: 'businessAge',
              pass,
              detail: pass
                ? `Business age ${businessAgeMonths}mo meets minimum ${p.businessAgeMinimum}mo.`
                : `Business age ${businessAgeMonths}mo below minimum ${p.businessAgeMinimum}mo.`,
            });
          } else {
            checks.push({
              field: 'businessAge',
              pass: false,
              detail: `No formation date on file. Minimum required: ${p.businessAgeMinimum}mo.`,
            });
          }
        }

        // Revenue check
        if (p.revenueMinimum != null && p.revenueMinimum > 0) {
          if (annualRevenue != null) {
            const pass = annualRevenue >= p.revenueMinimum;
            checks.push({
              field: 'annualRevenue',
              pass,
              detail: pass
                ? `Revenue $${annualRevenue.toLocaleString()} meets minimum $${p.revenueMinimum.toLocaleString()}.`
                : `Revenue $${annualRevenue.toLocaleString()} below minimum $${p.revenueMinimum.toLocaleString()}.`,
            });
          } else {
            checks.push({
              field: 'annualRevenue',
              pass: false,
              detail: `No revenue data on file. Minimum required: $${p.revenueMinimum.toLocaleString()}.`,
            });
          }
        }

        const allPass = checks.every((c) => c.pass);

        return {
          productId: p.id,
          productName: p.productName,
          productType: p.productType,
          eligible: stateEligible && allPass,
          checks,
        };
      });

      const overallEligible =
        stateEligible && productEligibility.some((pe) => pe.eligible);

      return ok(res, {
        creditUnion: { id: creditUnion.id, name: creditUnion.name, slug },
        businessId,
        stateCheck: { eligible: stateEligible, note: stateNote },
        overallEligible,
        eligibleProductCount: productEligibility.filter((pe) => pe.eligible)
          .length,
        products: productEligibility,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return notFound(res, err.message);
      }
      return serverError(res, err);
    }
  },
);

// ============================================================
// POST /api/credit-unions/:slug/membership/verify
// Accepts { businessId } and returns membership status.
// Mock implementation: always returns "not_member" with join instructions.
// ============================================================

creditUnionRouter.post(
  '/:slug/membership/verify',
  async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      const { businessId } = req.body;
      logger.info('[credit-union] POST /:slug/membership/verify', {
        slug,
        businessId,
      });

      if (!businessId || typeof businessId !== 'string') {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'businessId is required in the request body.',
          },
        });
      }

      const db = sharedPrisma;

      // Verify the credit union exists
      const creditUnion = await db.creditUnion.findUnique({
        where: { slug },
      });

      if (!creditUnion) {
        return notFound(res, `Credit union not found: ${slug}`);
      }

      // Verify the business exists — within the calling tenant.
      //
      // Unscoped, this confirmed the existence of any business id and returned
      // its legal name inside `joinInstructions.message`.
      const business = await db.business.findFirst({
        where: { id: businessId, tenantId: req.tenant!.tenantId },
        select: { id: true, legalName: true },
      });

      if (!business) {
        return notFound(res, `Business not found: ${businessId}`);
      }

      // Mock: always return not_member with join instructions
      // In production, this would call the CU's member verification API
      return ok(res, {
        creditUnion: { id: creditUnion.id, name: creditUnion.name, slug },
        businessId: business.id,
        businessName: business.legalName,
        membershipStatus: 'not_member' as const,
        joinInstructions: {
          message: `${business.legalName} is not currently a member of ${creditUnion.name}.`,
          steps: [
            creditUnion.openMembership
              ? 'This credit union has open membership — anyone can join.'
              : `Review membership criteria: ${creditUnion.membershipCriteria ?? 'Contact the credit union for details.'}`,
            joinFeeStep(creditUnion.slug, creditUnion.joinFee),
            'Complete the membership application (typically online or in-branch).',
            'Once membership is confirmed, you can apply for business credit products.',
          ],
          estimatedProcessingDays: 3,
        },
      });
    } catch (err) {
      return serverError(res, err);
    }
  },
);
