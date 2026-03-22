-- ============================================================================
-- 00059 · organizations — Stripe billing fields + beta flag
-- ============================================================================

-- Stripe billing integration for team/brokerage subscriptions
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id        TEXT,
  ADD COLUMN IF NOT EXISTS billing_email          TEXT,
  ADD COLUMN IF NOT EXISTS is_beta                BOOLEAN NOT NULL DEFAULT false;

-- Optional org-level GCI goal (may already exist from 00034)
DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN org_goal_gci NUMERIC;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN organizations.stripe_customer_id IS 'Stripe Customer ID for org-level billing.';
COMMENT ON COLUMN organizations.stripe_subscription_id IS 'Stripe Subscription ID for the team/brokerage plan.';
COMMENT ON COLUMN organizations.is_beta IS 'Beta orgs bypass billing — lifetime free access.';
