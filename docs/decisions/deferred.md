# Deferred, 3 September 2026

Ten of the seventeen open decisions, deferred deliberately on 3 September 2026.

**This file exists so they are not raised again as new.** Each was looked at,
costed, and left; a decision that was made and then forgotten looks identical to
one nobody ever took, and the second person to find it spends the same afternoon
the first one did. Every entry says what it costs and what would change the
answer.

Deferred is not dropped and it is not closed. Nothing here has been decided
against — the work was ordered behind the CapitalForge Office adapter (#18),
which was the only item blocking Burkham from running at all, and none of these
ten blocked it.

Seven others were ruled the same day. Those live in the module records:
`suitability.md`, `submit-application.md`, `consent.md`, `scan-communication.md`,
and — for the two that are The Office's — `docs/decisions.md` in that repository.

---

## #4 — The debt-service confirmation record

**Costs a migration.** `docs/gaps.md` §1d has the detail.

A debt-service figure is confirmed by a person today and the confirmation is not
recorded anywhere: who confirmed it, when, and against which figures. A table
with a person on it.

**Deferred because** the figure is used correctly; what is missing is the
provenance of the human step, and no decision downstream currently reads it.
**What changes the answer:** anything that has to show a regulator who signed off
a debt-service number, or a dispute about one.

---

## #5 — The two suitability engines

**Costs a build.**

Four triggers currently bind nothing because the trigger surface and the engine
that persists are separate paths. The acknowledgment gates were moved into the
persisting engine on 2 September; the trigger merge was not.

**Deferred because** the persisting path is the one a submission goes through, so
the gates that matter are enforced. The four unbound triggers are additional
coverage, not a hole in the primary path.
**What changes the answer:** a requirement that a suitability re-assessment fire
on an event rather than on a submission.

---

## #6 — `personalCreditScore` read rather than asserted

**Costs a build**, and it is the one on this list that most changes a record's
meaning.

A credit profile exists in the database and is not consulted; the score is an
input a caller asserts. So a compliance record can carry a personal credit score
that no system ever read.

**Deferred because** it is not wrong today — the asserted value is what the
advisor entered, and it is labelled as an input.
**What changes the answer:** this is the strongest candidate on the list to
promote. A caller-asserted number inside a compliance record is the same shape as
`readiness_score` scoring from query parameters, which is already an exclusion.
It should be reconsidered as soon as #18's registry pass is done rather than
waiting for a trigger.

---

## #7 — `AiDecisionLog`

**Two things, and they were deferred as one, which is the mistake this entry
corrects.**

**The naming collision is a sentence.** `AI_MODULE_SOURCES` says
`suitability_engine`; the module is `suitability_check`. Now that the adapter's
dispatch keys are the spelling of record for CapitalForge, this is not cosmetic —
a source string that does not resolve against `_modules` is a log nobody can join
to a call. **Take this one with the next pass of sentences; it is cheaper than it
looked when it was bundled with the rows.**

**Writing the rows is code**, and stays deferred.

---

## #8 — The four discarded queries

**Blocked, not costed.** `docs/gaps.md` §1e has all four.

`pendingApprovals` in particular is only decidable by whoever knows what the
approval chain was meant to enforce. The other three are a computed answer nobody
reads, which is a defect but not one whose fix is obvious without knowing the
intent.

**Deferred because** it is blocked on a person, not on work.

---

## #9 — Tenant-level communication monitoring report

**Costs a build.**

The home for the coverage question — what proportion of communications were
scanned — which the compliance manifest excludes and the ledger cannot answer.
Named as a known absence in two operating instructions now.

**Deferred because** naming it as an absence in the manuals is the honest interim
state: an agent reading either manual is told the number does not exist rather
than being given one that is wrong.
**What changes the answer:** an examiner asking for scan coverage.

---

## #13 — Diagnostic Analyst duties

**Blocked on #17.**

`bureau_pull` and `readiness_score` were both removed from the Burkham Pack on
1 September. The role was defined around them, and it cannot be settled until
there is an answer to whether readiness is obtainable at all — which is #17.

---

## #14 — The day-30 KPI

**Blocked on #17, and reading zero in the meantime.**

It measures `module_id=readiness_score`, which is now excluded, so it reads zero
forever rather than reporting that it cannot be measured. Needs a replacement
measure, which depends on the same readiness question.

**Worth knowing while it is deferred:** a KPI that reads zero looks like bad
performance, not like a broken measure. Whoever reads the day-30 number before
this is fixed will draw the wrong conclusion from it.

---

## #17 — The §3m debt component

**Costs a migration, and it is the sharpest thing on this list.**

`scoreDebtBurden` is 10 points of 100 and no column exists for its inputs —
`HeldCard` carries a limit and no balance. So **every production readiness score
is out of 90, compared against thresholds written for 100.** Every client scores
up to ten points low against a bar set for a whole scale, and nothing says so to
the person reading the number.

The code's own comment says it "needs a data source, not a code change".

**Deferred because** the fix needs a balance source that does not exist yet, and
because #18 was ahead of it.

**It should be first among these ten.** It is the only one silently wrong in
production today, it unblocks #13 and #14, and the cheapest partial fix is not the
migration at all: state the scale. A score presented as "out of 90, debt
component unmeasured" is honest and costs a sentence in the response — the same
third-state move as `documentsUnverifiable` and `unassessedGates`. That does not
close #17, and it stops the number lying while #17 waits.
