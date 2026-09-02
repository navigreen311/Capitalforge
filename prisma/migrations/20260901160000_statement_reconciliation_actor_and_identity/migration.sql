-- Who reconciled a statement, when — and what makes two statements the same one.
--
-- `statement_records` recorded reconciliation as `reconciled BOOLEAN`. Nothing
-- else. `reconcileStatement` computed a `reconciledAt`, returned it to the
-- caller and put it, `reconciledBy` and the notes into a `statement.reconciled`
-- ledger event — then wrote `{ reconciled: true }` to the row.
--
-- So the only record of WHO signed off lived in an event published after, and
-- outside, the update that flipped the flag. A failed publish left a statement
-- reconciled by nobody, permanently, and no read could ever say otherwise. The
-- route also defaulted the actor to the literal 'system' when no user id was
-- present, which recorded an advisor's attestation against a machine that
-- reviewed nothing.
--
-- Reconciliation is a person saying they looked. The row has to hold that.

ALTER TABLE "statement_records" ADD COLUMN "reconciledByUserId" TEXT;
ALTER TABLE "statement_records" ADD COLUMN "reconciledAt" TIMESTAMP(3);
ALTER TABLE "statement_records" ADD COLUMN "reconciliationNotes" TEXT;

-- Backfill from the ledger, which is where the answer has been all along.
-- `statement.reconciled` carries reconciledBy, reconciledAt and notes, keyed by
-- aggregateId. Latest event per statement wins; a statement reconciled twice
-- cannot happen now, but the data predates the constraint that says so.
UPDATE "statement_records" sr
   SET "reconciledByUserId" = latest."reconciledBy",
       "reconciledAt"       = latest."reconciledAt",
       "reconciliationNotes"= latest."notes"
  FROM (
    SELECT DISTINCT ON (le."aggregateId")
           le."aggregateId"                          AS statement_id,
           le."payload"->>'reconciledBy'             AS "reconciledBy",
           (le."payload"->>'reconciledAt')::timestamp AS "reconciledAt",
           le."payload"->>'notes'                    AS "notes"
      FROM "ledger_events" le
     WHERE le."eventType" = 'statement.reconciled'
       AND le."aggregateType" = 'statement_record'
     ORDER BY le."aggregateId", le."publishedAt" DESC
  ) AS latest
 WHERE sr."id" = latest.statement_id
   AND sr."reconciled" = true;

-- 'system' was never an actor. It was the route's `?? 'system'` default, and
-- leaving it in place would make an unattributed sign-off indistinguishable
-- from a real one for the rest of the table's life. NULL says "not recorded",
-- which is what happened.
UPDATE "statement_records"
   SET "reconciledByUserId" = NULL
 WHERE "reconciledByUserId" = 'system';

-- Same treatment as card_applications.createdByUserId: an id that resolves to
-- nobody was never an actor, it only looked like one.
UPDATE "statement_records" sr
   SET "reconciledByUserId" = NULL
 WHERE sr."reconciledByUserId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = sr."reconciledByUserId");

ALTER TABLE "statement_records"
  ADD CONSTRAINT "statement_records_reconciledByUserId_fkey"
  FOREIGN KEY ("reconciledByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "statement_records_reconciledByUserId_idx"
  ON "statement_records"("reconciledByUserId");

-- ── What makes two statements the same statement ──────────────────────────
--
-- There was no uniqueness of any kind. Ingesting the same statement twice made
-- two records, two ledger events, and doubled every anomaly on the business
-- report — so an agent retrying a timeout doubled a client's month, and the
-- module's `idempotency_support` was none.
--
-- A statement is identified by the account it belongs to, the issuer, and the
-- period it closes: (businessId, issuer, statementDate). `statementDate` is NOT
-- NULL and ingest refuses an undated statement, so the key is always complete.

ALTER TABLE "statement_records" ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "statement_records" ADD COLUMN "supersededById" TEXT;

-- Existing duplicates are superseded, not deleted.
--
-- The newest row per key stays live and the older ones are marked, pointing at
-- the row that replaced them. Deleting would destroy the record an advisor may
-- already have reconciled against, and a reconciled statement is evidence of
-- what somebody reviewed on a particular day.
WITH ranked AS (
  SELECT "id",
         "businessId",
         "issuer",
         "statementDate",
         FIRST_VALUE("id") OVER (
           PARTITION BY "businessId", "issuer", "statementDate"
           ORDER BY "createdAt" DESC, "id" DESC
         ) AS winner_id,
         ROW_NUMBER() OVER (
           PARTITION BY "businessId", "issuer", "statementDate"
           ORDER BY "createdAt" DESC, "id" DESC
         ) AS rn
    FROM "statement_records"
)
UPDATE "statement_records" sr
   SET "supersededAt" = NOW(),
       "supersededById" = ranked.winner_id
  FROM ranked
 WHERE sr."id" = ranked."id"
   AND ranked.rn > 1;

-- Partial, so superseded rows can coexist with the live one they were replaced
-- by. Only one live statement per account, issuer and period.
CREATE UNIQUE INDEX "statement_records_live_period_key"
  ON "statement_records"("businessId", "issuer", "statementDate")
  WHERE "supersededAt" IS NULL;

CREATE INDEX "statement_records_supersededById_idx"
  ON "statement_records"("supersededById");
