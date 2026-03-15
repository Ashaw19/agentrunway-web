-- Migration 00021: Stripe webhook idempotency log
--
-- Stripe guarantees at-least-once webhook delivery, meaning the same event
-- can arrive more than once. Without deduplication, a duplicate
-- checkout.session.completed would grant Professional twice, and a duplicate
-- customer.subscription.deleted would double-send the win-back email.
--
-- This table records every processed Stripe event ID. Before processing any
-- event, the webhook handler inserts the ID here. A unique-constraint violation
-- (SQLSTATE 23505) means the event was already processed — skip it safely.
--
-- Retention: rows older than 90 days are pruned automatically via a Supabase
-- scheduled job (or can be deleted manually — Stripe never replays events
-- older than a few days).
--
-- Access: only the service_role client writes to this table. No RLS policies
-- are needed because the authenticated role is never used here.

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id     TEXT        PRIMARY KEY,          -- e.g. "evt_1AbcDef..."
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient pruning of old events
CREATE INDEX IF NOT EXISTS stripe_events_processed_at_idx
  ON stripe_events (processed_at);

-- No RLS needed — this table is only ever written by the service_role key
-- inside the webhook API route. The authenticated role has no reason to
-- touch it directly.
