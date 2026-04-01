'use client';

// ============================================================
// ReconLetterGenerator — Enhanced reconsideration letter
// generator panel. Produces template-based recon letters for
// declined credit applications with copy, download, and
// mark-as-sent actions.
// ============================================================

import { useState, useCallback, useEffect } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReconLetterGeneratorProps {
  decline: {
    id: string;
    businessName: string;
    issuer: string;
    cardProduct: string;
    declinedDate: string;
    reasonDetail: string;
    requestedLimit: number;
    appId: string;
  } | null;
  onMarkSent?: (declineId: string) => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const RECON_LINES: Record<string, string> = {
  Chase: '888-245-0625',
  Amex: '877-399-3083',
  Citi: '800-695-5171',
  'Capital One': '800-625-7866',
  BofA: '800-841-6863',
  'Wells Fargo': '800-967-9521',
  'US Bank': '800-947-1444',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function todayFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Letter Template Generator ───────────────────────────────────────────────

function generateLetterText(decline: NonNullable<ReconLetterGeneratorProps['decline']>): string {
  const today = todayFormatted();
  const declineDate = formatDate(decline.declinedDate);
  const limit = formatCurrency(decline.requestedLimit);

  return `${today}

To: ${decline.issuer} Reconsideration Department
Re: Application #${decline.appId} — ${decline.cardProduct}
Business: ${decline.businessName}

Dear ${decline.issuer} Reconsideration Team,

I am writing to respectfully request reconsideration of the above-referenced application for the ${decline.cardProduct}, which was declined on ${declineDate}.

I understand the decision was based on the following concern: ${decline.reasonDetail}. I would like to provide additional context that I believe addresses this concern and demonstrates the creditworthiness of my business.

${decline.businessName} has maintained a strong financial track record and I am confident that the requested credit line of ${limit} is well within our capacity to manage responsibly. I would welcome the opportunity to provide any additional documentation or information that may support a favorable reassessment.

I kindly ask that you review this application with the additional context provided. Please do not hesitate to contact me if you require further information.

Thank you for your time and consideration.

Sincerely,
[Authorized Representative]
${decline.businessName}`;
}

// ── Sub-Components ──────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
      {/* Envelope icon */}
      <svg
        className="w-16 h-16 text-gray-500 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5a2.25 2.25 0 00-2.25 2.25m19.5 0l-8.625 5.25a1.5 1.5 0 01-1.5 0L2.25 6.75"
        />
      </svg>
      <p className="text-gray-400 text-sm font-medium">No letter selected</p>
      <p className="text-gray-500 text-xs mt-1">
        Click &ldquo;Write Letter&rdquo; in any decline row
      </p>
    </div>
  );
}

function GeneratingState({ issuer }: { issuer: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
      {/* Spinner */}
      <svg
        className="animate-spin w-10 h-10 text-blue-400 mb-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p className="text-gray-300 text-sm font-medium">
        Generating letter for {issuer}...
      </p>
    </div>
  );
}

function SuccessToast({ message }: { message: string }) {
  return (
    <div className="absolute top-4 right-4 bg-green-600 text-white text-xs font-medium px-3 py-2 rounded-md shadow-lg z-50 animate-fade-in">
      {message}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ReconLetterGenerator({ decline, onMarkSent }: ReconLetterGeneratorProps) {
  const [letterText, setLetterText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  // Stats placeholders
  const reconsInitiated = 4;
  const reversalsWon = 1;

  // Generate letter when decline changes
  useEffect(() => {
    if (!decline) {
      setLetterText('');
      setIsSent(false);
      return;
    }

    setIsGenerating(true);
    setIsSent(false);

    // Simulate brief generation delay for UX
    const timer = setTimeout(() => {
      setLetterText(generateLetterText(decline));
      setIsGenerating(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [decline]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(letterText);
      setToastMessage('Copied to clipboard');
    } catch {
      setToastMessage('Failed to copy');
    }
  }, [letterText]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([letterText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recon-letter-${decline?.appId ?? 'unknown'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToastMessage('Letter downloaded');
  }, [letterText, decline?.appId]);

  const handleMarkSent = useCallback(() => {
    if (!decline) return;
    onMarkSent?.(decline.id);
    setIsSent(true);
    setToastMessage('Marked as sent');
  }, [decline, onMarkSent]);

  const handleRegenerate = useCallback(() => {
    if (!decline) return;
    setIsGenerating(true);
    const timer = setTimeout(() => {
      setLetterText(generateLetterText(decline));
      setIsGenerating(false);
      setToastMessage('Letter regenerated');
    }, 600);
    return () => clearTimeout(timer);
  }, [decline]);

  // Resolve recon phone line
  const reconPhone = decline ? RECON_LINES[decline.issuer] ?? null : null;

  // ── Empty state ──
  if (!decline) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg h-full flex flex-col">
        <div className="px-5 py-4 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-200">Recon Letter Generator</h3>
        </div>
        <EmptyState />
      </div>
    );
  }

  // ── Generating state ──
  if (isGenerating) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg h-full flex flex-col">
        <div className="px-5 py-4 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-200">Recon Letter Generator</h3>
        </div>
        <GeneratingState issuer={decline.issuer} />
      </div>
    );
  }

  // ── Generated letter ──
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg h-full flex flex-col relative">
      {toastMessage && <SuccessToast message={toastMessage} />}

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-200">Recon Letter Generator</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Letter Meta Header */}
        <div className="bg-gray-800 rounded-md px-4 py-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Issuer</span>
            <span className="text-xs font-medium text-gray-200">{decline.issuer}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Card Product</span>
            <span className="text-xs font-medium text-gray-200">{decline.cardProduct}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Business</span>
            <span className="text-xs font-medium text-gray-200">{decline.businessName}</span>
          </div>
        </div>

        {/* Editable Letter */}
        <textarea
          className="w-full bg-gray-800 border border-gray-600 rounded-md text-sm text-gray-200 px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono leading-relaxed"
          rows={18}
          value={letterText}
          onChange={(e) => setLetterText(e.target.value)}
        />

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-200 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
            Copy to Clipboard
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-200 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download as TXT
          </button>

          <button
            onClick={handleMarkSent}
            disabled={isSent}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              isSent
                ? 'bg-green-800 text-green-300 border border-green-700 cursor-not-allowed'
                : 'text-white bg-blue-600 hover:bg-blue-500 border border-blue-500'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {isSent ? 'Sent' : 'Mark as Sent'}
          </button>

          <button
            onClick={handleRegenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-200 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Regenerate
          </button>
        </div>

        {/* Issuer Recon Line */}
        {reconPhone && (
          <div className="bg-gray-800 rounded-md px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Recon Line</p>
              <p className="text-sm font-medium text-gray-200">{reconPhone}</p>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 border border-purple-500 rounded-md transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              Call via VoiceForge
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-md px-4 py-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{reconsInitiated}</p>
            <p className="text-xs text-gray-400 mt-1">Recons Initiated</p>
          </div>
          <div className="bg-gray-800 rounded-md px-4 py-3 text-center">
            <p className="text-2xl font-bold text-green-400">{reversalsWon}</p>
            <p className="text-xs text-gray-400 mt-1">Reversals Won</p>
          </div>
        </div>
      </div>
    </div>
  );
}
