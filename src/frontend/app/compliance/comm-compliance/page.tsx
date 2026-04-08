'use client';

// ============================================================
// /compliance/comm-compliance — Communication Compliance
// Communication review log, banned claims detector,
// TCPA consent audit, do-not-contact management,
// communication templates library.
// ============================================================

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommType = 'call' | 'email' | 'sms';
type ConsentStatus = 'granted' | 'revoked' | 'not_obtained';
type ActiveTab = 'log' | 'banned' | 'consent' | 'dnc' | 'templates';

interface CommLogEntry {
  id: string;
  date: string;
  type: CommType;
  business: string;
  summary: string;
  flags: string[];
}

interface ConsentRecord {
  business: string;
  voice: ConsentStatus;
  sms: ConsentStatus;
  email: ConsentStatus;
  lastUpdated: string;
}

interface DncEntry {
  id: string;
  business: string;
  channel: string;
  addedDate: string;
  reason: string;
}

interface CommTemplate {
  id: string;
  name: string;
  channel: CommType;
  category: string;
  body: string;
  approvedBy: string;
  approvedDate: string;
}

interface BannedClaim {
  id: string;
  phrase: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium';
  foundIn: { entryId: string; business: string; type: CommType }[];
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const COMM_LOG: CommLogEntry[] = [
  { id: 'cl_001', date: '2026-04-05', type: 'call', business: 'Apex Ventures LLC', summary: 'Discussed Q2 credit line increase options and rate comparison.', flags: [] },
  { id: 'cl_002', date: '2026-04-04', type: 'email', business: 'NovaTech Solutions Inc.', summary: 'Sent product comparison sheet for business credit cards.', flags: ['missing_disclosure'] },
  { id: 'cl_003', date: '2026-04-04', type: 'sms', business: 'Horizon Retail Partners', summary: 'Appointment reminder for portfolio review meeting.', flags: [] },
  { id: 'cl_004', date: '2026-04-03', type: 'call', business: 'Summit Capital Group', summary: 'Cold outreach call — discussed MCA options. Used phrase "guaranteed approval".', flags: ['banned_claim', 'no_consent'] },
  { id: 'cl_005', date: '2026-04-03', type: 'email', business: 'Blue Ridge Consulting', summary: 'Follow-up on declined application with alternative products.', flags: [] },
  { id: 'cl_006', date: '2026-04-02', type: 'sms', business: 'Crestline Medical LLC', summary: 'Promotional SMS about new credit builder product launch.', flags: ['missing_opt_out'] },
  { id: 'cl_007', date: '2026-04-01', type: 'call', business: 'Pinnacle Logistics', summary: 'Inbound call regarding billing dispute on advisory fee.', flags: [] },
  { id: 'cl_008', date: '2026-04-01', type: 'email', business: 'Summit Capital Group', summary: 'Marketing email containing "guaranteed approval" and "no credit check needed".', flags: ['banned_claim'] },
];

const CONSENT_AUDIT: ConsentRecord[] = [
  { business: 'Apex Ventures LLC', voice: 'granted', sms: 'granted', email: 'granted', lastUpdated: '2026-03-15' },
  { business: 'NovaTech Solutions Inc.', voice: 'granted', sms: 'revoked', email: 'granted', lastUpdated: '2026-03-20' },
  { business: 'Horizon Retail Partners', voice: 'granted', sms: 'granted', email: 'granted', lastUpdated: '2026-02-10' },
  { business: 'Summit Capital Group', voice: 'not_obtained', sms: 'not_obtained', email: 'granted', lastUpdated: '2026-01-05' },
  { business: 'Blue Ridge Consulting', voice: 'granted', sms: 'granted', email: 'revoked', lastUpdated: '2026-03-28' },
  { business: 'Crestline Medical LLC', voice: 'granted', sms: 'granted', email: 'granted', lastUpdated: '2026-03-01' },
  { business: 'Pinnacle Logistics', voice: 'revoked', sms: 'not_obtained', email: 'granted', lastUpdated: '2026-02-20' },
];

const BANNED_CLAIMS: BannedClaim[] = [
  {
    id: 'bc_001', phrase: 'guaranteed approval', reason: 'No credit product approval can be guaranteed; violates FTC Act Section 5 and UDAP.',
    severity: 'critical',
    foundIn: [
      { entryId: 'cl_004', business: 'Summit Capital Group', type: 'call' },
      { entryId: 'cl_008', business: 'Summit Capital Group', type: 'email' },
    ],
  },
  {
    id: 'bc_002', phrase: 'no credit check needed', reason: 'Misleading — all products involve some form of creditworthiness assessment.',
    severity: 'critical',
    foundIn: [{ entryId: 'cl_008', business: 'Summit Capital Group', type: 'email' }],
  },
  {
    id: 'bc_003', phrase: 'zero risk', reason: 'All financial products carry inherent risk; claiming otherwise is deceptive.',
    severity: 'high',
    foundIn: [],
  },
  {
    id: 'bc_004', phrase: 'instant funding', reason: 'Funding timelines depend on underwriting and compliance checks; "instant" is misleading.',
    severity: 'medium',
    foundIn: [],
  },
  {
    id: 'bc_005', phrase: 'unlimited credit', reason: 'All credit products have limits; claiming unlimited is deceptive.',
    severity: 'high',
    foundIn: [],
  },
];

const DNC_LIST: DncEntry[] = [
  { id: 'dnc_001', business: 'Pinnacle Logistics', channel: 'Voice', addedDate: '2026-02-20', reason: 'Client requested no further calls.' },
  { id: 'dnc_002', business: 'NovaTech Solutions Inc.', channel: 'SMS', addedDate: '2026-03-20', reason: 'Consent revoked via opt-out reply.' },
  { id: 'dnc_003', business: 'Blue Ridge Consulting', channel: 'Email', addedDate: '2026-03-28', reason: 'Unsubscribed from marketing emails.' },
];

const TEMPLATES: CommTemplate[] = [
  { id: 'tpl_001', name: 'Initial Outreach — Credit Line', channel: 'email', category: 'Outbound Sales', body: 'Dear [Business Name],\n\nI am reaching out to discuss business credit line options that may benefit your company. Based on our initial assessment, you may qualify for competitive rates.\n\nPlease note that all credit products are subject to underwriting review and approval is not guaranteed.\n\nBest regards,\n[Advisor Name]', approvedBy: 'Compliance Team', approvedDate: '2026-03-01' },
  { id: 'tpl_002', name: 'Appointment Reminder', channel: 'sms', category: 'Operational', body: 'Hi [Contact], this is [Advisor] from CapitalForge. Reminder: your portfolio review is scheduled for [Date] at [Time]. Reply STOP to opt out of messages.', approvedBy: 'Compliance Team', approvedDate: '2026-02-15' },
  { id: 'tpl_003', name: 'Application Follow-Up Call Script', channel: 'call', category: 'Follow-Up', body: 'Hello [Contact], this is [Advisor] calling from CapitalForge regarding your recent business credit application [APP-ID]. I wanted to discuss next steps and answer any questions you may have about the process. This call may be recorded for quality and compliance purposes.', approvedBy: 'Compliance Team', approvedDate: '2026-03-10' },
  { id: 'tpl_004', name: 'Adverse Action Notice Email', channel: 'email', category: 'Compliance', body: 'Dear [Business Name],\n\nWe regret to inform you that your application [APP-ID] for [Product] has been declined. The principal reasons for this decision are:\n\n[Reasons]\n\nYou have the right to request a copy of your credit report and to dispute any inaccurate information.\n\nSincerely,\n[Advisor Name]\nCapitalForge Compliance', approvedBy: 'Legal Team', approvedDate: '2026-01-20' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLAG_CONFIG: Record<string, { label: string; cls: string }> = {
  banned_claim:      { label: 'Banned Claim',      cls: 'bg-red-900 text-red-300 border-red-700' },
  no_consent:        { label: 'No Consent',         cls: 'bg-orange-900 text-orange-300 border-orange-700' },
  missing_disclosure: { label: 'Missing Disclosure', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  missing_opt_out:   { label: 'Missing Opt-Out',    cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
};

const CONSENT_CONFIG: Record<ConsentStatus, { label: string; cls: string }> = {
  granted:      { label: 'Granted',      cls: 'text-green-400' },
  revoked:      { label: 'Revoked',      cls: 'text-red-400' },
  not_obtained: { label: 'Not Obtained', cls: 'text-yellow-400' },
};

const TYPE_ICONS: Record<CommType, string> = { call: '\u260E', email: '\u2709', sms: '\u{1F4F1}' };
const CHANNEL_ICONS: Record<string, string> = { call: '\u260E', email: '\u2709', sms: '\u{1F4F1}' };

const SEVERITY_CLS: Record<string, string> = {
  critical: 'bg-red-900 text-red-300 border-red-700',
  high:     'bg-orange-900 text-orange-300 border-orange-700',
  medium:   'bg-yellow-900 text-yellow-300 border-yellow-700',
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CommCompliancePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('log');
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [dncList, setDncList] = useState<DncEntry[]>(DNC_LIST);
  const [newDncBusiness, setNewDncBusiness] = useState('');
  const [newDncChannel, setNewDncChannel] = useState('Voice');

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'log', label: 'Communication Log' },
    { key: 'banned', label: 'Banned Claims' },
    { key: 'consent', label: 'Consent Audit' },
    { key: 'dnc', label: 'Do-Not-Contact' },
    { key: 'templates', label: 'Templates' },
  ];

  const flaggedCount = COMM_LOG.filter(e => e.flags.length > 0).length;
  const consentIssues = CONSENT_AUDIT.filter(c =>
    c.voice === 'not_obtained' || c.sms === 'not_obtained' ||
    c.voice === 'revoked' || c.sms === 'revoked' || c.email === 'revoked'
  ).length;

  const handleAddDnc = () => {
    if (!newDncBusiness.trim()) return;
    const entry: DncEntry = {
      id: `dnc_${Date.now()}`,
      business: newDncBusiness.trim(),
      channel: newDncChannel,
      addedDate: new Date().toISOString().split('T')[0],
      reason: 'Manually added by compliance officer.',
    };
    setDncList(prev => [entry, ...prev]);
    setNewDncBusiness('');
  };

  const handleRemoveDnc = (id: string) => {
    setDncList(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Communication Compliance</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {COMM_LOG.length} communications · {flaggedCount} flagged · {consentIssues} consent issues
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Communication Log Tab ─────────────────────────────────── */}
      {activeTab === 'log' && (
        <div className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold">Date</th>
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold">Type</th>
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold">Business</th>
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold">Content Summary</th>
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody>
              {COMM_LOG.map(entry => (
                <tr key={entry.id} className={`border-b border-gray-800/50 hover:bg-gray-900/50 ${entry.flags.length > 0 ? 'bg-red-950/20' : ''}`}>
                  <td className="py-3 px-3 text-gray-300 whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded">
                      {TYPE_ICONS[entry.type]} {entry.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-gray-200 font-medium">{entry.business}</td>
                  <td className="py-3 px-3 text-gray-400 max-w-md">{entry.summary}</td>
                  <td className="py-3 px-3">
                    {entry.flags.length === 0 ? (
                      <span className="text-xs text-green-500">Clean</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {entry.flags.map(f => (
                          <span key={f} className={`text-xs font-bold px-2 py-0.5 rounded-full border ${FLAG_CONFIG[f]?.cls || 'bg-gray-800 text-gray-300 border-gray-600'}`}>
                            {FLAG_CONFIG[f]?.label || f}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* ── Banned Claims Tab ─────────────────────────────────────── */}
      {activeTab === 'banned' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 mb-2">Flagged phrases detected in communications. Highlighted phrases are prohibited under FTC/UDAP regulations.</p>
          {BANNED_CLAIMS.map(claim => (
            <div key={claim.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SEVERITY_CLS[claim.severity]}`}>
                    {claim.severity.charAt(0).toUpperCase() + claim.severity.slice(1)}
                  </span>
                  <span className="text-sm font-bold text-white">
                    &ldquo;<span className="text-red-400 underline decoration-red-500">{claim.phrase}</span>&rdquo;
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {claim.foundIn.length} occurrence{claim.foundIn.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{claim.reason}</p>
              {claim.foundIn.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Found in:</p>
                  {claim.foundIn.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-1.5">
                      <span>{CHANNEL_ICONS[f.type]}</span>
                      <span className="font-medium text-gray-300">{f.business}</span>
                      <span className="text-gray-600">({f.type})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Consent Audit Tab ─────────────────────────────────────── */}
      {activeTab === 'consent' && (
        <div className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold">Business</th>
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold text-center">Voice</th>
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold text-center">SMS</th>
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold text-center">Email</th>
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {CONSENT_AUDIT.map((record, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-3 px-3 text-gray-200 font-medium">{record.business}</td>
                  <td className={`py-3 px-3 text-center text-xs font-semibold ${CONSENT_CONFIG[record.voice].cls}`}>
                    {CONSENT_CONFIG[record.voice].label}
                  </td>
                  <td className={`py-3 px-3 text-center text-xs font-semibold ${CONSENT_CONFIG[record.sms].cls}`}>
                    {CONSENT_CONFIG[record.sms].label}
                  </td>
                  <td className={`py-3 px-3 text-center text-xs font-semibold ${CONSENT_CONFIG[record.email].cls}`}>
                    {CONSENT_CONFIG[record.email].label}
                  </td>
                  <td className="py-3 px-3 text-gray-400 text-xs">{formatDate(record.lastUpdated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* ── Do-Not-Contact Tab ────────────────────────────────────── */}
      {activeTab === 'dnc' && (
        <div>
          {/* Add DNC form */}
          <div className="flex items-end gap-3 mb-6 p-4 rounded-xl border border-gray-800 bg-gray-900">
            <div className="flex-1">
              <label className="text-xs text-gray-400 uppercase font-semibold block mb-1">Business Name</label>
              <input
                type="text"
                value={newDncBusiness}
                onChange={e => setNewDncBusiness(e.target.value)}
                placeholder="Enter business name..."
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase font-semibold block mb-1">Channel</label>
              <select
                value={newDncChannel}
                onChange={e => setNewDncChannel(e.target.value)}
                className="rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
              >
                <option>Voice</option>
                <option>SMS</option>
                <option>Email</option>
                <option>All Channels</option>
              </select>
            </div>
            <button
              onClick={handleAddDnc}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#d4b65e] text-[#0A1628] text-sm font-bold transition-colors"
            >
              Add to DNC
            </button>
          </div>

          {/* DNC List */}
          <div className="space-y-2">
            {dncList.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">Do-not-contact list is empty.</p>
            )}
            {dncList.map(entry => (
              <div key={entry.id} className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-100">{entry.business}</p>
                  <p className="text-xs text-gray-400">
                    {entry.channel} · Added {formatDate(entry.addedDate)} · {entry.reason}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveDnc(entry.id)}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Templates Tab ─────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 mb-2">Pre-approved communication scripts and templates. Click to expand.</p>
          {TEMPLATES.map(tpl => (
            <div key={tpl.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded">
                      {TYPE_ICONS[tpl.channel]} {tpl.channel.toUpperCase()}
                    </span>
                    <span className="text-xs bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded">
                      {tpl.category}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-100 text-sm">{tpl.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Approved by {tpl.approvedBy} on {formatDate(tpl.approvedDate)}</p>
                </div>
                <button
                  onClick={() => setExpandedTemplate(expandedTemplate === tpl.id ? null : tpl.id)}
                  className="text-xs font-semibold text-[#C9A84C] hover:text-[#d4b65e] transition-colors"
                >
                  {expandedTemplate === tpl.id ? 'Collapse' : 'View Script'}
                </button>
              </div>
              {expandedTemplate === tpl.id && (
                <div className="mt-3 p-3 rounded-lg bg-[#0A1628] border border-gray-700">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{tpl.body}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
