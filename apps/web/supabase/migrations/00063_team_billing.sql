-- ============================================================================
-- 00063 · organizations — Stripe billing indexes
-- ============================================================================
-- Columns already added in 00059_org_billing.sql.
-- This migration adds the performance indexes for webhook lookups.

CREATE INDEX IF NOT EXISTS organizations_stripe_customer_idx
  ON organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organizations_stripe_sub_idx
  ON organizations (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
