'use client';

// ============================================================
// /tax — the same page as /financial-control/tax
//
// These were two pages over one subject, each with its own data. The linked
// copy was wired to the API; this one kept its literals, so the two
// disagreed about the same client.
//
// That is how /offboarding and /platform/offboarding came to differ over
// whether a client's data had been deleted. One implementation now, so they
// cannot drift again.
// ============================================================

export { default } from '@/app/financial-control/tax/page';
