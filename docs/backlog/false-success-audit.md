# Audit: success reported for things that did not happen

**Status:** open — audit list below, **no fixes applied**
**Surfaced by:** three defects in one session, which turned out to be one pattern

## The standing question

Every entry below reduces to one of two checks, and they are not the same:

1. **Does anything read it?**
2. **Does anything act on it?**

A field can pass the first and fail the second — collected, transmitted,
accepted by a request schema, and never consulted by the code that decides the
outcome. That is indistinguishable, from the outside, from a value that shaped
everything. Six optimizer inputs passed check one and failed check two, and one
of them was reported by the provenance panel as `advisor_entered`: the tool
built to make inputs trustworthy, vouching for an input nothing used.

Ask both of every surface in this audit. A toast that reports a write nothing
performed and a field that reports an influence nothing exercised are the same
defect, and the second is quieter.

### A search rule, added 2026-08-05: check the reverse direction first

**Audit by capability, not by page — and start with the undo.**

The enable path gets exercised. Somebody demos it, somebody tests it, somebody
uses it in anger. The reverse is used rarely, often under pressure, and usually
by someone who assumes it works because the forward path did. **That is where
mocks survive.**

Two instances proved it in one sweep:

- **Legal hold.** The *enable* path was escalated and fixed during this audit.
  The *release* path was a 600 ms sleep, a success toast and a `console.info`
  claiming an audit event that never happened — missed because it lives in a
  different component, so a page-scoped sweep never reached it.
- **Tenant suspend.** Answered 200 with a `suspendedAt` timestamp and wrote
  nothing. **There is no unsuspend endpoint at all**, and that is precisely why
  it survived: nobody could try to undo a suspension, so nobody discovered that
  suspending did nothing either.

So the rule has two halves:

1. **For every capability, list both directions before reading any code.** If
   the reverse does not exist, that is the finding — a one-way access control
   is its own defect, and its absence hides the state of the forward path.
2. **Read the reverse path first.** If it is real, the forward one usually is.
   The converse does not hold.

A capability, not a page: the two halves of legal hold live in different
components and different routers, and no page-shaped sweep puts them side by
side.

### Symmetry is not evidence — both directions can be fake

The rule above compares the two halves of a capability. That catches a
mismatch, and a mismatch is the common case — but not the only one.

**2FA passes the reverse-direction check cleanly and is entirely unreal.**
`enable` and `disable` both operate on a process-local `Map`, and the login
page issues tokens *before* asking for the second factor. Nothing is
inconsistent between the directions, because neither of them does anything.

So the check is: not "do the two halves agree", but **"does each half reach
storage, and does anything enforce what it wrote"**. Agreement between two
mocks is agreement.

2FA is tracked separately in **`docs/backlog/two-factor-auth.md`**. It does not
belong on this list: everything here reports a write that did not happen, and
that is an authentication control the interface offers and the system does not
have.

### A capability flag set by the absence of a throw

Found 2026-08-06 while building 2FA. Not the RAM-storage defect — a separate
one, in the same file, and quieter.

```ts
try {
  const otplib = require('otplib');
  authenticator = otplib.authenticator;   // undefined in v13
  otplibAvailable = true;                 // ← set anyway
} catch {
  // otplib not installed — use mock fallback
}
```

otplib v13 has no `authenticator` export. The import **succeeded**, so the
catch never ran, so the mock fallback was unreachable — and `otplibAvailable`
reported the real library as live while `authenticator` held `undefined`. Every
`authenticator.check(...)` would have thrown at the point of use, far from the
line that caused it.

The comment made it worse by describing an intent the code did not implement:
*"graceful fallback"* reads as "degrades safely", and what it did was claim
success for an import that produced nothing usable.

**The general rule: a capability flag set by the success of an import is not
evidence the import produced a working thing.** Verify the *shape*, not the
absence of a throw:

```ts
otp =
  typeof lib.generateSecret === 'function' &&
  typeof lib.verifySync === 'function'
    ? (lib as OtpLib)
    : null;
```

This is the same family as the rest of this document — a flag asserting a state
nothing established — but it is worth its own entry because the usual tell is
missing. There is no toast, no response, no user-visible claim. The false
success is internal, and its only symptom is a `TypeError` somewhere else.

Related, and deliberate: the replacement has **no mock fallback at all**. A
second factor that quietly degrades to something weaker is worse than one that
refuses, because the refusal gets noticed.

### A boolean asserting a state with no credential behind it

Found the same day, by querying the database rather than reading the schema.

`admin@demoadvisors.io` carried `mfaEnabled = true` with `mfaSecret = NULL` —
a flag set by the in-memory implementation, which never wrote either column.
Harmless while nothing read it. **On the day enforcement shipped it would have
locked that account out permanently**: nothing to verify a code against, and no
recovery codes to fall back on.

Two things worth carrying:

**It was found by querying, not by reading.** The schema says `mfaEnabled
Boolean` and `mfaSecret String?`, and nothing in it forbids the combination.
That is now the third or fourth time in this codebase that the deciding
information came from the data rather than the definition — alongside the five
`gaps.md` claims disproved by running the query, and the `scripts/**` tool that
described a schema it no longer matched. **Read the schema to know what is
possible; query the data to know what is true.**

**The fix makes the incoherent state unreadable rather than checking for it.**

```ts
export function isMfaEnrolled(user) {
  return user?.mfaEnabled === true && user.mfaSecret !== null && user.mfaSecret !== '';
}
```

Every caller asks that question instead of reading the flag. The alternative —
checking for the combination at each call site — is a rule that has to be
remembered, and the next call site is where it gets forgotten. Same move as the
`{ legalHold: boolean }` toggle: prefer making the bad state unrepresentable,
and where the data already contains it, unreadable.

### A third check, added 2026-08-05

3. **Does a test assert the current behaviour?**

If one does, that is **worse than no coverage at all**, and it is the check
most likely to be skipped — a green suite reads as evidence the behaviour was
considered.

The instance that prompted this. `/credit-builder` told advisors to *"Pull a
FICO SBSS report for this client"*, with a timeline estimate of **"Same day"**.
Nobody can pull an SBSS: FICO calculates it when a *lender* requests it, from
an application. So the page named an errand that does not exist and put a
deadline on it.

That string was **pinned by a passing browser test**, which had been green
since it was written.

The damage is not that the test failed to catch the defect. It is that the test
*documented* it. A wrong behaviour with an assertion behind it looks
deliberate: the next reader finds a test that says the page should say this,
concludes somebody decided it, and works around it instead of fixing it. An
untested defect looks like an oversight and gets fixed. A tested one looks like
a specification and gets preserved — and every future change is measured
against it.

So when auditing a surface, read its tests as **claims to be checked**, not as
evidence. The question is not "is this covered" but "does the assertion say
something true about the world". Two of the tests changed during this audit
asserted `toBeNull()` for figures that were genuinely derivable, and one
asserted an action nobody could take.

Corollary for writing tests: assert the **property**, not the wording. The
replacement here pins that the two empty states differ from each other rather
than pinning either string, so it survives a rewording and still fails if the
distinction is ever collapsed.

## The pattern

Optimistic UI written against endpoints that do not do what their name implies.
The interface reports success, navigates away, or both — and the write never
happened. Each instance looked like its own bug:

1. **New Application** — the form POSTed to `/api/v1/applications`, a route that
   did not exist. Its `catch` navigated to the applications list anyway
   (*"If API doesn't exist yet, just redirect back"*), so a failed create looked
   like a successful one: the user landed on a list of applications theirs was
   not on.
2. **Optimizer 401** — a raw `fetch` with no refresh reported *"Your session has
   expired"* while the session was fine. The inverse failure: a working action
   reported as broken, and the real cause hidden behind a fixed string.
3. **save-strategy / create-round** — both mocks. Toasted *"Strategy saved to
   <client> profile"* and *"Funding Round N created"*, then navigated to
   `/funding-rounds`. Neither wrote anything; `create-round` invented an id.

All three are now fixed. The pattern is not.

**Why it matters here specifically:** this is a funding and compliance product.
"Strategy saved to client profile" and "Funding Round created" are claims about
records an advisor will later act on. A UI that reports a write it did not make
is a data-integrity defect, not a cosmetic one.

## A fourth instance: a panel that never ran

Found 2026-08-03, after the three above, and it is the same pattern pointed the
other way — not a success reported for a write that did not happen, but a whole
input surface implying an influence it did not have.

The optimizer's **Credit Union Eligibility panel** collects state of residence,
employer, military status, tech-industry status and existing memberships, and
computes an eligibility result on screen. The run payload sent
`includeCreditUnions: false` — hardcoded, never wired to anything. **Every field
in that panel was computed client-side and discarded.** No credit union card
could appear in a plan, whatever an advisor entered.

It cost real time: several rounds of debugging treated the panel as live and
returning nothing, when it had never executed. Nothing about it looked disabled.

Now fixed — an explicit "Include credit unions in this plan" toggle, the
eligibility fields sent, and each CU recommendation stating whether the client
is a member, how they could join, or that their standing is unknown. Logged here
because the class is worth watching for: **a form that changes nothing is the
same defect as a toast that saves nothing**, and it is harder to spot, because
there is no false message to catch — only a control that appears to matter.

Worth adding to the audit below: for each input surface, does anything read it?
A field whose value never reaches a request is the quietest version of this
pattern.

## A fifth instance: inputs the scorer never reads

Found 2026-08-04, immediately after the credit union panel, and the same shape
one level down. Not a whole surface this time — individual fields.

Six inputs on the optimizer form are collected, transmitted, accepted by the
request schema, and **never read by the scorer**:

| Field | Status |
|---|---|
| `dnbPaydex` | inert |
| `experianBis` | inert |
| `ficoSbss` | inert |
| `employees` | inert |
| `inquiries24mo` | inert — only the 12-month figure is used |
| `derogatoryMarks` | inert |

`ApplicationContext` — everything the scorer sees — carries exactly `ficoScore`,
`annualRevenue`, `businessAgeMonths`, `recentInquiries`, `existingCardCount` and
the held-product set. Nothing else reaches scoring.

**`derogatoryMarks` is the sharp one.** The field was added so the provenance
banner would stop reporting it as an assumed default. It now reports
`advisor_entered` in the Inputs Used panel — which states, on the panel built
for exactly this purpose, that a value the advisor supplied was used. It was
not. A provenance panel that vouches for an unused input is worse than no
panel, because it converts a quiet omission into an explicit false claim.

`inquiries24mo` is the second sharp one: the field's own helper text reads
"Chase 5/24 uses 24-month count", and 5/24 does not read it.

**Marked, not wired.** Each field says "not used in scoring yet" on the form,
and every provenance entry carries `influencesPlan`, so the Inputs Used panel
greys and strikes the values the scorer never read. The flag is stored with the
plan rather than derived at render: the unread set will shrink as fields are
wired, and a plan read later must report the system that produced it. Wiring them is a modelling decision
— what weight does a PAYDEX of 72 carry against a FICO of 745 — and inventing
weights would produce a plan that looks more informed than it is, which is the
same defect in a more expensive form.

This is the instance that produced the standing question at the top of this
document.

## Fixed while sweeping (2026-08-04)

Two entries escalated out of this list rather than waiting for the audit,
because the surface made them severe rather than merely wrong.

**Legal hold reported success regardless of outcome.**
`app/compliance/documents/page.tsx` updated the row and toasted "legal hold
enabled" before the request, then swallowed any failure. Legal hold is the
control that preserves records for litigation and regulatory review: a hold that
silently no-ops leaves the records it was meant to protect deletable, while the
screen says they are protected. Now awaited — the row changes and the message
appears only when the server confirms, and a failure says plainly that the hold
was NOT applied.

**Compliance registers fabricated their contents on failure.** Both the document
and complaint pages initialised from placeholder arrays and fell back to them
whenever the GET failed, so an unreachable server rendered records the business
does not hold — on the two surfaces where knowing what it holds is the whole
point. Removed. Both now start empty, show a classified error, and distinguish
"no records on file" from "the register could not be loaded", which a table of
zero rows otherwise conflates.

The general rule, worth stating once: **a compliance surface must never
synthesise a record.** Everywhere else, placeholder data is a bad default;
here it is a false statement about a regulated business.

## What to audit

**43 success toasts across 17 files**, plus every post-action `router.push`.
For each: does the endpoint it reports on actually persist?

Three questions per site:

1. Does the endpoint write to the database, or is it a mock/stub?
2. Is the toast inside the success path, or does a `catch` also reach it?
3. Does navigation happen before the write is confirmed?

### Highest-signal files first

| File | Toasts | Navigations | Why it ranks here |
|---|---|---|---|
| `app/platform/workflows/page.tsx` | 8 | 0 | Most toasts in the app; unaudited |
| `app/clients/[id]/page.tsx` | 4 | 2 | Toast **and** navigation on client records |
| `components/funding-rounds/RoundActionButtons.tsx` | 2 | 2 | Funding rounds — money attached |
| ~~`components/credit-builder/TradelineTracker.tsx`~~ | 4 | 0 | **Audited 2026-08-04 — clean.** All four writes (add, dispute, log payment, mark inactive) hit persisting endpoints, are awaited, toast only in the success branch, and say plainly that nothing was saved on failure |
| `components/clients/DocumentsTab.tsx` | 4 | 0 | Document vault; compliance-relevant |
| `app/optimizer/page.tsx` | 4 | 0 | Two already fixed; other two unaudited |
| `components/documents/GenerateDocumentModal.tsx` | 3 | 0 | Document generation |
| `app/pricing/page.tsx` | 3 | 0 | Pricing changes |
| `app/platform/reports/ScheduledReports.tsx` | 2 | 0 | Report schedules — `docs/gaps.md` says nothing stores one |
| `app/declines/page.tsx` | 2 | 0 | Reapply reminders — `gaps.md` says nothing schedules them |
| `components/dashboard/ActionQueue.tsx` | 1 | 0 | Dismissals — `gaps.md` says anomalies have no stable id |
| `components/applications/NewApplicationModal.tsx` | 1 | 0 | Sibling of the form already fixed |

Remaining single-toast files: `app/regulatory/page.tsx`,
`app/disclosures/page.tsx`, `app/compliance/training/page.tsx`,
`components/applications/GenerateDocumentModal.tsx`.
`components/global/ToastProvider.tsx` is the provider itself — not a call site.

### Known-refusing endpoints to cross-reference

`docs/gaps.md` lists twenty-one endpoints that answer 501, including report
schedules, referrals, decline reminders, overdue reminders, anomaly dismissal,
and the two optimizer actions added this session. **Any success toast whose
endpoint appears on that list is a confirmed defect** — that cross-reference
alone should resolve a good portion of the list without reading the code.

Also check `credit-union.routes.ts` and `simulator.routes.ts`, which carry
mock markers.

## Regenerate the list

```sh
grep -rn "toast.success\|showToast(" --include=*.tsx --include=*.ts src/frontend \
  | grep -v "\.next"
grep -rn "router.push" --include=*.tsx src/frontend | grep -v "\.next"
```

## Suggested output

A table of `call site → endpoint → persists? → verdict`, with verdicts limited
to: **real**, **claims a write that does not happen**, **navigates before
confirming**, or **reachable from a catch**. Fix in a second pass, once the
scale is known — some will be one-line moves of a toast into the success branch,
and others need the endpoint built.

## A sixth instance: a control that saved nowhere, feeding a claim

Found 2026-08-04, on `/credit-builder`, and it is the pattern with the toast
removed — nothing announced a save, so there was nothing false to catch.

The six DUNS completion circles wrote to component state and to nothing else.
No endpoint, no table. Three consequences, in increasing order of severity:

1. A reload wiped every mark.
2. They were keyed to no client. Marking three steps for one business and then
   switching to another showed the second business the first one's progress.
3. **`tier1Unlocked` read the count.** The graduation banner — *"<Client> is
   ready for Tier 1 stacking! All business credit prerequisites are met."* —
   requires three completed steps alongside a PAYDEX of 80 and five trade
   lines. So a claim that a client is ready to apply for credit rested partly
   on checkboxes that belonged to nobody and survived nothing.

The page header was accurate: it said "DUNS steps marked here". The banner it
fed was not, and the banner is the surface an advisor acts on.

Now a `credit_builder_steps` row per business, with `completedBy` recording who
asserted it — nothing in this system verifies a DUNS registration or a bank
account, so the mark is stored as an advisor's claim rather than an
observation. The count is null until read, so an unread track can neither
satisfy the threshold nor fail it, and the circles are disabled when no client
is selected: there is nowhere to record a mark, and a circle that ticks and
saves nothing is the whole defect.

**The generalisation worth keeping:** the standing question at the top of this
document has a third form. *Does anything read it* and *does anything act on
it* both assume the value survives long enough to be read. A control whose
state is written nowhere fails a question the audit had not asked — **does it
still exist a minute from now, and is it attached to the thing it describes?**
Every input surface that feeds a judgment needs an answer to that one too.

## "Not known" is not "none"

Two surfaces defaulted an unreadable value to the reassuring one, and both are
now fixed. Recorded together because they are one rule, not two fixes.

| | Read failure became | Which renders as |
|---|---|---|
| `NavBadgeProvider` | `0` | no badge — "nothing waiting" |
| Settings 2FA status | `false` | "2FA is off. Enable it?" |

In both, the failure was invisible **and pointed the wrong way**. A queue nobody
could reach looked empty. An account whose protection could not be confirmed
looked unprotected.

### The rule

**A value that stands for a fact about the world needs a third state.** Two
states can only encode a fact and its negation; there is nowhere to put "we did
not find out", so it gets folded into whichever branch is the default — and the
default is nearly always the calm one, because that is what reads well when
things are working.

Three specifics worth keeping:

1. **The initial value is a claim too.** `DEFAULT_COUNTS` renders before the
   first request returns and whenever there is no session. Zeroes there flashed
   "all clear" on every page load, not merely on failure.

2. **Unknown must not borrow the alert styling.** The unknown badge is a muted
   grey `?`, never the red/amber/teal of a real count. An alert colour asserts
   that something needs attention, and the entire point is that we do not know
   whether anything does. It carries `title` and `aria-label` so the meaning
   does not depend on seeing the colour at all.

3. **Unknown must not offer the actions that presume knowledge.** The 2FA panel
   shows neither *Enable* nor *Disable* while the status is unreadable — both
   state a fact about the account it does not have. The only honest control is
   *Check again*.

`!twoFactorEnabled` was the specific trap: true for both `false` and `null`, so
the "not enabled" panel and its Enable button would have covered the unknown
case silently. Every branch is now an explicit `=== true` / `=== false` /
`=== null`, and a test asserts the truthiness check does not come back.

### Decided: the document generator keeps its mock fallback

`lib/claude-document-service.ts` — `generateDocument` returns a mock template
when the API is unavailable, distinguished from real output only by
`model: 'template-fallback'`.

**Ruled 2026-08-04: leave it.** Recorded as a decision rather than an oversight,
because it is the one place in this codebase where a fallback to invented
content is deliberate, and the next person to run the false-success audit will
otherwise find it and remove it.

The reasoning it rests on, so it can be revisited on its merits:

- The module has an explicit mock mode above this path. The fallback is that
  mode's failure branch, not a disguise for a broken request.
- The output is a **draft an advisor edits before sending**, not a record, a
  filing, or a claim to a third party. `GenerateDocumentModal` opens it in an
  editor. That is categorically different from a compliance register, an
  adverse-action notice, or a legal hold, where the artefact *is* the assertion.
- `model` carries the truth, and it is stored with the document. A template
  fallback saved to the vault is identifiable afterwards.

**What would change the ruling:** if generated documents ever go anywhere
without a human editing them first — auto-attached, auto-sent, auto-filed — the
fallback stops being a convenience and becomes fabricated content in a record.
The `model` field is the check to write the guard against.
