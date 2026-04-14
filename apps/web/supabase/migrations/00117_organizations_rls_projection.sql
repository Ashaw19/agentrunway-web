-- ============================================================================
-- PROPOSED Migration 00117: organizations — column projection for members
-- ============================================================================
-- GATED: review before applying. Paired with required app-side changes
-- (see "App changes required" at the bottom of this file). Do NOT apply
-- in isolation — the billing portal and Stripe webhook paths will break
-- if the column revokes land without the companion createAdminClient()
-- updates.
--
-- Problem
-- -------
-- `organizations` has the RLS policy `org_member_read`:
--
--     USING (id IN (
--       SELECT org_id FROM organization_members
--       WHERE user_id = auth.uid() AND status = 'active'
--     ))
--
-- Any active member — including plain `agent` role — can `SELECT *` and
-- see `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`,
-- and `billing_email`. Those are owner/admin billing data.
--
-- The codebase reinforces the leak: `lib/org-context.ts`, `(app)/layout.tsx`,
-- `(app)/consent/page.tsx` all query `select("*, organizations(*)")`,
-- so every dashboard page render hands Stripe IDs to every agent in the org.
--
-- Fix
-- ---
-- 1. Add two views:
--      organizations_public  — everything except Stripe/billing columns
--      organizations_billing — full row, but filtered to owner/admin only
--    Both are SECURITY INVOKER so the base-table RLS still applies.
-- 2. REVOKE column-level SELECT on Stripe/billing columns from the
--    `authenticated` role. Service role keeps full access (it bypasses
--    column grants the same way it bypasses RLS). Admin-side paths that
--    legitimately need Stripe IDs must switch to createAdminClient().
-- 3. Keep the existing `org_member_read` policy so `organizations_public`
--    continues to filter by membership.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1. Safe member-visible view
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW organizations_public
WITH (security_invoker = true)
AS
SELECT
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
FROM organizations;

COMMENT ON VIEW organizations_public IS
  'Member-safe projection of organizations. No Stripe IDs or billing email. Inherits RLS from the base table.';

GRANT SELECT ON organizations_public TO authenticated;


-- ──────────────────────────────────────────────────────────────────────
-- 2. Admin-only billing view (full row, membership-gated)
-- ──────────────────────────────────────────────────────────────────────
-- security_invoker=true means this view's row access is still governed
-- by RLS on organizations. We add the role filter here so even an admin
-- with SELECT on the underlying table cannot bypass it by forgetting.

CREATE OR REPLACE VIEW organizations_billing
WITH (security_invoker = true)
AS
SELECT o.*
FROM organizations o
WHERE o.id IN (
  SELECT org_id FROM organization_members
  WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
);

COMMENT ON VIEW organizations_billing IS
  'Full organizations row incl. Stripe fields, visible only to owner/admin of the org. Use createAdminClient() for webhooks or cron.';

GRANT SELECT ON organizations_billing TO authenticated;


-- ──────────────────────────────────────────────────────────────────────
-- 3. Revoke column-level SELECT on billing columns from authenticated
-- ──────────────────────────────────────────────────────────────────────
-- Postgres evaluates column privileges BEFORE RLS, so this closes the
-- "SELECT *" leak even for admins querying the base table directly.
-- Admin/owner reads of these columns must go through `organizations_billing`
-- or an admin-client call.

REVOKE SELECT (
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  billing_email
) ON organizations FROM authenticated;

-- All remaining columns stay readable (defensive explicit grant):
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


-- ──────────────────────────────────────────────────────────────────────
-- App changes required BEFORE applying this migration
-- ──────────────────────────────────────────────────────────────────────
-- Without these code changes, the following runtime failures occur:
--
--   A. apps/web/app/api/customer-portal/route.ts:53
--        .from("organizations").select("stripe_customer_id")
--      → returns null after REVOKE. Switch to createAdminClient() after
--        the member/role authz check that already exists above this block.
--
--   B. apps/web/app/api/team-billing/update-seats/route.ts:68
--      → already uses createAdminClient (see import). Verify it's used
--        for the organizations read.
--
--   C. apps/web/lib/org-context.ts:22        select("*, organizations(*)")
--      apps/web/app/(app)/layout.tsx:73       select("*, organizations(*)")
--      apps/web/app/(app)/consent/page.tsx:16 select("*, organizations(*)")
--      → All three paths should switch the nested select to the safe
--        column list. Example:
--          select("*, organizations(id,name,slug,type,owner_id,logo_url,
--                  anonymize_agents,max_seats,subscription_status,is_beta,
--                  org_goal_gci,created_at,updated_at)")
--        PostgREST will error on a nested "*" selection that includes
--        revoked columns.
--
--   D. apps/web/lib/require-pro.ts:46, apps/web/lib/compute-is-pro.ts:35,
--      apps/web/supabase/functions/mcp-server/pro-gate.ts:30
--      → Already scoped: select("status, organizations(subscription_status,
--        is_beta)"). Not affected by the revoke.
--
--   E. apps/web/app/api/stripe-webhook/route.ts:* (all lines)
--      → Uses service-role client, bypasses column grants. Safe.
--
-- ──────────────────────────────────────────────────────────────────────
-- Rollback (if something breaks post-apply)
-- ──────────────────────────────────────────────────────────────────────
-- GRANT SELECT (stripe_customer_id, stripe_subscription_id,
--               stripe_price_id, billing_email)
--   ON organizations TO authenticated;
-- DROP VIEW IF EXISTS organizations_public;
-- DROP VIEW IF EXISTS organizations_billing;
--
-- ──────────────────────────────────────────────────────────────────────
-- Verification checklist
-- ──────────────────────────────────────────────────────────────────────
-- As a plain agent session:
--   SELECT stripe_customer_id FROM organizations WHERE id='<org>';
--     → EXPECT: permission denied.
--   SELECT name FROM organizations WHERE id='<org>';         → ok
--   SELECT name FROM organizations_public WHERE id='<org>';  → ok
--   SELECT stripe_customer_id FROM organizations_billing;    → 0 rows (not admin)
--
-- As an admin session:
--   SELECT stripe_customer_id FROM organizations_billing;    → 1 row
--
-- With service role:
--   SELECT stripe_customer_id FROM organizations;            → ok (bypasses all)
