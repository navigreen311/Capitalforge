'use client';

import { useState, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedData {
  issuer: string;
  cardProduct: string;
  applicant: string;
  noticeDate: string;
  reasons: string[];
}

interface AdverseActionParserEnhancedProps {
  onCreateRecord?: (extracted: ExtractedData) => void;
}

// ---------------------------------------------------------------------------
// Simulated extraction profiles
// ---------------------------------------------------------------------------

const EXTRACTION_PROFILES: Record<string, ExtractedData> = {
  horizon: {
    issuer: 'Citi',
    cardProduct: 'Citi\u00ae Business Platinum',
    applicant: 'Horizon Retail Partners',
    noticeDate: 'March 25, 2026',
    reasons: [
      'Number of recent inquiries (primary)',
      'Insufficient credit history (secondary)',
    ],
  },
  apex: {
    issuer: 'Chase',
    cardProduct: 'Ink Business Unlimited',
    applicant: 'Apex Ventures LLC',
    noticeDate: 'March 18, 2026',
    reasons: [
      'Too many new accounts opened in the past 24 months (primary)',
      'Length of time accounts have been established (secondary)',
      'Proportion of balances to credit limits too high (tertiary)',
    ],
  },
};

const GENERIC_PROFILE: ExtractedData = {
  issuer: 'Unknown Issuer',
  cardProduct: 'Business Credit Card',
  applicant: 'Applicant Name (not detected)',
  noticeDate: new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
  reasons: [
    'Reason code not detected — manual review recommended (primary)',
  ],
};

function resolveProfile(filename: string): ExtractedData {
  const lower = filename.toLowerCase();
  for (const [key, profile] of Object.entries(EXTRACTION_PROFILES)) {
    if (lower.includes(key)) return profile;
  }
  return GENERIC_PROFILE;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdverseActionParserEnhanced({
  onCreateRecord,
}: AdverseActionParserEnhancedProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);

  // -- File handling --------------------------------------------------------

  const handleFile = (file: File) => {
    setFileName(file.name);
    setExtracted(null);
    setParsing(true);

    // Simulate async parsing delay
    setTimeout(() => {
      const profile = resolveProfile(file.name);
      setExtracted(profile);
      setParsing(false);
    }, 1200);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleClear = () => {
    setFileName(null);
    setExtracted(null);
    setParsing(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  // -- Render ---------------------------------------------------------------

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <h2 className="text-base font-semibold text-gray-200 mb-1">
        Adverse Action Notice Parser
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Upload a decline letter (PDF or image) to auto-extract issuer details
        and reason codes into a structured record.
      </p>

      {/* ── Upload zone ──────────────────────────────────────────── */}
      {!extracted && !parsing && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors
            ${
              dragging
                ? 'border-yellow-600 bg-yellow-900/10'
                : 'border-gray-700 hover:border-gray-600 hover:bg-gray-900'
            }`}
        >
          <div className="text-4xl mb-2 opacity-40">📄</div>
          <p className="text-sm text-gray-400">
            Drop adverse action notice here, or{' '}
            <span className="text-yellow-500 underline">browse files</span>
          </p>
          <p className="text-xs text-gray-600 mt-1">PDF, PNG, JPG accepted</p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* ── Parsing spinner ──────────────────────────────────────── */}
      {parsing && fileName && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-yellow-600 border-t-transparent animate-spin" />
          <p className="text-sm text-yellow-400 font-semibold">
            Parsing {fileName}...
          </p>
          <p className="text-xs text-gray-600">
            Extracting issuer, applicant, and reason codes
          </p>
        </div>
      )}

      {/* ── Structured results ───────────────────────────────────── */}
      {extracted && fileName && (
        <div className="space-y-4">
          {/* Header */}
          <div className="rounded-lg bg-gray-950 border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <p className="text-xs font-bold text-green-400 uppercase tracking-wider">
                Parsed Results &mdash; {fileName}
              </p>
              <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">
                Simulated
              </span>
            </div>

            {/* Extracted fields */}
            <div className="px-4 py-4 space-y-2 font-mono text-xs">
              <div className="border-b border-gray-800 pb-3 space-y-1.5">
                <Row label="Issuer detected" value={extracted.issuer} />
                <Row label="Card product" value={extracted.cardProduct} />
                <Row label="Applicant" value={extracted.applicant} />
                <Row label="Date of notice" value={extracted.noticeDate} />
              </div>

              {/* Reasons */}
              <div className="pt-2">
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Extracted Decline Reasons
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  {extracted.reasons.map((reason, idx) => (
                    <li key={idx} className="text-gray-300">
                      {reason}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onCreateRecord?.(extracted)}
              className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm font-semibold text-blue-200 transition-colors"
            >
              Create Decline Record from This Notice
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-800 text-sm text-gray-400 transition-colors"
            >
              Clear / Upload New
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-component
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-gray-500 w-36 flex-shrink-0 text-right">
        {label}:
      </span>
      <span className="text-gray-200 font-semibold">{value}</span>
    </div>
  );
}
