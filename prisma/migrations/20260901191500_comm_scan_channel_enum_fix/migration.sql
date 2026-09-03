-- Correcting the constraint added one migration ago.
--
-- 20260901190000 restricted `channel` to the five CONSENT channels — voice,
-- sms, email, partner, document. That was wrong, and it would have started
-- rejecting writes that had been valid all along:
--
--   `chat`         is offered by the frontend channel picker and accepted by
--                  the scan route.
--   `video_script` is the text a video is generated from, scanned before
--                  render, and deliberately distinct from `document` so the
--                  record says what was checked and what it was.
--
-- Neither is a consent channel — nothing captures consent over chat, and a
-- video script is not something a client consents to — so widening
-- CONSENT_CHANNELS to include them would have been the opposite mistake.
--
-- The lists are now one list in shared/types: CONSENT_CHANNELS, and
-- SCAN_CHANNELS as that plus the two above. This constraint is SCAN_CHANNELS.
--
-- A separate migration rather than an edit to the previous one, because that
-- one is applied and its checksum is recorded. The mistake is part of the
-- history whether or not the file admits it.

ALTER TABLE "comm_compliance_records"
  DROP CONSTRAINT IF EXISTS "comm_compliance_records_channel_check";

-- Still NOT VALID: existing rows are not scanned. `comm_compliance_records`
-- was empty in development (0 rows) and that says nothing about production.
-- To find values outside the list before validating:
--
--   SELECT "channel", count(*)
--     FROM "comm_compliance_records"
--    WHERE "channel" NOT IN
--          ('voice','sms','email','partner','document','chat','video_script')
--    GROUP BY "channel"
--    ORDER BY count(*) DESC;
--
-- Then, once none remain:
--
--   ALTER TABLE "comm_compliance_records"
--     VALIDATE CONSTRAINT "comm_compliance_records_channel_check";

ALTER TABLE "comm_compliance_records"
  ADD CONSTRAINT "comm_compliance_records_channel_check"
  CHECK ("channel" IN
    ('voice', 'sms', 'email', 'partner', 'document', 'chat', 'video_script'))
  NOT VALID;
