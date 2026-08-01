// ============================================================
// CapitalForge — AI decision governance mapping
//
// The decisions page called nothing. Eight decisions were literals, each
// tied to a named client and carrying a snapshot of the inputs that produced
// it — FICO Score 742, Annual Revenue $2,400,000, DTI 47% — beside an
// override audit trail naming who approved each reversal:
//
//   Risk score 42/100 overridden to "Approved with conditions"
//   overrideBy:  Ana Reyes
//   approvedBy:  Diana Walsh (Chief Credit Officer)
//
// A documented override with senior sign-off is exactly the control a fair
// lending examiner asks to see. None of those overrides happened, and no
// column records an approver.
//
// Three things the page showed are not in the record at all, and are not
// reconstructed here:
//
//   The client. AiDecisionLog has no businessId. A decision is not linked to
//   a business, so there is no client column and no client selector.
//
//   The inputs. They are reduced to inputHash on the way in — deliberately,
//   so a decision can be recognised again without retaining the applicant
//   data behind it. A per-decision input snapshot cannot be rebuilt from a
//   digest, and inventing one puts made-up credit figures next to a real
//   decision.
//
//   The override approver. The record holds who overrode a decision and why.
//   Who authorised that is not captured.
//
// What is there: GET /api/ai-governance/decisions, /metrics and /versions.
// ============================================================

export const MODULE_SOURCES = [
  'stacking_optimizer',
  'suitability_engine',
  'credit_intelligence',
  'udap_scorer',
  'decline_recovery',
  'contract_analysis',
  'comm_compliance',
  'fraud_detection',
] as const;

export type ModuleSource = (typeof MODULE_SOURCES)[number];

export const DECISION_TYPES = [
  'recommendation',
  'risk_score',
  'classification',
  'extraction',
  'generation',
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number];

export interface DecisionFlags {
  belowConfidenceThreshold: boolean;
  possibleHallucination: boolean;
  wasOverridden: boolean;
}

export interface DecisionRow {
  id: string;
  moduleSource: ModuleSource | string;
  decisionType: DecisionType | string;
  /** A digest of the inputs. The inputs themselves are not retained. */
  inputHash: string | null;
  /** Whatever the module decided. Shape varies by module. */
  output: Record<string, unknown>;
  /** 0–1, or null when the module reported none. Never 0 as a stand-in. */
  confidence: number | null;
  overriddenBy: string | null;
  overrideReason: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  createdAt: string | null;
  flags: DecisionFlags;
}

export interface ModuleMetrics {
  moduleSource: string;
  totalDecisions: number;
  /** Percentages as the API reports them, null when nothing was decided. */
  overrideRate: number | null;
  averageConfidence: number | null;
  belowThresholdRate: number | null;
  possibleHallucinationRate: number | null;
  averageLatencyMs: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface VersionRow {
  modelVersion: string | null;
  promptVersion: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  count: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toDecisionRow(row: unknown): DecisionRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  const flags = asRecord(r['flags']);

  return {
    id,
    moduleSource: str(r['moduleSource']) ?? 'unknown',
    decisionType: str(r['decisionType']) ?? 'unknown',
    inputHash: str(r['inputHash']),
    output: asRecord(r['output']),
    confidence: num(r['confidence']),
    overriddenBy: str(r['overriddenBy']),
    overrideReason: str(r['overrideReason']),
    modelVersion: str(r['modelVersion']),
    promptVersion: str(r['promptVersion']),
    latencyMs: num(r['latencyMs']),
    createdAt: str(r['createdAt']),
    flags: {
      belowConfidenceThreshold: flags['belowConfidenceThreshold'] === true,
      possibleHallucination: flags['possibleHallucination'] === true,
      // Absent means not overridden. Defaulting the other way would report a
      // human reversal of a decision nobody touched.
      wasOverridden: flags['wasOverridden'] === true,
    },
  };
}

export function toDecisionRows(data: unknown): DecisionRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['decisions'];
  if (!Array.isArray(list)) return [];
  return list.map((row) => toDecisionRow(row)).filter((row): row is DecisionRow => row !== null);
}

export function toModuleMetrics(data: unknown): ModuleMetrics[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const e = asRecord(entry);
    const moduleSource = str(e['moduleSource']);
    if (moduleSource === null) return [];

    const total = num(e['totalDecisions']) ?? 0;
    // A rate over no decisions is not 0% — there was nothing to rate.
    const rate = (value: unknown): number | null => (total === 0 ? null : num(value));
    const period = asRecord(e['period']);

    return [
      {
        moduleSource,
        totalDecisions: total,
        overrideRate: rate(e['overrideRate']),
        averageConfidence: rate(e['averageConfidence']),
        belowThresholdRate: rate(e['belowThresholdRate']),
        possibleHallucinationRate: rate(e['possibleHallucinationRate']),
        averageLatencyMs: rate(e['averageLatencyMs']),
        periodStart: str(period['start']),
        periodEnd: str(period['end']),
      },
    ];
  });
}

export function toVersionRows(data: unknown): VersionRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const e = asRecord(entry);
    const model = str(e['modelVersion']);
    const prompt = str(e['promptVersion']);
    // A row identifying neither version says nothing.
    if (model === null && prompt === null) return [];
    return [
      {
        modelVersion: model,
        promptVersion: prompt,
        firstSeen: str(e['firstSeen']),
        lastSeen: str(e['lastSeen']),
        count: num(e['count']) ?? 0,
      },
    ];
  });
}

// ── Derived ─────────────────────────────────────────────────

/**
 * A one-line reading of what the module decided.
 *
 * `output` is a Json column whose shape varies by module, so this reads the
 * keys that are actually used and falls back to naming the fields rather
 * than inventing a sentence.
 */
export function summariseOutput(output: Record<string, unknown>): string {
  const score = num(output['score']);
  const band = str(output['band']);
  if (score !== null) return band === null ? `Score ${score}` : `Score ${score} — ${band}`;

  const recommended = str(output['recommended']);
  if (recommended !== null) return `Recommended: ${recommended}`;

  const classification = str(output['classification']);
  if (classification !== null) return `Classified: ${classification}`;

  const action = str(output['action']);
  if (action !== null) return `Action: ${action}`;

  const keys = Object.keys(output);
  if (keys.length === 0) return 'No output recorded.';
  return keys.join(', ');
}

export interface GovernanceSummary {
  total: number;
  overridden: number;
  belowThreshold: number;
  possibleHallucination: number;
  /** Mean confidence over decisions that reported one, as a percentage. */
  averageConfidence: number | null;
  /** How many decisions carried no confidence, so the mean is known partial. */
  withoutConfidence: number;
}

export function summariseDecisions(rows: DecisionRow[]): GovernanceSummary {
  const scored = rows.filter((r) => r.confidence !== null);

  return {
    total: rows.length,
    overridden: rows.filter((r) => r.flags.wasOverridden || r.overriddenBy !== null).length,
    belowThreshold: rows.filter((r) => r.flags.belowConfidenceThreshold).length,
    possibleHallucination: rows.filter((r) => r.flags.possibleHallucination).length,
    averageConfidence:
      scored.length === 0
        ? null
        : Math.round(
            (scored.reduce((sum, r) => sum + (r.confidence as number), 0) / scored.length) * 100,
          ),
    withoutConfidence: rows.length - scored.length,
  };
}

/** The distinct modules and decision types present, for filter controls. */
export function decisionFacets(rows: DecisionRow[]): {
  modules: string[];
  types: string[];
} {
  const modules = new Set<string>();
  const types = new Set<string>();
  for (const r of rows) {
    modules.add(String(r.moduleSource));
    types.add(String(r.decisionType));
  }
  return { modules: [...modules].sort(), types: [...types].sort() };
}

/** Confidence as a percentage, or null. The API reports 0–1 on a decision. */
export function confidencePercent(confidence: number | null): number | null {
  return confidence === null ? null : Math.round(confidence * 100);
}

/** Snake case to words, for values the API sends as enum keys. */
export function humanise(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}
