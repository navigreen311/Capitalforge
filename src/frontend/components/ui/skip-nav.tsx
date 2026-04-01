'use client';

/**
 * SkipNav — Skip navigation link for keyboard users
 *
 * Renders a visually hidden link that becomes visible on focus, allowing
 * keyboard and screen reader users to bypass repeated navigation and jump
 * directly to the main content region.
 *
 * WCAG 2.1 Success Criteria satisfied:
 *  - 2.4.1 Bypass Blocks (Level A)
 *  - 2.4.3 Focus Order (Level A)
 *  - 2.4.7 Focus Visible (Level AA)
 *
 * Usage:
 *   Place <SkipNav /> as the very first element inside <body>.
 *   The target element must have id="main-content" (or pass a custom targetId).
 */

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkipNavProps {
  /**
   * The id of the landmark element to skip to.
   * Defaults to "main-content" — matches the existing <main id="main-content"> in layout.tsx.
   */
  targetId?: string;
  /** Link text. Override to provide translated string via t(). */
  label?: string;
  /** Additional CSS classes on the anchor */
  className?: string;
}

// ─── SkipNav ─────────────────────────────────────────────────────────────────

export function SkipNav({
  targetId = 'main-content',
  label    = 'Skip to main content',
  className = '',
}: SkipNavProps) {
  return (
    <a
      href={`#${targetId}`}
      className={[
        // Visually hidden until focused
        'sr-only focus:not-sr-only',
        // Positioning — floats above all other content when focused
        'focus:fixed focus:top-3 focus:left-3 focus:z-[9999]',
        // Visual style — high-contrast pill that is unmistakable
        'focus:inline-flex focus:items-center focus:gap-2',
        'focus:px-4 focus:py-2 focus:rounded-lg',
        'focus:bg-brand-navy focus:text-white focus:text-sm focus:font-semibold',
        'focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-gold focus:ring-offset-2',
        'transition-all duration-150',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </a>
  );
}

// ─── SkipNavGroup ─────────────────────────────────────────────────────────────

/**
 * Renders multiple skip links for applications with multiple landmarks
 * (e.g., skip to nav, skip to main, skip to footer).
 */
export interface SkipNavLink {
  targetId: string;
  label: string;
}

interface SkipNavGroupProps {
  links: SkipNavLink[];
  className?: string;
}

export function SkipNavGroup({ links, className = '' }: SkipNavGroupProps) {
  return (
    <nav aria-label="Skip navigation" className={className}>
      {links.map(({ targetId, label }) => (
        <SkipNav key={targetId} targetId={targetId} label={label} />
      ))}
    </nav>
  );
}

// ─── Default export convenience ──────────────────────────────────────────────

export default SkipNav;
