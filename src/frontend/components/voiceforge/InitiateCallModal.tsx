'use client';

// ============================================================
// InitiateCallModal — 3-step wizard modal for initiating
// outbound VoiceForge calls to clients.
//
// Steps:
//   1. Select Client & Purpose
//   2. Script & Compliance
//   3. Review & Launch
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FocusTrap } from '@/components/ui/focus-trap';

// ── Types ───────────────────────────────────────────────────────────────────

export interface InitiateCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledClientId?: string;
  prefilledClientName?: string;
  prefilledPurpose?: string;
  lockClient?: boolean;
  lockPurpose?: boolean;
  onCallInitiated?: (callId: string, clientName: string, purpose: string) => void;
}

// ── Mock Data ───────────────────────────────────────────────────────────────

interface MockClient {
  id: string;
  name: string;
  tcpaConsent: boolean;
}

const MOCK_CLIENTS: MockClient[] = [
  { id: 'cli_001', name: 'Apex Ventures',     tcpaConsent: true },
  { id: 'cli_002', name: 'Meridian Holdings',  tcpaConsent: true },
  { id: 'cli_003', name: 'Brightline Corp',    tcpaConsent: false },
  { id: 'cli_004', name: 'Thornwood Capital',  tcpaConsent: true },
  { id: 'cli_005', name: 'Norcal Transport',   tcpaConsent: true },
];

const PURPOSE_OPTIONS = [
  'APR Expiry Warning',
  'Payment Reminder',
  'Re-Stack Consultation',
  'Annual Review',
  'Recon Follow-Up',
  'Compliance Call',
  'General Relationship Call',
  'Custom',
] as const;

type PurposeOption = (typeof PURPOSE_OPTIONS)[number];

const SCRIPT_OPTIONS = [
  {
    id: 'script_apr',
    name: 'APR Expiry Warning',
    text: 'Hello {client_name}, this is {advisor_name} from CapitalForge. I\'m reaching out regarding your {card_name} account. We\'ve identified that your introductory APR period is approaching expiration. I\'d like to discuss your options for maintaining favorable terms and explore potential re-stack strategies to optimize your credit line.',
  },
  {
    id: 'script_restack',
    name: 'Re-Stack Consultation',
    text: 'Hi {client_name}, this is {advisor_name} calling from CapitalForge. Based on our analysis of your current portfolio, we\'ve identified an opportunity to restructure your {card_name} position. I\'d like to walk you through the re-stack options that could improve your overall terms and credit utilization.',
  },
  {
    id: 'script_payment',
    name: 'Payment Reminder 30-Day',
    text: 'Hello {client_name}, this is {advisor_name} with CapitalForge. I\'m calling to remind you that a payment on your {card_name} account is approaching its 30-day mark. We want to ensure your account stays in good standing. Can we discuss your payment schedule?',
  },
] as const;

type VoiceType = 'ai_elevenlabs' | 'advisor_live' | 'ai_live_handoff';

const VOICE_TYPE_LABELS: Record<VoiceType, string> = {
  ai_elevenlabs: 'AI Voice (ElevenLabs)',
  advisor_live: 'Advisor Live',
  ai_live_handoff: 'AI + Live Handoff',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function isWithinCallingHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 8 && hour < 21; // 8 AM - 9 PM
}

/** Highlight template variables in gold */
function highlightTemplateVars(text: string): React.ReactNode[] {
  const parts = text.split(/(\{[^}]+\})/g);
  return parts.map((part, i) =>
    part.startsWith('{') && part.endsWith('}') ? (
      <span key={i} className="text-brand-gold font-semibold">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// ── Step Indicator Dots ─────────────────────────────────────────────────────

const STEP_LABELS = ['Client & Purpose', 'Script & Compliance', 'Review & Launch'] as const;
const TOTAL_STEPS = STEP_LABELS.length;

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isCompleted = stepNum < current;
        return (
          <div key={label} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={`w-8 h-0.5 ${
                  isCompleted || isActive ? 'bg-brand-gold' : 'bg-gray-700'
                }`}
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full transition-colors ${
                  isActive
                    ? 'bg-brand-gold ring-2 ring-brand-gold/40'
                    : isCompleted
                      ? 'bg-brand-gold'
                      : 'bg-gray-600'
                }`}
              />
              <span
                className={`mt-1 text-2xs font-medium ${
                  isActive ? 'text-brand-gold' : isCompleted ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 right-6 z-[60] animate-fade-in rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
      {message}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function InitiateCallModal({
  isOpen,
  onClose,
  prefilledClientId,
  prefilledClientName,
  prefilledPurpose,
  lockClient = false,
  lockPurpose = false,
  onCallInitiated,
}: InitiateCallModalProps) {
  // ── State ───────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // Step 1
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [purpose, setPurpose] = useState<PurposeOption | ''>('');
  const [customPurpose, setCustomPurpose] = useState('');
  const [priority, setPriority] = useState<'standard' | 'immediate'>('standard');
  const [phone, setPhone] = useState('(555) 123-4567');
  const [logPhoneUpdate, setLogPhoneUpdate] = useState(false);

  // Step 2
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [scriptPreviewOpen, setScriptPreviewOpen] = useState(false);
  const [voiceType, setVoiceType] = useState<VoiceType>('ai_elevenlabs');
  const [complianceTcpa, setComplianceTcpa] = useState(false);
  const [compliancePurpose, setCompliancePurpose] = useState(false);
  const [complianceHours, setComplianceHours] = useState(false);
  const [complianceNoGuarantees, setComplianceNoGuarantees] = useState(false);

  // Step 3
  const [launching, setLaunching] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const overlayRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Derived ─────────────────────────────────────────────────────

  const selectedClient = useMemo(
    () => MOCK_CLIENTS.find((c) => c.id === clientId) ?? null,
    [clientId],
  );

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return MOCK_CLIENTS;
    const q = clientSearch.toLowerCase();
    return MOCK_CLIENTS.filter((c) => c.name.toLowerCase().includes(q));
  }, [clientSearch]);

  const selectedScript = useMemo(
    () => SCRIPT_OPTIONS.find((s) => s.id === selectedScriptId) ?? null,
    [selectedScriptId],
  );

  const effectivePurpose = purpose === 'Custom' ? customPurpose : (purpose as string);

  const clientDisplayName =
    selectedClient?.name ?? prefilledClientName ?? '';

  // ── Reset state when modal opens ────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setClientId(prefilledClientId ?? '');
    setClientSearch('');
    setClientDropdownOpen(false);
    setPurpose((prefilledPurpose as PurposeOption) ?? '');
    setCustomPurpose('');
    setPriority('standard');
    setPhone('(555) 123-4567');
    setLogPhoneUpdate(false);
    setSelectedScriptId('');
    setScriptPreviewOpen(false);
    setVoiceType('ai_elevenlabs');
    setComplianceTcpa(false);
    setCompliancePurpose(false);
    setComplianceHours(false);
    setComplianceNoGuarantees(false);
    setLaunching(false);
    setToastMsg('');
  }, [isOpen, prefilledClientId, prefilledPurpose]);

  // Auto-check compliance when moving to step 2
  useEffect(() => {
    if (step === 2) {
      if (selectedClient?.tcpaConsent) setComplianceTcpa(true);
      if (isWithinCallingHours()) setComplianceHours(true);
    }
  }, [step, selectedClient]);

  // Prevent body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  const selectClient = useCallback((c: MockClient) => {
    setClientId(c.id);
    setClientSearch('');
    setClientDropdownOpen(false);
  }, []);

  const canContinueStep1 =
    !!clientId &&
    (selectedClient?.tcpaConsent ?? false) &&
    !!effectivePurpose &&
    !!phone.trim();

  const allComplianceChecked =
    complianceTcpa && compliancePurpose && complianceHours && complianceNoGuarantees;

  const canContinueStep2 = allComplianceChecked;

  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    await new Promise((r) => setTimeout(r, 1000));
    const callId = `call_mock_${Date.now()}`;
    onCallInitiated?.(callId, clientDisplayName, effectivePurpose);
    setToastMsg(`Call queued: ${callId}`);
    setLaunching(false);
    onClose();
  }, [clientDisplayName, effectivePurpose, onCallInitiated, onClose]);

  // ── Early return ────────────────────────────────────────────────

  if (!isOpen) {
    return toastMsg ? <Toast message={toastMsg} onDone={() => setToastMsg('')} /> : null;
  }

  // ── Render helpers ──────────────────────────────────────────────

  const labelClass = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
  const inputClass =
    'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold outline-none transition-colors';
  const selectClass = inputClass;

  // ── Step 1 ──────────────────────────────────────────────────────

  function renderStep1() {
    const clientLocked = !!prefilledClientId && lockClient;
    const purposeLocked = !!prefilledPurpose && lockPurpose;

    return (
      <div className="space-y-5">
        {/* Client */}
        <div>
          <label className={labelClass}>Client</label>
          {clientLocked ? (
            <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-300">
              {clientDisplayName}
              <span className="ml-2 text-xs text-gray-500">(locked)</span>
            </div>
          ) : (
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                className={inputClass}
                placeholder="Search clients..."
                value={clientDropdownOpen ? clientSearch : (selectedClient?.name ?? clientSearch)}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  setClientDropdownOpen(true);
                  if (clientId) setClientId('');
                }}
                onFocus={() => setClientDropdownOpen(true)}
              />
              {clientDropdownOpen && (
                <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-lg">
                  {filteredClients.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-gray-500">No clients found</li>
                  ) : (
                    filteredClients.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            c.id === clientId ? 'bg-gray-700' : ''
                          }`}
                          onClick={() => selectClient(c)}
                        >
                          <span className="text-gray-100">{c.name}</span>
                          <span className={c.tcpaConsent ? 'text-green-400' : 'text-red-400'}>
                            {c.tcpaConsent ? '\u2713 TCPA' : '\u2717 TCPA'}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
          {/* TCPA warning for non-consenting client */}
          {selectedClient && !selectedClient.tcpaConsent && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                {selectedClient.name} has <strong>not provided TCPA consent</strong>. You cannot
                initiate a call to this client.
              </span>
            </div>
          )}
        </div>

        {/* Purpose */}
        <div>
          <label className={labelClass}>Purpose</label>
          {purposeLocked ? (
            <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-300">
              {prefilledPurpose}
              <span className="ml-2 text-xs text-gray-500">(locked)</span>
            </div>
          ) : (
            <>
              <select
                className={selectClass}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as PurposeOption)}
              >
                <option value="">Select purpose...</option>
                {PURPOSE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {purpose === 'Custom' && (
                <input
                  type="text"
                  className={`${inputClass} mt-2`}
                  placeholder="Enter custom purpose..."
                  value={customPurpose}
                  onChange={(e) => setCustomPurpose(e.target.value)}
                />
              )}
            </>
          )}
        </div>

        {/* Priority */}
        <div>
          <label className={labelClass}>Priority</label>
          <div className="flex items-center gap-4">
            {(['standard', 'immediate'] as const).map((p) => (
              <label
                key={p}
                className="flex items-center gap-2 cursor-pointer text-sm text-gray-300"
              >
                <input
                  type="radio"
                  name="priority"
                  value={p}
                  checked={priority === p}
                  onChange={() => setPriority(p)}
                  className="accent-brand-gold"
                />
                <span className="capitalize">{p}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className={labelClass}>Phone Number</label>
          <input
            type="tel"
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={logPhoneUpdate}
              onChange={(e) => setLogPhoneUpdate(e.target.checked)}
              className="accent-brand-gold"
            />
            Log this number update
          </label>
        </div>
      </div>
    );
  }

  // ── Step 2 ──────────────────────────────────────────────────────

  function renderStep2() {
    return (
      <div className="space-y-5">
        {/* Script Selection */}
        <div>
          <label className={labelClass}>Call Script</label>
          <select
            className={selectClass}
            value={selectedScriptId}
            onChange={(e) => {
              setSelectedScriptId(e.target.value);
              setScriptPreviewOpen(false);
            }}
          >
            <option value="">Use No Script</option>
            {SCRIPT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* No script warning */}
          {!selectedScriptId && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Proceeding without a script. The call will be unscripted.</span>
            </div>
          )}

          {/* Preview button + script text */}
          {selectedScript && (
            <div className="mt-2">
              <button
                type="button"
                className="text-xs font-medium text-brand-gold hover:text-brand-gold-400 transition-colors"
                onClick={() => setScriptPreviewOpen((o) => !o)}
              >
                {scriptPreviewOpen ? 'Hide Preview' : 'Preview Script'}
              </button>
              {scriptPreviewOpen && (
                <div className="mt-2 rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-3 text-sm leading-relaxed text-gray-300">
                  {highlightTemplateVars(selectedScript.text)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Voice Type */}
        <div>
          <label className={labelClass}>Voice Type</label>
          <div className="space-y-2">
            {(Object.entries(VOICE_TYPE_LABELS) as [VoiceType, string][]).map(([val, lbl]) => (
              <label
                key={val}
                className="flex items-center gap-2 cursor-pointer text-sm text-gray-300"
              >
                <input
                  type="radio"
                  name="voiceType"
                  value={val}
                  checked={voiceType === val}
                  onChange={() => setVoiceType(val)}
                  className="accent-brand-gold"
                />
                {lbl}
              </label>
            ))}
          </div>
        </div>

        {/* Compliance Checklist */}
        <div>
          <label className={labelClass}>Compliance Checklist</label>
          <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            {[
              {
                id: 'tcpa',
                label: 'Client has provided TCPA consent for outbound calls',
                checked: complianceTcpa,
                onChange: setComplianceTcpa,
              },
              {
                id: 'purpose',
                label: 'Call purpose is compliant with regulatory requirements',
                checked: compliancePurpose,
                onChange: setCompliancePurpose,
              },
              {
                id: 'hours',
                label: 'Call is within permitted calling hours (8 AM - 9 PM local)',
                checked: complianceHours,
                onChange: setComplianceHours,
              },
              {
                id: 'guarantees',
                label: 'No financial guarantees or promises will be made',
                checked: complianceNoGuarantees,
                onChange: setComplianceNoGuarantees,
              },
            ].map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-2 cursor-pointer text-sm text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.onChange(e.target.checked)}
                  className="accent-brand-gold mt-0.5"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          {!allComplianceChecked && (
            <p className="mt-1.5 text-xs text-amber-400">
              All compliance items must be checked to continue.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Step 3 ──────────────────────────────────────────────────────

  function renderStep3() {
    const summaryRows: [string, string][] = [
      ['Client', clientDisplayName],
      ['TCPA Consent', selectedClient?.tcpaConsent ? 'Yes' : 'No'],
      ['Purpose', effectivePurpose],
      ['Priority', priority === 'immediate' ? 'Immediate' : 'Standard'],
      ['Phone', phone],
      ['Log Phone Update', logPhoneUpdate ? 'Yes' : 'No'],
      ['Script', selectedScript?.name ?? 'None (Unscripted)'],
      ['Voice Type', VOICE_TYPE_LABELS[voiceType]],
      ['Compliance', allComplianceChecked ? 'All checks passed' : 'Incomplete'],
    ];

    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-gray-700 bg-gray-800/40 overflow-hidden">
          {summaryRows.map(([key, val], idx) => (
            <div
              key={key}
              className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                idx % 2 === 0 ? 'bg-gray-800/30' : ''
              }`}
            >
              <span className="font-medium text-gray-400">{key}</span>
              <span className="text-gray-100">{val}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={launching}
          onClick={handleLaunch}
          className="w-full rounded-lg bg-brand-gold py-3 text-sm font-bold text-brand-navy
                     hover:bg-brand-gold-400 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {launching ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Initiating Call...
            </span>
          ) : (
            'Launch Call'
          )}
        </button>
      </div>
    );
  }

  // ── Navigation buttons ──────────────────────────────────────────

  function renderNav() {
    return (
      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <button
          type="button"
          onClick={() => (step === 1 ? onClose() : setStep((s) => s - 1))}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-600
                     text-gray-300 hover:bg-gray-800 transition-colors"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>

        {step < TOTAL_STEPS && (
          <button
            type="button"
            disabled={step === 1 ? !canContinueStep1 : !canContinueStep2}
            onClick={() => setStep((s) => s + 1)}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-brand-gold text-brand-navy
                       hover:bg-brand-gold-400 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            Continue
          </button>
        )}
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────

  return (
    <>
      <FocusTrap active={isOpen} onEscape={onClose}>
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-label="Initiate Call"
        >
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-gray-900 shadow-2xl border border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-100">Initiate Call</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400
                           hover:bg-gray-800 hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <StepDots current={step} />

              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}

              {/* Nav — hidden on step 3 since Launch button is inline */}
              {step < TOTAL_STEPS && renderNav()}
              {step === TOTAL_STEPS && (
                <div className="pt-4 border-t border-gray-700">
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-600
                               text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    Back
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </FocusTrap>

      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg('')} />}
    </>
  );
}
