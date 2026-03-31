'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ─── Icon placeholders ───────────────────────────────────────────────────────
// Replace with a proper icon library (e.g. lucide-react) when available.
// Each icon is a styled two-letter monogram that renders consistently without
// any external dependency.

interface IconProps {
  label: string;
  className?: string;
}
function Icon({ label, className = '' }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded
                  select-none shrink-0 ${className}`}
    >
      {label}
    </span>
  );
}

// ─── Navigation structure ────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: string | number;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Dashboard',         href: '/',                   icon: 'DB' },
      { label: 'Clients',           href: '/clients',            icon: 'CL' },
      { label: 'Applications',      href: '/applications',       icon: 'AP' },
    ],
  },
  {
    title: 'Funding',
    items: [
      { label: 'Funding Rounds',    href: '/funding-rounds',     icon: 'FR' },
      { label: 'Credit Intelligence', href: '/credit-intelligence', icon: 'CI' },
    ],
  },
  {
    title: 'Compliance & Ops',
    items: [
      { label: 'Compliance',        href: '/compliance',         icon: 'CO' },
      { label: 'Documents',         href: '/documents',          icon: 'DC' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings',          href: '/settings',           icon: 'ST' },
    ],
  },
];

// ─── Sidebar component ───────────────────────────────────────────────────────

interface SidebarProps {
  /** Pass false to start collapsed; defaults to true */
  defaultExpanded?: boolean;
}

export function Sidebar({ defaultExpanded = true }: SidebarProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside
      data-expanded={expanded}
      className={`
        flex flex-col flex-shrink-0 bg-brand-navy text-white
        transition-[width] duration-200 ease-in-out overflow-hidden
        shadow-nav
        ${expanded ? 'w-sidebar' : 'w-sidebar-collapsed'}
      `}
    >
      {/* ── Logo / wordmark ───────────────────────────────── */}
      <div className="flex items-center h-header px-4 border-b border-white/10 flex-shrink-0">
        <span
          className={`
            flex items-center gap-2.5 overflow-hidden whitespace-nowrap
            ${expanded ? 'opacity-100' : 'opacity-0 w-0'}
            transition-opacity duration-150
          `}
          aria-label="CapitalForge"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-lg
                           bg-brand-gold text-brand-navy text-xs font-black tracking-tight">
            CF
          </span>
          <span className="text-base font-bold tracking-tight text-white">
            Capital<span className="text-brand-gold">Forge</span>
          </span>
        </span>

        {/* Collapsed state — icon only */}
        {!expanded && (
          <span className="flex items-center justify-center w-7 h-7 rounded-lg
                           bg-brand-gold text-brand-navy text-xs font-black mx-auto">
            CF
          </span>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1" aria-label="Main navigation">
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={sIdx} className={sIdx > 0 ? 'pt-3' : ''}>
            {/* Section heading — only when expanded */}
            {section.title && expanded && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest
                            text-white/40 select-none">
                {section.title}
              </p>
            )}

            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={!expanded ? item.label : undefined}
                  className={`
                    group flex items-center gap-3 px-2 py-2 rounded-lg text-sm
                    transition-all duration-150 relative
                    ${active
                      ? 'bg-white/10 text-white font-semibold'
                      : 'text-white/70 hover:bg-white/8 hover:text-white'}
                    ${!expanded ? 'justify-center' : ''}
                  `}
                  aria-current={active ? 'page' : undefined}
                >
                  {/* Active indicator */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2
                                     w-0.5 h-5 bg-brand-gold rounded-r-full" />
                  )}

                  <Icon
                    label={item.icon}
                    className={`
                      ${active
                        ? 'bg-brand-gold/20 text-brand-gold'
                        : 'bg-white/10 text-white/70 group-hover:bg-white/15 group-hover:text-white'}
                    `}
                  />

                  {expanded && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}

                  {expanded && item.badge !== undefined && (
                    <span className="ml-auto flex-shrink-0 min-w-[1.25rem] h-5 px-1.5
                                     rounded-full bg-brand-gold text-brand-navy
                                     text-[10px] font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Collapse toggle ───────────────────────────────── */}
      <div className="border-t border-white/10 p-2 flex-shrink-0">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-2 px-2 py-2
                     rounded-lg text-white/50 hover:text-white hover:bg-white/8
                     transition-all duration-150 text-xs font-medium"
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <span className="text-base leading-none">{expanded ? '«' : '»'}</span>
          {expanded && <span>Collapse</span>}
        </button>
      </div>

      {/* ── User identity strip ───────────────────────────── */}
      <div className={`
        flex items-center gap-3 px-3 py-3 border-t border-white/10
        bg-white/5 flex-shrink-0
        ${!expanded ? 'justify-center' : ''}
      `}>
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-gold/20
                         text-brand-gold text-xs font-bold flex items-center justify-center">
          U
        </span>
        {expanded && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Advisor</p>
            <p className="text-xs text-white/50 truncate">capitalforge.com</p>
          </div>
        )}
      </div>
    </aside>
  );
}
