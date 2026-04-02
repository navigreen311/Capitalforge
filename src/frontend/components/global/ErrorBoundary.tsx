'use client';

// ============================================================
// CapitalForge — Global Error Boundary
//
// Catches unhandled render errors and displays a friendly
// recovery page. Logs errors to console for debugging.
// ============================================================

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label shown on the error page (e.g. page or section name). */
  pageName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CapitalForge] Uncaught render error:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { pageName } = this.props;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F1D32] p-8 text-center shadow-xl">
          {/* Error icon */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h2 className="mb-1 text-xl font-semibold text-white">
            Something went wrong
          </h2>

          {pageName && (
            <p className="mb-2 text-sm text-slate-400">
              Error occurred in <span className="font-medium text-slate-300">{pageName}</span>
            </p>
          )}

          <p className="mb-6 text-sm text-slate-400">
            Your data is safe. Try again or return to the dashboard.
          </p>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-[#0F1D32]"
            >
              Retry
            </button>
            <a
              href="/"
              className="rounded-lg border border-white/10 px-5 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
