/**
 * Phone-number normalisation, in one place both sides of a revocation can reach.
 *
 * This lived in `sms-dispatch.service.ts`, which imports `ConsentService` so that an
 * inbound STOP can revoke the consent behind the number. When `consent.service.ts`
 * needed the same normaliser - so that an API revocation suppresses the number the way
 * a STOP does - importing it back created a cycle, and ESM resolved it by handing one
 * side an uninitialised binding: `ConsentService is not a constructor`, at load time,
 * in a file neither change had touched.
 *
 * A shared helper rather than a second copy. Two normalisers that disagree about
 * whether a bare ten-digit string is a US number would put a suppressed number on the
 * list under one spelling and look it up under another.
 */

/**
 * Normalise to E.164 so a DNC entry cannot be missed on formatting.
 *
 * Only North American numbers are handled, because that is the only numbering plan
 * whose country code can be inferred from a bare 10-digit string. Anything else must
 * already carry a '+'.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
