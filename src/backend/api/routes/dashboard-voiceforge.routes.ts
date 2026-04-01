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

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ──────────────────────────────

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  _prisma ??= new PrismaClient();
  return _prisma;
}

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
dashboardVoiceforgeRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
      };
      res.status(401).json(body);
      return;
    }

    // Keep PrismaClient warm for tenant-scoped queries if needed later
    const _db = getPrisma();

    // VoiceForge may not have dedicated DB tables for all activity
    // data — return realistic mock data scoped to the tenant session.

    const data: VoiceForgeActivityData = {
      connected: true,

      today_calls: {
        completed: 12,
        scheduled: 5,
        missed: 2,
      },

      campaigns: [
        {
          id: 'camp_q2_renewal',
          name: 'Q2 Renewal Outreach',
          contacted: 45,
          total: 60,
          completion_pct: 75,
          paused: false,
        },
        {
          id: 'camp_new_product',
          name: 'New Product Launch',
          contacted: 28,
          total: 50,
          completion_pct: 56,
          paused: false,
        },
        {
          id: 'camp_win_back',
          name: 'Win-Back Campaign',
          contacted: 10,
          total: 35,
          completion_pct: 29,
          paused: true,
        },
      ],

      compliance_flags: [
        {
          advisor_name: 'Sarah Mitchell',
          call_time: '9:42 AM',
          flag_type: 'disclosure_missing',
          call_id: 'call_vf_8a3c1',
        },
        {
          advisor_name: 'James Park',
          call_time: '11:15 AM',
          flag_type: 'consent_not_recorded',
          call_id: 'call_vf_7b2d4',
        },
        {
          advisor_name: 'Maria Lopez',
          call_time: '2:08 PM',
          flag_type: 'script_deviation',
          call_id: 'call_vf_9e5f2',
        },
      ],

      qa_scores: {
        average: 82,
        distribution: [65, 72, 78, 82, 88, 91, 85],
      },

      last_updated: new Date().toISOString(),
    };

    const body: ApiResponse<VoiceForgeActivityData> = { success: true, data };
    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const body: ApiResponse = {
      success: false,
      error: { code: 'VOICEFORGE_FETCH_FAILED', message },
    };
    res.status(500).json(body);
  }
});
