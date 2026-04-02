'use client';

// ============================================================
// /reports — Tax reports, portfolio benchmarks, revenue analytics,
// compliance exports — fully wired buttons, schedule modal,
// revenue analytics tab, enhanced benchmarks
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────

type ReportTab = 'tax' | 'portfolio' | 'revenue' | 'compliance';

interface ReportItem {
  id: string;
  name: string;
  description: string;
  period: string;
  status: 'ready' | 'generating' | 'error';
  generatedAt?: string;
  sizeKb?: number;
}

interface DownloadAuditEntry {
  who: string;
  when: string;
  ip: string;
}

interface DownloadMeta {
  count: number;
  lastDownloaded: string | null;
  audit: DownloadAuditEntry[];
}

interface GenerateReportRow {
  id: string;
  name: string;
  scope: string;
  format: string;
  status: 'generating' | 'ready';
  createdAt: string;
}

// ── Mock report data ──────────────────────────────────────────

const TAX_REPORTS: ReportItem[] = [
  {
    id: 'tax-163j-2025',
    name: 'IRC §163(j) Interest Limitation Report',
    description: 'Business interest expense deductibility analysis',
    period: 'FY 2025',
    status: 'ready',
    generatedAt: '2026-03-15',
    sizeKb: 248,
  },
  {
    id: 'tax-ye-2025',
    name: 'Year-End Tax Summary',
    description: 'Aggregate fees, interest, and deductible expenses',
    period: 'FY 2025',
    status: 'ready',
    generatedAt: '2026-03-10',
    sizeKb: 185,
  },
  {
    id: 'tax-q1-2026',
    name: 'Q1 2026 Estimated Tax Support',
    description: 'Quarterly funding cost allocation for estimated tax payments',
    period: 'Q1 2026',
    status: 'generating',
  },
  {
    id: 'tax-irc-2024',
    name: 'IRC §163(j) Interest Limitation Report',
    description: 'Business interest expense deductibility analysis',
    period: 'FY 2024',
    status: 'ready',
    generatedAt: '2025-03-18',
    sizeKb: 212,
  },
];

const PORTFOLIO_METRICS = [
  { label: 'Total Deployed Capital',    value: '$14.2M',   change: '+$1.1M',  up: true  },
  { label: 'Avg. Funding per Client',   value: '$96,000',  change: '+$4,200', up: true  },
  { label: 'Portfolio Approval Rate',   value: '68%',      change: '-2pts',   up: false },
  { label: 'Avg. Intro APR Saved',      value: '18.9%',    change: '+0.4pts', up: true  },
  { label: 'Active Credit Stacks',      value: '148',      change: '+6',      up: true  },
  { label: 'Avg. Stack Credit Lines',   value: '4.2',      change: '+0.3',    up: true  },
  { label: 'Avg. Time to Fund',         value: '11 days',  change: '-1 day',  up: true  },
  { label: 'Compliance Score (Avg.)',   value: '84%',      change: '+2pts',   up: true  },
];

const REVENUE_BY_PERIOD = [
  { month: 'Apr',  programFees: 52_000, fundingFees: 38_000 },
  { month: 'May',  programFees: 58_000, fundingFees: 41_000 },
  { month: 'Jun',  programFees: 62_000, fundingFees: 44_000 },
  { month: 'Jul',  programFees: 55_000, fundingFees: 40_000 },
  { month: 'Aug',  programFees: 64_000, fundingFees: 46_000 },
  { month: 'Sep',  programFees: 68_000, fundingFees: 48_000 },
  { month: 'Oct',  programFees: 71_000, fundingFees: 51_000 },
  { month: 'Nov',  programFees: 75_000, fundingFees: 54_000 },
  { month: 'Dec',  programFees: 80_000, fundingFees: 58_000 },
  { month: 'Jan',  programFees: 72_000, fundingFees: 52_000 },
  { month: 'Feb',  programFees: 78_000, fundingFees: 56_000 },
  { month: 'Mar',  programFees: 85_000, fundingFees: 62_000 },
];

const REVENUE_ADVISORS = [
  { name: 'Sarah Mitchell',  clients: 38, revenue: 284_200, retention: '72%' },
  { name: 'James Park',      clients: 32, revenue: 241_800, retention: '68%' },
  { name: 'Lisa Hernandez',  clients: 29, revenue: 198_400, retention: '65%' },
  { name: 'David Chen',      clients: 25, revenue: 176_000, retention: '70%' },
];

const COMPLIANCE_EXPORTS: ReportItem[] = [
  {
    id: 'comp-udap-q1',
    name: 'UDAP Risk Assessment Export',
    description: 'Quarterly UDAP compliance audit with findings',
    period: 'Q1 2026',
    status: 'ready',
    generatedAt: '2026-03-28',
    sizeKb: 320,
  },
  {
    id: 'comp-consent-log',
    name: 'Consent Records Export',
    description: 'Full TCPA / data-sharing consent audit trail',
    period: 'YTD 2026',
    status: 'ready',
    generatedAt: '2026-03-31',
    sizeKb: 512,
  },
  {
    id: 'comp-1071-q1',
    name: 'Section 1071 Fair Lending Report',
    description: 'Small business lending demographic data summary',
    period: 'Q1 2026',
    status: 'ready',
    generatedAt: '2026-03-30',
    sizeKb: 188,
  },
  {
    id: 'comp-adr-2026',
    name: 'Adverse Action Notice Log',
    description: 'All adverse action notices issued YTD',
    period: 'YTD 2026',
    status: 'generating',
  },
];

// ── Mock audit data per report ───────────────────────────────

function getMockAudit(reportId: string): DownloadAuditEntry[] {
  const audits: Record<string, DownloadAuditEntry[]> = {
    'tax-163j-2025': [
      { who: 'Sarah Mitchell', when: '2026-03-16 09:22 AM', ip: '192.168.1.42' },
      { who: 'James Park', when: '2026-03-17 02:15 PM', ip: '10.0.0.88' },
      { who: 'David Chen', when: '2026-03-20 11:04 AM', ip: '172.16.0.15' },
    ],
    'tax-ye-2025': [
      { who: 'Lisa Hernandez', when: '2026-03-11 10:30 AM', ip: '192.168.1.55' },
      { who: 'Sarah Mitchell', when: '2026-03-12 04:45 PM', ip: '192.168.1.42' },
    ],
    'tax-irc-2024': [
      { who: 'James Park', when: '2025-03-20 08:12 AM', ip: '10.0.0.88' },
      { who: 'David Chen', when: '2025-04-02 01:33 PM', ip: '172.16.0.15' },
    ],
  };
  return audits[reportId] || [
    { who: 'Admin User', when: '2026-03-29 03:00 PM', ip: '192.168.1.1' },
    { who: 'Sarah Mitchell', when: '2026-03-30 09:15 AM', ip: '192.168.1.42' },
  ];
}

// ── Helpers ──────────────────────────────────────────────────

const STATUS_STYLES: Record<ReportItem['status'], string> = {
  ready:      'bg-emerald-900 text-emerald-300 border border-emerald-700',
  generating: 'bg-amber-900 text-amber-300 border border-amber-700 animate-pulse',
  error:      'bg-red-900 text-red-300 border border-red-700',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function nowStr() {
  return new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Toast ────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-100 shadow-xl animate-fade-in">
      {message}
    </div>
  );
}

// ── Confirmation Modal ──────────────────────────────────────

function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Audit Log Popover ───────────────────────────────────────

function AuditPopover({ audit, open, onClose }: { audit: DownloadAuditEntry[]; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-40 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-3">
      <p className="text-xs font-semibold text-gray-300 mb-2">Download Audit Log</p>
      <div className="space-y-2">
        {audit.map((a, i) => (
          <div key={i} className="text-[11px] text-gray-400 flex justify-between">
            <span className="text-gray-300 font-medium">{a.who}</span>
            <span>{a.when}</span>
            <span className="text-gray-500">{a.ip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Report Row (enhanced) ───────────────────────────────────

function ReportRow({ item }: { item: ReportItem }) {
  const [status, setStatus] = useState(item.status);
  const [generatedAt, setGeneratedAt] = useState(item.generatedAt);
  const [showConfirm, setShowConfirm] = useState(false);
  const [downloadMeta, setDownloadMeta] = useState<DownloadMeta>(() => {
    const audit = getMockAudit(item.id);
    return {
      count: audit.length,
      lastDownloaded: audit.length > 0 ? audit[audit.length - 1].when : null,
      audit,
    };
  });
  const [showAudit, setShowAudit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string, durationMs = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(null), durationMs);
  }, []);

  const onDownload = useCallback(() => {
    if (status !== 'ready') return;
    showToast('Downloading...');
    setTimeout(() => {
      const slug = item.id.toUpperCase().replace(/^TAX-/, 'IRC-').replace(/^COMP-/, 'COMP-');
      const filename = `${slug}-${item.period.replace(/\s+/g, '')}.pdf`;
      const blob = new Blob(['%PDF-1.4 placeholder content'], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const now = nowStr();
      setDownloadMeta((prev) => ({
        count: prev.count + 1,
        lastDownloaded: now,
        audit: [...prev.audit, { who: 'Current User', when: now, ip: '192.168.1.100' }],
      }));
      showToast('Download complete');
    }, 1200);
  }, [status, item.id, item.period, showToast]);

  const onRegenerate = useCallback(() => {
    setShowConfirm(true);
  }, []);

  const confirmRegenerate = useCallback(() => {
    setShowConfirm(false);
    setStatus('generating');
    setTimeout(() => {
      setStatus('ready');
      setGeneratedAt(todayStr());
    }, 2000);
  }, []);

  return (
    <>
      <Toast message={toast || ''} visible={!!toast} />
      <ConfirmModal
        open={showConfirm}
        title="Regenerate Report"
        message={`This will refresh all data for "${item.name}" as of today. Proceed?`}
        onConfirm={confirmRegenerate}
        onCancel={() => setShowConfirm(false)}
      />
      <div className="flex flex-col p-4 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-850 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <p className="text-sm font-semibold text-gray-100">{item.name}</p>
              <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded-full">
                {item.period}
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
                {status}
              </span>
            </div>
            <p className="text-xs text-gray-500">{item.description}</p>
            {generatedAt && (
              <p className="text-[11px] text-gray-600 mt-0.5">
                Generated {generatedAt} · {item.sizeKb ?? '—'} KB
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {status === 'ready' && (
              <button
                onClick={onDownload}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
              >
                Download
              </button>
            )}
            <button
              onClick={onRegenerate}
              disabled={status === 'generating'}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors disabled:opacity-50"
            >
              {status === 'generating' ? 'Generating...' : 'Regenerate'}
            </button>
          </div>
        </div>
        {/* Download meta row */}
        <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-600">
          {downloadMeta.lastDownloaded && (
            <span>Last downloaded: {downloadMeta.lastDownloaded}</span>
          )}
          <div className="relative">
            <button
              onClick={() => setShowAudit(!showAudit)}
              className="text-[11px] text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
            >
              Downloaded {downloadMeta.count} time{downloadMeta.count !== 1 ? 's' : ''}
            </button>
            <AuditPopover audit={downloadMeta.audit} open={showAudit} onClose={() => setShowAudit(false)} />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Stacked bar for Revenue by Period ────────────────────────

function StackedBar({
  month,
  programFees,
  fundingFees,
  max,
}: {
  month: string;
  programFees: number;
  fundingFees: number;
  max: number;
}) {
  const total = programFees + fundingFees;
  const pctTotal = Math.round((total / max) * 100);
  const pctProgram = total > 0 ? Math.round((programFees / total) * 100) : 0;
  const pctFunding = 100 - pctProgram;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-gray-400 font-semibold">{fmtShort(total)}</span>
      <div className="w-8 bg-gray-800 rounded-t overflow-hidden relative" style={{ height: 120 }}>
        <div
          className="w-full absolute bottom-0 rounded-t flex flex-col"
          style={{ height: `${pctTotal}%` }}
        >
          <div className="flex-1 bg-[#C9A84C]" style={{ flex: pctProgram }} />
          <div className="flex-1 bg-teal-500" style={{ flex: pctFunding }} />
        </div>
      </div>
      <span className="text-[10px] text-gray-500">{month}</span>
    </div>
  );
}

// ── Donut Chart (CSS) ───────────────────────────────────────

function DonutChart({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  let accumulated = 0;
  const gradientParts = segments.map((s) => {
    const start = accumulated;
    accumulated += s.pct;
    return `${s.color} ${start}% ${accumulated}%`;
  });
  const gradient = `conic-gradient(${gradientParts.join(', ')})`;

  return (
    <div className="flex items-center gap-6">
      <div
        className="w-32 h-32 rounded-full flex-shrink-0"
        style={{
          background: gradient,
          WebkitMask: 'radial-gradient(circle, transparent 40%, black 41%)',
          mask: 'radial-gradient(circle, transparent 40%, black 41%)',
        }}
      />
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-gray-300">{s.label}</span>
            <span className="text-gray-500">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────

function TabBtn({ id, label, active, onClick }: { id: ReportTab; label: string; active: boolean; onClick: (t: ReportTab) => void }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-[#0A1628] text-[#C9A84C]' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  );
}

// ── Schedule Reports Modal (4-step) ──────────────────────────

const ALL_REPORTS_FOR_SCHEDULE = [
  'IRC §163(j) Interest Limitation Report',
  'Year-End Tax Summary',
  'Q1 Estimated Tax Support',
  'UDAP Risk Assessment Export',
  'Consent Records Export',
  'Section 1071 Fair Lending Report',
  'Revenue Analytics Summary',
  'Portfolio Benchmark Report',
];

const RECIPIENTS = ['Sarah Mitchell', 'James Park', 'Lisa Hernandez', 'David Chen', 'Admin Team'];

function ScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<'Weekly' | 'Monthly' | 'Quarterly'>('Monthly');
  const [day, setDay] = useState('1st');
  const [time, setTime] = useState('09:00');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([RECIPIENTS[0]]);
  const [delivery, setDelivery] = useState<'Email' | 'Vault' | 'Both'>('Email');
  const [toast, setToast] = useState<string | null>(null);

  const toggleReport = (r: string) => {
    setSelectedReports((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const toggleRecipient = (r: string) => {
    setSelectedRecipients((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const activate = () => {
    const nextRun = frequency === 'Weekly' ? 'Mon, Apr 6 2026' : frequency === 'Monthly' ? 'May 1, 2026' : 'Jul 1, 2026';
    setToast(`Schedule activated. Next run: ${nextRun} at ${time}`);
    setTimeout(() => {
      setToast(null);
      onClose();
      setStep(1);
      setSelectedReports([]);
    }, 3000);
  };

  if (!open) return null;
  return (
    <>
      <Toast message={toast || ''} visible={!!toast} />
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Schedule Reports</h3>
            <span className="text-xs text-gray-500">Step {step} of 4</span>
          </div>
          {/* Progress bar */}
          <div className="flex gap-1 mb-6">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-[#C9A84C]' : 'bg-gray-700'}`} />
            ))}
          </div>

          {/* Step 1: Select reports */}
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-400 mb-3">Select reports to schedule:</p>
              {ALL_REPORTS_FOR_SCHEDULE.map((r) => (
                <label key={r} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedReports.includes(r)}
                    onChange={() => toggleReport(r)}
                    className="accent-[#C9A84C] w-4 h-4"
                  />
                  <span className="text-sm text-gray-300">{r}</span>
                </label>
              ))}
            </div>
          )}

          {/* Step 2: Frequency */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 mb-3">Choose frequency and timing:</p>
              <div className="flex gap-2">
                {(['Weekly', 'Monthly', 'Quarterly'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFrequency(f)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      frequency === f
                        ? 'border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Day</label>
                  <select
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
                  >
                    {frequency === 'Weekly'
                      ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))
                      : ['1st', '5th', '10th', '15th', 'Last'].map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))
                    }
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Time</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Recipients & delivery */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 mb-3">Recipients and delivery method:</p>
              <div className="space-y-2">
                {RECIPIENTS.map((r) => (
                  <label key={r} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRecipients.includes(r)}
                      onChange={() => toggleRecipient(r)}
                      className="accent-[#C9A84C] w-4 h-4"
                    />
                    <span className="text-sm text-gray-300">{r}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Delivery Method</label>
                <div className="flex gap-2">
                  {(['Email', 'Vault', 'Both'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setDelivery(m)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        delivery === m
                          ? 'border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10'
                          : 'border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-3 text-sm">
              <p className="text-gray-400 mb-3">Review your schedule:</p>
              <div className="rounded-xl bg-gray-800 border border-gray-700 p-4 space-y-2">
                <div>
                  <span className="text-gray-500">Reports:</span>{' '}
                  <span className="text-gray-200">{selectedReports.length} selected</span>
                </div>
                <div>
                  <span className="text-gray-500">Frequency:</span>{' '}
                  <span className="text-gray-200">{frequency} on {day} at {time}</span>
                </div>
                <div>
                  <span className="text-gray-500">Recipients:</span>{' '}
                  <span className="text-gray-200">{selectedRecipients.join(', ')}</span>
                </div>
                <div>
                  <span className="text-gray-500">Delivery:</span>{' '}
                  <span className="text-gray-200">{delivery}</span>
                </div>
              </div>
              <ul className="text-xs text-gray-500 list-disc list-inside mt-2">
                {selectedReports.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <button
              onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800 transition-colors"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && selectedReports.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors disabled:opacity-40"
              >
                Next
              </button>
            ) : (
              <button
                onClick={activate}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Activate Schedule
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Generate Report Modal ───────────────────────────────────

const REPORT_TYPES_BY_TAB: Record<ReportTab, string[]> = {
  tax: ['IRC §163(j) Report', 'Year-End Tax Summary', 'Quarterly Estimated Tax Support'],
  portfolio: ['Portfolio Benchmark Report', 'Issuer Approval Analysis', 'Credit Stack Summary'],
  revenue: ['Revenue Analytics Summary', 'Advisor Performance Report', 'Fee Breakdown Report'],
  compliance: ['UDAP Risk Assessment', 'Consent Records Export', 'Section 1071 Report', 'Adverse Action Log'],
};

function GenerateReportModal({
  open,
  tab,
  onClose,
  onGenerate,
}: {
  open: boolean;
  tab: ReportTab;
  onClose: () => void;
  onGenerate: (row: GenerateReportRow) => void;
}) {
  const [reportType, setReportType] = useState('');
  const [scope, setScope] = useState<'All' | 'Client' | 'Date Range'>('All');
  const [format, setFormat] = useState<'PDF' | 'CSV'>('PDF');

  useEffect(() => {
    if (open) {
      setReportType(REPORT_TYPES_BY_TAB[tab][0] || '');
      setScope('All');
      setFormat('PDF');
    }
  }, [open, tab]);

  const submit = () => {
    const row: GenerateReportRow = {
      id: `gen-${Date.now()}`,
      name: reportType,
      scope,
      format,
      status: 'generating',
      createdAt: nowStr(),
    };
    onGenerate(row);
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-4">Generate Report</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
            >
              {REPORT_TYPES_BY_TAB[tab].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Scope</label>
            <div className="flex gap-2">
              {(['All', 'Client', 'Date Range'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    scope === s
                      ? 'border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Format</label>
            <div className="flex gap-2">
              {(['PDF', 'CSV'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    format === f
                      ? 'border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Generated Report Row (inline) ───────────────────────────

function GeneratedRow({ row }: { row: GenerateReportRow }) {
  const [status, setStatus] = useState(row.status);

  useEffect(() => {
    if (status === 'generating') {
      const timer = setTimeout(() => setStatus('ready'), 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-gray-800 bg-gray-900">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
          {status}
        </span>
        <span className="text-sm text-gray-200">{row.name}</span>
        <span className="text-[10px] text-gray-500">{row.scope} · {row.format}</span>
      </div>
      <span className="text-[11px] text-gray-600">{row.createdAt}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('tax');
  const [showSchedule, setShowSchedule] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generatedRows, setGeneratedRows] = useState<Record<ReportTab, GenerateReportRow[]>>({
    tax: [],
    portfolio: [],
    revenue: [],
    compliance: [],
  });
  const [toast, setToast] = useState<string | null>(null);

  // Revenue analytics state
  const [revenuePeriod, setRevenuePeriod] = useState<'MTD' | 'QTD' | 'YTD'>('YTD');
  const [benchmarkPeriod, setBenchmarkPeriod] = useState<'MTD' | 'QTD' | 'YTD'>('YTD');

  const showToast = useCallback((msg: string, durationMs = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(null), durationMs);
  }, []);

  const handleGenerate = useCallback((row: GenerateReportRow) => {
    setGeneratedRows((prev) => ({
      ...prev,
      [tab]: [row, ...prev[tab]],
    }));
  }, [tab]);

  const downloadPlaceholderPdf = useCallback((filename: string) => {
    showToast('Downloading...');
    setTimeout(() => {
      const blob = new Blob(['%PDF-1.4 placeholder content'], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Download complete');
    }, 1200);
  }, [showToast]);

  // Revenue period filtering
  const filteredRevenue = revenuePeriod === 'MTD'
    ? REVENUE_BY_PERIOD.slice(-1)
    : revenuePeriod === 'QTD'
    ? REVENUE_BY_PERIOD.slice(-3)
    : REVENUE_BY_PERIOD;

  const maxStackedRevenue = Math.max(...filteredRevenue.map((d) => d.programFees + d.fundingFees));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <Toast message={toast || ''} visible={!!toast} />
      <ScheduleModal open={showSchedule} onClose={() => setShowSchedule(false)} />
      <GenerateReportModal
        open={showGenerate}
        tab={tab}
        onClose={() => setShowGenerate(false)}
        onGenerate={handleGenerate}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">Tax reports, portfolio benchmarks, revenue analytics, compliance exports</p>
        </div>
        <button
          onClick={() => setShowSchedule(true)}
          className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Schedule Reports
        </button>
      </div>

      {/* Tabs + Generate button */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          <TabBtn id="tax"        label="Tax Reports"         active={tab === 'tax'}        onClick={setTab} />
          <TabBtn id="portfolio"  label="Portfolio Benchmarks" active={tab === 'portfolio'}  onClick={setTab} />
          <TabBtn id="revenue"    label="Revenue Analytics"   active={tab === 'revenue'}    onClick={setTab} />
          <TabBtn id="compliance" label="Compliance Exports"  active={tab === 'compliance'} onClick={setTab} />
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
        >
          + Generate Report
        </button>
      </div>

      {/* Generated rows for current tab */}
      {generatedRows[tab].length > 0 && (
        <div className="space-y-2 mb-4">
          {generatedRows[tab].map((r) => (
            <GeneratedRow key={r.id} row={r} />
          ))}
        </div>
      )}

      {/* ── Tax Reports ─────────────────────────────────────── */}
      {tab === 'tax' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">
            IRC §163(j) reports, year-end summaries, and quarterly tax support packages.
          </p>
          {TAX_REPORTS.map((r) => <ReportRow key={r.id} item={r} />)}
        </section>
      )}

      {/* ── Portfolio Benchmarks (enhanced) ──────────────────── */}
      {tab === 'portfolio' && (
        <section>
          <p className="text-sm text-gray-500 mb-4">
            Key performance metrics across the full client portfolio as of March 31, 2026.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {PORTFOLIO_METRICS.map(({ label, value, change, up }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-white">{value}</p>
                <p className={`text-xs font-medium mt-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {change} vs last period
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-200">Issuer Approval Rate Breakdown</h3>
              <div className="flex gap-1">
                {(['MTD', 'QTD', 'YTD'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setBenchmarkPeriod(p)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                      benchmarkPeriod === p
                        ? 'bg-[#C9A84C] text-[#0A1628]'
                        : 'text-gray-500 hover:text-gray-300 bg-gray-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {[
                { issuer: 'Chase',           rate: 74, color: 'bg-blue-500' },
                { issuer: 'Amex',            rate: 71, color: 'bg-emerald-500' },
                { issuer: 'Capital One',     rate: 68, color: 'bg-purple-500' },
                { issuer: 'Bank of America', rate: 65, color: 'bg-amber-500' },
                { issuer: 'Citi',            rate: 60, color: 'bg-red-500' },
                { issuer: 'US Bank',         rate: 54, color: 'bg-cyan-500' },
                { issuer: 'Discover',        rate: 57, color: 'bg-pink-500' },
              ].map(({ issuer, rate, color }) => (
                <div key={issuer} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-28 flex-shrink-0">{issuer}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${rate}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-300 w-8 text-right">{rate}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => downloadPlaceholderPdf('Benchmark-Report-YTD2026.pdf')}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
            >
              Download Benchmark Report
            </button>
          </div>
        </section>
      )}

      {/* ── Revenue Analytics (full build) ───────────────────── */}
      {tab === 'revenue' && (
        <section>
          {/* Stats bar — 4 cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Revenue YTD',     value: '$900,400',  sub: '+12.4% vs prior year' },
              { label: 'Avg Revenue / Client',   value: '$6,022',    sub: '+$340 vs prior year' },
              { label: 'Fee Retention',           value: '68%',       sub: '+3pts vs prior year' },
              { label: 'Gross Margin',            value: '74%',       sub: '+1pt vs prior year' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-emerald-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue by period — stacked bars */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-200">Revenue by Period</h3>
              <div className="flex gap-1">
                {(['MTD', 'QTD', 'YTD'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setRevenuePeriod(p)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                      revenuePeriod === p
                        ? 'bg-[#C9A84C] text-[#0A1628]'
                        : 'text-gray-500 hover:text-gray-300 bg-gray-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3 justify-center">
              {filteredRevenue.map((d) => (
                <StackedBar
                  key={d.month}
                  month={d.month}
                  programFees={d.programFees}
                  fundingFees={d.fundingFees}
                  max={maxStackedRevenue}
                />
              ))}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-3 h-3 rounded-sm bg-[#C9A84C]" />
                Program Fees
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-3 h-3 rounded-sm bg-teal-500" />
                Funding Fees
              </div>
            </div>
          </div>

          {/* Revenue by advisor table */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Revenue by Advisor</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs text-gray-500 font-medium pb-2">Advisor</th>
                    <th className="text-right text-xs text-gray-500 font-medium pb-2">Clients</th>
                    <th className="text-right text-xs text-gray-500 font-medium pb-2">Revenue</th>
                    <th className="text-right text-xs text-gray-500 font-medium pb-2">Retention</th>
                  </tr>
                </thead>
                <tbody>
                  {REVENUE_ADVISORS.map((a) => (
                    <tr key={a.name} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2.5 text-gray-200 font-medium">{a.name}</td>
                      <td className="py-2.5 text-right text-gray-400">{a.clients}</td>
                      <td className="py-2.5 text-right text-gray-200 font-semibold">{fmt(a.revenue)}</td>
                      <td className="py-2.5 text-right text-emerald-400 font-medium">{a.retention}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fee type breakdown — donut */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Fee Type Breakdown</h3>
            <DonutChart
              segments={[
                { label: 'Program Fees',  pct: 45, color: '#C9A84C' },
                { label: 'Funding Fees',  pct: 38, color: '#14b8a6' },
                { label: 'Annual Fees',   pct: 12, color: '#8b5cf6' },
                { label: 'Other',         pct: 5,  color: '#6b7280' },
              ]}
            />
          </div>

          {/* Download button */}
          <div className="flex justify-end">
            <button
              onClick={() => downloadPlaceholderPdf('Revenue-Report-YTD2026.pdf')}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
            >
              Download Revenue Report
            </button>
          </div>
        </section>
      )}

      {/* ── Compliance Exports ───────────────────────────────── */}
      {tab === 'compliance' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">
            UDAP assessments, consent audit trails, Section 1071 fair lending reports, and adverse action logs.
          </p>
          {COMPLIANCE_EXPORTS.map((r) => <ReportRow key={r.id} item={r} />)}
          <div className="mt-4 p-4 rounded-xl border border-gray-700 bg-gray-900 text-xs text-gray-500">
            Compliance exports include full audit trail metadata and are suitable for regulatory submissions.
            Exports are retained for 7 years per CFPB record-keeping requirements.
          </div>
        </section>
      )}
    </div>
  );
}
