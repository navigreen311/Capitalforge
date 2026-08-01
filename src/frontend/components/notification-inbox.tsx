'use client';

// ============================================================
// Notification inbox
//
// This held five literals and reported four of them unread, on every page of
// the application. See lib/notifications-view.ts for what they said.
//
// It now reads GET /api/notifications, which derives each item from a record
// that exists in the caller's tenant. Nothing records that a person has seen
// a notification, so there is no read state and no "Mark all read": the
// count is of things outstanding, and it goes down when the underlying
// record is dealt with.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  toNotificationRows,
  toOutstandingCount,
  sortForDisplay,
  relativeTime,
  type NotificationRow,
  type Severity,
} from '@/lib/notifications-view';

export type { NotificationRow, Severity };

const TYPE_ICON: Record<string, { icon: string; iconBg: string; iconColor: string }> = {
  apr_expiry:  { icon: '%',  iconBg: 'bg-red-500/15',    iconColor: 'text-red-400' },
  invoice_due: { icon: '$',  iconBg: 'bg-blue-500/15',   iconColor: 'text-blue-400' },
  complaint:   { icon: '!!', iconBg: 'bg-amber-500/15',  iconColor: 'text-amber-400' },
  regulatory:  { icon: 'R',  iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400' },
  consent:     { icon: 'C',  iconBg: 'bg-orange-500/15', iconColor: 'text-orange-400' },
  offboarding: { icon: 'O',  iconBg: 'bg-cyan-500/15',   iconColor: 'text-cyan-400' },
  unknown:     { icon: 'i',  iconBg: 'bg-white/10',      iconColor: 'text-gray-400' },
};

const SEVERITY_BADGE: Record<Severity, string> = {
  CRITICAL: 'text-red-400',
  HIGH:     'text-amber-400',
  MEDIUM:   'text-blue-400',
  INFO:     'text-gray-500',
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

interface NotificationInboxProps {
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number | null) => void;
}

export function NotificationInbox({ open, onClose, onCountChange }: NotificationInboxProps) {
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);

  // After mount: rendering a relative time on the server and again in the
  // browser produces two different strings and a hydration mismatch.
  useEffect(() => {
    setNow(new Date());
  }, [open]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/notifications?limit=50', { headers: authHeaders() });
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      if (!res.ok || body.success !== true) {
        setError(`Could not load what needs attention (HTTP ${res.status}).`);
        setRows(null);
        onCountChange?.(null);
        return;
      }
      const mapped = sortForDisplay(toNotificationRows(body.data));
      setRows(mapped);
      onCountChange?.(mapped.length);
    } catch {
      setError('Could not reach the server, so nothing is shown here.');
      setRows(null);
      onCountChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  // Loaded when the panel is opened. There is no polling and no push: this
  // is what was outstanding at the moment you opened it.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => window.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', handler);
    };
  }, [open, onClose]);

  const handleClick = useCallback(
    (href: string | null) => {
      if (href === null) return;
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

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
        aria-label="Notifications"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {/* Deliberately not "Needs attention": /compliance/decisions has a
                KPI card by that name, and this panel is in the DOM of every
                page, so the two collided. */}
            <h2 className="text-base font-semibold text-white">Open items</h2>
            {rows !== null && rows.length > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full
                             bg-brand-gold text-brand-navy text-[10px] font-bold
                             flex items-center justify-center">
                {rows.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close notifications"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="px-5 py-4 text-sm text-gray-500">Loading…</p>}

          {error !== null && (
            <p className="m-4 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          {!loading && error === null && rows !== null && rows.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-500">
              Nothing outstanding. No intro APR expiring inside 45 days, no unpaid invoice due,
              no open complaint, no unreviewed regulatory update, no revoked consent and no
              offboarding waiting on a deletion.
            </p>
          )}

          {rows?.map((n) => {
            const cfg = TYPE_ICON[n.type] ?? TYPE_ICON['unknown'];
            const when = now === null ? null : relativeTime(n.occurredAt, now);
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n.href)}
                disabled={n.href === null}
                className="w-full text-left px-5 py-4 border-b border-white/5
                           transition-colors duration-100
                           hover:bg-white/[0.05] disabled:cursor-default disabled:hover:bg-transparent"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                                text-[10px] font-bold ${cfg.iconBg} ${cfg.iconColor}`}
                  >
                    {cfg.icon}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{n.title}</span>
                      <span
                        className={`flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE[n.severity]}`}
                      >
                        {n.severity}
                      </span>
                    </div>
                    <p className="text-xs mt-1 leading-relaxed text-gray-400">{n.description}</p>
                    {/* No date on the record means no relative time, rather
                        than a plausible one. */}
                    <p className="text-[10px] text-gray-600 mt-1.5">{when ?? 'Undated'}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-white/10 px-5 py-3 flex-shrink-0">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            Derived from open records, not a message queue. Nothing marks one as read, because
            nothing stores that — an item leaves this list when the record behind it is dealt
            with.
          </p>
        </div>
      </div>
    </>
  );
}

// ── Hook ─────────────────────────────────────────────────────

/**
 * The count on the bell.
 *
 * Loaded from the API on mount rather than initialised to a constant. It was
 * `useState(4)` — "initial mock count (4 of 5 are unread)" — so every page
 * in the application opened with four notifications waiting.
 *
 * Null means it could not be read, and the badge is hidden: a zero on the
 * bell is the claim that nothing needs attention.
 */
export function useNotificationInbox() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/notifications/count', { headers: authHeaders() });
        const body = (await res.json()) as { success?: boolean; data?: unknown };
        if (cancelled) return;
        setCount(res.ok && body.success === true ? toOutstandingCount(body.data) : null);
      } catch {
        if (!cancelled) setCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openInbox = useCallback(() => setOpen(true), []);
  const closeInbox = useCallback(() => setOpen(false), []);
  const handleCountChange = useCallback((next: number | null) => setCount(next), []);

  return { open, count, openInbox, closeInbox, handleCountChange };
}
