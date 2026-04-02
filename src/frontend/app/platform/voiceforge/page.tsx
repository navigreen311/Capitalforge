'use client';

// ============================================================
// /platform/voiceforge — VoiceForge Dashboard
// Rich sample dashboard with mock data showcasing enterprise
// voice AI capabilities: sessions, campaigns, QA, compliance,
// engine status, and transcripts.
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

type SessionStatus = 'Active' | 'Completed' | 'Failed';
type CampaignStatus = 'Active' | 'Paused';
type FlagSeverity = 'CRITICAL' | 'WARNING';
type FlagState = 'unresolved' | 'acknowledged' | 'resolved';
type TCPAConsent = 'verified' | 'missing';

interface VoiceSession {
  id: string;
  client: string;
  status: SessionStatus;
  duration: string;
  advisor: string;
  purpose: string;
  transcript: string;
  tcpaConsent: TCPAConsent;
  date: string;
  qaScore: number;
}

interface Campaign {
  id: string;
  name: string;
  totalCalls: number;
  connected: number;
  connectRate: string;
  status: CampaignStatus;
  type?: string;
  targetSegment?: string;
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
  state: FlagState;
  reviewer?: string;
  notes?: string;
  resolutionAction?: string;
}

interface EngineComponent {
  name: string;
  type: string;
  status: string;
  detail: string;
}

interface TranscriptTurn {
  speaker: 'ADVISOR' | 'CLIENT' | 'SYSTEM';
  timestamp: string;
  text: string;
  complianceFlag?: 'flag' | 'consent';
}

interface WaveformMarker {
  position: number; // 0-100 percentage
  color: 'red' | 'green' | 'amber';
  label: string;
  timestamp: string;
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
    date: 'Mar 30, 2026',
    qaScore: 92,
    tcpaConsent: 'verified',
    transcript: `Advisor: Good afternoon, this is Sarah from CapitalForge. Am I speaking with James?\nClient: Yes, this is James. Hi Sarah.\nAdvisor: James, I'm calling because your Chase Ink Business Preferred card has a 0% intro APR that expires in 49 days, on May 20th. I wanted to make sure you're aware and discuss your options.\nClient: Oh, I didn't realize it was that soon. What do you recommend?\nAdvisor: You currently have a balance of $12,400 on that card. Once the intro period ends, the APR jumps to 20.99%. That would mean roughly $217 per month in interest charges alone...`,
  },
  {
    id: 'VS-002',
    client: 'Meridian Holdings',
    status: 'Completed',
    duration: '8m 34s',
    advisor: 'Marcus Webb',
    purpose: 'Restack Consultation',
    date: 'Mar 29, 2026',
    qaScore: 85,
    tcpaConsent: 'verified',
    transcript: `Advisor: Hi, this is Marcus from CapitalForge. I'm calling regarding your balance transfer strategy.\nClient: Yes, I've been expecting your call.\nAdvisor: Great. I've reviewed your current card portfolio and identified two opportunities for optimization. Your Citi Double Cash card has $8,200 at 18.24% that we could move to a new 0% intro APR offer.\nClient: That sounds interesting. What are the terms?\nAdvisor: We've pre-qualified you for the Wells Fargo Reflect card with 0% APR for 21 months and a 3% transfer fee...`,
  },
  {
    id: 'VS-003',
    client: 'Brightline Corp',
    status: 'Failed',
    duration: '0m 22s',
    advisor: 'Diana Ross',
    purpose: 'Payment Reminder',
    date: 'Mar 28, 2026',
    qaScore: 0,
    tcpaConsent: 'missing',
    transcript: `Advisor: Hello, this is Diana from CapitalForge. May I speak with—\n[Call disconnected - recipient hung up]\n[System: Call ended. Duration: 22 seconds. Disposition: Failed - Recipient Hangup]`,
  },
];

const INITIAL_CAMPAIGNS: Campaign[] = [
  { id: 'C-001', name: 'APR Expiry Outreach Q2', totalCalls: 320, connected: 198, connectRate: '61.9%', status: 'Active', type: 'Outbound', targetSegment: 'APR Expiry 30-60 days' },
  { id: 'C-002', name: 'Repayment Reminder 30-Day', totalCalls: 145, connected: 102, connectRate: '70.3%', status: 'Active', type: 'Outbound', targetSegment: 'Overdue 30+ days' },
  { id: 'C-003', name: 'Re-Stack Consultation', totalCalls: 89, connected: 54, connectRate: '60.7%', status: 'Paused', type: 'Outbound', targetSegment: 'High balance multi-card' },
  { id: 'C-004', name: 'Annual Review Follow-Up', totalCalls: 210, connected: 167, connectRate: '79.5%', status: 'Active', type: 'Outbound', targetSegment: 'Annual review eligible' },
];

const ADVISOR_SCORES: AdvisorScore[] = [
  { name: 'Sarah Chen', overall: 92, compliance: 95, script: 90, consent: 88 },
  { name: 'Marcus Webb', overall: 85, compliance: 88, script: 82, consent: 84 },
  { name: 'Jordan Mitchell', overall: 78, compliance: 80, script: 75, consent: 76 },
  { name: 'Sam Delgado', overall: 61, compliance: 58, script: 55, consent: 65, flagged: true },
];

const INITIAL_COMPLIANCE_FLAGS: ComplianceFlag[] = [
  {
    id: 'CF-001',
    severity: 'CRITICAL',
    message: "Advisor stated 'guaranteed approval' during pitch",
    advisor: 'Sam Delgado',
    date: 'Mar 29',
    state: 'unresolved',
  },
  {
    id: 'CF-002',
    severity: 'WARNING',
    message: 'APR disclosure not provided within 60 seconds',
    advisor: 'Sarah Chen',
    date: 'Mar 28',
    state: 'resolved',
    resolutionAction: 'Coaching session completed',
  },
  {
    id: 'CF-003',
    severity: 'WARNING',
    message: 'Potential misleading language about fee waivers',
    advisor: 'Jordan Mitchell',
    date: 'Mar 27',
    state: 'unresolved',
  },
];

const ENGINE_COMPONENTS: EngineComponent[] = [
  { name: 'ASR: Faster-Whisper (Local)', type: 'asr', status: 'Ready', detail: 'Model: large-v3' },
  { name: 'TTS: ElevenLabs (Cloud)', type: 'tts', status: 'Ready', detail: 'Latency: 142ms' },
  { name: 'TTS: Piper (Local Fallback)', type: 'tts', status: 'Ready', detail: 'Latency: 28ms' },
  { name: 'LLM: Claude Sonnet (Anthropic)', type: 'llm', status: 'Ready', detail: '' },
  { name: 'Dialogue: XState Machine', type: 'dialogue', status: 'Active', detail: '' },
];

// Mock transcript data for drawers
const TRANSCRIPT_DATA: Record<string, TranscriptTurn[]> = {
  'VS-001': [
    { speaker: 'ADVISOR', timestamp: '00:00', text: 'Good afternoon, this is Sarah from CapitalForge. Am I speaking with James?' },
    { speaker: 'CLIENT', timestamp: '00:08', text: 'Yes, this is James. Hi Sarah.' },
    { speaker: 'ADVISOR', timestamp: '00:15', text: "James, I'm calling because your Chase Ink Business Preferred card has a 0% intro APR that expires in 49 days, on May 20th. I wanted to make sure you're aware and discuss your options.", complianceFlag: 'consent' },
    { speaker: 'CLIENT', timestamp: '00:42', text: "Oh, I didn't realize it was that soon. What do you recommend?" },
    { speaker: 'ADVISOR', timestamp: '00:48', text: 'You currently have a balance of $12,400 on that card. Once the intro period ends, the APR jumps to 20.99%. That would mean roughly $217 per month in interest charges alone.' },
    { speaker: 'CLIENT', timestamp: '01:15', text: "That's a lot. What are my options to avoid that?" },
  ],
  'VS-002': [
    { speaker: 'ADVISOR', timestamp: '00:00', text: "Hi, this is Marcus from CapitalForge. I'm calling regarding your balance transfer strategy." },
    { speaker: 'CLIENT', timestamp: '00:09', text: "Yes, I've been expecting your call." },
    { speaker: 'ADVISOR', timestamp: '00:15', text: "Great. I've reviewed your current card portfolio and identified two opportunities for optimization. Your Citi Double Cash card has $8,200 at 18.24% that we could move to a new 0% intro APR offer." },
    { speaker: 'CLIENT', timestamp: '01:02', text: 'That sounds interesting. What are the terms?' },
    { speaker: 'ADVISOR', timestamp: '02:10', text: "We've pre-qualified you for the Wells Fargo Reflect card with 0% APR for 21 months and a 3% transfer fee. I should mention this is not a guaranteed rate — it's subject to final approval.", complianceFlag: 'flag' },
    { speaker: 'CLIENT', timestamp: '03:05', text: 'Okay, I understand. Can you walk me through the application process?' },
  ],
};

const WAVEFORM_MARKERS: Record<string, WaveformMarker[]> = {
  'VS-001': [
    { position: 33, color: 'green', label: 'Consent obtained', timestamp: '1:23' },
    { position: 89, color: 'green', label: 'Disclosure note', timestamp: '3:45' },
  ],
  'VS-002': [
    { position: 25, color: 'amber', label: 'Potential issue', timestamp: '2:10' },
    { position: 9, color: 'green', label: 'Consent captured', timestamp: '0:45' },
  ],
};

// QA Drill-down mock data
const QA_CALL_HISTORY = [
  { id: 'QC-001', date: 'Mar 30', client: 'Apex Ventures', duration: '4:12', score: 94, flags: 0 },
  { id: 'QC-002', date: 'Mar 29', client: 'Horizon Group', duration: '6:45', score: 88, flags: 1 },
  { id: 'QC-003', date: 'Mar 28', client: 'Summit Capital', duration: '3:22', score: 91, flags: 0 },
  { id: 'QC-004', date: 'Mar 27', client: 'Redline Partners', duration: '5:10', score: 85, flags: 0 },
  { id: 'QC-005', date: 'Mar 26', client: 'NovaBank Corp', duration: '7:33', score: 79, flags: 2 },
];

const QA_FLAG_HISTORY = [
  { date: 'Mar 29', type: 'WARNING', description: 'APR disclosure delayed by 15 seconds' },
  { date: 'Mar 26', type: 'WARNING', description: 'Script deviation during fee discussion' },
];

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

/** Seeded pseudo-random for deterministic waveform bars */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function parseDuration(dur: string): number {
  const match = dur.match(/(\d+)m\s*(\d+)s/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

// ─── Backdrop / Drawer Shell ────────────────────────────────────────────────

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50"
      onClick={onClose}
      aria-hidden
    />
  );
}

function DrawerShell({
  open,
  onClose,
  width,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <Backdrop onClose={onClose} />
      <div
        className={`fixed top-0 right-0 h-full ${width} bg-gray-900 border-l border-gray-800 z-50 overflow-y-auto shadow-2xl animate-slide-in-right`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {children}
      </div>
    </>
  );
}

function ModalShell({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <Backdrop onClose={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

const PAUSE_REASONS = [
  'Compliance review pending',
  'Script revision required',
  'Regulatory hold',
  'Budget cap reached',
  'Technical issue',
  'Manager override',
];

const RESOLUTION_ACTIONS = [
  'Coaching session completed',
  'Script updated',
  'Warning issued',
  'Escalated to legal',
  'No action — false positive',
];

const CAMPAIGN_TYPES = [
  'Outbound — Sales',
  'Outbound — Reminder',
  'Outbound — Consultation',
  'Inbound — Support',
  'Inbound — Verification',
];

const SCRIPT_OPTIONS = [
  'APR Expiry Warning v2.4',
  'Payment Reminder Standard',
  'Balance Transfer Consultation',
  'Annual Review Template',
  'Custom Script',
];

const TTS_VOICES = [
  { id: 'elevenlabs-sarah', label: 'ElevenLabs — Sarah (Natural)' },
  { id: 'elevenlabs-marcus', label: 'ElevenLabs — Marcus (Professional)' },
  { id: 'piper-default', label: 'Piper — Default (Local)' },
];

const REMEDIATION_TYPES = [
  'Mandatory re-training',
  'Script adherence coaching',
  'Compliance review session',
  'Supervised call period',
  'Performance improvement plan',
];

export default function VoiceForgePage() {
  // Existing state
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState(INITIAL_CAMPAIGNS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [transcriptSampleOpen, setTranscriptSampleOpen] = useState(false);

  // Feature 1: Audio Player Drawer
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [seekPosition, setSeekPosition] = useState(0);

  // Feature 2: Transcript Drawer
  const [selectedTranscript, setSelectedTranscript] = useState<string | null>(null);
  const [qaCollapsed, setQaCollapsed] = useState(false);

  // Feature 3: Campaign Pause/Resume modals
  const [pauseModalCampaign, setPauseModalCampaign] = useState<string | null>(null);
  const [resumeModalCampaign, setResumeModalCampaign] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseResumeDate, setPauseResumeDate] = useState('');
  const [resumeTCPAConfirmed, setResumeTCPAConfirmed] = useState(false);

  // Feature 4: Compliance flag actions
  const [complianceFlags, setComplianceFlags] = useState(INITIAL_COMPLIANCE_FLAGS);
  const [ackModalFlag, setAckModalFlag] = useState<string | null>(null);
  const [resolveModalFlag, setResolveModalFlag] = useState<string | null>(null);
  const [flagReviewer, setFlagReviewer] = useState('');
  const [flagNotes, setFlagNotes] = useState('');
  const [flagResolutionAction, setFlagResolutionAction] = useState('');

  // Feature 5: Sam Delgado remediation
  const [remediationModalOpen, setRemediationModalOpen] = useState(false);
  const [remediationType, setRemediationType] = useState('');
  const [remediationOfficer, setRemediationOfficer] = useState('');
  const [remediationDueDate, setRemediationDueDate] = useState('');
  const [remediationNotes, setRemediationNotes] = useState('');

  // Feature 6: New Campaign wizard
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [newCampaignStep, setNewCampaignStep] = useState(1);
  const [ncName, setNcName] = useState('');
  const [ncType, setNcType] = useState('');
  const [ncSegment, setNcSegment] = useState('');
  const [ncMaxCalls, setNcMaxCalls] = useState('');
  const [ncDailyLimit, setNcDailyLimit] = useState('');
  const [ncStartDate, setNcStartDate] = useState('');
  const [ncEndDate, setNcEndDate] = useState('');
  const [ncScript, setNcScript] = useState('');
  const [ncVoice, setNcVoice] = useState('elevenlabs-sarah');
  const [ncTCPA, setNcTCPA] = useState(false);

  // Feature 7: QA Scorecard drill-down drawer
  const [selectedAdvisor, setSelectedAdvisor] = useState<string | null>(null);

  // Feature 9: Transcript sample expand with Meridian details
  const [meridianTranscriptExpanded, setMeridianTranscriptExpanded] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Derived
  const hasUnresolvedCritical = complianceFlags.some(
    (f) => f.severity === 'CRITICAL' && f.state === 'unresolved',
  );

  const selectedSession = SESSIONS.find((s) => s.id === selectedRecording || s.id === selectedTranscript);
  const recordingSession = SESSIONS.find((s) => s.id === selectedRecording);
  const transcriptSession = SESSIONS.find((s) => s.id === selectedTranscript);
  const advisorData = ADVISOR_SCORES.find((a) => a.name === selectedAdvisor);
  const recordingDuration = recordingSession ? parseDuration(recordingSession.duration) : 0;

  // ── Handlers ──────────────────────────────────────────────

  const handlePauseCampaign = () => {
    if (!pauseModalCampaign || !pauseReason) return;
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === pauseModalCampaign ? { ...c, status: 'Paused' as CampaignStatus } : c,
      ),
    );
    showToast(`Campaign paused: ${pauseReason}`);
    setPauseModalCampaign(null);
    setPauseReason('');
    setPauseResumeDate('');
  };

  const handleResumeCampaign = () => {
    if (!resumeModalCampaign || !resumeTCPAConfirmed) return;
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === resumeModalCampaign ? { ...c, status: 'Active' as CampaignStatus } : c,
      ),
    );
    showToast('Campaign resumed successfully');
    setResumeModalCampaign(null);
    setResumeTCPAConfirmed(false);
  };

  const handleAcknowledgeFlag = () => {
    if (!ackModalFlag || !flagReviewer) return;
    setComplianceFlags((prev) =>
      prev.map((f) =>
        f.id === ackModalFlag
          ? { ...f, state: 'acknowledged' as FlagState, reviewer: flagReviewer, notes: flagNotes }
          : f,
      ),
    );
    showToast('Flag acknowledged');
    setAckModalFlag(null);
    setFlagReviewer('');
    setFlagNotes('');
  };

  const handleResolveFlag = () => {
    if (!resolveModalFlag || !flagResolutionAction) return;
    setComplianceFlags((prev) =>
      prev.map((f) =>
        f.id === resolveModalFlag
          ? { ...f, state: 'resolved' as FlagState, resolutionAction: flagResolutionAction, notes: flagNotes }
          : f,
      ),
    );
    showToast('Flag resolved');
    setResolveModalFlag(null);
    setFlagResolutionAction('');
    setFlagNotes('');
  };

  const handleSubmitRemediation = () => {
    if (!remediationType || !remediationOfficer || !remediationDueDate) return;
    showToast(`Remediation assigned to ${remediationOfficer} — due ${remediationDueDate}`);
    setRemediationModalOpen(false);
    setRemediationType('');
    setRemediationOfficer('');
    setRemediationDueDate('');
    setRemediationNotes('');
  };

  const handleLaunchCampaign = () => {
    const newCampaign: Campaign = {
      id: `C-${String(campaigns.length + 1).padStart(3, '0')}`,
      name: ncName,
      totalCalls: 0,
      connected: 0,
      connectRate: '0%',
      status: 'Active',
      type: ncType,
      targetSegment: ncSegment,
    };
    setCampaigns((prev) => [...prev, newCampaign]);
    showToast(`Campaign "${ncName}" launched successfully`);
    setNewCampaignOpen(false);
    setNewCampaignStep(1);
    setNcName(''); setNcType(''); setNcSegment(''); setNcMaxCalls(''); setNcDailyLimit('');
    setNcStartDate(''); setNcEndDate(''); setNcScript(''); setNcVoice('elevenlabs-sarah'); setNcTCPA(false);
  };

  const openRecording = (sessionId: string) => {
    setSelectedRecording(sessionId);
    setIsPlaying(false);
    setSeekPosition(0);
    setPlaybackSpeed(1);
  };

  const openTranscript = (sessionId: string) => {
    setSelectedTranscript(sessionId);
    setQaCollapsed(false);
  };

  // ── Render waveform bars ─────────────────────────────────

  const renderWaveform = (sessionId: string) => {
    const bars = 100;
    const markers = WAVEFORM_MARKERS[sessionId] || [];
    const barElements = [];
    for (let i = 0; i < bars; i++) {
      const height = 10 + seededRandom(i + sessionId.charCodeAt(3) * 100) * 50;
      const seekPct = (seekPosition / (recordingDuration || 1)) * 100;
      const isPlayed = (i / bars) * 100 <= seekPct;
      barElements.push(
        <rect
          key={i}
          x={i * 5.6}
          y={60 - height}
          width={4}
          height={height}
          rx={2}
          fill={isPlayed ? '#3b82f6' : '#374151'}
          opacity={isPlayed ? 1 : 0.6}
        />,
      );
    }
    return (
      <div className="relative">
        <svg viewBox="0 0 560 60" className="w-full h-16" preserveAspectRatio="none">
          {barElements}
        </svg>
        {/* Compliance markers */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          {markers.map((m, idx) => (
            <div
              key={idx}
              className="absolute top-0 h-full flex flex-col items-center"
              style={{ left: `${m.position}%` }}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  m.color === 'red' ? 'bg-red-500' : m.color === 'green' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                title={`${m.label} (${m.timestamp})`}
              />
              <div
                className={`w-0.5 h-full ${
                  m.color === 'red' ? 'bg-red-500/30' : m.color === 'green' ? 'bg-emerald-500/30' : 'bg-amber-500/30'
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Shared styles ────────────────────────────────────────

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors';
  const selectClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors';
  const btnPrimary = 'px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const btnSecondary = 'px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded-lg transition-colors';
  const labelClass = 'block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Toast ──────────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[60] bg-gray-800 border border-gray-700 text-gray-100 px-5 py-3 rounded-lg shadow-xl text-sm animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
           FEATURE 1: Audio Player Drawer
         ══════════════════════════════════════════════════════════ */}
      <DrawerShell open={!!selectedRecording} onClose={() => setSelectedRecording(null)} width="w-[600px]">
        {recordingSession && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white">{recordingSession.client}</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-400">
                <div><span className="text-gray-500">Advisor:</span> {recordingSession.advisor}</div>
                <div><span className="text-gray-500">Purpose:</span> {recordingSession.purpose}</div>
                <div><span className="text-gray-500">Date:</span> {recordingSession.date}</div>
                <div><span className="text-gray-500">Duration:</span> {recordingSession.duration}</div>
                <div><span className="text-gray-500">QA Score:</span> <span className={scoreColor(recordingSession.qaScore)}>{recordingSession.qaScore}</span></div>
              </div>
            </div>

            {recordingSession.status === 'Failed' ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                <p className="text-red-400 text-sm font-medium">No recording available — call failed</p>
              </div>
            ) : (
              <>
                {/* Waveform */}
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                  {renderWaveform(recordingSession.id)}
                  {/* Marker legend */}
                  <div className="flex gap-4 mt-2">
                    {(WAVEFORM_MARKERS[recordingSession.id] || []).map((m, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span className={`w-2 h-2 rounded-full ${m.color === 'red' ? 'bg-red-500' : m.color === 'green' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {m.timestamp} — {m.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Controls */}
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition-colors text-white"
                    >
                      {isPlaying ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                    <div className="flex-1">
                      <input
                        type="range"
                        min={0}
                        max={recordingDuration}
                        value={seekPosition}
                        onChange={(e) => setSeekPosition(Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                      <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                        <span>{formatTime(seekPosition)}</span>
                        <span>{formatTime(recordingDuration)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Speed selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Speed:</span>
                    {[0.5, 1, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => setPlaybackSpeed(speed)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          playbackSpeed === speed
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DrawerShell>

      {/* ══════════════════════════════════════════════════════════
           FEATURE 2: Transcript Drawer
         ══════════════════════════════════════════════════════════ */}
      <DrawerShell open={!!selectedTranscript} onClose={() => setSelectedTranscript(null)} width="w-[680px]">
        {transcriptSession && (
          <div className="p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-white">Transcript — {transcriptSession.client}</h3>
              <p className="text-xs text-gray-500 mt-1">{transcriptSession.advisor} &middot; {transcriptSession.date} &middot; {transcriptSession.duration}</p>
            </div>

            {/* QA Score panel */}
            <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setQaCollapsed(!qaCollapsed)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors"
              >
                <span className="text-sm font-medium text-gray-300">QA Score</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${scoreColor(transcriptSession.qaScore)}`}>{transcriptSession.qaScore}/100</span>
                  <svg className={`w-4 h-4 text-gray-500 transition-transform ${qaCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {!qaCollapsed && (
                <div className="px-4 pb-3 text-xs text-gray-500">
                  Compliance: {transcriptSession.qaScore >= 85 ? 'Pass' : 'Review needed'} | Script adherence: {transcriptSession.qaScore >= 80 ? 'Good' : 'Below target'}
                </div>
              )}
            </div>

            {/* Transcript turns */}
            <div className="space-y-3">
              {(TRANSCRIPT_DATA[transcriptSession.id] || []).map((turn, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                      turn.speaker === 'ADVISOR'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : turn.speaker === 'CLIENT'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-gray-700 text-gray-400'
                    }`}>
                      {turn.speaker}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-gray-600 font-mono">{turn.timestamp}</span>
                    <p className={`text-sm leading-relaxed mt-0.5 ${
                      turn.complianceFlag === 'flag'
                        ? 'text-red-300'
                        : turn.complianceFlag === 'consent'
                        ? 'text-emerald-300'
                        : 'text-gray-300'
                    }`}>
                      {turn.complianceFlag === 'flag' && <span className="text-red-400 mr-1">{'\u26A0'}</span>}
                      {turn.complianceFlag === 'consent' && <span className="text-emerald-400 mr-1">{'\u2713'}</span>}
                      {turn.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-gray-800">
              <button onClick={() => showToast('PDF transcript downloaded')} className={btnPrimary}>
                Download PDF
              </button>
              <button onClick={() => showToast('Flagged for compliance review')} className={btnSecondary}>
                Flag for Review
              </button>
            </div>
          </div>
        )}
      </DrawerShell>

      {/* ══════════════════════════════════════════════════════════
           FEATURE 3: Pause/Resume Modals
         ══════════════════════════════════════════════════════════ */}
      <ModalShell open={!!pauseModalCampaign} onClose={() => { setPauseModalCampaign(null); setPauseReason(''); setPauseResumeDate(''); }} title="Pause Campaign">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Reason for Pause</label>
            <select value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} className={selectClass}>
              <option value="">Select a reason...</option>
              {PAUSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Resume Date (optional)</label>
            <input type="date" value={pauseResumeDate} onChange={(e) => setPauseResumeDate(e.target.value)} className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setPauseModalCampaign(null); setPauseReason(''); setPauseResumeDate(''); }} className={btnSecondary}>Cancel</button>
            <button onClick={handlePauseCampaign} disabled={!pauseReason} className={`${btnPrimary} bg-amber-600 hover:bg-amber-500`}>Pause Campaign</button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={!!resumeModalCampaign} onClose={() => { setResumeModalCampaign(null); setResumeTCPAConfirmed(false); }} title="Resume Campaign">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Confirm that all TCPA compliance requirements have been verified before resuming this campaign.</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={resumeTCPAConfirmed}
              onChange={(e) => setResumeTCPAConfirmed(e.target.checked)}
              className="mt-0.5 accent-blue-500"
            />
            <span className="text-sm text-gray-300">
              I confirm that TCPA consent has been verified for all contacts in this campaign and all regulatory requirements are met.
            </span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setResumeModalCampaign(null); setResumeTCPAConfirmed(false); }} className={btnSecondary}>Cancel</button>
            <button onClick={handleResumeCampaign} disabled={!resumeTCPAConfirmed} className={btnPrimary}>Resume Campaign</button>
          </div>
        </div>
      </ModalShell>

      {/* ══════════════════════════════════════════════════════════
           FEATURE 4: Compliance Flag Acknowledge/Resolve Modals
         ══════════════════════════════════════════════════════════ */}
      <ModalShell open={!!ackModalFlag} onClose={() => { setAckModalFlag(null); setFlagReviewer(''); setFlagNotes(''); }} title="Acknowledge Flag">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Reviewer Name</label>
            <input value={flagReviewer} onChange={(e) => setFlagReviewer(e.target.value)} placeholder="Enter reviewer name" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea value={flagNotes} onChange={(e) => setFlagNotes(e.target.value)} rows={3} placeholder="Add notes..." className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setAckModalFlag(null); setFlagReviewer(''); setFlagNotes(''); }} className={btnSecondary}>Cancel</button>
            <button onClick={handleAcknowledgeFlag} disabled={!flagReviewer} className={btnPrimary}>Acknowledge</button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={!!resolveModalFlag} onClose={() => { setResolveModalFlag(null); setFlagResolutionAction(''); setFlagNotes(''); }} title="Resolve Flag">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Resolution Action</label>
            <select value={flagResolutionAction} onChange={(e) => setFlagResolutionAction(e.target.value)} className={selectClass}>
              <option value="">Select action...</option>
              {RESOLUTION_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea value={flagNotes} onChange={(e) => setFlagNotes(e.target.value)} rows={3} placeholder="Add notes..." className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setResolveModalFlag(null); setFlagResolutionAction(''); setFlagNotes(''); }} className={btnSecondary}>Cancel</button>
            <button onClick={handleResolveFlag} disabled={!flagResolutionAction} className={btnPrimary}>Resolve</button>
          </div>
        </div>
      </ModalShell>

      {/* ══════════════════════════════════════════════════════════
           FEATURE 5: Sam Delgado Remediation Modal
         ══════════════════════════════════════════════════════════ */}
      <ModalShell open={remediationModalOpen} onClose={() => setRemediationModalOpen(false)} title="Assign Remediation — Sam Delgado">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Remediation Type</label>
            <select value={remediationType} onChange={(e) => setRemediationType(e.target.value)} className={selectClass}>
              <option value="">Select type...</option>
              {REMEDIATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Assigned Officer</label>
            <input value={remediationOfficer} onChange={(e) => setRemediationOfficer(e.target.value)} placeholder="Enter officer name" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Due Date</label>
            <input type="date" value={remediationDueDate} onChange={(e) => setRemediationDueDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea value={remediationNotes} onChange={(e) => setRemediationNotes(e.target.value)} rows={3} placeholder="Additional context..." className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setRemediationModalOpen(false)} className={btnSecondary}>Cancel</button>
            <button onClick={handleSubmitRemediation} disabled={!remediationType || !remediationOfficer || !remediationDueDate} className={btnPrimary}>Submit Remediation</button>
          </div>
        </div>
      </ModalShell>

      {/* ══════════════════════════════════════════════════════════
           FEATURE 6: New Campaign Wizard
         ══════════════════════════════════════════════════════════ */}
      <ModalShell open={newCampaignOpen} onClose={() => { setNewCampaignOpen(false); setNewCampaignStep(1); }} title={`New Campaign — Step ${newCampaignStep} of 3`}>
        {newCampaignStep === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Campaign Name</label>
              <input value={ncName} onChange={(e) => setNcName(e.target.value)} placeholder="e.g., Q2 Balance Transfer Push" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Campaign Type</label>
              <select value={ncType} onChange={(e) => setNcType(e.target.value)} className={selectClass}>
                <option value="">Select type...</option>
                {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Target Segment</label>
              <input value={ncSegment} onChange={(e) => setNcSegment(e.target.value)} placeholder="e.g., High balance multi-card holders" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Max Calls</label>
                <input type="number" value={ncMaxCalls} onChange={(e) => setNcMaxCalls(e.target.value)} placeholder="500" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Daily Limit</label>
                <input type="number" value={ncDailyLimit} onChange={(e) => setNcDailyLimit(e.target.value)} placeholder="50" className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start Date</label>
                <input type="date" value={ncStartDate} onChange={(e) => setNcStartDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>End Date</label>
                <input type="date" value={ncEndDate} onChange={(e) => setNcEndDate(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setNewCampaignStep(2)} disabled={!ncName || !ncType} className={btnPrimary}>Next</button>
            </div>
          </div>
        )}
        {newCampaignStep === 2 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Script Selection</label>
              <select value={ncScript} onChange={(e) => setNcScript(e.target.value)} className={selectClass}>
                <option value="">Select script...</option>
                {SCRIPT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>TTS Voice</label>
              <div className="space-y-2">
                {TTS_VOICES.map((v) => (
                  <label key={v.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="ttsVoice"
                      value={v.id}
                      checked={ncVoice === v.id}
                      onChange={(e) => setNcVoice(e.target.value)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-300">{v.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-3 cursor-pointer bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <input
                type="checkbox"
                checked={ncTCPA}
                onChange={(e) => setNcTCPA(e.target.checked)}
                className="mt-0.5 accent-blue-500"
              />
              <span className="text-sm text-amber-300">
                <strong>TCPA Gate (required):</strong> I confirm that all contacts in the target segment have valid TCPA consent on file.
              </span>
            </label>
            <div className="flex justify-between pt-2">
              <button onClick={() => setNewCampaignStep(1)} className={btnSecondary}>Back</button>
              <button onClick={() => setNewCampaignStep(3)} disabled={!ncScript || !ncTCPA} className={btnPrimary}>Next</button>
            </div>
          </div>
        )}
        {newCampaignStep === 3 && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white">Campaign Summary</h4>
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Name:</span><span className="text-gray-200">{ncName}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Type:</span><span className="text-gray-200">{ncType}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Segment:</span><span className="text-gray-200">{ncSegment || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Max Calls:</span><span className="text-gray-200">{ncMaxCalls || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Daily Limit:</span><span className="text-gray-200">{ncDailyLimit || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Dates:</span><span className="text-gray-200">{ncStartDate || '—'} to {ncEndDate || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Script:</span><span className="text-gray-200">{ncScript}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Voice:</span><span className="text-gray-200">{TTS_VOICES.find((v) => v.id === ncVoice)?.label}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TCPA:</span><span className="text-emerald-400">{'\u2713'} Confirmed</span></div>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setNewCampaignStep(2)} className={btnSecondary}>Back</button>
              <button onClick={handleLaunchCampaign} className={`${btnPrimary} bg-emerald-600 hover:bg-emerald-500`}>Launch Campaign</button>
            </div>
          </div>
        )}
      </ModalShell>

      {/* ══════════════════════════════════════════════════════════
           FEATURE 7: QA Scorecard Drill-Down Drawer
         ══════════════════════════════════════════════════════════ */}
      <DrawerShell open={!!selectedAdvisor} onClose={() => setSelectedAdvisor(null)} width="w-[640px]">
        {advisorData && (
          <div className="p-6 space-y-6">
            {/* Header + Score Ring */}
            <div className="flex items-start gap-5">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1f2937" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke={advisorData.overall >= 80 ? '#10b981' : advisorData.overall >= 70 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="3"
                    strokeDasharray={`${(advisorData.overall / 100) * 97.4} 97.4`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-lg font-bold ${scoreColor(advisorData.overall)}`}>{advisorData.overall}</span>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{advisorData.name}</h3>
                <div className="mt-1 grid grid-cols-3 gap-3 text-xs">
                  <div><span className="text-gray-500">Compliance:</span> <span className={scoreColor(advisorData.compliance)}>{advisorData.compliance}</span></div>
                  <div><span className="text-gray-500">Script:</span> <span className={scoreColor(advisorData.script)}>{advisorData.script}</span></div>
                  <div><span className="text-gray-500">Consent:</span> <span className={scoreColor(advisorData.consent)}>{advisorData.consent}</span></div>
                </div>
              </div>
            </div>

            {/* Sam below-threshold banner */}
            {advisorData.flagged && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-400 font-medium">
                Below threshold — remediation required
              </div>
            )}

            {/* Call history */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Recent Call History</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 uppercase tracking-wider border-b border-gray-800">
                    <th className="text-left py-2 font-medium">ID</th>
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Client</th>
                    <th className="text-right py-2 font-medium">Duration</th>
                    <th className="text-right py-2 font-medium">Score</th>
                    <th className="text-right py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {QA_CALL_HISTORY.map((call) => (
                    <tr key={call.id} className="border-b border-gray-800/50">
                      <td className="py-2 text-gray-400 font-mono">{call.id}</td>
                      <td className="py-2 text-gray-400">{call.date}</td>
                      <td className="py-2 text-gray-300">{call.client}</td>
                      <td className="py-2 text-right text-gray-400 font-mono">{call.duration}</td>
                      <td className={`py-2 text-right font-mono font-bold ${scoreColor(call.score)}`}>{call.score}</td>
                      <td className="py-2 text-right">{call.flags > 0 ? <span className="text-red-400">{call.flags}</span> : <span className="text-gray-600">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Flag history */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Flag History</h4>
              <div className="space-y-2">
                {QA_FLAG_HISTORY.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-gray-950 border border-gray-800 rounded-lg p-3">
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">{flag.type}</span>
                    <div>
                      <p className="text-xs text-gray-300">{flag.description}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{flag.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Score trend placeholder */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Score Trend</h4>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-center text-xs text-gray-500">
                30-day trend — chart visualization placeholder
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-gray-800">
              <button onClick={() => showToast('Remediation assigned')} className={btnPrimary}>Assign Remediation</button>
              <button onClick={() => showToast('QA report exported')} className={btnSecondary}>Export QA Report</button>
            </div>
          </div>
        )}
      </DrawerShell>

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
                  {/* Feature 8: TCPA Consent column */}
                  <th className="text-left px-5 py-3 font-medium">TCPA Consent</th>
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
                      {/* Feature 8: TCPA Consent cell */}
                      <td className="px-5 py-3">
                        {s.tcpaConsent === 'verified' ? (
                          <span className="text-emerald-400 text-xs font-medium">{'\u2713'} Verified</span>
                        ) : (
                          <span className="group relative">
                            <span className="text-red-400 text-xs font-medium">{'\u2717'} Missing</span>
                            <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-gray-800 border border-gray-700 text-xs text-gray-300 px-3 py-2 rounded-lg shadow-xl w-56 z-10">
                              Call blocked — TCPA consent not on file
                            </span>
                            <button
                              onClick={() => showToast('Consent request sent to Brightline Corp')}
                              className="ml-2 text-xs text-blue-400 hover:text-blue-300 underline"
                            >
                              Get Consent
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right space-x-2">
                        <button
                          onClick={() => openRecording(s.id)}
                          className="px-2.5 py-1 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition-colors"
                        >
                          Listen to Recording
                        </button>
                        <button
                          onClick={() => openTranscript(s.id)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-400 bg-gray-700/50 border border-gray-700 rounded-md hover:bg-gray-700 transition-colors"
                        >
                          View Transcript
                        </button>
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 4. Campaign Manager ───────────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Campaign Manager</h2>
            {/* Feature 6: + New Campaign button */}
            <button
              onClick={() => setNewCampaignOpen(true)}
              className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-colors"
            >
              + New Campaign
            </button>
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
                        onClick={() => {
                          if (c.status === 'Active') {
                            setPauseModalCampaign(c.id);
                          } else {
                            setResumeModalCampaign(c.id);
                          }
                        }}
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
                  <tr
                    key={a.name}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedAdvisor(a.name)}
                  >
                    <td className="px-5 py-3 font-medium text-white">{a.name}</td>
                    <td className={`px-5 py-3 text-center font-bold font-mono ${scoreColor(a.overall)}`}>{a.overall}</td>
                    <td className={`px-5 py-3 text-center font-mono ${scoreColor(a.compliance)}`}>{a.compliance}</td>
                    <td className={`px-5 py-3 text-center font-mono ${scoreColor(a.script)}`}>{a.script}</td>
                    <td className={`px-5 py-3 text-center font-mono ${scoreColor(a.consent)}`}>{a.consent}</td>
                    <td className="px-5 py-3">
                      {a.flagged && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRemediationModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors cursor-pointer"
                        >
                          Remediation Required
                        </button>
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
            {/* Feature 4: ACTION REQUIRED banner */}
            {hasUnresolvedCritical && (
              <div className="bg-red-500/15 border-b border-red-500/30 px-5 py-2.5 text-center">
                <span className="text-xs font-bold text-red-400 tracking-wider uppercase">ACTION REQUIRED — Unresolved critical compliance flag</span>
              </div>
            )}
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Compliance Flags</h2>
            </div>
            <div className="divide-y divide-gray-800/50">
              {complianceFlags.map((f) => (
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
                        {f.state === 'resolved' && (
                          <span className="text-xs text-emerald-400 font-medium">Resolved</span>
                        )}
                        {f.state === 'acknowledged' && (
                          <span className="text-xs text-blue-400 font-medium">Acknowledged</span>
                        )}
                      </div>
                      {/* Feature 4: Action buttons */}
                      {f.state === 'unresolved' && (
                        <div className="flex gap-2 mt-2.5">
                          <button
                            onClick={() => setAckModalFlag(f.id)}
                            className="px-2.5 py-1 text-[11px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition-colors"
                          >
                            Acknowledge
                          </button>
                          <button
                            onClick={() => setResolveModalFlag(f.id)}
                            className="px-2.5 py-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-colors"
                          >
                            Resolve
                          </button>
                          {f.severity === 'CRITICAL' && (
                            <button
                              onClick={() => showToast('Escalated to compliance team')}
                              className="px-2.5 py-1 text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-md hover:bg-red-500/20 transition-colors"
                            >
                              Escalate
                            </button>
                          )}
                        </div>
                      )}
                      {f.state === 'acknowledged' && (
                        <div className="flex gap-2 mt-2.5">
                          <button
                            onClick={() => setResolveModalFlag(f.id)}
                            className="px-2.5 py-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-colors"
                          >
                            Resolve
                          </button>
                        </div>
                      )}
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
            onClick={() => setTranscriptSampleOpen(!transcriptSampleOpen)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-800/20 transition-colors"
          >
            <h2 className="text-base font-semibold text-white">Recent Call Transcript Sample</h2>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${transcriptSampleOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {transcriptSampleOpen && (
            <div className="px-5 pb-5 space-y-4">
              {/* Feature 9: Meridian transcript with expand/flag */}
              <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setMeridianTranscriptExpanded(!meridianTranscriptExpanded)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-300">Meridian Holdings — Restack Consultation</span>
                    <span className="text-xs text-gray-600">Marcus Webb &middot; 8m 34s</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${meridianTranscriptExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {meridianTranscriptExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {(TRANSCRIPT_DATA['VS-002'] || []).map((turn, idx) => (
                      <div key={idx} className="flex gap-3">
                        <span className={`flex-shrink-0 inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold h-fit ${
                          turn.speaker === 'ADVISOR'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {turn.speaker}
                        </span>
                        <div>
                          <span className="text-[10px] text-gray-600 font-mono">{turn.timestamp}</span>
                          <p className={`text-xs leading-relaxed mt-0.5 ${
                            turn.complianceFlag === 'flag' ? 'text-red-300 bg-red-500/10 px-2 py-1 rounded border border-red-500/20' : 'text-gray-400'
                          }`}>
                            {turn.complianceFlag === 'flag' && <span className="text-red-400 mr-1">{'\u26A0'}</span>}
                            {turn.text}
                          </p>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => openRecording('VS-002')}
                      className="mt-2 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition-colors"
                    >
                      View Full Recording
                    </button>
                  </div>
                )}
              </div>

              {/* Original Apex sample transcript */}
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-5 font-mono text-sm leading-7 text-gray-400 whitespace-pre-wrap">
                {SESSIONS[0].transcript.split('\n').map((line, i) => {
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

      {/* ── Global animation styles ────────────────────────────── */}
      <style jsx global>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
