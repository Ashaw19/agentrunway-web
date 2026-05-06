-- ============================================================================
-- Migration 00134 — Director Cockpit RLS hardening (email allowlist)
--
-- The cockpit is intentionally internal-only (Andrew-as-Director surface),
-- but migration 00132 wrote RLS policies that only check
-- `user_id = auth.uid()`. That keeps cross-user reads/writes blocked, but it
-- still lets ANY authenticated Agent Runway customer write into their own
-- user_id partition of the corp_* tables — the cockpit UI gate at
-- apps/web/app/cockpit/layout.tsx is the only thing keeping non-Andrew
-- customers from polluting their own slice via direct supabase-js calls.
--
-- This migration tightens the corp_* RLS to match the application-layer
-- allowlist: every read and write must additionally verify that the
-- caller's JWT email is in the allowlist (currently
-- 'andrew@andrewdshaw.ca'). When access widens to a bookkeeper later,
-- update both the email allowlist here AND the layout/route allowlist
-- in the SAME migration — the two surfaces must stay in lockstep.
--
-- corp_chart_of_accounts is also restricted: prior migration left SELECT
-- open to every authenticated user, which would let any logged-in customer
-- enumerate AR Inc.'s internal account code list. Lock to allowlist too.
-- ============================================================================


-- ── Helper: cockpit_has_access() ────────────────────────────────────────────
--
-- A SECURITY INVOKER function so the policy planner inlines and indexes well.
-- Returns true iff the JWT's `email` claim is in the cockpit allowlist. The
-- allowlist is maintained inline (not as a table) to make scope changes
-- audit-trivial — every change shows up as a one-line migration diff.

CREATE OR REPLACE FUNCTION cockpit_has_access()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_catalog
AS $$
  SELECT lower(coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email'),
    ''
  )) IN (
    'andrew@andrewdshaw.ca'
  )
$$;

COMMENT ON FUNCTION cockpit_has_access() IS
  'Returns true iff the caller''s JWT email is in the Director Cockpit
   allowlist. Used by RLS on corp_chart_of_accounts, corp_vendors,
   corp_vendor_allocations, corp_transactions. Mirror this allowlist
   in apps/web/app/cockpit/layout.tsx and any /api/receipts/save-corporate
   surface — they must stay in lockstep.';


-- ── 1. corp_chart_of_accounts ───────────────────────────────────────────────

DROP POLICY IF EXISTS "corp_coa: select authenticated" ON corp_chart_of_accounts;
DROP POLICY IF EXISTS "corp_coa: select cockpit"       ON corp_chart_of_accounts;

CREATE POLICY "corp_coa: select cockpit"
  ON corp_chart_of_accounts FOR SELECT
  TO authenticated
  USING (cockpit_has_access());


-- ── 2. corp_vendors ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "corp_vendors: select own" ON corp_vendors;
DROP POLICY IF EXISTS "corp_vendors: insert own" ON corp_vendors;
DROP POLICY IF EXISTS "corp_vendors: update own" ON corp_vendors;
DROP POLICY IF EXISTS "corp_vendors: delete own" ON corp_vendors;

CREATE POLICY "corp_vendors: select cockpit"
  ON corp_vendors FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_vendors: insert cockpit"
  ON corp_vendors FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_vendors: update cockpit"
  ON corp_vendors FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_vendors: delete cockpit"
  ON corp_vendors FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );


-- ── 3. corp_vendor_allocations ──────────────────────────────────────────────

DROP POLICY IF EXISTS "corp_alloc: select own" ON corp_vendor_allocations;
DROP POLICY IF EXISTS "corp_alloc: insert own" ON corp_vendor_allocations;
DROP POLICY IF EXISTS "corp_alloc: update own" ON corp_vendor_allocations;
DROP POLICY IF EXISTS "corp_alloc: delete own" ON corp_vendor_allocations;

CREATE POLICY "corp_alloc: select cockpit"
  ON corp_vendor_allocations FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_alloc: insert cockpit"
  ON corp_vendor_allocations FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_alloc: update cockpit"
  ON corp_vendor_allocations FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_alloc: delete cockpit"
  ON corp_vendor_allocations FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );


-- ── 4. corp_transactions ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "corp_txn: select own" ON corp_transactions;
DROP POLICY IF EXISTS "corp_txn: insert own" ON corp_transactions;
DROP POLICY IF EXISTS "corp_txn: update own" ON corp_transactions;
DROP POLICY IF EXISTS "corp_txn: delete own" ON corp_transactions;

CREATE POLICY "corp_txn: select cockpit"
  ON corp_transactions FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_txn: insert cockpit"
  ON corp_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_txn: update cockpit"
  ON corp_transactions FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

CREATE POLICY "corp_txn: delete cockpit"
  ON corp_transactions FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );
