// ============================================================
// CapitalForge — Platform Portfolio Routes
//
// Endpoints:
//   GET /api/platform/portfolio/benchmarks?quarter=X — benchmark data
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const platformPortfolioRouter = Router();

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

// ============================================================
// GET /api/platform/portfolio/benchmarks?quarter=X
// ============================================================

const BENCHMARKS: Record<string, Record<string, unknown>> = {
  '2026-Q1': {
    quarter: '2026-Q1',
    avgCreditScore: 718,
    avgUtilization: 26.3,
    approvalRate: 72.1,
    avgCreditLimit: 47_200,
    delinquencyRate: 1.8,
    graduationRate: 19.4,
    portfolioGrowth: 14.2,
    industryBenchmarks: {
      avgCreditScore: 705,
      avgApprovalRate: 64.0,
      avgDelinquencyRate: 3.2,
    },
    topPerformingSegments: [
      { segment: 'E-commerce', approvalRate: 78.4, avgLimit: 52_000 },
      { segment: 'SaaS', approvalRate: 75.1, avgLimit: 48_500 },
      { segment: 'Professional Services', approvalRate: 71.8, avgLimit: 44_000 },
    ],
  },
  '2025-Q4': {
    quarter: '2025-Q4',
    avgCreditScore: 712,
    avgUtilization: 28.1,
    approvalRate: 69.8,
    avgCreditLimit: 45_000,
    delinquencyRate: 2.1,
    graduationRate: 18.6,
    portfolioGrowth: 11.8,
    industryBenchmarks: {
      avgCreditScore: 702,
      avgApprovalRate: 62.5,
      avgDelinquencyRate: 3.5,
    },
    topPerformingSegments: [
      { segment: 'E-commerce', approvalRate: 76.2, avgLimit: 50_000 },
      { segment: 'SaaS', approvalRate: 73.4, avgLimit: 46_000 },
      { segment: 'Healthcare', approvalRate: 70.1, avgLimit: 42_500 },
    ],
  },
  '2025-Q3': {
    quarter: '2025-Q3',
    avgCreditScore: 708,
    avgUtilization: 30.2,
    approvalRate: 67.4,
    avgCreditLimit: 42_800,
    delinquencyRate: 2.4,
    graduationRate: 16.9,
    portfolioGrowth: 9.6,
    industryBenchmarks: {
      avgCreditScore: 698,
      avgApprovalRate: 61.0,
      avgDelinquencyRate: 3.8,
    },
    topPerformingSegments: [
      { segment: 'SaaS', approvalRate: 72.0, avgLimit: 44_000 },
      { segment: 'E-commerce', approvalRate: 71.5, avgLimit: 47_500 },
      { segment: 'Consulting', approvalRate: 68.2, avgLimit: 40_000 },
    ],
  },
};

platformPortfolioRouter.get('/benchmarks', (req: Request, res: Response) => {
  const quarter = (req.query.quarter as string) ?? '2026-Q1';
  logger.info(`[platform-portfolio] GET /benchmarks?quarter=${quarter}`);

  const data = BENCHMARKS[quarter];
  if (!data) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `No benchmark data for quarter "${quarter}". Available: ${Object.keys(BENCHMARKS).join(', ')}`,
      },
      statusCode: 404,
    });
  }

  return ok(res, data);
});
