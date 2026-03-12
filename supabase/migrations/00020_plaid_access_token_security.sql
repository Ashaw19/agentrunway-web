-- Migration 00020: Column-level security for Plaid access tokens
--
-- Plaid access_token values must NEVER be readable by the authenticated role.
-- They are accessed exclusively via the service_role (admin client) inside
-- server-side API routes (/api/plaid/sync, /api/plaid/disconnect).
--
-- This migration applies Postgres column-level privilege restriction as a
-- defence-in-depth measure on top of row-level security. Even if a user
-- constructs a direct PostgREST query, they will receive a 403 / insufficient
-- privilege error when attempting to SELECT the access_token column.
--
-- IMPORTANT: After applying this migration, all application queries on
-- plaid_items that use SELECT * must be updated to enumerate columns
-- explicitly (excluding access_token). Those queries have been updated in:
--   - app/(app)/settings/page.tsx
--   - app/(app)/expenses/page.tsx
-- API routes that legitimately need access_token already use createAdminClient()
-- (service_role) and are unaffected.

-- Revoke SELECT on the access_token column from the authenticated role.
-- The service_role retains full access (it bypasses column-level privileges).
REVOKE SELECT (access_token) ON plaid_items FROM authenticated;

-- Split the existing permissive "for all" RLS policy into explicit per-operation
-- policies. The SELECT policy is kept narrow (no access_token, enforced above).
-- This makes the intent of each policy explicit and reduces attack surface.

-- Drop the existing all-in-one policy
DROP POLICY IF EXISTS "Users manage own Plaid items" ON plaid_items;

-- SELECT — users can read their own item metadata (not access_token; enforced above)
CREATE POLICY "plaid_items_select"
  ON plaid_items FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT — only the authenticated user can insert their own rows
CREATE POLICY "plaid_items_insert"
  ON plaid_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE — only the authenticated user can update their own rows
-- (In practice, all updates go through the admin client; this is belt-and-suspenders)
CREATE POLICY "plaid_items_update"
  ON plaid_items FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE — only the authenticated user can delete their own rows
CREATE POLICY "plaid_items_delete"
  ON plaid_items FOR DELETE
  USING (auth.uid() = user_id);
