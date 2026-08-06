// ============================================================
// CapitalForge — the facts /credit-builder reasons about
//
// One read, two consumers. The DUNS track derives four of its six steps from a
// client's data, and the stacking criteria panel asks overlapping questions of
// the same data: step 4 and criterion sc_002 are both "five trade lines
// reporting to D&B", step 5 and sc_003 are both "PAYDEX at 80".
//
// Asked twice, they would eventually answer differently — one counting trade
// lines that report anywhere and the other counting D&B, one reading the
// latest pull and the other the highest. So they are asked once, here, and
// both derivations consume the result.
//
// The reader is the only part that touches the database. Everything that
// decides anything from these facts is pure, and tested without one.
// ============================================================

import type { PrismaClient } from '@prisma/client';

/** Everything the step and criteria rules read about a client. */
export interface CreditFacts {
  /** Address held on the business. */
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phoneNumber: string | null;

  /** Open trade lines reporting to D&B. */
  dnbTradelineCount: number;

  /** Latest score per product, null when no pull is on record. */
  paydex: number | null;
  paydexPulledAt: Date | null;
  sbss: number | null;
  sbssPulledAt: Date | null;
  intelliscore: number | null;
  intelliscorePulledAt: Date | null;
  /** Equifax Business Credit Risk Score, 101–992. */
  equifaxBusinessRisk: number | null;
  equifaxBusinessRiskPulledAt: Date | null;
  /**
   * Equifax OneScore for Commercial, 300–650, when one is on record.
   *
   * Carried separately so a criterion reading Business Credit Risk can say
   * "a different Equifax product is recorded" rather than "no Equifax score" —
   * those are different facts, and only one of them is the advisor's to fix.
   */
  equifaxOneScore: number | null;

  /**
   * Whole months since the business was formed, null when no formation date is
   * recorded. `Business.dateOfFormation` exists and is populated — an earlier
   * revision of docs/gaps.md claimed otherwise and was wrong.
   */
  businessAgeMonths: number | null;

  /** Card applications that have left draft. */
  submittedApplicationCount: number;
}

/**
 * Whether a trade line's `reportsTo` names Dun & Bradstreet.
 *
 * The column is free-form JSON written by a form whose checkbox is labelled
 * "D&B", but a line imported or entered another way may say "Dun & Bradstreet"
 * or "DNB". Matching all three is the difference between a criterion that can
 * be met and one that silently never is.
 */
export function reportsToDnb(reportsTo: unknown): boolean {
  if (!Array.isArray(reportsTo)) return false;
  return reportsTo.some((entry) => {
    if (typeof entry !== 'string') return false;
    const normalised = entry.toLowerCase().replace(/[^a-z]/g, '');
    return normalised === 'db' || normalised === 'dnb' || normalised.startsWith('dunbradstreet');
  });
}

/** Whole months between a formation date and now. */
export function monthsSince(from: Date, now: Date): number {
  const months =
    (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  // Not yet through the current month.
  return now.getDate() < from.getDate() ? months - 1 : months;
}

/**
 * Read every fact the credit-builder page reasons about, for one client.
 *
 * Returns null when the client does not exist on this tenant, so the caller
 * answers 404 rather than deriving from an empty set — which would report a
 * real-looking "nothing on file" for a business that is not theirs.
 */
export async function readCreditFacts(
  prisma: PrismaClient,
  clientId: string,
  tenantId: string,
  now: Date = new Date(),
): Promise<CreditFacts | null> {
  const business = await prisma.business.findFirst({
    where: { id: clientId, tenantId },
    select: {
      addressLine1: true,
      city: true,
      state: true,
      zip: true,
      phoneNumber: true,
      dateOfFormation: true,
    },
  });

  if (!business) return null;

  const [tradelines, businessProfiles, submittedApplicationCount] = await Promise.all([
    prisma.vendorTradeline.findMany({
      where: { businessId: clientId, tenantId, status: 'open' },
      select: { reportsTo: true },
    }),
    // Every business pull, latest first. One query rather than three: the three
    // score products differ only by `scoreType`, and taking the newest of each
    // here keeps "latest" meaning the same thing for all of them.
    prisma.creditProfile.findMany({
      where: { businessId: clientId, profileType: 'business' },
      orderBy: { pulledAt: 'desc' },
      select: { scoreType: true, score: true, pulledAt: true },
    }),
    prisma.cardApplication.count({
      where: { businessId: clientId, NOT: { status: 'draft' } },
    }),
  ]);

  const latest = (scoreType: string) =>
    businessProfiles.find((p) => p.scoreType === scoreType) ?? null;

  const paydex = latest('paydex');
  const sbss = latest('sbss');
  const intelliscore = latest('intelliscore');
  const equifaxBusinessRisk = latest('equifax_business_risk');
  const equifaxOneScore = latest('equifax_onescore');

  return {
    addressLine1: business.addressLine1,
    city: business.city,
    state: business.state,
    zip: business.zip,
    phoneNumber: business.phoneNumber,
    dnbTradelineCount: tradelines.filter((t) => reportsToDnb(t.reportsTo)).length,
    paydex: paydex?.score ?? null,
    paydexPulledAt: paydex?.pulledAt ?? null,
    sbss: sbss?.score ?? null,
    sbssPulledAt: sbss?.pulledAt ?? null,
    intelliscore: intelliscore?.score ?? null,
    intelliscorePulledAt: intelliscore?.pulledAt ?? null,
    equifaxBusinessRisk: equifaxBusinessRisk?.score ?? null,
    equifaxOneScore: equifaxOneScore?.score ?? null,
    equifaxBusinessRiskPulledAt: equifaxBusinessRisk?.pulledAt ?? null,
    businessAgeMonths: business.dateOfFormation
      ? monthsSince(business.dateOfFormation, now)
      : null,
    submittedApplicationCount,
  };
}
