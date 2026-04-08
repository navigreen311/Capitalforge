'use client';

// ============================================================
// TCPAReminderModal — TCPA consent gate for payment reminders
//
// Dark-themed modal showing eligible (consented) and ineligible
// (no consent) clients before sending SMS reminders.
// Fetches eligibility from the backend, then POSTs to the
// SMS campaign endpoint on confirmation.
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface ReminderClient {
  client_id: string;
  client_name: string;
  amount_due: number;
  due_date: string;
  tcpa_sms_consent: boolean;
  reason?: string;
}

interface TCPAReminderModalProps {
  onClose: () => void;
  onSent: (message: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cf_access_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ── Component ───────────────────────────────────────────────────────────────

export function TCPAReminderModal({ onClose, onSent }: TCPAReminderModalProps) {
  const [eligible, setEligible] = useState<ReminderClient[]>([]);
  const [ineligible, setIneligible] = useState<ReminderClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Escape key ──────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── Fetch eligibility ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchEligibility() {
      try {
        const res = await fetch('/api/v1/dashboard/payment-reminder-eligible', {
          headers: getAuthHeaders(),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (!cancelled && json.success) {
          setEligible(json.data.eligible);
          setIneligible(json.data.ineligible);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[TCPAReminderModal] fetch failed:', err);
          setError('Failed to load reminder eligibility');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchEligibility();
    return () => { cancelled = true; };
  }, []);

  // ── Send reminders ─────────────────────────────────────────────
  const handleConfirmSend = useCallback(async () => {
    if (eligible.length === 0) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/voiceforge/sms-campaign', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          client_ids: eligible.map((c) => c.client_id),
          template: 'payment_reminder',
          channel: 'sms',
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.success) {
        const { sent_count, skipped_count } = json.data;
        const skippedNote = ineligible.length > 0
          ? ` (${ineligible.length} skipped \u2014 TCPA consent required)`
          : '';
        onSent(`Reminders sent to ${sent_count} client${sent_count !== 1 ? 's' : ''}${skippedNote}`);
        onClose();
      } else {
        throw new Error(json.error?.message ?? 'Campaign failed');
      }
    } catch (err) {
      console.error('[TCPAReminderModal] send failed:', err);
      setError('Failed to send reminders. Please try again.');
    } finally {
      setSending(false);
    }
  }, [eligible, ineligible, onClose, onSent]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="TCPA Reminder Consent Check"
    >
      <div className="bg-[#0A1628] rounded-xl shadow-2xl border border-white/10 w-full max-w-lg mx-4 overflow-hidden">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-semibold text-white">Send Payment Reminders</h3>
            <p className="text-sm text-gray-400 mt-0.5">TCPA consent verification</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Close modal"
            type="button"
          >
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-gray-400">Checking consent status...</span>
            </div>
          ) : error && eligible.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : (
            <>
              {/* ── Eligible Section ─────────────────────────── */}
              {eligible.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="text-sm font-semibold text-emerald-400">
                      Eligible ({eligible.length}) — Will receive SMS
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {eligible.map((client) => (
                      <li
                        key={client.client_id}
                        className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <svg className="h-4 w-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-white">{client.client_name}</p>
                            <p className="text-xs text-gray-400">Due {client.due_date}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-emerald-300">
                          {formatCurrency(client.amount_due)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Ineligible Section ───────────────────────── */}
              {ineligible.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <h4 className="text-sm font-semibold text-amber-400">
                      Ineligible ({ineligible.length}) — Cannot send
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {ineligible.map((client) => (
                      <li
                        key={client.client_id}
                        className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <svg className="h-4 w-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-white">{client.client_name}</p>
                            <p className="text-xs text-amber-300/80">
                              {client.reason ?? 'TCPA SMS consent not recorded'}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-amber-300/60">
                          {formatCurrency(client.amount_due)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Error after partial load ─────────────────── */}
              {error && (
                <p className="text-sm text-red-400 mb-3">{error}</p>
              )}
            </>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        {!loading && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-[#0A1628]">
            <button
              onClick={onClose}
              type="button"
              className="px-4 py-2 text-sm font-medium text-gray-300 rounded-lg border border-white/15
                         hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSend}
              disabled={sending || eligible.length === 0}
              type="button"
              className="px-5 py-2 text-sm font-semibold rounded-lg transition-colors
                         bg-[#C9A84C] text-[#0A1628] hover:bg-[#D4B65E]
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : `Confirm & Send (${eligible.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
