'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Notification types ──────────────────────────────────────────────────────

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

interface Notification {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  href: string;
}

const SEVERITY_CONFIG: Record<Severity, { icon: string; color: string; bg: string }> = {
  CRITICAL: { icon: '!!', color: 'text-red-400',    bg: 'bg-red-500/15' },
  HIGH:     { icon: '!',  color: 'text-amber-400',  bg: 'bg-amber-500/15' },
  MEDIUM:   { icon: 'M',  color: 'text-blue-400',   bg: 'bg-blue-500/15' },
  INFO:     { icon: 'i',  color: 'text-gray-400',   bg: 'bg-white/10' },
};

// ─── Mock notifications ──────────────────────────────────────────────────────

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'n-1',
    severity: 'CRITICAL',
    title: 'APR Expiry Warning',
    body: 'Apex Ventures promotional APR expires in 12 days. Review and action required.',
    timestamp: '2 hours ago',
    read: false,
    href: '/clients/cl-001',
  },
  {
    id: 'n-2',
    severity: 'CRITICAL',
    title: 'Compliance Flag',
    body: 'Sam Delgado flagged for missing KYC documentation. Immediate review needed.',
    timestamp: '3 hours ago',
    read: false,
    href: '/compliance',
  },
  {
    id: 'n-3',
    severity: 'HIGH',
    title: 'KYC Verification Failed',
    body: 'Robert Osei identity verification returned a mismatch. Manual review required.',
    timestamp: '5 hours ago',
    read: false,
    href: '/compliance',
  },
  {
    id: 'n-4',
    severity: 'HIGH',
    title: 'Partner Review Overdue',
    body: 'FastFund partner agreement review is 17 days overdue. Escalation pending.',
    timestamp: '6 hours ago',
    read: false,
    href: '/partners',
  },
  {
    id: 'n-5',
    severity: 'MEDIUM',
    title: 'Re-stack Ready',
    body: 'Meridian Holdings funding stack optimization is ready for review.',
    timestamp: '8 hours ago',
    read: false,
    href: '/clients/cl-002',
  },
  {
    id: 'n-6',
    severity: 'INFO',
    title: 'Rule Fired',
    body: 'Automation rule "High-Risk Merchant Block" triggered for 3 transactions.',
    timestamp: '1 day ago',
    read: true,
    href: '/workflows',
  },
  {
    id: 'n-7',
    severity: 'INFO',
    title: 'Deal Approved',
    body: 'Summit Capital $310K line of credit approved by deal committee.',
    timestamp: '1 day ago',
    read: true,
    href: '/deal-committee',
  },
  {
    id: 'n-8',
    severity: 'INFO',
    title: 'New Referral Received',
    body: 'Copper Ridge LLC referred by Atlas Financial Partners. Auto-assigned to queue.',
    timestamp: '2 days ago',
    read: true,
    href: '/referrals',
  },
];

// ─── NotificationCenter ─────────────────────────────────────────────────────

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.read).length;

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
    // Delay binding so the opening click doesn't immediately close
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

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className={`
          fixed top-0 right-0 z-50 h-full w-[380px] max-w-full
          bg-[#0F1A2E] border-l border-white/10 shadow-2xl
          transform transition-transform duration-300 ease-in-out
          flex flex-col
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Notification center"
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

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {notifications.map((n) => {
            const cfg = SEVERITY_CONFIG[n.severity];
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
                  {/* Severity icon */}
                  <span
                    className={`
                      flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                      text-[10px] font-bold ${cfg.bg} ${cfg.color}
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
                      <span className={`flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide ${cfg.color}`}>
                        {n.severity}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${n.read ? 'text-gray-600' : 'text-gray-400'}`}>
                      {n.body}
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

// ─── Hook: useNotificationCenter ─────────────────────────────────────────────

export function useNotificationCenter() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(5);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const clearUnread = useCallback(() => setUnreadCount(0), []);

  return { open, unreadCount, openDrawer, closeDrawer, clearUnread };
}
