-- ── email_signups.unsubscribed_at ────────────────────────────────────────────
-- Adds a per-row unsubscribe timestamp so the marketing email list (cheat-sheet
-- delivery + charter welcome + future lead magnets) can honour CASL §11
-- unsubscribe requests in-band.
--
-- NULL  = subscribed (default).
-- value = unsubscribed at that timestamp (set by /api/email/unsubscribe-marketing).
--
-- The subscribe route does not need to change: re-submitting the form is a
-- fresh affirmative consent action and the current upsert will reset the row.
-- A future change can choose to honour-or-clear unsubscribed_at on re-subscribe;
-- both are CASL-compliant.

ALTER TABLE email_signups
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

COMMENT ON COLUMN email_signups.unsubscribed_at IS
  'Set when the recipient clicks the in-email unsubscribe link. NULL = subscribed. CASL §11.';

-- Partial index for the cron-style "is this address still subscribed?" check
-- (cheap; vast majority of rows will have unsubscribed_at = NULL).
CREATE INDEX IF NOT EXISTS idx_email_signups_unsubscribed
  ON email_signups (unsubscribed_at)
  WHERE unsubscribed_at IS NOT NULL;
