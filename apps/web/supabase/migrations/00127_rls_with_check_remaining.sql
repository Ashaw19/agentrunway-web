-- 00127 · Add WITH CHECK to remaining RLS policies missing it
--
-- Daily QA audit (2026-04-30) found 4 surviving cross-tenant write vectors —
-- the same shape that 00123_rls_with_check_fixes.sql was created to address.
--
-- Without WITH CHECK on a write-side policy, a user who can read a row can
-- update fields like user_id / org_id / flight_plan_id, escaping their tenant.
-- For FOR ALL policies, the missing WITH CHECK also lets a user INSERT rows
-- with foreign-key values that don't belong to them.
--
-- Pattern matches 00123: split FOR ALL into per-operation policies with
-- explicit WITH CHECK on every write path, leaving SELECT/DELETE narrow.

-- ── 1. storage.objects · profile_media_update ────────────────────────────────
-- Original: FOR UPDATE with USING only. A user can upload to their own folder
-- then UPDATE the row to rename `name` into another user's folder, escaping
-- isolation. WITH CHECK enforces the post-write state.

DROP POLICY IF EXISTS "profile_media_update" ON storage.objects;

CREATE POLICY "profile_media_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 2. flight_plan_steps · split FOR ALL into per-operation ─────────────────
-- Original "Users manage own flight plan steps" used FOR ALL with USING
-- referencing a JOIN through flight_plans. INSERT silently bypassed the JOIN
-- because USING only fires on existing rows — a user could insert a step with
-- any flight_plan_id, regardless of who owns the parent plan.

DROP POLICY IF EXISTS "Users manage own flight plan steps" ON flight_plan_steps;

CREATE POLICY flight_plan_steps_select ON flight_plan_steps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flight_plans fp
      WHERE fp.id = flight_plan_steps.flight_plan_id
        AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY flight_plan_steps_insert ON flight_plan_steps
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flight_plans fp
      WHERE fp.id = flight_plan_steps.flight_plan_id
        AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY flight_plan_steps_update ON flight_plan_steps
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM flight_plans fp
      WHERE fp.id = flight_plan_steps.flight_plan_id
        AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flight_plans fp
      WHERE fp.id = flight_plan_steps.flight_plan_id
        AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY flight_plan_steps_delete ON flight_plan_steps
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM flight_plans fp
      WHERE fp.id = flight_plan_steps.flight_plan_id
        AND fp.user_id = auth.uid()
    )
  );

-- ── 3. recruitment_pages · split FOR ALL into per-operation ─────────────────
-- Original "Org admins manage recruitment pages" used FOR ALL with USING
-- only. An admin of org A could INSERT a recruitment page row with
-- org_id = orgB. WITH CHECK on INSERT/UPDATE forces the post-write org_id
-- to belong to an org the actor admins.

DROP POLICY IF EXISTS "Org admins manage recruitment pages" ON recruitment_pages;

CREATE POLICY recruitment_pages_select ON recruitment_pages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = recruitment_pages.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin', 'team_leader')
    )
  );

CREATE POLICY recruitment_pages_insert ON recruitment_pages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = recruitment_pages.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin', 'team_leader')
    )
  );

CREATE POLICY recruitment_pages_update ON recruitment_pages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = recruitment_pages.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin', 'team_leader')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = recruitment_pages.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin', 'team_leader')
    )
  );

CREATE POLICY recruitment_pages_delete ON recruitment_pages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = recruitment_pages.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin', 'team_leader')
    )
  );

-- ── 4. client_notes · split FOR ALL into per-operation ──────────────────────
-- Original "Users manage own client notes" used FOR ALL with
-- USING (user_id = auth.uid()) only. INSERT could set user_id to anyone, and
-- UPDATE could flip user_id to dump the note into another user's account
-- after passing the pre-update USING check.

DROP POLICY IF EXISTS "Users manage own client notes" ON client_notes;

CREATE POLICY client_notes_select ON client_notes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY client_notes_insert ON client_notes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY client_notes_update ON client_notes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY client_notes_delete ON client_notes
  FOR DELETE USING (user_id = auth.uid());
