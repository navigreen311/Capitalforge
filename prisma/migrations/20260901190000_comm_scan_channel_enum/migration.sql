-- `channel` on a communication scan is the same five values a consent is
-- recorded against: voice | sms | email | partner | document.
--
-- It was a free string. The compliance library already makes this distinction —
-- ConsentChannelSchema in shared/validators — and this module could not express
-- it, which mattered the moment disclosure placement started depending on
-- whether a script is spoken.
--
-- NOT VALID, deliberately.
--
-- The constraint is enforced on every INSERT and UPDATE from here on and the
-- existing rows are NOT scanned. `comm_compliance_records` was empty in the
-- development database when this was written — 0 rows — so there was nothing
-- to see there, and that says nothing about what is in production. A plain
-- CHECK would fail this migration on the first deployment that holds a value
-- outside the five, which is the wrong way to discover one.
--
-- To find them, before validating:
--
--   SELECT "channel", count(*)
--     FROM "comm_compliance_records"
--    WHERE "channel" NOT IN ('voice','sms','email','partner','document')
--    GROUP BY "channel"
--    ORDER BY count(*) DESC;
--
-- Then decide per value — some may be a real channel this list is missing
-- rather than a typo — and once none remain:
--
--   ALTER TABLE "comm_compliance_records"
--     VALIDATE CONSTRAINT "comm_compliance_records_channel_check";

ALTER TABLE "comm_compliance_records"
  ADD CONSTRAINT "comm_compliance_records_channel_check"
  CHECK ("channel" IN ('voice', 'sms', 'email', 'partner', 'document'))
  NOT VALID;
