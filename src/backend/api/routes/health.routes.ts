// ============================================================
// Health Routes
// GET /api/health       — liveness probe (always fast)
// GET /api/health/ready — readiness probe (checks DB + Redis)
// ============================================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

export const healthRouter = Router();

// Lazy singleton — avoids instantiating Prisma in tests that don't need it
let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// ── Types ─────────────────────────────────────────────────────
interface HealthData {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

interface ReadinessData extends HealthData {
  checks: {
    database: CheckResult;
    redis?: CheckResult;
  };
}

interface CheckResult {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

// ── GET /api/health ───────────────────────────────────────────
// Liveness: confirms the process is running and event loop is healthy.
healthRouter.get('/', (_req: Request, res: Response): void => {
  const body: ApiResponse<HealthData> = {
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.0',
    },
  };
  res.status(200).json(body);
});

// ── GET /api/health/ready ─────────────────────────────────────
// Readiness: confirms the service can handle requests (DB reachable).
healthRouter.get('/ready', async (req: Request, res: Response): Promise<void> => {
  const reqLog = logger.child({ requestId: req.requestId, path: '/api/health/ready' });
  const start = Date.now();

  const dbCheck = await checkDatabase(reqLog);
  const allHealthy = dbCheck.status === 'ok';

  const statusCode = allHealthy ? 200 : 503;
  const body: ApiResponse<ReadinessData> = {
    success: allHealthy,
    data: {
      status: allHealthy ? 'ok' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.0',
      checks: {
        database: dbCheck,
      },
    },
    ...(!allHealthy && {
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'One or more readiness checks failed.',
      },
    }),
  };

  reqLog.info('Readiness check completed', {
    durationMs: Date.now() - start,
    healthy: allHealthy,
  });

  res.status(statusCode).json(body);
});

// ── Helpers ───────────────────────────────────────────────────
async function checkDatabase(reqLog: ReturnType<typeof logger.child>): Promise<CheckResult> {
  const t = Date.now();
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - t };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reqLog.error('Database health check failed', { error: message });
    return { status: 'error', latencyMs: Date.now() - t, error: 'Database unreachable' };
  }
}
