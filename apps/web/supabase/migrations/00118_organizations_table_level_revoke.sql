-- ============================================================================
-- Migration 00118: organizations — enforce column projection via table-level revoke
-- ============================================================================
-- 00117 attempted `REVOKE SELECT (col) ON organizations FROM authenticated`
-- but that is a no-op when SELECT was granted at the table level (the
-- Supabase default via `GRANT ALL ON TABLE … TO authenticated`). The
-- column-level REVOKE can only strip column-level grants.
--
-- Fix: revoke SELECT on the full table, then re-grant only the safe columns.
-- UPDATE/INSERT/DELETE are left untouched — those paths are already governed
-- by RLS policies on the base table, and stripping them would break
-- legitimate admin writes that go through the user-session client.
--
-- Verification after apply:
--   SELECT column_name, privilege_type
--   FROM information_schema.column_privileges
--   WHERE table_name = 'organizations'
--     AND grantee = 'authenticated'
--     AND privilege_type = 'SELECT';
--   → Stripe/billing columns must NOT appear in the result.
-- ============================================================================

REVOKE SELECT ON organizations FROM authenticated;

GRANT SELECT (
  id,
  name,
  slug,
  type,
  owner_id,
  logo_url,
  anonymize_agents,
  max_seats,
  subscription_status,
  is_beta,
  org_goal_gci,
  created_at,
  updated_at
) ON organizations TO authenticated;
