'use client';

// ============================================================
// /credit-builder — Business Credit Builder Track
// Integrates: client selector, business credit scores,
// DUNS steps with toggles, vendor table with drawer/filters,
// tradeline tracker, sub-progress, timeline, graduation banner
// ============================================================

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import {
  toBusinessScoreSet,
  toTradelineCount,
  toCreditBuilderClients,
  toScoreHistoryPoints,
  toDunsSteps,
  completedStepCount,
  toStackingCriteria,
  toBusinessAgeMonths,
} from '@/lib/credit-view';
import { toGraduationStatus } from '@/lib/graduation-view';
import { loadJson, toLoadError } from '@/lib/load-json';
import { useToast } from '@/components/global/ToastProvider';
import { useRouter } from 'next/navigation';
import {
  CreditBuilderClientSelector,
  BusinessCreditScoresPanel,
  TradelineTracker,
  VendorFilterBar,
  StepCompletionToggle,
  DerivedStepIndicator,
  GraduationTrackPanel,
  TradelineSubProgress,
  PaydexSubProgress,
  EstimatedProgressTimeline,
  GraduationBanner,
  MilestoneAlertSystem,
  checkMilestones,
} from '@/components/credit-builder';
import type { CBClient } from '@/components/credit-builder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One step of the DUNS track. Reference material only — what the process is.
 * Whether a given client has done it lives in `credit_builder_steps` and
 * arrives separately, because it is a fact about a business rather than about
 * the process.
 */
interface DunsStep {
  id: number;
  title: string;
  description: string;
  estimatedDays: string;
  actionLabel?: string;
  /**
   * An outbound link, where the step is completed somewhere else entirely.
   *
   * Distinct from `actionLabel`, which drives something in this application.
   * A link goes where it says it goes; nothing here claims to have done
   * anything on the advisor's behalf.
   */
  externalUrl?: string;
  externalLabel?: string;
}

interface Net30Vendor {
  id: string;
  vendorName: string;
  category: string;
  bureausReported: string[];
  tier: 1 | 2 | 3;
  netTerms: number;
  creditLimit: string;
  requires: string;
  approvalDifficulty: 'easy' | 'moderate' | 'hard';
  applicationUrl?: string;
  reportingTimeline?: string;
  tips?: string[];
  setupGuide?: string[];
}

interface VendorDetailData {
  applicationUrl: string;
  setupGuide: string[];
  reportingTimeline: string;
  tips: string[];
  bureausReported: string[];
  typicalLimit: string;
  difficulty: string;
}

const VENDOR_DETAIL_MAP: Record<string, VendorDetailData> = {
  v_001: {
    applicationUrl: 'https://www.uline.com/CustomerService/NewAccount',
    setupGuide: [
      'Create a Uline business account at uline.com using your EIN and business address.',
      'Place your first order (minimum $50 recommended) and select Net-30 terms at checkout.',
      'Pay the invoice within 30 days — paying early accelerates your Paydex score.',
      'Repeat monthly orders for 3 months to establish a strong trade reference.',
    ],
    reportingTimeline: 'Uline reports to D&B within 30–60 days of your first paid invoice. Expect your Paydex to begin reflecting activity after 2 billing cycles.',
    tips: [
      'Order shipping supplies you actually need — boxes, tape, labels — to avoid waste.',
      'Pay invoices 10+ days early to push your Paydex toward the maximum 80 score.',
      'Keep your account in good standing — even one late payment resets your D&B history.',
    ],
    bureausReported: ['D&B'],
    typicalLimit: '$500–$5,000',
    difficulty: 'easy',
  },
};

interface SbssMilestone {
  id: number;
  title: string;
  target: string;
  description: string;
  /** Null: no SBSS score is recorded for any client in this system. */
  currentValue: number | null;
  targetValue: number;
  unit: string;
  /** Null where nothing has been assessed against the threshold. */
  achieved: boolean | null;
}


interface MilestoneAlert {
  id: string;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  action?: { label: string; url: string };
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

// The six steps of establishing business credit. Reference material: what
// the process is, not where any client has got to.
//
// Three of these arrived marked complete with dates in January 2026 — DUNS
// registered, address established, bank account opened — for whichever
// client happened to be selected. Progress is now recorded per client and
// read from the API; these entries carry only the description of the step.
//
// Steps 1 and 3 used to offer "Verify DUNS →" and "Record account →". Both
// were inert: `handleStepAction` has only ever had branches for steps 4 and 6,
// so clicking either did nothing, in any state. They are not restored, because
// there is nothing behind them to restore them to — no `dunsNumber` column
// exists on a business, nothing verifies one (the D&B adapter *generates* a
// random nine-digit number), and no model records a business bank account. A
// button labelled "Verify" that cannot verify is the failure this page has
// been audited for twice.
const DUNS_STEPS: DunsStep[] = [
  // The registration happens at D&B, so the honest control is a link to D&B.
  // This step used to offer "Verify DUNS →", which had no handler branch and
  // did nothing; nothing in this system can verify a DUNS number.
  //
  // URL checked 2026-08-05: 200, no redirect. The path D&B previously used,
  // /duns-number/get-a-duns.html — which is still hardcoded in
  // credit-builder.service.ts — now answers 301 to this one.
  { id: 1, title: 'Register DUNS Number', description: 'Apply at Dun & Bradstreet. DUNS is required for all business credit activity.', estimatedDays: '1–3 days', externalUrl: 'https://www.dnb.com/en-us/smb/duns/get-a-duns.html', externalLabel: 'Register at D&B' },
  { id: 2, title: 'Establish Business Address & Phone', description: 'Ensure business address is a physical or registered agent address. Get a dedicated business phone line.', estimatedDays: 'Immediate' },
  { id: 3, title: 'Open Business Bank Account', description: 'Separate personal and business finances. Minimum 3 months of activity strengthens profile.', estimatedDays: '1 day' },
  { id: 4, title: 'Apply for Net-30 Vendor Accounts', description: 'Open at least 5 trade lines with Tier 1 vendors that report to Dun & Bradstreet.', estimatedDays: '2–4 weeks', actionLabel: 'View vendors' },
  { id: 5, title: 'Build Paydex Score to 80+', description: 'Pay all Net-30 invoices on time or early. Paydex 80+ is required for Tier 2 access.', estimatedDays: '60–90 days' },
  { id: 6, title: 'Apply for Business Credit Cards', description: 'Once Paydex hits 80 and 5+ trade lines are established, apply for business credit cards.', estimatedDays: '90+ days from start', actionLabel: 'View eligible cards' },
];

const NET30_VENDORS: Net30Vendor[] = [
  { id: 'v_001', vendorName: 'Uline', category: 'Shipping & Packaging', bureausReported: ['D&B'], tier: 1, netTerms: 30, creditLimit: '$500–$5,000', requires: 'EIN + Address', approvalDifficulty: 'easy', applicationUrl: 'https://uline.com' },
  { id: 'v_002', vendorName: 'Quill', category: 'Office Supplies', bureausReported: ['D&B', 'Experian Biz'], tier: 1, netTerms: 30, creditLimit: '$500–$3,000', requires: 'EIN + DUNS', approvalDifficulty: 'easy', applicationUrl: 'https://quill.com' },
  { id: 'v_003', vendorName: 'Grainger', category: 'Industrial / MRO', bureausReported: ['D&B', 'Experian Biz', 'Equifax Biz'], tier: 1, netTerms: 30, creditLimit: '$1,000–$10,000', requires: 'EIN + 1yr in business', approvalDifficulty: 'moderate', applicationUrl: 'https://grainger.com' },
  { id: 'v_004', vendorName: 'Crown Office Supplies', category: 'Office Supplies', bureausReported: ['D&B', 'Experian Biz', 'Equifax Biz'], tier: 1, netTerms: 30, creditLimit: '$100–$500', requires: 'EIN only', approvalDifficulty: 'easy', applicationUrl: 'https://crownofficesupplies.com' },
  { id: 'v_005', vendorName: 'Summa Office Supplies', category: 'Office Supplies', bureausReported: ['D&B', 'Experian Biz', 'Equifax Biz'], tier: 1, netTerms: 30, creditLimit: '$500–$2,000', requires: 'EIN only', approvalDifficulty: 'easy' },
  { id: 'v_006', vendorName: 'Home Depot Pro', category: 'Construction / Tools', bureausReported: ['D&B', 'Experian Biz'], tier: 2, netTerms: 30, creditLimit: '$5,000–$25,000', requires: 'Paydex 75+, 2+ trade lines', approvalDifficulty: 'moderate', applicationUrl: 'https://homedepot.com/pro' },
  { id: 'v_007', vendorName: 'Staples Business', category: 'Office Supplies', bureausReported: ['D&B', 'Experian Biz', 'Equifax Biz'], tier: 2, netTerms: 30, creditLimit: '$2,000–$10,000', requires: 'Paydex 70+', approvalDifficulty: 'moderate', applicationUrl: 'https://staples.com/business' },
  { id: 'v_008', vendorName: 'Costco Business Credit', category: 'Retail / Wholesale', bureausReported: ['Experian Biz'], tier: 3, netTerms: 30, creditLimit: '$10,000–$50,000', requires: 'Paydex 80+, 5+ trade lines', approvalDifficulty: 'hard', applicationUrl: 'https://costco.com/business' },
];

// SBA and lender thresholds. Two rounds of correction, both worth recording.
//
// First: the thresholds were real but the score against them was not — every
// milestone carried currentValue 148, an SBSS for a business nobody had
// scored, with two of the four marked achieved.
//
// Second, 2026-08-05: the thresholds were not real either.
//
//  - "≥ 140" was the SBA pre-screen minimum until October 2020. It became 155,
//    then 165 in June 2025, and then the prescreen was retired outright on
//    2026-03-01 — SBA Procedural Notices 5000-875701 (2026-01-16) and
//    5000-876777 (2026-02-20), the second being the operative one because it
//    replaced the SOP 50 10 8 amendments in the first. Two revisions stale on
//    a requirement that no longer exists.
//  - "(7a/504 loans)" was wrong throughout. The prescreen applied to 7(a)
//    Small Loans of $350,000 and under. SBA Express was explicitly unaffected
//    and 504 never applied.
//  - "≥ 160" for Preferred Lender Program eligibility has no source I could
//    find. It is marked unverified rather than quietly deleted, because the
//    PLP itself is real and somebody may be able to cite a figure.
//
// Note what did *not* change: the SBA removed the requirement, not the option.
// Lenders still use SBSS by choice, with their own models. It is no longer a
// universal floor, which is why there is no single number left to aim at.
//
// See docs/product/business-credit-scores.md for the full sourcing.
const SBSS_MILESTONES: SbssMilestone[] = [
  { id: 1, title: 'SBSS Score Established', target: 'Score > 0', description: 'A first FICO SBSS is produced when a lender requests one — it is not a record a business can establish or pull on its own.', currentValue: null, targetValue: 1, unit: 'score exists', achieved: null },
  { id: 2, title: 'SBA pre-screen (retired 2026-03-01)', target: 'no longer applies', description: 'The SBA required an SBSS pre-screen for 7(a) Small Loans of $350K and under. Retired 2026-03-01; all such loans now get full credit analysis. The minimum was 140, then 155 (Oct 2020), then 165 (Jun 2025). Notices 5000-875701 and 5000-876777.', currentValue: null, targetValue: 165, unit: 'pts', achieved: null },
  { id: 3, title: 'Preferred Lender Program eligibility', target: '≥ 160 (unverified)', description: 'No published SBSS threshold for PLP expedited processing was found when this was checked on 2026-08-05. Treat 160 as uncited until somebody can source it.', currentValue: null, targetValue: 160, unit: 'pts', achieved: null },
  { id: 4, title: 'Tier 3 Stacking Unlock', target: '≥ 175', description: 'Internal threshold, not an SBA one. No client has ever had an SBSS on record, so this has never been measured against anything.', currentValue: null, targetValue: 175, unit: 'pts', achieved: null },
];

// The eight criteria were held here as literals with a hardcoded status of
// "unknown" and `allMet = false` beside them, so this panel reported "8
// stacking criteria, none assessed" to every client since it was written.
//
// They now come assessed from GET /:clientId/stacking-criteria, from the same
// facts the DUNS steps derive from — sc_002 and step 4 are the same question
// about trade lines, sc_003 and step 5 the same question about PAYDEX, and
// reading them from two places is how two figures on one page come to disagree.
// Six since 2026-08-05. sc_004 (SBSS ≥ 140) and sc_008 (SBSS ≥ 175) were
// removed: FICO computes SBSS when a lender requests it, so no client could
// clear either by any action, and zero rows of that score type have ever
// existed here. Neither had been assessed for anybody since they were written.
const STACKING_CRITERIA_COUNT = 6;

// Scores placeholder

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function difficultyBadge(d: string): string {
  if (d === 'easy') return 'bg-green-900 text-green-300 border-green-700';
  if (d === 'moderate') return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  return 'bg-red-900 text-red-300 border-red-700';
}

function tierBadge(tier: number): string {
  if (tier === 1) return 'bg-blue-900 text-blue-300 border-blue-700';
  if (tier === 2) return 'bg-purple-900 text-purple-300 border-purple-700';
  return 'bg-orange-900 text-orange-300 border-orange-700';
}

/**
 * Four states, styled to be told apart at a glance.
 *
 * `unknown` and `unassessable` deliberately do not borrow the failure colour:
 * neither says the client fell short of anything. "Nobody has pulled that
 * score" and "this system produces no such score" are facts about us, not
 * about them.
 */
function criteriaStatusBadge(status: string): { cls: string; label: string } {
  const map: Record<string, { cls: string; label: string }> = {
    met: { cls: 'bg-green-900 text-green-300 border-green-700', label: 'Met' },
    not_met: { cls: 'bg-yellow-900 text-yellow-300 border-yellow-700', label: 'Not yet' },
    unknown: { cls: 'bg-gray-800 text-gray-400 border-gray-700', label: 'Not measured' },
    unassessable: { cls: 'bg-gray-800 text-gray-500 border-gray-700', label: 'Cannot assess' },
  };
  return map[status] ?? map.unknown;
}

function criteriaIcon(status: string): string {
  if (status === 'met') return '✓';
  if (status === 'not_met') return '◑';
  if (status === 'unassessable') return '–';
  return '?';
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreditBuilderPage() {
  const router = useRouter();
  const toast = useToast();
  const [selectedClient, setSelectedClient] = useState<CBClient | null>(null);
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [bureauFilter, setBureauFilter] = useState<string>('all');
  const [vendorSearch, setVendorSearch] = useState('');
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<MilestoneAlert[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [prefillVendor, setPrefillVendor] = useState<string | null>(null);
  const [savingStep, setSavingStep] = useState<number | null>(null);

  // useAuthFetch skips a path containing "undefined", so these stay idle
  // until a client is chosen.
  const { data: scoresRaw } = useAuthFetch<unknown>(
    `/api/credit-builder/${selectedClient?.id}/scores`,
  );
  const { data: tradelinesRaw } = useAuthFetch<unknown>(
    `/api/credit-builder/${selectedClient?.id}/tradelines`,
  );
  // The trajectory chart drew a fixed six-month climb for every client. This
  // endpoint builds the real one from credit_profiles and omits months with
  // no pull rather than interpolating across them.
  const { data: historyRaw } = useAuthFetch<unknown>(
    `/api/credit-builder/${selectedClient?.id}/score-history`,
  );
  // Progress through the DUNS track, per client. This was component state: it
  // did not survive a refresh, and it was keyed to nobody, so marks made
  // against one client stayed on screen after switching to another.
  const { data: stepsRaw, refetch: refetchSteps } = useAuthFetch<unknown>(
    `/api/credit-builder/${selectedClient?.id}/steps`,
  );
  // Assessed against the same facts the steps derive from.
  const { data: criteriaRaw, refetch: refetchCriteria } = useAuthFetch<unknown>(
    `/api/credit-builder/${selectedClient?.id}/stacking-criteria`,
  );
  // The four-track progression. This endpoint has been answering correctly
  // since it was written, and nothing rendered it.
  const { data: graduationRaw, error: graduationError } = useAuthFetch<unknown>(
    `/api/businesses/${selectedClient?.id}/graduation/status`,
  );

  // The picker's clients. It held eight literals under ids cb_001 to cb_008,
  // so selecting one sent every request above to a business that does not
  // exist — answered 404, rendered as zeros.
  const {
    data: clientsRaw,
    isLoading: clientsLoading,
    error: clientsError,
  } = useAuthFetch<unknown>('/api/v1/clients?pageSize=100');

  const clients = useMemo(() => toCreditBuilderClients(clientsRaw), [clientsRaw]);

  const scores = useMemo(() => toBusinessScoreSet(scoresRaw), [scoresRaw]);
  const tradelineCount = useMemo(() => toTradelineCount(tradelinesRaw), [tradelinesRaw]);
  const scoreHistory = useMemo(() => toScoreHistoryPoints(historyRaw), [historyRaw]);
  const stepState = useMemo(() => toDunsSteps(stepsRaw), [stepsRaw]);
  const tierAssessments = useMemo(() => toStackingCriteria(criteriaRaw), [criteriaRaw]);
  const businessAgeMonths = useMemo(() => toBusinessAgeMonths(criteriaRaw), [criteriaRaw]);
  const graduationStatus = useMemo(() => toGraduationStatus(graduationRaw), [graduationRaw]);

  const assessedCriteria = useMemo(
    () => tierAssessments?.flatMap((t) => t.criteria) ?? null,
    [tierAssessments],
  );

  /** Reference steps joined to this client's marks. */
  const dunsSteps = useMemo(
    () =>
      DUNS_STEPS.map((step) => {
        const mark = stepState?.find((s) => s.stepNumber === step.id) ?? null;
        return {
          ...step,
          // Attested until the API says otherwise, matching `toDunsSteps`.
          source: mark?.source ?? 'attested',
          completed: mark?.completed ?? false,
          basis: mark?.basis ?? null,
          completedDate: mark?.completedAt ?? null,
        };
      }),
    [stepState],
  );

  // Null until the track has been read: no client is selected, or the request
  // failed. Zero would state that this client has completed none of them.
  const completedCount = completedStepCount(stepState);
  const overallProgress =
    completedCount === null ? null : Math.round((completedCount / DUNS_STEPS.length) * 100);

  // A missing PAYDEX must not unlock a tier. `null >= 80` is false in JS, but
  // relying on that would be accidental — the absence is checked explicitly.
  // The same now goes for the tradeline count, which is null until read: an
  // unread list must not satisfy a threshold, and must not fail one either.
  //
  // `completedCount` is included on the same terms, and it is the reason the
  // steps needed a table: this banner tells an advisor a client is ready to
  // apply for credit, and it used to rest partly on three checkboxes held in
  // component state — unkeyed to any client, gone on the next refresh.
  const tier1Unlocked =
    scores.paydex !== null &&
    scores.paydex >= 80 &&
    tradelineCount !== null &&
    tradelineCount >= 5 &&
    completedCount !== null &&
    completedCount >= 3;

  const toggleStep = useCallback(
    async (stepNumber: number, next: boolean) => {
      if (!selectedClient) return;

      setSavingStep(stepNumber);
      try {
        // Written before the circle changes. An optimistic tick here would be
        // the same defect this page was audited for: a mark that reports a
        // record nobody holds.
        await loadJson(`/api/credit-builder/${selectedClient.id}/steps/${stepNumber}`, {
          method: 'PUT',
          body: { completed: next },
        });
        // Both, because criterion sc_001 reads step 1's attestation: marking
        // the DUNS registration and leaving the criteria panel showing the
        // previous answer would put two states of one fact on screen at once.
        await Promise.all([refetchSteps(), refetchCriteria()]);
      } catch (error) {
        const info = toLoadError(error);
        toast.error(
          info.type === 'auth_required'
            ? 'Your session has expired. Sign in again to change this step.'
            : 'Could not save the step. Nothing was changed.',
        );
      } finally {
        setSavingStep(null);
      }
    },
    [selectedClient, refetchSteps, refetchCriteria, toast],
  );

  const handleStepAction = useCallback((step: DunsStep) => {
    if (step.id === 4) {
      document.getElementById('vendor-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTierFilter('1');
    } else if (step.id === 6) {
      router.push(selectedClient ? `/optimizer?client_id=${selectedClient.id}&from=credit-builder` : '/optimizer');
    }
  }, [router, selectedClient]);

  // The previous reading, per client, so a milestone reports a change rather
  // than the first successful load. `checkMilestones` was imported and never
  // called: no milestone alert could ever appear, on a page whose alert stack
  // was rendered at the top of every view.
  const lastReading = useRef<{ clientId: string; paydex: number | null; tradelineCount: number | null } | null>(null);

  useEffect(() => {
    const clientId = selectedClient?.id ?? null;
    if (clientId === null) {
      lastReading.current = null;
      setAlerts([]);
      return;
    }

    const current = { paydex: scores.paydex, tradelineCount };
    const previous =
      lastReading.current && lastReading.current.clientId === clientId
        ? { paydex: lastReading.current.paydex, tradelineCount: lastReading.current.tradelineCount }
        : null;

    // Switching client is not progress. Without this the first reading for the
    // new client would be compared against the old one's, and moving from a
    // client with 2 tradelines to one with 6 would announce a milestone the
    // second client passed long ago.
    const fresh = checkMilestones(previous, current, clientId);
    if (fresh.length > 0) {
      setAlerts((prev) => [...prev, ...fresh.filter((a) => !prev.some((p) => p.id === a.id))]);
    }

    lastReading.current = { clientId, paydex: scores.paydex, tradelineCount };
  }, [selectedClient?.id, scores.paydex, tradelineCount]);

  const filteredVendors = NET30_VENDORS.filter((v) => {
    const matchTier = tierFilter === 'all' || v.tier === Number(tierFilter);
    const matchBureau = bureauFilter === 'all' || v.bureausReported.some(b => b.toLowerCase().includes(bureauFilter));
    const matchSearch = !vendorSearch || v.vendorName.toLowerCase().includes(vendorSearch.toLowerCase());
    return matchTier && matchBureau && matchSearch;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* Milestone Alerts */}
      <MilestoneAlertSystem alerts={alerts} onDismiss={(id) => setAlerts(prev => prev.filter(a => a.id !== id))} />

      {/* Graduation Banner */}
      <GraduationBanner clientId={selectedClient?.id ?? null} clientName={selectedClient?.legal_name ?? null} tier={1} isUnlocked={tier1Unlocked} />

      {/* ── Client Selector ──────────────────────────────────────── */}
      <CreditBuilderClientSelector
        selectedClient={selectedClient}
        onClientSelect={setSelectedClient}
        onClear={() => setSelectedClient(null)}
        clients={clients}
        loading={clientsLoading}
        error={
          clientsError === null
            ? null
            : 'The client list could not be read. No clients are offered.'
        }
      />

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Business Credit Builder</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {completedCount === null
              ? selectedClient
                ? 'DUNS progress not read'
                : 'Select a client to see their DUNS progress'
              : `${completedCount}/${DUNS_STEPS.length} DUNS steps recorded`}{' '}
            ·{' '}
            {/* The fraction alone hides what produced it: "4/6 met" reads the
                same whether the other two fell short or could never be
                measured. Anything unmeasured is named beside the count, and
                "not yet measured" stays separate from "cannot be assessed" —
                the first is an errand, the second is a standing fact. */}
            {assessedCriteria === null
              ? `${STACKING_CRITERIA_COUNT} stacking criteria, not assessed`
              : [
                  `${assessedCriteria.filter((c) => c.status === 'met').length}/${assessedCriteria.length} stacking criteria met`,
                  assessedCriteria.filter((c) => c.status === 'unknown').length > 0
                    ? `${assessedCriteria.filter((c) => c.status === 'unknown').length} not yet measured`
                    : null,
                  assessedCriteria.filter((c) => c.status === 'unassessable').length > 0
                    ? `${assessedCriteria.filter((c) => c.status === 'unassessable').length} cannot be assessed`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
            {selectedClient && <span className="text-yellow-400"> — {selectedClient.legal_name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-500">Overall Progress</p>
            {/* A percentage requires a numerator. 0% for an unread track would
                report a client who has done nothing. */}
            <p className="text-xl font-bold text-yellow-400">
              {overallProgress === null ? <span className="text-gray-600">—</span> : `${overallProgress}%`}
            </p>
          </div>
          <div className="w-20 h-2 rounded-full bg-gray-800">
            {overallProgress !== null && (
              <div className="h-full rounded-full bg-yellow-600 transition-all" style={{ width: `${overallProgress}%` }} />
            )}
          </div>
        </div>
      </div>

      {/* ── Business Credit Scores ───────────────────────────────── */}
      <BusinessCreditScoresPanel
        clientName={selectedClient?.legal_name ?? null}
        paydex={scores.paydex} paydexDate={scores.paydexDate}
        experianBusiness={scores.experianBusiness} experianDate={scores.experianDate}
        sbss={scores.sbss} sbssDate={scores.sbssDate}
        history={scoreHistory}
      />

      {/* ── DUNS Registration Steps ──────────────────────────────── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-200">DUNS Registration Track</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              6 foundational steps to establish D&B credit profile · 4 read from this
              client&apos;s data, 2 confirmed by an advisor
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 rounded-full bg-gray-800">
              {overallProgress !== null && (
                <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${overallProgress}%` }} />
              )}
            </div>
            <span className="text-sm font-semibold text-green-400">
              {completedCount === null ? <span className="text-gray-600">—</span> : `${completedCount}/${DUNS_STEPS.length}`}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {dunsSteps.map((step) => (
            <div key={step.id} className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${step.completed ? 'border-green-800 bg-green-900/20' : 'border-gray-800 bg-gray-900/50 hover:bg-gray-900'}`}>
              {/* Two kinds of claim, two controls. A derived step reports what
                  the client's data says and offers nothing to click: it is not
                  an advisor's to set, and a control that took the click and
                  changed nothing would be the quiet version of the defect this
                  page was audited for. An attested step keeps the toggle, and
                  is disabled without a client — there is nowhere to record it. */}
              {step.source === 'derived' ? (
                <DerivedStepIndicator completed={step.completed} known={stepState !== null} />
              ) : (
                <StepCompletionToggle
                  stepId={String(step.id)}
                  completed={step.completed}
                  completedDate={null}
                  disabled={!selectedClient || savingStep !== null}
                  onToggle={(_stepId, next) => { void toggleStep(step.id, next); }}
                />
              )}
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center mt-0.5">
                <span className="text-xs font-bold text-gray-400">{step.id}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${step.completed ? 'text-green-300 line-through opacity-70' : 'text-gray-100'}`}>{step.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.description}</p>

                {/* What the step rests on, stated differently for each kind.
                    "The PAYDEX is 80" and "Sarah confirmed it" are different
                    claims, and only one of them has an author. */}
                {step.source === 'derived' && step.basis && (
                  <p className={`text-xs mt-1 ${step.completed ? 'text-green-500' : 'text-gray-400'}`}>
                    <span className="text-gray-500">From this client&apos;s data:</span> {step.basis}
                  </p>
                )}
                {step.source === 'attested' && step.completed && step.completedDate && (
                  <p className="text-xs text-green-500 mt-1">
                    Confirmed by an advisor {formatDate(step.completedDate)}
                  </p>
                )}
                {step.source === 'attested' && !step.completed && selectedClient && (
                  <p className="text-xs text-gray-600 mt-1">
                    Nothing here records this — an advisor confirms it
                  </p>
                )}

                {step.id === 4 && !step.completed && <div className="mt-2"><TradelineSubProgress current={tradelineCount} target={5} /></div>}
                {step.id === 5 && !step.completed && <div className="mt-2"><PaydexSubProgress currentScore={scores.paydex} targetScore={80} /></div>}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-gray-500 whitespace-nowrap">{step.estimatedDays}</p>
                {step.actionLabel && !step.completed && (
                  <button onClick={() => handleStepAction(step)} className="mt-1 text-xs text-yellow-500 hover:text-yellow-400 hover:underline">
                    {step.actionLabel} →
                  </button>
                )}
                {step.externalUrl && !step.completed && (
                  <a
                    href={step.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-xs text-yellow-500 hover:text-yellow-400 hover:underline whitespace-nowrap"
                  >
                    {step.externalLabel ?? 'Open'} &#x2197;
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vendor Filter Bar ────────────────────────────────────── */}
      <div id="vendor-table">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-200">Net-30 Vendor Recommendations</h2>
            <p className="text-xs text-gray-500 mt-0.5">Vetted vendors that report to business credit bureaus · Click a row for details</p>
          </div>
        </div>
        <VendorFilterBar
          tierFilter={tierFilter} onTierChange={setTierFilter}
          bureauFilter={bureauFilter} onBureauChange={setBureauFilter}
          searchQuery={vendorSearch} onSearchChange={setVendorSearch}
        />

        {/* Vendor Table */}
        <div className="rounded-xl border border-gray-800 overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Bureaus</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Credit Limit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Requires</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Difficulty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredVendors.map((v) => {
                const isExpanded = expandedVendorId === v.id;
                const detail = VENDOR_DETAIL_MAP[v.id];
                return (
                  <React.Fragment key={v.id}>
                    <tr
                      className={`hover:bg-gray-900/60 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-900/60' : ''}`}
                      onClick={() => setExpandedVendorId(isExpanded ? null : v.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-gray-500 transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                          <div><p className="font-semibold text-white">{v.vendorName}</p><p className="text-xs text-gray-500">Net-{v.netTerms}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{v.category}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{v.bureausReported.map((b) => (<span key={b} className="text-xs bg-blue-900/50 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded">{b}</span>))}</div></td>
                      <td className="px-4 py-3 text-center"><span className={`text-xs font-bold px-2 py-0.5 rounded border ${tierBadge(v.tier)}`}>Tier {v.tier}</span></td>
                      <td className="px-4 py-3 text-xs text-gray-300">{v.creditLimit}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{v.requires}</td>
                      <td className="px-4 py-3 text-center"><span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${difficultyBadge(v.approvalDifficulty)}`}>{v.approvalDifficulty}</span></td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-0 py-0">
                          <div className="bg-gray-900/80 border-t border-b border-gray-700 px-6 py-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              {/* Column 1: Details */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vendor Details</h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between"><span className="text-gray-500">Application URL</span>{v.applicationUrl ? <a href={v.applicationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate ml-2">{v.applicationUrl.replace('https://', '')}</a> : <span className="text-gray-600">N/A</span>}</div>
                                  <div className="flex justify-between"><span className="text-gray-500">Bureaus</span><span className="text-gray-200">{v.bureausReported.join(', ')}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Typical Limit</span><span className="text-gray-200">{detail?.typicalLimit ?? v.creditLimit}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Difficulty</span><span className={`font-semibold capitalize ${v.approvalDifficulty === 'easy' ? 'text-green-400' : v.approvalDifficulty === 'moderate' ? 'text-yellow-400' : 'text-red-400'}`}>{v.approvalDifficulty}</span></div>
                                </div>
                                {detail?.reportingTimeline && (
                                  <div className="mt-3">
                                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Reporting Timeline</h5>
                                    <p className="text-xs text-gray-400 leading-relaxed">{detail.reportingTimeline}</p>
                                  </div>
                                )}
                              </div>
                              {/* Column 2: Setup Guide */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Setup Guide</h4>
                                {detail?.setupGuide ? (
                                  <ol className="space-y-2">
                                    {detail.setupGuide.map((step, idx) => (
                                      <li key={idx} className="flex gap-2 text-xs">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">{idx + 1}</span>
                                        <span className="text-gray-300 leading-relaxed">{step}</span>
                                      </li>
                                    ))}
                                  </ol>
                                ) : (
                                  <ol className="space-y-2 text-xs text-gray-400">
                                    <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">1</span>Visit {v.vendorName} website and create a business account.</li>
                                    <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">2</span>Submit business credit application with EIN and DUNS.</li>
                                    <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">3</span>Place first Net-{v.netTerms} order to activate tradeline.</li>
                                    <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">4</span>Pay invoice on time or early for positive reporting.</li>
                                  </ol>
                                )}
                              </div>
                              {/* Column 3: Tips + Action */}
                              <div className="space-y-3">
                                {detail?.tips && detail.tips.length > 0 && (
                                  <>
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tips</h4>
                                    <ul className="space-y-1.5">
                                      {detail.tips.map((tip, idx) => (
                                        <li key={idx} className="flex gap-2 text-xs">
                                          <span className="text-yellow-500 flex-shrink-0 mt-0.5">&#9679;</span>
                                          <span className="text-gray-300 leading-relaxed">{tip}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                <div className="pt-3 flex flex-col gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setPrefillVendor(v.vendorName); setShowAddModal(true); }}
                                    className="w-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-4 py-2.5 transition-colors"
                                  >
                                    + Add to My Tradelines
                                  </button>
                                  {v.applicationUrl && (
                                    <a
                                      href={v.applicationUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full text-center text-sm font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg px-4 py-2 transition-colors"
                                    >
                                      Apply Now &#x2197;
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tradeline Tracker ────────────────────────────────────── */}
      <TradelineTracker
        clientId={selectedClient?.id ?? null}
        clientName={selectedClient?.legal_name ?? null}
        prefillVendor={prefillVendor}
        showAddModal={showAddModal}
        onCloseAddModal={() => { setShowAddModal(false); setPrefillVendor(null); }}
      />

      {/* ── Programme Track ──────────────────────────────────────── */}
      {/* Placed above the criteria panel deliberately: the track is the
          question an advisor is actually asking — where is this client, and
          what is in the way — and the eight stacking criteria are one input to
          it rather than the answer. */}
      <GraduationTrackPanel
        status={graduationStatus}
        clientSelected={selectedClient !== null}
        error={
          graduationError === null || !selectedClient
            ? null
            : 'This client’s track could not be read.'
        }
      />

      {/* ── SBSS Milestones + Stacking Criteria side-by-side ───── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* SBSS Milestones */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">SBSS Milestone Progress</h2>
          <p className="text-xs text-gray-500 mb-5">FICO Small Business Scoring Service score targets</p>
          <div className="space-y-5">
            {SBSS_MILESTONES.map((m) => {
              // No score, so no progress. A bar at 0% would read as a
              // client scoring zero rather than one never scored.
              const pct = m.currentValue === null ? 0 : Math.min(Math.round((m.currentValue / m.targetValue) * 100), 100);
              const barColor = m.achieved === true ? 'bg-green-600' : 'bg-gray-700';
              return (
                <div key={m.id}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${m.achieved ? 'bg-green-700 text-green-200' : 'bg-gray-700 text-gray-400'}`}>{m.achieved ? '✓' : m.id}</span>
                      <p className={`text-sm font-semibold ${m.achieved ? 'text-green-300' : 'text-gray-200'}`}>{m.title}</p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">{m.target}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2 ml-7">{m.description}</p>
                  <div className="ml-7">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1"><span>{m.currentValue === null ? 'Not scored' : `${m.currentValue} ${m.unit}`}</span><span>{m.targetValue} {m.unit}</span></div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden"><div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* This read "Current SBSS: 148 · Next milestone: 160" as literal
              text. The milestone array above had already been nulled for the
              same reason — no SBSS score is recorded anywhere in this system
              — and this line was missed, so the page went on stating a score
              for every client underneath a table saying it had none. */}
          <div className="mt-5 pt-4 border-t border-gray-800 text-xs text-gray-500">
            {scores.sbss === null ? (
              <>No SBSS score is on record for this client, so no milestone is measured against one.</>
            ) : (
              <>
                Current SBSS:{' '}
                <span className="text-yellow-400 font-bold text-sm">{scores.sbss}</span>
                <span className="mx-2">·</span>
                Next milestone:{' '}
                {SBSS_MILESTONES.find((m) => m.targetValue > scores.sbss!)?.targetValue ?? 'none above this score'}
              </>
            )}
          </div>
        </section>

        {/* Stacking Unlock Criteria */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">Stacking Unlock Criteria</h2>
          <p className="text-xs text-gray-500 mb-5">
            Requirements to unlock each credit stacking tier · assessed from the same data
            as the DUNS track above
          </p>

          {tierAssessments === null ? (
            // Not read is not "none met". This panel used to state that no
            // criterion was satisfied whether or not anything had been asked.
            <p className="text-xs text-gray-500">
              {selectedClient
                ? 'These could not be assessed for this client.'
                : 'Select a client to assess these against their credit file.'}
            </p>
          ) : (
            tierAssessments.map((t) => (
              <div key={t.tier} className="mb-5 last:mb-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${tierBadge(t.tier)}`}>Tier {t.tier}</span>
                    <span className="text-xs font-semibold text-gray-400">
                      {t.met} of {t.total} met
                    </span>
                  </div>
                  {t.unlocked && (
                    <span className="text-xs bg-green-900 text-green-300 border border-green-700 px-2 py-0.5 rounded">
                      UNLOCKED
                    </span>
                  )}
                </div>
                <div className="space-y-2 pl-1">
                  {t.criteria.map((c) => {
                    const { cls, label } = criteriaStatusBadge(c.status);
                    return (
                      <div key={c.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-gray-800 bg-gray-900/40">
                        <span className={`mt-0.5 text-sm font-bold flex-shrink-0 w-4 text-center ${c.status === 'met' ? 'text-green-400' : 'text-gray-600'}`}>
                          {criteriaIcon(c.status)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-300">{c.label}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{c.description}</p>
                          {/* What was read, or why it could not be. A status
                              with no figure behind it is the state this panel
                              was in for its whole life. */}
                          {c.basis && (
                            <p className={`text-xs mt-1 ${c.status === 'met' ? 'text-green-500' : 'text-gray-400'}`}>
                              {c.basis}
                            </p>
                          )}
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${cls}`}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {/* ── Estimated Progress Timeline ──────────────────────────── */}
      {/* Every one of these was coerced with `?? 0` before being passed in,
          and the component already accepts null and handles it. A Paydex of 0
          is a score, not an absence, and the timeline turned three absences
          into a projected unlock date.

          businessAgeMonths was the constant 36 — three years for every client,
          clearing the two-year threshold for all of them — and was then set to
          null on the belief that nothing recorded a formation date. It does:
          `Business.dateOfFormation` exists and is populated, and it now
          arrives with the criteria assessed from it. Passing null here while
          the criterion above read "88 months since formation" put both claims
          on one page. */}
      <EstimatedProgressTimeline
        paydex={scores.paydex}
        tradelineCount={tradelineCount}
        experianBusiness={scores.experianBusiness}
        sbss={scores.sbss}
        businessAgeMonths={businessAgeMonths}
      />

      {/* VendorDetailDrawer was rendered here and could never open:
          `setSelectedVendor` was only ever called with null, because clicking
          a row expands it in place instead. Its "track this vendor" action was
          a no-op even if it had opened. The expanded row carries the same
          detail — application URL, setup guide, reporting timeline, tips —
          plus a working "+ Add to My Tradelines". Removed rather than wired,
          since wiring it would give this page two ways to show one thing. */}
    </div>
  );
}
