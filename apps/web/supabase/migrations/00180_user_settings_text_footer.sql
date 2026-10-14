-- Text queue (00179): whether a drafted text ends with the agent's name and
-- brokerage and an opt-out line ("Reply STOP to opt out."). On by default:
-- CASL asks a commercial message to identify the sender and offer a way to
-- unsubscribe. An agent can turn it off in the phone app's Settings so texts
-- read as personal messages; that choice, and its CASL risk, is theirs.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS text_footer boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN user_settings.text_footer IS
  'Drafted texts end with "{name}, {brokerage}" and "Reply STOP to opt out." when true (default). Agent-controlled in mobile Settings.';
