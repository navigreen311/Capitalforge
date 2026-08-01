// ============================================================
// CapitalForge — State disclosure inventory mapping
//
// /compliance/disclosures listed ten filings against named businesses with
// deadlines and statuses — two "Filed" with dates and confirmation
// references, three "Overdue". Filing one set the row to Filed locally and
// minted a confirmation reference with Math.random():
//
//   confirmationRef: `CF-${year}-${state}-${Math.random()...}`
//   documentUrl:     `/documents/disclosures/${id}.pdf`
//
// A bulk action did that for every pending row behind a progress bar and
// finished with "10 disclosures filed successfully". Nothing was submitted
// anywhere, nothing was stored, and the confirmation number was random. The
// compliance landing page routes people here with a button labelled "File
// Now".
//
//   GET /api/compliance/disclosures — the businesses, and what is missing
//
// The endpoint no longer reports obligations or statuses, because neither an
// obligation register nor a filing record exists. This module maps what it
// does return, and deliberately has no notion of a filing status.
// ============================================================

export interface BusinessRow {
  businessId: string;
  businessName: string;
  /** Null where the record does not say. Not defaulted to a state. */
  stateOfFormation: string | null;
  status: string | null;
}

export interface MissingPiece {
  exists: boolean;
  why: string;
}

export interface DisclosureInventory {
  businesses: BusinessRow[];
  obligationRegister: MissingPiece;
  filingRecord: MissingPiece;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function toBusinessRow(row: unknown): BusinessRow | null {
  const r = asRecord(row);
  const businessId = str(r['businessId']);
  const businessName = str(r['businessName']);
  if (businessId === null || businessName === null) return null;

  return {
    businessId,
    businessName,
    stateOfFormation: str(r['stateOfFormation']),
    status: str(r['status']),
  };
}

function toMissingPiece(value: unknown): MissingPiece {
  const r = asRecord(value);
  return {
    // Absent reads as "does not exist". The safe default is that the record
    // is missing, not that it is there and simply was not described.
    exists: r['exists'] === true,
    why: str(r['why']) ?? '',
  };
}

export function toDisclosureInventory(data: unknown): DisclosureInventory {
  const d = asRecord(data);
  const list = Array.isArray(d['businesses']) ? d['businesses'] : [];

  return {
    businesses: list
      .map((row) => toBusinessRow(row))
      .filter((row): row is BusinessRow => row !== null),
    obligationRegister: toMissingPiece(d['obligationRegister']),
    filingRecord: toMissingPiece(d['filingRecord']),
  };
}

/** The states the tenant's businesses are formed in, deduplicated. */
export function statesRepresented(rows: BusinessRow[]): string[] {
  return [...new Set(rows.map((r) => r.stateOfFormation).filter((s): s is string => s !== null))]
    .sort();
}

/**
 * How many businesses have no state on record.
 *
 * Surfaced rather than hidden: a business with no state cannot be reasoned
 * about at all here, and rolling it in with the rest would make the
 * inventory look more complete than it is.
 */
export function withoutState(rows: BusinessRow[]): number {
  return rows.filter((r) => r.stateOfFormation === null).length;
}
