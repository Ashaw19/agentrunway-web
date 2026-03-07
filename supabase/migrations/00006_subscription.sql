-- ── Subscription tracking columns on user_settings ───────────────────────────
-- Added when Stripe billing is activated. All columns are nullable / defaulted
-- so existing rows are unaffected and the migration is safe to run at any time.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS subscription_tier            TEXT        NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS subscription_status          TEXT        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id           TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id       TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

-- Indexes for webhook lookups by Stripe IDs (partial — only non-null rows)
CREATE INDEX IF NOT EXISTS idx_user_settings_stripe_customer
  ON user_settings(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_settings_stripe_subscription
  ON user_settings(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN user_settings.subscription_tier             IS 'starter | professional | team';
COMMENT ON COLUMN user_settings.subscription_status           IS 'free | trialing | active | past_due | canceled | unpaid';
COMMENT ON COLUMN user_settings.stripe_customer_id            IS 'Stripe customer ID (cus_...)';
COMMENT ON COLUMN user_settings.stripe_subscription_id        IS 'Stripe subscription ID (sub_...)';
COMMENT ON COLUMN user_settings.subscription_current_period_end IS 'End of current billing period from Stripe';
