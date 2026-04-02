'use client';

// ============================================================
// /platform/visionaudioforge — VisionAudioForge Sample Dashboard
// Rich mock dashboard showcasing multimodal AI document
// intelligence capabilities with mock data.
// ============================================================

import { useState } from 'react';

// ─── Mock data ─────────────────────────────────────────────────

interface ProcessedDocument {
  id: string;
  docType: string;
  source: string;
  filename: string;
  status: string;
  time: string;
  detail: string;
  extractedFields: Record<string, string>;
}

const PROCESSED_DOCS: ProcessedDocument[] = [
  {
    id: 'doc-1',
    docType: 'Bank Statement',
    source: 'Chase',
    filename: 'apex_bank_stmt_feb2026.pdf',
    status: 'Parsed',
    time: '3.2s',
    detail: '47 transactions extracted',
    extractedFields: {
      'Account Holder': 'Apex Ventures Inc.',
      'Account Number': '****4821',
      'Statement Period': 'Feb 1 – Feb 28, 2026',
      'Opening Balance': '$142,380.00',
      'Closing Balance': '$187,912.47',
      'Total Deposits': '$98,240.00',
      'Total Withdrawals': '$52,707.53',
      'Transactions': '47',
    },
  },
  {
    id: 'doc-2',
    docType: 'Adverse Action Notice',
    source: 'Citi',
    filename: 'horizon_decline_letter.pdf',
    status: 'Parsed',
    time: '2.8s',
    detail: '3 decline reasons extracted',
    extractedFields: {
      Applicant: 'Horizon Group LLC',
      'Decision Date': '2026-03-18',
      Decision: 'Declined',
      'Reason 1': 'Insufficient time in business (< 2 years)',
      'Reason 2': 'High existing debt-to-income ratio',
      'Reason 3': 'Limited trade references',
      'Credit Bureau': 'Experian',
    },
  },
  {
    id: 'doc-3',
    docType: 'Government ID',
    source: '',
    filename: 'james_harrington_dl.jpg',
    status: 'Verified',
    time: '1.9s',
    detail: 'Identity confirmed',
    extractedFields: {
      'Full Name': 'James R. Harrington',
      'Document Type': "Driver's License",
      State: 'California',
      'License Number': 'D****7892',
      'Date of Birth': '1984-07-15',
      Expiration: '2028-07-15',
      'Face Match Score': '99.2%',
      'Liveness Check': 'Passed',
    },
  },
  {
    id: 'doc-4',
    docType: 'Credit Card Statement',
    source: 'Amex',
    filename: 'summit_amex_stmt.pdf',
    status: 'Parsed',
    time: '4.1s',
    detail: '62 transactions extracted',
    extractedFields: {
      'Card Holder': 'Summit Capital Partners',
      'Card Number': '****3748',
      'Statement Period': 'Feb 1 – Feb 28, 2026',
      'Previous Balance': '$28,410.00',
      Payments: '$28,410.00',
      'New Charges': '$34,872.19',
      'Current Balance': '$34,872.19',
      'Transactions': '62',
    },
  },
  {
    id: 'doc-5',
    docType: 'Business Registration',
    source: '',
    filename: 'meridian_articles_org.pdf',
    status: 'Parsed',
    time: '2.4s',
    detail: 'EIN + entity type extracted',
    extractedFields: {
      'Entity Name': 'Meridian Holdings LLC',
      EIN: '82-*****91',
      'Entity Type': 'Limited Liability Company',
      'State of Formation': 'Delaware',
      'Date of Formation': '2023-11-02',
      'Registered Agent': 'National Registered Agents Inc.',
      Status: 'Active / Good Standing',
    },
  },
];

interface PipelineStage {
  stage: number;
  name: string;
  metric: string;
  detail: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { stage: 1, name: 'Document Intake', metric: '2,847 processed', detail: '0 queued' },
  { stage: 2, name: 'Classification', metric: 'Auto-classified', detail: '97.8% accuracy' },
  { stage: 3, name: 'OCR Extraction', metric: 'Faster-Whisper Vision model', detail: '' },
  { stage: 4, name: 'Data Validation', metric: '98.2% field-level accuracy', detail: '' },
  { stage: 5, name: 'Output Delivery', metric: 'API + Document Vault', detail: '' },
];

interface DocTypeBar {
  label: string;
  count: number;
  pct: number;
}

const DOC_TYPES: DocTypeBar[] = [
  { label: 'Bank Statements', count: 1240, pct: 43.5 },
  { label: 'Credit Card Statements', count: 680, pct: 23.9 },
  { label: 'Government IDs', count: 412, pct: 14.5 },
  { label: 'Contracts & Agreements', count: 245, pct: 8.6 },
  { label: 'Adverse Action Notices', count: 142, pct: 5.0 },
  { label: 'Business Registrations', count: 128, pct: 4.5 },
];

interface KycEntry {
  name: string;
  docType: string;
  result: 'pass' | 'fail';
  date: string;
}

const KYC_ENTRIES: KycEntry[] = [
  { name: 'James R. Harrington', docType: "Driver's License", result: 'pass', date: '2026-03-31' },
  { name: 'Maria Chen', docType: 'Passport', result: 'pass', date: '2026-03-30' },
  { name: 'Robert K. Osei', docType: "Driver's License", result: 'fail', date: '2026-03-29' },
];

interface EvidenceBundle {
  client: string;
  type: string;
  docs: number;
  created: string;
}

const EVIDENCE_BUNDLES: EvidenceBundle[] = [
  { client: 'Apex Ventures Inc.', type: 'Funding Dossier', docs: 14, created: '2026-03-31' },
  { client: 'Horizon Group LLC', type: 'Compliance Review', docs: 9, created: '2026-03-28' },
];

interface AiModel {
  name: string;
  tech: string;
  status: string;
  extra?: string;
}

const AI_MODELS: AiModel[] = [
  { name: 'Vision Model', tech: 'PyTorch ResNet-50', status: 'Ready' },
  { name: 'OCR Engine', tech: 'Tesseract + Custom Fine-tuned', status: 'Ready' },
  { name: 'Document Classifier', tech: 'BERT-based', status: 'Ready', extra: 'Accuracy: 97.8%' },
  { name: 'Entity Extractor', tech: 'NER Pipeline', status: 'Ready' },
  { name: 'Face Matcher (KYC)', tech: 'ArcFace', status: 'Ready' },
];

// ─── Helpers ───────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-900 p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">{children}</h2>;
}

// ─── Page component ────────────────────────────────────────────

export default function VisionAudioForgePage() {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Toast ────────────────────────────────────────────── */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg animate-pulse">
          {toastMsg}
        </div>
      )}

      {/* ── 1. Header ────────────────────────────────────────── */}
      <header className="border-b border-gray-800 bg-gray-950 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              VisionAudioForge{' '}
              <span className="text-lg font-normal text-gray-400">
                &mdash; Multimodal AI Document Intelligence
              </span>
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              OCR parsing, KYC verification, document classification, and evidence assembly
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            Mock Mode
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">
        {/* ── 2. KPI Stats Row ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Documents Processed', value: '2,847', delta: '+18%', deltaLabel: 'vs last month', color: 'text-emerald-400' },
            { label: 'OCR Accuracy', value: '98.2%', delta: '', deltaLabel: 'field-level', color: '' },
            { label: 'Avg Processing Time', value: '3.4s', delta: '', deltaLabel: 'per document', color: '' },
            { label: 'Active Pipelines', value: '6', delta: '', deltaLabel: 'running now', color: '' },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{kpi.label}</p>
              <p className="mt-2 text-3xl font-bold text-white">
                {kpi.value}
                {kpi.delta && (
                  <span className={`ml-2 text-sm font-semibold ${kpi.color}`}>{kpi.delta}</span>
                )}
              </p>
              <p className="mt-1 text-xs text-gray-500">{kpi.deltaLabel}</p>
            </Card>
          ))}
        </div>

        {/* ── 3. Recent Document Processing ──────────────────── */}
        <Card>
          <SectionTitle>Recent Document Processing</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pr-4">Document</th>
                  <th className="pb-3 pr-4">Filename</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Result</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {PROCESSED_DOCS.map((doc) => (
                  <tr key={doc.id} className="group">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-gray-200">{doc.docType}</span>
                      {doc.source && (
                        <span className="ml-1.5 text-gray-500">({doc.source})</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-gray-400">{doc.filename}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {doc.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-400">{doc.time}</td>
                    <td className="py-3 pr-4 text-gray-300">{doc.detail}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                        className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        {expandedDoc === doc.id ? 'Hide' : 'View Extracted Data'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanded extracted fields */}
          {expandedDoc && (() => {
            const doc = PROCESSED_DOCS.find((d) => d.id === expandedDoc);
            if (!doc) return null;
            return (
              <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Extracted Fields &mdash; {doc.docType} {doc.source ? `(${doc.source})` : ''}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(doc.extractedFields).map(([key, val]) => (
                    <div key={key} className="rounded-md bg-gray-900 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">{key}</p>
                      <p className="mt-0.5 text-sm font-medium text-gray-200">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>

        {/* ── 4. OCR Pipeline Status ─────────────────────────── */}
        <Card>
          <SectionTitle>OCR Pipeline Status</SectionTitle>
          <div className="flex flex-col lg:flex-row items-stretch gap-0">
            {PIPELINE_STAGES.map((stage, idx) => (
              <div key={stage.stage} className="flex items-center flex-1">
                <div className="flex-1 rounded-lg border border-gray-800 bg-gray-950 p-4 text-center">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      Stage {stage.stage}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-200">{stage.name}</p>
                  <p className="mt-1 text-xs text-gray-400">{stage.metric}</p>
                  {stage.detail && (
                    <p className="text-xs text-gray-500">{stage.detail}</p>
                  )}
                </div>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <span className="hidden lg:block px-1 text-gray-600 text-lg select-none">&rarr;</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* ── 5. Document Type Breakdown + 6. KYC Verification ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Document Type Breakdown */}
          <Card>
            <SectionTitle>Document Type Breakdown</SectionTitle>
            <div className="space-y-3">
              {DOC_TYPES.map((dt) => (
                <div key={dt.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-300">{dt.label}</span>
                    <span className="text-gray-500">
                      {dt.count.toLocaleString()} ({dt.pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-800">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${(dt.pct / 43.5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* KYC Verification */}
          <Card>
            <SectionTitle>KYC Verification</SectionTitle>
            <div className="mb-5 grid grid-cols-3 gap-3">
              {[
                { label: 'Total Verifications', value: '412' },
                { label: 'Pass Rate', value: '94.7%' },
                { label: 'Avg Verification Time', value: '1.9s' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">{stat.label}</p>
                  <p className="mt-1 text-xl font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Recent Verifications</p>
            <div className="divide-y divide-gray-800/60">
              {KYC_ENTRIES.map((entry) => (
                <div key={entry.name + entry.date} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-gray-200">{entry.name}</span>
                    <span className="ml-2 text-gray-500">{entry.docType}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        entry.result === 'pass'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          entry.result === 'pass' ? 'bg-emerald-400' : 'bg-red-400'
                        }`}
                      />
                      {entry.result === 'pass' ? 'Pass' : 'Fail'}
                    </span>
                    <span className="text-xs text-gray-500">{entry.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── 7. Evidence Bundle Assembly + 8. AI Model Status ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Evidence Bundle Assembly */}
          <Card>
            <SectionTitle>Evidence Bundle Assembly</SectionTitle>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Bundles Created</p>
                <p className="mt-1 text-xl font-bold text-white">89</p>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">By Type</p>
                <div className="mt-1 space-y-0.5 text-xs text-gray-400">
                  <p>Funding Dossier: <span className="text-gray-200 font-medium">52</span></p>
                  <p>Compliance Review: <span className="text-gray-200 font-medium">24</span></p>
                  <p>Regulatory Response: <span className="text-gray-200 font-medium">13</span></p>
                </div>
              </div>
            </div>

            <button
              onClick={() => showToast('New evidence bundle created successfully.')}
              className="mb-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              Create New Bundle
            </button>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Recent Bundles</p>
            <div className="divide-y divide-gray-800/60">
              {EVIDENCE_BUNDLES.map((b) => (
                <div key={b.client + b.created} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-gray-200">{b.client}</span>
                    <span className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                      {b.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{b.docs} docs</span>
                    <span>{b.created}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* AI Model Status */}
          <Card>
            <SectionTitle>AI Model Status</SectionTitle>
            <div className="space-y-3">
              {AI_MODELS.map((model) => (
                <div
                  key={model.name}
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-200">{model.name}</p>
                    <p className="text-xs text-gray-500">{model.tech}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {model.extra && (
                      <span className="text-xs text-gray-400">{model.extra}</span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {model.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
