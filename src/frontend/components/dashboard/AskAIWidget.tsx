'use client';

import React, { useState } from 'react';

// ── Suggested prompt chips ────────────────────────────────────

const SUGGESTED_PROMPTS = [
  'Which clients need attention this week?',
  'Which clients are ready for a re-stack?',
  "Summarize today's compliance risks",
  "What's my approval rate trend?",
] as const;

// ── Helper: dispatch the custom event to open AskCapitalForge ─

function openAskAI(message: string) {
  document.dispatchEvent(
    new CustomEvent('capitalforge:ask-ai', { detail: { message } }),
  );
}

// ── Component ─────────────────────────────────────────────────

export function AskAIWidget() {
  const [input, setInput] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    openAskAI(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="rounded-xl bg-[#0A1628] p-5 shadow-lg border border-white/5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full
                     bg-[#C9A84C]/20 text-[#C9A84C] text-sm font-bold select-none"
          aria-hidden="true"
        >
          &#10022;
        </span>
        <div>
          <h3 className="text-sm font-semibold text-white leading-tight">
            Ask CapitalForge AI
          </h3>
          <p className="text-[11px] text-white/40">
            Portfolio insights at your fingertips
          </p>
        </div>
      </div>

      {/* Suggested prompt chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => openAskAI(prompt)}
            className="text-xs px-3 py-1.5 rounded-full border border-[#C9A84C]/25
                       text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors
                       text-left leading-snug"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Custom input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          className="flex-1 rounded-lg bg-white/5 border border-white/10
                     px-3 py-2 text-sm text-white placeholder-white/30
                     focus:outline-none focus:ring-1 focus:ring-[#C9A84C]/50
                     focus:border-[#C9A84C]/50"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-3 py-2 rounded-lg bg-[#C9A84C] text-[#0A1628] text-sm
                     font-semibold hover:bg-[#C9A84C]/80 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          aria-label="Send question"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
