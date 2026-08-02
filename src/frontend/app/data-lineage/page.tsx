'use client';

// ============================================================
// /data-lineage — the same page as /platform/data-lineage
//
// These were two pages over one subject, each with its own data. The linked
// copy was wired to the API; this one kept its literals, so the two
// disagreed about the same client.
//
// That is how /offboarding and /platform/offboarding came to differ over
// whether a client's data had been deleted. One implementation now, so they
// cannot drift again.
// ============================================================

export { default } from '@/app/platform/data-lineage/page';
