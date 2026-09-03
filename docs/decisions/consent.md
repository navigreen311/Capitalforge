# Decision record — consent

Entries are appended, never rewritten. A decision that is reversed gets a new
entry that says so.

---

## 1. An API revocation suppresses the number

**Decided 2026-09-03.**

An inbound STOP did two things: upserted the number onto `DoNotCallList` and
revoked the consent behind it. A revocation arriving through the API did only the
second.

**Decision.** Revoking `sms` or `voice` consent adds the number to the
do-not-call list, in the same transaction as the revocation.

Revoking SMS consent means stop texting this business. A revocation that
withdraws the legal basis and leaves the number dialable by anything that checks
the DNC list is a revocation in name only — the consent row says revoked and the
next campaign query says callable. STOP already did both; this is the same act
arriving through a different door.

**Not the whole list.** `source` is `consent_revoked` rather than `opt_out`, and
an existing row is not downgraded: a number already suppressed by the client's
own STOP keeps that attribution. A reader asking why a number is suppressed can
tell the client speaking from the firm acting on their behalf.

A business with no phone number suppresses nothing and is not an error. There is
no number to put on the list.

**Rejected — withdrawing only the legal basis.** It is the narrower reading and
it is defensible on paper: another lawful basis could permit contact, and
suppression is broader than the client asked for. It loses on what actually
happens next — the paths that decide whether to dial check the DNC list, not the
consent table, so the narrow reading is indistinguishable from doing nothing.

**Found while implementing.** `normalisePhone` lived in `sms-dispatch.service.ts`,
which imports `ConsentService` so a STOP can revoke. Importing it back created a
cycle and ESM handed one side an uninitialised binding — `ConsentService is not a
constructor`, at load time, in a file neither change had touched. It moved to
`utils/phone.ts` and is re-exported. A second copy was not an option: two
normalisers that disagree about a bare ten-digit string would suppress a number
under one spelling and look it up under another.

---

## 2. `consent_method` is not a column

**Decided 2026-09-03.**

The consent confirmation letter once defaulted four fields, one of them
`consent_method ?? 'Electronic signature via client portal'`. The defaults are
gone and the letter now refuses without real records. The question left open was
whether the method deserves a column of its own.

**Decision.** It does not. `evidenceRef` is the answer.

The method lives in the artefact the reference points at — a signature record, a
recording, a portal submission — and that artefact is what a regulator is shown.
A column would restate a property of the evidence in a place that can disagree
with it.

**Rejected — adding the column.** It would be null for the entire back catalogue,
and a field that is null for every consent granted before today improves no
answer while looking like it should. The letter would still have to read the
evidence to say anything true.
