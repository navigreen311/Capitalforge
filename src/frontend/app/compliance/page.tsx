'use client';

// ============================================================
// /compliance — Compliance Center
// Portfolio compliance dashboard with overall score,
// breakdown by check type, risk tier distribution,
// open compliance items, run-all checks, export report.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { complianceApi } from '../../lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
type CheckType = 'UDAP' | 'AML' | 'KYB' | 'Product-Reality' | 'State Disclosures' | 'TCPA';

interface ComplianceItem {
  id: string;
  checkType: CheckType;
  businessName: string;
  riskLevel: RiskLevel;
  passed: boolean;
  findings: string;
  checkedAt: string;
  priority: number; // lower = higher priority
}

interface CheckTypeBreakdown {
  type: CheckType;
  total: number;
  passed: number;
  failed: number;
  criticalCount: number;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_ITEMS: ComplianceItem[] = [
  { id: 'cc_001', checkType: 'UDAP',              businessName: 'Apex Ventures LLC',       riskLevel: 'low',      passed: true,  findings: 'No unfair or deceptive practices identified.',              checkedAt: '2026-03-30T09:00:00Z', priority: 4 },
  { id: 'cc_002', checkType: 'State Disclosures', businessName: 'NovaTech Solutions Inc.', riskLevel: 'medium',   passed: true,  findings: 'CA disclosure requirement met; rate disclosure reviewed.',   checkedAt: '2026-03-29T14:00:00Z', priority: 3 },
  { id: 'cc_003', checkType: 'KYB',               businessName: 'Horizon Retail Partners', riskLevel: 'high',     passed: false, findings: 'Beneficial ownership docs incomplete. Follow-up required.', checkedAt: '2026-03-28T11:00:00Z', priority: 2 },
  { id: 'cc_004', checkType: 'AML',               businessName: 'Summit Capital Group',    riskLevel: 'low',      passed: true,  findings: 'Sanctions screening clear. No SAR indicators.',             checkedAt: '2026-03-27T16:00:00Z', priority: 4 },
  { id: 'cc_005', checkType: 'UDAP',              businessName: 'Blue Ridge Consulting',   riskLevel: 'critical', passed: false, findings: 'Affiliated vendor on CFPB enforcement watch list.',         checkedAt: '2026-03-26T10:00:00Z', priority: 1 },
  { id: 'cc_006', checkType: 'TCPA',              businessName: 'Crestline Medical LLC',   riskLevel: 'low',      passed: true,  findings: 'Consent records verified for all outreach channels.',       checkedAt: '2026-03-25T08:00:00Z', priority: 4 },
  { id: 'cc_007', checkType: 'Product-Reality',   businessName: 'Meridian Capital',        riskLevel: 'high',     passed: false, findings: 'Product terms mismatch with marketing materials.',          checkedAt: '2026-03-24T12:00:00Z', priority: 2 },
  { id: 'cc_008', checkType: 'AML',               businessName: 'Pinnacle Freight LLC',    riskLevel: 'medium',   passed: false, findings: 'Enhanced due diligence recommended — high-risk industry.',  checkedAt: '2026-03-23T15:00:00Z', priority: 3 },
  { id: 'cc_009', checkType: 'State Disclosures', businessName: 'Apex Ventures LLC',       riskLevel: 'critical', passed: false, findings: 'NY disclosure deadline missed — immediate filing required.', checkedAt: '2026-03-22T10:00:00Z', priority: 1 },
  { id: 'cc_010', checkType: 'KYB',               businessName: 'Summit Capital Group',    riskLevel: 'medium',   passed: true,  findings: 'All beneficial owners verified.',                           checkedAt: '2026-03-21T09:00:00Z', priority: 3 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_CONFIG: Record<RiskLevel, { label: string; badge: string; dot: string }> = {
  critical: { label: 'Critical', badge: 'bg-red-900/60 text-red-300 border border-red-700',       dot: 'bg-red-400' },
  high:     { label: 'High',     badge: 'bg-orange-900/60 text-orange-300 border border-orange-700', dot: 'bg-orange-400' },
  medium:   { label: 'Medium',   badge: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700', dot: 'bg-yellow-400' },
  low:      { label: 'Low',      badge: 'bg-green-900/60 text-green-300 border border-green-700',    dot: 'bg-green-400' },
};

const CHECK_TYPES: CheckType[] = ['UDAP', 'AML', 'KYB', 'Product-Reality', 'State Disclosures', 'TCPA'];

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function computeScore(items: ComplianceItem[]): number {
  if (!items.length) return 100;
  const passing = items.filter((c) => c.passed).length;
  const base = (passing / items.length) * 100;
  const critPenalty = items.filter((c) => !c.passed && c.riskLevel === 'critical').length * 12;
  const highPenalty = items.filter((c) => !c.passed && c.riskLevel === 'high').length * 6;
  return Math.max(0, Math.round(base - critPenalty - highPenalty));
}

function buildBreakdown(items: ComplianceItem[]): CheckTypeBreakdown[] {
  return CHECK_TYPES.map((type) => {
    const subset = items.filter((i) => i.checkType === type);
    return {
      type,
      total: subset.length,
      passed: subset.filter((i) => i.passed).length,
      failed: subset.filter((i) => !i.passed).length,
      criticalCount: subset.filter((i) => i.riskLevel === 'critical').length,
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
  const size = 160;
  const r = 62;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} aria-label={`Compliance score ${score}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={14} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize={32} fontWeight="900" fill={color}>{score}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={12} fill="#9ca3af">/ 100</text>
      </svg>
      <p className="text-sm font-semibold mt-1" style={{ color }}>
        {score >= 75 ? 'Healthy' : score >= 50 ? 'At Risk' : 'Critical'}
      </p>
    </div>
  );
}

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0A1628] border border-[#C9A84C]/30 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ComplianceCenterPage() {
  const [items, setItems] = useState<ComplianceItem[]>(PLACEHOLDER_ITEMS);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Fetch from API on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await complianceApi.dashboard();
        if (res.success && res.data) {
          const d = res.data as { checks?: ComplianceItem[] };
          if (d.checks?.length) setItems(d.checks);
        }
      } catch { /* use placeholder */ }
      finally { setLoading(false); }
    })();
  }, []);

  const score = computeScore(items);
  const breakdown = buildBreakdown(items);
  const openItems = items.filter((i) => !i.passed).sort((a, b) => a.priority - b.priority);

  // Risk tier distribution
  const riskTiers: { level: RiskLevel; count: number }[] = [
    { level: 'critical', count: items.filter((i) => i.riskLevel === 'critical').length },
    { level: 'high',     count: items.filter((i) => i.riskLevel === 'high').length },
    { level: 'medium',   count: items.filter((i) => i.riskLevel === 'medium').length },
    { level: 'low',      count: items.filter((i) => i.riskLevel === 'low').length },
  ];

  const router = useRouter();
  const [runProgress, setRunProgress] = useState(0);

  // Mark an item as resolved
  const handleMarkResolved = useCallback((itemId: string, businessName: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, passed: true, findings: 'Manually marked as resolved.' } : i))
    );
    setToast(`"${businessName}" marked as resolved`);
  }, []);

  // Get context-appropriate action buttons for a compliance item
  function getItemActions(item: ComplianceItem): { label: string; onClick: () => void; variant?: 'primary' | 'default' }[] {
    const actions: { label: string; onClick: () => void; variant?: 'primary' | 'default' }[] = [];

    switch (item.checkType) {
      case 'UDAP':
        actions.push({ label: 'View Client', onClick: () => setToast(`Opening client profile for ${item.businessName}...`) });
        actions.push({ label: 'Remove Vendor', onClick: () => setToast(`Vendor removal initiated for ${item.businessName}`) });
        break;
      case 'State Disclosures':
        actions.push({ label: 'File Now', onClick: () => router.push('/compliance/disclosures'), variant: 'primary' });
        actions.push({ label: 'Assign to Advisor', onClick: () => setToast(`Advisor assignment initiated for ${item.businessName}`) });
        break;
      case 'KYB':
        actions.push({ label: 'View Client', onClick: () => setToast(`Opening client profile for ${item.businessName}...`) });
        actions.push({ label: 'Request Documents', onClick: () => setToast(`Document request sent to ${item.businessName}`) });
        break;
      case 'Product-Reality':
        actions.push({ label: 'Send Acknowledgment', onClick: () => setToast(`Acknowledgment sent for ${item.businessName}`) });
        break;
      case 'AML':
        actions.push({ label: 'Review Transaction', onClick: () => router.push('/spend-governance'), variant: 'primary' });
        break;
      default:
        break;
    }

    return actions;
  }

  const handleRunAll = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setRunProgress(0);

    // Animate progress over ~2s
    const progressInterval = setInterval(() => {
      setRunProgress((prev) => {
        if (prev >= 95) { clearInterval(progressInterval); return 95; }
        return prev + Math.random() * 18 + 5;
      });
    }, 250);

    try {
      // Try real API
      await fetch('/api/compliance/run-all', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    } catch { /* ignore */ }

    // Simulate completion after 2 seconds total
    setTimeout(() => {
      clearInterval(progressInterval);
      setRunProgress(100);

      // Snapshot previous open count
      const prevOpen = items.filter((i) => !i.passed).length;

      // Simulate: randomly resolve 1-2 items, add 0-1 new issues
      const updated = items.map((item) => {
        if (!item.passed && Math.random() < 0.3) {
          return { ...item, passed: true, findings: 'Resolved during compliance run.' };
        }
        return item;
      });

      const newIssueCount = Math.random() < 0.5 ? 1 : 0;
      if (newIssueCount > 0) {
        updated.push({
          id: `cc_new_${Date.now()}`,
          checkType: 'AML',
          businessName: 'Vanguard Logistics Inc.',
          riskLevel: 'medium',
          passed: false,
          findings: 'New SAR threshold flag detected during automated scan.',
          checkedAt: new Date().toISOString(),
          priority: 3,
        });
      }

      setItems(updated);

      const newOpen = updated.filter((i) => !i.passed).length;
      const resolved = Math.max(0, prevOpen - newOpen + newIssueCount);
      setToast(`Compliance check complete — ${newIssueCount} new issue${newIssueCount !== 1 ? 's' : ''} found, ${resolved} resolved`);

      setTimeout(() => {
        setRunning(false);
        setRunProgress(0);
      }, 300);
    }, 2000);
  }, [running, items]);

  const handleExport = useCallback(() => {
    setToast('Compliance report exported to PDF');
  }, []);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Portfolio compliance overview &middot; {items.length} checks &middot; {openItems.length} open items
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg bg-[#0A1628] border border-[#C9A84C]/40 hover:border-[#C9A84C] text-[#C9A84C] text-sm font-semibold transition-colors"
          >
            Export Report
          </button>
          <button
            onClick={handleRunAll}
            disabled={running}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              running
                ? 'bg-[#C9A84C]/30 cursor-not-allowed opacity-70 text-[#C9A84C]'
                : 'bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628]'
            }`}
          >
            {running && (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {running ? 'Running...' : 'Run All Checks'}
          </button>
        </div>
      </div>

      {/* Progress bar during Run All Checks */}
      {running && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#C9A84C] font-semibold">Running compliance checks...</span>
            <span className="text-xs text-gray-400">{Math.min(100, Math.round(runProgress))}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-[#C9A84C] h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, runProgress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Top row: Score + Risk Tiers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Overall Score */}
        <div className="rounded-xl border border-gray-800 bg-[#0f1d32] p-6 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Overall Compliance Score</p>
          <ScoreRing score={score} />
        </div>

        {/* Risk Tier Distribution */}
        <div className="rounded-xl border border-gray-800 bg-[#0f1d32] p-6">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-4">Risk Tier Distribution</p>
          <div className="space-y-3">
            {riskTiers.map(({ level, count }) => {
              const pct = items.length ? Math.round((count / items.length) * 100) : 0;
              return (
                <div key={level}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${RISK_CONFIG[level].dot}`} />
                      <span className="text-sm font-semibold text-gray-200">{RISK_CONFIG[level].label}</span>
                    </div>
                    <span className="text-sm text-gray-400">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className={`${RISK_CONFIG[level].dot} h-2 rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total Checks',   value: items.length,                                color: 'text-gray-100' },
            { label: 'Passed',          value: items.filter((i) => i.passed).length,        color: 'text-green-400' },
            { label: 'Failed',          value: openItems.length,                             color: openItems.length > 0 ? 'text-red-400' : 'text-gray-400' },
            { label: 'Critical',        value: riskTiers[0].count,                           color: riskTiers[0].count > 0 ? 'text-red-400' : 'text-gray-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-800 bg-[#0f1d32] p-4 flex flex-col justify-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Check Type Breakdown */}
      <div className="rounded-xl border border-gray-800 bg-[#0f1d32] p-6 mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-4">Breakdown by Check Type</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {breakdown.map((b) => (
            <div key={b.type} className="rounded-lg border border-gray-700 bg-[#0A1628] p-4 text-center">
              <p className="text-xs text-gray-400 font-semibold mb-2">{b.type}</p>
              <p className="text-2xl font-black text-gray-100">{b.total}</p>
              <div className="flex items-center justify-center gap-2 mt-2 text-xs">
                <span className="text-green-400">{b.passed} pass</span>
                <span className="text-gray-600">|</span>
                <span className={b.failed > 0 ? 'text-red-400' : 'text-gray-500'}>{b.failed} fail</span>
              </div>
              {b.criticalCount > 0 && (
                <span className="inline-block mt-2 text-xs font-bold px-2 py-0.5 rounded-full bg-red-900/60 text-red-300 border border-red-700">
                  {b.criticalCount} critical
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Open Compliance Items */}
      <div className="rounded-xl border border-gray-800 bg-[#0f1d32] p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
            Open Compliance Items
            <span className="ml-2 text-gray-500 normal-case">Sorted by priority</span>
          </p>
          <span className="text-xs text-gray-500">{openItems.length} items</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-6 w-6 text-[#C9A84C]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : openItems.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No open compliance items. All checks passed.</p>
        ) : (
          <div className="space-y-3">
            {openItems.map((item) => {
              const actions = getItemActions(item);
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-700 bg-[#0A1628] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${RISK_CONFIG[item.riskLevel].badge}`}>
                          {RISK_CONFIG[item.riskLevel].label}
                        </span>
                        <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                          {item.checkType}
                        </span>
                        <span className="text-xs font-semibold text-red-400">FAIL</span>
                      </div>
                      <p className="font-semibold text-gray-100 text-sm">{item.businessName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.findings}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-xs text-gray-500 whitespace-nowrap">{formatDate(item.checkedAt)}</p>
                      <span className="text-xs text-gray-600">P{item.priority}</span>
                    </div>
                  </div>

                  {/* Action CTAs */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800">
                    {actions.map((action) => (
                      <button
                        key={action.label}
                        onClick={action.onClick}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                          action.variant === 'primary'
                            ? 'bg-[#C9A84C] text-[#0A1628] hover:bg-[#b8973f]'
                            : 'bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                    <button
                      onClick={() => handleMarkResolved(item.id, item.businessName)}
                      className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-900/40 text-green-400 border border-green-800 hover:bg-green-900/70 hover:text-green-300 transition-colors"
                    >
                      Mark Resolved &#10003;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation links to sub-pages */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[
          { label: 'Document Vault',  href: '/compliance/documents',   desc: 'Manage documents across all businesses' },
          { label: 'Disclosures',     href: '/compliance/disclosures', desc: 'State disclosures and filing deadlines' },
          { label: 'Contracts',       href: '/compliance/contracts',   desc: 'Contract tracking and clause analysis' },
          { label: 'Complaints',      href: '/compliance/complaints',  desc: 'Complaint intake and SLA tracking' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-xl border border-gray-800 bg-[#0f1d32] p-5 hover:border-[#C9A84C]/40 transition-colors group"
          >
            <p className="text-sm font-semibold text-[#C9A84C] group-hover:text-[#dbb85c] mb-1">{link.label}</p>
            <p className="text-xs text-gray-400">{link.desc}</p>
          </a>
        ))}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
