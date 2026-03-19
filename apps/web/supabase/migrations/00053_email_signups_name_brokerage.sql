-- Add name and brokerage fields to email_signups for waitlist/event captures.
-- Both nullable — email is the only required field.

ALTER TABLE email_signups
  ADD COLUMN IF NOT EXISTS name      TEXT,
  ADD COLUMN IF NOT EXISTS brokerage TEXT;

COMMENT ON COLUMN email_signups.name      IS 'Optional — full name of the signup';
COMMENT ON COLUMN email_signups.brokerage IS 'Optional — brokerage name, useful for B2B outreach at launch';
