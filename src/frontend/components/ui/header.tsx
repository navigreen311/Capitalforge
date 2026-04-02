'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCommandPalette, CommandPalette } from '@/components/global/CommandPalette';
import { useNotificationCenter, NotificationCenter } from '@/components/global/NotificationCenter';

// ─── Breadcrumb helper ───────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '':                   'Dashboard',
  'clients':            'Clients',
  'applications':       'Applications',
  'funding-rounds':     'Funding Rounds',
  'credit-intelligence':'Credit Intelligence',
  'credit-builder':     'Business Credit Builder',
  'compliance':         'Compliance',
  'documents':          'Documents',
  'settings':           'Settings',
};

/** Parent routes that have dynamic child segments (e.g. /clients/:id) */
const DYNAMIC_ROUTE_PARENTS = new Set(['clients', 'applications', 'funding-rounds']);

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // At root or /dashboard — show single "Dashboard" breadcrumb
  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'dashboard')) {
    return (
      <nav aria-label="Breadcrumb">
        <span className="text-sm font-semibold text-gray-900">Dashboard</span>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 transition-colors">
        Dashboard
      </Link>
      {segments.map((seg, idx) => {
        const href = '/' + segments.slice(0, idx + 1).join('/');
        const parentSeg = idx > 0 ? segments[idx - 1] : null;
        const isDynamicChild = parentSeg !== null && DYNAMIC_ROUTE_PARENTS.has(parentSeg) && !(seg in ROUTE_LABELS) && seg !== 'new';

        // Context-aware label for "new" segment
        let label: string;
        if (seg === 'new') {
          const contextLabels: Record<string, string> = {
            applications: 'New Application',
            clients: 'New Client',
            'funding-rounds': 'New Round',
          };
          label = (parentSeg && contextLabels[parentSeg]) || 'New';
        } else if (isDynamicChild) {
          const dynamicLabels: Record<string, string> = {
            applications: 'Application Details',
            'funding-rounds': 'Round Details',
          };
          label = (parentSeg && dynamicLabels[parentSeg]) || 'Client Details';
        } else {
          label = ROUTE_LABELS[seg] ?? seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        }
        const isLast = idx === segments.length - 1;
        return (
          <React.Fragment key={href}>
            <span className="text-gray-300" aria-hidden="true">/</span>
            {isLast ? (
              <span className="font-semibold text-gray-900" aria-current="page">{label}</span>
            ) : (
              <Link href={href} className="text-gray-400 hover:text-gray-700 transition-colors">
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ─── Notification bell ──────────────────────────────────────────────────────

function NotificationBell({ unreadCount, onClick }: { unreadCount: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-9 h-9 flex items-center justify-center rounded-lg
                 text-gray-500 hover:text-gray-900 hover:bg-surface-overlay
                 transition-all duration-150"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
    >
      <span aria-hidden="true" className="text-base">🔔</span>
      {/* Unread badge */}
      {unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1
                     rounded-full bg-red-500 text-white text-[9px] font-bold
                     flex items-center justify-center ring-2 ring-white"
          aria-hidden="true"
        >
          {unreadCount}
        </span>
      )}
    </button>
  );
}

// ─── User menu placeholder ────────────────────────────────────────────────────

function UserMenu() {
  return (
    <div className="flex items-center gap-2.5 pl-3 border-l border-surface-border">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full bg-brand-navy flex items-center justify-center
                   text-white text-xs font-bold cursor-pointer
                   ring-2 ring-transparent hover:ring-brand-gold transition-all duration-150"
        role="button"
        tabIndex={0}
        aria-label="User menu"
        aria-haspopup="true"
      >
        AD
      </div>
      {/* Name + role */}
      <div className="hidden md:block">
        <p className="text-sm font-medium text-gray-900 leading-none">Advisor</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-none">Admin</p>
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function Header() {
  const { open: cmdOpen, openPalette, closePalette } = useCommandPalette();
  const { open: notifOpen, unreadCount, openDrawer, closeDrawer, clearUnread } = useNotificationCenter();

  return (
    <>
      <header
        className="flex-shrink-0 h-header bg-white border-b border-surface-border
                   flex items-center justify-between px-6 gap-4 shadow-header z-10"
        role="banner"
      >
        {/* Left — breadcrumbs */}
        <div className="flex-1 min-w-0">
          <Breadcrumbs />
        </div>

        {/* Right — actions + user */}
        <div className="flex items-center gap-2">
          {/* Global search trigger */}
          <button
            onClick={openPalette}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg
                       border border-surface-border bg-surface text-sm text-gray-400
                       hover:border-gray-300 hover:text-gray-600 transition-all duration-150
                       min-w-[160px]"
            aria-label="Search (⌘K)"
          >
            <svg
              aria-hidden="true"
              className="flex-shrink-0 w-3.5 h-3.5"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Search...</span>
            <span className="ml-auto text-xs border border-surface-border rounded px-1 py-0.5">
              ⌘K
            </span>
          </button>

          <NotificationBell unreadCount={unreadCount} onClick={openDrawer} />
          <UserMenu />
        </div>
      </header>

      {/* Global overlays */}
      <CommandPalette open={cmdOpen} onClose={closePalette} />
      <NotificationCenter open={notifOpen} onClose={() => { clearUnread(); closeDrawer(); }} />
    </>
  );
}
