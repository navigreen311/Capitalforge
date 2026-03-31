// ============================================================
// CapitalForge — Audit-Ready Data Lineage Map
//
// Builds an end-to-end data lineage graph for all financial
// calculations in the platform:
//
//   • LineageNode — a data source, transformation, or output
//   • LineageEdge — directed dependency between nodes
//   • LineageGraph — the full DAG for a business
//
// Capabilities:
//   • Column-level lineage for every financial field
//     (e.g. costCalculation.effectiveApr → irc163j.deductibilityLimit)
//   • Regulator-export format: on-demand serialisation for any
//     field path (e.g. "costCalculation.totalCost")
//   • Change-detection alerts: compares current upstream values
//     against a stored snapshot and surfaces diffs
//
// Not a replacement for a dedicated data catalog. For
// production use, consider integrating with OpenLineage /
// Marquez for full Iceberg / dbt lineage federation.
// ============================================================

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NodeKind =
  | 'source'         // raw database record (e.g. CostCalculation, CardApplication)
  | 'transformation' // computation step (e.g. §163(j) ATI multiplication)
  | 'output';        // final derived field surfaced to UI / export

export interface LineageNode {
  id: string;                   // stable identifier, e.g. "costCalculation.totalCost"
  label: string;                // human-readable name
  kind: NodeKind;
  model?: string;               // Prisma model name, if kind = 'source'
  field?: string;               // column name within the model
  formula?: string;             // formula / business rule for transformations
  dataType: string;             // TypeScript type of the value
  description: string;
  tags: string[];               // e.g. ["tax", "irc163j", "interest"]
  currentValue?: unknown;       // populated when resolving for a specific business
  capturedAt?: Date;
}

export interface LineageEdge {
  fromNodeId: string;
  toNodeId: string;
  transformationLabel: string;  // describes how the upstream feeds the downstream
  isColumnLevel: boolean;       // true = exact column mapping; false = aggregate
}

export interface LineageGraph {
  businessId: string;
  generatedAt: Date;
  nodes: LineageNode[];
  edges: LineageEdge[];
  /** Top-level outputs — the endpoints of the DAG */
  outputs: string[];
}

export interface FieldLineage {
  fieldPath: string;           // e.g. "irc163j.deductibleInterest"
  businessId: string;
  resolvedAt: Date;
  node: LineageNode;
  upstreamChain: LineageNode[];
  edges: LineageEdge[];
  currentValue: unknown;
  regulatorExport: RegulatoryLineageExport;
}

export interface RegulatoryLineageExport {
  fieldPath: string;
  fieldLabel: string;
  currentValue: unknown;
  resolvedAt: string;           // ISO 8601
  dataProvenance: Array<{
    step: number;
    nodeId: string;
    nodeLabel: string;
    kind: NodeKind;
    model?: string;
    field?: string;
    formula?: string;
    transformationLabel: string;
  }>;
  attestation: string;
}

export interface ChangeAlert {
  fieldPath: string;
  alertedAt: Date;
  previousValue: unknown;
  currentValue: unknown;
  delta: number | null;        // numeric delta if applicable
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface ChangeDetectionResult {
  businessId: string;
  checkedAt: Date;
  snapshotAge: string;
  alerts: ChangeAlert[];
  hasChanges: boolean;
}

// ── Lineage Catalog ───────────────────────────────────────────────────────────
//
// Static catalog of all known nodes. Loaded once and supplemented
// with live values when resolving for a specific business.
//
// Node IDs follow the convention: "<model>.<field>" for source nodes,
// "<rule>.<output>" for transformation/output nodes.

const LINEAGE_CATALOG: LineageNode[] = [
  // ── Source nodes: CostCalculation ───────────────────────────
  {
    id: 'costCalc.programFees',
    label: 'Program Fees',
    kind: 'source',
    model: 'CostCalculation',
    field: 'programFees',
    dataType: 'Decimal',
    description: 'One-time program / broker fee charged to the business.',
    tags: ['cost', 'fees', 'program'],
  },
  {
    id: 'costCalc.annualFees',
    label: 'Annual Card Fees',
    kind: 'source',
    model: 'CostCalculation',
    field: 'annualFees',
    dataType: 'Decimal',
    description: 'Sum of annual card fees across the entire credit stack.',
    tags: ['cost', 'fees', 'annual'],
  },
  {
    id: 'costCalc.cashAdvanceFees',
    label: 'Cash Advance Fees',
    kind: 'source',
    model: 'CostCalculation',
    field: 'cashAdvanceFees',
    dataType: 'Decimal',
    description: 'Total cash advance fees across all cards.',
    tags: ['cost', 'fees', 'cash_advance', 'interest'],
  },
  {
    id: 'costCalc.processorFees',
    label: 'Processor Fees',
    kind: 'source',
    model: 'CostCalculation',
    field: 'processorFees',
    dataType: 'Decimal',
    description: 'Monthly processor fees (e.g. Stripe / Square) projected over the period.',
    tags: ['cost', 'fees', 'processor'],
  },
  {
    id: 'costCalc.totalCost',
    label: 'Total Cost of Capital',
    kind: 'source',
    model: 'CostCalculation',
    field: 'totalCost',
    dataType: 'Decimal',
    description: 'All-in total cost: program + percent-of-funding + annual + CA + processor fees.',
    tags: ['cost', 'total'],
  },
  {
    id: 'costCalc.effectiveApr',
    label: 'Effective APR',
    kind: 'source',
    model: 'CostCalculation',
    field: 'effectiveApr',
    dataType: 'Decimal',
    description: 'Blended effective APR across the full credit card stack.',
    tags: ['cost', 'apr', 'interest'],
  },
  {
    id: 'costCalc.irc163jImpact',
    label: 'IRC §163(j) Impact (Stored)',
    kind: 'source',
    model: 'CostCalculation',
    field: 'irc163jImpact',
    dataType: 'Decimal',
    description: 'Pre-computed §163(j) deductibility impact stored at calculation time.',
    tags: ['tax', 'irc163j'],
  },

  // ── Source nodes: CardApplication ───────────────────────────
  {
    id: 'cardApp.annualFee',
    label: 'Card Annual Fee',
    kind: 'source',
    model: 'CardApplication',
    field: 'annualFee',
    dataType: 'Decimal',
    description: 'Per-card annual fee from the issuer\'s terms.',
    tags: ['card', 'fees', 'annual'],
  },
  {
    id: 'cardApp.creditLimit',
    label: 'Card Credit Limit',
    kind: 'source',
    model: 'CardApplication',
    field: 'creditLimit',
    dataType: 'Decimal',
    description: 'Approved credit limit for this card application.',
    tags: ['card', 'credit'],
  },
  {
    id: 'cardApp.regularApr',
    label: 'Card Regular APR',
    kind: 'source',
    model: 'CardApplication',
    field: 'regularApr',
    dataType: 'Decimal',
    description: 'Post-promotional purchase APR for this card.',
    tags: ['card', 'apr', 'interest'],
  },
  {
    id: 'cardApp.introApr',
    label: 'Card Intro APR',
    kind: 'source',
    model: 'CardApplication',
    field: 'introApr',
    dataType: 'Decimal',
    description: 'Promotional introductory APR (often 0%).',
    tags: ['card', 'apr', 'promo'],
  },

  // ── Source nodes: SpendTransaction ──────────────────────────
  {
    id: 'spend.amount',
    label: 'Transaction Amount',
    kind: 'source',
    model: 'SpendTransaction',
    field: 'amount',
    dataType: 'Decimal',
    description: 'Dollar amount of the spend transaction.',
    tags: ['spend', 'transaction'],
  },
  {
    id: 'spend.businessPurpose',
    label: 'Business Purpose',
    kind: 'source',
    model: 'SpendTransaction',
    field: 'businessPurpose',
    dataType: 'String',
    description: 'Free-text business purpose for tax substantiation.',
    tags: ['spend', 'tax', 'substantiation'],
  },
  {
    id: 'spend.isCashLike',
    label: 'Is Cash-Like',
    kind: 'source',
    model: 'SpendTransaction',
    field: 'isCashLike',
    dataType: 'Boolean',
    description: 'Flags transactions classified as cash-like by MCC.',
    tags: ['spend', 'compliance', 'cash_advance'],
  },

  // ── Source nodes: Business ───────────────────────────────────
  {
    id: 'business.annualRevenue',
    label: 'Annual Revenue',
    kind: 'source',
    model: 'Business',
    field: 'annualRevenue',
    dataType: 'Decimal',
    description: 'Self-reported annual revenue used in §163(j) ATI estimation.',
    tags: ['business', 'revenue', 'irc163j'],
  },
  {
    id: 'business.entityType',
    label: 'Entity Type',
    kind: 'source',
    model: 'Business',
    field: 'entityType',
    dataType: 'String',
    description: 'Legal entity type affecting tax treatment (C-Corp, S-Corp, LLC, etc.).',
    tags: ['business', 'tax'],
  },

  // ── Transformation nodes: IRC §163(j) ───────────────────────
  {
    id: 'irc163j.atiComponent',
    label: '30% × ATI Component',
    kind: 'transformation',
    formula: 'max(0, adjustedTaxableIncome) × 0.30',
    dataType: 'number',
    description: 'The 30%-of-ATI portion of the §163(j) deductibility cap.',
    tags: ['tax', 'irc163j', 'computation'],
  },
  {
    id: 'irc163j.deductibilityLimit',
    label: '§163(j) Deductibility Limit',
    kind: 'transformation',
    formula: 'businessInterestIncome + floorPlanFinancingInterest + (ATI × 0.30)',
    dataType: 'number',
    description: 'Maximum deductible business interest expense for the year.',
    tags: ['tax', 'irc163j', 'limit'],
  },
  {
    id: 'irc163j.totalInterestSubjectToLimit',
    label: 'Total Interest Subject to §163(j)',
    kind: 'transformation',
    formula: 'businessInterestExpense + priorYearCarryforward',
    dataType: 'number',
    description: 'All interest entering the §163(j) test this year.',
    tags: ['tax', 'irc163j', 'interest'],
  },
  {
    id: 'irc163j.deductibleInterest',
    label: 'Deductible Interest (§163(j))',
    kind: 'transformation',
    formula: 'min(totalInterestSubjectToLimit, deductibilityLimit)',
    dataType: 'number',
    description: 'Business interest expense actually deductible this year.',
    tags: ['tax', 'irc163j', 'deduction'],
  },
  {
    id: 'irc163j.disallowedAmount',
    label: 'Disallowed Amount (Carryforward)',
    kind: 'transformation',
    formula: 'max(0, totalInterestSubjectToLimit - deductibilityLimit)',
    dataType: 'number',
    description: 'Interest denied this year — carried forward indefinitely.',
    tags: ['tax', 'irc163j', 'carryforward'],
  },

  // ── Output nodes ────────────────────────────────────────────
  {
    id: 'taxReport.irc163jReport',
    label: 'IRC §163(j) Report',
    kind: 'output',
    dataType: 'IRC163jReport',
    description: 'Final accountant-ready §163(j) deductibility report.',
    tags: ['tax', 'output', 'irc163j'],
  },
  {
    id: 'taxReport.yearEndSummary',
    label: 'Year-End Fee Summary',
    kind: 'output',
    dataType: 'YearEndFeeSummary',
    description: 'Aggregated fee breakdown by card for the tax year.',
    tags: ['tax', 'output', 'fees'],
  },
  {
    id: 'taxReport.businessPurposeSummary',
    label: 'Business Purpose Summary',
    kind: 'output',
    dataType: 'BusinessPurposeSummary',
    description: 'Tax substantiation summary for all spend transactions.',
    tags: ['tax', 'output', 'substantiation'],
  },
  {
    id: 'taxReport.exportPackage',
    label: 'Tax Export Package',
    kind: 'output',
    dataType: 'TaxExportPackage',
    description: 'Complete JSON/CSV export package for the tax preparer.',
    tags: ['tax', 'output', 'export'],
  },
];

// ── Edge Catalog ──────────────────────────────────────────────────────────────

const LINEAGE_EDGES: LineageEdge[] = [
  // CostCalculation → §163(j) transformation
  {
    fromNodeId: 'costCalc.cashAdvanceFees',
    toNodeId: 'irc163j.totalInterestSubjectToLimit',
    transformationLabel: 'Included in total business interest entering §163(j) test',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'costCalc.effectiveApr',
    toNodeId: 'irc163j.atiComponent',
    transformationLabel: 'Informs ATI estimation when explicit ATI not provided',
    isColumnLevel: false,
  },
  {
    fromNodeId: 'business.annualRevenue',
    toNodeId: 'irc163j.atiComponent',
    transformationLabel: 'Proxy for ATI when CPA-computed ATI is unavailable',
    isColumnLevel: false,
  },

  // §163(j) transformations chained
  {
    fromNodeId: 'irc163j.atiComponent',
    toNodeId: 'irc163j.deductibilityLimit',
    transformationLabel: 'Added to interest income and floor plan financing to form cap',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'irc163j.totalInterestSubjectToLimit',
    toNodeId: 'irc163j.deductibleInterest',
    transformationLabel: 'min(totalInterest, cap) — §163(j)(1)',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'irc163j.deductibilityLimit',
    toNodeId: 'irc163j.deductibleInterest',
    transformationLabel: 'min(totalInterest, cap) — §163(j)(1)',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'irc163j.totalInterestSubjectToLimit',
    toNodeId: 'irc163j.disallowedAmount',
    transformationLabel: 'max(0, total - cap) — excess becomes carryforward',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'irc163j.deductibilityLimit',
    toNodeId: 'irc163j.disallowedAmount',
    transformationLabel: 'max(0, total - cap) — excess becomes carryforward',
    isColumnLevel: true,
  },

  // Sources → Year-End output
  {
    fromNodeId: 'cardApp.annualFee',
    toNodeId: 'taxReport.yearEndSummary',
    transformationLabel: 'Summed across all approved card applications',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'cardApp.creditLimit',
    toNodeId: 'taxReport.yearEndSummary',
    transformationLabel: 'Reported per-card in the fee summary',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'costCalc.programFees',
    toNodeId: 'taxReport.yearEndSummary',
    transformationLabel: 'Included in total program fees line item',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'costCalc.processorFees',
    toNodeId: 'taxReport.yearEndSummary',
    transformationLabel: 'Included in processor fees line item',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'costCalc.totalCost',
    toNodeId: 'taxReport.yearEndSummary',
    transformationLabel: 'Reported as grand total cost for the year',
    isColumnLevel: true,
  },

  // Sources → Business Purpose output
  {
    fromNodeId: 'spend.amount',
    toNodeId: 'taxReport.businessPurposeSummary',
    transformationLabel: 'Aggregated to compute total and documented amounts',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'spend.businessPurpose',
    toNodeId: 'taxReport.businessPurposeSummary',
    transformationLabel: 'Presence/absence drives substantiation score',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'spend.isCashLike',
    toNodeId: 'taxReport.businessPurposeSummary',
    transformationLabel: 'Cash-like flag reduces substantiation score',
    isColumnLevel: true,
  },

  // §163(j) computation → 163j report output
  {
    fromNodeId: 'irc163j.deductibleInterest',
    toNodeId: 'taxReport.irc163jReport',
    transformationLabel: 'Primary output of §163(j) computation',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'irc163j.disallowedAmount',
    toNodeId: 'taxReport.irc163jReport',
    transformationLabel: 'Carryforward amount reported in §163(j) report',
    isColumnLevel: true,
  },
  {
    fromNodeId: 'business.entityType',
    toNodeId: 'taxReport.irc163jReport',
    transformationLabel: 'Reported for entity-type-specific tax notes',
    isColumnLevel: true,
  },

  // Individual reports → export package
  {
    fromNodeId: 'taxReport.irc163jReport',
    toNodeId: 'taxReport.exportPackage',
    transformationLabel: 'Embedded as optional component of export package',
    isColumnLevel: false,
  },
  {
    fromNodeId: 'taxReport.yearEndSummary',
    toNodeId: 'taxReport.exportPackage',
    transformationLabel: 'Always included in export package',
    isColumnLevel: false,
  },
  {
    fromNodeId: 'taxReport.businessPurposeSummary',
    toNodeId: 'taxReport.exportPackage',
    transformationLabel: 'Always included in export package',
    isColumnLevel: false,
  },
];

// ── Service Class ─────────────────────────────────────────────────────────────

export class DataLineageService {
  // ── Full Lineage Graph ────────────────────────────────────────────────────────

  async buildLineageGraph(businessId: string, tenantId: string): Promise<LineageGraph> {
    logger.info('Building data lineage graph', { businessId, tenantId });

    // Verify business exists
    const business = await prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: {
        id: true,
        annualRevenue: true,
        entityType: true,
      },
    });
    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    // Fetch latest cost calculation for current values
    const costCalc = await prisma.costCalculation.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch a sample of card applications
    const cardApps = await prisma.cardApplication.findMany({
      where: { businessId, status: { in: ['approved', 'active', 'funded'] } },
      take: 5,
      orderBy: { decidedAt: 'desc' },
    });

    // Annotate source nodes with current values
    const enrichedNodes: LineageNode[] = LINEAGE_CATALOG.map((node) => {
      const enriched = { ...node };

      if (costCalc) {
        switch (node.id) {
          case 'costCalc.programFees':
            enriched.currentValue = costCalc.programFees;
            enriched.capturedAt = costCalc.createdAt;
            break;
          case 'costCalc.annualFees':
            enriched.currentValue = costCalc.annualFees;
            enriched.capturedAt = costCalc.createdAt;
            break;
          case 'costCalc.cashAdvanceFees':
            enriched.currentValue = costCalc.cashAdvanceFees;
            enriched.capturedAt = costCalc.createdAt;
            break;
          case 'costCalc.processorFees':
            enriched.currentValue = costCalc.processorFees;
            enriched.capturedAt = costCalc.createdAt;
            break;
          case 'costCalc.totalCost':
            enriched.currentValue = costCalc.totalCost;
            enriched.capturedAt = costCalc.createdAt;
            break;
          case 'costCalc.effectiveApr':
            enriched.currentValue = costCalc.effectiveApr;
            enriched.capturedAt = costCalc.createdAt;
            break;
          case 'costCalc.irc163jImpact':
            enriched.currentValue = costCalc.irc163jImpact;
            enriched.capturedAt = costCalc.createdAt;
            break;
        }
      }

      if (cardApps.length > 0) {
        const first = cardApps[0];
        switch (node.id) {
          case 'cardApp.annualFee':
            enriched.currentValue = cardApps.map((c) => Number(c.annualFee ?? 0));
            enriched.capturedAt = first.updatedAt;
            break;
          case 'cardApp.creditLimit':
            enriched.currentValue = cardApps.map((c) => Number(c.creditLimit ?? 0));
            enriched.capturedAt = first.updatedAt;
            break;
          case 'cardApp.regularApr':
            enriched.currentValue = cardApps.map((c) => Number(c.regularApr ?? 0));
            enriched.capturedAt = first.updatedAt;
            break;
          case 'cardApp.introApr':
            enriched.currentValue = cardApps.map((c) => Number(c.introApr ?? 0));
            enriched.capturedAt = first.updatedAt;
            break;
        }
      }

      if (node.id === 'business.annualRevenue') {
        enriched.currentValue = business.annualRevenue;
      }
      if (node.id === 'business.entityType') {
        enriched.currentValue = business.entityType;
      }

      return enriched;
    });

    return {
      businessId,
      generatedAt: new Date(),
      nodes: enrichedNodes,
      edges: LINEAGE_EDGES,
      outputs: [
        'taxReport.exportPackage',
        'taxReport.irc163jReport',
        'taxReport.yearEndSummary',
        'taxReport.businessPurposeSummary',
      ],
    };
  }

  // ── Field-Level Lineage ───────────────────────────────────────────────────────

  async getFieldLineage(
    businessId: string,
    tenantId: string,
    fieldPath: string,
  ): Promise<FieldLineage> {
    logger.info('Resolving field lineage', { businessId, tenantId, fieldPath });

    const graph = await this.buildLineageGraph(businessId, tenantId);

    const targetNode = graph.nodes.find((n) => n.id === fieldPath);
    if (!targetNode) {
      throw new Error(
        `Field path "${fieldPath}" not found in lineage catalog. ` +
          `Available nodes: ${graph.nodes.map((n) => n.id).join(', ')}`,
      );
    }

    // Walk the graph backwards to find all upstream nodes
    const upstreamChain = resolveUpstreamChain(fieldPath, graph.nodes, graph.edges);
    const relevantEdges = graph.edges.filter(
      (e) =>
        upstreamChain.some((n) => n.id === e.fromNodeId) ||
        e.toNodeId === fieldPath,
    );

    const regulatorExport = buildRegulatoryExport(
      fieldPath,
      targetNode,
      upstreamChain,
      relevantEdges,
    );

    return {
      fieldPath,
      businessId,
      resolvedAt: new Date(),
      node: targetNode,
      upstreamChain,
      edges: relevantEdges,
      currentValue: targetNode.currentValue,
      regulatorExport,
    };
  }

  // ── Change Detection ──────────────────────────────────────────────────────────

  async detectChanges(
    businessId: string,
    tenantId: string,
    snapshot: Record<string, unknown>,
  ): Promise<ChangeDetectionResult> {
    logger.info('Running change detection', { businessId, tenantId });

    const graph = await this.buildLineageGraph(businessId, tenantId);
    const alerts: ChangeAlert[] = [];

    const snapshotKeys = Object.keys(snapshot);
    const snapshotAge = snapshot['_capturedAt']
      ? `${Math.round((Date.now() - new Date(snapshot['_capturedAt'] as string).getTime()) / 60_000)}m ago`
      : 'unknown';

    for (const key of snapshotKeys) {
      if (key.startsWith('_')) continue; // skip metadata keys

      const node = graph.nodes.find((n) => n.id === key);
      if (!node) continue;

      const previousValue = snapshot[key];
      const currentValue = node.currentValue;

      if (currentValue === undefined) continue;

      const prevStr = JSON.stringify(previousValue);
      const currStr = JSON.stringify(currentValue);
      if (prevStr === currStr) continue;

      // Compute numeric delta if possible
      let delta: number | null = null;
      const prevNum = typeof previousValue === 'number' ? previousValue : parseFloat(String(previousValue));
      const currNum = typeof currentValue === 'number' ? currentValue : parseFloat(String(currentValue));
      if (!isNaN(prevNum) && !isNaN(currNum)) {
        delta = currNum - prevNum;
      }

      const severity = determineSeverity(key, delta);
      const message = buildChangeMessage(node.label, previousValue, currentValue, delta);

      alerts.push({
        fieldPath: key,
        alertedAt: new Date(),
        previousValue,
        currentValue,
        delta,
        severity,
        message,
      });
    }

    // Also check for fields added in current graph but absent from snapshot
    for (const node of graph.nodes) {
      if (node.kind !== 'source') continue;
      if (snapshotKeys.includes(node.id)) continue;
      if (node.currentValue === undefined) continue;

      alerts.push({
        fieldPath: node.id,
        alertedAt: new Date(),
        previousValue: null,
        currentValue: node.currentValue,
        delta: null,
        severity: 'info',
        message: `New data available for "${node.label}" — not present in snapshot.`,
      });
    }

    return {
      businessId,
      checkedAt: new Date(),
      snapshotAge,
      alerts,
      hasChanges: alerts.length > 0,
    };
  }

  // ── Snapshot Builder ──────────────────────────────────────────────────────────
  // Utility: capture current upstream values as a snapshot for future comparison.

  async captureSnapshot(
    businessId: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const graph = await this.buildLineageGraph(businessId, tenantId);

    const snapshot: Record<string, unknown> = {
      _capturedAt: new Date().toISOString(),
      _businessId: businessId,
    };

    for (const node of graph.nodes) {
      if (node.currentValue !== undefined) {
        snapshot[node.id] = node.currentValue;
      }
    }

    return snapshot;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveUpstreamChain(
  targetId: string,
  nodes: LineageNode[],
  edges: LineageEdge[],
  visited = new Set<string>(),
): LineageNode[] {
  if (visited.has(targetId)) return [];
  visited.add(targetId);

  const upstream: LineageNode[] = [];
  const incomingEdges = edges.filter((e) => e.toNodeId === targetId);

  for (const edge of incomingEdges) {
    const parentNode = nodes.find((n) => n.id === edge.fromNodeId);
    if (parentNode) {
      upstream.push(parentNode);
      const grandparents = resolveUpstreamChain(edge.fromNodeId, nodes, edges, visited);
      upstream.push(...grandparents);
    }
  }

  return upstream;
}

function buildRegulatoryExport(
  fieldPath: string,
  targetNode: LineageNode,
  upstreamChain: LineageNode[],
  edges: LineageEdge[],
): RegulatoryLineageExport {
  // Build the ordered provenance chain (most upstream first)
  const ordered = [...upstreamChain].reverse();

  const provenance = ordered.map((node, idx) => {
    const edge = edges.find((e) => e.fromNodeId === node.id);
    return {
      step: idx + 1,
      nodeId: node.id,
      nodeLabel: node.label,
      kind: node.kind,
      model: node.model,
      field: node.field,
      formula: node.formula,
      transformationLabel: edge?.transformationLabel ?? 'Direct source',
    };
  });

  // Add the target node as the final step
  provenance.push({
    step: provenance.length + 1,
    nodeId: targetNode.id,
    nodeLabel: targetNode.label,
    kind: targetNode.kind,
    model: targetNode.model,
    field: targetNode.field,
    formula: targetNode.formula,
    transformationLabel: 'Target field',
  });

  return {
    fieldPath,
    fieldLabel: targetNode.label,
    currentValue: targetNode.currentValue,
    resolvedAt: new Date().toISOString(),
    dataProvenance: provenance,
    attestation:
      'Data lineage generated by CapitalForge Data Lineage Service v1.0. ' +
      'This export reflects the computational chain as of the resolved timestamp. ' +
      'For audit purposes, retain this document alongside the associated financial records.',
  };
}

function determineSeverity(fieldPath: string, delta: number | null): ChangeAlert['severity'] {
  // Tax-critical fields trigger critical alerts
  const criticalFields = [
    'irc163j.disallowedAmount',
    'irc163j.deductibleInterest',
    'costCalc.totalCost',
    'costCalc.irc163jImpact',
  ];
  if (criticalFields.includes(fieldPath)) return 'critical';

  // Large numeric changes are warnings
  if (delta !== null && Math.abs(delta) > 1_000) return 'warning';

  return 'info';
}

function buildChangeMessage(
  label: string,
  previous: unknown,
  current: unknown,
  delta: number | null,
): string {
  const fmt = (v: unknown) =>
    typeof v === 'number'
      ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : String(v);

  if (delta !== null) {
    const direction = delta > 0 ? 'increased' : 'decreased';
    return (
      `"${label}" ${direction} from ${fmt(previous)} to ${fmt(current)} ` +
      `(delta: ${delta > 0 ? '+' : ''}${fmt(delta)}).`
    );
  }

  return `"${label}" changed from ${fmt(previous)} to ${fmt(current)}.`;
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const dataLineageService = new DataLineageService();
