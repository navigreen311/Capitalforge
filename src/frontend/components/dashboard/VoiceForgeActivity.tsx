'use client';

// ============================================================
// VoiceForgeActivity — Dashboard VoiceForge activity widget
//
// Displays call statistics, campaign progress, compliance flags,
// and QA score distribution. Shows a "Connect VoiceForge" prompt
// when the integration is not connected.
// ============================================================

import { useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  contacted: number;
  total: number;
  completion_pct: number;
  paused: boolean;
}

interface ComplianceFlag {
  advisor_name: string;
  call_time: string;
  flag_type: string;
  call_id: string;
}

interface VoiceForgeData {
  connected: boolean;
  today_calls: { completed: number; scheduled: number; missed: number };
  campaigns: Campaign[];
  compliance_flags: ComplianceFlag[];
  qa_scores: { average: number; distribution: number[] };
  last_updated: string;
}

interface ApiResponse {
  success: boolean;
  data?: VoiceForgeData;
  error?: { code: string; message: string };
}

// ── Helpers ──────────────────────────────────────────────────

function flagLabel(flagType: string): string {
  return flagType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function qaBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function flagBadgeColor(flagType: string): string {
  switch (flagType) {
    case 'disclosure_missing':
      return 'bg-red-100 text-red-700';
    case 'consent_not_recorded':
      return 'bg-amber-100 text-amber-700';
    case 'script_deviation':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

// ── Component ────────────────────────────────────────────────

export function VoiceForgeActivity() {
  const [data, setData] = useState<VoiceForgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pausedOverrides, setPausedOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch('/api/v1/dashboard/voiceforge');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        if (!cancelled) {
          if (json.success && json.data) {
            setData(json.data);
          } else {
            setError(json.error?.message ?? 'Failed to load VoiceForge data');
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

    fetchData();
    return () => { cancelled = true; };
  }, []);

  function togglePause(campaignId: string, currentlyPaused: boolean) {
    setPausedOverrides((prev) => ({
      ...prev,
      [campaignId]: !currentlyPaused,
    }));
  }

  function isCampaignPaused(campaign: Campaign): boolean {
    return pausedOverrides[campaign.id] ?? campaign.paused;
  }

  // ── Loading skeleton ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-200" />
            <div className="h-5 w-40 rounded bg-gray-200" />
          </div>
          <div className="flex gap-3">
            <div className="h-16 flex-1 rounded-xl bg-gray-100" />
            <div className="h-16 flex-1 rounded-xl bg-gray-100" />
            <div className="h-16 flex-1 rounded-xl bg-gray-100" />
          </div>
          <div className="h-24 rounded-xl bg-gray-100" />
          <div className="h-20 rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">Unable to load VoiceForge activity.</p>
      </div>
    );
  }

  // ── Not connected ────────────────────────────────────────────

  if (!data.connected) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
            <span className="text-sm font-bold text-indigo-700">VF</span>
          </div>
          <h3 className="text-base font-semibold text-gray-900">VoiceForge Activity</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-4">
            Connect VoiceForge to see call stats, campaigns, and QA scores.
          </p>
          <a
            href="/settings/integrations/voiceforge"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            Connect VoiceForge
          </a>
        </div>
      </div>
    );
  }

  // ── Connected — full widget ──────────────────────────────────

  const { today_calls, campaigns, compliance_flags, qa_scores } = data;
  const maxQa = Math.max(...qa_scores.distribution, 1);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
          <span className="text-sm font-bold text-indigo-700">VF</span>
        </div>
        <h3 className="text-base font-semibold text-gray-900">VoiceForge Activity</h3>
      </div>

      {/* Stat pills */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 rounded-xl bg-emerald-50 px-4 py-3">
          <p className="text-xs font-medium text-emerald-600 mb-1">Completed</p>
          <p className="text-xl font-bold text-emerald-700">{today_calls.completed}</p>
        </div>
        <div className="flex-1 rounded-xl bg-blue-50 px-4 py-3">
          <p className="text-xs font-medium text-blue-600 mb-1">Scheduled</p>
          <p className="text-xl font-bold text-blue-700">{today_calls.scheduled}</p>
        </div>
        <div className="flex-1 rounded-xl bg-red-50 px-4 py-3">
          <p className="text-xs font-medium text-red-600 mb-1">Missed</p>
          <p className="text-xl font-bold text-red-700">{today_calls.missed}</p>
        </div>
      </div>

      {/* Campaigns */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Campaigns</h4>
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const paused = isCampaignPaused(campaign);
            return (
              <div key={campaign.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {campaign.name}
                    </span>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                      {campaign.completion_pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className={`h-2 rounded-full transition-all ${paused ? 'bg-gray-400' : 'bg-indigo-500'}`}
                      style={{ width: `${campaign.completion_pct}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => togglePause(campaign.id, paused)}
                  className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    paused
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {paused ? 'Resume' : 'Pause'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compliance flags */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Compliance Flags</h4>
        <div className="space-y-2">
          {compliance_flags.slice(0, 3).map((flag) => (
            <div
              key={flag.call_id}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{flag.advisor_name}</p>
                  <p className="text-xs text-gray-500">{flag.call_time}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${flagBadgeColor(flag.flag_type)}`}
                >
                  {flagLabel(flag.flag_type)}
                </span>
              </div>
              <a
                href={`/voiceforge/calls/${flag.call_id}`}
                className="flex-shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Review Call
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* QA Scores */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700">QA Scores</h4>
          <span className="text-sm font-bold text-gray-900">Avg: {qa_scores.average}</span>
        </div>
        <div className="flex items-end gap-1.5" style={{ height: '48px' }}>
          {qa_scores.distribution.map((score, i) => (
            <div
              key={i}
              className={`flex-1 h-3 rounded-full ${qaBarColor(score)}`}
              style={{ height: `${Math.max((score / maxQa) * 48, 4)}px` }}
              title={`Score: ${score}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
