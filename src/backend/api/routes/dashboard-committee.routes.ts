// ============================================================
// CapitalForge — Dashboard Deal Committee Queue Routes
//
// GET /api/v1/dashboard/committee  — pending deal committee reviews
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// ── Helper: extract tenantId from authenticated request ─────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new Error('Authentication context missing.');
  }
  return tenantId;
}

// ── SLA helpers ─────────────────────────────────────────────────────────────

const SLA_HOURS = 24;

function slaHoursRemaining(createdAt: Date): number {
  const deadlineMs = createdAt.getTime() + SLA_HOURS * 60 * 60 * 1000;
  const remainingMs = deadlineMs - Date.now();
  // Round to one decimal place; clamp to 0 minimum
  return Math.max(0, Math.round((remainingMs / (60 * 60 * 1000)) * 10) / 10);
}

// ── Reviewer extraction ─────────────────────────────────────────────────────

interface ReviewerEntry {
  name: string;
  responded: boolean;
}

function parseReviewers(reviewedBy: unknown): ReviewerEntry[] {
  if (!reviewedBy || !Array.isArray(reviewedBy)) return [];
  return (reviewedBy as Record<string, unknown>[]).map((r) => ({
    name: typeof r.name === 'string' ? r.name : 'Unknown',
    responded: Boolean(r.responded),
  }));
}

// ── Consensus derivation ────────────────────────────────────────────────────

function deriveConsensus(reviewers: ReviewerEntry[]): string {
  if (reviewers.length === 0) return 'awaiting';
  const respondedCount = reviewers.filter((r) => r.responded).length;
  if (respondedCount === 0) return 'awaiting';
  if (respondedCount === reviewers.length) return 'complete';
  return 'partial';
}

// ── Router ──────────────────────────────────────────────────────────────────

export const dashboardCommitteeRouter = Router();

// GET / — Pending deal committee reviews for the current tenant
dashboardCommitteeRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const db = getPrisma();

      // ── Fetch pending reviews ─────────────────────────────────────────
      const reviews = await db.dealCommitteeReview.findMany({
        where: {
          tenantId,
          status: 'pending',
        },
        orderBy: { createdAt: 'asc' },
      });

      // ── Gather unique business IDs and fetch businesses ───────────────
      const businessIds = [...new Set(reviews.map((r) => r.businessId))];

      const businesses = businessIds.length > 0
        ? await db.business.findMany({
            where: { id: { in: businessIds }, tenantId },
            select: { id: true, legalName: true },
          })
        : [];

      const businessMap = new Map(businesses.map((b) => [b.id, b]));

      // ── Fetch latest application per business for linking ─────────────
      const applications = businessIds.length > 0
        ? await db.cardApplication.findMany({
            where: { businessId: { in: businessIds } },
            orderBy: { createdAt: 'desc' },
            distinct: ['businessId'],
            select: { id: true, businessId: true, creditLimit: true },
          })
        : [];

      const appMap = new Map(applications.map((a) => [a.businessId, a]));

      // ── Build response deals ──────────────────────────────────────────
      const deals = reviews.map((review) => {
        const business = businessMap.get(review.businessId);
        const app = appMap.get(review.businessId);
        const reviewers = parseReviewers(review.reviewedBy);
        const consensus = deriveConsensus(reviewers);
        const slaRemaining = slaHoursRemaining(review.createdAt);

        return {
          id: review.id,
          client_name: business?.legalName ?? 'Unknown',
          client_id: review.businessId,
          deal_amount: app?.creditLimit ? Number(app.creditLimit) : 0,
          risk_tier: review.riskTier,
          submitted_date: review.createdAt.toISOString(),
          reviewers,
          consensus,
          sla_hours_remaining: slaRemaining,
          application_id: app?.id ?? null,
        };
      });

      // ── Response ──────────────────────────────────────────────────────
      const body: ApiResponse = {
        success: true,
        data: {
          queue_count: deals.length,
          deals,
          last_updated: new Date().toISOString(),
        },
      };

      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'COMMITTEE_QUEUE_FETCH_FAILED',
          message,
        },
      };
      res.status(500).json(body);
    }
  },
);
