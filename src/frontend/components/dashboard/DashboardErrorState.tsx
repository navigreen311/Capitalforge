'use client';
import type { AuthFetchError } from '@/hooks/useAuthFetch';

interface Props {
  error: AuthFetchError;
  onRetry?: () => void;
  className?: string;
  /** For the not_configured variant — links the action button directly */
  setupHref?: string;
  /**
   * Surface theme. Defaults to 'light' so existing call sites are unchanged;
   * the platform and portal pages render on a dark background.
   */
  variant?: 'light' | 'dark';
}

export function DashboardErrorState({ error, onRetry, className, setupHref, variant = 'light' }: Props) {
  // Log raw error for debugging
  if (typeof window !== 'undefined') console.error('[DashboardErrorState]', error);

  const configs = {
    auth_required: { icon: '🔒', title: 'Sign in required', desc: 'Please sign in to view this data', action: 'Refresh' },
    server_error: { icon: '⚠️', title: 'Something went wrong', desc: error.message || 'An unexpected error occurred', action: 'Retry' },
    network_error: { icon: '📡', title: 'Connection issue', desc: 'Check your network connection', action: 'Retry' },
    not_configured: { icon: '🔌', title: 'Not yet configured', desc: 'This integration needs to be set up', action: 'Set up' },
  };

  const config = configs[error.type];

  const theme = variant === 'dark'
    ? {
        panel: 'border-gray-700 bg-gray-900',
        title: 'text-gray-100',
        desc: 'text-gray-400',
        action: 'text-[#C9A84C] focus:ring-offset-gray-900',
      }
    : {
        panel: 'border-surface-border bg-white',
        title: 'text-gray-700',
        desc: 'text-gray-500',
        action: 'text-brand-navy focus:ring-offset-2',
      };

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
          className={`mt-3 inline-block text-xs font-semibold hover:underline focus:outline-none focus:ring-2 rounded ${theme.action}`}
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
          className={`mt-3 text-xs font-semibold hover:underline focus:outline-none focus:ring-2 rounded ${theme.action}`}
          tabIndex={0}
        >
          {config.action}
        </button>
      );
    }

    return null;
  };

  return (
    <div role="alert" className={`rounded-xl border p-6 text-center ${theme.panel} ${className ?? ''}`}>
      <div className="text-2xl mb-2" aria-hidden="true">{config.icon}</div>
      <p className={`text-sm font-medium ${theme.title}`}>{config.title}</p>
      <p className={`text-xs mt-1 ${theme.desc}`}>{config.desc}</p>
      {renderAction()}
    </div>
  );
}
