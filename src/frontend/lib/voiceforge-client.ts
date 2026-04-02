// ============================================================
// VoiceForge API Client
// ============================================================
// Typed client for the VoiceForge telephony & call-compliance
// service. When NEXT_PUBLIC_USE_MOCK_DATA=true, all methods
// return deterministic mock data without hitting the network.
// ============================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VoiceCallStats {
  totalCalls: number;
  completedCalls: number;
  avgDurationSec: number;
  conversionRate: number;
}

export interface VoiceCampaignSummary {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed';
  totalCalls: number;
  connectedCalls: number;
  startDate: string;
  endDate?: string;
}

export interface VoiceQAScore {
  advisorId: string;
  advisorName: string;
  overallScore: number;
  complianceScore: number;
  courtesyScore: number;
  accuracyScore: number;
  evaluatedAt: string;
}

export interface VoiceDashboardSummary {
  callStats: VoiceCallStats;
  activeCampaigns: number;
  avgQAScore: number;
  complianceFlags: number;
}

export interface VoiceCallRecord {
  id: string;
  clientId: string;
  advisorId: string;
  direction: 'inbound' | 'outbound';
  status: 'completed' | 'missed' | 'voicemail' | 'in-progress';
  durationSec: number;
  startedAt: string;
  endedAt?: string;
  campaignId?: string;
}

export interface VoiceCallDetail extends VoiceCallRecord {
  recordingUrl?: string;
  transcriptUrl?: string;
  transcript?: string;
  qaScore?: VoiceQAScore;
  complianceFlags: string[];
}

export interface VoiceComplianceFlag {
  id: string;
  callId: string;
  advisorId: string;
  flagType: 'banned_claim' | 'missing_disclosure' | 'tcpa_violation' | 'risk_language';
  description: string;
  severity: 'critical' | 'warning' | 'info';
  flaggedAt: string;
  resolved: boolean;
}

export interface InitiateCallParams {
  clientId: string;
  advisorId: string;
  campaignId?: string;
  phoneNumber: string;
  notes?: string;
}

export interface InitiateCallResult {
  callId: string;
  status: 'initiated' | 'tcpa_blocked';
  reason?: string;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_VOICEFORGE_URL ?? 'http://localhost:3001';

const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

// ─── Internal fetch helper ──────────────────────────────────────────────────

async function vfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`VoiceForge API error ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  return json as T;
}

// ─── Mock helpers ───────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MOCK_DASHBOARD: VoiceDashboardSummary = {
  callStats: {
    totalCalls: 1_247,
    completedCalls: 1_089,
    avgDurationSec: 342,
    conversionRate: 0.38,
  },
  activeCampaigns: 4,
  avgQAScore: 87.5,
  complianceFlags: 3,
};

const MOCK_CAMPAIGNS: VoiceCampaignSummary[] = [
  {
    id: 'cmp_001',
    name: 'APR Expiry Outreach Q2',
    status: 'active',
    totalCalls: 320,
    connectedCalls: 198,
    startDate: '2026-03-01',
  },
  {
    id: 'cmp_002',
    name: 'Repayment Reminder — 30-Day',
    status: 'active',
    totalCalls: 145,
    connectedCalls: 102,
    startDate: '2026-03-15',
  },
  {
    id: 'cmp_003',
    name: 'Re-Stack Consultation',
    status: 'paused',
    totalCalls: 89,
    connectedCalls: 54,
    startDate: '2026-02-10',
  },
  {
    id: 'cmp_004',
    name: 'Annual Review Follow-Up',
    status: 'active',
    totalCalls: 210,
    connectedCalls: 167,
    startDate: '2026-03-20',
  },
];

const MOCK_CALLS: VoiceCallRecord[] = [
  {
    id: 'call_001',
    clientId: 'cli_100',
    advisorId: 'adv_01',
    direction: 'outbound',
    status: 'completed',
    durationSec: 412,
    startedAt: '2026-03-30T14:22:00Z',
    endedAt: '2026-03-30T14:28:52Z',
    campaignId: 'cmp_001',
  },
  {
    id: 'call_002',
    clientId: 'cli_100',
    advisorId: 'adv_01',
    direction: 'inbound',
    status: 'completed',
    durationSec: 180,
    startedAt: '2026-03-28T10:05:00Z',
    endedAt: '2026-03-28T10:08:00Z',
  },
  {
    id: 'call_003',
    clientId: 'cli_100',
    advisorId: 'adv_02',
    direction: 'outbound',
    status: 'missed',
    durationSec: 0,
    startedAt: '2026-03-25T16:00:00Z',
  },
];

const MOCK_QA_SCORES: VoiceQAScore[] = [
  {
    advisorId: 'adv_01',
    advisorName: 'James Rivera',
    overallScore: 92,
    complianceScore: 95,
    courtesyScore: 90,
    accuracyScore: 88,
    evaluatedAt: '2026-03-30T00:00:00Z',
  },
  {
    advisorId: 'adv_02',
    advisorName: 'Priya Desai',
    overallScore: 85,
    complianceScore: 88,
    courtesyScore: 82,
    accuracyScore: 84,
    evaluatedAt: '2026-03-29T00:00:00Z',
  },
];

const MOCK_FLAGS: VoiceComplianceFlag[] = [
  {
    id: 'flg_001',
    callId: 'call_010',
    advisorId: 'adv_03',
    flagType: 'banned_claim',
    description: 'Advisor stated "guaranteed approval" during pitch.',
    severity: 'critical',
    flaggedAt: '2026-03-29T11:45:00Z',
    resolved: false,
  },
  {
    id: 'flg_002',
    callId: 'call_011',
    advisorId: 'adv_01',
    flagType: 'missing_disclosure',
    description: 'APR disclosure not provided within first 60 seconds.',
    severity: 'warning',
    flaggedAt: '2026-03-28T09:20:00Z',
    resolved: true,
  },
  {
    id: 'flg_003',
    callId: 'call_015',
    advisorId: 'adv_02',
    flagType: 'risk_language',
    description: 'Potential misleading language about fee waivers.',
    severity: 'warning',
    flaggedAt: '2026-03-27T15:10:00Z',
    resolved: false,
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/** Dashboard summary: call stats, campaigns, QA scores, compliance flags. */
export async function getDashboardSummary(): Promise<VoiceDashboardSummary> {
  if (USE_MOCK) {
    await delay(300);
    return MOCK_DASHBOARD;
  }
  return vfFetch<VoiceDashboardSummary>('/api/dashboard/summary');
}

/** Initiate an outbound call with TCPA consent pre-check. */
export async function initiateCall(
  params: InitiateCallParams,
): Promise<InitiateCallResult> {
  if (USE_MOCK) {
    await delay(500);
    return { callId: `call_mock_${Date.now()}`, status: 'initiated' };
  }
  return vfFetch<InitiateCallResult>('/api/calls/initiate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Call history for a specific client. */
export async function getClientCalls(
  clientId: string,
): Promise<VoiceCallRecord[]> {
  if (USE_MOCK) {
    await delay(300);
    return MOCK_CALLS.filter((c) => c.clientId === clientId);
  }
  return vfFetch<VoiceCallRecord[]>(`/api/calls?clientId=${encodeURIComponent(clientId)}`);
}

/** Full call detail including recording and transcript URLs. */
export async function getCallDetail(callId: string): Promise<VoiceCallDetail> {
  if (USE_MOCK) {
    await delay(300);
    const base = MOCK_CALLS.find((c) => c.id === callId) ?? MOCK_CALLS[0];
    return {
      ...base,
      recordingUrl: `https://recordings.voiceforge.local/${callId}.wav`,
      transcriptUrl: `https://recordings.voiceforge.local/${callId}.txt`,
      transcript:
        'Advisor: Good afternoon, this is James from CapitalForge...\nClient: Hi James, thanks for calling back...',
      complianceFlags: [],
    };
  }
  return vfFetch<VoiceCallDetail>(`/api/calls/${encodeURIComponent(callId)}`);
}

/** List active campaigns. */
export async function getCampaigns(): Promise<VoiceCampaignSummary[]> {
  if (USE_MOCK) {
    await delay(300);
    return MOCK_CAMPAIGNS;
  }
  return vfFetch<VoiceCampaignSummary[]>('/api/campaigns');
}

/** QA scorecard data; optionally filtered by advisor. */
export async function getQAScores(
  advisorId?: string,
): Promise<VoiceQAScore[]> {
  if (USE_MOCK) {
    await delay(300);
    if (advisorId) return MOCK_QA_SCORES.filter((s) => s.advisorId === advisorId);
    return MOCK_QA_SCORES;
  }
  const qs = advisorId ? `?advisorId=${encodeURIComponent(advisorId)}` : '';
  return vfFetch<VoiceQAScore[]>(`/api/qa/scores${qs}`);
}

/** Compliance-flagged calls. */
export async function getComplianceFlags(): Promise<VoiceComplianceFlag[]> {
  if (USE_MOCK) {
    await delay(300);
    return MOCK_FLAGS;
  }
  return vfFetch<VoiceComplianceFlag[]>('/api/compliance/flags');
}
