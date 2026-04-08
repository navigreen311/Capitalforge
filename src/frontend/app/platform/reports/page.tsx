'use client';

// ============================================================
// /platform/reports — Platform Reports Hub
// Report type selector, date range picker, preview area with
// formatted metric cards, Export as PDF (browser print),
// Download PDF (text file trigger).
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────

type ReportType =
  | 'monthly-summary'
  | 'client-funding'
  | 'compliance-audit'
  | 'revenue'
  | 'advisor-performance'
  | 'client-lifecycle';

interface ReportMetric {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'flat';
}

interface AdvisorRow {
  name: string;
  clients: number;
  approvalRate: string;
  revenue: string;
}

interface FunnelStage {
  stage: string;
  count: number;
  conversionRate: string;
}

interface PipelineStage {
  stage: string;
  count: number;
  value: string;
}

interface IssuerApproval {
  issuer: string;
  submitted: number;
  approved: number;
  rate: string;
}

interface ComplianceCheck {
  month: string;
  score: number;
}

interface FailedCheck {
  id: string;
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  date: string;
}

interface RevenueDealType {
  type: string;
  amount: string;
  percentage: number;
}

interface RevenueAdvisor {
  name: string;
  revenue: string;
  deals: number;
}

interface ReportData {
  type: ReportType;
  title: string;
  period: string;
  metrics: ReportMetric[];
  generatedAt: string;
  details?: { label: string; value: string }[];
  // Type-specific extended data
  advisorRows?: AdvisorRow[];
  funnelStages?: FunnelStage[];
  pipelineStages?: PipelineStage[];
  issuerApprovals?: IssuerApproval[];
  complianceHistory?: ComplianceCheck[];
  failedChecks?: FailedCheck[];
  revenueDealTypes?: RevenueDealType[];
  revenueAdvisors?: RevenueAdvisor[];
}

// ── Validation ──────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

function validateInputs(
  type: ReportType | '',
  startDate: string,
  endDate: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!type) {
    errors.push({ field: 'type', message: 'Please select a report type.' });
  }
  if (!startDate) {
    errors.push({ field: 'startDate', message: 'Start date is required.' });
  }
  if (!endDate) {
    errors.push({ field: 'endDate', message: 'End date is required.' });
  }
  if (startDate && endDate && startDate > endDate) {
    errors.push({ field: 'endDate', message: 'End date must be after start date.' });
  }
  return errors;
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
          { label: 'Total Clients', value: '247', change: '+12', trend: 'up' },
          { label: 'New Applications', value: '38', change: '+5', trend: 'up' },
          { label: 'Approval Rate', value: '68.5%', change: '+2.1%', trend: 'up' },
          { label: 'Total Funding Deployed', value: '$2,450,000', change: '+$340K', trend: 'up' },
          { label: 'Revenue', value: '$142,500', change: '+12.4%', trend: 'up' },
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
        pipelineStages: [
          { stage: 'Prospect', count: 42, value: '$1.2M' },
          { stage: 'Application', count: 28, value: '$980K' },
          { stage: 'Underwriting', count: 18, value: '$720K' },
          { stage: 'Approved', count: 14, value: '$640K' },
          { stage: 'Funded', count: 12, value: '$580K' },
        ],
        issuerApprovals: [
          { issuer: 'Wells Fargo SBA', submitted: 18, approved: 14, rate: '77.8%' },
          { issuer: 'JPMorgan Chase', submitted: 22, approved: 16, rate: '72.7%' },
          { issuer: 'Bank of America', submitted: 15, approved: 10, rate: '66.7%' },
          { issuer: 'US Bank', submitted: 12, approved: 9, rate: '75.0%' },
          { issuer: 'Kabbage / Amex', submitted: 20, approved: 18, rate: '90.0%' },
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
        complianceHistory: [
          { month: 'Oct', score: 88 },
          { month: 'Nov', score: 90 },
          { month: 'Dec', score: 89 },
          { month: 'Jan', score: 92 },
          { month: 'Feb', score: 93 },
          { month: 'Mar', score: 94 },
        ],
        failedChecks: [
          { id: 'CC-1042', category: 'KYB/KYC', description: 'Missing beneficial owner disclosure for 2 entities', severity: 'high', date: '2026-03-18' },
          { id: 'CC-1038', category: 'UDAP', description: 'Fee disclosure language non-compliant in 3 agreements', severity: 'critical', date: '2026-03-14' },
          { id: 'CC-1035', category: 'State Law', description: 'CA license renewal pending for broker entity', severity: 'medium', date: '2026-03-10' },
          { id: 'CC-1029', category: 'Vendor', description: 'SOC 2 report expired for payment processor', severity: 'high', date: '2026-03-05' },
          { id: 'CC-1024', category: 'KYB/KYC', description: 'Incomplete AML screening for 5 new clients', severity: 'critical', date: '2026-03-01' },
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
        revenueDealTypes: [
          { type: 'Term Loans', amount: '$52,400', percentage: 37 },
          { type: 'Lines of Credit', amount: '$38,200', percentage: 27 },
          { type: 'SBA 7(a)', amount: '$28,600', percentage: 20 },
          { type: 'Equipment Finance', amount: '$23,300', percentage: 16 },
        ],
        revenueAdvisors: [
          { name: 'Sarah Chen', revenue: '$28,400', deals: 18 },
          { name: 'Marcus Johnson', revenue: '$24,200', deals: 15 },
          { name: 'Emily Rodriguez', revenue: '$21,800', deals: 14 },
          { name: 'David Kim', revenue: '$19,600', deals: 12 },
          { name: 'Lisa Park', revenue: '$16,900', deals: 11 },
        ],
        details: [
          { label: 'Enterprise Tier', value: '$68,400 (48%)' },
          { label: 'Growth Tier', value: '$42,200 (30%)' },
          { label: 'Starter Tier', value: '$31,900 (22%)' },
        ],
      };

    case 'advisor-performance':
      return {
        type,
        title: 'Advisor Performance Report',
        period,
        generatedAt: new Date().toISOString(),
        metrics: [
          { label: 'Active Advisors', value: '24', change: '+2', trend: 'up' },
          { label: 'Avg Clients / Advisor', value: '10.3', change: '+0.8', trend: 'up' },
          { label: 'Top Approval Rate', value: '82.4%', change: '+3.1%', trend: 'up' },
          { label: 'Total Revenue', value: '$142,500', change: '+12.4%', trend: 'up' },
          { label: 'Avg Deal Size', value: '$148,200', change: '+$6K', trend: 'up' },
          { label: 'Client Satisfaction', value: '4.6/5.0', change: '+0.2', trend: 'up' },
        ],
        advisorRows: [
          { name: 'Sarah Chen', clients: 18, approvalRate: '82.4%', revenue: '$28,400' },
          { name: 'Marcus Johnson', clients: 15, approvalRate: '78.6%', revenue: '$24,200' },
          { name: 'Emily Rodriguez', clients: 14, approvalRate: '76.2%', revenue: '$21,800' },
          { name: 'David Kim', clients: 12, approvalRate: '74.1%', revenue: '$19,600' },
          { name: 'Lisa Park', clients: 11, approvalRate: '71.8%', revenue: '$16,900' },
          { name: 'James Wilson', clients: 10, approvalRate: '70.5%', revenue: '$14,200' },
          { name: 'Priya Patel', clients: 9, approvalRate: '68.9%', revenue: '$12,800' },
          { name: 'Robert Taylor', clients: 8, approvalRate: '65.3%', revenue: '$11,400' },
        ],
        details: [
          { label: 'Top Performer', value: 'Sarah Chen ($28.4K revenue)' },
          { label: 'Most Improved', value: 'David Kim (+18% MoM)' },
          { label: 'Highest Volume', value: 'Sarah Chen (18 clients)' },
          { label: 'Best Approval Rate', value: 'Sarah Chen (82.4%)' },
        ],
      };

    case 'client-lifecycle':
      return {
        type,
        title: 'Client Lifecycle Report',
        period,
        generatedAt: new Date().toISOString(),
        metrics: [
          { label: 'Total Clients', value: '247', change: '+12', trend: 'up' },
          { label: 'Intake This Period', value: '42', change: '+8', trend: 'up' },
          { label: 'Graduated', value: '18', change: '+3', trend: 'up' },
          { label: 'Avg Time to Graduate', value: '94 days', change: '-8 days', trend: 'up' },
          { label: 'Drop-off Rate', value: '12.4%', change: '-1.8%', trend: 'up' },
          { label: 'Active Retention', value: '91.2%', change: '+2.1%', trend: 'up' },
        ],
        funnelStages: [
          { stage: 'Intake', count: 247, conversionRate: '100%' },
          { stage: 'Onboarding', count: 218, conversionRate: '88.3%' },
          { stage: 'Active', count: 182, conversionRate: '83.5%' },
          { stage: 'Graduated', count: 164, conversionRate: '90.1%' },
        ],
        details: [
          { label: 'Avg Intake Duration', value: '3.2 days' },
          { label: 'Avg Onboarding Duration', value: '12.6 days' },
          { label: 'Avg Active Duration', value: '68.4 days' },
          { label: 'Avg Time to Graduate', value: '94 days total' },
        ],
      };
  }
}

// ── PDF Download Helper ─────────────────────────────────────

function downloadReportAsPdf(report: ReportData) {
  const lines: string[] = [];
  lines.push('='.repeat(60));
  lines.push(`  ${report.title}`);
  lines.push(`  Period: ${report.period}`);
  lines.push(`  Generated: ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push('='.repeat(60));
  lines.push('');

  lines.push('KEY METRICS');
  lines.push('-'.repeat(40));
  for (const m of report.metrics) {
    const change = m.change ? ` (${m.change})` : '';
    lines.push(`  ${m.label.padEnd(28)} ${m.value}${change}`);
  }
  lines.push('');

  if (report.details && report.details.length > 0) {
    lines.push('BREAKDOWN');
    lines.push('-'.repeat(40));
    for (const d of report.details) {
      lines.push(`  ${d.label.padEnd(28)} ${d.value}`);
    }
    lines.push('');
  }

  if (report.advisorRows) {
    lines.push('ADVISOR PERFORMANCE TABLE');
    lines.push('-'.repeat(60));
    lines.push(`  ${'Advisor'.padEnd(22)} ${'Clients'.padEnd(10)} ${'Approval'.padEnd(12)} Revenue`);
    lines.push(`  ${'-'.repeat(56)}`);
    for (const r of report.advisorRows) {
      lines.push(
        `  ${r.name.padEnd(22)} ${String(r.clients).padEnd(10)} ${r.approvalRate.padEnd(12)} ${r.revenue}`,
      );
    }
    lines.push('');
  }

  if (report.funnelStages) {
    lines.push('CLIENT LIFECYCLE FUNNEL');
    lines.push('-'.repeat(50));
    for (const s of report.funnelStages) {
      const bar = '\u2588'.repeat(Math.round(s.count / 10));
      lines.push(`  ${s.stage.padEnd(16)} ${String(s.count).padEnd(6)} ${s.conversionRate.padEnd(8)} ${bar}`);
    }
    lines.push('');
  }

  if (report.pipelineStages) {
    lines.push('PIPELINE STAGES');
    lines.push('-'.repeat(50));
    for (const s of report.pipelineStages) {
      lines.push(`  ${s.stage.padEnd(20)} ${String(s.count).padEnd(6)} ${s.value}`);
    }
    lines.push('');
  }

  if (report.issuerApprovals) {
    lines.push('APPROVAL BY ISSUER');
    lines.push('-'.repeat(60));
    lines.push(`  ${'Issuer'.padEnd(22)} ${'Submitted'.padEnd(12)} ${'Approved'.padEnd(12)} Rate`);
    for (const i of report.issuerApprovals) {
      lines.push(
        `  ${i.issuer.padEnd(22)} ${String(i.submitted).padEnd(12)} ${String(i.approved).padEnd(12)} ${i.rate}`,
      );
    }
    lines.push('');
  }

  if (report.complianceHistory) {
    lines.push('COMPLIANCE SCORE HISTORY');
    lines.push('-'.repeat(40));
    for (const c of report.complianceHistory) {
      lines.push(`  ${c.month.padEnd(10)} ${c.score}%`);
    }
    lines.push('');
  }

  if (report.failedChecks) {
    lines.push('FAILED CHECKS');
    lines.push('-'.repeat(60));
    for (const f of report.failedChecks) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.id} - ${f.category}`);
      lines.push(`    ${f.description} (${f.date})`);
    }
    lines.push('');
  }

  if (report.revenueDealTypes) {
    lines.push('REVENUE BY DEAL TYPE');
    lines.push('-'.repeat(50));
    for (const d of report.revenueDealTypes) {
      lines.push(`  ${d.type.padEnd(22)} ${d.amount.padEnd(12)} (${d.percentage}%)`);
    }
    lines.push('');
  }

  if (report.revenueAdvisors) {
    lines.push('REVENUE BY ADVISOR');
    lines.push('-'.repeat(50));
    for (const a of report.revenueAdvisors) {
      lines.push(`  ${a.name.padEnd(22)} ${a.revenue.padEnd(12)} ${a.deals} deals`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push('  CapitalForge Platform — Confidential');
  lines.push('='.repeat(60));

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = report.type;
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.download = `capitalforge-${slug}-${dateStamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Components ───────────────────────────────────────────────

const REPORT_OPTIONS: { value: ReportType; label: string; description: string }[] = [
  { value: 'monthly-summary', label: 'Monthly Summary', description: 'Overall platform performance snapshot' },
  { value: 'client-funding', label: 'Client Funding', description: 'Funding pipeline and deployment analysis' },
  { value: 'compliance-audit', label: 'Compliance Audit', description: 'Compliance check results and findings' },
  { value: 'revenue', label: 'Revenue', description: 'Revenue breakdown by fee type and tier' },
  { value: 'advisor-performance', label: 'Advisor Performance', description: 'Advisor metrics, clients, and revenue' },
  { value: 'client-lifecycle', label: 'Client Lifecycle', description: 'Client funnel from intake to graduation' },
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

/** Severity badge for compliance failed checks */
function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    low: 'bg-blue-500/20 text-blue-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    high: 'bg-orange-500/20 text-orange-400',
    critical: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${colors[severity] ?? 'bg-gray-600 text-gray-300'}`}>
      {severity}
    </span>
  );
}

// ── Type-specific preview panels ────────────────────────────

function MonthlySummaryPanel() {
  return (
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
  );
}

function ClientFundingPanel({ report }: { report: ReportData }) {
  return (
    <>
      {/* Pipeline stages */}
      {report.pipelineStages && (
        <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Pipeline Stages</h3>
          <div className="space-y-3">
            {report.pipelineStages.map((s) => {
              const maxCount = report.pipelineStages![0].count;
              const pct = Math.round((s.count / maxCount) * 100);
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-300">{s.stage}</span>
                    <span className="text-gray-400">{s.count} clients &middot; {s.value}</span>
                  </div>
                  <div className="h-2 bg-[#111c33] rounded-full overflow-hidden">
                    <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Approval by issuer */}
      {report.issuerApprovals && (
        <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Approval by Issuer</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700/50">
                  <th className="text-left pb-2 pr-4">Issuer</th>
                  <th className="text-right pb-2 pr-4">Submitted</th>
                  <th className="text-right pb-2 pr-4">Approved</th>
                  <th className="text-right pb-2">Rate</th>
                </tr>
              </thead>
              <tbody>
                {report.issuerApprovals.map((i) => (
                  <tr key={i.issuer} className="border-b border-gray-700/30 last:border-0">
                    <td className="py-2 pr-4 text-gray-300">{i.issuer}</td>
                    <td className="py-2 pr-4 text-right text-gray-400">{i.submitted}</td>
                    <td className="py-2 pr-4 text-right text-gray-400">{i.approved}</td>
                    <td className="py-2 text-right font-semibold text-emerald-400">{i.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function ComplianceAuditPanel({ report }: { report: ReportData }) {
  return (
    <>
      {/* Score history */}
      {report.complianceHistory && (
        <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Compliance Score History</h3>
          <div className="flex items-end gap-3 h-32">
            {report.complianceHistory.map((c) => {
              const height = `${c.score}%`;
              return (
                <div key={c.month} className="flex-1 flex flex-col items-center justify-end">
                  <span className="text-xs text-gray-400 mb-1">{c.score}%</span>
                  <div
                    className="w-full bg-[#C9A84C] rounded-t"
                    style={{ height }}
                  />
                  <span className="text-xs text-gray-500 mt-1">{c.month}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Risk distribution */}
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

      {/* Failed checks table */}
      {report.failedChecks && report.failedChecks.length > 0 && (
        <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Failed Checks</h3>
          <div className="space-y-3">
            {report.failedChecks.map((f) => (
              <div key={f.id} className="flex items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                <SeverityBadge severity={f.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 font-medium">{f.id} &mdash; {f.category}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">{f.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function RevenuePanel({ report }: { report: ReportData }) {
  return (
    <>
      {/* Revenue composition bar */}
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

      {/* Revenue by deal type */}
      {report.revenueDealTypes && (
        <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Revenue by Deal Type</h3>
          <div className="space-y-3">
            {report.revenueDealTypes.map((d) => (
              <div key={d.type}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-300">{d.type}</span>
                  <span className="text-gray-400">{d.amount} ({d.percentage}%)</span>
                </div>
                <div className="h-2 bg-[#111c33] rounded-full overflow-hidden">
                  <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${d.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue by advisor */}
      {report.revenueAdvisors && (
        <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Revenue by Advisor</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700/50">
                  <th className="text-left pb-2 pr-4">Advisor</th>
                  <th className="text-right pb-2 pr-4">Revenue</th>
                  <th className="text-right pb-2">Deals</th>
                </tr>
              </thead>
              <tbody>
                {report.revenueAdvisors.map((a) => (
                  <tr key={a.name} className="border-b border-gray-700/30 last:border-0">
                    <td className="py-2 pr-4 text-gray-300">{a.name}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-[#C9A84C]">{a.revenue}</td>
                    <td className="py-2 text-right text-gray-400">{a.deals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function AdvisorPerformancePanel({ report }: { report: ReportData }) {
  if (!report.advisorRows) return null;
  return (
    <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
      <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">Advisor Performance Table</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700/50">
              <th className="text-left pb-2 pr-4">#</th>
              <th className="text-left pb-2 pr-4">Advisor</th>
              <th className="text-right pb-2 pr-4">Clients</th>
              <th className="text-right pb-2 pr-4">Approval Rate</th>
              <th className="text-right pb-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {report.advisorRows.map((r, idx) => (
              <tr key={r.name} className="border-b border-gray-700/30 last:border-0">
                <td className="py-2.5 pr-4 text-gray-500">{idx + 1}</td>
                <td className="py-2.5 pr-4 text-gray-200 font-medium">{r.name}</td>
                <td className="py-2.5 pr-4 text-right text-gray-400">{r.clients}</td>
                <td className="py-2.5 pr-4 text-right text-emerald-400 font-semibold">{r.approvalRate}</td>
                <td className="py-2.5 text-right text-[#C9A84C] font-semibold">{r.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientLifecyclePanel({ report }: { report: ReportData }) {
  if (!report.funnelStages) return null;
  const maxCount = report.funnelStages[0].count;

  return (
    <div className="mt-6 bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 print:bg-white print:border-gray-300">
      <h3 className="text-sm font-semibold text-gray-200 mb-4 print:text-black">
        Client Lifecycle Funnel
      </h3>
      <div className="space-y-4">
        {report.funnelStages.map((s, idx) => {
          const pct = Math.round((s.count / maxCount) * 100);
          const colors = ['bg-blue-500', 'bg-yellow-500', 'bg-[#C9A84C]', 'bg-emerald-500'];
          return (
            <div key={s.stage} className="relative">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-200 font-medium">{s.stage}</span>
                <span className="text-gray-400">
                  {s.count} clients &middot; {s.conversionRate} conversion
                </span>
              </div>
              <div className="h-8 bg-[#111c33] rounded-lg overflow-hidden">
                <div
                  className={`h-full ${colors[idx % colors.length]} rounded-lg flex items-center justify-center`}
                  style={{ width: `${pct}%` }}
                >
                  <span className="text-xs font-bold text-white drop-shadow">{pct}%</span>
                </div>
              </div>
              {idx < report.funnelStages!.length - 1 && (
                <div className="flex justify-center my-1">
                  <span className="text-gray-600 text-lg">{'\u25BC'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);

  // Auto-generate report on mount so sample data is visible immediately
  // (initial state is set above via the useState initializer)

  const handleGenerate = useCallback(() => {
    const validationErrors = validateInputs(selectedType, startDate, endDate);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setIsGenerating(true);
    setReport(null);
    // 1.5s mock generation delay
    setTimeout(() => {
      const data = generateReport(selectedType, startDate, endDate);
      setReport(data);
      setIsGenerating(false);
    }, 1500);
  }, [selectedType, startDate, endDate]);

  const handleDownloadPdf = useCallback(() => {
    if (report) downloadReportAsPdf(report);
  }, [report]);

  const handleExportPdf = useCallback(() => {
    window.print();
  }, []);

  const getFieldError = (field: string) => errors.find((e) => e.field === field);

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
                  onClick={() => {
                    setSelectedType(opt.value);
                    setErrors((prev) => prev.filter((e) => e.field !== 'type'));
                  }}
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
            {getFieldError('type') && (
              <p className="text-xs text-red-400 mt-1">{getFieldError('type')!.message}</p>
            )}
          </div>

          {/* Date Range Picker */}
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setErrors((prev) => prev.filter((er) => er.field !== 'startDate'));
              }}
              className={`w-full bg-[#111c33] border rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C] ${
                getFieldError('startDate') ? 'border-red-500' : 'border-gray-700/50'
              }`}
            />
            {getFieldError('startDate') && (
              <p className="text-xs text-red-400 mt-1">{getFieldError('startDate')!.message}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setErrors((prev) => prev.filter((er) => er.field !== 'endDate'));
              }}
              className={`w-full bg-[#111c33] border rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C] ${
                getFieldError('endDate') ? 'border-red-500' : 'border-gray-700/50'
              }`}
            />
            {getFieldError('endDate') && (
              <p className="text-xs text-red-400 mt-1">{getFieldError('endDate')!.message}</p>
            )}
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
            <>
              <button
                onClick={handleDownloadPdf}
                className="px-6 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition"
              >
                Download PDF
              </button>
              <button
                onClick={handleExportPdf}
                className="px-6 py-2.5 border border-gray-600 text-gray-300 font-semibold rounded-lg hover:bg-[#111c33] transition"
              >
                Print / Export
              </button>
            </>
          )}
        </div>
      </div>

      {/* Generating spinner */}
      {isGenerating && (
        <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-12 text-center mb-8">
          <div className="inline-block w-8 h-8 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Generating your report...</p>
        </div>
      )}

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

          {/* Type-specific panels */}
          {report.type === 'monthly-summary' && <MonthlySummaryPanel />}
          {report.type === 'client-funding' && <ClientFundingPanel report={report} />}
          {report.type === 'compliance-audit' && <ComplianceAuditPanel report={report} />}
          {report.type === 'revenue' && <RevenuePanel report={report} />}
          {report.type === 'advisor-performance' && <AdvisorPerformancePanel report={report} />}
          {report.type === 'client-lifecycle' && <ClientLifecyclePanel report={report} />}
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
