-- Migration 00057: RLS security hardening for service-role-only tables
--
-- These tables are only ever written by the Supabase service_role key inside
-- API route handlers. Enabling RLS with no permissive policies blocks all
-- authenticated-role access (e.g. via direct PostgREST requests), while the
-- service_role retains full access because it bypasses RLS by default.
--
-- Tables covered:
--   rate_limits  — prevent users from deleting their row to reset their quota
--   stripe_events — prevent users from pre-inserting event IDs to poison
--                   Stripe idempotency deduplication

-- ── rate_limits ───────────────────────────────────────────────────────────────
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No permissive policies → authenticated role is denied all access.
-- service_role continues to bypass RLS per Supabase default.

-- ── stripe_events ─────────────────────────────────────────────────────────────
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
-- No permissive policies → authenticated role is denied all access.
-- service_role continues to bypass RLS per Supabase default.
