-- Text queue: Flight Crew drafts short texts that the agent sends from the
-- phone app (iOS Messages opens prefilled; the agent taps Send). A text is an
-- outreach_queue row with channel 'sms' and opportunity_type 'text_message',
-- so it never shares the (user_id, client_id, opportunity_type, trigger_date)
-- key with an email. Existing rows and writers keep the 'email' default, so
-- the nightly detector and every email path are unchanged.

ALTER TABLE outreach_queue
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

ALTER TABLE outreach_queue
  DROP CONSTRAINT IF EXISTS outreach_queue_channel_check;
ALTER TABLE outreach_queue
  ADD CONSTRAINT outreach_queue_channel_check
  CHECK (channel IN ('email', 'sms') AND (channel <> 'sms' OR opportunity_type = 'text_message'));

COMMENT ON COLUMN outreach_queue.channel IS
  'email: drafted email (Flight Control). sms: drafted text, sent by the agent from the phone app (opportunity_type text_message).';
