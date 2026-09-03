-- Evidence keeps its type, and the bundle says when it was built.
--
-- `evidenceDocIds` and `callRecordIds` are arrays of bare strings. Attaching
-- evidence validated a `type` — document | call_record | debit_event |
-- screenshot | other — and then used it once, to choose which of the two
-- arrays the id went into: `call_record` to one, EVERYTHING ELSE to the other.
--
-- So a debit event and a screenshot were stored identically, and a complaint
-- file could not answer what it held. The title and the notes the caller sent
-- were validated and discarded entirely.
--
-- `evidenceItems` keeps the item as sent, with who attached it and when. The
-- two id arrays stay: they are how everything reads evidence today, and they
-- become a derived index rather than the record.

ALTER TABLE "complaints" ADD COLUMN "evidenceItems" JSONB;

-- The unauthorized-debit bundle is a snapshot taken when the complaint was
-- filed, and it is never rebuilt. That is defensible for evidence — it is what
-- was known at the time — but it was indistinguishable from a current view,
-- and debits after the filing simply do not appear.
ALTER TABLE "complaints" ADD COLUMN "debitBundleBuiltAt" TIMESTAMP(3);

-- Backfill what can be recovered, and no more.
--
-- Existing rows carry ids with no type, no title and no attribution. The type
-- can be inferred for the call-record array only, because that array had
-- exactly one meaning. Everything in evidenceDocIds is 'unknown': it may have
-- been a document, a debit event, a screenshot or an 'other', and guessing
-- 'document' would put a plausible wrong answer in an evidence record.
UPDATE "complaints"
   SET "evidenceItems" = (
     SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) FROM (
       SELECT jsonb_build_object(
                'type', 'call_record',
                'referenceId', value,
                'title', NULL,
                'notes', NULL,
                'addedBy', NULL,
                'addedAt', NULL,
                'backfilled', true
              ) AS item
         FROM jsonb_array_elements_text(COALESCE("callRecordIds", '[]'::jsonb))
       UNION ALL
       SELECT jsonb_build_object(
                'type', 'unknown',
                'referenceId', value,
                'title', NULL,
                'notes', NULL,
                'addedBy', NULL,
                'addedAt', NULL,
                'backfilled', true
              ) AS item
         FROM jsonb_array_elements_text(COALESCE("evidenceDocIds", '[]'::jsonb))
     ) AS items
   )
 WHERE "evidenceItems" IS NULL;

-- No backfill for debitBundleBuiltAt. The bundle is not stored on the row — it
-- is rebuilt into the response from achAuthorization at read time — so for an
-- existing complaint there is no date to recover. NULL means "built before
-- this column existed", which is the honest answer and is what the response
-- will say.
