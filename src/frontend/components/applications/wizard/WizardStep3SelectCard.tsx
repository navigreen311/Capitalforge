'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';

// ── Issuer / card product options (mirrors applications/new/page.tsx) ────────

const ISSUERS = [
  { issuer: 'Chase', products: ['Ink Business Preferred', 'Ink Business Cash', 'Ink Business Unlimited'] },
  { issuer: 'American Express', products: ['Business Platinum', 'Business Gold', 'Blue Business Plus'] },
  { issuer: 'Capital One', products: ['Spark Cash Plus', 'Spark Miles', 'Spark Classic'] },
  { issuer: 'Bank of America', products: ['Business Advantage Cash', 'Business Advantage Travel'] },
  { issuer: 'Citi', products: ['Business AAdvantage', 'Costco Anywhere Visa Business'] },
  { issuer: 'US Bank', products: ['Business Triple Cash', 'Business Leverage'] },
  { issuer: 'Wells Fargo', products: ['Business Elite', 'Business Secured'] },
];

// ── Velocity check placeholder data ─────────────────────────────────────────

interface VelocityInfo {
  eligible: boolean;
  rule: string;
  used: number;
  limit: number;
  warning?: string;
}

const VELOCITY_DATA: Record<string, VelocityInfo> = {
  Chase:            { eligible: true,  rule: '5/24', used: 2, limit: 5, warning: 'Submitting 2 Chase applications in same round may trigger reconsideration' },
  'American Express': { eligible: true,  rule: '2/90', used: 0, limit: 2 },
  'Capital One':    { eligible: true,  rule: '1/6',  used: 0, limit: 1 },
  'Bank of America':{ eligible: true,  rule: '3/12', used: 1, limit: 3 },
  Citi:             { eligible: true,  rule: '1/8',  used: 0, limit: 1 },
  'US Bank':        { eligible: true,  rule: '2/12', used: 1, limit: 2 },
  'Wells Fargo':    { eligible: true,  rule: '2/12', used: 0, limit: 2 },
};

// ── Props ────────────────────────────────────────────────────────────────────

interface WizardStep3Props {
  clientName: string;
  issuer: string;
  cardProduct: string;
  requestedLimit: number | '';
  onIssuerChange: (issuer: string) => void;
  onCardProductChange: (product: string) => void;
  onRequestedLimitChange: (limit: number | '') => void;
  onBack: () => void;
  onNext: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WizardStep3SelectCard({
  clientName,
  issuer,
  cardProduct,
  requestedLimit,
  onIssuerChange,
  onCardProductChange,
  onRequestedLimitChange,
  onBack,
  onNext,
}: WizardStep3Props) {
  const [recommendationSelected, setRecommendationSelected] = useState(false);

  const availableProducts = ISSUERS.find((i) => i.issuer === issuer)?.products ?? [];
  const velocityInfo = issuer ? VELOCITY_DATA[issuer] : null;

  const handleSelectRecommendation = () => {
    onIssuerChange('Chase');
    onCardProductChange('Ink Business Preferred');
    onRequestedLimitChange(50000);
    setRecommendationSelected(true);
  };

  const handleIssuerChange = (value: string) => {
    onIssuerChange(value);
    onCardProductChange('');
    setRecommendationSelected(false);
  };

  const handleLimitChange = (value: string) => {
    onRequestedLimitChange(value === '' ? '' : Number(value));
  };

  const isValid = issuer && cardProduct && requestedLimit !== '';

  return (
    <div className="space-y-6">
      {/* ── Optimizer Recommendation ─────────────────────────────── */}
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50/60 p-5 shadow-sm">
        <p className="text-sm text-gray-600 mb-2">
          Based on <span className="font-semibold text-gray-900">{clientName || 'this client'}</span>&apos;s
          profile (FICO 750, 3 inquiries, TX LLC):
        </p>

        <div className="flex items-start gap-3">
          <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden="true">&#11088;</span>
          <div className="flex-1">
            <p className="text-base font-bold text-gray-900">
              RECOMMENDED: Ink Business Preferred &mdash; Chase
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Approval probability: <span className="font-semibold text-emerald-600">94%</span>
              {' | '}0% APR: 12 months
              {' | '}Limit: up to $50K
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSelectRecommendation}
          className={`mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            recommendationSelected
              ? 'bg-emerald-600 text-white cursor-default'
              : 'bg-brand-navy text-white hover:bg-brand-navy/90'
          }`}
        >
          {recommendationSelected ? 'Selected' : 'Select This Card'}
        </button>
      </div>

      {/* ── Manual Selection ─────────────────────────────────────── */}
      <Card className="space-y-5">
        <h3 className="text-base font-semibold text-gray-900">Manual Selection</h3>

        {/* Issuer */}
        <div>
          <label htmlFor="wizard-issuer" className="cf-label">
            Card Issuer <span className="text-red-500">*</span>
          </label>
          <select
            id="wizard-issuer"
            value={issuer}
            onChange={(e) => handleIssuerChange(e.target.value)}
            className="cf-input"
          >
            <option value="">Select issuer...</option>
            {ISSUERS.map((i) => (
              <option key={i.issuer} value={i.issuer}>
                {i.issuer}
              </option>
            ))}
          </select>
        </div>

        {/* Card Product */}
        <div>
          <label htmlFor="wizard-card-product" className="cf-label">
            Card Product <span className="text-red-500">*</span>
          </label>
          <select
            id="wizard-card-product"
            value={cardProduct}
            onChange={(e) => {
              onCardProductChange(e.target.value);
              setRecommendationSelected(false);
            }}
            className="cf-input"
            disabled={!issuer}
          >
            <option value="">
              {issuer ? 'Select card product...' : 'Select issuer first'}
            </option>
            {availableProducts.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Requested Limit */}
        <div>
          <label htmlFor="wizard-limit" className="cf-label">
            Requested Credit Limit ($) <span className="text-red-500">*</span>
          </label>
          <input
            id="wizard-limit"
            type="number"
            min="1000"
            step="1000"
            placeholder="e.g. 50000"
            value={requestedLimit}
            onChange={(e) => handleLimitChange(e.target.value)}
            className="cf-input"
          />
        </div>
      </Card>

      {/* ── Issuer Velocity Check ────────────────────────────────── */}
      {velocityInfo && (
        <Card className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900">Issuer Velocity Check</h3>

          <div className="flex items-start gap-2">
            <span className="text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden="true">&#10004;</span>
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{issuer} {velocityInfo.rule}:</span>{' '}
              Client has {velocityInfo.used} cards in{' '}
              {velocityInfo.rule.split('/')[1]} months &mdash;{' '}
              {velocityInfo.eligible ? (
                <span className="text-emerald-600 font-medium">eligible</span>
              ) : (
                <span className="text-red-600 font-medium">not eligible</span>
              )}
            </p>
          </div>

          {velocityInfo.warning && (
            <div className="flex items-start gap-2">
              <span className="text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true">&#9888;</span>
              <p className="text-sm text-amber-700">
                <span className="font-medium">Note:</span> {velocityInfo.warning}
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ── Footer Navigation ────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="btn-outline btn"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="btn-primary btn disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
