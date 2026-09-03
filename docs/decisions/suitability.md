# Decision record — `suitability_check`

Why this file exists: the decisions in entries 1–4 were made on 2 and 3 September
2026 and lived in a commit message and a conversation. That is the same shape as
every named control with no content this codebase has turned up — a decision
nobody can read gets remade. Each entry states what was decided, the reasoning,
and what was rejected.

Entries are appended, never rewritten. A decision that is reversed gets a new
entry that says so.

---

## 0. The module id, and why it is not in a Pack

**Decided 2026-09-03.**

The module id is **`suitability_check`** — the verb of the thing it does, and the
table it writes (`suitability_checks`). `suitability_assess` reads better beside
`assemble_evidence` and `restack_recommend`; `check` won because it is the word
every existing surface already uses, and a second word for one concept is how
`forge_module_exclusion` gets defeated.

**It is deliberately not declared in any Business Pack.**

Naming a module in a Pack is a commitment to build it. The Office's adapter
contract makes the Forge's dispatch map the naming authority, and V32 refuses a
Pack that declares a module the Forge does not dispatch. CapitalForge has no
Office adapter at all, so declaring `suitability_check` today would fail Gate 2
for every venture that named it, correctly, until an adapter exists.

**Decision.** The operating instruction documents an endpoint a human calls, and
says so in its header. No grant, no manifest row, no registry row. When an
adapter is built, this entry gets a successor that says the module was declared
and on what date.

**Rejected:** declaring it now and accepting a NOT_RUN or a FAIL at Gate 2 "until
the adapter catches up". A Pack that declares what it cannot reach is the exact
state Gate 0 and V32 exist to catch, and the Burkham Pack has already had two
modules removed for it (`bureau_pull`, `readiness_score`).

---

## 1. The engine that answers is the engine that asks

**Decided 2026-09-02.**

Two engines answered the same question and shared no rules. `suitability-engine.ts`
has seven hard no-go triggers and never persists. `suitability.service.ts`
persists, feeds the `noGoTriggered` a compliance manifest reports, and had seven
of its own. Credit score was the only shared concept, under two names and two
thresholds.

Three of the engine's triggers were unlike the rest: the client acknowledged the
personal guarantee, the client acknowledged APR risk, and an advisor confirmed
the client can service the debt. Those record **a human having confirmed
something** rather than a fact about the client's finances, and they sat in the
engine that could not answer. So the finding a regulator reads as *whether this
client should have been placed at all* was computed by a rule set that never
looked at whether the client had acknowledged the personal guarantee.

**Decision.** The three gates moved into `suitability.service.ts`, keeping the
engine's own codes so there is one vocabulary for one concept.

They are **read, not supplied.** `readAcknowledgmentGates` reads
`ProductAcknowledgment` rows, and a caller passes a `SuitabilityProfile`, which
omits all three by construction — a route cannot assert that a client signed
something, because the type has no field for it.

They **block placement and do not zero the score.** Bankruptcy, sanctions and
fraud force the composite to 0 because they are findings about the client. An
unsigned form is a procedural gap, and scoring the client 0 for one would state
something about their finances that nobody found. A test asserts the unsigned
score equals the signed score exactly.

**Rejected:** leaving the gates in the engine and having the service call it. The
two engines disagree about what the question *is* — bankruptcy, sanctions and
fraud exist only in the service; the acknowledgment gates existed only in the
engine — and merging them is a larger decision than moving three triggers. They
are still two engines. Entry 4 records what that leaves unresolved.

---

## 2. Debt-service confirmation is unassessed, not false

**Decided 2026-09-02.**

Nothing in CapitalForge records an advisor confirming a client can service the
debt. No model, no column, no endpoint.

**Decision.** `advisorConfirmedDebtServicing` is `boolean | null`, `null` means
unassessed, and it is reported in `unassessedGates` with the basis
`advisor_debt_service_confirmation_not_recorded`. The no-go for a confirmation
that was *asked for and refused* is implemented and currently unreachable; it
becomes reachable the day a record exists.

**Rejected — `true`.** That is what `GET /api/suitability/:businessId` did. It
stated, about a named business, that an advisor had confirmed debt-service
capacity, from nothing. The endpoint was deleted the same day; see entry 3.

**Rejected — `false`.** It would no-go every check in the system and convert a
missing feature into a finding about a client's file. An absence in the records
is not a fact about the client.

Recorded as a gap with a cost in `docs/gaps.md` §1d: a record with a person on
it — who confirmed, when, against what figures — closer to an acknowledgment
than to a boolean column, because the value of the gate is that a named human
looked.

### 2a. `submit_application` does not block on an unassessed gate

**Decided 2026-09-03.** Raised because an omission and a decision look identical
in code.

The suitability gate in `application-gates.ts` refuses when
`noGoTriggered && !overriddenBy`. It does not read `unassessedGates`, and the
question is whether that is right.

**Decision.** It stays. An unassessable gate blocks nothing.

Blocking would mean no application can ever be submitted, because nothing can
record the confirmation the gate wants — which is entry 2's rejected `false`
wearing a different hat. A gate that refuses every client for a reason no client
can cure is not a control; it is an outage with a compliance justification.

**What must not happen is silence.** The fact is carried where a reader meets
it: `GET /latest` returns `unassessedGates` (entry 3), and an assessment with an
empty `noGoReasons` and an entry there is not a clean assessment. The day a
debt-service confirmation is recordable, this entry gets a successor and the gate
reads it.

---

## 3. What a read of a check has to show

**Decided 2026-09-03.**

`unassessedGates` was returned by `POST /check` and dropped by
`GET /latest`. A third state that exists only on the write path is not a third
state: every later reader — the console, an advisor, a compliance officer opening
the file a week afterwards — saw `noGoReasons: []` and had no way to tell a gate
that passed from a gate nobody could ask.

**Decision.** `getLatestSuitabilityCheck` returns `unassessedGates`, read back
out of the `decisionExplanation` JSON where the check stored it. A stored check
whose explanation predates this, or cannot be parsed, returns `[]` — which is
honest for a row written before the field existed, and is not the same as
asserting the gates were assessed.

**Also decided the same day.** `GET /api/suitability/:businessId` was deleted. It
resolved a real business, read revenue and formation date, and invented
`creditScore = 700`, `utilizationRatio = 0.20`, `debtServiceRatio = 0.15`,
`inquiries = 1`, `derogatoryMarks = 0` and all three confirmation gates as
`true`. Four of the seven hard no-go triggers could therefore never fire, and the
answer came back stamped with the `businessId` and the legal name. A fifth fired
wrongly: a business with no `dateOfFormation` was reported "0 months old", which
is a missing field rendered as a fact about the business.

`POST /api/suitability/calculate` stays. It scores a payload the caller supplied,
names no business, reads no record, and the file header says so.

---

## 4. The override is scoped, and its refusals are typed

**Decided 2026-09-03.**

Two defects in one endpoint, found while gathering material for the operating
instruction.

**The override was not tenant-scoped.** `SuitabilityCheck` has no `tenantId` —
it is scoped only through `businessId` — and `applyOverride` resolved the check
with `findUnique({ where: { id: checkId } })`. Nothing compared the check's
business to the `:id` in the path, which the mount guard had already validated as
the caller's own. So a compliance officer could pass their own business in the
path and any `checkId`, and write `overriddenBy` onto another tenant's row.

That is not cosmetic. `application-gates.ts` treats `overriddenBy` as clearing
the no-go, so the write **clears another tenant's placement gate**. The event was
published under the caller's `tenantId` and landed in the wrong ledger.

**Decision.** The check is resolved through the business and the tenant —
`{ id: checkId, businessId, business: { tenantId } }` — and a check that does not
match is a **404, not a 403**. A caller who cannot see a check does not need to
be told it exists; the statement errors made the same choice for the same reason.

**The refusals were untyped.** `applyOverride` returned `{ success: false,
message }` and the route chose a status by substring-matching the prose:
`includes('not found')`, `includes('HARD NO-GO')`,
`includes('compliance_officer role')`. Rewording a message in the service
silently changed the status to 400 — a caller told to fix their request when the
truth was that they lacked a role.

**Decision.** Typed errors, thrown, mapped once in the route, the same treatment
`statement-reconciliation` and `compliance-dossier` already have. The hard-no-go
lock keeps its own type and its own code, because a caller must be able to tell
"you may not override this" from "you may not override".

**Unchanged, and stated because it surprises people.** An override records a
decision; it does not alter the verdict. `score`, `noGoTriggered` and
`noGoReasons` stay as they were, and only `overriddenBy` and `overrideReason` are
written. A reader checking `noGoTriggered` alone will conclude the client was
refused. The override is visible in `overriddenBy`, which is the field
`submit_application` reads.
