-- ============================================================================
-- Migration 00139 — Director Cockpit corp_inbox_items (Phase 1)
--
-- The Task Inbox is the two-way channel between the cockpit's automated
-- surfaces (Hugo routine, allocation-UI, pre-incorp UI, Director persona)
-- and Andrew.  When any automated process needs Andrew's input — a missing
-- allocation ratio, an unreviewed pre-incorp expense, a T2 deadline
-- confirmation — it posts an inbox item.  Andrew reviews, resolves, and
-- leaves a note.  Resolved items are retained for audit; they never delete.
--
-- Schema design notes
-- -------------------
-- `source`: which surface created the item.  Enumerated in the app type
--   but stored as TEXT so new sources can be added without a migration.
--   Known values at this migration: 'manual' | 'hugo' | 'allocation-ui' |
--   'pre-incorp-ui' | 'founder-comp' | 'director-persona' | 'marcus'.
--
-- `source_ref_id`: optional reference to the originating entity.  E.g. the
--   corp_transactions UUID that triggered a pre-incorp review request, or
--   the corp_vendor_allocations UUID a ratio-edit prompt is about.
--
-- `severity`: 'low' | 'medium' | 'high'.  Used to sort the Snapshot card
--   and inbox page.  Cheap to add at migration time; painful to retrofit.
--
-- `resolved_at` / `resolved_note`: Andrew's response.  NULL = open.
--
-- RLS: same cockpit_has_access() guard as every other corp_* table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS corp_inbox_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title          TEXT        NOT NULL,
  body           TEXT        NULL,

  source         TEXT        NOT NULL DEFAULT 'manual',
  source_ref_id  TEXT        NULL,

  severity       TEXT        NOT NULL DEFAULT 'medium'
                             CONSTRAINT corp_inbox_severity_chk
                             CHECK (severity IN ('low', 'medium', 'high')),

  resolved_at    TIMESTAMPTZ NULL,
  resolved_note  TEXT        NULL,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE corp_inbox_items IS
  'Two-way actionable channel between cockpit automated surfaces and Andrew.
   Automated processes (Hugo, allocation-UI, pre-incorp UI, Director persona)
   post items here; Andrew resolves them. Rows are retained after resolution
   for audit — never hard-deleted from the UI.';

-- Fast lookup: unresolved items by date (the common Snapshot-card query)
CREATE INDEX IF NOT EXISTS corp_inbox_user_unresolved_idx
  ON corp_inbox_items(user_id, created_at DESC)
  WHERE resolved_at IS NULL;

-- Lookup by source for batch-resolve (e.g. resolve all hugo items)
CREATE INDEX IF NOT EXISTS corp_inbox_user_source_idx
  ON corp_inbox_items(user_id, source);


ALTER TABLE corp_inbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_inbox: select cockpit" ON corp_inbox_items;
CREATE POLICY "corp_inbox: select cockpit"
  ON corp_inbox_items FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_inbox: insert cockpit" ON corp_inbox_items;
CREATE POLICY "corp_inbox: insert cockpit"
  ON corp_inbox_items FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_inbox: update cockpit" ON corp_inbox_items;
CREATE POLICY "corp_inbox: update cockpit"
  ON corp_inbox_items FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_inbox: delete cockpit" ON corp_inbox_items;
CREATE POLICY "corp_inbox: delete cockpit"
  ON corp_inbox_items FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );
