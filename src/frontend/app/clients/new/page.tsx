'use client';

// ============================================================
// /clients/new — Smart Onboarding Wizard
// Multi-step wizard for onboarding a new client end-to-end:
//   Step 1: Business Information
//   Step 2: Owner / Principal(s)
//   Step 3: Consent Capture
//   Step 4: Suitability Assessment
//   Step 5: Review & Submit
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntityType = 'llc' | 's_corp' | 'c_corp' | 'partnership' | 'sole_proprietor' | 'corporation';

interface BusinessInfo {
  legalName: string;
  dba: string;
  ein: string;
  entityType: EntityType | '';
  stateOfFormation: string;
  dateOfFormation: string;
  annualRevenue: string;
  monthlyRevenue: string;
  employees: string;
  website: string;
  industry: string;
  mcc: string;
}

interface Owner {
  id: string;
  firstName: string;
  lastName: string;
  ownershipPercent: string;
  dateOfBirth: string;
  kycStatus: 'pending' | 'verified' | 'failed';
  personalGuarantee: boolean;
}

interface ConsentState {
  voice: boolean;
  sms: boolean;
  email: boolean;
  voiceTimestamp: string | null;
  smsTimestamp: string | null;
  emailTimestamp: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'llc', label: 'LLC' },
  { value: 's_corp', label: 'S-Corp' },
  { value: 'c_corp', label: 'C-Corp' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietor', label: 'Sole Proprietorship' },
  { value: 'corporation', label: 'Corporation' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const STEPS = ['Business Info', 'Owners', 'Consent', 'Suitability', 'Review'];

const DISCLOSURE_VOICE = 'By checking this box, you consent to receiving telephone calls, including automated calls and pre-recorded messages, from CapitalForge and its service providers at the phone number(s) provided. This consent is given under the Telephone Consumer Protection Act (TCPA). You may revoke consent at any time.';
const DISCLOSURE_SMS = 'By checking this box, you consent to receiving SMS/text messages from CapitalForge and its service providers. Message frequency varies. Message and data rates may apply. This consent is given under TCPA. Reply STOP to unsubscribe at any time.';
const DISCLOSURE_EMAIL = 'By checking this box, you consent to CapitalForge sharing your business data with partner financial institutions for the purpose of evaluating credit and funding products. You may withdraw this consent at any time by contacting support.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function emptyOwner(): Owner {
  return {
    id: generateId(),
    firstName: '',
    lastName: '',
    ownershipPercent: '',
    dateOfBirth: '',
    kycStatus: 'pending',
    personalGuarantee: false,
  };
}

function calculateBusinessAgeDays(dateStr: string): number {
  if (!dateStr) return 0;
  const formed = new Date(dateStr);
  return Math.max(0, Math.floor((Date.now() - formed.getTime()) / 86_400_000));
}

function calculateBusinessAgeYears(dateStr: string): number {
  return calculateBusinessAgeDays(dateStr) / 365.25;
}

function calculateSuitabilityScore(biz: BusinessInfo, owners: Owner[]): {
  score: number;
  breakdown: { label: string; points: number; max: number; reason: string }[];
  recommendation: 'Suitable' | 'Marginal' | 'Not Suitable';
} {
  const breakdown: { label: string; points: number; max: number; reason: string }[] = [];

  // Business age: >2yr = 30pts
  const ageYears = calculateBusinessAgeYears(biz.dateOfFormation);
  const agePoints = ageYears > 2 ? 30 : Math.round((ageYears / 2) * 30);
  breakdown.push({
    label: 'Business Age',
    points: agePoints,
    max: 30,
    reason: biz.dateOfFormation ? `${ageYears.toFixed(1)} years` : 'Not provided',
  });

  // Revenue: >$500K annual = 30pts
  const revenue = parseFloat(biz.annualRevenue) || 0;
  const revPoints = revenue >= 500_000 ? 30 : Math.round((revenue / 500_000) * 30);
  breakdown.push({
    label: 'Annual Revenue',
    points: revPoints,
    max: 30,
    reason: revenue > 0 ? `$${revenue.toLocaleString()}` : 'Not provided',
  });

  // Entity type: LLC/Corp = 20pts
  const corpTypes: string[] = ['llc', 'corporation', 's_corp', 'c_corp'];
  const entityPoints = corpTypes.includes(biz.entityType) ? 20 : 5;
  breakdown.push({
    label: 'Entity Type',
    points: entityPoints,
    max: 20,
    reason: biz.entityType ? ENTITY_OPTIONS.find((e) => e.value === biz.entityType)?.label ?? biz.entityType : 'Not selected',
  });

  // Owner verified: any owner with verified KYC = 20pts
  const hasVerified = owners.some((o) => o.kycStatus === 'verified');
  const ownerPoints = hasVerified ? 20 : 0;
  breakdown.push({
    label: 'Owner Verified (KYC)',
    points: ownerPoints,
    max: 20,
    reason: hasVerified ? 'At least one owner verified' : 'No owners verified yet',
  });

  const score = agePoints + revPoints + entityPoints + ownerPoints;
  const recommendation: 'Suitable' | 'Marginal' | 'Not Suitable' =
    score > 70 ? 'Suitable' : score >= 40 ? 'Marginal' : 'Not Suitable';

  return { score, breakdown, recommendation };
}

function formatCurrency(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// Step indicator component
// ---------------------------------------------------------------------------

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
      {steps.map((label, idx) => {
        const isComplete = idx < current;
        const isActive = idx === current;
        return (
          <div key={label} className="flex items-center gap-1 shrink-0">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-colors ${
                isComplete
                  ? 'bg-green-600 text-white'
                  : isActive
                  ? 'bg-[#C9A84C] text-[#0A1628]'
                  : 'bg-gray-800 text-gray-500 border border-gray-700'
              }`}
            >
              {isComplete ? '\u2713' : idx + 1}
            </div>
            <span
              className={`text-xs font-medium ${
                isActive ? 'text-[#C9A84C]' : isComplete ? 'text-green-400' : 'text-gray-500'
              }`}
            >
              {label}
            </span>
            {idx < steps.length - 1 && (
              <div className={`w-6 h-0.5 mx-1 ${isComplete ? 'bg-green-600' : 'bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

function Field({ label, required, children, error }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C] transition-colors';
const selectClass = inputClass;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewClientPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1: Business Info
  const [biz, setBiz] = useState<BusinessInfo>({
    legalName: '', dba: '', ein: '', entityType: '', stateOfFormation: '',
    dateOfFormation: '', annualRevenue: '', monthlyRevenue: '', employees: '',
    website: '', industry: '', mcc: '',
  });
  const [bizErrors, setBizErrors] = useState<Partial<Record<keyof BusinessInfo, string>>>({});

  // Step 2: Owners
  const [owners, setOwners] = useState<Owner[]>([emptyOwner()]);

  // Step 3: Consent
  const [consent, setConsent] = useState<ConsentState>({
    voice: false, sms: false, email: false,
    voiceTimestamp: null, smsTimestamp: null, emailTimestamp: null,
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validateStep1 = useCallback((): boolean => {
    const errs: Partial<Record<keyof BusinessInfo, string>> = {};
    if (!biz.legalName.trim()) errs.legalName = 'Legal name is required';
    if (!biz.entityType) errs.entityType = 'Entity type is required';
    if (biz.ein && !/^\d{2}-?\d{7}$/.test(biz.ein.replace(/[^0-9-]/g, ''))) {
      errs.ein = 'EIN must be XX-XXXXXXX format';
    }
    if (biz.mcc && !/^\d{4}$/.test(biz.mcc)) {
      errs.mcc = 'MCC must be exactly 4 digits';
    }
    setBizErrors(errs);
    return Object.keys(errs).length === 0;
  }, [biz]);

  const validateStep2 = useCallback((): boolean => {
    return owners.length > 0 && owners.every((o) => o.firstName.trim() && o.lastName.trim() && parseFloat(o.ownershipPercent) > 0);
  }, [owners]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const canNext = useMemo(() => {
    switch (step) {
      case 0: return biz.legalName.trim() && biz.entityType;
      case 1: return validateStep2();
      case 2: return true; // consent is optional but captured
      case 3: return true; // suitability is informational
      case 4: return true;
      default: return false;
    }
  }, [step, biz, validateStep2]);

  const goNext = () => {
    if (step === 0 && !validateStep1()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const goBack = () => { if (step > 0) setStep(step - 1); };

  // ---------------------------------------------------------------------------
  // Suitability
  // ---------------------------------------------------------------------------

  const suitability = useMemo(() => calculateSuitabilityScore(biz, owners), [biz, owners]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // POST to create business + owners + consent in one call
      const payload = {
        legalName: biz.legalName.trim(),
        dba: biz.dba.trim() || undefined,
        ein: biz.ein.trim() || undefined,
        entityType: biz.entityType,
        stateOfFormation: biz.stateOfFormation || undefined,
        dateOfFormation: biz.dateOfFormation || undefined,
        industry: biz.industry.trim() || undefined,
        mcc: biz.mcc.trim() || undefined,
        annualRevenue: biz.annualRevenue ? parseFloat(biz.annualRevenue) : undefined,
        monthlyRevenue: biz.monthlyRevenue ? parseFloat(biz.monthlyRevenue) : undefined,
      };

      // Create business
      const bizRes = await apiClient.post<{ business: { id: string } }>('/businesses', payload);
      const businessId = bizRes.data?.business?.id;

      if (!businessId) {
        throw new Error('Failed to create business — no ID returned');
      }

      // Create owners
      for (const owner of owners) {
        await apiClient.post(`/businesses/${businessId}/owners`, {
          firstName: owner.firstName.trim(),
          lastName: owner.lastName.trim(),
          ownershipPercent: parseFloat(owner.ownershipPercent),
          dateOfBirth: owner.dateOfBirth || undefined,
          isBeneficialOwner: true,
        });
      }

      // Create consent records
      const consentChannels: { channel: string; consentType: string; timestamp: string | null }[] = [];
      if (consent.voice) consentChannels.push({ channel: 'voice', consentType: 'tcpa', timestamp: consent.voiceTimestamp });
      if (consent.sms) consentChannels.push({ channel: 'sms', consentType: 'tcpa', timestamp: consent.smsTimestamp });
      if (consent.email) consentChannels.push({ channel: 'email', consentType: 'data_sharing', timestamp: consent.emailTimestamp });

      for (const c of consentChannels) {
        try {
          await apiClient.post(`/businesses/${businessId}/consent`, {
            channel: c.channel,
            consentType: c.consentType,
            metadata: { method: 'Captured via web form', capturedAt: c.timestamp },
          });
        } catch {
          // consent creation is best-effort during onboarding
        }
      }

      // Create suitability check
      try {
        await apiClient.post(`/businesses/${businessId}/suitability`, {
          score: suitability.score,
          recommendation: suitability.recommendation.toLowerCase().replace(/\s+/g, '_'),
          maxSafeLeverage: suitability.score > 70 ? 3.0 : suitability.score >= 40 ? 1.5 : 0,
        });
      } catch {
        // suitability is best-effort
      }

      // Redirect to client detail
      router.push(`/clients/${businessId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const updateBiz = (field: keyof BusinessInfo, value: string) => {
    setBiz((prev) => ({ ...prev, [field]: value }));
    if (bizErrors[field]) setBizErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const updateOwner = (id: string, field: keyof Owner, value: unknown) => {
    setOwners((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  };

  const toggleConsent = (channel: 'voice' | 'sms' | 'email') => {
    setConsent((prev) => ({
      ...prev,
      [channel]: !prev[channel],
      [`${channel}Timestamp`]: !prev[channel] ? new Date().toISOString() : null,
    }));
  };

  // ---------------------------------------------------------------------------
  // Step renders
  // ---------------------------------------------------------------------------

  const renderStep1 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white mb-1">Business Information</h2>
      <p className="text-sm text-gray-400 mb-4">Enter the core details about the business entity.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Legal Name" required error={bizErrors.legalName}>
          <input className={inputClass} value={biz.legalName} onChange={(e) => updateBiz('legalName', e.target.value)} placeholder="Acme Holdings LLC" />
        </Field>
        <Field label="DBA (Doing Business As)">
          <input className={inputClass} value={biz.dba} onChange={(e) => updateBiz('dba', e.target.value)} placeholder="Acme" />
        </Field>
        <Field label="EIN" error={bizErrors.ein}>
          <input className={inputClass} value={biz.ein} onChange={(e) => updateBiz('ein', e.target.value)} placeholder="12-3456789" />
        </Field>
        <Field label="Entity Type" required error={bizErrors.entityType}>
          <select className={selectClass} value={biz.entityType} onChange={(e) => updateBiz('entityType', e.target.value)}>
            <option value="">Select entity type</option>
            {ENTITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="State of Formation">
          <select className={selectClass} value={biz.stateOfFormation} onChange={(e) => updateBiz('stateOfFormation', e.target.value)}>
            <option value="">Select state</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Date of Formation">
          <input type="date" className={inputClass} value={biz.dateOfFormation} onChange={(e) => updateBiz('dateOfFormation', e.target.value)} />
        </Field>
        <Field label="Annual Revenue ($)">
          <input type="number" className={inputClass} value={biz.annualRevenue} onChange={(e) => updateBiz('annualRevenue', e.target.value)} placeholder="500000" />
        </Field>
        <Field label="Monthly Revenue ($)">
          <input type="number" className={inputClass} value={biz.monthlyRevenue} onChange={(e) => updateBiz('monthlyRevenue', e.target.value)} placeholder="42000" />
        </Field>
        <Field label="Number of Employees">
          <input type="number" className={inputClass} value={biz.employees} onChange={(e) => updateBiz('employees', e.target.value)} placeholder="15" />
        </Field>
        <Field label="Website">
          <input type="url" className={inputClass} value={biz.website} onChange={(e) => updateBiz('website', e.target.value)} placeholder="https://example.com" />
        </Field>
        <Field label="Industry">
          <input className={inputClass} value={biz.industry} onChange={(e) => updateBiz('industry', e.target.value)} placeholder="e.g. Construction, Retail, Healthcare" />
        </Field>
        <Field label="MCC Code" error={bizErrors.mcc}>
          <input className={inputClass} value={biz.mcc} onChange={(e) => updateBiz('mcc', e.target.value)} placeholder="5411" maxLength={4} />
        </Field>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Owners / Principals</h2>
          <p className="text-sm text-gray-400">Add all beneficial owners with 25%+ ownership.</p>
        </div>
        <button
          onClick={() => setOwners((prev) => [...prev, emptyOwner()])}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
        >
          + Add Owner
        </button>
      </div>

      {owners.map((owner, idx) => (
        <div key={owner.id} className="rounded-xl border border-gray-700 bg-gray-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200">Owner {idx + 1}</h3>
            {owners.length > 1 && (
              <button
                onClick={() => setOwners((prev) => prev.filter((o) => o.id !== owner.id))}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="First Name" required>
              <input className={inputClass} value={owner.firstName} onChange={(e) => updateOwner(owner.id, 'firstName', e.target.value)} placeholder="John" />
            </Field>
            <Field label="Last Name" required>
              <input className={inputClass} value={owner.lastName} onChange={(e) => updateOwner(owner.id, 'lastName', e.target.value)} placeholder="Smith" />
            </Field>
            <Field label="Ownership %" required>
              <input type="number" className={inputClass} value={owner.ownershipPercent} onChange={(e) => updateOwner(owner.id, 'ownershipPercent', e.target.value)} placeholder="51" min={0.01} max={100} step={0.01} />
            </Field>
            <Field label="Date of Birth">
              <input type="date" className={inputClass} value={owner.dateOfBirth} onChange={(e) => updateOwner(owner.id, 'dateOfBirth', e.target.value)} />
            </Field>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">KYC Status:</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                owner.kycStatus === 'verified'
                  ? 'bg-green-900 text-green-300 border-green-700'
                  : owner.kycStatus === 'failed'
                  ? 'bg-red-900 text-red-300 border-red-700'
                  : 'bg-yellow-900 text-yellow-300 border-yellow-700'
              }`}>
                {owner.kycStatus.charAt(0).toUpperCase() + owner.kycStatus.slice(1)}
              </span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={owner.personalGuarantee}
                onChange={(e) => updateOwner(owner.id, 'personalGuarantee', e.target.checked)}
                className="rounded border-gray-600 bg-gray-800 text-[#C9A84C] focus:ring-[#C9A84C] focus:ring-offset-0"
              />
              <span className="text-sm text-gray-300">Personal guarantee</span>
            </label>
          </div>
        </div>
      ))}

      {!validateStep2() && owners.length > 0 && (
        <p className="text-xs text-amber-400">All owners must have a first name, last name, and ownership percentage.</p>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white mb-1">Consent Capture</h2>
      <p className="text-sm text-gray-400 mb-4">Capture client consent for communication channels. Method: Captured via web form.</p>

      {/* Voice TCPA */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent.voice}
            onChange={() => toggleConsent('voice')}
            className="mt-1 rounded border-gray-600 bg-gray-800 text-[#C9A84C] focus:ring-[#C9A84C] focus:ring-offset-0"
          />
          <div>
            <p className="text-sm font-semibold text-gray-200 mb-1">Voice (TCPA Consent)</p>
            <p className="text-xs text-gray-400 leading-relaxed">{DISCLOSURE_VOICE}</p>
            {consent.voiceTimestamp && (
              <p className="text-xs text-green-400 mt-2">Captured: {new Date(consent.voiceTimestamp).toLocaleString()}</p>
            )}
          </div>
        </label>
      </div>

      {/* SMS TCPA */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent.sms}
            onChange={() => toggleConsent('sms')}
            className="mt-1 rounded border-gray-600 bg-gray-800 text-[#C9A84C] focus:ring-[#C9A84C] focus:ring-offset-0"
          />
          <div>
            <p className="text-sm font-semibold text-gray-200 mb-1">SMS (TCPA Consent)</p>
            <p className="text-xs text-gray-400 leading-relaxed">{DISCLOSURE_SMS}</p>
            {consent.smsTimestamp && (
              <p className="text-xs text-green-400 mt-2">Captured: {new Date(consent.smsTimestamp).toLocaleString()}</p>
            )}
          </div>
        </label>
      </div>

      {/* Email data sharing */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent.email}
            onChange={() => toggleConsent('email')}
            className="mt-1 rounded border-gray-600 bg-gray-800 text-[#C9A84C] focus:ring-[#C9A84C] focus:ring-offset-0"
          />
          <div>
            <p className="text-sm font-semibold text-gray-200 mb-1">Email (Data Sharing Consent)</p>
            <p className="text-xs text-gray-400 leading-relaxed">{DISCLOSURE_EMAIL}</p>
            {consent.emailTimestamp && (
              <p className="text-xs text-green-400 mt-2">Captured: {new Date(consent.emailTimestamp).toLocaleString()}</p>
            )}
          </div>
        </label>
      </div>
    </div>
  );

  const renderStep4 = () => {
    const recColor =
      suitability.recommendation === 'Suitable' ? 'text-green-400' :
      suitability.recommendation === 'Marginal' ? 'text-yellow-400' : 'text-red-400';

    const recBg =
      suitability.recommendation === 'Suitable' ? 'bg-green-900/30 border-green-700' :
      suitability.recommendation === 'Marginal' ? 'bg-yellow-900/30 border-yellow-700' : 'bg-red-900/30 border-red-700';

    return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-white mb-1">Suitability Assessment</h2>
        <p className="text-sm text-gray-400 mb-4">Auto-calculated based on business information and owner verification status.</p>

        {/* Score display */}
        <div className={`rounded-xl border p-6 text-center ${recBg}`}>
          <p className="text-sm text-gray-400 mb-1">Suitability Score</p>
          <p className={`text-5xl font-extrabold ${recColor}`}>{suitability.score}</p>
          <p className="text-sm text-gray-400 mt-1">out of 100</p>
          <p className={`text-lg font-bold mt-3 ${recColor}`}>{suitability.recommendation}</p>
        </div>

        {/* Breakdown */}
        <div className="space-y-3">
          {suitability.breakdown.map((item) => (
            <div key={item.label} className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-200">{item.label}</span>
                <span className="text-sm font-bold text-white">{item.points} / {item.max}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden mb-1">
                <div
                  className="h-full rounded-full bg-[#C9A84C] transition-all"
                  style={{ width: `${(item.points / item.max) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{item.reason}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStep5 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white mb-1">Review & Submit</h2>
      <p className="text-sm text-gray-400 mb-4">Review all information before creating the client.</p>

      {/* Business summary */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-5">
        <h3 className="text-sm font-semibold text-[#C9A84C] mb-3 uppercase tracking-wide">Business Information</h3>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-gray-500">Legal Name</dt><dd className="text-gray-200 font-medium">{biz.legalName}</dd></div>
          {biz.dba && <div><dt className="text-gray-500">DBA</dt><dd className="text-gray-200">{biz.dba}</dd></div>}
          {biz.ein && <div><dt className="text-gray-500">EIN</dt><dd className="text-gray-200">{biz.ein}</dd></div>}
          <div><dt className="text-gray-500">Entity Type</dt><dd className="text-gray-200">{ENTITY_OPTIONS.find((e) => e.value === biz.entityType)?.label}</dd></div>
          {biz.stateOfFormation && <div><dt className="text-gray-500">State</dt><dd className="text-gray-200">{biz.stateOfFormation}</dd></div>}
          {biz.dateOfFormation && <div><dt className="text-gray-500">Date of Formation</dt><dd className="text-gray-200">{biz.dateOfFormation}</dd></div>}
          {biz.annualRevenue && <div><dt className="text-gray-500">Annual Revenue</dt><dd className="text-gray-200">{formatCurrency(biz.annualRevenue)}</dd></div>}
          {biz.monthlyRevenue && <div><dt className="text-gray-500">Monthly Revenue</dt><dd className="text-gray-200">{formatCurrency(biz.monthlyRevenue)}</dd></div>}
          {biz.industry && <div><dt className="text-gray-500">Industry</dt><dd className="text-gray-200">{biz.industry}</dd></div>}
          {biz.mcc && <div><dt className="text-gray-500">MCC</dt><dd className="text-gray-200">{biz.mcc}</dd></div>}
        </dl>
      </div>

      {/* Owners summary */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-5">
        <h3 className="text-sm font-semibold text-[#C9A84C] mb-3 uppercase tracking-wide">Owners ({owners.length})</h3>
        <div className="space-y-2">
          {owners.map((o, idx) => (
            <div key={o.id} className="flex items-center justify-between text-sm border-b border-gray-800 pb-2 last:border-0 last:pb-0">
              <span className="text-gray-200">{o.firstName} {o.lastName} <span className="text-gray-500">({o.ownershipPercent}%)</span></span>
              <div className="flex items-center gap-3">
                {o.personalGuarantee && <span className="text-xs text-amber-400">PG</span>}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  o.kycStatus === 'verified' ? 'bg-green-900 text-green-300 border-green-700' : 'bg-yellow-900 text-yellow-300 border-yellow-700'
                }`}>
                  KYC: {o.kycStatus}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Consent summary */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-5">
        <h3 className="text-sm font-semibold text-[#C9A84C] mb-3 uppercase tracking-wide">Consent</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          {(['voice', 'sms', 'email'] as const).map((ch) => (
            <div key={ch} className="text-center">
              <p className="text-gray-400 capitalize mb-1">{ch}</p>
              <p className={consent[ch] ? 'text-green-400 font-semibold' : 'text-gray-600'}>{consent[ch] ? 'Granted' : 'Not granted'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Suitability summary */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-5">
        <h3 className="text-sm font-semibold text-[#C9A84C] mb-3 uppercase tracking-wide">Suitability</h3>
        <div className="flex items-center gap-4">
          <span className={`text-3xl font-extrabold ${
            suitability.recommendation === 'Suitable' ? 'text-green-400' :
            suitability.recommendation === 'Marginal' ? 'text-yellow-400' : 'text-red-400'
          }`}>{suitability.score}/100</span>
          <span className={`text-sm font-bold ${
            suitability.recommendation === 'Suitable' ? 'text-green-400' :
            suitability.recommendation === 'Marginal' ? 'text-yellow-400' : 'text-red-400'
          }`}>{suitability.recommendation}</span>
        </div>
      </div>

      {submitError && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 p-4 text-sm text-red-300">
          {submitError}
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 md:p-10">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/clients')}
          className="text-sm text-gray-400 hover:text-white transition mb-4 inline-flex items-center gap-1"
        >
          &larr; Back to Clients
        </button>
        <h1 className="text-2xl font-bold tracking-tight">New Client Onboarding</h1>
        <p className="text-gray-400 mt-1">
          Complete all steps to onboard a new business client into CapitalForge.
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} steps={STEPS} />

      {/* Step content */}
      <div className="max-w-4xl">
        {step === 0 && renderStep1()}
        {step === 1 && renderStep2()}
        {step === 2 && renderStep3()}
        {step === 3 && renderStep4()}
        {step === 4 && renderStep5()}
      </div>

      {/* Navigation */}
      <div className="max-w-4xl flex items-center justify-between mt-8 pt-6 border-t border-gray-800">
        <button
          onClick={goBack}
          disabled={step === 0}
          className="px-5 py-2.5 rounded-lg border border-gray-700 text-sm font-semibold text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={goNext}
            disabled={!canNext}
            className="px-5 py-2.5 rounded-lg bg-[#C9A84C] text-[#0A1628] text-sm font-bold hover:bg-[#D4B65E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-bold transition-colors disabled:opacity-60"
          >
            {submitting ? 'Creating Client...' : 'Create Client'}
          </button>
        )}
      </div>
    </div>
  );
}
