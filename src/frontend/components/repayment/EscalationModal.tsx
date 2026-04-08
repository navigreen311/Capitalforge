'use client';

// ============================================================
// EscalationModal — Shown when user clicks "Escalate" on a
// "behind" status card. Provides 3 action options:
//   1. Contact Client (mock action)
//   2. Set Up Hardship Plan (navigates to /financial-control/hardship)
//   3. Generate Workout Proposal (mock AI generation)
// ============================================================

import { useState } from 'react';

interface EscalationModalProps {
  isOpen: boolean;
  cardName: string;
  issuer: string;
  balance: number;
  onClose: () => void;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function EscalationModal({ isOpen, cardName, issuer, balance, onClose }: EscalationModalProps) {
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<string | null>(null);
  const [contactSent, setContactSent] = useState(false);

  if (!isOpen) return null;

  function handleContact() {
    setContactSent(true);
    setTimeout(() => setContactSent(false), 3000);
  }

  function handleHardship() {
    window.location.href = '/financial-control/hardship';
  }

  function handleWorkout() {
    setGenerating(true);
    setTimeout(() => {
      setProposal(
        `Workout Proposal for ${cardName} (${issuer})\n\n` +
        `Current Balance: ${formatCurrency(balance)}\n\n` +
        `Recommended Actions:\n` +
        `1. Negotiate APR reduction to 15.99% (est. savings: ${formatCurrency(Math.round(balance * 0.04))})\n` +
        `2. Extend payoff timeline by 3 months with reduced payments\n` +
        `3. Waive late fees for the next 2 billing cycles\n` +
        `4. Set up bi-weekly auto-payments of ${formatCurrency(Math.round(balance / 24))}\n\n` +
        `Projected payoff: 12 months at reduced rate\n` +
        `Total interest saved vs current path: ${formatCurrency(Math.round(balance * 0.08))}`
      );
      setGenerating(false);
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-gray-700 bg-[#0A1628] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-white">Escalation Options</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {cardName} &middot; {issuer} &middot; {formatCurrency(balance)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Options */}
        <div className="p-5 space-y-3">
          {/* Option 1: Contact Client */}
          <button
            onClick={handleContact}
            className="w-full flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-900/50 p-4 hover:bg-gray-800/60 transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-900/50 border border-blue-700 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-900/70 transition-colors">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-100">Contact Client</p>
              <p className="text-xs text-gray-400 mt-0.5">Send a payment reminder and schedule a follow-up call</p>
              {contactSent && (
                <p className="text-xs text-green-400 font-semibold mt-1">Contact request sent!</p>
              )}
            </div>
          </button>

          {/* Option 2: Set Up Hardship Plan */}
          <button
            onClick={handleHardship}
            className="w-full flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-900/50 p-4 hover:bg-gray-800/60 transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-yellow-900/50 border border-yellow-700 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-900/70 transition-colors">
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-100">Set Up Hardship Plan</p>
              <p className="text-xs text-gray-400 mt-0.5">Navigate to hardship enrollment with reduced payment terms</p>
            </div>
            <span className="text-xs text-gray-500 self-center">&rarr;</span>
          </button>

          {/* Option 3: Generate Workout Proposal */}
          <button
            onClick={handleWorkout}
            disabled={generating}
            className="w-full flex items-start gap-3 rounded-lg border border-[#C9A84C]/30 bg-[#C9A84C]/5 p-4 hover:bg-[#C9A84C]/10 transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-[#C9A84C]/20 border border-[#C9A84C]/40 flex items-center justify-center flex-shrink-0 group-hover:bg-[#C9A84C]/30 transition-colors">
              <span className="text-[#C9A84C] text-lg">&#10022;</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-100">
                Generate Workout Proposal <span className="text-[#C9A84C]">&#10022;</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">AI-generated restructuring proposal with rate and term recommendations</p>
              {generating && (
                <p className="text-xs text-[#C9A84C] font-semibold mt-1 animate-pulse">Generating proposal...</p>
              )}
            </div>
          </button>
        </div>

        {/* AI-Generated Proposal (if generated) */}
        {proposal && (
          <div className="mx-5 mb-5 p-4 rounded-lg border border-[#C9A84C]/30 bg-[#C9A84C]/5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#C9A84C]">&#10022;</span>
              <p className="text-xs font-semibold text-[#C9A84C] uppercase tracking-wide">AI-Generated Proposal</p>
            </div>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{proposal}</pre>
            <div className="flex gap-2 mt-3">
              <button className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#C9A84C] text-[#0A1628] hover:bg-[#b8993f] transition-colors">
                Apply Proposal
              </button>
              <button
                onClick={() => setProposal(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
