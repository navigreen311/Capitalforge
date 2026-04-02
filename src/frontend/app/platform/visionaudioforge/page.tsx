'use client';

// ============================================================
// /platform/visionaudioforge — VisionAudioForge Sample Dashboard
// Rich mock dashboard showcasing multimodal AI document
// intelligence capabilities with mock data and full interactivity.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Mock data ─────────────────────────────────────────────────

interface ExtractedField {
  field: string;
  value: string;
  confidence: number;
  validated: boolean;
}

interface ProcessedDocument {
  id: string;
  docType: string;
  source: string;
  filename: string;
  client: string;
  status: string;
  time: string;
  detail: string;
  extractedFields: ExtractedField[];
  pipelineTimeline: { stage: string; timestamp: string; completed: boolean }[];
  classificationConfidence: number;
}

const PROCESSED_DOCS: ProcessedDocument[] = [
  {
    id: 'doc-1',
    docType: 'Bank Statement',
    source: 'Chase',
    filename: 'apex_bank_stmt_feb2026.pdf',
    client: 'Apex Ventures Inc.',
    status: 'Parsed',
    time: '3.2s',
    detail: '47 transactions extracted',
    classificationConfidence: 99.1,
    pipelineTimeline: [
      { stage: 'Document Intake', timestamp: '2026-03-31 14:22:01', completed: true },
      { stage: 'Classification', timestamp: '2026-03-31 14:22:01', completed: true },
      { stage: 'OCR Extraction', timestamp: '2026-03-31 14:22:03', completed: true },
      { stage: 'Data Validation', timestamp: '2026-03-31 14:22:04', completed: true },
      { stage: 'Output Delivery', timestamp: '2026-03-31 14:22:04', completed: true },
    ],
    extractedFields: [
      { field: 'Account Holder', value: 'Apex Ventures Inc.', confidence: 99.8, validated: true },
      { field: 'Statement Period', value: 'Feb 1 - Feb 28, 2026', confidence: 98.5, validated: true },
      { field: 'Opening Balance', value: '$142,380.00', confidence: 99.2, validated: true },
      { field: 'Closing Balance', value: '$187,912.47', confidence: 99.4, validated: true },
      { field: 'Avg Monthly Revenue', value: '$98,240.00', confidence: 96.1, validated: true },
      { field: 'Transaction Count', value: '47', confidence: 100, validated: true },
      { field: 'Bank Name', value: 'Chase', confidence: 99.9, validated: true },
      { field: 'Account Type', value: 'Business Checking', confidence: 97.3, validated: true },
    ],
  },
  {
    id: 'doc-2',
    docType: 'Adverse Action Notice',
    source: 'Citi',
    filename: 'horizon_decline_letter.pdf',
    client: 'Horizon Group LLC',
    status: 'Parsed',
    time: '2.8s',
    detail: '3 decline reasons extracted',
    classificationConfidence: 97.6,
    pipelineTimeline: [
      { stage: 'Document Intake', timestamp: '2026-03-30 09:14:22', completed: true },
      { stage: 'Classification', timestamp: '2026-03-30 09:14:23', completed: true },
      { stage: 'OCR Extraction', timestamp: '2026-03-30 09:14:25', completed: true },
      { stage: 'Data Validation', timestamp: '2026-03-30 09:14:25', completed: true },
      { stage: 'Output Delivery', timestamp: '2026-03-30 09:14:26', completed: true },
    ],
    extractedFields: [
      { field: 'Applicant', value: 'Horizon Group LLC', confidence: 99.5, validated: true },
      { field: 'Decision Date', value: '2026-03-18', confidence: 98.9, validated: true },
      { field: 'Decision', value: 'Declined', confidence: 99.8, validated: true },
      { field: 'Primary Reason', value: 'Insufficient time in business (< 2 years)', confidence: 95.2, validated: false },
      { field: 'Credit Bureau', value: 'Experian', confidence: 99.1, validated: true },
    ],
  },
  {
    id: 'doc-3',
    docType: 'Government ID',
    source: '',
    filename: 'james_harrington_dl.jpg',
    client: 'James R. Harrington',
    status: 'Verified',
    time: '1.9s',
    detail: 'Identity confirmed',
    classificationConfidence: 99.7,
    pipelineTimeline: [
      { stage: 'Document Intake', timestamp: '2026-03-31 11:05:44', completed: true },
      { stage: 'Classification', timestamp: '2026-03-31 11:05:44', completed: true },
      { stage: 'OCR Extraction', timestamp: '2026-03-31 11:05:45', completed: true },
      { stage: 'Data Validation', timestamp: '2026-03-31 11:05:46', completed: true },
      { stage: 'Output Delivery', timestamp: '2026-03-31 11:05:46', completed: true },
    ],
    extractedFields: [
      { field: 'Full Name', value: 'James R. Harrington', confidence: 99.6, validated: true },
      { field: 'Date of Birth', value: '1984-07-15', confidence: 98.8, validated: true },
      { field: 'ID Number', value: 'D****7892', confidence: 99.1, validated: true },
      { field: 'State', value: 'California', confidence: 99.9, validated: true },
      { field: 'Expiration', value: '2028-07-15', confidence: 99.4, validated: true },
      { field: 'Face Match Score', value: '97.2%', confidence: 97.2, validated: true },
    ],
  },
  {
    id: 'doc-4',
    docType: 'Credit Card Statement',
    source: 'Amex',
    filename: 'summit_amex_stmt.pdf',
    client: 'Summit Capital Partners',
    status: 'Parsed',
    time: '4.1s',
    detail: '62 transactions extracted',
    classificationConfidence: 98.4,
    pipelineTimeline: [
      { stage: 'Document Intake', timestamp: '2026-03-29 16:33:10', completed: true },
      { stage: 'Classification', timestamp: '2026-03-29 16:33:11', completed: true },
      { stage: 'OCR Extraction', timestamp: '2026-03-29 16:33:14', completed: true },
      { stage: 'Data Validation', timestamp: '2026-03-29 16:33:14', completed: true },
      { stage: 'Output Delivery', timestamp: '2026-03-29 16:33:15', completed: true },
    ],
    extractedFields: [
      { field: 'Card Holder', value: 'Summit Capital Partners', confidence: 99.3, validated: true },
      { field: 'Card Number', value: '****3748', confidence: 99.8, validated: true },
      { field: 'Statement Period', value: 'Feb 1 - Feb 28, 2026', confidence: 98.1, validated: true },
      { field: 'Previous Balance', value: '$28,410.00', confidence: 99.5, validated: true },
      { field: 'New Charges', value: '$34,872.19', confidence: 99.6, validated: true },
      { field: 'Current Balance', value: '$34,872.19', confidence: 99.7, validated: true },
      { field: 'Transaction Count', value: '62', confidence: 100, validated: true },
    ],
  },
  {
    id: 'doc-5',
    docType: 'Business Registration',
    source: '',
    filename: 'meridian_articles_org.pdf',
    client: 'Meridian Holdings LLC',
    status: 'Parsed',
    time: '2.4s',
    detail: 'EIN + entity type extracted',
    classificationConfidence: 96.8,
    pipelineTimeline: [
      { stage: 'Document Intake', timestamp: '2026-03-28 10:18:55', completed: true },
      { stage: 'Classification', timestamp: '2026-03-28 10:18:56', completed: true },
      { stage: 'OCR Extraction', timestamp: '2026-03-28 10:18:58', completed: true },
      { stage: 'Data Validation', timestamp: '2026-03-28 10:18:58', completed: true },
      { stage: 'Output Delivery', timestamp: '2026-03-28 10:18:59', completed: true },
    ],
    extractedFields: [
      { field: 'Entity Name', value: 'Meridian Holdings LLC', confidence: 99.4, validated: true },
      { field: 'EIN', value: '82-*****91', confidence: 98.7, validated: true },
      { field: 'Entity Type', value: 'Limited Liability Company', confidence: 97.9, validated: true },
      { field: 'State of Formation', value: 'Delaware', confidence: 99.2, validated: true },
      { field: 'Date of Formation', value: '2023-11-02', confidence: 98.5, validated: true },
      { field: 'Status', value: 'Active / Good Standing', confidence: 99.8, validated: true },
    ],
  },
];

interface PipelineStage {
  stage: number;
  name: string;
  metric: string;
  detail: string;
}

interface PipelineStageDetail {
  throughput: string;
  errorRate: string;
  queueDepth: number;
  avgTime: string;
  recentDocs: { name: string; status: string; time: string }[];
  extra?: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { stage: 1, name: 'Document Intake', metric: '2,847 processed', detail: '0 queued' },
  { stage: 2, name: 'Classification', metric: 'Auto-classified', detail: '97.8% accuracy' },
  { stage: 3, name: 'OCR Extraction', metric: 'Faster-Whisper Vision model', detail: '' },
  { stage: 4, name: 'Data Validation', metric: '98.2% field-level accuracy', detail: '' },
  { stage: 5, name: 'Output Delivery', metric: 'API + Document Vault', detail: '' },
];

const PIPELINE_STAGE_DETAILS: Record<number, PipelineStageDetail> = {
  1: {
    throughput: '142 docs/hr',
    errorRate: '0.3%',
    queueDepth: 0,
    avgTime: '0.4s',
    recentDocs: [
      { name: 'apex_bank_stmt_feb2026.pdf', status: 'Completed', time: '0.3s' },
      { name: 'horizon_decline_letter.pdf', status: 'Completed', time: '0.5s' },
      { name: 'james_harrington_dl.jpg', status: 'Completed', time: '0.2s' },
    ],
  },
  2: {
    throughput: '138 docs/hr',
    errorRate: '2.2%',
    queueDepth: 3,
    avgTime: '0.8s',
    extra: 'Model: BERT-based classifier | Accuracy: 97.8%',
    recentDocs: [
      { name: 'apex_bank_stmt_feb2026.pdf', status: 'Bank Statement (99.1%)', time: '0.6s' },
      { name: 'horizon_decline_letter.pdf', status: 'Adverse Action (97.6%)', time: '0.9s' },
      { name: 'james_harrington_dl.jpg', status: 'Government ID (99.7%)', time: '0.4s' },
    ],
  },
  3: {
    throughput: '98 docs/hr',
    errorRate: '1.1%',
    queueDepth: 7,
    avgTime: '1.8s',
    extra: 'Engine: Tesseract 5.3.1 + Custom fine-tuned model | DPI: 300 | Languages: en',
    recentDocs: [
      { name: 'apex_bank_stmt_feb2026.pdf', status: '8 fields extracted', time: '1.6s' },
      { name: 'horizon_decline_letter.pdf', status: '5 fields extracted', time: '1.4s' },
      { name: 'summit_amex_stmt.pdf', status: '7 fields extracted', time: '2.2s' },
    ],
  },
  4: {
    throughput: '135 docs/hr',
    errorRate: '1.8%',
    queueDepth: 2,
    avgTime: '0.6s',
    recentDocs: [
      { name: 'apex_bank_stmt_feb2026.pdf', status: '8/8 validated', time: '0.5s' },
      { name: 'horizon_decline_letter.pdf', status: '4/5 validated', time: '0.7s' },
      { name: 'james_harrington_dl.jpg', status: '6/6 validated', time: '0.4s' },
    ],
  },
  5: {
    throughput: '140 docs/hr',
    errorRate: '0.1%',
    queueDepth: 0,
    avgTime: '0.3s',
    recentDocs: [
      { name: 'apex_bank_stmt_feb2026.pdf', status: 'Delivered to API', time: '0.2s' },
      { name: 'horizon_decline_letter.pdf', status: 'Delivered to Vault', time: '0.3s' },
      { name: 'james_harrington_dl.jpg', status: 'Delivered to API', time: '0.2s' },
    ],
  },
};

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

interface KycCheck {
  label: string;
  passed: boolean;
  detail?: string;
}

interface KycEntry {
  name: string;
  docType: string;
  result: 'pass' | 'fail';
  date: string;
  checks: KycCheck[];
  failReasons?: string[];
}

const KYC_ENTRIES: KycEntry[] = [
  {
    name: 'James R. Harrington',
    docType: "Driver's License",
    result: 'pass',
    date: '2026-03-31',
    checks: [
      { label: 'Name Match', passed: true, detail: 'Exact match' },
      { label: 'DOB Match', passed: true, detail: 'Exact match' },
      { label: 'Expiry Valid', passed: true, detail: 'Expires 2028-07-15' },
      { label: 'Face Match', passed: true, detail: '97.2% confidence' },
    ],
  },
  {
    name: 'Maria Chen',
    docType: 'Passport',
    result: 'pass',
    date: '2026-03-30',
    checks: [
      { label: 'Name Match', passed: true, detail: 'Exact match' },
      { label: 'DOB Match', passed: true, detail: 'Exact match' },
      { label: 'Expiry Valid', passed: true, detail: 'Expires 2029-01-20' },
      { label: 'Face Match', passed: true, detail: '98.4% confidence' },
    ],
  },
  {
    name: 'Robert K. Osei',
    docType: "Driver's License",
    result: 'fail',
    date: '2026-03-29',
    checks: [
      { label: 'Name Match', passed: true, detail: 'Exact match' },
      { label: 'DOB Match', passed: true, detail: 'Exact match' },
      { label: 'Expiry Valid', passed: false, detail: 'Expired 2024-11-30' },
      { label: 'Face Match', passed: false, detail: '61% - below 85% threshold' },
    ],
    failReasons: [
      'Face match score 61% is below the 85% minimum threshold',
      'Document expired on 2024-11-30',
    ],
  },
];

interface BundleDoc {
  name: string;
  type: string;
  dateAdded: string;
}

interface EvidenceBundle {
  id: string;
  client: string;
  type: string;
  docs: number;
  created: string;
  createdBy: string;
  documents: BundleDoc[];
}

const INITIAL_EVIDENCE_BUNDLES: EvidenceBundle[] = [
  {
    id: 'bundle-1',
    client: 'Apex Ventures Inc.',
    type: 'Funding Dossier',
    docs: 14,
    created: '2026-03-31',
    createdBy: 'Sarah Mitchell',
    documents: [
      { name: 'apex_bank_stmt_feb2026.pdf', type: 'Bank Statement', dateAdded: '2026-03-31' },
      { name: 'apex_bank_stmt_jan2026.pdf', type: 'Bank Statement', dateAdded: '2026-03-31' },
      { name: 'apex_credit_report.pdf', type: 'Credit Report', dateAdded: '2026-03-30' },
      { name: 'apex_tax_return_2025.pdf', type: 'Tax Return', dateAdded: '2026-03-29' },
      { name: 'apex_articles_org.pdf', type: 'Business Registration', dateAdded: '2026-03-29' },
    ],
  },
  {
    id: 'bundle-2',
    client: 'Horizon Group LLC',
    type: 'Compliance Review',
    docs: 9,
    created: '2026-03-28',
    createdBy: 'David Park',
    documents: [
      { name: 'horizon_decline_letter.pdf', type: 'Adverse Action Notice', dateAdded: '2026-03-28' },
      { name: 'horizon_application.pdf', type: 'Application', dateAdded: '2026-03-27' },
      { name: 'horizon_credit_report.pdf', type: 'Credit Report', dateAdded: '2026-03-27' },
      { name: 'horizon_bank_stmt_feb.pdf', type: 'Bank Statement', dateAdded: '2026-03-26' },
      { name: 'horizon_id_verification.pdf', type: 'Government ID', dateAdded: '2026-03-26' },
    ],
  },
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

const BUNDLE_DOC_SELECTOR = [
  { id: 'sel-1', name: 'apex_bank_stmt_feb2026.pdf', type: 'Bank Statement', date: '2026-03-31' },
  { id: 'sel-2', name: 'horizon_decline_letter.pdf', type: 'Adverse Action Notice', date: '2026-03-30' },
  { id: 'sel-3', name: 'james_harrington_dl.jpg', type: 'Government ID', date: '2026-03-31' },
  { id: 'sel-4', name: 'summit_amex_stmt.pdf', type: 'Credit Card Statement', date: '2026-03-29' },
  { id: 'sel-5', name: 'meridian_articles_org.pdf', type: 'Business Registration', date: '2026-03-28' },
  { id: 'sel-6', name: 'apex_credit_report.pdf', type: 'Credit Report', date: '2026-03-27' },
];

const CLIENT_LIST = [
  'Apex Ventures Inc.',
  'Horizon Group LLC',
  'Summit Capital Partners',
  'Meridian Holdings LLC',
  'James R. Harrington',
];

const BUNDLE_TYPES = [
  'Funding Dossier',
  'Compliance Review',
  'Regulatory Response',
  'KYC Package',
  'Due Diligence',
];

const UPLOAD_DOC_TYPES = [
  'Auto-Classify',
  'Bank Statement',
  'Credit Card Statement',
  'Government ID',
  'Adverse Action Notice',
  'Business Registration',
  'Tax Return',
  'Contract',
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

/** Backdrop for drawers and modals */
function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
      onClick={onClick}
    />
  );
}

/** Reusable slide-over drawer */
function Drawer({
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
  // Close on Escape
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
      <Backdrop onClick={onClose} />
      <div
        className="fixed top-0 right-0 z-50 h-full overflow-y-auto bg-gray-900 border-l border-gray-800 shadow-2xl animate-slideIn"
        style={{ width }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl leading-none"
          aria-label="Close"
        >
          &times;
        </button>
        <div className="p-6">{children}</div>
      </div>
    </>
  );
}

/** Reusable centered modal */
function Modal({
  open,
  onClose,
  children,
  maxWidth = '640px',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
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
      <Backdrop onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative w-full rounded-xl border border-gray-800 bg-gray-900 shadow-2xl overflow-y-auto max-h-[90vh]"
          style={{ maxWidth }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl leading-none z-10"
            aria-label="Close"
          >
            &times;
          </button>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </>
  );
}

// ─── Page component ────────────────────────────────────────────

export default function VisionAudioForgePage() {
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Feature 1: Extracted Data drawer
  const [selectedExtractedDoc, setSelectedExtractedDoc] = useState<ProcessedDocument | null>(null);

  // Feature 2: Create New Bundle modal
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [bundleStep, setBundleStep] = useState(1);
  const [bundleType, setBundleType] = useState('Funding Dossier');
  const [bundleEntity, setBundleEntity] = useState(CLIENT_LIST[0]);
  const [bundleLabel, setBundleLabel] = useState('');
  const [bundleNotes, setBundleNotes] = useState('');
  const [bundleSelectedDocs, setBundleSelectedDocs] = useState<string[]>([]);
  const [bundleDocFilter, setBundleDocFilter] = useState('');
  const [evidenceBundles, setEvidenceBundles] = useState<EvidenceBundle[]>(INITIAL_EVIDENCE_BUNDLES);

  // Feature 3: KYC drawer
  const [selectedKyc, setSelectedKyc] = useState<KycEntry | null>(null);

  // Feature 4: Upload Document modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadDocType, setUploadDocType] = useState('Auto-Classify');
  const [uploadClient, setUploadClient] = useState('');
  const [uploadPriority, setUploadPriority] = useState<'Standard' | 'Expedited'>('Standard');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const [uploadStageIndex, setUploadStageIndex] = useState(-1);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadFieldCount, setUploadFieldCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Feature 5: Document Detail drawer
  const [selectedDocDetail, setSelectedDocDetail] = useState<ProcessedDocument | null>(null);

  // Feature 6: Bundle Detail drawer
  const [selectedBundle, setSelectedBundle] = useState<EvidenceBundle | null>(null);

  // Feature 7: Pipeline stage expanded
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  // Feature 8: Document type bar filter
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Dynamic docs list (for upload additions)
  const [documents, setDocuments] = useState<ProcessedDocument[]>(PROCESSED_DOCS);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  // Auto-suggest bundle label
  useEffect(() => {
    if (showBundleModal && bundleStep === 1) {
      setBundleLabel(`${bundleEntity} - ${bundleType}`);
    }
  }, [bundleEntity, bundleType, showBundleModal, bundleStep]);

  // Upload pipeline simulation
  const runUploadPipeline = useCallback(() => {
    setUploadProcessing(true);
    setUploadStageIndex(0);
    setUploadComplete(false);

    const delays = [0, 500, 1500, 800, 300]; // Intake, Classification, OCR, Validation, Output
    let accumulated = 0;

    delays.forEach((delay, idx) => {
      accumulated += delay;
      setTimeout(() => {
        setUploadStageIndex(idx);
        if (idx === delays.length - 1) {
          setTimeout(() => {
            const fields = Math.floor(Math.random() * 5) + 5;
            setUploadFieldCount(fields);
            setUploadComplete(true);
            setUploadProcessing(false);
          }, 400);
        }
      }, accumulated);
    });
  }, []);

  const handleUploadSubmit = useCallback(() => {
    if (!uploadFileName) return;
    runUploadPipeline();
  }, [uploadFileName, runUploadPipeline]);

  const handleUploadViewExtracted = useCallback(() => {
    // Add new doc to table
    const newDoc: ProcessedDocument = {
      id: `doc-upload-${Date.now()}`,
      docType: uploadDocType === 'Auto-Classify' ? 'Bank Statement' : uploadDocType,
      source: '',
      filename: uploadFileName,
      client: uploadClient || 'Unassigned',
      status: 'Parsed',
      time: '2.1s',
      detail: `${uploadFieldCount} fields extracted`,
      classificationConfidence: 96.5,
      pipelineTimeline: [
        { stage: 'Document Intake', timestamp: '2026-04-01 10:00:00', completed: true },
        { stage: 'Classification', timestamp: '2026-04-01 10:00:01', completed: true },
        { stage: 'OCR Extraction', timestamp: '2026-04-01 10:00:02', completed: true },
        { stage: 'Data Validation', timestamp: '2026-04-01 10:00:03', completed: true },
        { stage: 'Output Delivery', timestamp: '2026-04-01 10:00:03', completed: true },
      ],
      extractedFields: Array.from({ length: uploadFieldCount }, (_, i) => ({
        field: `Field ${i + 1}`,
        value: `Extracted Value ${i + 1}`,
        confidence: 95 + Math.random() * 5,
        validated: Math.random() > 0.2,
      })),
    };
    setDocuments((prev) => [newDoc, ...prev]);
    setSelectedExtractedDoc(newDoc);
    setShowUploadModal(false);
    resetUploadState();
  }, [uploadDocType, uploadFileName, uploadClient, uploadFieldCount]);

  function resetUploadState() {
    setUploadDocType('Auto-Classify');
    setUploadClient('');
    setUploadPriority('Standard');
    setUploadFileName('');
    setUploadProcessing(false);
    setUploadStageIndex(-1);
    setUploadComplete(false);
    setUploadFieldCount(0);
    setDragOver(false);
  }

  function resetBundleState() {
    setBundleStep(1);
    setBundleType('Funding Dossier');
    setBundleEntity(CLIENT_LIST[0]);
    setBundleLabel('');
    setBundleNotes('');
    setBundleSelectedDocs([]);
    setBundleDocFilter('');
  }

  function handleCreateBundle() {
    const selectedDocData = BUNDLE_DOC_SELECTOR.filter((d) => bundleSelectedDocs.includes(d.id));
    const newBundle: EvidenceBundle = {
      id: `bundle-${Date.now()}`,
      client: bundleEntity,
      type: bundleType,
      docs: selectedDocData.length,
      created: '2026-04-01',
      createdBy: 'Current User',
      documents: selectedDocData.map((d) => ({
        name: d.name,
        type: d.type,
        dateAdded: '2026-04-01',
      })),
    };
    setEvidenceBundles((prev) => [newBundle, ...prev]);
    setShowBundleModal(false);
    resetBundleState();
    showToast(`Bundle "${bundleLabel}" created with ${selectedDocData.length} documents.`);
  }

  // Filtered documents for the table
  const filteredDocs = typeFilter
    ? documents.filter((d) => {
        // Map bar labels to doc types
        const mapping: Record<string, string[]> = {
          'Bank Statements': ['Bank Statement'],
          'Credit Card Statements': ['Credit Card Statement'],
          'Government IDs': ['Government ID'],
          'Contracts & Agreements': ['Contract', 'Agreement'],
          'Adverse Action Notices': ['Adverse Action Notice'],
          'Business Registrations': ['Business Registration'],
        };
        return mapping[typeFilter]?.includes(d.docType) ?? false;
      })
    : documents;

  const uploadStageNames = ['Intake', 'Classification', 'OCR Extraction', 'Validation', 'Output'];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Inline animation styles */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slideIn { animation: slideIn 0.25s ease-out; }
        @keyframes fadeScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeScale { animation: fadeScale 0.2s ease-out; }
      `}</style>

      {/* ── Toast ────────────────────────────────────────────── */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-[60] rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg animate-pulse">
          {toastMsg}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           FEATURE 1: Extracted Data Drawer
           ════════════════════════════════════════════════════════ */}
      <Drawer open={!!selectedExtractedDoc} onClose={() => setSelectedExtractedDoc(null)} width="640px">
        {selectedExtractedDoc && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-white">{selectedExtractedDoc.docType}</h2>
              <div className="mt-2 space-y-1 text-sm text-gray-400">
                <p>Filename: <span className="font-mono text-gray-300">{selectedExtractedDoc.filename}</span></p>
                <p>Client: <span className="text-gray-300">{selectedExtractedDoc.client}</span></p>
                <p>Status: <span className="text-emerald-400">{selectedExtractedDoc.status}</span></p>
                {selectedExtractedDoc.source && <p>Source: <span className="text-gray-300">{selectedExtractedDoc.source}</span></p>}
              </div>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Extracted Fields</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="pb-2 pr-3">Field</th>
                    <th className="pb-2 pr-3">Value</th>
                    <th className="pb-2 pr-3">Confidence</th>
                    <th className="pb-2">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {selectedExtractedDoc.extractedFields.map((f) => (
                    <tr key={f.field}>
                      <td className="py-2 pr-3 text-gray-400">{f.field}</td>
                      <td className="py-2 pr-3 font-medium text-gray-200">{f.value}</td>
                      <td className="py-2 pr-3">
                        <span className={`text-xs font-medium ${f.confidence >= 95 ? 'text-emerald-400' : f.confidence >= 85 ? 'text-amber-400' : 'text-red-400'}`}>
                          {f.confidence.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2">
                        {f.validated ? (
                          <span className="text-emerald-400 text-sm" title="Validated">&#10003;</span>
                        ) : (
                          <span className="text-amber-400 text-sm" title="Needs review">&#9888;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => { showToast('Data pushed to client record.'); setSelectedExtractedDoc(null); }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                Push to Client Record
              </button>
              <button
                onClick={() => showToast('JSON export downloaded.')}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Export JSON
              </button>
              <button
                onClick={() => showToast('Opening in Document Vault...')}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
              >
                View in Document Vault
              </button>
            </div>
          </>
        )}
      </Drawer>

      {/* ════════════════════════════════════════════════════════
           FEATURE 3: KYC Detail Drawer
           ════════════════════════════════════════════════════════ */}
      <Drawer open={!!selectedKyc} onClose={() => setSelectedKyc(null)} width="600px">
        {selectedKyc && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-white">{selectedKyc.name}</h2>
              <p className="mt-1 text-sm text-gray-400">{selectedKyc.docType} &middot; {selectedKyc.date}</p>
              <div className="mt-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                    selectedKyc.result === 'pass'
                      ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                      : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${selectedKyc.result === 'pass' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {selectedKyc.result === 'pass' ? 'Verification Passed' : 'Verification Failed'}
                </span>
              </div>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Verification Checks</h3>
            <div className="space-y-2 mb-6">
              {selectedKyc.checks.map((check) => (
                <div
                  key={check.label}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    check.passed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-lg ${check.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                      {check.passed ? '\u2713' : '\u2717'}
                    </span>
                    <span className="text-sm font-medium text-gray-200">{check.label}</span>
                  </div>
                  {check.detail && <span className="text-xs text-gray-400">{check.detail}</span>}
                </div>
              ))}
            </div>

            {selectedKyc.result === 'fail' && selectedKyc.failReasons && (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Failure Reasons</h3>
                <div className="mb-6 space-y-2">
                  {selectedKyc.failReasons.map((reason, i) => (
                    <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                      {reason}
                    </div>
                  ))}
                </div>

                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Remediation Actions</h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => showToast('Document re-request sent to client.')}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
                  >
                    Request New Document
                  </button>
                  <button
                    onClick={() => showToast('Flagged for manual review.')}
                    className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    Flag for Manual Review
                  </button>
                  <button
                    onClick={() => {
                      showToast('Associated application blocked.');
                    }}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
                  >
                    Block Associated Application
                  </button>
                </div>
              </>
            )}

            {selectedKyc.result === 'pass' && (
              <button
                onClick={() => showToast('Opening document in viewer...')}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                View Document
              </button>
            )}
          </>
        )}
      </Drawer>

      {/* ════════════════════════════════════════════════════════
           FEATURE 5: Document Detail Drawer
           ════════════════════════════════════════════════════════ */}
      <Drawer open={!!selectedDocDetail} onClose={() => setSelectedDocDetail(null)} width="600px">
        {selectedDocDetail && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-white">{selectedDocDetail.docType}</h2>
              <p className="mt-1 text-sm text-gray-400">
                <span className="font-mono">{selectedDocDetail.filename}</span>
                {selectedDocDetail.source && <span> &middot; {selectedDocDetail.source}</span>}
              </p>
              <p className="mt-1 text-sm text-gray-400">Client: <span className="text-gray-300">{selectedDocDetail.client}</span></p>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Processing Timeline</h3>
            <div className="mb-6 space-y-2">
              {selectedDocDetail.pipelineTimeline.map((step) => (
                <div key={step.stage} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 px-4 py-2">
                  <span className={`text-sm ${step.completed ? 'text-emerald-400' : 'text-gray-600'}`}>
                    {step.completed ? '\u2713' : '\u25CB'}
                  </span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-200">{step.stage}</span>
                  </div>
                  <span className="text-xs font-mono text-gray-500">{step.timestamp}</span>
                </div>
              ))}
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Classification Result</h3>
            <div className="mb-6 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
              <p className="text-sm text-gray-200">
                Type: <span className="font-semibold">{selectedDocDetail.docType}</span>
              </p>
              <p className="text-sm text-gray-400">
                Confidence: <span className="text-emerald-400 font-medium">{selectedDocDetail.classificationConfidence}%</span>
              </p>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Extraction Summary</h3>
            <div className="mb-6 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
              <p className="text-sm text-gray-200">
                Fields Extracted: <span className="font-semibold">{selectedDocDetail.extractedFields.length}</span>
              </p>
              <p className="text-sm text-gray-400">
                Avg Confidence:{' '}
                <span className="text-emerald-400 font-medium">
                  {(selectedDocDetail.extractedFields.reduce((a, b) => a + b.confidence, 0) / selectedDocDetail.extractedFields.length).toFixed(1)}%
                </span>
              </p>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setSelectedDocDetail(null);
                  setSelectedExtractedDoc(selectedDocDetail);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                View Extracted Data
              </button>
              <button
                onClick={() => showToast('Data pushed to client record.')}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Push to Client
              </button>
              <button
                onClick={() => showToast('Document queued for reprocessing.')}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Reprocess
              </button>
            </div>
          </>
        )}
      </Drawer>

      {/* ════════════════════════════════════════════════════════
           FEATURE 6: Bundle Detail Drawer
           ════════════════════════════════════════════════════════ */}
      <Drawer open={!!selectedBundle} onClose={() => setSelectedBundle(null)} width="600px">
        {selectedBundle && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-white">{selectedBundle.client}</h2>
              <div className="mt-2 space-y-1 text-sm text-gray-400">
                <p>Type: <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs font-medium text-gray-300">{selectedBundle.type}</span></p>
                <p>Created: <span className="text-gray-300">{selectedBundle.created}</span></p>
                <p>Documents: <span className="text-gray-300">{selectedBundle.docs}</span></p>
                <p>Created by: <span className="text-gray-300">{selectedBundle.createdBy}</span></p>
              </div>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Documents in Bundle</h3>
            <div className="mb-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="pb-2 pr-3">Document</th>
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2">Date Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {selectedBundle.documents.map((doc, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-300">{doc.name}</td>
                      <td className="py-2 pr-3 text-gray-400">{doc.type}</td>
                      <td className="py-2 text-gray-500">{doc.dateAdded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => showToast('ZIP bundle download started.')}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                Download ZIP
              </button>
              <button
                onClick={() => showToast('PDF report download started.')}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Download PDF
              </button>
              <button
                onClick={() => showToast('Document selector opened.')}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Add Document
              </button>
              <button
                onClick={() => {
                  showToast('Bundle archived.');
                  setSelectedBundle(null);
                }}
                className="rounded-lg bg-red-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
              >
                Archive
              </button>
            </div>
          </>
        )}
      </Drawer>

      {/* ════════════════════════════════════════════════════════
           FEATURE 2: Create New Bundle Modal (3-step)
           ════════════════════════════════════════════════════════ */}
      <Modal open={showBundleModal} onClose={() => { setShowBundleModal(false); resetBundleState(); }} maxWidth="680px">
        <h2 className="text-lg font-bold text-white mb-1">Create New Evidence Bundle</h2>
        <p className="text-sm text-gray-400 mb-5">Step {bundleStep} of 3</p>

        {/* Step indicators */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= bundleStep ? 'bg-blue-500' : 'bg-gray-800'
              }`}
            />
          ))}
        </div>

        {bundleStep === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Bundle Type</label>
              <select
                value={bundleType}
                onChange={(e) => setBundleType(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              >
                {BUNDLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Entity / Client</label>
              <select
                value={bundleEntity}
                onChange={(e) => setBundleEntity(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              >
                {CLIENT_LIST.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Label</label>
              <input
                type="text"
                value={bundleLabel}
                onChange={(e) => setBundleLabel(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                placeholder="Auto-suggested label"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Notes (optional)</label>
              <textarea
                value={bundleNotes}
                onChange={(e) => setBundleNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none resize-none"
                placeholder="Additional notes..."
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setBundleStep(2)}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                Next: Select Documents
              </button>
            </div>
          </div>
        )}

        {bundleStep === 2 && (
          <div className="space-y-4">
            <div>
              <input
                type="text"
                value={bundleDocFilter}
                onChange={(e) => setBundleDocFilter(e.target.value)}
                placeholder="Filter by document type..."
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="pb-2 pr-3 w-8" />
                    <th className="pb-2 pr-3">Document</th>
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {BUNDLE_DOC_SELECTOR
                    .filter((d) => !bundleDocFilter || d.type.toLowerCase().includes(bundleDocFilter.toLowerCase()))
                    .map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-800/50 cursor-pointer" onClick={() => {
                        setBundleSelectedDocs((prev) =>
                          prev.includes(doc.id) ? prev.filter((x) => x !== doc.id) : [...prev, doc.id]
                        );
                      }}>
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            checked={bundleSelectedDocs.includes(doc.id)}
                            onChange={() => {}}
                            className="rounded border-gray-600 bg-gray-800 text-blue-500"
                          />
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-gray-300">{doc.name}</td>
                        <td className="py-2 pr-3 text-gray-400">{doc.type}</td>
                        <td className="py-2 text-gray-500">{doc.date}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">{bundleSelectedDocs.length} document(s) selected</p>
            <div className="flex justify-between">
              <button
                onClick={() => setBundleStep(1)}
                className="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setBundleStep(3)}
                disabled={bundleSelectedDocs.length === 0}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Review
              </button>
            </div>
          </div>
        )}

        {bundleStep === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-2 text-sm">
              <p className="text-gray-400">Type: <span className="text-gray-200 font-medium">{bundleType}</span></p>
              <p className="text-gray-400">Entity: <span className="text-gray-200 font-medium">{bundleEntity}</span></p>
              <p className="text-gray-400">Label: <span className="text-gray-200 font-medium">{bundleLabel}</span></p>
              {bundleNotes && <p className="text-gray-400">Notes: <span className="text-gray-200">{bundleNotes}</span></p>}
              <p className="text-gray-400">Documents: <span className="text-gray-200 font-medium">{bundleSelectedDocs.length}</span></p>
              <div className="mt-2 space-y-1">
                {BUNDLE_DOC_SELECTOR.filter((d) => bundleSelectedDocs.includes(d.id)).map((doc) => (
                  <p key={doc.id} className="font-mono text-xs text-gray-400">{doc.name} ({doc.type})</p>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setBundleStep(2)}
                className="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateBundle}
                className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                Create Bundle
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ════════════════════════════════════════════════════════
           FEATURE 4: Upload Document Modal
           ════════════════════════════════════════════════════════ */}
      <Modal open={showUploadModal} onClose={() => { setShowUploadModal(false); resetUploadState(); }} maxWidth="560px">
        <h2 className="text-lg font-bold text-white mb-5">Upload Document</h2>

        {!uploadProcessing && !uploadComplete && (
          <div className="space-y-4">
            {/* Drag and drop zone */}
            <div
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors cursor-pointer ${
                dragOver
                  ? 'border-amber-400 bg-amber-500/5'
                  : uploadFileName
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length > 0) {
                  setUploadFileName(e.dataTransfer.files[0].name);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setUploadFileName(e.target.files[0].name);
                  }
                }}
              />
              {uploadFileName ? (
                <>
                  <span className="text-emerald-400 text-2xl mb-2">&#10003;</span>
                  <p className="text-sm font-medium text-gray-200">{uploadFileName}</p>
                  <p className="text-xs text-gray-500 mt-1">Click to change file</p>
                </>
              ) : (
                <>
                  <span className="text-gray-500 text-3xl mb-2">&#8679;</span>
                  <p className="text-sm text-gray-400">Drag & drop a file here, or click to browse</p>
                  <p className="text-xs text-gray-600 mt-1">Supports PDF, JPG, PNG</p>
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Document Type</label>
              <select
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              >
                {UPLOAD_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Client (optional)</label>
              <select
                value={uploadClient}
                onChange={(e) => setUploadClient(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="">-- None --</option>
                {CLIENT_LIST.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Priority</label>
              <div className="flex gap-4">
                {(['Standard', 'Expedited'] as const).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      checked={uploadPriority === p}
                      onChange={() => setUploadPriority(p)}
                      className="text-blue-500"
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleUploadSubmit}
              disabled={!uploadFileName}
              className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Upload & Process
            </button>
          </div>
        )}

        {/* Processing pipeline animation */}
        {(uploadProcessing || uploadComplete) && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-4 font-mono">{uploadFileName}</p>
            {uploadStageNames.map((name, idx) => {
              const isComplete = idx <= uploadStageIndex;
              const isCurrent = idx === uploadStageIndex && !uploadComplete;
              return (
                <div
                  key={name}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-300 ${
                    isComplete
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-gray-800 bg-gray-950 opacity-40'
                  }`}
                >
                  <span className={`text-sm min-w-[20px] ${isComplete ? 'text-emerald-400' : 'text-gray-600'}`}>
                    {isComplete ? '\u2713' : '\u25CB'}
                  </span>
                  <span className={`text-sm font-medium ${isComplete ? 'text-gray-200' : 'text-gray-500'}`}>
                    {name}
                  </span>
                  {isCurrent && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </div>
              );
            })}

            {uploadComplete && (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                <p className="text-emerald-400 font-semibold">{uploadFieldCount} fields extracted</p>
                <button
                  onClick={handleUploadViewExtracted}
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
                >
                  View Extracted Data
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

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
          <div className="flex items-center gap-3">
            {/* Feature 4: Upload Document button */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-amber-400 transition-colors"
            >
              + Upload Document
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              Mock Mode
            </span>
          </div>
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

          {/* Feature 8: Type filter chip */}
          {typeFilter && (
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-400 ring-1 ring-blue-500/30">
                Filtered by: {typeFilter}
                <button
                  onClick={() => setTypeFilter(null)}
                  className="ml-1 text-blue-300 hover:text-white"
                >
                  &times;
                </button>
              </span>
            </div>
          )}

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
                {filteredDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="group cursor-pointer hover:bg-gray-800/40 transition-colors"
                    onClick={() => setSelectedDocDetail(doc)}
                  >
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
                        onClick={(e) => { e.stopPropagation(); setSelectedExtractedDoc(doc); }}
                        className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        View Extracted Data
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── 4. OCR Pipeline Status ─────────────────────────── */}
        <Card>
          <SectionTitle>OCR Pipeline Status</SectionTitle>
          <div className="flex flex-col lg:flex-row items-stretch gap-0">
            {PIPELINE_STAGES.map((stage, idx) => (
              <div key={stage.stage} className="flex items-center flex-1">
                <div
                  className={`flex-1 rounded-lg border bg-gray-950 p-4 text-center cursor-pointer transition-colors ${
                    expandedStage === stage.stage
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-gray-800 hover:border-gray-700'
                  }`}
                  onClick={() => setExpandedStage(expandedStage === stage.stage ? null : stage.stage)}
                >
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

          {/* Feature 7: Expanded stage detail */}
          {expandedStage && PIPELINE_STAGE_DETAILS[expandedStage] && (() => {
            const detail = PIPELINE_STAGE_DETAILS[expandedStage];
            const stageName = PIPELINE_STAGES.find((s) => s.stage === expandedStage)?.name;
            return (
              <div className="mt-4 rounded-lg border border-blue-500/20 bg-gray-950 p-5 animate-fadeScale">
                <h3 className="text-sm font-semibold text-gray-200 mb-3">{stageName} - Details</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div className="rounded-lg bg-gray-900 border border-gray-800 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Throughput</p>
                    <p className="mt-1 text-sm font-bold text-white">{detail.throughput}</p>
                  </div>
                  <div className="rounded-lg bg-gray-900 border border-gray-800 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Error Rate</p>
                    <p className="mt-1 text-sm font-bold text-white">{detail.errorRate}</p>
                  </div>
                  <div className="rounded-lg bg-gray-900 border border-gray-800 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Queue Depth</p>
                    <p className="mt-1 text-sm font-bold text-white">{detail.queueDepth}</p>
                  </div>
                  <div className="rounded-lg bg-gray-900 border border-gray-800 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Avg Time</p>
                    <p className="mt-1 text-sm font-bold text-white">{detail.avgTime}</p>
                  </div>
                </div>
                {detail.extra && (
                  <p className="mb-3 text-xs text-gray-400 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">{detail.extra}</p>
                )}
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Last 3 Documents</p>
                <div className="space-y-1">
                  {detail.recentDocs.map((rd, i) => (
                    <div key={i} className="flex items-center justify-between rounded bg-gray-900 px-3 py-2 text-xs">
                      <span className="font-mono text-gray-300">{rd.name}</span>
                      <span className="text-gray-400">{rd.status}</span>
                      <span className="text-gray-500">{rd.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>

        {/* ── 5. Document Type Breakdown + 6. KYC Verification ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Document Type Breakdown */}
          <Card>
            <SectionTitle>Document Type Breakdown</SectionTitle>
            <div className="space-y-3">
              {DOC_TYPES.map((dt) => (
                <div
                  key={dt.label}
                  className={`cursor-pointer rounded-lg p-2 -mx-2 transition-colors ${
                    typeFilter === dt.label ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : 'hover:bg-gray-800/50'
                  }`}
                  onClick={() => setTypeFilter(typeFilter === dt.label ? null : dt.label)}
                >
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
                <div
                  key={entry.name + entry.date}
                  className="flex items-center justify-between py-2.5 text-sm cursor-pointer hover:bg-gray-800/40 rounded-lg px-2 -mx-2 transition-colors"
                  onClick={() => setSelectedKyc(entry)}
                >
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
                <p className="mt-1 text-xl font-bold text-white">{89 + evidenceBundles.length - 2}</p>
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
              onClick={() => { setShowBundleModal(true); resetBundleState(); }}
              className="mb-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              Create New Bundle
            </button>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Recent Bundles</p>
            <div className="divide-y divide-gray-800/60">
              {evidenceBundles.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-2.5 text-sm cursor-pointer hover:bg-gray-800/40 rounded-lg px-2 -mx-2 transition-colors"
                  onClick={() => setSelectedBundle(b)}
                >
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
