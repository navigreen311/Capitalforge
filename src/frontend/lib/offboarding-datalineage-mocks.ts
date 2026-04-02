// ============================================================
// CapitalForge Offboarding & Data Lineage Mock Data
// ============================================================
// Mock data for /api/v1/offboarding and /api/v1/lineage endpoints.
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true.
// ============================================================

// ── Exit Interview Analytics ──────────────────────────────────

const MOCK_EXIT_INTERVIEW_ANALYTICS = {
  avgNps: 6.0,
  promoters: 25,
  passives: 25,
  detractors: 50,
  topReasons: [
    { reason: 'Pricing concerns', count: 2 },
    { reason: 'Found alternative funding', count: 1 },
    { reason: 'M&A — acquired', count: 1 },
  ],
  reEngagementCount: 1,
  estimatedReturnRevenue: 45000,
};

// ── Lineage Graph ─────────────────────────────────────────────

const MOCK_LINEAGE_GRAPH = {
  nodes: [
    // Sources (column 0) — blue
    {
      id: 'src-crm',
      name: 'CRM Database',
      type: 'source' as const,
      column: 0,
      fields: [
        { name: 'client_id',   dataType: 'uuid',      nullable: false, lastUpdated: '2026-03-31T08:14:00Z', origin: 'Salesforce' },
        { name: 'name',        dataType: 'varchar',    nullable: false, lastUpdated: '2026-03-31T08:14:00Z', origin: 'Salesforce' },
        { name: 'fico',        dataType: 'integer',    nullable: true,  lastUpdated: '2026-03-31T08:14:00Z', origin: 'Salesforce' },
      ],
    },
    {
      id: 'src-bureau',
      name: 'Credit Bureau Feed',
      type: 'source' as const,
      column: 0,
      fields: [
        { name: 'ssn_hash',       dataType: 'varchar',  nullable: false, lastUpdated: '2026-03-31T06:00:00Z', origin: 'Experian' },
        { name: 'fico_score',     dataType: 'integer',  nullable: false, lastUpdated: '2026-03-31T06:00:00Z', origin: 'Experian' },
        { name: 'inquiry_count',  dataType: 'integer',  nullable: false, lastUpdated: '2026-03-31T06:00:00Z', origin: 'TransUnion' },
      ],
    },
    {
      id: 'src-bank',
      name: 'Bank Statement API',
      type: 'source' as const,
      column: 0,
      fields: [
        { name: 'account_id',         dataType: 'uuid',    nullable: false, lastUpdated: '2026-03-31T07:45:00Z', origin: 'Plaid' },
        { name: 'balance',            dataType: 'decimal',  nullable: false, lastUpdated: '2026-03-31T07:45:00Z', origin: 'Plaid' },
        { name: 'avg_monthly_revenue', dataType: 'decimal', nullable: true,  lastUpdated: '2026-03-31T07:45:00Z', origin: 'Plaid' },
      ],
    },

    // Transforms (column 1) — purple
    {
      id: 'tx-enrich',
      name: 'Profile Enrichment',
      type: 'transform' as const,
      column: 1,
      fields: [
        { name: 'enriched_fico',         dataType: 'integer', nullable: false, lastUpdated: '2026-03-31T08:20:00Z', origin: 'computed' },
        { name: 'dti_ratio',             dataType: 'decimal', nullable: false, lastUpdated: '2026-03-31T08:20:00Z', origin: 'computed' },
        { name: 'approval_probability',  dataType: 'decimal', nullable: false, lastUpdated: '2026-03-31T08:20:00Z', origin: 'computed' },
      ],
    },
    {
      id: 'tx-score',
      name: 'Scoring Engine',
      type: 'transform' as const,
      column: 1,
      fields: [
        { name: 'score_v2',     dataType: 'decimal', nullable: false, lastUpdated: '2026-03-31T08:22:00Z', origin: 'ML model v2.4' },
        { name: 'confidence',   dataType: 'decimal', nullable: false, lastUpdated: '2026-03-31T08:22:00Z', origin: 'ML model v2.4' },
        { name: 'model_version', dataType: 'varchar', nullable: false, lastUpdated: '2026-03-31T08:22:00Z', origin: 'ML model v2.4' },
      ],
    },
    {
      id: 'tx-match',
      name: 'Product Matcher',
      type: 'transform' as const,
      column: 1,
      fields: [
        { name: 'card_recommendations', dataType: 'jsonb',   nullable: false, lastUpdated: '2026-03-31T08:25:00Z', origin: 'rules engine' },
        { name: 'max_limit_estimate',   dataType: 'decimal', nullable: false, lastUpdated: '2026-03-31T08:25:00Z', origin: 'rules engine' },
        { name: 'round_sequence',       dataType: 'integer', nullable: false, lastUpdated: '2026-03-31T08:25:00Z', origin: 'rules engine' },
      ],
    },

    // Outputs (column 2) — teal
    {
      id: 'out-api',
      name: 'Advisor API',
      type: 'output' as const,
      column: 2,
      fields: [
        { name: 'client_profile',        dataType: 'jsonb',   nullable: false, lastUpdated: '2026-03-31T08:26:00Z', origin: 'tx-match' },
        { name: 'recommendations',       dataType: 'jsonb',   nullable: false, lastUpdated: '2026-03-31T08:26:00Z', origin: 'tx-match' },
        { name: 'approval_probability',  dataType: 'decimal', nullable: false, lastUpdated: '2026-03-31T08:26:00Z', origin: 'tx-enrich' },
      ],
    },
    {
      id: 'out-dw',
      name: 'Data Warehouse',
      type: 'output' as const,
      column: 2,
      fields: [
        { name: 'all_enriched_fields', dataType: 'jsonb',   nullable: false, lastUpdated: '2026-03-31T08:26:00Z', origin: 'tx-enrich' },
        { name: 'audit_trail',         dataType: 'jsonb',   nullable: false, lastUpdated: '2026-03-31T08:26:00Z', origin: 'system' },
        { name: 'model_outputs',       dataType: 'jsonb',   nullable: false, lastUpdated: '2026-03-31T08:26:00Z', origin: 'tx-score' },
      ],
    },
    {
      id: 'out-report',
      name: 'Compliance Reports',
      type: 'output' as const,
      column: 2,
      fields: [
        { name: 'adverse_action',     dataType: 'jsonb',   nullable: false, lastUpdated: '2026-03-31T08:27:00Z', origin: 'tx-score' },
        { name: 'fair_lending_flags', dataType: 'jsonb',   nullable: true,  lastUpdated: '2026-03-31T08:27:00Z', origin: 'tx-score' },
        { name: 'regulatory_id',     dataType: 'varchar',  nullable: false, lastUpdated: '2026-03-31T08:27:00Z', origin: 'system' },
      ],
    },
  ],
  edges: [
    { from: 'src-crm',    to: 'tx-enrich'  },
    { from: 'src-bureau', to: 'tx-enrich'  },
    { from: 'src-bank',   to: 'tx-enrich'  },
    { from: 'tx-enrich',  to: 'tx-score'   },
    { from: 'tx-score',   to: 'tx-match'   },
    { from: 'tx-match',   to: 'out-api'    },
    { from: 'tx-match',   to: 'out-dw'     },
    { from: 'tx-enrich',  to: 'out-dw'     },
    { from: 'tx-score',   to: 'out-report' },
  ],
};

// ── Lineage Snapshots ─────────────────────────────────────────

const MOCK_LINEAGE_SNAPSHOTS = {
  snapshots: [
    {
      id: 'snap-001',
      name: 'Pre-Q1-Audit',
      takenAt: '2026-03-01T09:00:00Z',
      nodeCount: 9,
      edgeCount: 9,
    },
    {
      id: 'snap-002',
      name: 'Post-CreditBureau-Update',
      takenAt: '2026-02-15T14:30:00Z',
      nodeCount: 9,
      edgeCount: 8,
    },
    {
      id: 'snap-003',
      name: 'Baseline-Jan-2026',
      takenAt: '2026-01-10T08:00:00Z',
      nodeCount: 7,
      edgeCount: 7,
    },
  ],
};

// ── Lineage Alerts ────────────────────────────────────────────

const MOCK_LINEAGE_ALERTS = {
  alerts: [
    {
      id: 'la-001',
      field: 'inquiry_count',
      source: 'Credit Bureau Feed',
      changeType: 'Schema Change' as const,
      severity: 'Critical' as const,
      detectedAt: '2026-03-30T14:22:00Z',
      status: 'Open' as const,
    },
    {
      id: 'la-002',
      field: 'fico_score',
      source: 'Credit Bureau Feed',
      changeType: 'Value Drift' as const,
      severity: 'Warning' as const,
      detectedAt: '2026-03-31T06:12:00Z',
      status: 'Acknowledged' as const,
    },
    {
      id: 'la-003',
      field: 'avg_monthly_revenue',
      source: 'Bank Statement API',
      changeType: 'Null Spike' as const,
      severity: 'Critical' as const,
      detectedAt: '2026-03-31T07:55:00Z',
      status: 'Open' as const,
    },
    {
      id: 'la-004',
      field: 'industry',
      source: 'CRM Database',
      changeType: 'Format Change' as const,
      severity: 'Info' as const,
      detectedAt: '2026-03-29T09:44:00Z',
      status: 'Resolved' as const,
    },
  ],
};

// ── Router ────────────────────────────────────────────────────

const ENDPOINT_MAP: Record<string, unknown> = {
  'offboarding/exit-interviews/analytics': MOCK_EXIT_INTERVIEW_ANALYTICS,
  'lineage/graph':                         MOCK_LINEAGE_GRAPH,
  'lineage/snapshots':                     MOCK_LINEAGE_SNAPSHOTS,
  'lineage/alerts':                        MOCK_LINEAGE_ALERTS,
};

/**
 * Returns mock data for offboarding and data-lineage endpoints.
 * Called from getDashboardMockData when the endpoint contains
 * `/offboarding/` or `/lineage/`.
 */
export function getOffboardingLineageMockData(endpoint: string): unknown | null {
  for (const [key, value] of Object.entries(ENDPOINT_MAP)) {
    if (endpoint.includes(key)) return value;
  }
  return null;
}
