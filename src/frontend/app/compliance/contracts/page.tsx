'use client';

// ============================================================
// /compliance/contracts — Contracts Management
// Contract list with expiry tracking, upload button,
// key clause summary, expiry countdown, renewal workflow.
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContractStatus = 'Active' | 'Expiring Soon' | 'Expired' | 'Under Review' | 'Draft';
type RiskSeverity = 'high' | 'medium' | 'low';

interface KeyClause {
  label: string;
  summary: string;
}

interface RiskFlag {
  label: string;
  description: string;
  severity: RiskSeverity;
}

interface Contract {
  id: string;
  businessName: string;
  contractType: string;
  fileName: string;
  startDate: string;
  expiryDate: string;
  status: ContractStatus;
  keyClauses: KeyClause[];
  riskScore: number;
  governingLaw: string;
  autoRenewal: boolean;
  noticePeriod: string;
  riskFlags: RiskFlag[];
  amount: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_CONTRACTS: Contract[] = [
  {
    id: 'ctr_001', businessName: 'Apex Ventures LLC', contractType: 'MCA Agreement',
    fileName: 'apex_mca_agreement_2026.pdf', startDate: '2025-06-01', expiryDate: '2026-06-01',
    status: 'Active', riskScore: 72, governingLaw: 'New York', autoRenewal: false,
    noticePeriod: '30 days', amount: '$150,000',
    keyClauses: [
      { label: 'Factor Rate', summary: '1.35 factor rate on $150K advance' },
      { label: 'Daily Remittance', summary: '15% of daily credit card receipts' },
      { label: 'Confession of Judgment', summary: 'COJ clause present — review required' },
    ],
    riskFlags: [
      { label: 'Confession of Judgment', description: 'COJ clause exposes lender to regulatory risk in certain states', severity: 'high' },
      { label: 'High Factor Rate', description: 'Factor rate of 1.35 exceeds internal threshold of 1.30', severity: 'medium' },
    ],
  },
  {
    id: 'ctr_002', businessName: 'NovaTech Solutions Inc.', contractType: 'Line of Credit',
    fileName: 'novatech_loc_2025.pdf', startDate: '2025-01-15', expiryDate: '2026-04-15',
    status: 'Expiring Soon', riskScore: 45, governingLaw: 'Delaware', autoRenewal: true,
    noticePeriod: '60 days', amount: '$250,000',
    keyClauses: [
      { label: 'Credit Limit', summary: '$250K revolving line at Prime + 4.5%' },
      { label: 'Draw Period', summary: '12-month draw period, 24-month repayment' },
    ],
    riskFlags: [
      { label: 'Approaching Expiry', description: 'Contract expires in less than 30 days — renewal action needed', severity: 'medium' },
    ],
  },
  {
    id: 'ctr_003', businessName: 'Horizon Retail Partners', contractType: 'Term Loan',
    fileName: 'horizon_term_loan.pdf', startDate: '2025-09-01', expiryDate: '2026-03-01',
    status: 'Expired', riskScore: 88, governingLaw: 'California', autoRenewal: false,
    noticePeriod: '90 days', amount: '$500,000',
    keyClauses: [
      { label: 'Principal', summary: '$500K term loan, 18-month maturity' },
      { label: 'Prepayment Penalty', summary: '3% prepayment penalty in first 12 months' },
      { label: 'Personal Guarantee', summary: 'Full personal guarantee from all owners >20%' },
    ],
    riskFlags: [
      { label: 'Expired — No Renewal', description: 'Contract has expired without auto-renewal; terms no longer enforceable', severity: 'high' },
      { label: 'Personal Guarantee', description: 'Full personal guarantee creates significant exposure for borrower', severity: 'high' },
      { label: 'Prepayment Penalty', description: 'Early repayment penalty may conflict with state usury regulations', severity: 'medium' },
    ],
  },
  {
    id: 'ctr_004', businessName: 'Summit Capital Group', contractType: 'Revenue Share',
    fileName: 'summit_rev_share_2026.pdf', startDate: '2026-01-01', expiryDate: '2027-01-01',
    status: 'Active', riskScore: 32, governingLaw: 'New York', autoRenewal: true,
    noticePeriod: '30 days', amount: '$128,571',
    keyClauses: [
      { label: 'Revenue Share', summary: '8% of monthly gross revenue until $180K repaid' },
      { label: 'Cap', summary: 'Total repayment capped at 1.4x funded amount' },
    ],
    riskFlags: [
      { label: 'Low Risk', description: 'No significant risk flags identified', severity: 'low' },
    ],
  },
  {
    id: 'ctr_005', businessName: 'Blue Ridge Consulting', contractType: 'Advisor Agreement',
    fileName: 'blueridge_advisor_agmt.pdf', startDate: '2025-11-01', expiryDate: '2026-04-30',
    status: 'Expiring Soon', riskScore: 55, governingLaw: 'Virginia', autoRenewal: false,
    noticePeriod: '45 days', amount: '$75,000',
    keyClauses: [
      { label: 'Compensation', summary: 'Fixed retainer + 2% of funded volume' },
      { label: 'Non-Compete', summary: '12-month non-compete within 50-mile radius' },
    ],
    riskFlags: [
      { label: 'Non-Compete Enforceability', description: 'Non-compete clause may be unenforceable under Virginia 2024 amendments', severity: 'medium' },
      { label: 'Expiring Soon', description: 'Contract expires within 30 days — review renewal terms', severity: 'medium' },
    ],
  },
  {
    id: 'ctr_006', businessName: 'Crestline Medical LLC', contractType: 'MCA Agreement',
    fileName: 'crestline_mca_2026.pdf', startDate: '2026-02-01', expiryDate: '2026-08-01',
    status: 'Under Review', riskScore: 65, governingLaw: 'Texas', autoRenewal: false,
    noticePeriod: '30 days', amount: '$200,000',
    keyClauses: [
      { label: 'Factor Rate', summary: '1.28 factor rate on $200K advance' },
      { label: 'UCC Filing', summary: 'UCC-1 filing on all business assets' },
    ],
    riskFlags: [
      { label: 'Blanket UCC Lien', description: 'UCC-1 filing covers all assets — may conflict with senior lenders', severity: 'high' },
      { label: 'Under Review', description: 'Contract is pending legal review — terms not yet finalized', severity: 'low' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = new Date();

function daysUntilExpiry(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function statusBadge(s: ContractStatus): string {
  switch (s) {
    case 'Active':        return 'bg-green-900/50 text-green-300 border border-green-700';
    case 'Expiring Soon': return 'bg-amber-900/50 text-amber-300 border border-amber-700';
    case 'Expired':       return 'bg-red-900/50 text-red-300 border border-red-700';
    case 'Under Review':  return 'bg-blue-900/50 text-blue-300 border border-blue-700';
    case 'Draft':         return 'bg-gray-800 text-gray-400 border border-gray-700';
  }
}

function riskColor(score: number): string {
  if (score >= 75) return 'text-red-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-green-400';
}

function expiryCountdownColor(days: number): string {
  if (days < 0) return 'text-red-400';
  if (days <= 30) return 'text-amber-400';
  return 'text-green-400';
}

function severityColor(s: RiskSeverity): { bg: string; text: string; border: string; dot: string } {
  switch (s) {
    case 'high':   return { bg: 'bg-red-900/30', text: 'text-red-300', border: 'border-red-800', dot: 'bg-red-400' };
    case 'medium': return { bg: 'bg-amber-900/30', text: 'text-amber-300', border: 'border-amber-800', dot: 'bg-amber-400' };
    case 'low':    return { bg: 'bg-green-900/30', text: 'text-green-300', border: 'border-green-800', dot: 'bg-green-400' };
  }
}

function severityLabel(s: RiskSeverity): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Renewal Modal Component
// ---------------------------------------------------------------------------

const RENEWAL_STEPS = ['Review Terms', 'Update Terms', 'Generate Agreement', 'Edit Agreement', 'Send for Signature'] as const;

function RenewalModal({
  contract,
  onClose,
  onComplete,
  showToast,
}: {
  contract: Contract;
  onClose: () => void;
  onComplete: (updatedContract: Contract) => void;
  showToast: (msg: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [newExpiry, setNewExpiry] = useState('');
  const [newAmount, setNewAmount] = useState(contract.amount);
  const [newNoticePeriod, setNewNoticePeriod] = useState(contract.noticePeriod);
  const [generatedText, setGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const generationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set default new expiry to 1 year from today
  useEffect(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    setNewExpiry(d.toISOString().split('T')[0]);
  }, []);

  // Cleanup generation timeout on unmount
  useEffect(() => {
    return () => { if (generationRef.current) clearTimeout(generationRef.current); };
  }, []);

  const mockAgreementText = `RENEWAL AGREEMENT

This Renewal Agreement ("Agreement") is entered into as of ${formatDate(new Date().toISOString().split('T')[0])}, by and between CapitalForge Inc. ("Lender") and ${contract.businessName} ("Borrower").

WHEREAS, the parties entered into a ${contract.contractType} agreement dated ${formatDate(contract.startDate)} (the "Original Agreement"); and

WHEREAS, the Original Agreement expired or is set to expire on ${formatDate(contract.expiryDate)}; and

WHEREAS, the parties desire to renew and extend the terms of the Original Agreement;

NOW, THEREFORE, in consideration of the mutual promises and covenants herein, the parties agree as follows:

1. RENEWAL TERMS
   a. The term of the Agreement is hereby renewed and extended through ${newExpiry ? formatDate(newExpiry) : '[NEW EXPIRY DATE]'}.
   b. The principal/facility amount shall be ${newAmount}.
   c. Notice period for termination: ${newNoticePeriod}.

2. GOVERNING LAW
   This Agreement shall be governed by and construed in accordance with the laws of the State of ${contract.governingLaw}.

3. ALL OTHER TERMS
   All other terms and conditions of the Original Agreement shall remain in full force and effect, except as expressly modified herein.

4. SIGNATURES
   IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

   CapitalForge Inc.                    ${contract.businessName}
   _________________________            _________________________
   Authorized Signatory                 Authorized Signatory`;

  const handleGenerate = () => {
    setIsGenerating(true);
    setGeneratedText('');
    let idx = 0;
    const chars = mockAgreementText;

    const typeChar = () => {
      if (idx < chars.length) {
        const chunk = chars.slice(idx, idx + 3);
        setGeneratedText((prev) => prev + chunk);
        idx += 3;
        generationRef.current = setTimeout(typeChar, 8);
      } else {
        setIsGenerating(false);
      }
    };
    typeChar();
  };

  const handleSend = () => {
    const updated: Contract = {
      ...contract,
      status: 'Active',
      expiryDate: newExpiry,
      amount: newAmount,
      noticePeriod: newNoticePeriod,
    };
    onComplete(updated);
    showToast(`Renewal agreement sent for signature to ${contract.businessName}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-white">Renew Contract</h3>
            <p className="text-sm text-gray-400 mt-0.5">{contract.businessName} &mdash; {contract.contractType}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-1">
            {RENEWAL_STEPS.map((label, i) => (
              <div key={label} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                  i < step ? 'bg-[#C9A84C] text-[#0A1628]'
                    : i === step ? 'bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]'
                    : 'bg-gray-800 text-gray-500 border border-gray-700'
                }`}>
                  {i < step ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  ) : i + 1}
                </div>
                {i < RENEWAL_STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${i < step ? 'bg-[#C9A84C]' : 'bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-[#C9A84C] font-semibold mt-2">Step {step + 1}: {RENEWAL_STEPS[step]}</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 0: Review current terms */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300 mb-3">Review the current contract terms before proceeding with renewal.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Effective Date', value: formatDate(contract.startDate) },
                  { label: 'Expiry Date', value: formatDate(contract.expiryDate) },
                  { label: 'Amount', value: contract.amount },
                  { label: 'Governing Law', value: contract.governingLaw },
                  { label: 'Auto-Renewal', value: contract.autoRenewal ? 'Yes' : 'No' },
                  { label: 'Notice Period', value: contract.noticePeriod },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 rounded-lg bg-[#0A1628] border border-gray-800">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-semibold text-gray-200 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {contract.keyClauses.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Key Clauses</p>
                  <div className="space-y-1.5">
                    {contract.keyClauses.map((cl, i) => (
                      <div key={i} className="text-xs text-gray-300 p-2 rounded bg-[#0A1628] border border-gray-800">
                        <span className="font-semibold text-gray-200">{cl.label}:</span> {cl.summary}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Update terms */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 mb-3">Update the terms for the renewed contract.</p>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">New Expiry Date</label>
                <input
                  type="date"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Amount</label>
                <input
                  type="text"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Notice Period</label>
                <select
                  value={newNoticePeriod}
                  onChange={(e) => setNewNoticePeriod(e.target.value)}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                >
                  {['15 days', '30 days', '45 days', '60 days', '90 days'].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Generate Agreement */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 mb-1">Generate a renewal agreement using AI-assisted drafting.</p>
              {!isGenerating && !generatedText && (
                <button
                  onClick={handleGenerate}
                  className="w-full py-3 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30 hover:bg-[#C9A84C]/20 text-[#C9A84C] font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <span className="text-base">&#10022;</span> Generate Renewal Agreement
                </button>
              )}
              {(isGenerating || generatedText) && (
                <div className="relative">
                  <pre className="whitespace-pre-wrap text-xs text-gray-300 font-mono p-4 rounded-lg bg-[#0A1628] border border-gray-800 max-h-[45vh] overflow-y-auto leading-relaxed">
                    {generatedText}
                    {isGenerating && <span className="inline-block w-1.5 h-3.5 bg-[#C9A84C] animate-pulse ml-0.5 align-middle" />}
                  </pre>
                  {isGenerating && (
                    <p className="text-xs text-[#C9A84C] mt-2 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
                      AI is drafting your renewal agreement...
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Edit Agreement */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300 mb-1">Review and edit the generated renewal agreement.</p>
              <textarea
                value={generatedText}
                onChange={(e) => setGeneratedText(e.target.value)}
                rows={18}
                className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-xs font-mono p-4 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 resize-y leading-relaxed"
              />
            </div>
          )}

          {/* Step 4: Send for Signature */}
          {step === 4 && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-[#C9A84C]/10 border border-[#C9A84C]/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-white mb-1">Ready to Send</h4>
              <p className="text-sm text-gray-400 mb-4">
                The renewal agreement for <span className="text-gray-200 font-semibold">{contract.businessName}</span> will be sent for electronic signature.
              </p>
              <div className="grid grid-cols-3 gap-3 text-left max-w-sm mx-auto mb-4">
                <div className="p-2 rounded bg-[#0A1628] border border-gray-800">
                  <p className="text-xs text-gray-500">New Expiry</p>
                  <p className="text-xs font-semibold text-gray-200">{newExpiry ? formatDate(newExpiry) : '—'}</p>
                </div>
                <div className="p-2 rounded bg-[#0A1628] border border-gray-800">
                  <p className="text-xs text-gray-500">Amount</p>
                  <p className="text-xs font-semibold text-gray-200">{newAmount}</p>
                </div>
                <div className="p-2 rounded bg-[#0A1628] border border-gray-800">
                  <p className="text-xs text-gray-500">Notice</p>
                  <p className="text-xs font-semibold text-gray-200">{newNoticePeriod}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-800">
          <button
            onClick={() => step === 0 ? onClose() : setStep(step - 1)}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < 4 ? (
            <button
              onClick={() => {
                if (step === 2 && !generatedText) return; // Must generate first
                setStep(step + 1);
              }}
              disabled={step === 2 && (!generatedText || isGenerating)}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSend}
              className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              Send for Signature
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>(PLACEHOLDER_CONTRACTS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [renewContractId, setRenewContractId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState({ businessName: '', contractType: '', fileName: '' });

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleUpload = useCallback(() => {
    if (!uploadForm.fileName.trim()) return;
    const newContract: Contract = {
      id: `ctr_${Date.now()}`,
      businessName: uploadForm.businessName || 'Unknown Business',
      contractType: uploadForm.contractType || 'Other',
      fileName: uploadForm.fileName,
      startDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      status: 'Draft',
      keyClauses: [],
      riskScore: 0,
      governingLaw: 'New York',
      autoRenewal: false,
      noticePeriod: '30 days',
      riskFlags: [],
      amount: '$0',
    };
    setContracts((prev) => [newContract, ...prev]);
    setShowUploadModal(false);
    setUploadForm({ businessName: '', contractType: '', fileName: '' });
    setToast('Contract uploaded for analysis');
  }, [uploadForm]);

  const handleRenewalComplete = useCallback((updated: Contract) => {
    setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setRenewContractId(null);
  }, []);

  const renewContract = contracts.find((c) => c.id === renewContractId) ?? null;

  // Summary
  const expiring = contracts.filter((c) => c.status === 'Expiring Soon').length;
  const expired = contracts.filter((c) => c.status === 'Expired').length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contracts</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {contracts.length} contracts &middot;{' '}
            {expiring > 0 && <span className="text-amber-400">{expiring} expiring soon</span>}
            {expiring > 0 && expired > 0 && ' · '}
            {expired > 0 && <span className="text-red-400">{expired} expired</span>}
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628] text-sm font-semibold transition-colors"
        >
          Upload Contract
        </button>
      </div>

      {/* Contract Cards */}
      <div className="space-y-3">
        {contracts.map((c) => {
          const days = daysUntilExpiry(c.expiryDate);
          const isExpanded = expandedId === c.id;

          return (
            <div key={c.id} className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
              {/* Row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#0A1628]/30 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>
                        {c.status}
                      </span>
                      <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                        {c.contractType}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-100 truncate">{c.businessName}</p>
                    <p className="text-xs text-gray-500 truncate">{c.fileName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 flex-shrink-0">
                  {/* Risk Score */}
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Risk</p>
                    <p className={`text-lg font-black ${riskColor(c.riskScore)}`}>{c.riskScore}</p>
                  </div>

                  {/* Expiry Countdown */}
                  <div className="text-center min-w-[90px]">
                    <p className="text-xs text-gray-500 mb-0.5">Expiry</p>
                    <p className={`text-sm font-bold ${expiryCountdownColor(days)}`}>
                      {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'Today' : `${days}d`}
                    </p>
                    <p className="text-xs text-gray-600">{formatDate(c.expiryDate)}</p>
                  </div>

                  {/* Expand icon */}
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded — Full Details */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-gray-800">
                  {/* Key Terms Grid */}
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mt-4 mb-2">Key Terms</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {[
                      { label: 'Effective Date', value: formatDate(c.startDate) },
                      { label: 'Expiry Date', value: formatDate(c.expiryDate) },
                      { label: 'Governing Law', value: c.governingLaw },
                      { label: 'Auto-Renewal', value: c.autoRenewal ? 'Yes' : 'No' },
                      { label: 'Notice Period', value: c.noticePeriod },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-2.5 rounded-lg bg-[#0A1628] border border-gray-800">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-semibold text-gray-200 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Key Clauses */}
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mt-4 mb-2">Key Clauses</p>
                  {c.keyClauses.length === 0 ? (
                    <p className="text-xs text-gray-600">No clauses extracted yet. Upload for AI analysis.</p>
                  ) : (
                    <div className="space-y-2">
                      {c.keyClauses.map((clause, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-2.5 rounded-lg bg-[#0A1628] border border-gray-800">
                          <span className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded-full bg-[#C9A84C]/20 text-[#C9A84C] text-xs font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-gray-200">{clause.label}</p>
                            <p className="text-xs text-gray-400">{clause.summary}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Risk Flags */}
                  {c.riskFlags.length > 0 && (
                    <>
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mt-4 mb-2">Risk Flags</p>
                      <div className="space-y-1.5">
                        {c.riskFlags.map((flag, idx) => {
                          const sc = severityColor(flag.severity);
                          return (
                            <div key={idx} className={`flex items-start gap-3 p-2.5 rounded-lg ${sc.bg} border ${sc.border}`}>
                              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                                <span className={`text-xs font-bold uppercase ${sc.text}`}>{severityLabel(flag.severity)}</span>
                              </div>
                              <div className="min-w-0">
                                <p className={`text-xs font-semibold ${sc.text}`}>{flag.label}</p>
                                <p className="text-xs text-gray-400">{flag.description}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-800">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setToast(`Downloading ${c.fileName}...`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download PDF
                    </button>

                    {(c.status === 'Expiring Soon' || c.status === 'Expired') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenewContractId(c.id);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30 hover:bg-[#C9A84C]/20 text-xs font-semibold text-[#C9A84C] transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Renew Contract
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setToast(`Termination request initiated for ${c.businessName}`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-900/30 hover:bg-red-900/30 text-xs font-semibold text-red-400 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Terminate
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Upload Contract</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Business Name</label>
                <input
                  type="text"
                  value={uploadForm.businessName}
                  onChange={(e) => setUploadForm((f) => ({ ...f, businessName: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  placeholder="Enter business name"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Contract Type</label>
                <select
                  value={uploadForm.contractType}
                  onChange={(e) => setUploadForm((f) => ({ ...f, contractType: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                >
                  <option value="">Select type...</option>
                  {['MCA Agreement', 'Revenue Share', 'Line of Credit', 'Term Loan', 'Advisor Agreement', 'Other'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">File Name</label>
                <input
                  type="text"
                  value={uploadForm.fileName}
                  onChange={(e) => setUploadForm((f) => ({ ...f, fileName: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  placeholder="contract.pdf"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-5">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors">
                Cancel
              </button>
              <button onClick={handleUpload} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors">
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Modal */}
      {renewContract && (
        <RenewalModal
          contract={renewContract}
          onClose={() => setRenewContractId(null)}
          onComplete={handleRenewalComplete}
          showToast={setToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0A1628] border border-[#C9A84C]/30 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-2">
          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[#C9A84C]/20">
            <svg className="w-3 h-3 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          </span>
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}
