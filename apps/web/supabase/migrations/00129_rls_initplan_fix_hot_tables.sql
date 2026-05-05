-- 00129 · RLS initplan fix — hot tables (Phase 1 of IOPs remediation)
--
-- Supabase performance advisor flagged 86 instances of `auth_rls_initplan`:
-- RLS policies that call `auth.uid()` directly per-row instead of caching
-- via `(SELECT auth.uid())` once-per-query. With heavy reads (transactions,
-- pipeline_deals, clients, organization_members), this multiplies auth.users
-- lookups by row count — the structural cause of the chronic IOPs exhaustion
-- that produced 5xx errors on /rest/v1/testimonials and /auth/v1/user since
-- 2026-04-28.
--
-- This migration fixes the 11 policies on the 6 hottest tables. The pattern
-- is mechanically identical to the rewrite documented at
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- — `auth.uid()` becomes `(SELECT auth.uid())`, semantics preserved.
--
-- Phase 1b (00131): rewrite policies on medium-traffic tables.
-- Phase 2 (separate session): rewrite the remaining ~55 flagged policies on
-- lower-traffic tables.

-- ── 1. clients · Users can manage their own clients (ALL) ────────────────
DROP POLICY IF EXISTS "Users can manage their own clients" ON public.clients;
CREATE POLICY "Users can manage their own clients"
  ON public.clients FOR ALL
  TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── 2. pipeline_deals · Users manage own pipeline (ALL) ──────────────────
DROP POLICY IF EXISTS "Users manage own pipeline" ON public.pipeline_deals;
CREATE POLICY "Users manage own pipeline"
  ON public.pipeline_deals FOR ALL
  TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── 3. transactions · Users manage own transactions (ALL) ────────────────
DROP POLICY IF EXISTS "Users manage own transactions" ON public.transactions;
CREATE POLICY "Users manage own transactions"
  ON public.transactions FOR ALL
  TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── 4. user_settings · Users manage own settings (ALL) ───────────────────
DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings"
  ON public.user_settings FOR ALL
  TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── 5. organizations · org_owner_delete (DELETE) ─────────────────────────
DROP POLICY IF EXISTS "org_owner_delete" ON public.organizations;
CREATE POLICY "org_owner_delete"
  ON public.organizations FOR DELETE
  TO public
  USING (owner_id = (SELECT auth.uid()));

-- ── 6. organizations · org_owner_insert (INSERT) ─────────────────────────
DROP POLICY IF EXISTS "org_owner_insert" ON public.organizations;
CREATE POLICY "org_owner_insert"
  ON public.organizations FOR INSERT
  TO public
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- ── 7. organizations · org_member_read (SELECT) ──────────────────────────
DROP POLICY IF EXISTS "org_member_read" ON public.organizations;
CREATE POLICY "org_member_read"
  ON public.organizations FOR SELECT
  TO public
  USING (
    id IN (
      SELECT organization_members.org_id
      FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
        AND organization_members.status = 'active'::org_member_status
    )
  );

-- ── 8. organizations · org_admin_update (UPDATE) ─────────────────────────
DROP POLICY IF EXISTS "org_admin_update" ON public.organizations;
CREATE POLICY "org_admin_update"
  ON public.organizations FOR UPDATE
  TO public
  USING (
    id IN (
      SELECT organization_members.org_id
      FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
        AND organization_members.role = ANY (ARRAY['owner'::org_member_role, 'admin'::org_member_role])
        AND organization_members.status = 'active'::org_member_status
    )
  );

-- ── 9. organization_members · member_list_read (SELECT) ──────────────────
DROP POLICY IF EXISTS "member_list_read" ON public.organization_members;
CREATE POLICY "member_list_read"
  ON public.organization_members FOR SELECT
  TO public
  USING (
    org_id IN (
      SELECT organization_members_1.org_id
      FROM organization_members organization_members_1
      WHERE organization_members_1.user_id = (SELECT auth.uid())
        AND organization_members_1.status = ANY (ARRAY['active'::org_member_status, 'pending'::org_member_status])
    )
  );

-- ── 10. organization_members · admin_delete_member (DELETE) ──────────────
DROP POLICY IF EXISTS "admin_delete_member" ON public.organization_members;
CREATE POLICY "admin_delete_member"
  ON public.organization_members FOR DELETE
  TO public
  USING (
    org_id IN (
      SELECT organization_members_1.org_id
      FROM organization_members organization_members_1
      WHERE organization_members_1.user_id = (SELECT auth.uid())
        AND organization_members_1.role = ANY (ARRAY['owner'::org_member_role, 'admin'::org_member_role])
        AND organization_members_1.status = 'active'::org_member_status
    )
  );

-- ── 11. organization_members · admin_insert_member (INSERT) ──────────────
DROP POLICY IF EXISTS "admin_insert_member" ON public.organization_members;
CREATE POLICY "admin_insert_member"
  ON public.organization_members FOR INSERT
  TO public
  WITH CHECK (
    org_id IN (
      SELECT organization_members_1.org_id
      FROM organization_members organization_members_1
      WHERE organization_members_1.user_id = (SELECT auth.uid())
        AND organization_members_1.role = ANY (ARRAY['owner'::org_member_role, 'admin'::org_member_role])
        AND organization_members_1.status = 'active'::org_member_status
    )
    AND new_role_is_not_owner(role)
  );

-- ── 12. organization_members · admin_or_self_update_member (UPDATE) ──────
DROP POLICY IF EXISTS "admin_or_self_update_member" ON public.organization_members;
CREATE POLICY "admin_or_self_update_member"
  ON public.organization_members FOR UPDATE
  TO public
  USING (
    user_id = (SELECT auth.uid())
    OR org_id IN (
      SELECT organization_members_1.org_id
      FROM organization_members organization_members_1
      WHERE organization_members_1.user_id = (SELECT auth.uid())
        AND organization_members_1.role = ANY (ARRAY['owner'::org_member_role, 'admin'::org_member_role])
        AND organization_members_1.status = 'active'::org_member_status
    )
  )
  WITH CHECK (
    (
      user_id = (SELECT auth.uid())
      OR org_id IN (
        SELECT organization_members_1.org_id
        FROM organization_members organization_members_1
        WHERE organization_members_1.user_id = (SELECT auth.uid())
          AND organization_members_1.role = ANY (ARRAY['owner'::org_member_role, 'admin'::org_member_role])
          AND organization_members_1.status = 'active'::org_member_status
      )
    )
    AND new_role_is_not_owner(role)
  );
