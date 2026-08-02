'use client';

// ============================================================
// /sandbox — sandbox mode
//
// This showed sandbox state and seeded scenarios as literals. Whether a
// tenant is in sandbox mode is a plan entitlement, and nothing here
// reads it or switches it.
// ============================================================

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sandbox</h1>
        <p className="text-sm text-gray-500 mt-1">Sandbox mode.</p>
      </div>

      <section
        aria-label="Not implemented"
        className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-2"
      >
        <h2 className="text-sm font-semibold text-amber-900">Not implemented</h2>
        <p className="text-xs text-amber-900 leading-relaxed">
          Nothing here reads or changes sandbox state. Whether a tenant is in sandbox mode is
          recorded on its plan entitlements; this page showed a state and a set of seeded
          scenarios that came from neither.
        </p>
      </section>
    </div>
  );
}
