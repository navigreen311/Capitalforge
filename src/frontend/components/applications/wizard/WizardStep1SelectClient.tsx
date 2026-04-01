'use client';

// ============================================================
// WizardStep1SelectClient — Step 1 of the new-application wizard.
//
// Client selection with search/autocomplete, summary card,
// and compliance pre-check gate before proceeding.
// ============================================================

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SectionCard } from '@/components/ui/card';

// ── Types ───────────────────────────────────────────────────────────────────

interface WizardStep1Props {
  selectedClientId: string;
  onClientSelect: (clientId: string, clientName: string) => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onCancel: () => void;
}

interface PlaceholderClient {
  id: string;
  legalName: string;
  status: 'active' | 'pending' | 'inactive';
  entityType: string;
  stateOfFormation: string;
  advisorName: string;
  readinessScore: number;
  suitabilityScore: number;
  maxSafeLeverage: string;
}

type ComplianceStatus = 'pass' | 'warning';

interface ComplianceItem {
  id: string;
  label: string;
  status: ComplianceStatus;
  detail: string;
  /** If true, blocks the Next button when status !== 'pass' */
  critical: boolean;
  actionLabel?: string;
}

// ── Placeholder Data ────────────────────────────────────────────────────────

const CLIENTS: PlaceholderClient[] = [
  {
    id: 'cl_001',
    legalName: 'Apex Ventures LLC',
    status: 'active',
    entityType: 'LLC',
    stateOfFormation: 'Delaware',
    advisorName: 'Sarah Chen',
    readinessScore: 92,
    suitabilityScore: 88,
    maxSafeLeverage: '$250,000',
  },
  {
    id: 'cl_002',
    legalName: 'NovaGo Solutions Inc.',
    status: 'active',
    entityType: 'Corporation',
    stateOfFormation: 'California',
    advisorName: 'Marcus Rivera',
    readinessScore: 85,
    suitabilityScore: 79,
    maxSafeLeverage: '$175,000',
  },
  {
    id: 'cl_003',
    legalName: 'Meridian Holdings LLC',
    status: 'active',
    entityType: 'LLC',
    stateOfFormation: 'New York',
    advisorName: 'Sarah Chen',
    readinessScore: 78,
    suitabilityScore: 82,
    maxSafeLeverage: '$320,000',
  },
  {
    id: 'cl_004',
    legalName: 'Brightline Corp',
    status: 'pending',
    entityType: 'Corporation',
    stateOfFormation: 'Texas',
    advisorName: 'James Park',
    readinessScore: 64,
    suitabilityScore: 71,
    maxSafeLeverage: '$100,000',
  },
  {
    id: 'cl_005',
    legalName: 'Thornwood Capital',
    status: 'active',
    entityType: 'LP',
    stateOfFormation: 'Illinois',
    advisorName: 'Marcus Rivera',
    readinessScore: 90,
    suitabilityScore: 94,
    maxSafeLeverage: '$500,000',
  },
];

function buildComplianceChecks(_clientId: string): ComplianceItem[] {
  return [
    {
      id: 'tcpa-voice',
      label: 'TCPA Voice Consent',
      status: 'pass',
      detail: 'Granted Jan 9, 2026',
      critical: true,
    },
    {
      id: 'product-reality',
      label: 'Product-Reality Acknowledgment',
      status: 'pass',
      detail: 'Signed Jan 9, 2026',
      critical: true,
    },
    {
      id: 'kyb-verified',
      label: 'KYB Verified',
      status: 'pass',
      detail: 'Verified',
      critical: true,
    },
    {
      id: 'cash-advance-ack',
      label: 'Cash-Advance Restriction Ack',
      status: 'warning',
      detail: 'NOT SIGNED',
      critical: true,
      actionLabel: 'Request Signature',
    },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PlaceholderClient['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  inactive: 'bg-gray-100 text-gray-500 border-gray-200',
};

function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

// ── Component ───────────────────────────────────────────────────────────────

export default function WizardStep1SelectClient({
  selectedClientId,
  onClientSelect,
  onNext,
  onSaveDraft,
  onCancel,
}: WizardStep1Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Derived state ──────────────────────────────────────────
  const selectedClient = useMemo(
    () => CLIENTS.find((c) => c.id === selectedClientId) ?? null,
    [selectedClientId],
  );

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return CLIENTS;
    const q = searchQuery.toLowerCase();
    return CLIENTS.filter(
      (c) =>
        c.legalName.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const complianceChecks = useMemo(
    () => (selectedClient ? buildComplianceChecks(selectedClient.id) : []),
    [selectedClient],
  );

  const hasCriticalMissing = complianceChecks.some(
    (c) => c.critical && c.status !== 'pass',
  );

  // ── Close dropdown on outside click ────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Handlers ───────────────────────────────────────────────
  function handleSelectClient(client: PlaceholderClient) {
    onClientSelect(client.id, client.legalName);
    setSearchQuery(client.legalName);
    setShowDropdown(false);
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Step header ──────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Step 1 &mdash; Select Client
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose a client for this application. Compliance requirements will be
          verified automatically.
        </p>
      </div>

      {/* ── Search input ─────────────────────────────────────── */}
      <div className="relative" ref={dropdownRef}>
        <label htmlFor="client-search" className="cf-label">
          Client
        </label>
        <input
          id="client-search"
          type="text"
          placeholder="Search clients..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="cf-input"
          autoComplete="off"
        />

        {/* Dropdown */}
        {showDropdown && filteredClients.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-surface-border bg-white shadow-lg">
            {filteredClients.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => handleSelectClient(client)}
                  className={`w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors flex items-center justify-between ${
                    client.id === selectedClientId
                      ? 'bg-indigo-50 font-medium'
                      : ''
                  }`}
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {client.legalName}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {client.id}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[client.status]}`}
                  >
                    {client.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {showDropdown && filteredClients.length === 0 && searchQuery.trim() && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-surface-border bg-white shadow-lg px-4 py-3 text-sm text-gray-500">
            No clients match &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </div>

      {/* ── Client summary card ──────────────────────────────── */}
      {selectedClient && (
        <SectionCard title="Client Summary">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Legal Name</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                {selectedClient.legalName}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
              <span
                className={`mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[selectedClient.status]}`}
              >
                {selectedClient.status}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Entity Type</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">
                {selectedClient.entityType}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">State</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">
                {selectedClient.stateOfFormation}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Advisor</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">
                {selectedClient.advisorName}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Readiness Score
              </p>
              <p
                className={`text-sm font-bold mt-0.5 ${scoreColorClass(selectedClient.readinessScore)}`}
              >
                {selectedClient.readinessScore}/100
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Suitability Score
              </p>
              <p
                className={`text-sm font-bold mt-0.5 ${scoreColorClass(selectedClient.suitabilityScore)}`}
              >
                {selectedClient.suitabilityScore}/100
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Max Safe Leverage
              </p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {selectedClient.maxSafeLeverage}
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Compliance pre-check ─────────────────────────────── */}
      {selectedClient && (
        <SectionCard title="Compliance Pre-Check">
          <div className="space-y-3">
            {complianceChecks.map((check) => (
              <div
                key={check.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                  check.status === 'pass'
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-base flex-shrink-0" aria-hidden="true">
                    {check.status === 'pass' ? '\u2705' : '\u26A0\uFE0F'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {check.label}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${
                        check.status === 'pass'
                          ? 'text-emerald-600'
                          : 'text-amber-700 font-semibold'
                      }`}
                    >
                      {check.detail}
                    </p>
                  </div>
                </div>

                {check.actionLabel && check.status !== 'pass' && (
                  <button
                    type="button"
                    className="flex-shrink-0 inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                  >
                    {check.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Critical-missing banner */}
          {hasCriticalMissing && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
              This client cannot have an application submitted until missing
              consent/acknowledgment is resolved.
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Footer actions ───────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-surface-border pt-5">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
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
            onClick={onNext}
            disabled={!selectedClientId || hasCriticalMissing}
            className={`btn btn-primary ${
              !selectedClientId || hasCriticalMissing
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
