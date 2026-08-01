// ============================================================
// CapitalForge — Application decision register
//
// The compliance decisions page called nothing. Six decisions were literals,
// each with a named advisor, a paragraph of reasoning, a list of factors
// behind it — Credit Score: 780, PAYDEX: 82, Annual Revenue: $2.4M — and,
// on the declines, the adverse action notice:
//
//   adverseAction: { status: 'sent', sentDate: '2026-04-04', content: '…' }
//
// That is the ECOA §1002.9 record: the notice a declined applicant must
// receive within 30 days, and the date it went. Nothing in this system
// records either. There is a column called adverseActionNotice on
// CardApplication, but the application pipeline writes assigned advisor ids
// into it — "stored in adverseActionNotice field for now" — and the detail
// endpoint returns it as null. It is a metadata bucket wearing a compliance
// name.
//
// What is real:
//   GET /api/applications                       — the decisions themselves
//   GET /api/fair-lending/adverse-action?year=  — which denials are on the
//                                                 1071 register, and why
//
// The two join on applicationId. A decline that appears in one and not the
// other is worth seeing, so both directions are reported rather than
// silently merged.
// ============================================================

export type DecisionOutcome = 'approved' | 'declined';

export interface DecisionRow {
  applicationId: string;
  businessId: string;
  businessName: string;
  issuer: string;
  cardProduct: string;
  outcome: DecisionOutcome;
  /** When the decision was made. Null when nothing recorded it. */
  decidedAt: string | null;
  /** The amount at stake. Null when no limit is on file. */
  amount: number | null;
  /** As recorded on the application. Null on approvals, and on declines
   *  where nobody wrote one. */
  declineReason: string | null;
  /** The advisor who owns the client — not necessarily who decided. */
  advisorName: string | null;
  /**
   * Reasons on the Section 1071 register for this application, when it is on
   * it. Empty means the register has no record of this decline, which is
   * itself a finding rather than a clean result.
   */
  registerReasons: string[];
  onRegister: boolean;
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

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Reasons from the 1071 adverse action report, keyed by application. */
export function toRegisterIndex(data: unknown): Map<string, string[]> {
  const index = new Map<string, string[]>();
  if (!Array.isArray(data)) return index;

  for (const entry of data) {
    const e = asRecord(entry);
    const applicationId = str(e['applicationId']);
    if (applicationId === null) continue;
    index.set(applicationId, stringList(e['adverseReasons']));
  }
  return index;
}

/**
 * The decided applications, joined to the register.
 *
 * Only approved and declined rows: a decision register listing applications
 * still in flight would overstate how much has been decided.
 */
export function toDecisionRows(
  applications: unknown,
  register: Map<string, string[]>,
): DecisionRow[] {
  const list = Array.isArray(applications) ? applications : asRecord(applications)['data'];
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const a = asRecord(entry);
    const id = str(a['id']);
    const status = str(a['status']);
    if (id === null || (status !== 'approved' && status !== 'declined')) return [];

    const registerReasons = register.get(id) ?? [];

    return [
      {
        applicationId: id,
        businessId: str(a['businessId']) ?? '',
        businessName: str(a['businessName']) ?? 'Unknown client',
        issuer: str(a['issuer']) ?? 'Unknown issuer',
        cardProduct: str(a['cardProduct']) ?? 'Unspecified card',
        outcome: status,
        decidedAt: str(a['decidedAt']),
        amount: num(a['approvedLimit']) ?? num(a['requestedLimit']),
        declineReason: str(a['declineReason']),
        advisorName: str(a['advisorName']),
        registerReasons,
        onRegister: register.has(id),
      },
    ];
  });
}

// ── Derived ─────────────────────────────────────────────────

export interface DecisionSummary {
  total: number;
  approved: number;
  declined: number;
  /** Approved as a share of decided. Null when nothing has been decided. */
  approvalRate: number | null;
  /** Declines with no reason recorded against the application. */
  declinesWithoutReason: number;
  /** Declines absent from the Section 1071 register. */
  declinesOffRegister: number;
}

export function summariseDecisions(rows: DecisionRow[]): DecisionSummary {
  const approved = rows.filter((r) => r.outcome === 'approved');
  const declined = rows.filter((r) => r.outcome === 'declined');

  return {
    total: rows.length,
    approved: approved.length,
    declined: declined.length,
    // Null, not 0: a register with nothing decided has no approval rate, and
    // "0%" on a decisions page reads as refusing everyone.
    approvalRate: rows.length === 0 ? null : Math.round((approved.length / rows.length) * 100),
    declinesWithoutReason: declined.filter((r) => r.declineReason === null).length,
    declinesOffRegister: declined.filter((r) => !r.onRegister).length,
  };
}

/**
 * What a decline still needs, as far as this system can tell.
 *
 * It cannot tell whether a notice was sent — nothing records that — so it
 * reports only what is recorded and what is missing from the record.
 */
export interface DeclineGaps {
  missingReason: boolean;
  missingFromRegister: boolean;
}

export function declineGaps(row: DecisionRow): DeclineGaps | null {
  if (row.outcome !== 'declined') return null;
  return {
    missingReason: row.declineReason === null,
    missingFromRegister: !row.onRegister,
  };
}

/** Rows a compliance reviewer should look at first. */
export function needsAttention(rows: DecisionRow[]): DecisionRow[] {
  return rows.filter((r) => {
    const gaps = declineGaps(r);
    return gaps !== null && (gaps.missingReason || gaps.missingFromRegister);
  });
}
