-- ============================================================================
-- Migration 00140 — Director Cockpit corp_brief_entries (Phase 1)
--
-- The Daily Brief surface renders structured findings from scheduled
-- routines (Hugo, Vera, Quinn, Tessa, Marcus) and manual session snapshots.
-- When a routine produces a finding worth surfacing in the cockpit it
-- inserts a row here; the /cockpit/brief page groups rows by brief_date.
--
-- Schema design notes
-- -------------------
-- `brief_date`: the calendar date the brief COVERS, not created_at.
--   Hugo's Monday scan covers the prior week but is displayed under Monday.
--
-- `source`: which routine or process produced the entry.
--   Known values at this migration:
--     'hugo-bookkeeping' | 'vera-monthly-cash' | 'quinn-quarterly-hst' |
--     'tessa-annual-t2' | 'marcus-sred' | 'main-session' | 'manual'
--
-- `des_priority`: mirrors the des_priority frontmatter in findings files.
--   Used to sort within a date group and to drive visual accents.
--
-- `content_md`: full markdown body; may be long (several KB for monthlies).
--
-- RLS: cockpit_has_access() guard for interactive reads + writes.
--   Service-role INSERT allowed (no RLS check bypassed — service role
--   bypasses RLS by default in Postgres, so no extra policy needed).
-- ============================================================================

CREATE TABLE IF NOT EXISTS corp_brief_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  brief_date    DATE        NOT NULL,
  source        TEXT        NOT NULL DEFAULT 'manual',
  title         TEXT        NOT NULL,
  content_md    TEXT        NULL,

  des_priority  TEXT        NOT NULL DEFAULT 'medium'
                            CONSTRAINT corp_brief_priority_chk
                            CHECK (des_priority IN ('low', 'medium', 'high')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE corp_brief_entries IS
  'Structured findings from scheduled routines (Hugo, Vera, Quinn, Tessa,
   Marcus) and manual session snapshots surfaced in /cockpit/brief.
   Each row covers one brief_date and one source. Routines insert via
   service role; Andrew reads via the cockpit surface.';

-- Primary query pattern: all entries for a user, newest date first
CREATE INDEX IF NOT EXISTS corp_brief_user_date_idx
  ON corp_brief_entries(user_id, brief_date DESC, created_at DESC);

-- Filter by source (e.g. "show me all Hugo findings")
CREATE INDEX IF NOT EXISTS corp_brief_user_source_idx
  ON corp_brief_entries(user_id, source);


ALTER TABLE corp_brief_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_brief: select cockpit" ON corp_brief_entries;
CREATE POLICY "corp_brief: select cockpit"
  ON corp_brief_entries FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_brief: insert cockpit" ON corp_brief_entries;
CREATE POLICY "corp_brief: insert cockpit"
  ON corp_brief_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_brief: update cockpit" ON corp_brief_entries;
CREATE POLICY "corp_brief: update cockpit"
  ON corp_brief_entries FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_brief: delete cockpit" ON corp_brief_entries;
CREATE POLICY "corp_brief: delete cockpit"
  ON corp_brief_entries FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );
