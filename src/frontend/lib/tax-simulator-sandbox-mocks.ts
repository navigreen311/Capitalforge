// ============================================================
// CapitalForge Tax / Simulator / Sandbox Mock Data
// ============================================================
// Mock data for tax summary, simulator presets, and sandbox
// archetype endpoints.
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true.
// ============================================================

// ── Tax Summary ──────────────────────────────────────────────────────────

const MOCK_TAX_SUMMARY = {
  irc_163j: {
    total_interest: 92400,
    deductible: 78200,
    non_deductible: 14200,
    carryforward: 14200,
    ati_basis: 2840000,
  },
  cards: [
    {
      id: 'card_tax_001',
      name: 'Ink Business Preferred',
      issuer: 'Chase',
      total_interest: 54200,
      deductible: 48600,
      non_deductible: 5600,
      deductible_pct: 89.7,
    },
    {
      id: 'card_tax_002',
      name: 'Business Platinum',
      issuer: 'American Express',
      total_interest: 38200,
      deductible: 29600,
      non_deductible: 8600,
      deductible_pct: 77.5,
    },
  ],
  fee_summary: [
    {
      card_name: 'Ink Business Preferred',
      annual_fee: 95,
      late_fee: 0,
      foreign_tx_fee: 0,
      total: 95,
      deductible: 95,
    },
    {
      card_name: 'Business Platinum',
      annual_fee: 695,
      late_fee: 39,
      foreign_tx_fee: 124,
      total: 858,
      deductible: 819,
    },
    {
      card_name: 'Capital One Spark Cash Plus',
      annual_fee: 150,
      late_fee: 0,
      foreign_tx_fee: 0,
      total: 150,
      deductible: 150,
    },
  ],
  substantiation: [
    { category: 'Travel', compliance_pct: 96 },
    { category: 'SaaS', compliance_pct: 100 },
    { category: 'Meals & Entertainment', compliance_pct: 66 },
    { category: 'Office', compliance_pct: 94 },
    { category: 'Shipping', compliance_pct: 74 },
    { category: 'Advertising', compliance_pct: 81 },
  ],
  last_updated: new Date().toISOString(),
};

// ── Simulator Presets ────────────────────────────────────────────────────

const MOCK_SIMULATOR_PRESETS = {
  presets: [
    {
      id: 'preset_conservative',
      name: 'Conservative',
      description: 'Low-risk profile with moderate credit capacity.',
      fico: 700,
      revenue: 500000,
      revenue_label: '$500K',
      target_credit: 75000,
      target_label: '$75K',
    },
    {
      id: 'preset_moderate',
      name: 'Moderate',
      description: 'Balanced risk/reward with strong credit profile.',
      fico: 720,
      revenue: 850000,
      revenue_label: '$850K',
      target_credit: 150000,
      target_label: '$150K',
    },
    {
      id: 'preset_aggressive',
      name: 'Aggressive',
      description: 'High-growth strategy maximizing credit capacity.',
      fico: 750,
      revenue: 1200000,
      revenue_label: '$1.2M',
      target_credit: 300000,
      target_label: '$300K',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Sandbox Archetypes ───────────────────────────────────────────────────
// Mirrors the 5 core archetypes from the sandbox page for API consistency.

type FicoTier = 'Excellent' | 'Good' | 'Fair' | 'Poor';
type Industry = 'Retail' | 'Tech' | 'Healthcare' | 'Food & Bev' | 'Construction';

interface SandboxArchetype {
  id: number;
  name: string;
  ficoTier: FicoTier;
  fico: number;
  industry: Industry;
  revenue: string;
  revenueRaw: number;
  description: string;
}

const MOCK_SANDBOX_ARCHETYPES: { archetypes: SandboxArchetype[]; last_updated: string } = {
  archetypes: [
    {
      id: 1,
      name: 'Alpha Profile',
      ficoTier: 'Excellent',
      fico: 780,
      industry: 'Tech',
      revenue: '$1.2M',
      revenueRaw: 1200000,
      description: 'Excellent credit, Tech operator at $1.2M revenue.',
    },
    {
      id: 2,
      name: 'Beta Archetype',
      ficoTier: 'Good',
      fico: 710,
      industry: 'Retail',
      revenue: '$650k',
      revenueRaw: 650000,
      description: 'Good credit, Retail operator at $650k revenue.',
    },
    {
      id: 3,
      name: 'Gamma Case',
      ficoTier: 'Fair',
      fico: 620,
      industry: 'Food & Bev',
      revenue: '$320k',
      revenueRaw: 320000,
      description: 'Fair credit, Food & Bev operator at $320k revenue.',
    },
    {
      id: 4,
      name: 'Delta Scenario',
      ficoTier: 'Good',
      fico: 690,
      industry: 'Construction',
      revenue: '$890k',
      revenueRaw: 890000,
      description: 'Good credit, Construction operator at $890k revenue.',
    },
    {
      id: 5,
      name: 'Epsilon Model',
      ficoTier: 'Excellent',
      fico: 760,
      industry: 'Healthcare',
      revenue: '$1.5M',
      revenueRaw: 1500000,
      description: 'Excellent credit, Healthcare operator at $1.5M revenue.',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Endpoint → Mock data map ──────────────────────────────────────────────

const TAX_SIM_SANDBOX_MOCK_MAP: Record<string, unknown> = {
  '/api/v1/tax/summary': MOCK_TAX_SUMMARY,
  '/api/v1/simulator/presets': MOCK_SIMULATOR_PRESETS,
  '/api/v1/sandbox/archetypes': MOCK_SANDBOX_ARCHETYPES,
};

// ── Resolver ──────────────────────────────────────────────────────────────

export function getTaxSimSandboxMockData(endpoint: string): unknown | null {
  // Direct key match first
  const direct = TAX_SIM_SANDBOX_MOCK_MAP[endpoint];
  if (direct !== undefined) return direct;

  // Substring-based fallback for sub-paths
  if (endpoint.includes('/tax/summary')) return MOCK_TAX_SUMMARY;
  if (endpoint.includes('/simulator/presets')) return MOCK_SIMULATOR_PRESETS;
  if (endpoint.includes('/sandbox/archetypes')) return MOCK_SANDBOX_ARCHETYPES;

  return null;
}
