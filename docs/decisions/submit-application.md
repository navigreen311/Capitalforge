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

### Tripwire in place, 2026-09-03 — the decision has a trigger nothing detected

The question above is open and both answers are real. What it did not have was a
**detector**: the trigger is the first credit-union placement, and nothing would
have noticed it happening.

`POST /api/applications/:id/submit` now refuses when `parseIssuer(application.issuer)`
resolves to a credit union, with `422 CU_MEMBERSHIP_DISCLOSURE_UNENFORCEABLE`.

**This is not the fix and must not be mistaken for one.** The fix is the column, the
issuer-name resolution at write time, or the constant dropping its `required` claim.
This turns a silent pass into a loud refusal while the question is open.

**Why it can be decided here without new data.** `parseIssuer` already resolves an
issuer name to `credit_union` — it is what `issuer-rules.routes.ts` uses to price
membership — and it reads alias lists, so the refusal cannot be walked past by
spelling the issuer differently. The condition was always decidable; nothing was
asking it.

**What it costs.** A submission that would have skipped a required disclosure.
Against not refusing, which costs the disclosure.

**When it comes out.** The day entry 5 is answered. If the disclosure is required,
this is replaced by the gate actually running. If it is not, this is deleted with
the `required` claim.

Same shape as `fee_schedule` in entry 2: the control becomes available the moment
the data does, and until then the absence is stated rather than assumed away.

### Ruled 2026-09-04 — unresolvable from inside this repository

**The ruling is that there is no ruling to make here, and that is not a deferral.**

`required: true` has no source in this codebase. There is no citation, no
regulation, no compliance-review reference, and no issuer-agreement note anywhere
near the declaration. Its provenance is commit `e2ad5c7`, 7 April 2026 — *"feat: add
GET /api/compliance/disclosure-templates endpoint"* — a feature commit that wrote
the disclosure and its `required` flag inline as part of a static registry. The only
regulatory string nearby is inside the template text a client would read (*"insured
by the NCUA up to $250,000"*), which is content, not authority.

The Office's Compliance Library holds nineteen entries, each carrying an
`applicability_rule` and a `citation`. **None of them is about credit unions.**

**Why that does not settle it.** No source in the repository is not no obligation.
Retracting a compliance requirement because nobody cited one would be asserting a
conclusion from an absence of evidence — shared rule 1, turned on our own records.
Membership before application is a real feature of how credit unions work, and
whether disclosing it is required is a question this repository cannot answer about
itself.

**This is not the same shape as `fee_schedule` in entry 2.** That was a constant
claiming a requirement nothing captured: internally inconsistent, and internally
resolvable — either gate it or stop calling it required, and both options lived
here. This is a constant claiming a requirement nothing **sources**. The
inconsistency is between the code and something outside the code, and the answer is
not in the codebase to be found.

### What is known, and what is needed

| | |
|---|---|
| `CreditUnion` rows | 6, all `isActive`, all `businessCardsOffered` |
| membership pricing | live, `issuer-rules.routes.ts` |
| applications placed with a CU | none |
| the disclosure | `required: true`, declared by a feature commit, 7 April 2026, no citation |
| Compliance Library entries about credit unions | none of nineteen |

**Needed: a Compliance Library entry with an `applicability_rule` and a `citation`,
or a decision that none applies.** Routed to whoever owns the library. Until one of
those lands, the tripwire stays.

### A note on how the tripwire was approved

It was approved on a described coverage, and the description was narrower than it
read.

The refusal was accepted on the strength of *"`parseIssuer` already resolves an
issuer name to `credit_union` — it is what prices membership."* True, and it
resolves **the six credit unions in the catalogue**. `Golden 1 Credit Union`,
`Star One Credit Union` and `Some Random FCU` returned null and passed the control
built to stop them. Ordinary names.

It had a passing test throughout. The test exercised the alias list —
`navy_federal` resolving like `Navy Federal Credit Union` — which is a real property
and not the coverage question. **It took testing seven strings against both
resolvers to find out.**

**Same class as the §2 protection claims in the operating instructions**, where a
manual named a middleware that did not exist and an audit had to go and look. The
difference is only whose claim it was: those were found by auditing somebody else's
prose, and this one was written and approved by the two people reading it.

`isCreditUnionIssuerName` replaces it, and its own leak is recorded in the same
commit rather than left for the next reader to find the same way.

