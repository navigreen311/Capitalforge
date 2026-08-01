'use client';

// ============================================================
// /platform/offboarding
//
// The sidebar links here. It rendered five offboarding requests as literals,
// with a deletion checklist per request and — through the endpoint behind it
// — a fabricated audit trail: timestamps to the second, record counts, and
// entries reading "Credit data RETAINED — Regulatory 7-year hold".
//
// It now renders the same view as /offboarding, over the same real records.
// ============================================================

export { OffboardingView as default } from '@/components/offboarding/offboarding-view';
