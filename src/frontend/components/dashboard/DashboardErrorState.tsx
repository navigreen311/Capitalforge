'use client';
import type { AuthFetchError } from '@/hooks/useAuthFetch';

interface Props {
  error: AuthFetchError;
  onRetry?: () => void;
  className?: string;
  /** For the not_configured variant — links the action button directly */
  setupHref?: string;
}

export function DashboardErrorState({ error, onRetry, className, setupHref }: Props) {
  // Log raw error for debugging
  if (typeof window !== 'undefined') console.error('[DashboardErrorState]', error);

  const configs = {
    auth_required: { icon: '🔒', title: 'Sign in required', desc: 'Please sign in to view this data', action: 'Refresh' },
    server_error: { icon: '⚠️', title: 'Something went wrong', desc: error.message || 'An unexpected error occurred', action: 'Retry' },
    network_error: { icon: '📡', title: 'Connection issue', desc: 'Check your network connection', action: 'Retry' },
    not_configured: { icon: '🔌', title: 'Not yet configured', desc: 'This integration needs to be set up', action: 'Set up' },
  };

  const config = configs[error.type];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRetry?.();
    }
  };

  // For not_configured with a setupHref, render an anchor instead of a button
  const renderAction = () => {
    if (error.type === 'not_configured' && setupHref) {
      return (
        <a
          href={setupHref}
          className="mt-3 inline-block text-xs font-semibold text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 rounded"
          tabIndex={0}
        >
          {config.action}
        </a>
      );
    }

    if (onRetry) {
      return (
        <button
          type="button"
          onClick={onRetry}
          onKeyDown={handleKeyDown}
          className="mt-3 text-xs font-semibold text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 rounded"
          tabIndex={0}
        >
          {config.action}
        </button>
      );
    }

    return null;
  };

  return (
    <div className={`rounded-xl border border-surface-border bg-white p-6 text-center ${className ?? ''}`}>
      <div className="text-2xl mb-2" aria-hidden="true">{config.icon}</div>
      <p className="text-sm font-medium text-gray-700">{config.title}</p>
      <p className="text-xs text-gray-500 mt-1">{config.desc}</p>
      {renderAction()}
    </div>
  );
}
