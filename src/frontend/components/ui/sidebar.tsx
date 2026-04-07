'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CollapsibleSection } from './collapsible-section';
import { useNavBadges } from '@/components/dashboard/NavBadgeProvider';

// ─── Icon placeholders ───────────────────────────────────────────────────────
// Two-letter monograms render without an icon library dependency.

interface IconProps {
  label: string;
  className?: string;
}
function Icon({ label, className = '' }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center w-5 h-5 text-[9px] font-bold rounded
                  select-none shrink-0 ${className}`}
    >
      {label}
    </span>
  );
}

// ─── Navigation structure ─────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: string | number;
  badgeColor?: string;
}

interface NavPillar {
  title: string;
  defaultOpen: boolean;
  items: NavItem[];
}

const NAV_PILLARS: NavPillar[] = [
  {
    title: 'Core Operations',
    defaultOpen: true,
    items: [
      { label: 'Dashboard',        href: '/dashboard',      icon: 'DB' },
      { label: 'Clients',          href: '/clients',        icon: 'CL' },
      { label: 'Applications',     href: '/applications',   icon: 'AP' },
      { label: 'Funding Rounds',   href: '/funding-rounds', icon: 'FR' },
      { label: 'Optimizer',        href: '/optimizer',      icon: 'OP' },
      { label: 'Declines',         href: '/declines',       icon: 'DC' },
      { label: 'Credit Builder',   href: '/credit-builder', icon: 'CB' },
    ],
  },
  {
    title: 'Financial Control',
    defaultOpen: false,
    items: [
      { label: 'Repayment',        href: '/repayment',        icon: 'RP' },
      { label: 'Spend Governance',  href: '/spend-governance', icon: 'SG' },
      { label: 'Rewards',          href: '/rewards',          icon: 'RW' },
      { label: 'Card Benefits',    href: '/card-benefits',    icon: 'CA' },
      { label: 'Statements',       href: '/statements',       icon: 'ST' },
      { label: 'Billing',          href: '/billing',          icon: 'BI' },
      { label: 'Tax',              href: '/tax',              icon: 'TX' },
      { label: 'Simulator',        href: '/simulator',        icon: 'SI' },
      { label: 'Hardship',         href: '/hardship',         icon: 'HS' },
    ],
  },
  {
    title: 'Compliance',
    defaultOpen: false,
    items: [
      { label: 'Overview',         href: '/compliance',       icon: 'CO' },
      { label: 'Documents',        href: '/documents',        icon: 'DO' },
      { label: 'Disclosures',      href: '/disclosures',      icon: 'DI' },
      { label: 'Contracts',        href: '/contracts',        icon: 'CT' },
      { label: 'Complaints',       href: '/complaints',       icon: 'CM' },
      { label: 'Regulatory',       href: '/regulatory',       icon: 'RG' },
      { label: 'Comm Compliance',  href: '/comm-compliance',  icon: 'CC' },
      { label: 'Training',         href: '/training',         icon: 'TR' },
      { label: 'Decisions',        href: '/decisions',        icon: 'DS' },
    ],
  },
  {
    title: 'Platform',
    defaultOpen: false,
    items: [
      { label: 'CRM',              href: '/crm',              icon: 'CR' },
      { label: 'Admin',            href: '/platform',         icon: 'AD' },
      { label: 'Issuers',          href: '/issuers',          icon: 'IS' },
      { label: 'Referrals',        href: '/referrals',        icon: 'RF' },
      { label: 'Workflows',        href: '/workflows',        icon: 'WF' },
      { label: 'Settings',         href: '/settings',         icon: 'SE' },
      { label: 'Reports',          href: '/reports',          icon: 'RE' },
      { label: 'Portfolio',        href: '/portfolio',        icon: 'PF' },
      { label: 'Offboarding',      href: '/offboarding',      icon: 'OB' },
      { label: 'Data Lineage',     href: '/data-lineage',     icon: 'DL' },
    ],
  },
];

// ─── NavLink ──────────────────────────────────────────────────────────────────

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  expanded: boolean;
}

function NavLink({ item, active, expanded }: NavLinkProps) {
  return (
    <Link
      href={item.href}
      title={!expanded ? item.label : undefined}
      className={`
        group flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm
        transition-all duration-150 relative
        ${active
          ? 'bg-white/10 text-white font-semibold'
          : 'text-white/65 hover:bg-white/8 hover:text-white'}
        ${!expanded ? 'justify-center' : ''}
      `}
      aria-current={active ? 'page' : undefined}
    >
      {/* Active left-edge indicator */}
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2
                     w-0.5 h-5 bg-brand-gold rounded-r-full"
        />
      )}

      <Icon
        label={item.icon}
        className={`
          ${active
            ? 'bg-brand-gold/20 text-brand-gold'
            : 'bg-white/10 text-white/65 group-hover:bg-white/15 group-hover:text-white'}
        `}
      />

      {expanded && (
        <span className="flex-1 truncate">{item.label}</span>
      )}

      {expanded && item.badge !== undefined && item.badge !== 0 && (
        <span
          className={`ml-auto flex-shrink-0 min-w-[1.25rem] h-5 px-1.5
                     rounded-full text-[10px] font-bold flex items-center justify-center
                     animate-badge-pop-in ${item.badgeColor || 'bg-brand-gold text-brand-navy'}`}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  /** Pass false to start collapsed; defaults to true */
  defaultExpanded?: boolean;
}

// ── Badge color map ─────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<string, { key: 'dashboardBadge' | 'applicationsBadge' | 'fundingRoundsBadge'; color: string }> = {
  '/dashboard':     { key: 'dashboardBadge',     color: 'bg-red-500 text-white' },
  '/applications':  { key: 'applicationsBadge',  color: 'bg-amber-500 text-white' },
  '/funding-rounds':{ key: 'fundingRoundsBadge', color: 'bg-teal-500 text-white' },
};

export function Sidebar({ defaultExpanded = true }: SidebarProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const badges = useNavBadges();

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Handle responsive: auto-collapse on tablet, hide on mobile
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 768) {
        setExpanded(false);
      } else if (w < 1024) {
        setExpanded(false); // icon-only on tablet
      } else {
        setExpanded(defaultExpanded);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [defaultExpanded]);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileOpen]);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' || pathname === '/' : pathname.startsWith(href);

  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), []);

  const sidebarContent = (isMobile: boolean) => (
    <>
      {/* ── Logo / wordmark ──────────────────────────────────── */}
      <div className="flex items-center h-header px-4 border-b border-white/10 flex-shrink-0">
        {(expanded || isMobile) ? (
          <span
            className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap flex-1"
            aria-label="CapitalForge"
          >
            <span
              className="flex items-center justify-center w-7 h-7 rounded-lg
                         bg-brand-gold text-brand-navy text-xs font-black tracking-tight"
            >
              CF
            </span>
            <span className="text-base font-bold tracking-tight text-white">
              Capital<span className="text-brand-gold">Forge</span>
            </span>
          </span>
        ) : (
          <span
            className="flex items-center justify-center w-7 h-7 rounded-lg
                       bg-brand-gold text-brand-navy text-xs font-black mx-auto"
            aria-label="CapitalForge"
          >
            CF
          </span>
        )}

        {/* Close button on mobile overlay */}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-2 w-8 h-8 flex items-center justify-center rounded-lg
                       text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <nav
        className="flex-1 overflow-y-auto py-3 px-2 space-y-3"
        aria-label="Main navigation"
      >
        {NAV_PILLARS.map((pillar) => {
          const containsActive = pillar.items.some((i) => isActive(i.href));

          return (
            <CollapsibleSection
              key={pillar.title}
              title={pillar.title}
              defaultOpen={pillar.defaultOpen || containsActive}
              sidebarExpanded={expanded || isMobile}
            >
              {pillar.items.map((item) => {
                const cfg = BADGE_CONFIG[item.href];
                const enriched = cfg
                  ? { ...item, badge: badges[cfg.key], badgeColor: cfg.color }
                  : item;
                return (
                  <NavLink
                    key={item.href}
                    item={enriched}
                    active={isActive(item.href)}
                    expanded={expanded || isMobile}
                  />
                );
              })}
            </CollapsibleSection>
          );
        })}
      </nav>

      {/* ── Collapse toggle (not shown on mobile overlay) ───── */}
      {!isMobile && (
        <div className="border-t border-white/10 p-2 flex-shrink-0 hidden md:block">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="
              w-full flex items-center justify-center gap-2 px-2 py-2
              rounded-lg text-white/50 hover:text-white hover:bg-white/8
              transition-all duration-150 text-xs font-medium
            "
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className="text-base leading-none">{expanded ? '\u00AB' : '\u00BB'}</span>
            {expanded && <span>Collapse</span>}
          </button>
        </div>
      )}

      {/* ── User identity strip ───────────────────────────────── */}
      <div
        className={`
          flex items-center gap-3 px-3 py-3 border-t border-white/10
          bg-white/5 flex-shrink-0
          ${!(expanded || isMobile) ? 'justify-center' : ''}
        `}
      >
        <span
          className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-gold/20
                     text-brand-gold text-xs font-bold flex items-center justify-center"
        >
          U
        </span>
        {(expanded || isMobile) && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Advisor</p>
            <p className="text-xs text-white/50 truncate">capitalforge.com</p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Hamburger button — visible only on mobile (< 768px) */}
      <button
        onClick={toggleMobile}
        className="fixed top-3 left-3 z-50 w-10 h-10 flex items-center justify-center
                   rounded-lg bg-brand-navy text-white shadow-lg
                   md:hidden"
        aria-label="Open navigation menu"
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed top-0 left-0 z-50 h-full w-72 bg-brand-navy text-white
                       shadow-2xl flex flex-col md:hidden animate-slide-in"
          >
            {sidebarContent(true)}
          </aside>
        </>
      )}

      {/* Desktop / Tablet sidebar — hidden on mobile (< 768px) */}
      <aside
        data-expanded={expanded}
        className={`
          hidden md:flex flex-col flex-shrink-0 bg-brand-navy text-white
          transition-[width] duration-200 ease-in-out overflow-hidden
          shadow-nav
          ${expanded ? 'w-sidebar' : 'w-sidebar-collapsed'}
        `}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
