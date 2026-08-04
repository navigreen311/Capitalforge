# Credit Union eligibility inputs are session-only

**Status:** open, not started
**Surfaced by:** optimizer session, 2026-08-03 — while diagnosing an unrelated
401 on `/optimizer`. This is not that bug and was not caused by it.

## What happens now

The Credit Union Eligibility panel on `/optimizer` collects four things:

| Field | State |
|---|---|
| State of Residence | `cuForm.state` |
| Employer | `cuForm.employer` |
| Tech Industry | `cuForm.techIndustry` |
| Existing CU Memberships | `cuForm.existingMemberships` |

All four live in `useState` on `app/optimizer/page.tsx` and nowhere else. They
are never read from the client record and never written back. Selecting a
business hydrates the Credit Profile panel from that client; the CU panel stays
at its initial values whoever is selected.

So they are re-entered from scratch every session, for every client, by every
advisor.

## Why it matters beyond the retyping

`includeCreditUnions` is sent to `POST /api/optimizer/run`, and credit-union
recommendations depend on eligibility that only these fields establish. An
advisor who skips the panel — or does not know it needs filling again — gets a
plan with **fewer options than the client actually qualifies for**, and nothing
on the page says so. The result looks complete. A missing recommendation is
invisible in a way a missing field is not.

These are also durable facts about a person, not preferences for one sitting.
State of residence and employer change rarely; an existing credit-union
membership does not lapse because a browser tab closed.

## What it would take

**Columns.** `Business` has no home for any of them. Membership is a list, so
it wants its own table rather than a JSON column if memberships are ever to be
queried — "which clients belong to Alliant" is a question this product will ask.

- `Business.stateOfResidence`, `Business.employer`, `Business.techIndustry`
- `CreditUnionMembership { businessId, creditUnionId, joinedAt }`

**Hydration.** Load them alongside the Credit Profile when a business is
selected, so the panel fills the way the profile beside it already does.

**Write-back.** Persist on change. Worth deciding whether that is immediate or
on an explicit save — the rest of this page does nothing to the record until
asked, and silently writing a client attribute from a scratch panel would be a
surprise.

**A caveat about the score.** Whatever runs today is computed from unsaved
inputs. Persisting them changes which recommendations appear for a client whose
panel was previously left blank. That is the point, but it means plans generated
before and after are not comparable, and any saved strategy that predates this
was produced without CU eligibility.

## Not in scope

Fixing the optimizer's auth handling — done separately. The panel losing values
mid-session was investigated and found not to happen; there is no state-loss bug
here, only state that was never persisted in the first place.
