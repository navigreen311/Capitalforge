'use client';

// ============================================================
// DealCommitteeQueue — Pending deal committee reviews with SLA
//
// Shows a table of deals awaiting committee decision. Displays
// reviewer avatar stack, consensus status, and SLA countdown.
// Only renders for admin / committee_member roles.
// ============================================================

import { useEffect, useState } from 'react';
import { SectionCard } from '../ui/card';

// ── Types ───────────────────────────────────────────────────────────────────

interface Reviewer {
  name: string;
  responded: boolean;
}

interface CommitteeDeal {
  id: string;
  client_name: string;
  client_id: string;
  deal_amount: number;
  risk_tier: string;
  submitted_date: string;
  reviewers: Reviewer[];
  consensus: string;
  sla_hours_remaining: number;
  application_id: string | null;
}

interface CommitteeQueueData {
  queue_count: number;
  deals: CommitteeDeal[];
  last_updated: string;
}

interface ApiResponse {
  success: boolean;
  data?: CommitteeQueueData;
  error?: { code: string; message: string };
}

interface CfUser {
  role?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['admin', 'committee_member'];

function getUserRole(): string | null {
  try {
    const raw = localStorage.getItem('cf_user');
    if (!raw) return null;
    const user: CfUser = JSON.parse(raw);
    return user.role ?? null;
  } catch {
    return null;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatSla(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

function slaColorClass(hours: number): string {
  if (hours < 2) return 'text-red-600 bg-red-50';
  if (hours < 6) return 'text-amber-600 bg-amber-50';
  return 'text-emerald-600 bg-emerald-50';
}

function riskBadgeClass(tier: string): string {
  const t = tier.toLowerCase();
  if (t === 'critical') return 'bg-red-100 text-red-700 border-red-200';
  if (t === 'high') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Post event helper ───────────────────────────────────────────────────────

async function postEvent(eventType: string, payload: Record<string, unknown>) {
  try {
    await fetch('/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        payload: { ...payload, timestamp: new Date().toISOString() },
      }),
    });
  } catch {
    // fire-and-forget
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export function DealCommitteeQueue() {
  const [data, setData] = useState<CommitteeQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  // ── Role gate ─────────────────────────────────────────────────
  useEffect(() => {
    const role = getUserRole();
    setAuthorized(role !== null && ALLOWED_ROLES.includes(role));
  }, []);

  // ── Data fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    async function fetchQueue() {
      try {
        const res = await fetch('/api/v1/dashboard/committee-queue');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        if (!cancelled) {
          if (json.success && json.data) {
            setData(json.data);
          } else {
            setError(json.error?.message ?? 'Failed to load committee queue');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchQueue();
    return () => { cancelled = true; };
  }, [authorized]);

  // ── Role not allowed — render nothing ─────────────────────────
  if (!authorized) return null;

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <SectionCard title="Deal Committee Queue">
        <div className="animate-pulse space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-200" />
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  // ── Error ─────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <SectionCard title="Deal Committee Queue">
        <p className="px-4 py-6 text-sm text-gray-500">
          Unable to load committee queue.
        </p>
      </SectionCard>
    );
  }

  // ── Empty state ───────────────────────────────────────────────
  if (data.deals.length === 0) {
    return (
      <SectionCard title="Deal Committee Queue">
        <p className="px-4 py-6 text-sm text-gray-500">
          No deals awaiting committee review
        </p>
      </SectionCard>
    );
  }

  // ── Handle review action ──────────────────────────────────────
  function handleReview(deal: CommitteeDeal) {
    postEvent('deal_committee.decided', {
      deal_id: deal.id,
      application_id: deal.application_id,
      client_id: deal.client_id,
    });
    window.location.href = `/applications/${deal.application_id}/committee`;
  }

  // ── Table ─────────────────────────────────────────────────────
  return (
    <SectionCard title="Deal Committee Queue" flushBody>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Deal Amount</th>
              <th className="px-4 py-3">Risk Tier</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Reviewers</th>
              <th className="px-4 py-3">Consensus</th>
              <th className="px-4 py-3">SLA Remaining</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.deals.map((deal) => (
              <tr key={deal.id} className="hover:bg-gray-50/50 transition-colors">
                {/* Client name */}
                <td className="px-4 py-3 font-medium text-gray-900">
                  {deal.client_name}
                </td>

                {/* Deal amount */}
                <td className="px-4 py-3 text-gray-700">
                  {formatCurrency(deal.deal_amount)}
                </td>

                {/* Risk tier badge */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${riskBadgeClass(deal.risk_tier)}`}
                  >
                    {deal.risk_tier}
                  </span>
                </td>

                {/* Submitted date */}
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(deal.submitted_date)}
                </td>

                {/* Reviewer avatar stack */}
                <td className="px-4 py-3">
                  <div className="flex -space-x-1">
                    {deal.reviewers.map((reviewer, idx) => (
                      <div
                        key={idx}
                        className="relative flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold border-2 border-white"
                        title={`${reviewer.name}${reviewer.responded ? ' (responded)' : ''}`}
                      >
                        {getInitials(reviewer.name)}
                        {reviewer.responded && (
                          <svg
                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-emerald-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    ))}
                    {deal.reviewers.length === 0 && (
                      <span className="text-xs text-gray-400">--</span>
                    )}
                  </div>
                </td>

                {/* Consensus */}
                <td className="px-4 py-3 text-gray-600 capitalize text-xs">
                  {deal.consensus}
                </td>

                {/* SLA remaining */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${slaColorClass(deal.sla_hours_remaining)}`}
                  >
                    {formatSla(deal.sla_hours_remaining)}
                  </span>
                </td>

                {/* Review button */}
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleReview(deal)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                  >
                    Review Deal
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
