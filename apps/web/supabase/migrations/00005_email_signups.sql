-- ── email_signups ─────────────────────────────────────────────────────────────
-- Stores newsletter/waitlist email addresses collected from marketing pages.
-- Access is restricted to the service-role key only (no RLS policies = all
-- anon/authenticated requests are denied by default).

CREATE TABLE IF NOT EXISTS email_signups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  source     TEXT        NOT NULL DEFAULT 'website',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_signups_email_key UNIQUE (email)
);

-- Enable RLS — no policies added means only the service role can access
ALTER TABLE email_signups ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  email_signups           IS 'Marketing email capture — newsletter and waitlist signups';
COMMENT ON COLUMN email_signups.source    IS 'Which page/form the signup came from (e.g. homepage, pricing)';
