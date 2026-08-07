// ============================================================
// Who signs, and where the envelope actually goes
//
// A signature request used to address `Business.businessEmail` with an owner's
// name on the envelope. That is usually the right envelope going to roughly
// the right place, and it is not the same as sending it to the person who
// signs — the name and the destination were describing two different parties
// and nothing said so.
//
// `BusinessOwner.email` exists now. This picks the signer and, just as
// importantly, **reports which kind of address was used**. A fallback that
// cannot be distinguished from the real thing is how the original defect
// survived: both paths produced a sent envelope and a success message.
//
// ── Which owner, when several are recorded
//
// Largest stake is the default and is not obviously right for every document —
// a 60% owner may not be the officer authorised to bind the company — so
// `isSignatory` makes the exception recordable rather than forcing the default
// to be wrong quietly. Order:
//
//   1. an owner marked `isSignatory` who has an email
//   2. otherwise the largest stake who has an email
//   3. otherwise the largest stake, addressed at the business — reported as
//      such, never silently
//
// Step 3 is kept rather than refused because a business address is not a
// stranger's inbox, and refusing would break every client onboarded before the
// column existed. What is not kept is the silence.
// ============================================================

export interface SignerCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isSignatory: boolean;
  /** Decimal in the database; a number or numeric string here. */
  ownershipPercent: number | string | null;
}

export type SignerAddressKind =
  /** The signer's own address. */
  | 'owner'
  /** The business address, because no owner has one recorded. */
  | 'business';

export interface SignerSelection {
  name: string;
  email: string;
  addressKind: SignerAddressKind;
  ownerId: string | null;
  /**
   * Why this owner rather than another, in words a caller can show.
   *
   * A signature request names one of several people. When somebody asks later
   * why it went to that one, "largest recorded stake" and "marked as the
   * signatory" are different answers, and the envelope should be able to give
   * whichever applied.
   */
  reason: string;
  /** True when more than one owner is on record, so the choice was a choice. */
  hadAlternatives: boolean;
}

export type SignerFailure =
  | { ok: false; code: 'NO_OWNERS'; message: string }
  | { ok: false; code: 'NO_SIGNER_EMAIL'; message: string };

export type SignerResult = ({ ok: true } & SignerSelection) | SignerFailure;

function stake(owner: SignerCandidate): number {
  const raw = owner.ownershipPercent;
  if (raw === null) return 0;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function fullName(owner: SignerCandidate): string {
  return `${owner.firstName} ${owner.lastName}`.trim();
}

function usable(email: string | null): email is string {
  return email !== null && email.trim() !== '';
}

/**
 * Choose the signer for a business.
 *
 * `owners` need not be sorted — this does not rely on the caller's ordering,
 * because a query whose `orderBy` is dropped in a refactor would otherwise
 * silently change who signs a contract.
 */
export function selectSigner(
  owners: SignerCandidate[],
  businessName: string,
  businessEmail: string | null,
): SignerResult {
  if (owners.length === 0) {
    return {
      ok: false,
      code: 'NO_OWNERS',
      message:
        `No owner is recorded for ${businessName}, so there is nobody to name as the signer. `
        + 'Add an owner on the client profile first.',
    };
  }

  const byStake = [...owners].sort((a, b) => stake(b) - stake(a));
  const hadAlternatives = owners.length > 1;

  const declared = byStake.filter((o) => o.isSignatory);
  const declaredWithEmail = declared.find((o) => usable(o.email));
  if (declaredWithEmail) {
    return {
      ok: true,
      name: fullName(declaredWithEmail),
      email: declaredWithEmail.email!.trim(),
      addressKind: 'owner',
      ownerId: declaredWithEmail.id,
      reason: 'Marked as the signatory for this client.',
      hadAlternatives,
    };
  }

  const largestWithEmail = byStake.find((o) => usable(o.email));
  if (largestWithEmail) {
    return {
      ok: true,
      name: fullName(largestWithEmail),
      email: largestWithEmail.email!.trim(),
      addressKind: 'owner',
      ownerId: largestWithEmail.id,
      // Says which rule applied. If an owner is marked as the signatory but
      // has no email, that is worth saying out loud rather than quietly
      // routing around.
      reason: declared.length > 0
        ? 'The owner marked as signatory has no email on record, so this went to the largest recorded stake.'
        : 'Largest recorded ownership stake.',
      hadAlternatives,
    };
  }

  if (!usable(businessEmail)) {
    return {
      ok: false,
      code: 'NO_SIGNER_EMAIL',
      message:
        `No email is recorded for any owner of ${businessName}, and the business has none either, `
        + 'so this document cannot be sent for signature. Add an email to the signing owner.',
    };
  }

  const fallback = byStake[0]!;
  return {
    ok: true,
    name: fullName(fallback),
    email: businessEmail.trim(),
    // The distinction that did not exist before. The caller reports it, so a
    // sent envelope says whether it reached the person or the company.
    addressKind: 'business',
    ownerId: fallback.id,
    reason:
      'No owner has an email on record, so this went to the business address. '
      + 'The envelope names the owner; the address belongs to the company.',
    hadAlternatives,
  };
}
