'use client';

// ============================================================
// /platform/voiceforge — VoiceForge Dashboard
// Rich sample dashboard with mock data showcasing enterprise
// voice AI capabilities: sessions, campaigns, QA, compliance,
// engine status, and transcripts.
// ============================================================

import { useState, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

type SessionStatus = 'Active' | 'Completed' | 'Failed';
type CampaignStatus = 'Active' | 'Paused';
type FlagSeverity = 'CRITICAL' | 'WARNING';

interface VoiceSession {
  id: string;
  client: string;
  status: SessionStatus;
  duration: string;
  advisor: string;
  purpose: string;
  transcript: string;
}

interface Campaign {
  id: string;
  name: string;
  totalCalls: number;
  connected: number;
  connectRate: string;
  status: CampaignStatus;
}

interface AdvisorScore {
  name: string;
  overall: number;
  compliance: number;
  script: number;
  consent: number;
  flagged?: boolean;
}

interface ComplianceFlag {
  id: string;
  severity: FlagSeverity;
  message: string;
  advisor: string;
  date: string;
  resolved: boolean;
}

interface EngineComponent {
  name: string;
  type: string;
  status: string;
  detail: string;
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const SESSIONS: VoiceSession[] = [
  {
    id: 'VS-001',
    client: 'Apex Ventures LLC',
    status: 'Active',
    duration: '4m 12s',
    advisor: 'Sarah Chen',
    purpose: 'APR Expiry Warning',
    transcript: `Advisor: Good afternoon, this is Sarah from CapitalForge. Am I speaking with James?\nClient: Yes, this is James. Hi Sarah.\nAdvisor: James, I'm calling because your Chase Ink Business Preferred card has a 0% intro APR that expires in 49 days, on May 20th. I wanted to make sure you're aware and discuss your options.\nClient: Oh, I didn't realize it was that soon. What do you recommend?\nAdvisor: You currently have a balance of $12,400 on that card. Once the intro period ends, the APR jumps to 20.99%. That would mean roughly $217 per month in interest charges alone...`,
  },
  {
    id: 'VS-002',
    client: 'Meridian Holdings',
    status: 'Completed',
    duration: '8m 34s',
    advisor: 'Marcus Webb',
    purpose: 'Restack Consultation',
    transcript: `Advisor: Hi, this is Marcus from CapitalForge. I'm calling regarding your balance transfer strategy.\nClient: Yes, I've been expecting your call.\nAdvisor: Great. I've reviewed your current card portfolio and identified two opportunities for optimization. Your Citi Double Cash card has $8,200 at 18.24% that we could move to a new 0% intro APR offer.\nClient: That sounds interesting. What are the terms?\nAdvisor: We've pre-qualified you for the Wells Fargo Reflect card with 0% APR for 21 months and a 3% transfer fee...`,
  },
  {
    id: 'VS-003',
    client: 'Brightline Corp',
    status: 'Failed',
    duration: '0m 22s',
    advisor: 'Diana Ross',
    purpose: 'Payment Reminder',
    transcript: `Advisor: Hello, this is Diana from CapitalForge. May I speak with—\n[Call disconnected - recipient hung up]\n[System: Call ended. Duration: 22 seconds. Disposition: Failed - Recipient Hangup]`,
  },
];

const CAMPAIGNS: Campaign[] = [
  { id: 'C-001', name: 'APR Expiry Outreach Q2', totalCalls: 320, connected: 198, connectRate: '61.9%', status: 'Active' },
  { id: 'C-002', name: 'Repayment Reminder 30-Day', totalCalls: 145, connected: 102, connectRate: '70.3%', status: 'Active' },
  { id: 'C-003', name: 'Re-Stack Consultation', totalCalls: 89, connected: 54, connectRate: '60.7%', status: 'Paused' },
  { id: 'C-004', name: 'Annual Review Follow-Up', totalCalls: 210, connected: 167, connectRate: '79.5%', status: 'Active' },
];

const ADVISOR_SCORES: AdvisorScore[] = [
  { name: 'Sarah Chen', overall: 92, compliance: 95, script: 90, consent: 88 },
  { name: 'Marcus Webb', overall: 85, compliance: 88, script: 82, consent: 84 },
  { name: 'Jordan Mitchell', overall: 78, compliance: 80, script: 75, consent: 76 },
  { name: 'Sam Delgado', overall: 61, compliance: 58, script: 55, consent: 65, flagged: true },
];

const COMPLIANCE_FLAGS: ComplianceFlag[] = [
  {
    id: 'CF-001',
    severity: 'CRITICAL',
    message: "Advisor stated 'guaranteed approval' during pitch",
    advisor: 'Sam Delgado',
    date: 'Mar 29',
    resolved: false,
  },
  {
    id: 'CF-002',
    severity: 'WARNING',
    message: 'APR disclosure not provided within 60 seconds',
    advisor: 'Sarah Chen',
    date: 'Mar 28',
    resolved: true,
  },
  {
    id: 'CF-003',
    severity: 'WARNING',
    message: 'Potential misleading language about fee waivers',
    advisor: 'Jordan Mitchell',
    date: 'Mar 27',
    resolved: false,
  },
];

const ENGINE_COMPONENTS: EngineComponent[] = [
  { name: 'ASR: Faster-Whisper (Local)', type: 'asr', status: 'Ready', detail: 'Model: large-v3' },
  { name: 'TTS: ElevenLabs (Cloud)', type: 'tts', status: 'Ready', detail: 'Latency: 142ms' },
  { name: 'TTS: Piper (Local Fallback)', type: 'tts', status: 'Ready', detail: 'Latency: 28ms' },
  { name: 'LLM: Claude Sonnet (Anthropic)', type: 'llm', status: 'Ready', detail: '' },
  { name: 'Dialogue: XState Machine', type: 'dialogue', status: 'Active', detail: '' },
];

const SAMPLE_TRANSCRIPT = `Advisor: Good afternoon, this is Sarah from CapitalForge. Am I speaking with James?
Client: Yes, this is James. Hi Sarah.
Advisor: James, I'm calling because your Chase Ink Business Preferred card has a 0% intro APR that expires in 49 days, on May 20th. I wanted to make sure you're aware and discuss your options.
Client: Oh, I didn't realize it was that soon. What do you recommend?
Advisor: You currently have a balance of $12,400 on that card. Once the intro period ends, the APR jumps to 20.99%. That would mean roughly $217 per month in interest charges alone...`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 80) return 'text-blue-400';
  if (score >= 70) return 'text-amber-400';
  return 'text-red-400';
}

function statusBadge(status: SessionStatus): string {
  if (status === 'Active') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (status === 'Completed') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

function campaignBadge(status: CampaignStatus): string {
  if (status === 'Active') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function VoiceForgePage() {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState(CAMPAIGNS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const toggleCampaign = useCallback((id: string) => {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: (c.status === 'Active' ? 'Paused' : 'Active') as CampaignStatus } : c,
      ),
    );
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Toast ──────────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-gray-800 border border-gray-700 text-gray-100 px-5 py-3 rounded-lg shadow-xl text-sm animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* ── 1. Header ─────────────────────────────────────────── */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              VoiceForge{' '}
              <span className="text-gray-400 font-normal">— Enterprise Voice AI</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Telephony, call compliance, and outreach campaign management
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Mock Mode
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* ── 2. KPI Stats Row ──────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Sessions', value: '1,247', sub: '+12% vs last month', color: 'text-emerald-400' },
            { label: 'Completed Calls', value: '1,089', sub: '87.3% completion rate', color: 'text-blue-400' },
            { label: 'Avg Duration', value: '5m 42s', sub: 'Across all campaigns', color: 'text-purple-400' },
            { label: 'Avg QA Score', value: '87.5', sub: 'Out of 100', color: 'text-amber-400' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors"
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-3xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-gray-500 mt-1">{kpi.sub}</p>
            </div>
          ))}
        </section>

        {/* ── 3. Active Voice Sessions ──────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Active Voice Sessions</h2>
            <span className="text-xs text-gray-500">{SESSIONS.length} sessions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Client</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Duration</th>
                  <th className="text-left px-5 py-3 font-medium">Advisor</th>
                  <th className="text-left px-5 py-3 font-medium">Purpose</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {SESSIONS.map((s) => (
                  <>
                    <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-white">{s.client}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(s.status)}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400 font-mono text-xs">{s.duration}</td>
                      <td className="px-5 py-3 text-gray-300">{s.advisor}</td>
                      <td className="px-5 py-3 text-gray-400">{s.purpose}</td>
                      <td className="px-5 py-3 text-right space-x-2">
                        <button
                          onClick={() => showToast(`Playing recording for ${s.client}...`)}
                          className="px-2.5 py-1 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition-colors"
                        >
                          Listen to Recording
                        </button>
                        <button
                          onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-400 bg-gray-700/50 border border-gray-700 rounded-md hover:bg-gray-700 transition-colors"
                        >
                          {expandedSession === s.id ? 'Hide Transcript' : 'View Transcript'}
                        </button>
                      </td>
                    </tr>
                    {expandedSession === s.id && (
                      <tr key={`${s.id}-transcript`} className="border-b border-gray-800/50">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">
                            {s.transcript}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 4. Campaign Manager ───────────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-base font-semibold text-white">Campaign Manager</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Campaign</th>
                  <th className="text-left px-5 py-3 font-medium">Total Calls</th>
                  <th className="text-left px-5 py-3 font-medium">Connected</th>
                  <th className="text-left px-5 py-3 font-medium">Connect Rate</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{c.name}</td>
                    <td className="px-5 py-3 text-gray-400 font-mono">{c.totalCalls}</td>
                    <td className="px-5 py-3 text-gray-400 font-mono">{c.connected}</td>
                    <td className="px-5 py-3 text-gray-300 font-mono">{c.connectRate}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${campaignBadge(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => toggleCampaign(c.id)}
                        className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
                          c.status === 'Active'
                            ? 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {c.status === 'Active' ? 'Pause' : 'Resume'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 5. QA Scorecard ───────────────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-base font-semibold text-white">QA Scorecard</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Advisor</th>
                  <th className="text-center px-5 py-3 font-medium">Overall</th>
                  <th className="text-center px-5 py-3 font-medium">Compliance</th>
                  <th className="text-center px-5 py-3 font-medium">Script Adherence</th>
                  <th className="text-center px-5 py-3 font-medium">Consent Capture</th>
                  <th className="text-left px-5 py-3 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {ADVISOR_SCORES.map((a) => (
                  <tr key={a.name} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{a.name}</td>
                    <td className={`px-5 py-3 text-center font-bold font-mono ${scoreColor(a.overall)}`}>{a.overall}</td>
                    <td className={`px-5 py-3 text-center font-mono ${scoreColor(a.compliance)}`}>{a.compliance}</td>
                    <td className={`px-5 py-3 text-center font-mono ${scoreColor(a.script)}`}>{a.script}</td>
                    <td className={`px-5 py-3 text-center font-mono ${scoreColor(a.consent)}`}>{a.consent}</td>
                    <td className="px-5 py-3">
                      {a.flagged && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
                          Remediation Required
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── 6. Compliance Flags ──────────────────────────────── */}
          <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Compliance Flags</h2>
            </div>
            <div className="divide-y divide-gray-800/50">
              {COMPLIANCE_FLAGS.map((f) => (
                <div key={f.id} className="px-5 py-4 hover:bg-gray-800/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                        f.severity === 'CRITICAL'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {f.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 leading-snug">
                        &ldquo;{f.message}&rdquo;
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-500">{f.advisor}</span>
                        <span className="text-xs text-gray-600">&middot;</span>
                        <span className="text-xs text-gray-500">{f.date}</span>
                        {f.resolved && (
                          <span className="text-xs text-emerald-400 font-medium">Resolved</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 7. Voice Engine Status ──────────────────────────── */}
          <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Voice Engine Status</h2>
            </div>
            <div className="divide-y divide-gray-800/50">
              {ENGINE_COMPONENTS.map((e) => (
                <div key={e.name} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-800/20 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{e.name}</p>
                    {e.detail && <p className="text-xs text-gray-500 mt-0.5">{e.detail}</p>}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {e.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── 8. Recent Call Transcript Sample ───────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-800/20 transition-colors"
          >
            <h2 className="text-base font-semibold text-white">Recent Call Transcript Sample</h2>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${transcriptOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {transcriptOpen && (
            <div className="px-5 pb-5">
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-5 font-mono text-sm leading-7 text-gray-400 whitespace-pre-wrap">
                {SAMPLE_TRANSCRIPT.split('\n').map((line, i) => {
                  const isAdvisor = line.startsWith('Advisor:');
                  const isClient = line.startsWith('Client:');
                  return (
                    <div key={i} className={isAdvisor ? 'text-blue-400' : isClient ? 'text-emerald-400' : 'text-gray-500'}>
                      {line}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
