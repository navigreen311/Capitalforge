'use client';

// ============================================================
// CapitalForge — Next.js Error Page
// Rendered by Next.js App Router when an unhandled error
// escapes the nearest error.tsx boundary or root layout.
// Navy / gold brand palette, retry button, status page link.
// ============================================================

import { useEffect } from 'react';

// ── Sentry stub ───────────────────────────────────────────────
const Sentry = {
  captureException: (error: Error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Sentry stub] captureException', error);
    }
  },
};

// ── Props (provided by Next.js App Router) ────────────────────

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// ── Component ─────────────────────────────────────────────────

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const errorCode = error.digest ?? 'UNKNOWN';

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center
                 bg-brand-navy px-4 py-16 text-white"
      role="main"
      aria-label="Application error"
    >
      {/* Card */}
      <div className="w-full max-w-md rounded-2xl bg-white/5 border border-white/10
                      px-8 py-10 shadow-2xl text-center backdrop-blur-sm">

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

        {/* Error indicator */}
        <div
          className="mb-2 inline-flex items-center gap-1.5 rounded-full border
                     border-red-400/30 bg-red-500/10 px-3 py-1 text-xs
                     font-semibold text-red-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden="true" />
          Application Error
        </div>

        {/* Heading */}
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
          Something Went Wrong
        </h1>
        <p className="mt-2 text-sm text-white/60 leading-relaxed">
          An unexpected error occurred. Our engineering team has been notified
          and is investigating the issue.
        </p>

        {/* Error code */}
        {errorCode !== 'UNKNOWN' && (
          <div className="mt-5 rounded-lg bg-black/20 px-4 py-2.5 text-xs font-mono text-white/40">
            Error code: <span className="text-brand-gold/70">{errorCode}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-lg bg-brand-gold px-6 py-3 text-sm font-semibold
                       text-brand-navy shadow-md transition-opacity hover:opacity-90
                       focus:outline-none focus:ring-2 focus:ring-brand-gold/50
                       focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            Try Again
          </button>

          <a
            href="/dashboard"
            className="w-full rounded-lg border border-white/15 px-6 py-3 text-sm
                       font-medium text-white/80 transition-colors hover:border-white/30
                       hover:text-white focus:outline-none focus:ring-2
                       focus:ring-white/30 focus:ring-offset-2
                       focus:ring-offset-brand-navy text-center"
          >
            Back to Dashboard
          </a>
        </div>

        {/* Status page link */}
        <p className="mt-6 text-xs text-white/30">
          Check the{' '}
          <a
            href="/status"
            className="text-brand-gold/60 underline underline-offset-2
                       hover:text-brand-gold transition-colors"
          >
            status page
          </a>{' '}
          for known incidents.
        </p>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-white/20">
        &copy; {new Date().getFullYear()} CapitalForge. All rights reserved.
      </p>
    </main>
  );
}
