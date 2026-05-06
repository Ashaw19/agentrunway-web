-- ============================================================================
-- Migration 00135 — Director Cockpit corp_cash_snapshots (Phase 1)
--
-- AR Inc. has no bank-feed connection (Plaid Growth deferred per
-- memory/project_plaid_status.md, QuickBooks integration skipped per
-- memory/findings/decision_skip_quickbooks_2026-05-05.md). Until a bank
-- feed lands, cash position on the Director Cockpit Snapshot is
-- maintained by Andrew posting manual snapshots.
--
-- One row = one observation. Latest row by `as_of_date` is the current
-- displayed cash position. Rows are append-only in the UI but UPDATE/DELETE
-- are permitted via RLS for correction (mistyped balance, etc.).
--
-- The Snapshot card flags this surface as "manual" per Eleanor Konik's rule
-- — never show a number without flagging its provenance.
--
-- RLS: same pattern as migration 00134 — every read and write requires
-- cockpit_has_access() (JWT email in the allowlist). When access widens to
-- a bookkeeper, update the allowlist in 00134 and the layout/route
-- allowlists in apps/web/app/cockpit/layout.tsx in the SAME migration.
-- ============================================================================


CREATE TABLE IF NOT EXISTS corp_cash_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of_date      DATE NOT NULL,
  amount_cad      NUMERIC NOT NULL,
  source_label    TEXT NULL,
  notes           TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corp_cash_snapshots_amount_chk
    CHECK (amount_cad >= 0)
);

COMMENT ON TABLE corp_cash_snapshots IS
  'Manual cash-position snapshots for AR Inc. Latest by as_of_date is the
   displayed value on the Director Cockpit Snapshot. No bank-feed integration
   in Phase 1 — Andrew posts each snapshot by hand.';

CREATE INDEX IF NOT EXISTS corp_cash_snapshots_user_date_idx
  ON corp_cash_snapshots(user_id, as_of_date DESC);


ALTER TABLE corp_cash_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_cash: select cockpit" ON corp_cash_snapshots;
CREATE POLICY "corp_cash: select cockpit"
  ON corp_cash_snapshots FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_cash: insert cockpit" ON corp_cash_snapshots;
CREATE POLICY "corp_cash: insert cockpit"
  ON corp_cash_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_cash: update cockpit" ON corp_cash_snapshots;
CREATE POLICY "corp_cash: update cockpit"
  ON corp_cash_snapshots FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_cash: delete cockpit" ON corp_cash_snapshots;
CREATE POLICY "corp_cash: delete cockpit"
  ON corp_cash_snapshots FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );
