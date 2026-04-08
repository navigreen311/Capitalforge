'use client';

// ============================================================
// DocumentResponseModal — Generates a formal response letter
// for network rule violations with a typing animation effect.
// Provides Save, Copy, and Regenerate actions.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ViolationDetail {
  id: string;
  rule: string;
  network: string;
  severity: string;
  merchant: string;
  date: string;
  description: string;
  amount?: number;
}

export interface DocumentResponseModalProps {
  violation: ViolationDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (violationId: string, response: string) => void;
}

// ── Letter Generation ──────────────────────────────────────────────────────

function generateResponseLetter(v: ViolationDetail): string {
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const violationDate = new Date(v.date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const amount = v.amount
    ? v.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : '[Amount on file]';

  return `${today}

To: ${v.network} Network Compliance Department
Re: Formal Response — ${v.rule}
Violation ID: ${v.id}

Dear ${v.network} Compliance Team,

This letter serves as our formal response to the network rule violation flagged on ${violationDate} regarding the transaction at ${v.merchant} for ${amount}.

VIOLATION SUMMARY
Rule: ${v.rule}
Network: ${v.network}
Merchant: ${v.merchant}
Transaction Date: ${violationDate}
Transaction Amount: ${amount}
Severity: ${v.severity.charAt(0).toUpperCase() + v.severity.slice(1)}
Description: ${v.description}

CORRECTIVE ACTIONS TAKEN
1. The flagged transaction has been reviewed by our compliance team and the cardholder has been notified of the policy violation.
2. We have updated our merchant category code (MCC) blocking rules to prevent future transactions at this merchant category.
3. Enhanced monitoring controls have been implemented for all cards associated with this account to detect similar activity in real-time.
4. The cardholder agreement has been re-issued with explicit language regarding ${v.network} network rules and prohibited transaction types.

PREVENTIVE MEASURES
- Real-time MCC blocking for restricted categories now active
- Automated alerts configured for transactions exceeding risk thresholds
- Quarterly compliance training scheduled for all cardholders
- Monthly audit of transaction patterns against network rule requirements

We take our obligations under the ${v.network} network operating regulations seriously and are committed to maintaining full compliance. Please do not hesitate to contact us should you require additional documentation or clarification.

Respectfully,

[Advisor Name]
[Company Name]
Compliance & Spend Governance Division
[Phone] | [Email]`;
}

// ── Typing Animation Hook ──────────────────────────────────────────────────

function useTypingEffect(text: string, speed: number = 8) {
  const [displayed, setDisplayed] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    setDisplayed('');
    setIsComplete(false);
    indexRef.current = 0;

    function tick() {
      const chunkSize = Math.floor(Math.random() * 3) + 2; // 2-4 chars per tick
      const nextIndex = Math.min(indexRef.current + chunkSize, text.length);
      setDisplayed(text.slice(0, nextIndex));
      indexRef.current = nextIndex;

      if (nextIndex < text.length) {
        rafRef.current = setTimeout(tick, speed);
      } else {
        setIsComplete(true);
      }
    }

    rafRef.current = setTimeout(tick, 300); // initial delay
  }, [text, speed]);

  const skipToEnd = useCallback(() => {
    if (rafRef.current) clearTimeout(rafRef.current);
    setDisplayed(text);
    setIsComplete(true);
  }, [text]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, []);

  return { displayed, isComplete, start, skipToEnd };
}

// ── Component ──────────────────────────────────────────────────────────────

export function DocumentResponseModal({
  violation,
  isOpen,
  onClose,
  onSave,
}: DocumentResponseModalProps) {
  const [editableText, setEditableText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const letterText = violation ? generateResponseLetter(violation) : '';
  const { displayed, isComplete, start, skipToEnd } = useTypingEffect(letterText);

  // Start typing animation when modal opens
  useEffect(() => {
    if (isOpen && violation) {
      setEditableText('');
      setIsEditing(false);
      setCopied(false);
      setSaved(false);
      start();
    }
  }, [isOpen, violation, start]);

  // When typing completes, set editable text
  useEffect(() => {
    if (isComplete && letterText) {
      setEditableText(letterText);
    }
  }, [isComplete, letterText]);

  function handleEdit() {
    if (!isComplete) skipToEnd();
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleCopy() {
    const text = isEditing ? editableText : (isComplete ? letterText : displayed);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSave() {
    if (violation) {
      onSave(violation.id, isEditing ? editableText : letterText);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function handleRegenerate() {
    setIsEditing(false);
    setCopied(false);
    setSaved(false);
    start();
  }

  function handleClose() {
    if (typeof skipToEnd === 'function') skipToEnd();
    onClose();
  }

  if (!isOpen || !violation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] mx-4 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-white">Document Response</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {violation.rule} &mdash; {violation.merchant}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Close modal"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Generation status bar */}
        <div className="px-6 py-2 border-b border-gray-800 bg-gray-950/50">
          <div className="flex items-center gap-2">
            {!isComplete ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs text-amber-300 font-medium">
                  Generating response letter...
                </span>
                <button
                  type="button"
                  onClick={skipToEnd}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Skip animation
                </button>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-300 font-medium">
                  Response generated — review and edit as needed
                </span>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              className="w-full h-[500px] rounded-lg border border-gray-700 bg-gray-950 p-4
                text-sm text-gray-200 font-mono leading-relaxed resize-none
                focus:outline-none focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/30"
              spellCheck
            />
          ) : (
            <div
              className="rounded-lg border border-gray-800 bg-gray-950 p-4 min-h-[300px] cursor-text"
              onClick={handleEdit}
            >
              <pre className="text-sm text-gray-200 font-mono leading-relaxed whitespace-pre-wrap">
                {displayed}
                {!isComplete && (
                  <span className="inline-block w-1.5 h-4 bg-amber-400 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
          <button
            type="button"
            onClick={handleRegenerate}
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-xs
              font-medium text-gray-300 hover:bg-gray-700 hover:border-gray-500
              focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
          >
            Regenerate
          </button>

          <div className="flex items-center gap-2">
            {!isEditing && isComplete && (
              <button
                type="button"
                onClick={handleEdit}
                className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-xs
                  font-medium text-gray-300 hover:bg-gray-700 hover:border-gray-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
              >
                Edit
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              disabled={!isComplete}
              className="rounded-lg border border-blue-700/50 bg-blue-900/30 px-4 py-2 text-xs
                font-medium text-blue-300 hover:bg-blue-900/50 hover:border-blue-600
                disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!isComplete}
              className="rounded-lg bg-[#C9A84C] px-4 py-2 text-xs font-semibold text-gray-900
                hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors"
            >
              {saved ? 'Saved!' : 'Save Response'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
