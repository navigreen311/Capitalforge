// ============================================================
// CapitalForge — owner rows for the client profile
//
// `GET /api/v1/clients/:id/owners` returns `BusinessOwner` rows straight from
// the database: `firstName`, `lastName`, `kycStatus`. The profile card reads
// `name`, `title`, `personalGuarantee` and `kycVerified`. None of those names
// match, so every owner rendered with a blank name, a blank title, "PG: No"
// and "KYC Pending" — regardless of what was on the record.
//
// The card was not empty because there were no owners. It was empty because
// nothing joined the two shapes.
// ============================================================

/** What the profile card renders. */
export interface OwnerRow {
  id: string;
  name: string;
  title: string;
  ownershipPercent: number;
  personalGuarantee: boolean;
  kycVerified: boolean;
}

/** A row as the API returns it. Every field optional — this is unvalidated input. */
interface ApiOwner {
  id?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  title?: unknown;
  ownershipPercent?: unknown;
  personalGuarantee?: unknown;
  kycStatus?: unknown;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Decimal columns arrive as strings over JSON. */
function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function toOwnerRow(raw: ApiOwner): OwnerRow {
  const name = [asString(raw.firstName), asString(raw.lastName)]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    id: asString(raw.id),
    // An owner with no name recorded says so, rather than rendering an empty
    // line that looks like a loading state.
    name: name || 'Name not recorded',
    title: asString(raw.title),
    ownershipPercent: asNumber(raw.ownershipPercent),
    personalGuarantee: raw.personalGuarantee === true,
    // Only the recorded status counts as verified. Anything else — pending,
    // failed, missing — is not, and a card that claims otherwise is claiming
    // an identity check nobody ran.
    kycVerified: raw.kycStatus === 'verified',
  };
}

export function toOwnerRows(data: unknown): OwnerRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => toOwnerRow((row ?? {}) as ApiOwner));
}

/**
 * Ownership recorded across all owners.
 *
 * The add-owner form checks this before submitting: beneficial ownership over
 * 100% is not a rounding question, it is a wrong record.
 */
export function totalOwnership(rows: readonly OwnerRow[]): number {
  return rows.reduce((sum, r) => sum + r.ownershipPercent, 0);
}
