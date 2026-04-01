'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';

// ── Types ─────────────────────────────────────────────────────

interface WizardStep5Props {
  formData: {
    clientName: string;
    clientId: string;
    issuer: string;
    cardProduct: string;
    roundLabel: string;
    roundId: string;
    requestedLimit: number;
    businessPurpose: string;
    spendCategory: string;
  };
  onBack: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

// ── Declaration checkboxes ────────────────────────────────────

const DECLARATIONS = [
  'I confirm that all information on this application is accurate and complete.',
  'I confirm that no information has been misrepresented to the issuer.',
  'I confirm that the business purpose stated is genuine and documented.',
  'I understand that misrepresentation on credit applications may constitute federal fraud under 18 U.S.C. \u00A71014 and \u00A71344.',
] as const;

// ── Helper ────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Component ─────────────────────────────────────────────────

export default function WizardStep5ReviewConfirm({
  formData,
  onBack,
  onSaveDraft,
  onSubmit,
  isSubmitting,
}: WizardStep5Props) {
  const [checked, setChecked] = useState<boolean[]>([false, false, false, false]);

  const allChecked = checked.every(Boolean);

  const toggle = (index: number) => {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  // Review rows
  const reviewRows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'CLIENT',
      value: (
        <span>
          {formData.clientName}{' '}
          <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Active
          </span>
        </span>
      ),
    },
    {
      label: 'CARD',
      value: `${formData.cardProduct} \u2014 ${formData.issuer}`,
    },
    { label: 'ROUND', value: formData.roundLabel },
    { label: 'REQUESTED', value: formatCurrency(formData.requestedLimit) },
    { label: 'BUSINESS PURPOSE', value: formData.businessPurpose },
    {
      label: 'CONSENT',
      value: (
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <span aria-hidden="true">&#x2705;</span> All consents verified
        </span>
      ),
    },
    {
      label: 'ACKNOWLEDGMENT',
      value: (
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <span aria-hidden="true">&#x2705;</span> Product-Reality Acknowledgment signed Jan 9, 2026
        </span>
      ),
    },
    {
      label: 'ISSUER VELOCITY',
      value: (
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <span aria-hidden="true">&#x2705;</span> Chase 5/24 clear
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Review Summary ──────────────────────────────────── */}
      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Review Summary</h3>

        <dl className="divide-y divide-gray-100">
          {reviewRows.map((row) => (
            <div
              key={row.label}
              className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 first:pt-0 last:pb-0"
            >
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400 sm:w-44 flex-shrink-0">
                {row.label}
              </dt>
              <dd className="text-sm font-medium text-gray-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* ── Pre-Submission Declaration ──────────────────────── */}
      <div className="rounded-xl border-2 border-red-300 bg-red-50/60 p-6">
        <h3 className="text-base font-semibold text-red-900 mb-1">
          Pre-Submission Declaration
        </h3>
        <p className="text-xs text-red-600 mb-4">
          You must acknowledge all statements below before submitting.
        </p>

        <div className="space-y-3">
          {DECLARATIONS.map((text, i) => (
            <label
              key={i}
              className="flex items-start gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => toggle(i)}
                className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-red-900 leading-snug group-hover:text-red-700">
                {text}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Footer Actions ─────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Back
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveDraft}
            className="btn btn-outline"
          >
            Save as Draft
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!allChecked || isSubmitting}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isSubmitting && (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
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
            )}
            {isSubmitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      </div>
    </div>
  );
}
