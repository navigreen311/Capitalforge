'use client';

// ============================================================
// WizardStep4BusinessPurpose — Business purpose & suitability
// Validates purpose description length and checks requested
// credit amount against safe leverage limits.
// ============================================================

import { useMemo } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_PURPOSE_CHARS = 50;

const SPEND_CATEGORIES = [
  { value: 'office_supplies',       label: 'Office Supplies' },
  { value: 'technology_saas',       label: 'Technology/SaaS' },
  { value: 'travel',                label: 'Travel' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'advertising',           label: 'Advertising' },
  { value: 'shipping',              label: 'Shipping' },
  { value: 'meals_entertainment',   label: 'Meals & Entertainment' },
  { value: 'other',                 label: 'Other' },
] as const;

// Placeholder values for suitability calculation
const MONTHLY_REVENUE = 48_000;
const LEVERAGE_MULTIPLIER = 3;
const CURRENT_OUTSTANDING = 85_000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface WizardStep4Props {
  businessPurpose: string;
  spendCategory: string;
  requestedLimit: number;
  clientName: string;
  onBusinessPurposeChange: (value: string) => void;
  onSpendCategoryChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WizardStep4BusinessPurpose({
  businessPurpose,
  spendCategory,
  requestedLimit,
  clientName,
  onBusinessPurposeChange,
  onSpendCategoryChange,
  onBack,
  onNext,
}: WizardStep4Props) {
  // Suitability calculations
  const suitability = useMemo(() => {
    const maxSafeLeverage = MONTHLY_REVENUE * LEVERAGE_MULTIPLIER;
    const remainingSafeLeverage = maxSafeLeverage - CURRENT_OUTSTANDING;
    const isWithinLimits = requestedLimit <= remainingSafeLeverage;
    const excessAmount = requestedLimit - remainingSafeLeverage;

    return {
      requested: requestedLimit,
      maxSafeLeverage,
      monthlyRevenue: MONTHLY_REVENUE,
      currentOutstanding: CURRENT_OUTSTANDING,
      remainingSafeLeverage,
      isWithinLimits,
      excessAmount,
    };
  }, [requestedLimit]);

  // Validation
  const purposeLength = businessPurpose.length;
  const isPurposeValid = purposeLength >= MIN_PURPOSE_CHARS;
  const canProceed = isPurposeValid && suitability.isWithinLimits;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Business Purpose &amp; Suitability
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Describe how {clientName || 'the client'} will use the credit line
          and verify the request is within safe leverage limits.
        </p>
      </div>

      {/* ── Business Purpose ───────────────────────────────────── */}
      <div>
        <label
          htmlFor="business-purpose"
          className="block text-sm font-medium text-gray-700"
        >
          Business Purpose
        </label>
        <textarea
          id="business-purpose"
          rows={4}
          value={businessPurpose}
          onChange={(e) => onBusinessPurposeChange(e.target.value)}
          placeholder="Describe how the credit line will be used for business operations..."
          className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500
            ${!isPurposeValid && purposeLength > 0
              ? 'border-red-300 focus:border-red-500'
              : 'border-gray-300 focus:border-blue-500'
            }`}
        />
        <p
          className={`mt-1 text-xs ${
            isPurposeValid ? 'text-green-600' : 'text-gray-500'
          }`}
        >
          {purposeLength}/{MIN_PURPOSE_CHARS} minimum
        </p>
      </div>

      {/* ── Spend Category ─────────────────────────────────────── */}
      <div>
        <label
          htmlFor="spend-category"
          className="block text-sm font-medium text-gray-700"
        >
          MCC / Spend Category
        </label>
        <select
          id="spend-category"
          value={spendCategory}
          onChange={(e) => onSpendCategoryChange(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2
            text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a category...</option>
          {SPEND_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Suitability Check ──────────────────────────────────── */}
      <div
        className={`rounded-lg border p-4 ${
          suitability.isWithinLimits
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}
      >
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Suitability Check
        </h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Requested</dt>
            <dd className="font-medium text-gray-900">
              {formatCurrency(suitability.requested)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">
              Max Safe Leverage (
              {LEVERAGE_MULTIPLIER}x of{' '}
              {formatCurrency(suitability.monthlyRevenue)} monthly revenue)
            </dt>
            <dd className="font-medium text-gray-900">
              {formatCurrency(suitability.maxSafeLeverage)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Current outstanding</dt>
            <dd className="font-medium text-gray-900">
              {formatCurrency(suitability.currentOutstanding)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <dt className="text-gray-600 font-medium">Remaining safe leverage</dt>
            <dd className="font-semibold text-gray-900">
              {formatCurrency(suitability.remainingSafeLeverage)}
            </dd>
          </div>
        </dl>

        <div className="mt-3 text-sm font-medium">
          {suitability.isWithinLimits ? (
            <p className="text-green-700">
              &#x2705; Requested amount is within safe limits
            </p>
          ) : (
            <p className="text-red-700">
              &#x26A0;&#xFE0F; Requested amount exceeds safe leverage by{' '}
              {formatCurrency(suitability.excessAmount)}
            </p>
          )}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="flex justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300
            bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm
            hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="inline-flex items-center gap-1 rounded-md border border-transparent
            bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm
            hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
