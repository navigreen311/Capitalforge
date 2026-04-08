'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ── Suggested starter chips ────────────────────────────────────

const STARTER_QUESTIONS = [
  'Which clients need attention this week?',
  'Who is ready for a restack?',
  'What APR expirations are coming up?',
  'Summarize my portfolio health',
] as const;

// ── Main Component ─────────────────────────────────────────────

export function AskCapitalForge() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Keyboard shortcuts ─────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+J / Ctrl+J to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // ── Auto-scroll to bottom on new messages ──────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // ── Focus input when panel opens ───────────────────────────

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // ── Get auth token ─────────────────────────────────────────

  function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('cf_access_token') || sessionStorage.getItem('cf_access_token');
  }

  // ── Send message ───────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsStreaming(true);
      setStreamingContent('');

      // Build conversation history from existing messages
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const token = getAuthToken();

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: text.trim(),
            conversationHistory,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          let errorMsg = 'Failed to get AI response. Please try again.';
          try {
            const errorJson = JSON.parse(errorText);
            errorMsg = errorJson.error?.message || errorMsg;
          } catch {
            // use default error message
          }
          throw new Error(errorMsg);
        }

        // Parse SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let data: { done?: boolean; error?: string; text?: string };
            try {
              data = JSON.parse(jsonStr);
            } catch {
              continue; // Skip malformed SSE lines
            }

            if (data.done) break;
            if (data.error) throw new Error(data.error);
            if (data.text) {
              accumulated += data.text;
              setStreamingContent(accumulated);
            }
          }
        }

        // Finalize: add assistant message
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: accumulated || 'No response received.',
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: (err as Error).message || 'An unexpected error occurred.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
      }
    },
    [isStreaming, messages],
  );

  // ── Listen for external "open with message" events ────────

  useEffect(() => {
    function handleAskAI(e: Event) {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setIsOpen(true);
      if (detail?.message) {
        // Small delay so panel is visible before sending
        setTimeout(() => sendMessage(detail.message!), 200);
      }
    }

    document.addEventListener('capitalforge:ask-ai', handleAskAI);
    return () => document.removeEventListener('capitalforge:ask-ai', handleAskAI);
  }, [sendMessage]);

  // ── Handle form submit ─────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  // ── Handle Enter key (Shift+Enter for newline) ─────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // ── Clear conversation ─────────────────────────────────────

  function clearConversation() {
    setMessages([]);
    setStreamingContent('');
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full
                   bg-[var(--cf-gold)] text-[var(--cf-navy)] px-4 py-3
                   shadow-lg hover:bg-[var(--cf-gold-400)] transition-all
                   hover:scale-105 active:scale-95 font-semibold text-sm"
        aria-label="Ask CapitalForge AI (Ctrl+J)"
        title="Ask CapitalForge AI (Ctrl+J)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="hidden sm:inline">Ask AI</span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 z-[70] h-full w-full max-w-md
                    bg-[var(--cf-navy)] text-white shadow-2xl
                    transform transition-transform duration-300 ease-in-out
                    flex flex-col
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="CapitalForge AI Assistant"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--cf-gold)] flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--cf-navy)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Ask CapitalForge</h2>
              <p className="text-xs text-[var(--cf-muted)]">AI-powered portfolio assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                className="text-xs text-[var(--cf-muted)] hover:text-white transition-colors
                           px-2 py-1 rounded hover:bg-white/10"
                title="Clear conversation"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded hover:bg-white/10 transition-colors text-[var(--cf-muted)] hover:text-white"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-5 h-5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Empty state with starter chips */}
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--cf-gold)]/20 flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--cf-gold)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-8 h-8"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">How can I help?</h3>
              <p className="text-sm text-[var(--cf-muted)] mb-6 max-w-xs">
                Ask me about your portfolio, clients, applications, or funding strategies.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-2 rounded-full border border-[var(--cf-gold)]/30
                               text-[var(--cf-gold)] hover:bg-[var(--cf-gold)]/10
                               transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[var(--cf-gold)] text-[var(--cf-navy)] rounded-br-sm'
                    : 'bg-white/10 text-white rounded-bl-sm'
                }`}
              >
                <MessageContent content={msg.content} />
              </div>
            </div>
          ))}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-white/10 text-white px-3.5 py-2.5 text-sm leading-relaxed">
                {streamingContent ? (
                  <MessageContent content={streamingContent} />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--cf-gold)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--cf-gold)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--cf-gold)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form onSubmit={handleSubmit} className="border-t border-white/10 px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your portfolio..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-lg bg-white/10 border border-white/10
                         px-3 py-2.5 text-sm text-white placeholder-white/40
                         focus:outline-none focus:ring-1 focus:ring-[var(--cf-gold)]/50
                         focus:border-[var(--cf-gold)]/50 disabled:opacity-50
                         max-h-32 overflow-y-auto"
              style={{ minHeight: '2.5rem' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-2.5 rounded-lg bg-[var(--cf-gold)] text-[var(--cf-navy)]
                         hover:bg-[var(--cf-gold-400)] transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed
                         flex-shrink-0"
              aria-label="Send message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-white/30 mt-1.5 text-center">
            Press Enter to send, Shift+Enter for new line. Esc to close.
          </p>
        </form>
      </div>
    </>
  );
}

// ── Simple markdown-like message renderer ──────────────────────

function MessageContent({ content }: { content: string }) {
  // Split by double newlines for paragraphs, preserve single newlines
  const paragraphs = content.split(/\n\n+/);

  return (
    <div className="space-y-2">
      {paragraphs.map((para, i) => {
        // Handle bullet points
        const lines = para.split('\n');
        const isList = lines.every((l) => l.startsWith('- ') || l.startsWith('* ') || l.trim() === '');

        if (isList && lines.some((l) => l.startsWith('- ') || l.startsWith('* '))) {
          return (
            <ul key={i} className="list-disc pl-4 space-y-0.5">
              {lines
                .filter((l) => l.startsWith('- ') || l.startsWith('* '))
                .map((l, j) => (
                  <li key={j}>{renderInlineFormatting(l.slice(2))}</li>
                ))}
            </ul>
          );
        }

        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInlineFormatting(para)}
          </p>
        );
      })}
    </div>
  );
}

// ── Inline formatting (bold) ───────────────────────────────────

function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
