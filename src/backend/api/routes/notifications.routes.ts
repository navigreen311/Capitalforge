// ============================================================
// Notification Routes
// GET  /api/notifications       — list recent notifications
// GET  /api/notifications/count — unread count
// POST /api/notifications/:id/read — mark one as read
// POST /api/notifications/read-all — mark all as read
// ============================================================

import { Router, Request, Response } from 'express';

export const notificationsRouter = Router();

// ─── Types ──────────────────────────────────────────────────────────────────

type NotificationType =
  | 'apr_expiry'
  | 'compliance_flag'
  | 'payment_due'
  | 'application_status'
  | 'system';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

interface Notification {
  id: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  description: string;
  timestamp: string;
  createdAt: string;
  read: boolean;
  href: string;
}

// ─── In-memory mock store ───────────────────────────────────────────────────
// In production, these would come from the database (ledger events,
// compliance checks, scheduled tasks, etc.)

const notifications: Notification[] = [
  {
    id: 'n-1',
    type: 'apr_expiry',
    severity: 'CRITICAL',
    title: 'APR Expiry Warning',
    description: 'Apex Ventures promotional APR expires in 12 days. Review and action required.',
    timestamp: '2 hours ago',
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    read: false,
    href: '/clients/cl-001',
  },
  {
    id: 'n-2',
    type: 'compliance_flag',
    severity: 'CRITICAL',
    title: 'Compliance Flag — Missing KYC',
    description: 'Sam Delgado flagged for missing KYC documentation. Immediate review needed.',
    timestamp: '3 hours ago',
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    read: false,
    href: '/compliance',
  },
  {
    id: 'n-3',
    type: 'compliance_flag',
    severity: 'HIGH',
    title: 'KYC Verification Mismatch',
    description: 'Robert Osei identity verification returned a mismatch. Manual review required.',
    timestamp: '5 hours ago',
    createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    read: false,
    href: '/compliance',
  },
  {
    id: 'n-4',
    type: 'payment_due',
    severity: 'HIGH',
    title: 'Payment Due — Meridian Holdings',
    description: 'Meridian Holdings quarterly payment of $12,500 due in 3 days.',
    timestamp: '6 hours ago',
    createdAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    read: false,
    href: '/repayment',
  },
  {
    id: 'n-5',
    type: 'application_status',
    severity: 'MEDIUM',
    title: 'Application Approved',
    description: 'Brightline Corp SBA 7(a) $750K application has been approved by underwriting.',
    timestamp: '8 hours ago',
    createdAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
    read: false,
    href: '/applications/app-103',
  },
  {
    id: 'n-6',
    type: 'apr_expiry',
    severity: 'MEDIUM',
    title: 'APR Review Upcoming',
    description: 'Thornwood Capital intro APR period ends in 30 days. Schedule review.',
    timestamp: '10 hours ago',
    createdAt: new Date(Date.now() - 10 * 3600_000).toISOString(),
    read: true,
    href: '/clients/cl-004',
  },
  {
    id: 'n-7',
    type: 'application_status',
    severity: 'INFO',
    title: 'Application Submitted',
    description: 'Meridian Holdings Term $250K application submitted for committee review.',
    timestamp: '1 day ago',
    createdAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
    read: true,
    href: '/applications/app-102',
  },
  {
    id: 'n-8',
    type: 'compliance_flag',
    severity: 'INFO',
    title: 'Partner Review Completed',
    description: 'FastFund partner agreement review completed. No issues found.',
    timestamp: '1 day ago',
    createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
    read: true,
    href: '/partners',
  },
  {
    id: 'n-9',
    type: 'payment_due',
    severity: 'INFO',
    title: 'Payment Received',
    description: 'Apex Ventures monthly payment of $8,200 received and processed.',
    timestamp: '2 days ago',
    createdAt: new Date(Date.now() - 48 * 3600_000).toISOString(),
    read: true,
    href: '/repayment',
  },
  {
    id: 'n-10',
    type: 'system',
    severity: 'INFO',
    title: 'System Update',
    description: 'CapitalForge v2.4 deployed. New compliance dashboard features available.',
    timestamp: '2 days ago',
    createdAt: new Date(Date.now() - 50 * 3600_000).toISOString(),
    read: true,
    href: '/dashboard',
  },
];

// ─── GET /api/notifications ─────────────────────────────────────────────────

notificationsRouter.get('/', (_req: Request, res: Response) => {
  const limit = Math.min(Number(_req.query.limit) || 10, 50);
  const data = notifications.slice(0, limit);
  res.json({ success: true, data });
});

// ─── GET /api/notifications/count ───────────────────────────────────────────

notificationsRouter.get('/count', (_req: Request, res: Response) => {
  const unread = notifications.filter((n) => !n.read).length;
  const total = notifications.length;
  res.json({ success: true, data: { unread, total } });
});

// ─── POST /api/notifications/:id/read ───────────────────────────────────────

notificationsRouter.post('/:id/read', (req: Request, res: Response) => {
  const notif = notifications.find((n) => n.id === req.params.id);
  if (!notif) {
    res.status(404).json({ success: false, error: 'Notification not found' });
    return;
  }
  notif.read = true;
  res.json({ success: true, data: notif });
});

// ─── POST /api/notifications/read-all ───────────────────────────────────────

notificationsRouter.post('/read-all', (_req: Request, res: Response) => {
  notifications.forEach((n) => { n.read = true; });
  const unread = 0;
  res.json({ success: true, data: { unread, message: 'All notifications marked as read' } });
});
