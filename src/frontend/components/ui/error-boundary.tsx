'use client';

// ============================================================
// CapitalForge — React Error Boundary
// Catches render-time errors per section, shows branded
// fallback UI with retry, reports to Sentry stub.
// Distinguishes network errors from render/logic errors.
// ============================================================

import React from 'react';

// ── Sentry stub ───────────────────────────────────────────────
// Replace with real `import * as Sentry from '@sentry/nextjs'`
// when Sentry DSN is configured in the environment.
const Sentry = {
  captureException: (error: Error, context?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Sentry stub] captureException', error.message, context);
    }
  },
};

// ── Error classification ──────────────────────────────────────

type ErrorKind = 'network' | 'render' | 'unknown';

function classifyError(error: Error): ErrorKind {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('failed to load') ||
    msg.includes('load chunk') ||
    name === 'networkerror' ||
    (error as unknown as { code?: string }).code === 'NETWORK_ERROR'
  ) {
    return 'network';
  }

  if (
    msg.includes('cannot read') ||
    msg.includes('is not a function') ||
    msg.includes('undefined') ||
    msg.includes('null') ||
    name === 'typeerror' ||
    name === 'referenceerror'
  ) {
    return 'render';
  }

  return 'unknown';
}

const ERROR_MESSAGES: Record<ErrorKind, { heading: string; body: string }> = {
  network: {
    heading: 'Connection Problem',
    body: 'We could not reach our servers. Please check your internet connection and try again.',
  },
  render: {
    heading: 'Display Error',
    body: 'Something went wrong rendering this section. Our team has been notified.',
  },
  unknown: {
    heading: 'Something Went Wrong',
    body: 'An unexpected error occurred. Our team has been notified and is looking into it.',
  },
};

// ── Props / State ─────────────────────────────────────────────

export interface ErrorBoundaryProps {
  /** Content to render when healthy */
  children: React.ReactNode;
  /** Optional custom fallback — receives error + retry handler */
  fallback?: (error: Error, retry: () => void) => React.ReactNode;
  /** Label shown in the fallback header (e.g. "Portfolio Section") */
  sectionLabel?: string;
  /** Passed to Sentry as extra context */
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

// ── Component ─────────────────────────────────────────────────

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const errorId = `eb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    Sentry.captureException(error, {
      componentStack: info.componentStack ?? undefined,
      componentName: this.props.componentName,
      sectionLabel: this.props.sectionLabel,
      errorId: this.state.errorId ?? undefined,
    });
  }

  handleRetry(): void {
    this.setState({ hasError: false, error: null, errorId: null });
  }

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    const { error, errorId } = this.state;

    // Custom fallback provided by parent
    if (this.props.fallback) {
      return this.props.fallback(error, this.handleRetry);
    }

    const kind = classifyError(error);
    const { heading, body } = ERROR_MESSAGES[kind];

    return (
      <ErrorFallback
        heading={heading}
        body={body}
        errorId={errorId}
        kind={kind}
        sectionLabel={this.props.sectionLabel}
        onRetry={this.handleRetry}
      />
    );
  }
}

// ── Fallback UI ───────────────────────────────────────────────

interface ErrorFallbackProps {
  heading: string;
  body: string;
  errorId: string | null;
  kind: ErrorKind;
  sectionLabel?: string;
  onRetry: () => void;
}

function ErrorFallback({
  heading,
  body,
  errorId,
  kind,
  sectionLabel,
  onRetry,
}: ErrorFallbackProps) {
  const ICON: Record<ErrorKind, string> = {
    network: '⚡',
    render: '⚠',
    unknown: '✕',
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center gap-4 rounded-xl
                 border border-red-100 bg-red-50 px-6 py-10 text-center"
    >
      {/* Icon */}
      <span
        aria-hidden="true"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full
                   bg-white text-red-500 text-xl shadow-sm border border-red-100"
      >
        {ICON[kind]}
      </span>

      {/* Heading */}
      <div className="space-y-1">
        {sectionLabel && (
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-navy/50">
            {sectionLabel}
          </p>
        )}
        <h3 className="text-base font-semibold text-gray-900">{heading}</h3>
        <p className="text-sm text-gray-500 max-w-sm">{body}</p>
      </div>

      {/* Retry button */}
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-5 py-2.5
                   text-sm font-semibold text-white shadow-sm transition-opacity
                   hover:opacity-90 focus:outline-none focus:ring-2
                   focus:ring-brand-gold focus:ring-offset-2"
      >
        Try Again
      </button>

      {/* Error reference */}
      {errorId && (
        <p className="text-xs text-gray-400">
          Reference: <code className="font-mono">{errorId}</code>
        </p>
      )}
    </div>
  );
}

// ── Convenience HOC ───────────────────────────────────────────

/**
 * Wraps a component in an ErrorBoundary.
 *
 * Usage:
 *   const SafePortfolio = withErrorBoundary(Portfolio, { sectionLabel: 'Portfolio' });
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  boundaryProps?: Omit<ErrorBoundaryProps, 'children'>,
): React.ComponentType<P> {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...boundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName ?? Component.name ?? 'Component'})`;
  return WrappedComponent;
}
