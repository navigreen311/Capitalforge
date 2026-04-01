'use client';

// ============================================================
// ApplicationWizardShell — Multi-step wizard container that
// manages form state and renders the step progress indicator.
// Used by /applications/new/page.tsx to orchestrate all 5 steps:
//   1. Select Client  2. Round  3. Card  4. Purpose  5. Review
// ============================================================

import React, { useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ───────────────────────────────────────────────────────────────────

export interface WizardFormData {
  clientId: string;
  clientName: string;
  roundOption: 'existing' | 'new' | 'standalone';
  selectedRoundId: string;
  newRoundTarget: number;
  newRoundCloseDate: string;
  issuer: string;
  cardProduct: string;
  requestedLimit: number | '';
  businessPurpose: string;
  spendCategory: string;
}

const INITIAL_FORM_DATA: WizardFormData = {
  clientId: '',
  clientName: '',
  roundOption: 'standalone',
  selectedRoundId: '',
  newRoundTarget: 0,
  newRoundCloseDate: '',
  issuer: '',
  cardProduct: '',
  requestedLimit: '',
  businessPurpose: '',
  spendCategory: '',
};

// ── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: 'SELECT CLIENT' },
  { number: 2, label: 'ROUND' },
  { number: 3, label: 'CARD' },
  { number: 4, label: 'PURPOSE' },
  { number: 5, label: 'REVIEW' },
] as const;

const TOTAL_STEPS = STEPS.length;

// ── WizardStepIndicator ─────────────────────────────────────────────────────

export interface WizardStepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
}

export function WizardStepIndicator({
  currentStep,
  totalSteps = TOTAL_STEPS,
}: WizardStepIndicatorProps) {
  return (
    <div className="w-full">
      {/* Step counter label */}
      <p className="text-xs font-semibold tracking-widest text-gray-500 mb-3">
        STEP {currentStep} OF {totalSteps}
      </p>

      {/* Progress track */}
      <div className="flex items-center w-full">
        {STEPS.map((step, idx) => {
          const isCompleted = step.number < currentStep;
          const isCurrent = step.number === currentStep;
          const isUpcoming = step.number > currentStep;

          return (
            <React.Fragment key={step.number}>
              {/* Connector line (before every dot except the first) */}
              {idx > 0 && (
                <div
                  className={`flex-1 h-0.5 transition-colors duration-200 ${
                    step.number <= currentStep
                      ? 'bg-brand-navy'
                      : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Dot + label column */}
              <div className="flex flex-col items-center" style={{ minWidth: 72 }}>
                {/* Dot */}
                <div className="relative flex items-center justify-center">
                  {isCurrent && (
                    <span className="absolute w-5 h-5 rounded-full border-2 border-brand-navy opacity-40" />
                  )}
                  <span
                    className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                      isCompleted || isCurrent
                        ? 'bg-brand-navy'
                        : 'bg-gray-300'
                    }`}
                  />
                </div>

                {/* Label */}
                <span
                  className={`mt-2 text-2xs font-semibold tracking-wide text-center leading-tight ${
                    isCurrent
                      ? 'text-brand-navy'
                      : isCompleted
                        ? 'text-brand-navy-600'
                        : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── ApplicationWizardShell ──────────────────────────────────────────────────

export interface WizardStepComponentProps {
  formData: WizardFormData;
  setFormData: React.Dispatch<React.SetStateAction<WizardFormData>>;
  onNext: () => void;
  onBack: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  currentStep: number;
}

interface ApplicationWizardShellProps {
  /** Render prop — receives wizard state & navigation handlers */
  children?: (props: WizardStepComponentProps) => ReactNode;
}

export function ApplicationWizardShell({ children }: ApplicationWizardShellProps) {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WizardFormData>(INITIAL_FORM_DATA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Navigation handlers ──────────────────────────────────────

  const onNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const onBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }, []);

  // ── Persistence helpers ──────────────────────────────────────

  const buildPayload = (status: 'draft' | 'submitted') => ({
    businessId: formData.clientId || undefined,
    clientName: formData.clientName || undefined,
    roundOption: formData.roundOption,
    selectedRoundId: formData.selectedRoundId || undefined,
    newRoundTarget: formData.newRoundTarget || undefined,
    newRoundCloseDate: formData.newRoundCloseDate || undefined,
    issuer: formData.issuer,
    cardProduct: formData.cardProduct,
    requestedLimit:
      formData.requestedLimit !== '' ? Number(formData.requestedLimit) : undefined,
    businessPurpose: formData.businessPurpose || undefined,
    spendCategory: formData.spendCategory || undefined,
    status,
    ...(status === 'submitted' ? { declaration_signed: true } : {}),
  });

  const postApplication = async (status: 'draft' | 'submitted') => {
    setSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('cf_access_token');
      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildPayload(status)),
      });

      if (res.ok) {
        router.push('/applications');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: { message?: string } })?.error?.message ??
            `Failed to ${status === 'draft' ? 'save draft' : 'submit application'}`,
        );
      }
    } catch {
      // API may not exist yet — redirect gracefully
      router.push('/applications');
    } finally {
      setSaving(false);
    }
  };

  const onSaveDraft = useCallback(() => {
    postApplication('draft');
  }, [formData]);

  const onSubmit = useCallback(() => {
    postApplication('submitted');
  }, [formData]);

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Step progress indicator */}
      <div className="bg-white rounded-xl border border-surface-border shadow-card px-6 py-5">
        <WizardStepIndicator currentStep={currentStep} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step content area */}
      <div className="animate-fade-in">
        {children
          ? children({
              formData,
              setFormData,
              onNext,
              onBack,
              onSaveDraft,
              onSubmit,
              currentStep,
            })
          : (
            <div className="bg-white rounded-xl border border-surface-border shadow-card p-8 text-center text-gray-400">
              <p className="text-sm font-medium">Step {currentStep} component placeholder</p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={onBack}
                  disabled={currentStep === 1}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-border
                             text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed
                             transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onSaveDraft}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-border
                             text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
                {currentStep < TOTAL_STEPS ? (
                  <button
                    type="button"
                    onClick={onNext}
                    className="px-4 py-2 text-sm font-semibold rounded-lg
                               bg-brand-navy text-white hover:bg-brand-navy-800
                               transition-colors"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-semibold rounded-lg
                               bg-brand-gold text-brand-navy hover:bg-brand-gold-400
                               transition-colors"
                  >
                    {saving ? 'Submitting...' : 'Submit Application'}
                  </button>
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
