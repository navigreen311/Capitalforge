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

// ── Credit Union card definitions ───────────────────────────────────────────

interface CreditUnionCard {
  id: string;
  name: string;
  issuer: string;
  aprRange: string;
  rewards: string;
  membershipNote: string;
}

const CREDIT_UNION_CARDS: CreditUnionCard[] = [
  {
    id: 'cu-navy-federal',
    name: 'Business Real Rewards',
    issuer: 'Navy Federal Credit Union',
    aprRange: '11.24% - 18.00%',
    rewards: '1.5x points on all purchases, 2x on office supplies',
    membershipNote:
      'Open to military, veterans, DoD civilians, and their families. Eligibility can also be established through family member connections.',
  },
  {
    id: 'cu-alliant',
    name: 'Visa Platinum Rewards',
    issuer: 'Alliant Credit Union',
    aprRange: '12.24% - 17.24%',
    rewards: '2.5% cash back first year, 1.5% ongoing',
    membershipNote:
      'Anyone can join by making a $5 donation to Foster Care to Success during the application process.',
  },
  {
    id: 'cu-penfed',
    name: 'Power Cash Rewards',
    issuer: 'PenFed Credit Union',
    aprRange: '14.49% - 17.99%',
    rewards: '2% cash back on all purchases',
    membershipNote:
      'Open to anyone. Join by opening a savings account with a $5 minimum deposit. No military affiliation required.',
  },
  {
    id: 'cu-becu',
    name: 'Business Visa',
    issuer: 'BECU',
    aprRange: '13.40% - 18.40%',
    rewards: '1.5% cash back on all purchases',
    membershipNote:
      'Membership is open to anyone who lives or works in Washington state, or is a Boeing/Microsoft/T-Mobile employee.',
  },
  {
    id: 'cu-first-tech',
    name: 'Odyssey Rewards World Elite',
    issuer: 'First Tech Federal Credit Union',
    aprRange: '11.49% - 18.00%',
    rewards: '3x points on dining, 2x on travel, 1x everything else',
    membershipNote:
      'Anyone can join by becoming a member of the Financial Fitness Association ($8 one-time fee) or the Computer History Museum ($10/year).',
  },
  {
    id: 'cu-lake-michigan',
    name: 'Max Cash Preferred Visa',
    issuer: 'Lake Michigan Credit Union',
    aprRange: '13.49% - 17.99%',
    rewards: '3% on groceries/drugstores, 2% on gas/dining, 1% everything else',
    membershipNote:
      'Open to anyone who lives or works in select Michigan counties. Non-residents can join the ACA International association to qualify.',
  },
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
  isCreditUnion: boolean;
  membershipConfirmed: boolean;
  onIssuerChange: (issuer: string) => void;
  onCardProductChange: (product: string) => void;
  onRequestedLimitChange: (limit: number | '') => void;
  onCreditUnionChange: (isCU: boolean) => void;
  onMembershipConfirmedChange: (confirmed: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WizardStep3SelectCard({
  clientName,
  issuer,
  cardProduct,
  requestedLimit,
  isCreditUnion,
  membershipConfirmed,
  onIssuerChange,
  onCardProductChange,
  onRequestedLimitChange,
  onCreditUnionChange,
  onMembershipConfirmedChange,
  onBack,
  onNext,
}: WizardStep3Props) {
  const [recommendationSelected, setRecommendationSelected] = useState(false);
  const [selectedCuCardId, setSelectedCuCardId] = useState<string | null>(null);

  const availableProducts = ISSUERS.find((i) => i.issuer === issuer)?.products ?? [];
  const velocityInfo = issuer ? VELOCITY_DATA[issuer] : null;
  const selectedCuCard = CREDIT_UNION_CARDS.find((c) => c.id === selectedCuCardId) ?? null;

  const handleSelectRecommendation = () => {
    onIssuerChange('Chase');
    onCardProductChange('Ink Business Preferred');
    onRequestedLimitChange(50000);
    onCreditUnionChange(false);
    onMembershipConfirmedChange(false);
    setSelectedCuCardId(null);
    setRecommendationSelected(true);
  };

  const handleIssuerChange = (value: string) => {
    onIssuerChange(value);
    onCardProductChange('');
    onCreditUnionChange(false);
    onMembershipConfirmedChange(false);
    setSelectedCuCardId(null);
    setRecommendationSelected(false);
  };

  const handleSelectCuCard = (card: CreditUnionCard) => {
    setSelectedCuCardId(card.id);
    onIssuerChange(card.issuer);
    onCardProductChange(card.name);
    onCreditUnionChange(true);
    onMembershipConfirmedChange(false);
    setRecommendationSelected(false);
  };

  const handleLimitChange = (value: string) => {
    onRequestedLimitChange(value === '' ? '' : Number(value));
  };

  // Validation: for CU cards, membership must be confirmed
  const isCuValid = !isCreditUnion || membershipConfirmed;
  const isValid = issuer && cardProduct && requestedLimit !== '' && isCuValid;

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
            value={isCreditUnion ? '' : issuer}
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
            value={isCreditUnion ? '' : cardProduct}
            onChange={(e) => {
              onCardProductChange(e.target.value);
              setRecommendationSelected(false);
            }}
            className="cf-input"
            disabled={!issuer || isCreditUnion}
          >
            <option value="">
              {isCreditUnion
                ? 'CU card selected below'
                : issuer
                  ? 'Select card product...'
                  : 'Select issuer first'}
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

      {/* ── Credit Union Cards Section ───────────────────────────── */}
      <div className="space-y-4">
        {/* Section header with teal accent */}
        <div className="flex items-center gap-3">
          <div className="h-6 w-1 rounded-full bg-teal-500" />
          <h3 className="text-base font-bold text-gray-900">Credit Union Cards</h3>
        </div>

        {/* Info notice */}
        <div className="rounded-lg border border-teal-200 bg-teal-50/70 px-4 py-3 flex items-start gap-2.5">
          <svg
            className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm text-teal-800">
            Credit union cards require membership before applying. Most memberships are open to
            anyone &mdash; see eligibility notes on each card.
          </p>
        </div>

        {/* CU card list */}
        <div className="grid gap-3">
          {CREDIT_UNION_CARDS.map((card) => {
            const isSelected = selectedCuCardId === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleSelectCuCard(card)}
                className={`w-full text-left rounded-xl border-2 px-4 py-4 transition-all ${
                  isSelected
                    ? 'border-teal-500 bg-teal-50/50 shadow-md ring-1 ring-teal-400/30'
                    : 'border-surface-border bg-white hover:border-teal-300 hover:bg-teal-50/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{card.name}</span>
                      <span className="inline-flex items-center rounded-md bg-teal-100 px-2 py-0.5 text-2xs font-bold text-teal-700 uppercase tracking-wide border border-teal-200">
                        CU
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{card.issuer}</p>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span>
                        <span className="font-medium text-gray-700">APR:</span> {card.aprRange}
                      </span>
                      <span>
                        <span className="font-medium text-gray-700">Rewards:</span> {card.rewards}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs text-gray-500 italic">
                      <span className="font-medium not-italic text-gray-600">Membership:</span>{' '}
                      {card.membershipNote}
                    </p>
                  </div>

                  {/* Selection indicator */}
                  <div className="flex-shrink-0 mt-1">
                    <div
                      className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-teal-500 bg-teal-500'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2.5 6L5 8.5L9.5 3.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Membership Checkpoint (shown when CU card is selected) ── */}
      {isCreditUnion && selectedCuCard && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50/60 p-5 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-amber-600 flex-shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            <h4 className="text-base font-bold text-gray-900">Membership Required</h4>
          </div>

          <p className="text-sm text-gray-700 leading-relaxed">
            <span className="font-semibold">{selectedCuCard.issuer}:</span>{' '}
            {selectedCuCard.membershipNote}
          </p>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={membershipConfirmed}
              onChange={(e) => onMembershipConfirmedChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 accent-teal-600"
            />
            <span className="text-sm text-gray-800 leading-snug group-hover:text-gray-900">
              Client has confirmed membership eligibility and will establish membership before applying
              <span className="text-red-500 ml-0.5">*</span>
            </span>
          </label>

          {!membershipConfirmed && (
            <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              This checkbox must be checked to proceed
            </p>
          )}
        </div>
      )}

      {/* ── Issuer Velocity Check ────────────────────────────────── */}
      {velocityInfo && !isCreditUnion && (
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
