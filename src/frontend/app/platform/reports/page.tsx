'use client';

// ============================================================
// /platform/reports — Platform Reports Hub
// Report type selector, date range picker, preview area with
// formatted metric cards, Export as PDF (browser print).
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────

type ReportType = 'monthly-summary' | 'client-funding' | 'compliance-audit' | 'revenue';

interface ReportMetric {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'flat';
}

interface ReportData {
  type: ReportType;
  title: string;
  period: string;
  metrics: ReportMetric[];
  generatedAt: string;
  details?: { label: string; value: string }[];
}

// ── Mock Data ────────────────────────────────────────────────

function generateReport(type: ReportType, startDate: string, endDate: string): ReportData {
  const period = `${startDate} to ${endDate}`;

  switch (type) {
    case 'monthly-summary':
      return {
        type,
        title: 'Monthly Summary Report',
        period,
        generatedAt: new Date().toISOString(),
        metrics: [
          { label: 'Total Businesses', value: '247', change: '+12', trend: 'up' },
          { label: 'New Applications', value: '38', change: '+5', trend: 'up' },
          { label: 'Avg Readiness Score', value: '72/100', change: '+3', trend: 'up' },
          { label: 'Total Funding Deployed', value: '$2,450,000', change: '+$340K', trend: 'up' },
          { label: 'Approval Rate', value: '68.5%', change: '+2.1%', trend: 'up' },
          { label: 'Active Advisors', value: '24', change: '0', trend: 'flat' },
        ],
        details: [
          { label: 'Intake', value: '18 businesses' },
          { label: 'In Review', value: '32 businesses' },
          { label: 'Funded', value: '164 businesses' },
          { label: 'Declined', value: '33 businesses' },
        ],
      };
    case 'client-funding':
      return {
        type,
        title: 'Client Funding Report',
        period,
        generatedAt: new Date().toISOString(),
        metrics: [
          { label: 'Total Clients', value: '247', change: '+12', trend: 'up' },
          { label: 'Avg Funding Amount', value: '$148,200', change: '+$12K', trend: 'up' },
          { label: 'Funding Utilization', value: '84%', change: '+3%', trend: 'up' },
          { label: 'SBA Approvals', value: '42', change: '+6', trend: 'up' },
          { label: 'Avg Days to Fund', value: '18 days', change: '-2 days', trend: 'up' },
          { label: 'Pipeline Value', value: '$4.2M', change: '+$600K', trend: 'up' },
        ],
        details: [
          { label: 'Term Loans', value: '$1.8M (42 clients)' },
          { label: 'Lines of Credit', value: '$1.2M (38 clients)' },
          { label: 'SBA 7(a)', value: '$680K (12 clients)' },
          { label: 'Equipment Finance', value: '$320K (8 clients)' },
        ],
      };
    case 'compliance-audit':
      return {
        type,
        title: 'Compliance Audit Report',
        period,
        generatedAt: new Date().toISOString(),
        metrics: [
          { label: 'Total Checks', value: '1,247', change: '+89', trend: 'up' },
          { label: 'Pass Rate', value: '94.2%', change: '+1.1%', trend: 'up' },
          { label: 'Open Findings', value: '14', change: '-3', trend: 'up' },
          { label: 'Critical Issues', value: '2', change: '-1', trend: 'up' },
          { label: 'Avg Resolution Time', value: '4.2 days', change: '-0.8 days', trend: 'up' },
          { label: 'Vendor Audits', value: '8', change: '+2', trend: 'up' },
        ],
        details: [
          { label: 'UDAP Checks', value: '412 (98% pass)' },
          { label: 'State Law Checks', value: '328 (95% pass)' },
          { label: 'KYB/KYC Checks', value: '289 (92% pass)' },
          { label: 'Vendor Reviews', value: '218 (91% pass)' },
        ],
      };
    case 'revenue':
      return {
        type,
        title: 'Revenue Report',
        period,
        generatedAt: new Date().toISOString(),
        metrics: [
          { label: 'Total Revenue', value: '$142,500', change: '+12.4%', trend: 'up' },
          { label: 'Program Fees', value: '$89,200', change: '+$8.2K', trend: 'up' },
          { label: 'Funding Fees', value: '$38,100', change: '+$4.1K', trend: 'up' },
          { label: 'Platform Fees', value: '$15,200', change: '+$1.8K', trend: 'up' },
          { label: 'Avg Revenue / Client', value: '$6,022', change: '+$340', trend: 'up' },
          { label: 'MRR Growth', value: '8.2%', change: '+1.4%', trend: 'up' },
        ],
        details: [
          { label: 'Enterprise Tier', value: '$68,400 (48%)' },
          { label: 'Growth Tier', value: '$42,200 (30%)' },
          { label: 'Starter Tier', value: '$31,900 (22%)' },
        ],
      };
  }
}

// ── Components ───────────────────────────────────────────────

const REPORT_OPTIONS: { value: ReportType; label: string; description: string }[] = [
  { value: 'monthly-summary', label: 'Monthly Summary', description: 'Overall platform performance snapshot' },
  { value: 'client-funding', label: 'Client Funding', description: 'Funding pipeline and deployment analysis' },
  { value: 'compliance-audit', label: 'Compliance Audit', description: 'Compliance check results and findings' },
  { value: 'revenue', label: 'Revenue', description: 'Revenue breakdown by fee type and tier' },
];

function MetricCard({ metric }: { metric: ReportMetric }) {
  const trendColor =
    metric.trend === 'up' ? 'text-emerald-400' : metric.trend === 'down' ? 'text-red-400' : 'text-gray-400';
  const trendIcon =
    metric.trend === 'up' ? '\u25B2' : metric.trend === 'down' ? '\u25BC' : '\u25CF';

  return (
    <div className="bg-[#111c33] border border-gray-700/50 rounded-lg p-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{metric.label}</p>
      <p className="text-2xl font-bold text-white mt-1">{metric.value}</p>
      {metric.change && (
        <p className={`text-xs mt-1 ${trendColor}`}>
          <span className="mr-1">{trendIcon}</span>
          {metric.change}
        </p>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformReportsPage() {
  const [selectedType, setSelectedType] = useState<ReportType>('monthly-summary');
  const [startDate, setStartDate] = useState('2026-03-01');
  const [endDate, setEndDate] = useState('2026-03-31');
  const [report, setReport] = useState<ReportData | null>(() => generateReport('monthly-summary', '2026-03-01', '2026-03-31'));
  const [isGenerating, setIsGenerating] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Auto-generate report on mount so sample data is visible immediately
  // (initial state is set above via the useState initializer)

  const handleGenerate = useCallback(() => {
    setIsGenerating(true);
    // Simulate async generation
    setTimeout(() => {
      const data = generateReport(selectedType, startDate, endDate);
      setReport(data);
      setIsGenerating(false);
    }, 600);
  }, [selectedType, startDate, endDate]);

  const handleExportPdf = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Platform Reports</h1>
        <p className="text-sm text-gray-400 mt-1">
          Generate and export platform-level reports across funding, compliance, and revenue.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Report Type Selector */}
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
              Report Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedType(opt.value)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selectedType === opt.value
                      ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                      : 'border-gray-700/50 bg-[#111c33] text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className="block text-sm font-semibold">{opt.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Picker */}
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-6 py-2.5 bg-[#C9A84C] text-[#0A1628] font-semibold rounded-lg hover:bg-[#b8993f] transition disabled:opacity-50"
          >
            {isGenerating ? 'Generating...' : 'Generate Report'}
          </button>
          {report && (
            <button
              onClick={handleExportPdf}
              className="px-6 py-2.5 border border-gray-600 text-gray-300 font-semibold rounded-lg hover:bg-[#111c33] transition"
            >
              Export as PDF
            </button>
          )}
        </div>
      </div>

      {/* Report Preview */}
      {report && (
        <div ref={previewRef} className="print:bg-white print:text-black">
          {/* Report Header */}
          <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 mb-6 print:bg-white print:border-gray-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white print:text-black">{report.title}</h2>
                <p className="text-sm text-gray-400 mt-1 print:text-gray-600">
                  Period: {report.period}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 print:text-gray-400">Generated</p>
                <p className="text-sm text-gray-300 print:text-gray-700">
                  {new Date(report.generatedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {report.metrics.map((m) => (
              <MetricCard key={m.label} metric={m} />
            ))}
          </div>

          {/* Detail Breakdown */}
          {report.details && report.details.length > 0 && (
            <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
              <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Breakdown</h3>
              <div className="space-y-3">
                {report.details.map((d) => (
                  <div key={d.label} className="flex items-center justify-between py-2 border-b border-gray-700/30 last:border-0 print:border-gray-200">
                    <span className="text-sm text-gray-400 print:text-gray-600">{d.label}</span>
                    <span className="text-sm font-semibold text-gray-200 print:text-black">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Bar */}
          {report.type === 'monthly-summary' && (
            <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
              <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Pipeline Distribution</h3>
              <div className="flex gap-1 h-6 rounded-full overflow-hidden">
                <div className="bg-blue-500 w-[7%]" title="Intake: 18" />
                <div className="bg-yellow-500 w-[13%]" title="In Review: 32" />
                <div className="bg-emerald-500 w-[66%]" title="Funded: 164" />
                <div className="bg-red-500 w-[14%]" title="Declined: 33" />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Intake</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> In Review</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Funded</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Declined</span>
              </div>
            </div>
          )}

          {report.type === 'compliance-audit' && (
            <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
              <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Risk Distribution</h3>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Low', count: 842, color: 'bg-emerald-500' },
                  { label: 'Medium', count: 312, color: 'bg-yellow-500' },
                  { label: 'High', count: 79, color: 'bg-orange-500' },
                  { label: 'Critical', count: 14, color: 'bg-red-500' },
                ].map((r) => (
                  <div key={r.label} className="text-center">
                    <div className={`${r.color} w-12 h-12 rounded-full mx-auto flex items-center justify-center text-sm font-bold text-white`}>
                      {r.count}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{r.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.type === 'revenue' && (
            <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
              <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Revenue Composition</h3>
              <div className="flex items-center gap-4 h-8">
                <div className="bg-[#C9A84C] h-full rounded-l" style={{ width: '48%' }} />
                <div className="bg-blue-500 h-full" style={{ width: '30%' }} />
                <div className="bg-purple-500 h-full rounded-r" style={{ width: '22%' }} />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#C9A84C] inline-block" /> Program Fees (48%)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Funding Fees (30%)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Platform Fees (22%)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!report && !isGenerating && (
        <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4 opacity-30">&#128202;</div>
          <p className="text-gray-400">Select a report type and date range, then click Generate Report.</p>
        </div>
      )}
    </div>
  );
}
