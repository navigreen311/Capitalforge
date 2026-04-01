'use client';

// ============================================================
// /compliance — Compliance dashboard
// Overall health score, risk heatmap placeholder,
// recent compliance checks, state law alerts,
// vendor enforcement history.
// ============================================================

import { useState, useEffect } from 'react';
import { complianceApi } from '../../lib/api-client';
import type { RiskLevel, ComplianceCheckType } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceCheck {
  id: string;
  checkType: ComplianceCheckType;
  businessName: string;
  riskLevel: RiskLevel;
  passed: boolean;
  findings: string;
  checkedAt: string;
}

interface StateAlert {
  state: string;
  law: string;
  effectiveDate: string;
  severity: RiskLevel;
  summary: string;
}

interface VendorEnforcement {
  vendor: string;
  action: string;
  authority: string;
  date: string;
  severity: RiskLevel;
}

interface RemediationModal {
  check: ComplianceCheck;
  notes: string;
}

interface HeatmapDrilldown {
  checkType: ComplianceCheckType;
  riskLevel: RiskLevel;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_CHECKS: ComplianceCheck[] = [
  { id: 'cc_001', checkType: 'udap', businessName: 'Apex Ventures LLC', riskLevel: 'low', passed: true, findings: 'No unfair or deceptive practices identified.', checkedAt: '2026-03-30T09:00:00Z' },
  { id: 'cc_002', checkType: 'state_law', businessName: 'NovaTech Solutions Inc.', riskLevel: 'medium', passed: true, findings: 'CA disclosure requirement met; rate disclosure reviewed.', checkedAt: '2026-03-29T14:00:00Z' },
  { id: 'cc_003', checkType: 'kyb', businessName: 'Horizon Retail Partners', riskLevel: 'high', passed: false, findings: 'Beneficial ownership docs incomplete. Follow-up required.', checkedAt: '2026-03-28T11:00:00Z' },
  { id: 'cc_004', checkType: 'aml', businessName: 'Summit Capital Group', riskLevel: 'low', passed: true, findings: 'Sanctions screening clear. No SAR indicators.', checkedAt: '2026-03-27T16:00:00Z' },
  { id: 'cc_005', checkType: 'vendor', businessName: 'Blue Ridge Consulting', riskLevel: 'critical', passed: false, findings: 'Affiliated vendor on CFPB enforcement watch list.', checkedAt: '2026-03-26T10:00:00Z' },
  { id: 'cc_006', checkType: 'kyc', businessName: 'Crestline Medical LLC', riskLevel: 'low', passed: true, findings: 'Identity verified across 3 data sources.', checkedAt: '2026-03-25T08:00:00Z' },
];

const PLACEHOLDER_STATE_ALERTS: StateAlert[] = [
  { state: 'CA', law: 'SB 1235 Commercial Finance Disclosures', effectiveDate: '2026-06-01', severity: 'high', summary: 'Mandatory APR equivalent disclosure for all commercial finance offers above $500K.' },
  { state: 'NY', law: 'Commercial Finance Disclosure Law', effectiveDate: '2026-01-01', severity: 'medium', summary: 'Annual percentage rate and total cost disclosures now required on all business credit.' },
  { state: 'TX', law: 'HB 1442 Business Lending Transparency', effectiveDate: '2026-09-01', severity: 'low', summary: 'New broker compensation disclosure requirements taking effect Q3.' },
  { state: 'FL', law: 'Deceptive Trade Practices Update', effectiveDate: '2026-04-15', severity: 'medium', summary: 'Expanded UDAP provisions covering digital credit application flows.' },
];

const PLACEHOLDER_VENDOR_HISTORY: VendorEnforcement[] = [
  { vendor: 'RapidFund Capital', action: 'Consent Order – misleading APR representations', authority: 'CFPB', date: '2026-02-10', severity: 'critical' },
  { vendor: 'QuickStack LLC', action: 'Civil investigative demand issued', authority: 'FTC', date: '2026-01-22', severity: 'high' },
  { vendor: 'CardStack Pro', action: 'Warning letter – fee transparency', authority: 'CFPB', date: '2025-11-05', severity: 'medium' },
  { vendor: 'FundBridge Inc.', action: 'State AG inquiry – NY', authority: 'NY AG', date: '2025-09-14', severity: 'medium' },
];

const PLACEHOLDER_CLIENTS = [
  'Apex Ventures LLC',
  'NovaTech Solutions Inc.',
  'Horizon Retail Partners',
  'Summit Capital Group',
  'Blue Ridge Consulting',
  'Crestline Medical LLC',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_CONFIG: Record<RiskLevel, { label: string; badgeClass: string; dotClass: string; bgClass: string }> = {
  low:      { label: 'Low',      badgeClass: 'bg-green-900 text-green-300 border-green-700',   dotClass: 'bg-green-400',  bgClass: 'bg-green-950' },
  medium:   { label: 'Medium',   badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700', dotClass: 'bg-yellow-400', bgClass: 'bg-yellow-950' },
  high:     { label: 'High',     badgeClass: 'bg-orange-900 text-orange-300 border-orange-700', dotClass: 'bg-orange-400', bgClass: 'bg-orange-950' },
  critical: { label: 'Critical', badgeClass: 'bg-red-900 text-red-300 border-red-700',          dotClass: 'bg-red-400',    bgClass: 'bg-red-950' },
};

const CHECK_TYPE_LABELS: Record<ComplianceCheckType, string> = {
  udap: 'UDAP', state_law: 'State Law', vendor: 'Vendor', kyb: 'KYB', kyc: 'KYC', aml: 'AML',
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function isOverdue(dateStr: string): boolean {
  const effective = new Date(dateStr);
  const now = new Date();
  return effective < now;
}

function computeHealthScore(checks: ComplianceCheck[]): number {
  if (!checks.length) return 100;
  const passing = checks.filter((c) => c.passed).length;
  const base = (passing / checks.length) * 100;
  const criticalPenalty = checks.filter((c) => !c.passed && c.riskLevel === 'critical').length * 12;
  const highPenalty = checks.filter((c) => !c.passed && c.riskLevel === 'high').length * 6;
  return Math.max(0, Math.round(base - criticalPenalty - highPenalty));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthScoreMeter({ score }: { score: number }) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
  const size = 140;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} aria-label={`Health score ${score}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={12} />
        <circle
          cx={cx} cy={cy} r={radius} fill="none"
          stroke={color} strokeWidth={12} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={28} fontWeight="900" fill={color}>{score}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize={11} fill="#9ca3af">/ 100</text>
      </svg>
      <p className="text-sm font-semibold mt-1" style={{ color }}>
        {score >= 75 ? 'Healthy' : score >= 50 ? 'At Risk' : 'Critical'}
      </p>
    </div>
  );
}

// Risk Heatmap — 6 check types x 4 risk levels, clickable cells
function RiskHeatmap({ checks, onCellClick }: { checks: ComplianceCheck[]; onCellClick: (checkType: ComplianceCheckType, riskLevel: RiskLevel) => void }) {
  const types: ComplianceCheckType[] = ['udap', 'state_law', 'vendor', 'kyb', 'kyc', 'aml'];
  const levels: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs text-center border-collapse">
        <thead>
          <tr>
            <th className="py-2 px-3 text-left text-gray-400 font-semibold">Type \ Risk</th>
            {levels.map((l) => (
              <th key={l} className={`py-2 px-3 font-semibold ${RISK_CONFIG[l].badgeClass.replace('border', '').replace(/bg-\S+\s/, '').trim()} uppercase tracking-wide`}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t} className="border-t border-gray-800">
              <td className="py-2 px-3 text-left text-gray-300 font-semibold">{CHECK_TYPE_LABELS[t]}</td>
              {levels.map((l) => {
                const count = checks.filter((c) => c.checkType === t && c.riskLevel === l).length;
                return (
                  <td key={l} className="py-2 px-3">
                    {count > 0 ? (
                      <button
                        onClick={() => onCellClick(t, l)}
                        className={`inline-flex items-center justify-center h-7 w-7 rounded-lg text-xs font-bold border ${RISK_CONFIG[l].badgeClass} hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer`}
                        title={`View ${CHECK_TYPE_LABELS[t]} / ${RISK_CONFIG[l].label} checks`}
                      >
                        {count}
                      </button>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Remediation Modal
function RemediationModalComponent({
  modal,
  onClose,
  onNotesChange,
  onResolve,
}: {
  modal: RemediationModal;
  onClose: () => void;
  onNotesChange: (notes: string) => void;
  onResolve: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Remediation Required</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Failure detail */}
        <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800">
          <p className="text-xs text-red-300 font-semibold uppercase mb-1">Failure Detail</p>
          <p className="text-sm text-gray-200 font-semibold">{modal.check.businessName}</p>
          <p className="text-xs text-gray-400 mt-1">{modal.check.findings}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[modal.check.riskLevel].badgeClass}`}>
              {RISK_CONFIG[modal.check.riskLevel].label}
            </span>
            <span className="text-xs text-gray-500">{CHECK_TYPE_LABELS[modal.check.checkType]}</span>
          </div>
        </div>

        {/* Remediation steps */}
        <div className="mb-4">
          <p className="text-xs text-gray-400 font-semibold uppercase mb-2">Remediation Steps</p>
          <div className="space-y-2">
            {[
              { step: 1, label: 'Request Documents', desc: 'Send document request to the business contact for missing items.' },
              { step: 2, label: 'Upload to Vault', desc: 'Upload received documentation to the secure compliance vault.' },
              { step: 3, label: 'Re-run Check', desc: 'Trigger a fresh compliance check to verify resolution.' },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-3 p-2 rounded-lg bg-gray-800 border border-gray-700">
                <span className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                  {s.step}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-200">{s.label}</p>
                  <p className="text-xs text-gray-400">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Notes</label>
          <textarea
            value={modal.notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Add remediation notes..."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors">
            Cancel
          </button>
          <button onClick={onResolve} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-semibold text-white transition-colors">
            Mark as Resolved
          </button>
        </div>
      </div>
    </div>
  );
}

// Toast component
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-gray-800 border border-gray-600 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CompliancePage() {
  const [checks, setChecks] = useState<ComplianceCheck[]>(PLACEHOLDER_CHECKS);
  const [stateAlerts] = useState<StateAlert[]>(PLACEHOLDER_STATE_ALERTS);
  const [vendorHistory] = useState<VendorEnforcement[]>(PLACEHOLDER_VENDOR_HISTORY);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'checks' | 'states' | 'vendors'>('checks');

  // New state
  const [runningChecks, setRunningChecks] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [remediationModal, setRemediationModal] = useState<RemediationModal | null>(null);
  const [heatmapDrilldown, setHeatmapDrilldown] = useState<HeatmapDrilldown | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await complianceApi.dashboard();
        if (res.success && res.data) {
          const d = res.data as { checks?: ComplianceCheck[] };
          if (d.checks) setChecks(d.checks);
        }
      } catch { /* placeholder */ }
      finally { setLoading(false); }
    })();
  }, []);

  // Filter checks by selected client
  const filteredByClient = selectedClient === 'all'
    ? checks
    : checks.filter((c) => c.businessName === selectedClient);

  const healthScore = computeHealthScore(filteredByClient);
  const failedChecks = filteredByClient.filter((c) => !c.passed);
  const criticalCount = failedChecks.filter((c) => c.riskLevel === 'critical').length;

  // Checks to display in the Recent Checks tab (with heatmap drilldown filter)
  const displayedChecks = heatmapDrilldown
    ? filteredByClient.filter(
        (c) => c.checkType === heatmapDrilldown.checkType && c.riskLevel === heatmapDrilldown.riskLevel
      )
    : filteredByClient;

  // Placeholder affected clients for heatmap drilldown
  const drilldownAffectedClients = heatmapDrilldown
    ? displayedChecks.map((c) => c.businessName).length > 0
      ? displayedChecks.map((c) => c.businessName)
      : ['ClientA Corp', 'ClientB Holdings', 'ClientC LLC'].slice(0, 3)
    : [];

  // Run Check handler
  const handleRunCheck = () => {
    if (runningChecks) return;
    setRunningChecks(true);
    setTimeout(() => {
      const passed = filteredByClient.filter((c) => c.passed).length;
      const failed = filteredByClient.length - passed;
      setRunningChecks(false);
      setLastChecked(new Date().toISOString());
      setToast(`Compliance check complete: ${passed} passed, ${failed} failed`);
    }, 1500);
  };

  // Export dossier handler
  const handleExportDossier = () => {
    setToast('Compliance dossier exported');
  };

  // Heatmap cell click
  const handleHeatmapCellClick = (checkType: ComplianceCheckType, riskLevel: RiskLevel) => {
    setHeatmapDrilldown({ checkType, riskLevel });
    setActiveTab('checks');
  };

  // Clear heatmap drilldown
  const clearDrilldown = () => {
    setHeatmapDrilldown(null);
  };

  // Remediation
  const handleOpenRemediation = (check: ComplianceCheck) => {
    setRemediationModal({ check, notes: '' });
  };

  const handleResolve = () => {
    if (!remediationModal) return;
    setChecks((prev) =>
      prev.map((c) =>
        c.id === remediationModal.check.id ? { ...c, passed: true, findings: c.findings + ' [Resolved]' } : c
      )
    );
    setToast(`${remediationModal.check.businessName} marked as resolved`);
    setRemediationModal(null);
  };

  // State alert handlers
  const handleViewAffectedClients = (alert: StateAlert) => {
    const count = Math.floor(Math.random() * 8) + 2;
    setToast(`${alert.state} ${alert.law}: ${count} affected clients identified`);
  };

  const handleFileDisclosure = (alert: StateAlert) => {
    setToast(`Filing disclosure for all clients under ${alert.state} ${alert.law}...`);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Client selector */}
      <div className="mb-4">
        <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold mr-3">Client</label>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
        >
          <option value="all">All Clients</option>
          {PLACEHOLDER_CLIENTS.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {filteredByClient.length} checks · {failedChecks.length} failed
            {criticalCount > 0 && (
              <span className="ml-2 text-red-400 font-semibold">!! {criticalCount} critical</span>
            )}
            {lastChecked && (
              <span className="ml-3 text-gray-500">Last checked: {formatDate(lastChecked)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportDossier}
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold transition-colors"
          >
            Export Dossier
          </button>
          <button
            onClick={handleRunCheck}
            disabled={runningChecks}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              runningChecks
                ? 'bg-blue-800 cursor-not-allowed opacity-70'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {runningChecks && (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {runningChecks ? 'Running...' : 'Run Check'}
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Health score */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">
            Overall Health
          </p>
          <HealthScoreMeter score={healthScore} />
        </div>

        {/* Stats */}
        <div className="sm:col-span-2 grid grid-cols-2 gap-4">
          {[
            { label: 'Total Checks', value: filteredByClient.length, color: 'text-gray-100' },
            { label: 'Passed', value: filteredByClient.filter((c) => c.passed).length, color: 'text-green-400' },
            { label: 'Failed', value: failedChecks.length, color: failedChecks.length > 0 ? 'text-red-400' : 'text-gray-400' },
            { label: 'State Alerts', value: stateAlerts.length, color: 'text-yellow-400' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
              <p className={`text-4xl font-black ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Heatmap */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
          Risk Heatmap
          <span className="ml-2 text-xs text-gray-500 font-normal normal-case">Click a cell to filter checks</span>
        </h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : (
          <RiskHeatmap checks={filteredByClient} onCellClick={handleHeatmapCellClick} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {(['checks', 'states', 'vendors'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); if (tab !== 'checks') clearDrilldown(); }}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'checks' ? 'Recent Checks' : tab === 'states' ? 'State Law Alerts' : 'Vendor Enforcement'}
          </button>
        ))}
      </div>

      {/* Tab content — Recent Checks */}
      {activeTab === 'checks' && (
        <div className="space-y-3">
          {/* Heatmap drilldown banner */}
          {heatmapDrilldown && (
            <div className="flex items-center justify-between rounded-xl border border-blue-800 bg-blue-950/50 p-3 mb-1">
              <div>
                <p className="text-sm font-semibold text-blue-300">
                  Filtering: {CHECK_TYPE_LABELS[heatmapDrilldown.checkType]} / {RISK_CONFIG[heatmapDrilldown.riskLevel].label}
                </p>
                {drilldownAffectedClients.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Affected clients: {drilldownAffectedClients.join(', ')}
                  </p>
                )}
              </div>
              <button
                onClick={clearDrilldown}
                className="px-3 py-1 rounded-lg bg-blue-800 hover:bg-blue-700 text-xs font-semibold text-blue-200 transition-colors"
              >
                Clear Filter
              </button>
            </div>
          )}

          {displayedChecks.length === 0 && (
            <p className="text-gray-500 text-sm py-4 text-center">No checks match the current filter.</p>
          )}

          {displayedChecks.map((c) => (
            <div key={c.id} className={`rounded-xl border p-4 ${c.passed ? 'border-gray-800 bg-gray-900' : `border-${RISK_CONFIG[c.riskLevel].dotClass.replace('bg-', '')}-700 ${RISK_CONFIG[c.riskLevel].bgClass}`}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[c.riskLevel].badgeClass}`}>
                      {RISK_CONFIG[c.riskLevel].label}
                    </span>
                    <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                      {CHECK_TYPE_LABELS[c.checkType]}
                    </span>
                    <span className={`text-xs font-semibold ${c.passed ? 'text-green-400' : 'text-red-400'}`}>
                      {c.passed ? 'PASS Passed' : 'FAIL Failed'}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-100 text-sm">{c.businessName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.findings}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-xs text-gray-500 whitespace-nowrap">{formatDate(c.checkedAt)}</p>
                  {!c.passed && (
                    <button
                      onClick={() => handleOpenRemediation(c)}
                      className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors"
                    >
                      Remediate &rarr;
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab content — State Law Alerts */}
      {activeTab === 'states' && (
        <div className="space-y-3">
          {stateAlerts.map((a, i) => {
            const overdue = isOverdue(a.effectiveDate);
            return (
              <div key={i} className={`rounded-xl border p-4 ${RISK_CONFIG[a.severity].bgClass} border-gray-700`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold bg-gray-800 text-gray-300 border border-gray-600 px-2 py-0.5 rounded">
                      {a.state}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[a.severity].badgeClass}`}>
                      {RISK_CONFIG[a.severity].label}
                    </span>
                    {overdue && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-700 text-red-100 border border-red-500 animate-pulse">
                        OVERDUE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">Effective {a.effectiveDate}</p>
                </div>
                <p className="font-semibold text-gray-100 text-sm mb-1">{a.law}</p>
                <p className="text-xs text-gray-400 mb-3">{a.summary}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewAffectedClients(a)}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600 text-xs font-semibold text-gray-300 transition-colors"
                  >
                    View Affected Clients
                  </button>
                  <button
                    onClick={() => handleFileDisclosure(a)}
                    className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-xs font-semibold text-white transition-colors"
                  >
                    File Disclosure for All
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab content — Vendor Enforcement */}
      {activeTab === 'vendors' && (
        <div className="space-y-3">
          {vendorHistory.map((v, i) => (
            <div key={i} className={`rounded-xl border p-4 ${RISK_CONFIG[v.severity].bgClass} border-gray-700`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[v.severity].badgeClass}`}>
                    {RISK_CONFIG[v.severity].label}
                  </span>
                  <span className="text-xs text-gray-400">{v.authority}</span>
                </div>
                <p className="text-xs text-gray-400">{formatDate(v.date)}</p>
              </div>
              <p className="font-semibold text-gray-100 text-sm">{v.vendor}</p>
              <p className="text-xs text-gray-400 mt-0.5">{v.action}</p>
            </div>
          ))}
        </div>
      )}

      {/* Remediation Modal */}
      {remediationModal && (
        <RemediationModalComponent
          modal={remediationModal}
          onClose={() => setRemediationModal(null)}
          onNotesChange={(notes) => setRemediationModal((prev) => prev ? { ...prev, notes } : null)}
          onResolve={handleResolve}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
