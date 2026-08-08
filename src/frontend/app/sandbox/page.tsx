'use client';

// ============================================================
// /sandbox — sandbox mode
//
// This showed sandbox state and seeded scenarios as literals. Whether a
// tenant is in sandbox mode is a plan entitlement, and nothing here
// reads it or switches it.
// ============================================================

import { CapabilityState } from '@/components/ui/capability-state';

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sandbox</h1>
        <p className="text-sm text-gray-500 mt-1">Sandbox mode.</p>
      </div>

      <CapabilityState
        state="not_built"
        title="Sandbox mode"
        detail="Nothing here reads or changes sandbox state. Whether a tenant is in sandbox mode is recorded on its plan entitlements; this page showed a state and a set of seeded scenarios that came from neither."
        unblock={{
          kind: 'unblocked_by',
          text: 'reading sandbox state from the tenant’s plan entitlements, and a path that can switch it — the entitlement already exists, so this is wiring rather than a new record.',
        }}
      />
    </div>
  );
}
