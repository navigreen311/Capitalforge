'use client';

// ============================================================
// /clients/new — New Client intake page (placeholder)
// ============================================================

import { useRouter } from 'next/navigation';

export default function NewClientPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 md:p-10">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/clients')}
          className="text-sm text-gray-400 hover:text-white transition mb-4 inline-flex items-center gap-1"
        >
          &larr; Back to Clients
        </button>
        <h1 className="text-2xl font-bold tracking-tight">New Client</h1>
        <p className="text-gray-400 mt-1">
          Onboard a new business client into CapitalForge.
        </p>
      </div>

      {/* Coming Soon card */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center max-w-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/20">
          <span className="text-xl font-bold text-brand-gold">+</span>
        </div>
        <h2 className="text-lg font-semibold mb-2">Client Intake Form</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          The full client onboarding form is coming soon. It will capture
          business details, entity type, contact information, and funding
          readiness assessment.
        </p>
      </div>
    </div>
  );
}
