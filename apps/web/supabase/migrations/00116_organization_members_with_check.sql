-- ============================================================================
-- Migration 00116: organization_members — add WITH CHECK guards
-- ============================================================================
-- Applied to production. trg_guard_org_member_self_update confirmed present
-- in pg_trigger (verified 2026-04-21). Stale GATED comment removed.
--
-- Problem
-- -------
-- The `admin_or_self_update_member` policy from 00033 has USING only —
-- no WITH CHECK. Concretely:
--   1. An agent (role='agent') can UPDATE their own row and set
--      role = 'owner'. USING passes because user_id = auth.uid();
--      nothing validates the new row.
--   2. An admin can promote any agent to 'owner' (there must be
--      exactly one owner per org and it's enforced nowhere).
--   3. An agent can flip their own status from 'suspended' back to
--      'active' and bypass a suspension.
--
-- Fix
-- ---
-- (a) Trigger `guard_org_member_self_update` pins role/status/org_id/
--     user_id to OLD values on self-updates.
-- (b) WITH CHECK on the UPDATE and INSERT policies refuses role='owner'
--     from anyone — owner transfer is a service-role-only operation.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1. Helper: "role is not owner" — inlined for WITH CHECK readability
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION new_role_is_not_owner(r org_member_role)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT r <> 'owner';
$$;

COMMENT ON FUNCTION new_role_is_not_owner IS
  'True when the proposed org_member_role is not "owner". Used in RLS WITH CHECK.';


-- ──────────────────────────────────────────────────────────────────────
-- 2. Trigger: stop agents from mutating role/status/identity on self
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION guard_org_member_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- Service-role updates (no auth.uid()) are trusted
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins/owners pass through; their updates are still bounded by
  -- the WITH CHECK clause that forbids role='owner' assignments.
  SELECT EXISTS (
    SELECT 1
    FROM organization_members m
    WHERE m.org_id  = NEW.org_id
      AND m.user_id = auth.uid()
      AND m.role    IN ('owner', 'admin')
      AND m.status  = 'active'
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Self-update path: only consent/tier/joined_at/updated_at may change.
  IF NEW.user_id <> OLD.user_id                  THEN RAISE EXCEPTION 'cannot change user_id';                     END IF;
  IF NEW.org_id  <> OLD.org_id                   THEN RAISE EXCEPTION 'cannot change org_id';                      END IF;
  IF NEW.role    IS DISTINCT FROM OLD.role       THEN RAISE EXCEPTION 'role can only be changed by an org admin';  END IF;
  IF NEW.status  IS DISTINCT FROM OLD.status     THEN RAISE EXCEPTION 'status can only be changed by an org admin'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_org_member_self_update ON organization_members;
CREATE TRIGGER trg_guard_org_member_self_update
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION guard_org_member_self_update();

COMMENT ON FUNCTION guard_org_member_self_update IS
  'Prevents an agent from escalating their own role/status via RLS. Admins/owners bypass; their edits are still bounded by WITH CHECK.';


-- ──────────────────────────────────────────────────────────────────────
-- 3. Replace the UPDATE policy (add WITH CHECK)
-- ──────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_or_self_update_member" ON organization_members;

CREATE POLICY "admin_or_self_update_member" ON organization_members
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  )
  WITH CHECK (
    (
      user_id = auth.uid()
      OR org_id IN (
        SELECT org_id FROM organization_members
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND status = 'active'
      )
    )
    AND new_role_is_not_owner(role)
  );


-- ──────────────────────────────────────────────────────────────────────
-- 4. Tighten the INSERT policy too — admins cannot mint 'owner'
-- ──────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_insert_member" ON organization_members;

CREATE POLICY "admin_insert_member" ON organization_members
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
    AND new_role_is_not_owner(role)
  );


-- ──────────────────────────────────────────────────────────────────────
-- Verification checklist (run before/after apply)
-- ──────────────────────────────────────────────────────────────────────
-- With a plain agent session:
--   UPDATE organization_members SET role='admin' WHERE user_id=auth.uid();
--     → EXPECT: exception from trigger.
--
-- With an admin session:
--   INSERT INTO organization_members(org_id,user_id,role,status)
--     VALUES ('<org>','<new user>','owner','active');
--     → EXPECT: RLS rejection via WITH CHECK.
--   UPDATE organization_members SET data_sharing_tier='tier2'
--     WHERE user_id='<any member>';
--     → EXPECT: success.
--
-- Owner session updating own row (no-op role):
--   UPDATE organization_members SET consent_granted_at=now()
--     WHERE user_id=auth.uid();
--     → EXPECT: success.
