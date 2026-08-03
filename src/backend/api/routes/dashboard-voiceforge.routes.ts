// ============================================================
// CapitalForge — Dashboard VoiceForge Activity Routes
//
// Mounts under: /api/v1/dashboard/voiceforge
//
// Routes:
//   GET /  — VoiceForge activity summary (call stats, campaigns,
//            compliance flags, QA scores)
//
// Provides the data that powers the VoiceForgeActivity widget
// on the advisor dashboard.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ──────────────────────────────

// ── Types ────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  contacted: number;
  total: number;
  completion_pct: number;
  paused: boolean;
}

interface ComplianceFlag {
  advisor_name: string;
  call_time: string;
  flag_type: string;
  call_id: string;
}

interface TodayCalls {
  completed: number;
  scheduled: number;
  missed: number;
}

interface QaScores {
  average: number;
  distribution: number[];
}

interface VoiceForgeActivityData {
  connected: boolean;
  today_calls: TodayCalls;
  campaigns: Campaign[];
  compliance_flags: ComplianceFlag[];
  qa_scores: QaScores;
  last_updated: string;
}

// ── Router ───────────────────────────────────────────────────

export const dashboardVoiceforgeRouter = Router();

// GET / — VoiceForge activity for the current tenant
// GET / — VoiceForge activity for the current tenant
//
// From voice_calls, call_qa_scores and call_compliance_scans.
//
// This returned invented activity on the operator's dashboard: connected
// true, twelve calls completed today, five scheduled, two missed, a "Q2
// Renewal Outreach" campaign with 45 contacted, QA scores and compliance
// flags. All of it written into the handler, the same numbers for every
// tenant, under a comment saying VoiceForge "may not have dedicated DB
// tables" — while three tables held exactly this.
//
// connected was the worst of it. A dashboard that says an outbound-calling
// integration is live, when nothing has checked, is the claim somebody acts
// on before wondering why no calls are going out.
dashboardVoiceforgeRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
      };
      res.status(401).json(body);
      return;
    }

    const db = sharedPrisma;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayCalls, qaScores, openFlags] = await Promise.all([
      db.voiceCall.findMany({
        where: { tenantId, createdAt: { gte: startOfDay } },
        select: { status: true },
      }),
      db.callQaScore.findMany({
        where: { tenantId },
        select: { overallScore: true, complianceScore: true },
        orderBy: { scoredAt: 'desc' },
        take: 100,
      }),
      db.callComplianceScan.findMany({
        where: { tenantId, complianceStatus: { in: ['review', 'fail'] } },
        select: {
          id: true,
          callId: true,
          riskLevel: true,
          complianceStatus: true,
          violationCount: true,
          criticalViolationCount: true,
          scannedAt: true,
        },
        orderBy: { scannedAt: 'desc' },
        take: 10,
      }),
    ]);

    const completed = todayCalls.filter((c) => c.status === 'completed').length;
    const missed = todayCalls.filter(
      (c) => c.status === 'no_answer' || c.status === 'busy' || c.status === 'failed',
    ).length;
    const scheduled = todayCalls.filter(
      (c) => c.status === 'queued' || c.status === 'ringing',
    ).length;

    const avg = (values: number[]): number | null =>
      values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

    const data = {
      // Whether calls can be placed is a question about credentials, not about
      // whether any rows exist. Unset means not connected, which is the honest
      // default — it used to be hardcoded true.
      connected:
        typeof process.env['TWILIO_ACCOUNT_SID'] === 'string' &&
        process.env['TWILIO_ACCOUNT_SID'].trim() !== '',

      today_calls: { completed, scheduled, missed },

      // No table holds a campaign, so none are listed rather than one being
      // invented. The page shows an empty list, which is the truth.
      campaigns: [],
      campaigns_available: false,

      // Scans that came back review or fail. A scan that passed is not a
      // flag, and listing it as one would inflate the count on the dashboard.
      compliance_flags: openFlags.map((scan) => ({
        id: scan.id,
        callId: scan.callId,
        riskLevel: scan.riskLevel,
        status: scan.complianceStatus,
        violations: scan.violationCount,
        criticalViolations: scan.criticalViolationCount,
        detectedAt: scan.scannedAt.toISOString(),
      })),

      qa_scores: {
        // Null rather than 0 where nothing has been scored: a QA score of zero
        // is a call that failed its review, not one nobody reviewed.
        average: avg(qaScores.map((q) => q.overallScore)),
        // Five buckets across 0-100, from the scores on record. It used to be
        // a fixed array, so the chart had the same shape for every tenant.
        distribution: [0, 20, 40, 60, 80].map(
          (floor) =>
            qaScores.filter((q) => q.overallScore >= floor && q.overallScore < floor + 20).length,
        ),
        scored_calls: qaScores.length,
      },

      last_updated: new Date().toISOString(),
    };

    const body: ApiResponse<typeof data> = { success: true, data };
    res.status(200).json(body);
  } catch (err) {
    console.error('[dashboard-voiceforge] failed to read activity', err);
    const body: ApiResponse = {
      success: false,
      error: { code: 'VOICEFORGE_READ_FAILED', message: 'Could not read VoiceForge activity.' },
    };
    res.status(500).json(body);
  }
});
