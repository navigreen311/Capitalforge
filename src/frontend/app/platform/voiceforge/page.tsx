'use client';

// ============================================================
// /platform/voiceforge — VoiceForge Dashboard
// Iframe placeholder + connection status indicator.
// ============================================================

import { useState, useEffect } from 'react';

const VOICEFORGE_URL =
  process.env.NEXT_PUBLIC_VOICEFORGE_URL ?? 'http://localhost:3001';

type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

export default function VoiceForgePage() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      try {
        const res = await fetch(`${VOICEFORGE_URL}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5_000),
        });
        if (!cancelled) setStatus(res.ok ? 'connected' : 'disconnected');
      } catch {
        if (!cancelled) setStatus('disconnected');
      }
    }

    checkConnection();
    const interval = setInterval(checkConnection, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-gray-900">VoiceForge Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Telephony, call compliance, and outreach campaign management
          </p>
        </div>

        {/* Connection status pill */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              status === 'connected'
                ? 'bg-emerald-500'
                : status === 'disconnected'
                  ? 'bg-red-500'
                  : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="text-sm font-medium text-gray-600 capitalize">
            {status === 'checking' ? 'Checking...' : status}
          </span>
        </div>
      </div>

      {/* ── Iframe / placeholder ───────────────────────────────── */}
      <div className="flex-1 relative bg-gray-50">
        {status === 'connected' ? (
          <iframe
            src={VOICEFORGE_URL}
            title="VoiceForge"
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-navy/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-black text-brand-navy">VF</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                {status === 'checking'
                  ? 'Connecting to VoiceForge...'
                  : 'VoiceForge Unavailable'}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                {status === 'checking'
                  ? 'Attempting to reach the VoiceForge service.'
                  : `Unable to reach VoiceForge at ${VOICEFORGE_URL}. Ensure the service is running and accessible.`}
              </p>
              {status === 'disconnected' && (
                <button
                  onClick={() => setStatus('checking')}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors"
                >
                  Retry Connection
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
