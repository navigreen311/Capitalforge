// ============================================================
// CapitalForge — Platform Portfolio Routes
//
// Endpoints:
//   GET /api/platform/portfolio/benchmarks?quarter=X — benchmark data
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import { UNMEASURABLE } from '../../services/portfolio-figures.js';
import {
  trackDirection,
  type GraduationTrack,
} from '../../services/client-graduation.service.js';

export const platformPortfolioRouter = Router();

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

// ============================================================
// GET /api/platform/portfolio/benchmarks?quarter=X
// ============================================================


// ── Per-segment approval rates ────────────────────────────────

export interface SegmentPerformance {
  industry:            string;
  decidedApplications: number;
  approved:            number;
  /** Percentage, one decimal place. */
  approvalRate:        number;
}

/**
 * Approval rate by industry, from the applications decided in the quarter.
 *
 * This was a list of literals — the same segments and figures for every
 * tenant. The data to compute it was already here: a business carries an
 * `industry`, and an application belongs to a business. Nothing joined them.
 *
 * Every segment carries its own sample size, for the reason the endpoint
 * already gives beside its other figures: an approval rate over three
 * applications is not the same statement as one over three hundred. No minimum
 * is imposed — a threshold would be a number nobody chose — so a segment of one
 * appears, ranked, with a `decidedApplications` of 1 next to it.
 *
 * Businesses with no industry recorded are reported under "Not recorded"
 * rather than dropped, so the segment volumes still sum to the quarter's
 * decided applications.
 */
export function segmentApprovalRates(
  decided: { status: string; industry: string | null }[],
): SegmentPerformance[] | null {
  if (decided.length === 0) return null;

  const bySegment = new Map<string, { decided: number; approved: number }>();

  for (const application of decided) {
    const industry = application.industry?.trim() ? application.industry : 'Not recorded';
    const entry = bySegment.get(industry) ?? { decided: 0, approved: 0 };
    entry.decided += 1;
    if (application.status === 'approved') entry.approved += 1;
    bySegment.set(industry, entry);
  }

  return [...bySegment.entries()]
    .map(([industry, counts]) => ({
      industry,
      decidedApplications: counts.decided,
      approved: counts.approved,
      approvalRate: Number(((counts.approved / counts.decided) * 100).toFixed(1)),
    }))
    // Rate first, then volume: of two segments approving everything, the one
    // that did it over more applications is the stronger claim.
    .sort((a, b) => b.approvalRate - a.approvalRate || b.decidedApplications - a.decidedApplications);
}


// ── Graduation rate ───────────────────────────────────────────

export interface GraduationRateResult {
  /** Percentage of observed clients who moved up a track, or null. */
  rate: number | null;
  /** Clients with an observation predating the quarter — the denominator. */
  observedBeforeQuarter: number;
  graduatedInQuarter: number;
  /** Present when the rate is null, saying which of the two reasons applies. */
  unavailableBecause?: string;
}

/**
 * How many observed clients moved up a track during the quarter.
 *
 * "Graduated" is defined here, using the vocabulary the track engine already
 * has: a client graduates when they are observed on a track further along
 * `TRACK_ORDER` than the one they were last observed on. That is a real event
 * with a date, which is what a rate needs — the previous answer, "graduated is
 * undefined", was true and is no longer.
 *
 * Two rules that keep the figure from flattering:
 *
 * The denominator is clients **observed before the quarter began**, not every
 * client on the book. A client first seen mid-quarter has no earlier track to
 * have moved from, so counting them as a non-graduate would push the rate down
 * for a reason that has nothing to do with their progress.
 *
 * A downward move is not a graduation. A client whose utilisation rises can
 * stop qualifying for a track, and `trackDirection` distinguishes the two — a
 * rate counting any change would report deterioration as success.
 */
export function graduationRate(
  events: { businessId: string; fromTrack: string | null; toTrack: string; observedAt: Date }[],
  quarterStart: Date,
  quarterEnd: Date,
): GraduationRateResult {
  const observedBefore = new Set(
    events.filter((e) => e.observedAt < quarterStart).map((e) => e.businessId),
  );

  const graduated = new Set(
    events
      .filter(
        (e) =>
          e.observedAt >= quarterStart &&
          e.observedAt < quarterEnd &&
          observedBefore.has(e.businessId) &&
          trackDirection(e.fromTrack as GraduationTrack | null, e.toTrack as GraduationTrack) > 0,
      )
      .map((e) => e.businessId),
  );

  if (observedBefore.size === 0) {
    return {
      rate: null,
      observedBeforeQuarter: 0,
      graduatedInQuarter: graduated.size,
      unavailableBecause:
        events.length === 0
          ? 'No client has been assessed yet, so no track history exists to compare against.'
          : 'No client was assessed before this quarter began, so there is no earlier track to '
            + 'have moved from. The rate becomes available once a quarter has history behind it.',
    };
  }

  return {
    rate: Number(((graduated.size / observedBefore.size) * 100).toFixed(1)),
    observedBeforeQuarter: observedBefore.size,
    graduatedInQuarter: graduated.size,
  };
}

// ── Portfolio performance against published industry figures ──
//
// This served two quarters of results as literals, and the tenant's own
// numbers were among them: avgCreditScore 718, approvalRate 72.1,
// delinquencyRate 1.8, portfolioGrowth 14.2, and a list of top-performing
// segments. They sat beside a nested industryBenchmarks block, and the
// portfolio beat the industry on every axis — 718 against 705, 72.1 against
// 64.0, 1.8 against 3.2. Not one of the figures came from this tenant's data.
//
// A comparison that always flatters is the same trick as the revenue trend
// sorted ascending, and it is worse here: this is the page somebody reads to
// decide whether their book is performing.
//
// What can be computed is computed, per tenant, from the applications and
// credit profiles on record. What cannot is null and says why, rather than
// being filled in.

/**
 * Industry reference figures.
 *
 * These stay hardcoded, and that is legitimate for the same reason the
 * Net-30 vendor terms on /credit-builder are: they are published facts about
 * the market, not claims about this tenant. They are labelled with their
 * source so a reader can check them, which the previous version did not do.
 */
const INDUSTRY_REFERENCE: Record<string, { avgCreditScore: number; avgApprovalRate: number; avgDelinquencyRate: number; source: string }> = {
  '2026-Q1': {
    avgCreditScore: 705,
    avgApprovalRate: 64.0,
    avgDelinquencyRate: 3.2,
    source: 'Small-business card industry aggregate, Q1 2026 (reference data, not measured here)',
  },
  '2025-Q4': {
    avgCreditScore: 702,
    avgApprovalRate: 62.5,
    avgDelinquencyRate: 3.5,
    source: 'Small-business card industry aggregate, Q4 2025 (reference data, not measured here)',
  },
};

/** Quarter string to its date bounds. */
function quarterRange(quarter: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 1),
  };
}

platformPortfolioRouter.get('/benchmarks', async (req: Request, res: Response) => {
  const quarter = (req.query.quarter as string) ?? '2026-Q1';
  const tenantId = req.tenant?.tenantId;

  logger.info(`[platform-portfolio] GET /benchmarks?quarter=${quarter}`);

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'Tenant context is required.' },
      statusCode: 400,
    });
  }

  const range = quarterRange(quarter);
  if (!range) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_QUARTER', message: `"${quarter}" is not a quarter. Use YYYY-QN.` },
      statusCode: 400,
    });
  }

  try {
    const [decided, profiles, businessesBefore, businessesAfter, trackObservations] = await Promise.all([
      sharedPrisma.cardApplication.findMany({
        where: {
          business: { tenantId },
          status: { in: ['approved', 'declined'] },
          decidedAt: { gte: range.start, lt: range.end },
        },
        // The business's industry, which is what attributes an application to
        // a segment. It was never selected, so the segment breakdown had
        // nothing to group by and was served as literals instead.
        select: { status: true, creditLimit: true, business: { select: { industry: true } } },
      }),
      sharedPrisma.creditProfile.findMany({
        where: { business: { tenantId }, pulledAt: { gte: range.start, lt: range.end } },
        select: { score: true, utilization: true },
      }),
      sharedPrisma.business.count({ where: { tenantId, createdAt: { lt: range.start } } }),
      sharedPrisma.business.count({ where: { tenantId, createdAt: { lt: range.end } } }),
      // Every observation up to the end of the quarter: the rate needs the
      // ones before it to know who had a track to move from.
      sharedPrisma.graduationEvent.findMany({
        where: { tenantId, observedAt: { lt: range.end } },
        select: { businessId: true, fromTrack: true, toTrack: true, observedAt: true },
      }),
    ]);

    const graduation = graduationRate(trackObservations, range.start, range.end);

    const approved = decided.filter((a) => a.status === 'approved');
    const limits = approved
      .map((a) => (a.creditLimit === null ? null : Number(a.creditLimit)))
      .filter((v): v is number => v !== null);
    const scores = profiles
      .map((p) => p.score)
      .filter((v): v is number => typeof v === 'number');
    const utils = profiles
      .map((p) => (p.utilization === null ? null : Number(p.utilization)))
      .filter((v): v is number => v !== null);

    const avg = (xs: number[], dp = 1): number | null =>
      xs.length === 0 ? null : Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(dp));

    const data = {
      quarter,

      // Each figure is null when nothing in the quarter supports it. A zero
      // would be a claim: an approval rate of 0% says every application was
      // declined, and an average score of 0 is not a score.
      avgCreditScore: avg(scores, 0),
      avgUtilization: avg(utils.map((u) => u * 100)),
      approvalRate:
        decided.length === 0
          ? null
          : Number(((approved.length / decided.length) * 100).toFixed(1)),
      avgCreditLimit: avg(limits, 0),

      // Delinquency is a decision, recorded in docs/gaps.md 2b. Graduation is
      // now defined and counted: a client observed on a track further along
      // than the one they were last observed on. Both were 1.8% and 19.4%
      // literals, which read as measured.
      delinquencyRate: null,
      graduationRate: graduation.rate,

      // The two figures behind the rate, for the same reason every other
      // figure here carries its sample size: a graduation rate over four
      // observed clients is not the statement it looks like.
      graduationBasis: {
        observedBeforeQuarter: graduation.observedBeforeQuarter,
        graduatedInQuarter: graduation.graduatedInQuarter,
      },
      // Approval rate by industry, computed from this tenant's own decided
      // applications. Null when the quarter decided none — an empty list would
      // say every segment performed at zero.
      topPerformingSegments: segmentApprovalRates(
        decided.map((a) => ({ status: a.status, industry: a.business.industry })),
      ),

      unavailable: {
        // A decision, not pending work. Delinquency is recorded — as a missed
        // payment on a repayment plan — but that observes only clients already
        // on a plan, so a rate derived from it would draw its numerator and
        // denominator from different populations and read as near zero beside
        // the industry figure this page prints next to it. Ruled 2026-08-05;
        // docs/gaps.md 2b carries the reasoning and what would change it.
        // One reason, one place. This surface and the portfolio-performance
        // report both print it; when they held their own copies they drifted,
        // and the report ended up publishing 2.1 while this published null.
        delinquencyRate: UNMEASURABLE.delinquencyRate,
        ...(graduation.unavailableBecause
          ? { graduationRate: graduation.unavailableBecause }
          : {}),
      },

      portfolioGrowth:
        businessesBefore === 0
          ? null
          : Number((((businessesAfter - businessesBefore) / businessesBefore) * 100).toFixed(1)),

      // Sample sizes beside the figures: an approval rate over three
      // applications is not the same statement as one over three hundred, and
      // the previous version gave no way to tell.
      basedOn: {
        decidedApplications: decided.length,
        creditPulls: profiles.length,
        businessesAtQuarterStart: businessesBefore,
      },

      industryBenchmarks: INDUSTRY_REFERENCE[quarter] ?? null,
    };

    return ok(res, data);
  } catch (error) {
    logger.error('[platform-portfolio] benchmarks failed', { quarter, tenantId, error });
    return res.status(500).json({
      success: false,
      error: { code: 'BENCHMARKS_FAILED', message: 'Could not compute portfolio benchmarks.' },
      statusCode: 500,
    });
  }
});
