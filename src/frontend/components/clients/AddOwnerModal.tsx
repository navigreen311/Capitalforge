'use client';

// ============================================================
// Add Owner — the form behind the "+ Add Owner" button
//
// The button existed and had no onClick. There was no modal to open: no
// component, no state, no form. Clicking it did nothing because nothing had
// been built, which is why it produced no error either.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { FocusTrap } from '@/components/ui/focus-trap';
import { loadJson, toLoadError } from '@/lib/load-json';
import { totalOwnership, type OwnerRow } from '@/lib/owner-view';

interface AddOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  /** Owners already on file — used to check the total does not exceed 100%. */
  existingOwners: readonly OwnerRow[];
  /** Called after a successful save so the section can re-read. */
  onSaved: () => void;
}

interface OwnerForm {
  firstName: string;
  lastName: string;
  title: string;
  ownershipPercent: string;
  dateOfBirth: string;
  ssnLast4: string;
  personalGuarantee: boolean;
}

const EMPTY: OwnerForm = {
  firstName: '',
  lastName: '',
  title: '',
  ownershipPercent: '',
  dateOfBirth: '',
  ssnLast4: '',
  personalGuarantee: false,
};

type FieldErrors = Partial<Record<keyof OwnerForm, string>>;

export function validateOwner(
  form: OwnerForm,
  existingTotal: number,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.firstName.trim()) errors.firstName = 'First name is required';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required';

  const pct = Number(form.ownershipPercent);
  if (!form.ownershipPercent.trim() || Number.isNaN(pct)) {
    errors.ownershipPercent = 'Ownership % is required';
  } else if (pct <= 0 || pct > 100) {
    errors.ownershipPercent = 'Ownership must be between 0.01 and 100';
  } else if (existingTotal + pct > 100.0001) {
    // Tolerance absorbs floating-point noise on values like 33.33 × 3.
    errors.ownershipPercent =
      `Owners already account for ${existingTotal}%. Adding ${pct}% would exceed 100%.`;
  }

  if (form.ssnLast4 && !/^\d{4}$/.test(form.ssnLast4.trim())) {
    errors.ssnLast4 = 'Enter exactly the last four digits';
  }

  if (form.dateOfBirth) {
    const dob = new Date(form.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      errors.dateOfBirth = 'Not a real date';
    } else {
      // Mirrors the API, which refuses an owner outside this range rather
      // than recording one.
      const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 18 || age > 120) errors.dateOfBirth = 'Owner must be between 18 and 120 years old';
    }
  }

  return errors;
}

export function AddOwnerModal({
  isOpen,
  onClose,
  clientId,
  existingOwners,
  onSaved,
}: AddOwnerModalProps) {
  const [form, setForm] = useState<OwnerForm>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const existingTotal = totalOwnership(existingOwners);

  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY);
      setErrors({});
      setSaveError(null);
      setSaving(false);
    }
  }, [isOpen]);

  const change = useCallback(
    (field: keyof OwnerForm, value: string | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    },
    [],
  );

  const save = useCallback(async () => {
    const errs = validateOwner(form, existingTotal);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      // POST /api/businesses/:id/owners — the route the onboarding wizard
      // uses. The client-detail router only exposes a GET for owners.
      await loadJson(`/api/businesses/${encodeURIComponent(clientId)}/owners`, {
        method: 'POST',
        body: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          title: form.title.trim() || undefined,
          ownershipPercent: Number(form.ownershipPercent),
          dateOfBirth: form.dateOfBirth || undefined,
          ssnLast4: form.ssnLast4.trim() || undefined,
          personalGuarantee: form.personalGuarantee,
          isBeneficialOwner: true,
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      const info = toLoadError(e);
      setSaveError(
        info.type === 'auth_required'
          ? 'Your session has ended. Sign in again, then add the owner.'
          : info.type === 'network_error'
            ? 'Could not reach the server, so the owner was not added.'
            : `The owner was not added. ${info.message}`,
      );
    } finally {
      setSaving(false);
    }
  }, [form, existingTotal, clientId, onSaved, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <FocusTrap active={isOpen}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add Owner"
          className="w-full max-w-lg rounded-2xl border border-surface-border bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Add Owner</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <p className="text-xs text-gray-500">
              Owners on file account for {existingTotal}% of this business.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="aom-firstName" className="cf-label">First Name *</label>
                <input
                  id="aom-firstName"
                  type="text"
                  className={`cf-input ${errors.firstName ? 'ring-2 ring-red-400' : ''}`}
                  value={form.firstName}
                  onChange={(e) => change('firstName', e.target.value)}
                />
                {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}
              </div>
              <div>
                <label htmlFor="aom-lastName" className="cf-label">Last Name *</label>
                <input
                  id="aom-lastName"
                  type="text"
                  className={`cf-input ${errors.lastName ? 'ring-2 ring-red-400' : ''}`}
                  value={form.lastName}
                  onChange={(e) => change('lastName', e.target.value)}
                />
                {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="aom-title" className="cf-label">Title / Role</label>
                <input
                  id="aom-title"
                  type="text"
                  placeholder="CEO"
                  className="cf-input"
                  value={form.title}
                  onChange={(e) => change('title', e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="aom-ownershipPercent" className="cf-label">Ownership % *</label>
                <input
                  id="aom-ownershipPercent"
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  className={`cf-input ${errors.ownershipPercent ? 'ring-2 ring-red-400' : ''}`}
                  value={form.ownershipPercent}
                  onChange={(e) => change('ownershipPercent', e.target.value)}
                />
                {errors.ownershipPercent && (
                  <p className="mt-1 text-xs text-red-500">{errors.ownershipPercent}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="aom-dateOfBirth" className="cf-label">Date of Birth</label>
                <input
                  id="aom-dateOfBirth"
                  type="date"
                  className={`cf-input ${errors.dateOfBirth ? 'ring-2 ring-red-400' : ''}`}
                  value={form.dateOfBirth}
                  onChange={(e) => change('dateOfBirth', e.target.value)}
                />
                {errors.dateOfBirth && <p className="mt-1 text-xs text-red-500">{errors.dateOfBirth}</p>}
              </div>
              <div>
                <label htmlFor="aom-ssnLast4" className="cf-label">SSN (last 4)</label>
                <input
                  id="aom-ssnLast4"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="1234"
                  className={`cf-input ${errors.ssnLast4 ? 'ring-2 ring-red-400' : ''}`}
                  value={form.ssnLast4}
                  onChange={(e) => change('ssnLast4', e.target.value)}
                />
                {errors.ssnLast4 && <p className="mt-1 text-xs text-red-500">{errors.ssnLast4}</p>}
                <p className="mt-1 text-xs text-gray-500">
                  Only the last four are stored.
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.personalGuarantee}
                onChange={(e) => change('personalGuarantee', e.target.checked)}
                className="rounded border-gray-400"
              />
              <span className="text-sm text-gray-700">Personal guarantee</span>
            </label>
          </div>

          {saveError && (
            <div role="alert" className="mx-6 mb-1 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-surface-border px-6 py-4">
            <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Adding…' : 'Add Owner'}
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
