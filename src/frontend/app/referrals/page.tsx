'use client';

// ============================================================
// /referrals — advisor referrals
//
// This listed referrals with links, conversions and commissions owed.
// No table holds any of it, and the endpoints answer 501 rather than
// pretending.
// ============================================================

import { CapabilityState } from '@/components/ui/capability-state';

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
        <p className="text-sm text-gray-500 mt-1">Advisor referral tracking.</p>
      </div>

      <CapabilityState
        state="not_built"
        title="Advisor referral tracking"
        detail="No table holds a referral link, its conversions or a commission, and no endpoint creates one — POST /api/platform/referrals answers 501. The five advisors listed here, with links under app.capitalforge.io and commissions of $1,500 and $2,200, were literals."
        unblock={{
          kind: 'unblocked_by',
          text: 'a table for referral links, conversions and commissions, and an implementation behind the endpoints that currently answer 501.',
        }}
      />

      <section aria-label="A table that is not this one" className="rounded-xl border border-gray-200 bg-white p-5">
        {/* Kept as prose rather than made a second marker. It is not another
            absent capability — it is a warning against mistaking a table that
            does exist for this one, which is how a reader concludes the
            feature is half-built. */}
        <p className="text-xs text-gray-600 leading-relaxed">
          <strong className="text-gray-700">referral_attributions is a different thing.</strong>{' '}
          It attributes a business to a source with a fee, and carries no advisor link,
          conversion or commission. It is not a partial version of what this page showed.
        </p>
      </section>
    </div>
  );
}
