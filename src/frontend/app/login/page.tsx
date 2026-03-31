// ============================================================
// /login — CapitalForge login page
// Navy (#0A1628) + gold (#C9A84C) branding
// No sidebar/header wrapper — uses its own layout shell
// ============================================================

'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────

interface LoginForm {
  email:    string;
  password: string;
  remember: boolean;
}

// ── Page ─────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm]       = useState<LoginForm>({ email: '', password: '', remember: false });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [showPw, setShowPw]   = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // STUB — replace with real API call: POST /api/auth/login
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email, password: form.password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Invalid email or password');
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#0A1628] px-4 py-12"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Card */}
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/30 mb-4">
            <span className="text-2xl font-black text-[#C9A84C]">CF</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CapitalForge</h1>
          <p className="text-sm text-gray-400 mt-1">Corporate Funding Operating System</p>
        </div>

        {/* Form card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">Sign in to your account</h2>

          {/* Error banner */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-gray-400 mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="you@yourfirm.com"
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
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="text-xs font-medium text-gray-400">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-xs text-[#C9A84C] hover:text-[#e0bc5e] hover:underline transition-colors"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={handleChange}
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

            {/* Remember me */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  name="remember"
                  checked={form.remember}
                  onChange={handleChange}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 rounded border border-gray-600 bg-gray-800 peer-checked:bg-[#C9A84C] peer-checked:border-[#C9A84C] transition-colors flex items-center justify-center">
                  {form.remember && (
                    <svg className="w-2.5 h-2.5 text-[#0A1628]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-gray-400">Remember me for 30 days</span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !form.email || !form.password}
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
                  Signing in…
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
              <a href="mailto:onboarding@capitalforge.io" className="text-[#C9A84C] hover:underline">
                Contact your administrator
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-700 mt-6">
          &copy; {new Date().getFullYear()} CapitalForge. All rights reserved.{' '}
          <a href="/privacy" className="hover:text-gray-500">Privacy</a>
          {' · '}
          <a href="/terms" className="hover:text-gray-500">Terms</a>
        </p>
      </div>
    </div>
  );
}
