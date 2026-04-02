'use client';

// ============================================================
// /referrals — Referral & Affiliate Tracking
// Attribution table (source type, partner, channel, fee
// amount, fee status). Analytics cards (total referrals,
// conversion rate, total fees paid, pending fees).
// Agreement generation button. Detail drawer, dispute
// resolution, add referral wizard, partner performance,
// bulk fee payout, flagged partner warnings, client selector.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../../lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceType = 'affiliate' | 'broker' | 'direct' | 'organic' | 'partner';
type Channel = 'email' | 'web' | 'phone' | 'social' | 'event' | 'api';
type FeeStatus = 'pending' | 'approved' | 'paid' | 'disputed' | 'voided';

interface ReferralRow {
  id: string;
  clientName: string;
  sourceType: SourceType;
  partnerName: string;
  channel: Channel;
  referredAt: string;        // ISO date
  converted: boolean;
  feeAmount: number;
  feeStatus: FeeStatus;
  applicationId?: string;
  fundingAmount?: number;
  tcpaOnFile?: boolean;
  consentDate?: string;
  applicationDate?: string;
  conversionDate?: string;
  feeApprovedDate?: string;
  feePaidDate?: string;
  feeRate?: number;
}

type DisputeReason = 'fee_error' | 'agreement_violation' | 'client_withdrawal' | 'unauthorized' | 'other';
type ResolutionAction = 'approve' | 'reduce' | 'void' | 'escalate';

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_REFERRALS: ReferralRow[] = [
  {
    id: 'ref_001',
    clientName: 'Apex Ventures LLC',
    sourceType: 'broker',
    partnerName: 'Meridian Capital Brokers',
    channel: 'email',
    referredAt: '2026-03-25T10:00:00Z',
    converted: true,
    feeAmount: 4200,
    feeStatus: 'paid',
    applicationId: 'app_101',
    fundingAmount: 210000,
    tcpaOnFile: true,
    consentDate: '2026-03-25T10:05:00Z',
    applicationDate: '2026-03-25T14:00:00Z',
    conversionDate: '2026-03-27T09:00:00Z',
    feeApprovedDate: '2026-03-28T11:00:00Z',
    feePaidDate: '2026-03-29T15:00:00Z',
    feeRate: 2.0,
  },
  {
    id: 'ref_002',
    clientName: 'NovaTech Solutions Inc.',
    sourceType: 'affiliate',
    partnerName: 'Atlas Referral Network',
    channel: 'web',
    referredAt: '2026-03-26T14:30:00Z',
    converted: true,
    feeAmount: 1800,
    feeStatus: 'approved',
    applicationId: 'app_102',
    fundingAmount: 90000,
    tcpaOnFile: true,
    consentDate: '2026-03-26T14:35:00Z',
    applicationDate: '2026-03-27T10:00:00Z',
    conversionDate: '2026-03-28T16:00:00Z',
    feeApprovedDate: '2026-03-29T09:00:00Z',
    feeRate: 2.0,
  },
  {
    id: 'ref_003',
    clientName: 'Blue Ridge Consulting',
    sourceType: 'partner',
    partnerName: 'Westside Referral Group',
    channel: 'phone',
    referredAt: '2026-03-27T09:15:00Z',
    converted: false,
    feeAmount: 0,
    feeStatus: 'pending',
    tcpaOnFile: false,
  },
  {
    id: 'ref_004',
    clientName: 'Summit Capital Group',
    sourceType: 'broker',
    partnerName: 'Meridian Capital Brokers',
    channel: 'api',
    referredAt: '2026-03-20T08:00:00Z',
    converted: true,
    feeAmount: 6750,
    feeStatus: 'paid',
    applicationId: 'app_095',
    fundingAmount: 450000,
    tcpaOnFile: true,
    consentDate: '2026-03-20T08:05:00Z',
    applicationDate: '2026-03-20T12:00:00Z',
    conversionDate: '2026-03-22T10:00:00Z',
    feeApprovedDate: '2026-03-23T14:00:00Z',
    feePaidDate: '2026-03-24T10:00:00Z',
    feeRate: 1.5,
  },
  {
    id: 'ref_005',
    clientName: 'Horizon Retail Partners',
    sourceType: 'direct',
    partnerName: '\u2014',
    channel: 'web',
    referredAt: '2026-03-28T16:00:00Z',
    converted: false,
    feeAmount: 0,
    feeStatus: 'voided',
    tcpaOnFile: false,
  },
  {
    id: 'ref_006',
    clientName: 'Crestline Medical LLC',
    sourceType: 'affiliate',
    partnerName: 'Atlas Referral Network',
    channel: 'email',
    referredAt: '2026-03-22T11:45:00Z',
    converted: true,
    feeAmount: 2400,
    feeStatus: 'pending',
    applicationId: 'app_098',
    fundingAmount: 120000,
    tcpaOnFile: true,
    consentDate: '2026-03-22T11:50:00Z',
    applicationDate: '2026-03-23T09:00:00Z',
    conversionDate: '2026-03-25T14:00:00Z',
    feeRate: 2.0,
  },
  {
    id: 'ref_007',
    clientName: 'Pinnacle Freight Corp',
    sourceType: 'partner',
    partnerName: 'Goldstein & Rowe LLP',
    channel: 'event',
    referredAt: '2026-03-15T13:00:00Z',
    converted: true,
    feeAmount: 3100,
    feeStatus: 'paid',
    applicationId: 'app_088',
    fundingAmount: 310000,
    tcpaOnFile: true,
    consentDate: '2026-03-15T13:10:00Z',
    applicationDate: '2026-03-16T10:00:00Z',
    conversionDate: '2026-03-18T11:00:00Z',
    feeApprovedDate: '2026-03-19T09:00:00Z',
    feePaidDate: '2026-03-20T15:00:00Z',
    feeRate: 1.0,
  },
  {
    id: 'ref_008',
    clientName: 'Redwood Digital',
    sourceType: 'organic',
    partnerName: '\u2014',
    channel: 'web',
    referredAt: '2026-03-18T09:30:00Z',
    converted: true,
    feeAmount: 0,
    feeStatus: 'voided',
    applicationId: 'app_092',
    fundingAmount: 75000,
    tcpaOnFile: true,
    consentDate: '2026-03-18T09:35:00Z',
    applicationDate: '2026-03-19T10:00:00Z',
    conversionDate: '2026-03-21T14:00:00Z',
  },
  {
    id: 'ref_009',
    clientName: 'Lakefront Industries',
    sourceType: 'broker',
    partnerName: 'FastFund Brokers Inc.',
    channel: 'phone',
    referredAt: '2026-03-29T10:00:00Z',
    converted: false,
    feeAmount: 0,
    feeStatus: 'pending',
    tcpaOnFile: false,
  },
  {
    id: 'ref_010',
    clientName: 'Copper Ridge Holdings',
    sourceType: 'affiliate',
    partnerName: 'Atlas Referral Network',
    channel: 'social',
    referredAt: '2026-03-30T14:00:00Z',
    converted: false,
    feeAmount: 1100,
    feeStatus: 'disputed',
    tcpaOnFile: true,
    consentDate: '2026-03-30T14:05:00Z',
  },
];

const FLAGGED_PARTNERS = ['FastFund Brokers Inc.'];

const AVAILABLE_CLIENTS = [
  'Apex Ventures LLC',
  'NovaTech Solutions Inc.',
  'Blue Ridge Consulting',
  'Summit Capital Group',
  'Horizon Retail Partners',
  'Crestline Medical LLC',
  'Pinnacle Freight Corp',
  'Redwood Digital',
  'Lakefront Industries',
  'Copper Ridge Holdings',
  'Greenfield Enterprises',
  'Silverline Holdings',
];

const AVAILABLE_PARTNERS = [
  'Meridian Capital Brokers',
  'Atlas Referral Network',
  'Westside Referral Group',
  'Goldstein & Rowe LLP',
  'FastFund Brokers Inc.',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_TYPE_CONFIG: Record<SourceType, { label: string; badgeClass: string }> = {
  affiliate: { label: 'Affiliate',  badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  broker:    { label: 'Broker',     badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  direct:    { label: 'Direct',     badgeClass: 'bg-gray-800 text-gray-300 border-gray-600' },
  organic:   { label: 'Organic',    badgeClass: 'bg-teal-900 text-teal-300 border-teal-700' },
  partner:   { label: 'Partner',    badgeClass: 'bg-amber-900 text-amber-300 border-amber-700' },
};

const CHANNEL_CONFIG: Record<Channel, { label: string }> = {
  email:  { label: 'Email' },
  web:    { label: 'Web' },
  phone:  { label: 'Phone' },
  social: { label: 'Social' },
  event:  { label: 'Event' },
  api:    { label: 'API' },
};

const FEE_STATUS_CONFIG: Record<FeeStatus, { label: string; badgeClass: string }> = {
  pending:  { label: 'Pending',  badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  approved: { label: 'Approved', badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  paid:     { label: 'Paid',     badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  disputed: { label: 'Disputed', badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  voided:   { label: 'Voided',   badgeClass: 'bg-gray-800 text-gray-500 border-gray-600' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatCurrency(n: number): string {
  if (n === 0) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-green-800 border border-green-600 text-green-100 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-in slide-in-from-bottom-4">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Referral Detail Drawer
// ---------------------------------------------------------------------------

function ReferralDrawer({
  referral,
  onClose,
}: {
  referral: ReferralRow;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const timelineSteps = [
    { label: 'Referred', date: referral.referredAt, done: true },
    { label: 'Consent', date: referral.consentDate, done: !!referral.consentDate },
    { label: 'Application', date: referral.applicationDate, done: !!referral.applicationDate },
    { label: 'Converted', date: referral.conversionDate, done: !!referral.conversionDate },
    { label: 'Fee Approved', date: referral.feeApprovedDate, done: !!referral.feeApprovedDate },
    { label: 'Fee Paid', date: referral.feePaidDate, done: !!referral.feePaidDate },
  ];

  const calculatedFee = referral.fundingAmount && referral.feeRate
    ? referral.fundingAmount * (referral.feeRate / 100)
    : null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="absolute right-0 top-0 h-full w-[600px] max-w-full bg-gray-900 border-l border-gray-700 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-white">{referral.clientName}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SOURCE_TYPE_CONFIG[referral.sourceType].badgeClass}`}>
                {SOURCE_TYPE_CONFIG[referral.sourceType].label}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${FEE_STATUS_CONFIG[referral.feeStatus].badgeClass}`}>
                {FEE_STATUS_CONFIG[referral.feeStatus].label}
              </span>
              {FLAGGED_PARTNERS.includes(referral.partnerName) && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-900 text-red-300 border-red-700">
                  Flagged Partner
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-2xl font-bold transition-colors leading-none"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Partner</p>
              <p className="text-sm text-gray-200 mt-0.5">{referral.partnerName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Channel</p>
              <p className="text-sm text-gray-200 mt-0.5">{CHANNEL_CONFIG[referral.channel].label}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Date Referred</p>
              <p className="text-sm text-gray-200 mt-0.5">{formatDate(referral.referredAt)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Application ID</p>
              <p className="text-sm text-gray-200 mt-0.5">{referral.applicationId || '\u2014'}</p>
            </div>
          </div>

          {/* Referral Timeline */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-3">Referral Timeline</h3>
            <div className="space-y-0">
              {timelineSteps.map((step, i) => (
                <div key={step.label} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full border-2 mt-0.5 ${step.done ? 'bg-green-500 border-green-400' : 'bg-gray-700 border-gray-600'}`} />
                    {i < timelineSteps.length - 1 && (
                      <div className={`w-0.5 h-6 ${step.done && timelineSteps[i + 1].done ? 'bg-green-600' : 'bg-gray-700'}`} />
                    )}
                  </div>
                  <div className="pb-2">
                    <p className={`text-sm font-medium ${step.done ? 'text-gray-100' : 'text-gray-500'}`}>{step.label}</p>
                    <p className="text-xs text-gray-500">{step.date ? formatDate(step.date) : 'Pending'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fee Breakdown */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-3">Fee Breakdown</h3>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Funding Amount</span>
                <span className="text-gray-100 font-medium">
                  {referral.fundingAmount ? formatCurrency(referral.fundingAmount) : '\u2014'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Fee Rate</span>
                <span className="text-gray-100 font-medium">
                  {referral.feeRate ? `${referral.feeRate}%` : '\u2014'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Calculated Fee</span>
                <span className="text-gray-100 font-medium">
                  {calculatedFee != null ? formatCurrency(calculatedFee) : '\u2014'}
                </span>
              </div>
              <div className="border-t border-gray-800 my-1" />
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 font-semibold">Final Fee</span>
                <span className="text-yellow-400 font-bold">
                  {formatCurrency(referral.feeAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Consent Status */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-3">Consent Status</h3>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${referral.tcpaOnFile ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-200">
                  TCPA on file: <span className={`font-semibold ${referral.tcpaOnFile ? 'text-green-400' : 'text-red-400'}`}>
                    {referral.tcpaOnFile ? 'Yes' : 'No'}
                  </span>
                </span>
              </div>
              {referral.consentDate && (
                <p className="text-xs text-gray-500 mt-1 ml-[18px]">Captured {formatDate(referral.consentDate)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispute Resolution Modal
// ---------------------------------------------------------------------------

function DisputeModal({
  referral,
  onClose,
  onSubmit,
}: {
  referral: ReferralRow;
  onClose: () => void;
  onSubmit: (action: ResolutionAction) => void;
}) {
  const [reason, setReason] = useState<DisputeReason | ''>('');
  const [description, setDescription] = useState('');
  const [resolution, setResolution] = useState<ResolutionAction | ''>('');

  const canSubmit = reason && description.trim().length > 0 && resolution;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(resolution as ResolutionAction);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Resolve Dispute</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl font-bold transition-colors">&times;</button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Referral: <span className="text-gray-200 font-medium">{referral.clientName}</span> &mdash; Fee: <span className="text-yellow-400 font-medium">{formatCurrency(referral.feeAmount)}</span>
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Dispute Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as DisputeReason)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
            >
              <option value="">Select reason...</option>
              <option value="fee_error">Fee error</option>
              <option value="agreement_violation">Agreement violation</option>
              <option value="client_withdrawal">Client withdrawal</option>
              <option value="unauthorized">Unauthorized referral</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the dispute and resolution details..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Resolution Action</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'approve', label: 'Approve Fee' },
                { value: 'reduce', label: 'Reduce Fee' },
                { value: 'void', label: 'Void Fee' },
                { value: 'escalate', label: 'Escalate' },
              ] as { value: ResolutionAction; label: string }[]).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    resolution === opt.value
                      ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="resolution"
                    value={opt.value}
                    checked={resolution === opt.value}
                    onChange={(e) => setResolution(e.target.value as ResolutionAction)}
                    className="sr-only"
                  />
                  <span className={`w-3 h-3 rounded-full border-2 ${resolution === opt.value ? 'border-yellow-500 bg-yellow-500' : 'border-gray-600'}`} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit Resolution
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Referral Modal (3-step wizard)
// ---------------------------------------------------------------------------

function AddReferralModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (r: ReferralRow) => void;
}) {
  const [step, setStep] = useState(1);

  // Step 1 fields
  const [clientName, setClientName] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('broker');
  const [channel, setChannel] = useState<Channel>('email');
  const [referredAt, setReferredAt] = useState('2026-04-01');

  // Step 2 consent
  const [tcpaCaptured, setTcpaCaptured] = useState(false);
  const [referralDisclosed, setReferralDisclosed] = useState(false);
  const [agreementOnFile, setAgreementOnFile] = useState(false);

  const step1Valid = clientName && partnerName;
  const step2Valid = tcpaCaptured && referralDisclosed && agreementOnFile;

  const handleSubmit = () => {
    const newRef: ReferralRow = {
      id: `ref_${Date.now()}`,
      clientName,
      partnerName,
      sourceType,
      channel,
      referredAt: new Date(referredAt).toISOString(),
      converted: false,
      feeAmount: 0,
      feeStatus: 'pending',
      tcpaOnFile: tcpaCaptured,
    };
    onAdd(newRef);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Add Referral &mdash; Step {step} of 3</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl font-bold transition-colors">&times;</button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-5">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-yellow-500' : 'bg-gray-700'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Client</label>
              <select
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
              >
                <option value="">Select client...</option>
                {AVAILABLE_CLIENTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Partner</label>
              <select
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
              >
                <option value="">Select partner...</option>
                {AVAILABLE_PARTNERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Source Type</label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as SourceType)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
                >
                  {(['affiliate', 'broker', 'direct', 'organic', 'partner'] as SourceType[]).map((t) => (
                    <option key={t} value={t}>{SOURCE_TYPE_CONFIG[t].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as Channel)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
                >
                  {(['email', 'web', 'phone', 'social', 'event', 'api'] as Channel[]).map((c) => (
                    <option key={c} value={c}>{CHANNEL_CONFIG[c].label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Date Referred</label>
              <input
                type="date"
                value={referredAt}
                onChange={(e) => setReferredAt(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">All consent items must be confirmed before proceeding.</p>
            {[
              { id: 'tcpa', label: 'TCPA consent captured', checked: tcpaCaptured, set: setTcpaCaptured },
              { id: 'disclosed', label: 'Referral arrangement disclosed to client', checked: referralDisclosed, set: setReferralDisclosed },
              { id: 'agreement', label: 'Referral agreement on file', checked: agreementOnFile, set: setAgreementOnFile },
            ].map((item) => (
              <label
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  item.checked ? 'border-green-600 bg-green-900/30' : 'border-gray-700 bg-gray-800'
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.set(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-green-500 focus:ring-green-500 bg-gray-700"
                />
                <span className={`text-sm ${item.checked ? 'text-green-300' : 'text-gray-400'}`}>{item.label}</span>
              </label>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-2">Review &amp; Submit</h3>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Client</span><span className="text-gray-100">{clientName}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Partner</span><span className="text-gray-100">{partnerName}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Source</span><span className="text-gray-100">{SOURCE_TYPE_CONFIG[sourceType].label}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Channel</span><span className="text-gray-100">{CHANNEL_CONFIG[channel].label}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="text-gray-100">{referredAt}</span></div>
              <div className="border-t border-gray-800 my-1" />
              <div className="flex justify-between"><span className="text-gray-400">TCPA</span><span className="text-green-400">Confirmed</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Disclosed</span><span className="text-green-400">Confirmed</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Agreement</span><span className="text-green-400">On file</span></div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
            >
              Add Referral
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payout Confirmation Modal
// ---------------------------------------------------------------------------

function PayoutModal({
  count,
  total,
  onClose,
  onConfirm,
}: {
  count: number;
  total: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 text-center">
        <h2 className="text-lg font-bold text-white mb-2">Confirm Payout</h2>
        <p className="text-sm text-gray-400 mb-4">
          Process payout for <span className="text-yellow-400 font-bold">{count}</span> approved fees totaling{' '}
          <span className="text-yellow-400 font-bold">{formatCurrency(total)}</span>?
        </p>
        <p className="text-xs text-gray-500 mb-5">This action cannot be undone. Fees will be marked as paid.</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold transition-colors"
          >
            Process Payout
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralRow[]>(PLACEHOLDER_REFERRALS);
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceType | ''>('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<FeeStatus | ''>('');
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const [search, setSearch] = useState('');
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<ReferralRow | null>(null);
  const [disputeReferral, setDisputeReferral] = useState<ReferralRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [openKebab, setOpenKebab] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState('');
  const [hoveredFlagged, setHoveredFlagged] = useState<string | null>(null);

  // Agreement modal fields
  const [agPartner, setAgPartner] = useState('');
  const [agType, setAgType] = useState('Referral Fee Agreement');
  const [agFeeStructure, setAgFeeStructure] = useState('Flat Fee');
  const [agFeeValue, setAgFeeValue] = useState('');
  const [agEffectiveDate, setAgEffectiveDate] = useState('2026-04-01');
  const [agExpirationDate, setAgExpirationDate] = useState('');
  const [agSignatory, setAgSignatory] = useState('');
  const [agFeeCap, setAgFeeCap] = useState(false);
  const [agDisclosure, setAgDisclosure] = useState(false);
  const [agErrors, setAgErrors] = useState<string[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<{ referrals: ReferralRow[] }>('/referrals');
        if (res.success && res.data?.referrals) setReferrals(res.data.referrals);
      } catch { /* placeholder */ }
      finally { setLoading(false); }
    })();
  }, []);

  // Close kebab on outside click
  useEffect(() => {
    if (!openKebab) return;
    const handler = () => setOpenKebab(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openKebab]);

  const displayed = referrals.filter((r) => {
    const matchSource = !sourceFilter || r.sourceType === sourceFilter;
    const matchFeeStatus = !feeStatusFilter || r.feeStatus === feeStatusFilter;
    const matchChannel = !channelFilter || r.channel === channelFilter;
    const matchSearch =
      !search ||
      r.clientName.toLowerCase().includes(search.toLowerCase()) ||
      r.partnerName.toLowerCase().includes(search.toLowerCase());
    const matchClient = !clientFilter || r.clientName === clientFilter;
    return matchSource && matchFeeStatus && matchChannel && matchSearch && matchClient;
  });

  // Analytics
  const totalReferrals = referrals.length;
  const converted = referrals.filter((r) => r.converted);
  const conversionRate = totalReferrals > 0 ? Math.round((converted.length / totalReferrals) * 100) : 0;
  const totalFeesPaid = referrals
    .filter((r) => r.feeStatus === 'paid')
    .reduce((s, r) => s + r.feeAmount, 0);
  const pendingFees = referrals
    .filter((r) => r.feeStatus === 'pending' || r.feeStatus === 'approved')
    .reduce((s, r) => s + r.feeAmount, 0);

  const SOURCE_TYPES: SourceType[] = ['affiliate', 'broker', 'direct', 'organic', 'partner'];
  const FEE_STATUSES: FeeStatus[] = ['pending', 'approved', 'paid', 'disputed', 'voided'];
  const CHANNELS: Channel[] = ['email', 'web', 'phone', 'social', 'event', 'api'];

  // Bulk payout logic
  const approvedDisplayed = displayed.filter((r) => r.feeStatus === 'approved');
  const selectedApproved = approvedDisplayed.filter((r) => selectedIds.has(r.id));
  const selectedTotal = selectedApproved.reduce((s, r) => s + r.feeAmount, 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedApproved.length === approvedDisplayed.length) {
      // Deselect all approved
      setSelectedIds((prev) => {
        const next = new Set(prev);
        approvedDisplayed.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        approvedDisplayed.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const handlePayout = () => {
    setReferrals((prev) =>
      prev.map((r) =>
        selectedIds.has(r.id) && r.feeStatus === 'approved'
          ? { ...r, feeStatus: 'paid' as FeeStatus, feePaidDate: new Date().toISOString() }
          : r
      )
    );
    setSelectedIds(new Set());
    setShowPayoutModal(false);
    showToast(`Payout processed for ${selectedApproved.length} fees totaling ${formatCurrency(selectedTotal)}`);
  };

  const handleDisputeResolve = (action: ResolutionAction) => {
    if (!disputeReferral) return;
    const statusMap: Record<ResolutionAction, FeeStatus> = {
      approve: 'approved',
      reduce: 'approved',
      void: 'voided',
      escalate: 'disputed',
    };
    setReferrals((prev) =>
      prev.map((r) =>
        r.id === disputeReferral.id ? { ...r, feeStatus: statusMap[action] } : r
      )
    );
    setDisputeReferral(null);
    const labels: Record<ResolutionAction, string> = {
      approve: 'Fee approved',
      reduce: 'Fee reduced and approved',
      void: 'Fee voided',
      escalate: 'Dispute escalated',
    };
    showToast(`Dispute resolved: ${labels[action]}`);
  };

  const handleAddReferral = (r: ReferralRow) => {
    setReferrals((prev) => [r, ...prev]);
    setShowAddModal(false);
    showToast('Referral added successfully');
  };

  const handleGenerateAgreement = () => {
    const errors: string[] = [];
    if (!agPartner.trim()) errors.push('Partner name is required');
    if (!agFeeValue.trim()) errors.push('Fee value is required');
    if (!agEffectiveDate) errors.push('Effective date is required');
    if (!agExpirationDate) errors.push('Expiration date is required');
    if (!agSignatory.trim()) errors.push('Signatory name is required');
    if (!agFeeCap) errors.push('Fee cap confirmation is required');
    if (!agDisclosure) errors.push('Client disclosure confirmation is required');
    setAgErrors(errors);
    if (errors.length > 0) return;
    setShowAgreementModal(false);
    resetAgreementFields();
    showToast('Agreement PDF generated');
  };

  const resetAgreementFields = () => {
    setAgPartner('');
    setAgType('Referral Fee Agreement');
    setAgFeeStructure('Flat Fee');
    setAgFeeValue('');
    setAgEffectiveDate('2026-04-01');
    setAgExpirationDate('');
    setAgSignatory('');
    setAgFeeCap(false);
    setAgDisclosure(false);
    setAgErrors([]);
  };

  // Partner performance data
  const partnerPerformance = [
    {
      name: 'Meridian Capital Brokers',
      referrals: 4,
      convRate: 75,
      avgFunding: 330000,
      totalFees: 10950,
    },
    {
      name: 'Atlas Referral Network',
      referrals: 3,
      convRate: 67,
      avgFunding: 95000,
      totalFees: 4200,
    },
    {
      name: 'Westside Referral Group',
      referrals: 1,
      convRate: 0,
      avgFunding: 0,
      totalFees: 0,
    },
  ];

  const uniqueClients = Array.from(new Set(referrals.map((r) => r.clientName))).sort();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Client Selector */}
      <div className="mb-4">
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500 min-w-[260px]"
        >
          <option value="">All Clients</option>
          {uniqueClients.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Referral & Affiliate Tracking</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalReferrals} referrals &middot; {converted.length} converted
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold transition-colors"
          >
            + Add Referral
          </button>
          <button
            onClick={() => { resetAgreementFields(); setShowAgreementModal(true); }}
            className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
          >
            Generate Agreement
          </button>
        </div>
      </div>

      {/* Analytics cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Referrals</p>
          <p className="text-4xl font-black text-gray-100">{totalReferrals}</p>
          <p className="text-xs text-gray-500 mt-1">{converted.length} converted</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Conversion Rate</p>
          <p className={`text-4xl font-black ${conversionRate >= 60 ? 'text-green-400' : conversionRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
            {conversionRate}%
          </p>
          <p className="text-xs text-gray-500 mt-1">of all referrals</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Fees Paid</p>
          <p className="text-2xl font-black text-yellow-400">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalFeesPaid)}
          </p>
          <p className="text-xs text-gray-500 mt-1">settled referral fees</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pending Fees</p>
          <p className={`text-2xl font-black ${pendingFees > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(pendingFees)}
          </p>
          <p className="text-xs text-gray-500 mt-1">pending + approved</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search client or partner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
        />

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceType | '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
        >
          <option value="">All Source Types</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>{SOURCE_TYPE_CONFIG[t].label}</option>
          ))}
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as Channel | '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
        >
          <option value="">All Channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{CHANNEL_CONFIG[c].label}</option>
          ))}
        </select>

        <select
          value={feeStatusFilter}
          onChange={(e) => setFeeStatusFilter(e.target.value as FeeStatus | '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
        >
          <option value="">All Fee Statuses</option>
          {FEE_STATUSES.map((s) => (
            <option key={s} value={s}>{FEE_STATUS_CONFIG[s].label}</option>
          ))}
        </select>

        {(search || sourceFilter || channelFilter || feeStatusFilter || clientFilter) && (
          <button
            onClick={() => { setSearch(''); setSourceFilter(''); setChannelFilter(''); setFeeStatusFilter(''); setClientFilter(''); }}
            className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Attribution table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-semibold w-10">
                <input
                  type="checkbox"
                  checked={approvedDisplayed.length > 0 && selectedApproved.length === approvedDisplayed.length}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-gray-600 text-yellow-500 focus:ring-yellow-500 bg-gray-700"
                  title="Select all approved"
                />
              </th>
              <th className="text-left px-4 py-3 font-semibold">Client</th>
              <th className="text-left px-4 py-3 font-semibold">Source Type</th>
              <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Partner</th>
              <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Channel</th>
              <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Referred</th>
              <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Converted</th>
              <th className="text-right px-4 py-3 font-semibold">Fee Amount</th>
              <th className="text-left px-4 py-3 font-semibold">Fee Status</th>
              <th className="text-left px-4 py-3 font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-500">Loading...</td>
              </tr>
            )}
            {!loading && displayed.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-500">No referrals match your filters.</td>
              </tr>
            )}
            {!loading && displayed.map((r) => {
              const isFlagged = FLAGGED_PARTNERS.includes(r.partnerName);
              return (
                <tr
                  key={r.id}
                  className="bg-gray-950 hover:bg-gray-900 transition-colors group cursor-pointer"
                  onClick={() => setSelectedReferral(r)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {r.feeStatus === 'approved' ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="w-3.5 h-3.5 rounded border-gray-600 text-yellow-500 focus:ring-yellow-500 bg-gray-700"
                      />
                    ) : (
                      <span className="w-3.5 h-3.5 block" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-100 group-hover:text-white text-sm">{r.clientName}</p>
                    {r.applicationId && (
                      <p className="text-xs text-gray-500">{r.applicationId}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SOURCE_TYPE_CONFIG[r.sourceType].badgeClass}`}>
                      {SOURCE_TYPE_CONFIG[r.sourceType].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs hidden md:table-cell">
                    <span className="flex items-center gap-1.5">
                      {r.partnerName}
                      {isFlagged && (
                        <span
                          className="relative"
                          onMouseEnter={() => setHoveredFlagged(r.id)}
                          onMouseLeave={() => setHoveredFlagged(null)}
                        >
                          <span className="inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-full border bg-red-900 text-red-300 border-red-700 whitespace-nowrap">
                            &#9888; Flagged Partner
                          </span>
                          {hoveredFlagged === r.id && (
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-red-950 border border-red-700 text-red-200 text-xs whitespace-nowrap shadow-xl z-30">
                              This partner has been flagged for compliance review. Exercise caution with referrals from this source.
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                      {CHANNEL_CONFIG[r.channel].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">{formatDate(r.referredAt)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`text-xs font-semibold ${r.converted ? 'text-green-400' : 'text-gray-500'}`}>
                      {r.converted ? 'Yes' : 'No'}
                    </span>
                    {r.converted && r.fundingAmount && (
                      <p className="text-xs text-gray-500">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(r.fundingAmount)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold tabular-nums text-sm ${r.feeAmount > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                      {formatCurrency(r.feeAmount)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${FEE_STATUS_CONFIG[r.feeStatus].badgeClass}`}>
                      {FEE_STATUS_CONFIG[r.feeStatus].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
                    {r.feeStatus === 'disputed' && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenKebab(openKebab === r.id ? null : r.id);
                          }}
                          className="text-gray-500 hover:text-gray-300 text-lg font-bold px-1"
                        >
                          &#8942;
                        </button>
                        {openKebab === r.id && (
                          <div className="absolute right-0 top-8 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenKebab(null);
                                setDisputeReferral(r);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                            >
                              Resolve Dispute
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk payout floating action bar */}
      {selectedApproved.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm text-gray-300">
            <span className="text-yellow-400 font-bold">{selectedApproved.length}</span> fees selected
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-sm text-gray-300">
            <span className="text-yellow-400 font-bold">{formatCurrency(selectedTotal)}</span> total
          </span>
          <button
            onClick={() => setShowPayoutModal(true)}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold transition-colors ml-2"
          >
            Process Payout
          </button>
        </div>
      )}

      {/* Footer summary */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
        <span>Showing {displayed.length} of {totalReferrals} referrals</span>
        <span className="text-yellow-500 font-semibold">
          Filtered fees: {formatCurrency(displayed.filter((r) => r.feeStatus === 'paid').reduce((s, r) => s + r.feeAmount, 0))} paid
        </span>
      </div>

      {/* Partner Performance Section */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-white mb-4">Partner Performance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {partnerPerformance.map((p) => (
            <div key={p.name} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="text-sm font-bold text-gray-200 mb-3 truncate">{p.name}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Referrals</p>
                  <p className="text-xl font-black text-gray-100">{p.referrals}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Conv. Rate</p>
                  <p className={`text-xl font-black ${p.convRate >= 60 ? 'text-green-400' : p.convRate > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {p.convRate}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Funding</p>
                  <p className="text-sm font-bold text-gray-300">
                    {p.avgFunding > 0 ? formatCurrency(p.avgFunding) : '\u2014'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Fees</p>
                  <p className="text-sm font-bold text-yellow-400">
                    {p.totalFees > 0 ? formatCurrency(p.totalFees) : '\u2014'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* =============== MODALS =============== */}

      {/* Referral Detail Drawer */}
      {selectedReferral && (
        <ReferralDrawer
          referral={selectedReferral}
          onClose={() => setSelectedReferral(null)}
        />
      )}

      {/* Dispute Resolution Modal */}
      {disputeReferral && (
        <DisputeModal
          referral={disputeReferral}
          onClose={() => setDisputeReferral(null)}
          onSubmit={handleDisputeResolve}
        />
      )}

      {/* Add Referral Modal */}
      {showAddModal && (
        <AddReferralModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddReferral}
        />
      )}

      {/* Payout Confirmation Modal */}
      {showPayoutModal && (
        <PayoutModal
          count={selectedApproved.length}
          total={selectedTotal}
          onClose={() => setShowPayoutModal(false)}
          onConfirm={handlePayout}
        />
      )}

      {/* Agreement Generation Modal */}
      {showAgreementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Generate Referral Agreement</h2>
              <button
                onClick={() => setShowAgreementModal(false)}
                className="text-gray-500 hover:text-gray-300 text-xl font-bold transition-colors"
              >
                &times;
              </button>
            </div>

            {agErrors.length > 0 && (
              <div className="mb-4 rounded-lg border border-red-700 bg-red-900/30 p-3">
                <ul className="list-disc list-inside text-sm text-red-300 space-y-1">
                  {agErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Partner Name</label>
                <input
                  type="text"
                  placeholder="Select or type partner name"
                  value={agPartner}
                  onChange={(e) => setAgPartner(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Agreement Type</label>
                <select
                  value={agType}
                  onChange={(e) => setAgType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
                >
                  <option>Referral Fee Agreement</option>
                  <option>Affiliate Marketing Agreement</option>
                  <option>Broker Compensation Agreement</option>
                  <option>Co-Marketing Agreement</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Fee Structure</label>
                  <select
                    value={agFeeStructure}
                    onChange={(e) => setAgFeeStructure(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
                  >
                    <option>Flat Fee</option>
                    <option>% of Funded Amount</option>
                    <option>Tiered</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Fee Value</label>
                  <input
                    type="text"
                    placeholder="e.g. 2% or $1,500"
                    value={agFeeValue}
                    onChange={(e) => setAgFeeValue(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Effective Date</label>
                  <input
                    type="date"
                    value={agEffectiveDate}
                    onChange={(e) => setAgEffectiveDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Expiration Date</label>
                  <input
                    type="date"
                    value={agExpirationDate}
                    onChange={(e) => setAgExpirationDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Signatory Name</label>
                <input
                  type="text"
                  placeholder="Full name of authorized signatory"
                  value={agSignatory}
                  onChange={(e) => setAgSignatory(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    agFeeCap ? 'border-green-600 bg-green-900/30' : 'border-gray-700 bg-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={agFeeCap}
                    onChange={(e) => setAgFeeCap(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 text-green-500 focus:ring-green-500 bg-gray-700"
                  />
                  <span className={`text-sm ${agFeeCap ? 'text-green-300' : 'text-gray-400'}`}>
                    I confirm this fee does not exceed 5%
                  </span>
                </label>
                <label
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    agDisclosure ? 'border-green-600 bg-green-900/30' : 'border-gray-700 bg-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={agDisclosure}
                    onChange={(e) => setAgDisclosure(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 text-green-500 focus:ring-green-500 bg-gray-700"
                  />
                  <span className={`text-sm ${agDisclosure ? 'text-green-300' : 'text-gray-400'}`}>
                    Referral arrangement disclosed to client
                  </span>
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAgreementModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateAgreement}
                className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
              >
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
