// ============================================================
// CapitalForge — DUNS track step states
//
// Six steps, two kinds of claim, and they are not interchangeable:
//
//   derived  — recomputed from the client's data on every read, stored
//              nowhere. It can go backwards: close a trade line and step 4
//              un-completes itself, because the fact it reports stopped being
//              true.
//   attested — an advisor said so, with their id and the date on the record.
//              Nothing in this system can observe it.
//
// The page previously made neither claim. All six were manual, held in
// component state, and a client whose PAYDEX was already 80 — with the score
// card ticked and the progress bar full — showed step 5 unchecked and the
// track at 0/6, because nothing had ever connected the figure on screen to the
// step describing it.
//
// Steps 1 and 3 stay attested: no column records a DUNS number, nothing
// verifies one (the D&B adapter *generates* a nine-digit number), and no model
// records a business bank account. `AchAuthorization` is the nearest row and it
// is a debit authorisation naming a processor — deriving "has a bank account"
// from it would answer a different question than the step asks.
//
// Kept pure so each rule is testable without a database.
// ============================================================

/** Which of the two kinds of claim a step carries. */
export type StepSource = 'derived' | 'attested';

export interface StepState {
  stepNumber: number;
  source: StepSource;
  completed: boolean;
  /**
   * What the data said, for a derived step — "3 of 5 trade lines reporting to
   * D&B". Null for an attested step, whose evidence is the person named in
   * `completedBy` rather than a figure.
   */
  basis: string | null;
  completedAt: string | null;
  completedBy: string | null;
}

/** Everything the derived rules read. Assembled by the route from Prisma. */
export interface StepDerivationInput {
  /** Address fields as held on the business. */
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phoneNumber: string | null;
  /** Open trade lines reporting to D&B. */
  dnbTradelineCount: number;
  /** Latest PAYDEX on record, null when no D&B pull exists. */
  paydex: number | null;
  /** When that PAYDEX was pulled. */
  paydexPulledAt: Date | null;
  /** Card applications that have left draft. */
  submittedApplicationCount: number;
}

/** A mark an advisor made, as stored. */
export interface AttestedMark {
  stepNumber: number;
  completed: boolean;
  completedAt: Date | null;
  completedBy: string | null;
}

export const CREDIT_BUILDER_STEP_COUNT = 6;

/**
 * Which steps are derived, and which an advisor attests.
 *
 * Exported because both the route and the UI need to agree: a step whose
 * completion the system computes must not offer a control that claims to set
 * it, and a PUT against one is refused rather than silently ignored.
 */
export const DERIVED_STEPS = new Set([2, 4, 5, 6]);

/** Trade lines required by step 4, and PAYDEX required by step 5. */
export const TRADELINE_TARGET = 5;
export const PAYDEX_TARGET = 80;

export function isDerivedStep(stepNumber: number): boolean {
  return DERIVED_STEPS.has(stepNumber);
}

/** A value that is present and not just whitespace. */
function present(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Step 2 — a business address and a phone line.
 *
 * All four address parts and a phone number. A partial address is not an
 * address: the step exists because D&B matches on consistent NAP data, and
 * three quarters of an address does not match anything.
 */
function deriveAddressStep(input: StepDerivationInput): { completed: boolean; basis: string } {
  const missing: string[] = [];
  if (!present(input.addressLine1)) missing.push('street');
  if (!present(input.city)) missing.push('city');
  if (!present(input.state)) missing.push('state');
  if (!present(input.zip)) missing.push('ZIP');
  if (!present(input.phoneNumber)) missing.push('phone');

  if (missing.length === 0) {
    return { completed: true, basis: 'Address and phone on file' };
  }
  return { completed: false, basis: `Missing on the client record: ${missing.join(', ')}` };
}

/**
 * Step 4 — five trade lines reporting to D&B.
 *
 * Counted against D&B specifically, which is what the step asks for. A line
 * reporting only to Experian Business does not build the D&B file this track
 * is about.
 */
function deriveTradelineStep(input: StepDerivationInput): { completed: boolean; basis: string } {
  const count = input.dnbTradelineCount;
  return {
    completed: count >= TRADELINE_TARGET,
    basis: `${count} of ${TRADELINE_TARGET} trade lines reporting to D&B`,
  };
}

/**
 * Step 5 — PAYDEX at or above 80.
 *
 * The figure the score card and the progress bar on this page already show. It
 * was possible for both to report 80 against a target of 80, with the bar full,
 * while this step sat unchecked — which is the defect that prompted deriving
 * any of this.
 */
function derivePaydexStep(input: StepDerivationInput): { completed: boolean; basis: string } {
  if (input.paydex === null) {
    return { completed: false, basis: 'No PAYDEX on record' };
  }

  const pulled = input.paydexPulledAt ? `, pulled ${formatDate(input.paydexPulledAt)}` : '';
  return {
    completed: input.paydex >= PAYDEX_TARGET,
    basis: `PAYDEX ${input.paydex}${pulled}`,
  };
}

/**
 * Step 6 — applied for business credit cards.
 *
 * Submitted, not drafted. A draft application is a form somebody opened; the
 * step is about having applied.
 */
function deriveApplicationStep(input: StepDerivationInput): { completed: boolean; basis: string } {
  const count = input.submittedApplicationCount;
  if (count === 0) {
    return { completed: false, basis: 'No card application submitted' };
  }
  return {
    completed: true,
    basis: `${count} card application${count === 1 ? '' : 's'} submitted`,
  };
}

/**
 * The six step states for a client.
 *
 * Derived steps ignore any stored mark entirely. A row against step 5 from
 * before these rules existed must not be able to outvote the PAYDEX — the
 * whole value of a derived step is that it reports the data rather than
 * somebody's recollection of it.
 */
export function deriveStepStates(
  input: StepDerivationInput,
  marks: AttestedMark[],
): StepState[] {
  const byNumber = new Map(marks.map((m) => [m.stepNumber, m]));

  const derived: Record<number, { completed: boolean; basis: string }> = {
    2: deriveAddressStep(input),
    4: deriveTradelineStep(input),
    5: derivePaydexStep(input),
    6: deriveApplicationStep(input),
  };

  return Array.from({ length: CREDIT_BUILDER_STEP_COUNT }, (_, i) => {
    const stepNumber = i + 1;

    const computed = derived[stepNumber];
    if (computed) {
      return {
        stepNumber,
        source: 'derived' as const,
        completed: computed.completed,
        basis: computed.basis,
        // A derived step has no author and no completion date: nobody marked
        // it, and the date it became true is not recorded anywhere.
        completedAt: null,
        completedBy: null,
      };
    }

    const mark = byNumber.get(stepNumber);
    return {
      stepNumber,
      source: 'attested' as const,
      completed: mark?.completed ?? false,
      basis: null,
      completedAt: mark?.completedAt?.toISOString() ?? null,
      completedBy: mark?.completedBy ?? null,
    };
  });
}
