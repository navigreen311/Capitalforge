// ============================================================
// CapitalForge — Client Portal Routes
//
// Endpoints:
//   GET /api/portal/:clientId/summary — returns mock funding status,
//       APR countdowns, upcoming payments, and unsigned documents
// ============================================================

import { Router, type Request, type Response } from 'express';
import logger from '../../config/logger.js';

export const portalRouter = Router({ mergeParams: true });

/** Safely extract a single string param (Express 5 params may be string | string[]). */
function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0]! : (val ?? '');
}

// ── Mock data ────────────────────────────────────────────────

const MOCK_CLIENTS: Record<string, { businessName: string; contactEmail: string }> = {
  'client-apex-001': {
    businessName: 'Apex Ventures LLC',
    contactEmail: 'ops@apexventures.com',
  },
};

function buildSummary(clientId: string) {
  const client = MOCK_CLIENTS[clientId];
  if (!client) return null;

  const now = new Date();

  // ── Funding Status ──────────────────────────────────────────
  const fundingStatus = {
    totalFunded:      185000,
    activeCards:       4,
    nextPaymentDue:   '2026-04-12',
    nextPaymentAmount: 2750,
    utilizationPct:   42,
  };

  // ── APR Countdown ───────────────────────────────────────────
  const aprCountdowns = [
    {
      cardName:      'Chase Ink Business Unlimited',
      issuer:        'Chase',
      introAprExpiry: '2026-05-15',
      daysRemaining: Math.max(0, Math.ceil((new Date('2026-05-15').getTime() - now.getTime()) / 86400000)),
      currentApr:    '0.00%',
      regularApr:    '18.49%',
      creditLimit:   50000,
      balance:       21000,
      severity:      'warning' as const,  // < 60 days
    },
    {
      cardName:      'Amex Blue Business Plus',
      issuer:        'American Express',
      introAprExpiry: '2026-09-01',
      daysRemaining: Math.max(0, Math.ceil((new Date('2026-09-01').getTime() - now.getTime()) / 86400000)),
      currentApr:    '0.00%',
      regularApr:    '17.99%',
      creditLimit:   40000,
      balance:       15500,
      severity:      'ok' as const,       // > 60 days
    },
    {
      cardName:      'Capital One Spark Cash Plus',
      issuer:        'Capital One',
      introAprExpiry: '2026-04-20',
      daysRemaining: Math.max(0, Math.ceil((new Date('2026-04-20').getTime() - now.getTime()) / 86400000)),
      currentApr:    '0.00%',
      regularApr:    '22.49%',
      creditLimit:   55000,
      balance:       32000,
      severity:      'critical' as const, // < 14 days
    },
    {
      cardName:      'US Bank Business Triple Cash',
      issuer:        'US Bank',
      introAprExpiry: '2026-12-10',
      daysRemaining: Math.max(0, Math.ceil((new Date('2026-12-10').getTime() - now.getTime()) / 86400000)),
      currentApr:    '0.00%',
      regularApr:    '19.99%',
      creditLimit:   40000,
      balance:       8500,
      severity:      'ok' as const,
    },
  ];

  // ── Upcoming Payments (next 7 days) ─────────────────────────
  const upcomingPayments = [
    { id: 'pmt-1', cardName: 'Capital One Spark Cash Plus', dueDate: '2026-04-08', amount: 850,  status: 'due' },
    { id: 'pmt-2', cardName: 'Chase Ink Business Unlimited', dueDate: '2026-04-10', amount: 1200, status: 'due' },
    { id: 'pmt-3', cardName: 'Amex Blue Business Plus',      dueDate: '2026-04-12', amount: 700,  status: 'upcoming' },
  ];

  // ── Documents to Sign ───────────────────────────────────────
  const unsignedDocuments = [
    { id: 'doc-1', title: 'Annual Fee Disclosure — Chase Ink',          type: 'disclosure', createdAt: '2026-04-01', urgent: true },
    { id: 'doc-2', title: 'Balance Transfer Consent',                   type: 'consent',    createdAt: '2026-04-03', urgent: false },
    { id: 'doc-3', title: 'Repayment Acknowledgment — Q2 2026',         type: 'acknowledgment', createdAt: '2026-04-05', urgent: true },
    { id: 'doc-4', title: 'Auto-Pay Authorization — US Bank',           type: 'consent',    createdAt: '2026-04-06', urgent: false },
  ];

  return {
    clientId,
    businessName: client.businessName,
    contactEmail: client.contactEmail,
    fundingStatus,
    aprCountdowns,
    upcomingPayments,
    unsignedDocuments,
  };
}

// ── GET /:clientId/summary ──────────────────────────────────

portalRouter.get(
  '/:clientId/summary',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    logger.info(`[portal] GET /portal/${clientId}/summary`);

    const summary = buildSummary(clientId);

    if (!summary) {
      res.status(404).json({
        error: { code: 'CLIENT_NOT_FOUND', message: `No client found with ID "${clientId}".` },
      });
      return;
    }

    res.json({ data: summary });
  },
);
