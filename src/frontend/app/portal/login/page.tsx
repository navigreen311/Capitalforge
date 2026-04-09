// ============================================================
// /portal/login — Client Portal login page
// Separate from advisor login. Dark theme: navy #0A1628, gold #C9A84C
// ============================================================

'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

// ── Constants ───────────────────────────────────────────────

const MOCK_CLIENT_ID = 'client-apex-001';

// ── Page ────────────────────────────────────────────────────

export default function PortalLoginPage() {
  const router = useRouter();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [showPw, setShowPw]     = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Mock authentication — always succeeds with any non-empty credentials
    await new Promise((r) => setTimeout(r, 600));

    if (!email || !password) {
      setError('Please enter your email and password.');
      setLoading(false);
      return;
    }

    // Redirect to the mock client portal
    router.push(`/portal/${MOCK_CLIENT_ID}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/30 mb-4">
            <span className="text-2xl font-black text-[#C9A84C]">CF</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Client Portal</h1>
          <p className="text-sm text-gray-400 mt-1">CapitalForge — Funding Dashboard</p>
        </div>

        {/* Form card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">Sign in to your portal</h2>

          {/* Error banner */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="portal-email" className="block text-xs font-medium text-gray-400 mb-1.5">
                Email address
              </label>
              <input
                id="portal-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                placeholder="you@yourcompany.com"
                className="
                  w-full bg-gray-800 border border-gray-700 rounded-xl
                  px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600
                  focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40
                  transition-colors
                "
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="portal-password" className="block text-xs font-medium text-gray-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="portal-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  placeholder="••••••••"
                  className="
                    w-full bg-gray-800 border border-gray-700 rounded-xl
                    px-4 py-3 pr-12 text-sm text-gray-100 placeholder:text-gray-600
                    focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40
                    transition-colors
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs select-none"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="
                w-full py-3 rounded-xl
                bg-[#C9A84C] hover:bg-[#d4b35c] active:bg-[#b8933e]
                text-[#0A1628] font-semibold text-sm
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150
                flex items-center justify-center gap-2
              "
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-6 pt-5 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-600">
              Need access?{' '}
              <a href="mailto:support@capitalforge.io" className="text-[#C9A84C] hover:underline">
                Contact your advisor
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-700 mt-6">
          &copy; {new Date().getFullYear()} CapitalForge. All rights reserved.
        </p>
      </div>
    </div>
  );
}
