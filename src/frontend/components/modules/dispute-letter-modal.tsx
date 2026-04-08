'use client';

// ============================================================
// DisputeLetterModal — AI-style dispute letter generation modal
// with typing effect, editable textarea, and Save/Copy/Regenerate
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DisputeLetterAnomaly {
  id: string;
  description: string;
  affectedCard: string;
  affectedCardLast4?: string;
  issuer?: string;
  amount?: number;
  expectedAmount?: number;
  statementId?: string;
  type: string;
  severity: string;
}

interface DisputeLetterModalProps {
  anomaly: DisputeLetterAnomaly;
  clientName?: string;
  onClose: () => void;
  onSave?: (letter: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n);
}

function generateLetterContent(anomaly: DisputeLetterAnomaly, clientName: string): string {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const issuer = anomaly.issuer ?? 'Card Issuer';
  const card = anomaly.affectedCard;
  const last4 = anomaly.affectedCardLast4 ? ` ending in ${anomaly.affectedCardLast4}` : '';
  const amount = anomaly.amount !== undefined ? fmtCurrency(anomaly.amount) : 'the charged amount';
  const expected = anomaly.expectedAmount !== undefined ? fmtCurrency(anomaly.expectedAmount) : 'the expected amount';
  const refId = anomaly.statementId ?? 'N/A';

  return `${today}

${issuer} — Commercial Card Dispute Department
P.O. Box 15020
Wilmington, DE 19850

Re: Formal Dispute — ${card}${last4}
Reference: ${refId}

Dear ${issuer} Dispute Resolution Team,

I am writing on behalf of ${clientName} to formally dispute a charge identified on our recent statement for the ${card}${last4} account.

DISPUTE DETAILS:
- Card: ${card}${last4}
- Anomaly: ${anomaly.description}
- Amount Charged: ${amount}${anomaly.expectedAmount !== undefined ? `\n- Expected Amount: ${expected}` : ''}
- Severity: ${anomaly.severity.charAt(0).toUpperCase() + anomaly.severity.slice(1)}

Upon review of our billing statement (Ref: ${refId}), we identified the following discrepancy: ${anomaly.description.toLowerCase()}

We request that ${issuer} investigate this matter and provide a correction or credit to our account within 30 days, in accordance with the Fair Credit Billing Act (15 U.S.C. § 1666). During the investigation period, we request that the disputed amount not be reported as delinquent and that no finance charges be assessed on the disputed amount.

Please confirm receipt of this dispute in writing and provide a timeline for resolution. We have retained copies of all supporting documentation and are prepared to provide additional information as needed.

Thank you for your prompt attention to this matter.

Sincerely,

______________________________
Authorized Representative
${clientName}

Enclosures:
- Copy of statement (${refId})
- Anomaly detection report
- Supporting transaction records`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DisputeLetterModal({
  anomaly,
  clientName = 'CapitalForge Client',
  onClose,
  onSave,
}: DisputeLetterModalProps) {
  const fullLetter = useRef(generateLetterContent(anomaly, clientName));
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charIndex = useRef(0);

  // Typing effect
  useEffect(() => {
    if (!isTyping) return;

    const letter = fullLetter.current;
    charIndex.current = 0;
    setDisplayedText('');

    typingRef.current = setInterval(() => {
      const chunkSize = Math.floor(Math.random() * 3) + 2; // 2-4 chars per tick
      const nextIndex = Math.min(charIndex.current + chunkSize, letter.length);
      setDisplayedText(letter.slice(0, nextIndex));
      charIndex.current = nextIndex;

      if (nextIndex >= letter.length) {
        setIsTyping(false);
        setEditableText(letter);
        if (typingRef.current) clearInterval(typingRef.current);
      }
    }, 12);

    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, [isTyping]);

  // Skip typing
  const skipTyping = useCallback(() => {
    if (typingRef.current) clearInterval(typingRef.current);
    setDisplayedText(fullLetter.current);
    setEditableText(fullLetter.current);
    setIsTyping(false);
  }, []);

  // Regenerate
  const handleRegenerate = useCallback(() => {
    fullLetter.current = generateLetterContent(anomaly, clientName);
    setIsEditing(false);
    setIsTyping(true);
    setCopied(false);
    setSaved(false);
  }, [anomaly, clientName]);

  // Copy
  const handleCopy = useCallback(async () => {
    const text = isEditing ? editableText : displayedText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [isEditing, editableText, displayedText]);

  // Save
  const handleSave = useCallback(() => {
    const text = isEditing ? editableText : displayedText;
    onSave?.(text);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [isEditing, editableText, displayedText, onSave]);

  // Edit toggle
  const handleEdit = useCallback(() => {
    if (!isTyping) {
      setIsEditing(true);
      setEditableText((prev) => prev || displayedText);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isTyping, displayedText]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-lg bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C] text-sm">
              &#10022;
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Generate Dispute Letter</h2>
              <p className="text-xs text-gray-500">
                AI-generated formal dispute for {anomaly.affectedCard}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none"
          >
            &#10005;
          </button>
        </div>

        {/* Typing indicator */}
        {isTyping && (
          <div className="px-5 pt-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#C9A84C] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-[#C9A84C] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-[#C9A84C] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-[#C9A84C] font-medium">Generating dispute letter...</span>
            </div>
            <button
              onClick={skipTyping}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Skip animation
            </button>
          </div>
        )}

        {/* Letter content */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              className="w-full h-[50vh] rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 font-mono leading-relaxed outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 transition-colors resize-none"
              spellCheck
            />
          ) : (
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 min-h-[200px] max-h-[50vh] overflow-auto">
              <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap leading-relaxed">
                {displayedText}
                {isTyping && (
                  <span className="inline-block w-0.5 h-4 bg-[#C9A84C] animate-pulse ml-0.5 align-middle" />
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            {!isTyping && !isEditing && (
              <button
                onClick={handleEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors"
              >
                Done Editing
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Regenerate */}
            <button
              onClick={handleRegenerate}
              disabled={isTyping}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>

            {/* Copy */}
            <button
              onClick={handleCopy}
              disabled={isTyping}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                copied
                  ? 'bg-emerald-900 text-emerald-300 border-emerald-700'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-600'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={isTyping}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                saved
                  ? 'bg-emerald-800 text-emerald-100 border border-emerald-600'
                  : 'bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628]'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {saved ? 'Saved!' : 'Save Letter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
