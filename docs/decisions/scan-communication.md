# Decision record — `scan_communication`

Entries are appended, never rewritten. A decision that is reversed gets a new
entry that says so.

---

## 1. A clean scan writes no ledger event

**Decided 2026-09-03.** Ratified rather than changed.

`CALL_COMPLIANCE_VIOLATION` is emitted only when violations were found. A clean
scan leaves a `CommComplianceRecord` row and nothing in the ledger.

**Decision.** It stays.

The ledger is an event stream of things that happened, and a message that
violated nothing is not an event. Emitting one per clean scan would fill the
canonical chain a regulator is shown with proof of absence, and make the entries
that matter harder to find.

**What has to be said alongside it**, and is, in the operating instruction §7:
the ledger can answer *what failed* and cannot answer *what was checked*. A
regulator asking the first question gets the second, and the difference is every
message that passed. Coverage is a question for the records, not the ledger.

**Rejected — emitting a scan-completed event for every scan.** It makes the
ledger answer coverage at the cost of what the ledger is for. The honest home for
coverage is the tenant-level communication monitoring report, which does not
exist and is recorded as a known absence in `compliance_manifest_assemble` §8.
