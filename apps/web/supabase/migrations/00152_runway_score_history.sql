-- ============================================================================
-- Migration 00152 — runway_score_history
--
-- The dashboard hero shows the composite Runway Score (0–100) and the Cash
-- Runway hero number (months). PR #195 made those surfaces FEEL alive, but
-- the score/cash trajectory sparklines + direction-of-change carets were
-- deferred because the only persisted history was a SINGLE point:
-- `user_settings.runway_score_snapshot` stores `{score, grade, stateLabel,
-- month, updated_at, components}` — one snapshot, no series. Faking a
-- trajectory off one point would be dishonest. This table is the honest
-- time-series backing for those surfaces.
--
-- ADDITIVE — does NOT replace `runway_score_snapshot`.
-- -------------------------------------------------------------------------
-- `user_settings.runway_score_snapshot` is the single-point, mobile-parity
-- field that mobile reads directly (spec_runway_score_canonical_bands.md
-- §3.2 — parity-by-construction; do NOT touch it here). This table is a
-- SEPARATE concern: a daily time-series of the same composite score, its
-- components, and the cash-runway months at capture time. Do not confuse the
-- two. The snapshot answers "what is the score right now?"; this table
-- answers "how has it moved over the last N days?".
--
-- Schema design notes
-- -------------------
-- `captured_on` (DATE): the calendar day a row represents. The dashboard
--   writes at most one row per user per day (UNIQUE on (user_id,
--   captured_on)), via an upsert with onConflict 'user_id,captured_on'.
--   Re-renders within the same day overwrite the day's row rather than
--   stacking duplicate points.
--
-- `score` (INTEGER 0–100): the composite Runway Score at capture time.
--   CHECK keeps it in range — the engine clamps to 0–100, this guards
--   against a malformed write.
--
-- `components` (JSONB): mirrors the shape written to
--   `user_settings.runway_score_snapshot.components` exactly — an array of
--   `{label, score, weight}` where `weight` is the numeric weightValue
--   (0.0–1.0). Stored per row so trajectory carets get per-component priors
--   (the prior day's component sub-score), not just a composite prior.
--
-- `cash_runway_months` (NUMERIC, NULLABLE): see the column COMMENT below —
--   this is a deliberate, minimal extension beyond the score time-series.
--   It is the ONLY honest source for the Cash Runway "vs-last-period" delta.
--
-- RLS: per-user, user-scoped (NOT cockpit-gated). Every realtor owns their
--   own history rows. No delete policy — rows are retained, consistent with
--   other history tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS runway_score_history (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- One row per user per calendar day (see UNIQUE constraint below).
  captured_on        DATE        NOT NULL,

  -- Composite Runway Score 0–100 at capture time.
  score              INTEGER     NOT NULL
                                 CONSTRAINT runway_score_history_score_range_chk
                                 CHECK (score >= 0 AND score <= 100),

  -- Array of {label, score, weight}; weight is the numeric weightValue 0.0–1.0.
  -- Mirrors user_settings.runway_score_snapshot.components exactly.
  components         JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Cash Runway hero number in MONTHS at capture time; NULL when costs are
  -- not configured.
  cash_runway_months NUMERIC     NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per user per day; supports the client upsert with
  -- onConflict 'user_id,captured_on'.
  CONSTRAINT runway_score_history_user_day_uniq UNIQUE (user_id, captured_on)
);

COMMENT ON TABLE runway_score_history IS
  'Daily history of the composite Runway Score (0–100) + its weighted
   components + cash-runway months, written at most once per day by the
   dashboard (upsert onConflict user_id,captured_on). This is the time-series
   backing the score/cash-runway trajectory sparklines + direction-of-change
   carets. ADDITIVE to user_settings.runway_score_snapshot — do NOT confuse
   the two: the snapshot is the single-point mobile-parity field (one current
   point); this is the series over time.';

COMMENT ON COLUMN runway_score_history.cash_runway_months IS
  'Cash Runway hero number in months at capture time; NULL when costs not
   configured. This column is a deliberate, minimal extension beyond the
   score time-series: it is the ONLY honest source for the Cash Runway
   "vs-last-period" delta, since the components array stores the 0–100
   Survival SUB-score, not months.';

-- Primary read: the "last 12 rows" trajectory query for one user.
CREATE INDEX IF NOT EXISTS runway_score_history_user_captured_idx
  ON runway_score_history (user_id, captured_on DESC);


ALTER TABLE runway_score_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "runway_score_history: select own" ON runway_score_history;
CREATE POLICY "runway_score_history: select own"
  ON runway_score_history FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "runway_score_history: insert own" ON runway_score_history;
CREATE POLICY "runway_score_history: insert own"
  ON runway_score_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "runway_score_history: update own" ON runway_score_history;
CREATE POLICY "runway_score_history: update own"
  ON runway_score_history FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- NO delete policy — history rows are retained (consistent with other
-- history tables; deletes only cascade when the auth.users row is removed).
