'use client';

// ============================================================
// GenerateDocumentModal — Application-specific AI document
// generation modal with streaming typing effect. Wraps the
// claude-document-service for Business Purpose Statements,
// Application Cover Letters, and Decline Reconsideration Letters.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateDocument,
  saveToDocumentVault,
  type DocumentType,
  type GeneratedDocument,
} from '@/lib/claude-document-service';
import { useToast } from '@/components/global/ToastProvider';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GenerateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentType;
  documentTitle: string;
  context: Record<string, unknown>;
  clientId: string;
}

type Phase = 'idle' | 'generating' | 'streaming' | 'review' | 'saving' | 'error';

// ── Streaming typing hook ───────────────────────────────────────────────────

function useStreamingText(fullText: string, active: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active || !fullText) {
      setDisplayed('');
      setDone(false);
      indexRef.current = 0;
      return;
    }

    indexRef.current = 0;
    setDisplayed('');
    setDone(false);

    const interval = setInterval(() => {
      const chunkSize = Math.floor(Math.random() * 3) + 1; // 1-3 chars per tick
      indexRef.current = Math.min(indexRef.current + chunkSize, fullText.length);
      setDisplayed(fullText.slice(0, indexRef.current));

      if (indexRef.current >= fullText.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [fullText, active, speed]);

  return { displayed, done };
}

// ── Component ───────────────────────────────────────────────────────────────

export function GenerateDocumentModal({
  isOpen,
  onClose,
  documentType,
  documentTitle,
  context,
  clientId,
}: GenerateDocumentModalProps) {
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocument | null>(null);
  const [rawContent, setRawContent] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Streaming effect
  const isStreaming = phase === 'streaming';
  const { displayed, done: streamDone } = useStreamingText(rawContent, isStreaming);

  // Transition from streaming to review when done
  useEffect(() => {
    if (streamDone && phase === 'streaming') {
      setEditedContent(rawContent);
      setPhase('review');
    }
  }, [streamDone, phase, rawContent]);

  // Auto-scroll textarea during streaming
  useEffect(() => {
    if (isStreaming && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [displayed, isStreaming]);

  const handleGenerate = useCallback(async () => {
    setPhase('generating');
    setErrorMessage('');
    try {
      const result = await generateDocument({
        type: documentType,
        context,
        tone: 'professional',
        length: 'standard',
      });
      setGeneratedDoc(result);
      setRawContent(result.content);
      setPhase('streaming');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Generation failed');
      setPhase('error');
    }
  }, [documentType, context]);

  const handleSaveToVault = useCallback(async () => {
    if (!generatedDoc) return;
    setPhase('saving');
    try {
      await saveToDocumentVault({ ...generatedDoc, content: editedContent }, clientId);
      toast.success('Document saved to vault');
      handleClose();
    } catch {
      toast.error('Failed to save document');
      setPhase('review');
    }
  }, [generatedDoc, editedContent, clientId, toast]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editedContent);
    toast.info('Copied to clipboard');
  }, [editedContent, toast]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([editedContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentType}_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.info('Downloaded');
  }, [editedContent, documentType, toast]);

  const handleClose = useCallback(() => {
    setPhase('idle');
    setGeneratedDoc(null);
    setRawContent('');
    setEditedContent('');
    setErrorMessage('');
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const wordCount = (phase === 'review' || phase === 'saving')
    ? editedContent.split(/\s+/).filter(Boolean).length
    : displayed.split(/\s+/).filter(Boolean).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={documentTitle}
      >
        <div
          className="bg-[#0A1628] border border-gray-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
            <div>
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <span className="text-[#C9A84C]">&#10022;</span>
                {documentTitle}
              </h2>
              <p className="text-gray-400 text-sm mt-0.5">
                AI-generated by Claude &middot; CapitalForge
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white text-xl leading-none p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close modal"
            >
              &times;
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Idle — ready to generate */}
            {phase === 'idle' && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-[#C9A84C]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#C9A84C] text-3xl">&#10022;</span>
                </div>
                <h3 className="text-white font-medium mb-2">Ready to generate</h3>
                <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                  Claude will draft a <strong className="text-gray-300">{documentTitle}</strong> using
                  the application data on file. You can review and edit before saving.
                </p>
                <button
                  onClick={handleGenerate}
                  className="bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628] font-semibold px-8 py-3 rounded-lg transition-colors"
                >
                  Generate with Claude
                </button>
              </div>
            )}

            {/* Generating — spinner */}
            {phase === 'generating' && (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white font-medium">Claude is preparing your document...</p>
                <p className="text-gray-400 text-sm mt-2">This usually takes a few seconds</p>
              </div>
            )}

            {/* Streaming — typing effect */}
            {phase === 'streaming' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[#C9A84C] text-sm font-medium flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#C9A84C] rounded-full animate-pulse" />
                    Generating...
                  </span>
                  <span className="text-gray-500 text-xs">{wordCount} words</span>
                </div>
                <textarea
                  ref={textareaRef}
                  readOnly
                  value={displayed}
                  className="w-full h-96 bg-[#0d1117] border border-gray-600 rounded-lg p-4 text-gray-200 text-sm font-mono leading-relaxed resize-none focus:outline-none cursor-default"
                />
              </div>
            )}

            {/* Review — editable */}
            {(phase === 'review' || phase === 'saving') && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-emerald-400 text-sm font-medium">
                    Draft ready -- review and edit below
                  </span>
                  <span className="text-gray-500 text-xs">{wordCount} words</span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  disabled={phase === 'saving'}
                  className="w-full h-96 bg-[#0d1117] border border-gray-600 rounded-lg p-4 text-gray-200 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:border-[#C9A84C] disabled:opacity-50"
                  spellCheck
                />
                <p className="text-gray-500 text-xs mt-2">
                  You can edit this draft freely. All edits are yours -- Claude provided the starting point.
                </p>
              </div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <div className="text-center py-12">
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-red-400 text-xl">!</span>
                </div>
                <p className="text-red-400 font-medium mb-2">Generation failed</p>
                <p className="text-gray-400 text-sm mb-4">{errorMessage}</p>
                <button
                  onClick={handleGenerate}
                  className="text-[#C9A84C] hover:underline text-sm"
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          {/* Footer — visible in review/saving */}
          {(phase === 'review' || phase === 'saving') && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={phase === 'saving'}
                  className="text-gray-400 hover:text-white text-sm border border-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Regenerate
                </button>
                <button
                  onClick={handleCopy}
                  disabled={phase === 'saving'}
                  className="text-gray-400 hover:text-white text-sm border border-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Copy
                </button>
                <button
                  onClick={handleDownload}
                  disabled={phase === 'saving'}
                  className="text-gray-400 hover:text-white text-sm border border-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Download .txt
                </button>
              </div>
              <button
                onClick={handleSaveToVault}
                disabled={phase === 'saving'}
                className="bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628] font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {phase === 'saving' && (
                  <span className="w-4 h-4 border-2 border-[#0A1628] border-t-transparent rounded-full animate-spin" />
                )}
                Save to Vault
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
