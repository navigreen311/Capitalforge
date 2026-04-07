'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Notification types ─────────────────────────────────────────────────────

export type NotificationType =
  | 'apr_expiry'
  | 'compliance_flag'
  | 'payment_due'
  | 'application_status'
  | 'system';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export interface Notification {
  id: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  href: string;
}

// ─── Icon / color config per type ───────────────────────────────────────────

const TYPE_CONFIG: Record<NotificationType, { icon: string; iconBg: string; iconColor: string }> = {
  apr_expiry:        { icon: '%',  iconBg: 'bg-red-500/15',    iconColor: 'text-red-400' },
  compliance_flag:   { icon: '!!', iconBg: 'bg-amber-500/15',  iconColor: 'text-amber-400' },
  payment_due:       { icon: '$',  iconBg: 'bg-blue-500/15',   iconColor: 'text-blue-400' },
  application_status:{ icon: 'AP', iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400' },
  system:            { icon: 'i',  iconBg: 'bg-white/10',      iconColor: 'text-gray-400' },
};

const SEVERITY_BADGE: Record<Severity, string> = {
  CRITICAL: 'text-red-400',
  HIGH:     'text-amber-400',
  MEDIUM:   'text-blue-400',
  INFO:     'text-gray-500',
};

// ─── Mock notification data ─────────────────────────────────────────────────

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n-1',
    type: 'apr_expiry',
    severity: 'CRITICAL',
    title: 'APR Expiry Warning',
    description: 'Apex Ventures promotional APR expires in 12 days. Review and action required.',
    timestamp: '2 hours ago',
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
    read: true,
    href: '/dashboard',
  },
];

// ─── NotificationInbox component ────────────────────────────────────────────

interface NotificationInboxProps {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationInbox({ open, onClose, onUnreadCountChange }: NotificationInboxProps) {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Report unread count changes
  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => window.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', handler);
    };
  }, [open, onClose]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const handleClick = useCallback(
    (id: string, href: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  return (
    <>
      {/* Backdrop overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      {/* Slide-over panel — full-screen on mobile */}
      <div
        ref={panelRef}
        className={`
          fixed top-0 right-0 z-50 h-full
          w-full sm:w-[380px] sm:max-w-full
          bg-[#0F1A2E] border-l border-white/10 shadow-2xl
          transform transition-transform duration-300 ease-in-out
          flex flex-col
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Notification inbox"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-white">Notifications</h2>
            {unreadCount > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full
                             bg-brand-gold text-brand-navy text-[10px] font-bold
                             flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-gray-400 hover:text-brand-gold transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg
                         text-gray-400 hover:text-white hover:bg-white/10
                         transition-colors"
              aria-label="Close notifications"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Notification list — last 10 */}
        <div className="flex-1 overflow-y-auto">
          {notifications.slice(0, 10).map((n) => {
            const cfg = TYPE_CONFIG[n.type];
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n.id, n.href)}
                className={`
                  w-full text-left px-5 py-4 border-b border-white/5
                  transition-colors duration-100 cursor-pointer
                  ${n.read
                    ? 'bg-transparent hover:bg-white/[0.03]'
                    : 'bg-white/[0.04] hover:bg-white/[0.07]'}
                `}
              >
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <span
                    className={`
                      flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                      text-[10px] font-bold ${cfg.iconBg} ${cfg.iconColor}
                    `}
                  >
                    {cfg.icon}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {/* Unread dot */}
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-gold flex-shrink-0" />
                      )}
                      <span
                        className={`text-sm font-medium truncate ${
                          n.read ? 'text-gray-400' : 'text-white'
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className={`flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE[n.severity]}`}>
                        {n.severity}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${n.read ? 'text-gray-600' : 'text-gray-400'}`}>
                      {n.description}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-1.5">{n.timestamp}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Hook: useNotificationInbox ─────────────────────────────────────────────

export function useNotificationInbox() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(5); // initial mock count

  const openInbox = useCallback(() => setOpen(true), []);
  const closeInbox = useCallback(() => setOpen(false), []);
  const handleUnreadCountChange = useCallback((count: number) => setUnreadCount(count), []);

  return { open, unreadCount, openInbox, closeInbox, handleUnreadCountChange };
}
