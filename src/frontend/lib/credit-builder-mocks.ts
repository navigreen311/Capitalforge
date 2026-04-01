// ============================================================
// CapitalForge Credit Builder Mock Data
// ============================================================
// Mock data for credit builder progress and tradelines.
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true.
// ============================================================

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Credit Builder Progress ──────────────────────────────────

export const MOCK_CREDIT_BUILDER_PROGRESS = {
  steps: [
    { id: 'step_001', name: 'EIN Registration', order: 1, completed: true, completedAt: daysFromNow(-90) },
    { id: 'step_002', name: 'DUNS Number', order: 2, completed: true, completedAt: daysFromNow(-75) },
    { id: 'step_003', name: 'Business Bank Account', order: 3, completed: true, completedAt: daysFromNow(-60) },
    { id: 'step_004', name: 'Starter Vendor Accounts', order: 4, completed: false, completedAt: null },
    { id: 'step_005', name: 'Net-30 Trade References', order: 5, completed: false, completedAt: null },
    { id: 'step_006', name: 'Business Credit Card', order: 6, completed: false, completedAt: null },
  ],
  scores: {
    paydex: { value: 72, maxScore: 100, pullDate: daysFromNow(-7) },
    experian_business: { value: 54, maxScore: 100, pullDate: daysFromNow(-7) },
    sbss: { value: 148, maxScore: 300, pullDate: daysFromNow(-7) },
  },
  tier1_unlocked: false,
  tier2_unlocked: false,
  tier3_unlocked: false,
  overall_progress_pct: 50,
};

// ── Tradelines ───────────────────────────────────────────────

export const MOCK_TRADELINES = {
  tradelines: [
    {
      id: 'tl_001',
      vendor: 'Uline',
      status: 'reporting' as const,
      creditLimit: 2500,
      dateOpened: daysFromNow(-45),
      paymentHistory: 'On Time',
    },
    {
      id: 'tl_002',
      vendor: 'Quill',
      status: 'reporting' as const,
      creditLimit: 1500,
      dateOpened: daysFromNow(-30),
      paymentHistory: 'On Time',
    },
    {
      id: 'tl_003',
      vendor: 'Crown Office Supplies',
      status: 'applied' as const,
      creditLimit: null,
      dateOpened: null,
      paymentHistory: null,
    },
  ],
  summary: {
    total: 3,
    reporting: 2,
    applied: 1,
    needed: 5,
    avg_payment: 'On Time',
  },
};

// ── Endpoint → mock data map ─────────────────────────────────

export const CREDIT_BUILDER_MOCK_MAP: Record<string, unknown> = {
  'clients/{id}/credit-builder-progress': MOCK_CREDIT_BUILDER_PROGRESS,
  'clients/{id}/tradelines': MOCK_TRADELINES,
};

// ── Resolver ─────────────────────────────────────────────────

export function getCreditBuilderMockData(
  endpoint: string,
): unknown | null {
  const normalized = endpoint.replace(/^\/api\/v1\//, '');
  const withPlaceholder = normalized.replace(/^clients\/[^/]+/, 'clients/{id}');
  return CREDIT_BUILDER_MOCK_MAP[withPlaceholder] ?? null;
}
