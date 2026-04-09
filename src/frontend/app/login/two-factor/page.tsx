// ============================================================
// /login/two-factor — 2FA verification challenge page
// Shown after password login when user has 2FA enabled.
// Navy (#0A1628) + gold (#C9A84C) branding
// ============================================================

'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function TwoFactorPage() {
  const router = useRouter();

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus the first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // ── Digit input handlers ──────────────────────────────────

  const handleDigitChange = (index: number, value: string) => {
    // Only allow single digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    if (error) setError(null);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace: clear current, then move to previous
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
    }
    // Left arrow
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    // Right arrow
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || '';
      }
      setDigits(newDigits);
      // Focus the next empty or last input
      const nextEmpty = newDigits.findIndex((d) => !d);
      inputRefs.current[nextEmpty >= 0 ? nextEmpty : 5]?.focus();
    }
  };

  const code = digits.join('');

  // ── Submit ────────────────────────────────────────────────

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    setError(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          (data as { error?: { message?: string } }).error?.message ?? 'Invalid verification code',
        );
      }

      // 2FA verified — proceed to dashboard
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      // Clear digits on error for retry
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    if (code.length === 6 && !loading) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#0A1628] px-4 py-12"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/30 mb-4">
            <svg className="w-8 h-8 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Two-Factor Verification</h1>
          <p className="text-sm text-gray-400 mt-1">Enter the 6-digit code from your authenticator app</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          {/* Error banner */}
          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* 6-digit code inputs */}
            <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={loading}
                  className={`
                    w-12 h-14 rounded-xl text-center text-xl font-mono font-semibold
                    bg-gray-800 border transition-colors
                    text-gray-100 placeholder:text-gray-700
                    focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${digit ? 'border-[#C9A84C]' : 'border-gray-700'}
                    ${error ? 'border-red-600 focus:ring-red-500/40' : ''}
                  `}
                />
              ))}
            </div>

            {/* Verify button */}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
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
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-6 pt-5 border-t border-gray-800 space-y-3">
            {/* Backup code link (placeholder) */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  // Placeholder — backup code flow not yet implemented
                  alert('Backup code verification is not yet available. Please use your authenticator app.');
                }}
                className="text-xs text-[#C9A84C] hover:text-[#e0bc5e] hover:underline transition-colors"
              >
                Use a backup code instead
              </button>
            </div>

            {/* Back to login */}
            <div className="text-center">
              <a
                href="/login"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Back to login
              </a>
            </div>
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
