// ============================================================
// CapitalForge — Next.js 404 Not Found Page
// Branded navy/gold, helpful search suggestions, dashboard link.
// No 'use client' needed — this is a Server Component.
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page Not Found | CapitalForge',
};

// ── Quick-link suggestions ────────────────────────────────────

interface Suggestion {
  label: string;
  description: string;
  href: string;
  icon: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    label: 'Dashboard',
    description: 'Your funding operations overview',
    href: '/dashboard',
    icon: '▤',
  },
  {
    label: 'Applications',
    description: 'Review and track funding applications',
    href: '/applications',
    icon: '📋',
  },
  {
    label: 'Clients',
    description: 'Manage your client portfolio',
    href: '/clients',
    icon: '👥',
  },
  {
    label: 'Reports',
    description: 'Analytics and compliance reports',
    href: '/reports',
    icon: '📊',
  },
];

// ── Component ─────────────────────────────────────────────────

export default function NotFoundPage() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center
                 bg-brand-navy px-4 py-16 text-white"
      role="main"
      aria-label="Page not found"
    >
      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl bg-white/5 border border-white/10
                      px-8 py-10 shadow-2xl backdrop-blur-sm">

        {/* Logo lockup */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <span
            className="inline-flex h-14 w-14 items-center justify-center rounded-xl
                       bg-brand-gold text-brand-navy text-2xl font-black shadow-lg"
            aria-hidden="true"
          >
            CF
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-white/50">
            CapitalForge
          </span>
        </div>

        {/* 404 badge */}
        <div className="text-center">
          <p
            className="text-7xl font-black tracking-tight text-brand-gold/20"
            aria-hidden="true"
          >
            404
          </p>
          <h1 className="-mt-2 text-2xl font-bold tracking-tight text-white">
            Page Not Found
          </h1>
          <p className="mt-2 text-sm text-white/60 leading-relaxed">
            The page you requested does not exist or has been moved.
            Use the links below to find what you need.
          </p>
        </div>

        {/* Suggestions grid */}
        <nav aria-label="Suggested pages" className="mt-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/30">
            Where would you like to go?
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="flex items-start gap-3 rounded-lg border border-white/10
                             bg-white/5 px-4 py-3 transition-colors
                             hover:border-brand-gold/30 hover:bg-white/10
                             focus:outline-none focus:ring-2 focus:ring-brand-gold/50
                             focus:ring-offset-2 focus:ring-offset-brand-navy group"
                >
                  <span
                    className="mt-0.5 flex-shrink-0 text-base"
                    aria-hidden="true"
                  >
                    {s.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/90 group-hover:text-white
                                  transition-colors truncate">
                      {s.label}
                    </p>
                    <p className="text-xs text-white/40 truncate">{s.description}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Primary CTA */}
        <div className="mt-7">
          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center rounded-lg
                       bg-brand-gold px-6 py-3 text-sm font-semibold
                       text-brand-navy shadow-md transition-opacity hover:opacity-90
                       focus:outline-none focus:ring-2 focus:ring-brand-gold/50
                       focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-white/20">
        &copy; {new Date().getFullYear()} CapitalForge. All rights reserved.
      </p>
    </main>
  );
}
