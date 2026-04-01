'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FocusTrap } from '@/components/ui/focus-trap';

// ─── Entity & State options ──────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: 'llc',             label: 'LLC' },
  { value: 'corporation',     label: 'Corporation' },
  { value: 'sole_proprietor', label: 'Sole Proprietor' },
  { value: 'partnership',     label: 'Partnership' },
  { value: 's_corp',          label: 'S-Corp' },
  { value: 'c_corp',          label: 'C-Corp' },
] as const;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EditProfileClient {
  id: string;
  legalName: string;
  entityType: string;
  stateOfFormation: string;
  annualRevenue: number;
  employees: number;
  website: string;
  industry: string;
  naicsCode: string;
  mcc: string;
}

export interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: EditProfileClient;
  onSave: (updated: Partial<EditProfileClient>) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FormErrors {
  legalName?: string;
  annualRevenue?: string;
}

function validate(values: EditProfileClient): FormErrors {
  const errors: FormErrors = {};
  if (!values.legalName.trim()) {
    errors.legalName = 'Legal Name is required';
  }
  if (values.annualRevenue <= 0 || isNaN(values.annualRevenue)) {
    errors.annualRevenue = 'Annual Revenue must be a positive number';
  }
  return errors;
}

function getChangedFields(
  original: EditProfileClient,
  current: EditProfileClient,
): Partial<EditProfileClient> {
  const changed: Partial<EditProfileClient> = {};
  for (const key of Object.keys(original) as (keyof EditProfileClient)[]) {
    if (key === 'id') continue;
    if (original[key] !== current[key]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (changed as any)[key] = current[key];
    }
  }
  return changed;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EditProfileModal({ isOpen, onClose, client, onSave }: EditProfileModalProps) {
  const [form, setForm] = useState<EditProfileClient>(client);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset form when client prop changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setForm(client);
      setErrors({});
      setSaving(false);
    }
  }, [isOpen, client]);

  // Prevent body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const handleChange = useCallback(
    (field: keyof EditProfileClient, value: string | number) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear field error on change
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const changed = getChangedFields(client, form);
    if (Object.keys(changed).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(changed);
    } finally {
      setSaving(false);
    }
  }, [form, client, onSave, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-label="Edit Client Profile"
      >
        {/* Panel */}
        <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Edit Client Profile</h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-surface-overlay hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">
            {/* Legal Name */}
            <div>
              <label htmlFor="epm-legalName" className="cf-label">Legal Name *</label>
              <input
                id="epm-legalName"
                type="text"
                className={`cf-input ${errors.legalName ? 'ring-2 ring-red-400 border-red-400' : ''}`}
                value={form.legalName}
                onChange={(e) => handleChange('legalName', e.target.value)}
              />
              {errors.legalName && <p className="mt-1 text-xs text-red-500">{errors.legalName}</p>}
            </div>

            {/* Entity Type & State of Formation — side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="epm-entityType" className="cf-label">Entity Type</label>
                <select
                  id="epm-entityType"
                  className="cf-input"
                  value={form.entityType}
                  onChange={(e) => handleChange('entityType', e.target.value)}
                >
                  <option value="">Select...</option>
                  {ENTITY_TYPES.map((et) => (
                    <option key={et.value} value={et.value}>{et.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="epm-stateOfFormation" className="cf-label">State of Formation</label>
                <select
                  id="epm-stateOfFormation"
                  className="cf-input"
                  value={form.stateOfFormation}
                  onChange={(e) => handleChange('stateOfFormation', e.target.value)}
                >
                  <option value="">Select...</option>
                  {US_STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Annual Revenue & Employees — side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="epm-annualRevenue" className="cf-label">Annual Revenue *</label>
                <input
                  id="epm-annualRevenue"
                  type="number"
                  min="0"
                  step="1000"
                  className={`cf-input ${errors.annualRevenue ? 'ring-2 ring-red-400 border-red-400' : ''}`}
                  value={form.annualRevenue}
                  onChange={(e) => handleChange('annualRevenue', parseFloat(e.target.value) || 0)}
                />
                {errors.annualRevenue && <p className="mt-1 text-xs text-red-500">{errors.annualRevenue}</p>}
              </div>
              <div>
                <label htmlFor="epm-employees" className="cf-label">Employees</label>
                <input
                  id="epm-employees"
                  type="number"
                  min="0"
                  className="cf-input"
                  value={form.employees}
                  onChange={(e) => handleChange('employees', parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>

            {/* Website */}
            <div>
              <label htmlFor="epm-website" className="cf-label">Website</label>
              <input
                id="epm-website"
                type="url"
                className="cf-input"
                placeholder="https://example.com"
                value={form.website}
                onChange={(e) => handleChange('website', e.target.value)}
              />
            </div>

            {/* Industry, NAICS, MCC — three columns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="epm-industry" className="cf-label">Industry</label>
                <input
                  id="epm-industry"
                  type="text"
                  className="cf-input"
                  value={form.industry}
                  onChange={(e) => handleChange('industry', e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="epm-naicsCode" className="cf-label">NAICS Code</label>
                <input
                  id="epm-naicsCode"
                  type="text"
                  className="cf-input"
                  value={form.naicsCode}
                  onChange={(e) => handleChange('naicsCode', e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="epm-mcc" className="cf-label">MCC</label>
                <input
                  id="epm-mcc"
                  type="text"
                  className="cf-input"
                  value={form.mcc}
                  onChange={(e) => handleChange('mcc', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-surface-border px-6 py-4">
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}

export default EditProfileModal;
