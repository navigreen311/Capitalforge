# Decision record — `submit_application`

Why this file exists: the decisions below were made between 1 and 3 September 2026
and lived in commit messages and in comments at the call site. A decision nobody
can read gets remade. Each entry states what was decided, the reasoning, and what
was rejected.

Entries are appended, never rewritten. A decision that is reversed gets a new
entry that says so.

---

## 1. One route reaches `submitted`, and creating one already submitted is refused

**Decided 2026-09-03.**

Three routes could put an application into `submitted`, and they ran different
controls.

- `POST /api/applications/:id/submit` — ran three inline checks of its own until
  `b2a9536` replaced them with `ApplicationGatesService.checkAll`.
- `PUT /api/applications/:id/status` — already ran `checkAll`.
- `POST /api/applications` with `status: 'submitted'` — ran its own, and they
  were the weakest of the three.

That last path read consent records and product acknowledgments into
`hasConsent` and `hasAck` **and never read either variable again**. Two
compliance gates that looked enforced and enforced nothing: an application could
be created already submitted with no consent on file and no product-reality
acknowledgment. Its suitability read carried no `tenantId`, and it refused on
`noGoTriggered` alone while `checkAll` also honours `overriddenBy` — so an
overridden no-go passed on `/submit` and blocked here. Two routes, opposite
answers, same client.

**Decision.** The create path refuses `status: 'submitted'` with
`422 SUBMIT_IS_A_SEPARATE_ACT`. Create the draft, then submit it.

**Rejected — gating it instead.** It cannot be gated honestly. Three of the six
gates key on an application id, and per-application consent is captured against
an application that exists. The create path already knew this: it set
`consentCapturedAt: null` under a comment saying that an application created
directly as `submitted` has not captured per-application consent — and then
submitted it. Running `consent_captured` against a record whose consent could not
yet exist is a gate that always fails, which is a worse answer than a clear
refusal.

**Nothing legitimately needed it.** No frontend caller creates an application at
all, and no test does. Submission is a second act with its own controls, and the
API now says so.

This is the same move as `restack_recommend`: two implementations of one rule
disagree the first time either changes, and the looser one is the one nobody is
watching.

## 1a. An unused variable is an error in that file

**Decided 2026-09-03.**

`hasConsent` and `hasAck` were reported by the linter, as warnings, for as long as
they existed. `@typescript-eslint/no-unused-vars` is a warning repo-wide because
111 of them exist and clearing that is separate work — so the finding went into a
stream nobody reads.

**Decision.** The rule is an **error** in `src/backend/api/routes/applications.routes.ts`.
This is the file where a discarded value is a discarded control. A deliberate
discard still takes an underscore prefix.

**It found a third one on its first run.** `hasFeeSchedule`, in the
compliance-gate panel — see entry 2.

---

## 2. The gate list is six on paper, five enforced, and one displayed gap

**Decided 2026-09-03.** Recorded rather than closed, because each of these changes
what submission means.

**`cu_membership_disclosure` is inert.** It runs only when `issuerType ===
'credit_union'`, and `CardApplication` carries an issuer *name* and no issuer
*type* column, so nothing anywhere can produce that value. Five enforced controls,
described as six wherever the gate list appears — including in this module's
operating instruction, which must say five.

**`fee_schedule` is required and enforced by nothing.**
`PRE_SUBMISSION_REQUIRED` names two acknowledgments — `product_reality` and
`fee_schedule`. `checkAll` gate 1 checks only `product_reality`. No gate checks
the fee schedule.

The compliance-gate panel queried for it, computed `hasFeeSchedule`, and dropped
it, so the page did not say so either. The panel now shows the row, marked
`critical: false`, with a detail line stating that it is required before
submission and enforced by no gate.

**Decision.** Show it; do not enforce it yet. Adding a sixth enforced gate changes
what submission means for every venture and is a Compliance Review Board question,
not a display fix. What was not defensible was the page knowing and not saying.

**Open.** Either `fee_schedule` becomes an enforced gate, or
`PRE_SUBMISSION_REQUIRED` stops claiming it is required before submission. The
two statements cannot both stand.

---

## 3. The suitability gate, and where its reasoning lives

**Decided 2026-09-02, recorded here 2026-09-03.**

The suitability gate refuses when `noGoTriggered && !overriddenBy`. Three
properties of that are decided in `docs/decisions/suitability.md` and are not
restated here:

- an override records a decision and does not rewrite the verdict, so
  `overriddenBy` is the signal and `noGoTriggered` still reads `true` — entry 4
- the gate does **not** block on an unassessed gate, which is decided rather than
  omitted — entry 2a
- the override is resolved through the business and the tenant, because writing
  `overriddenBy` onto another tenant's check cleared their placement gate —
  entry 4

`submit_application`'s operating instruction cites those rather than repeating
them. Two manuals stating the same rule in different words is how the rule comes
to have two meanings.

---

## 4. Ruled 2026-09-03 — the inert gate stays, and `fee_schedule` stops claiming required

Entry 2 recorded both and closed neither. Both are now ruled.

**`cu_membership_disclosure` stays inert.** It cannot fire without an issuer
*type*, and `CardApplication` carries an issuer *name*. Adding the column is a
data-model decision with no caller asking for it, and faking the gate — deriving
a type from an issuer name — would make a control that reports on a guess.

So the gate list is **five enforced**, said that way everywhere it appears,
including in the operating instruction. The sixth is recorded rather than
removed, because it becomes real the day an issuer type exists.

**`fee_schedule` is removed from `PRE_SUBMISSION_REQUIRED`.**

Gating it would refuse submissions on a record nothing captures. That is the
debt-service shape from `suitability.md` entry 2: a control no client can cure is
an outage with a compliance justification. The constant now says what is
actually enforced.

Gating becomes available the day a fee schedule is recorded against a business.
Recorded here so that the option is a decision waiting on data rather than a
thing nobody remembered.

**And a fourth dead control, found while ruling this one.**
`assertPreSubmissionGate` — the method that consumes this constant — has **no
production caller**. Its own docstring says it is *"checked before any
CardApplication transitions to submitted"*, and no submission path invokes it.
Only its unit tests do.

So `product_reality` survives as a control solely because
`ApplicationGatesService` gate 1 checks it separately, and the pre-submission
acknowledgment gate as a whole has never run. Not fixed here: wiring it changes
what submission means, and deleting it discards a tested implementation of a
control somebody intended. It joins `hasConsent`, `hasAck` and `hasFeeSchedule`
as the fourth of its kind in this area, and it is the largest.

---

## 5. OPEN — is credit-union membership disclosure actually required here?

**Raised 2026-09-03. Not decided.**

Entry 3 ratified leaving `cu_membership_disclosure` inert "until an issuer type
exists." That was a decision about a dead branch. This entry asks the question
underneath it, which nobody has asked: **is the disclosure required for
applications this system actually places?**

### What is on file

| | |
|---|---|
| `CreditUnion` rows | **6**, every one `isActive: true` and `businessCardsOffered: true` — Lake Michigan, Navy Federal, First Tech, PenFed, Alliant and one more |
| the disclosure | declared `required: true`, `applicableTo: ['credit_union']`, with full `templateText` in `compliance.routes.ts` |
| the gate | runs only when `issuerType === 'credit_union'` |
| `CardApplication` | carries an issuer **name** and **no issuer type column** |
| applications placed with a credit union so far | **none** — every distinct issuer on file is a bank (Chase, Amex, Capital One, BofA, US Bank, Citi, Wells Fargo) |

### Why "inert" was the wrong frame

Inert reads as *harmless*. This is a **declared-required disclosure with a dead
branch where its control should be**, on a placement path the product is built to
support: six credit unions are carried as active targets that offer business cards,
and `issuer-rules.routes.ts` prices their membership.

Nothing has gone wrong yet only because no application has been placed with one.
**The first one that is will pass submission without the disclosure, silently** —
five gates green, and the sixth not refusing but never running. That is the failure
mode this whole document set exists to name: a control that is green because it
never executed.

### The question, and it is not an engineering one

**Is membership disclosure legally required before a client applies for a
credit-union business card?** The declared text says the client must be informed
that membership is required and is a separate relationship from the card.

- **If yes** — this is a compliance hole, not a gap. It needs an `issuerType`
  column, or issuer-name resolution against the `CreditUnion` table, before any
  credit-union placement happens. The migration is small; the ordering is the point.
- **If no** — the constant should stop declaring it `required`, the same way
  `fee_schedule` did in entry 2. Both cannot stand.

### What is true in the meantime

**Do not read "five gates passed" as "the application was fully checked."** For a
bank issuer the five are the whole ladder. For a credit union they are not, and
nothing in the response says which case you are in.

Recorded in `capitalforge-record-consent.md` §2 and
`capitalforge-submit-application.md` §4, both of which previously described the
six-gate chain as though all six ran.
