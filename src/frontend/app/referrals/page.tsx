'use client';

// ============================================================
// /referrals — advisor referrals
//
// This listed referrals with links, conversions and commissions owed.
// No table holds any of it, and the endpoints answer 501 rather than
// pretending.
// ============================================================

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
        <p className="text-sm text-gray-500 mt-1">Advisor referral tracking.</p>
      </div>

      <section
        aria-label="Not implemented"
        className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-2"
      >
        <h2 className="text-sm font-semibold text-amber-900">Not implemented</h2>
        <p className="text-xs text-amber-900 leading-relaxed">
          No table holds a referral link, its conversions or a commission, and no endpoint
          creates one — POST /api/platform/referrals answers 501. The five advisors listed here,
          with links under app.capitalforge.io and commissions of $1,500 and $2,200, were
          literals.
        </p>
        <p className="text-xs text-amber-900 leading-relaxed">
          referral_attributions exists but is a different thing: it attributes a business to a
          source with a fee, and carries no advisor link, conversion or commission.
        </p>
      </section>
    </div>
  );
}
