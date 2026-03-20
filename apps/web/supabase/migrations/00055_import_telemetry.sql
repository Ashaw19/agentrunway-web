-- ============================================================================
-- Import Telemetry
-- Append-only table capturing behavioral signals from each completed import.
-- Used to understand real-world import usage, extraction quality in production,
-- and which fields users most often correct before saving.
--
-- Privacy principles:
--   • No raw financial values stored (no GCI amounts, sale prices, etc.)
--   • No names, addresses, or document content
--   • edited_field_names / edited_field_counts contain schema field names only
--   • issue_count_total is a count — validation message text is never stored
--   • Users have INSERT-only access; no client-side SELECT
-- ============================================================================

CREATE TABLE import_telemetry (
  id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Import context ----------------------------------------------------------
  import_source                  TEXT,        -- 'text' | 'vision'
  document_subtype               TEXT,        -- 'tracker' | 'brokerage' | 'generic'
  extraction_quality             TEXT,        -- 'good' | 'partial' | 'needs_review'
  deal_count                     INTEGER,
  is_replace                     BOOLEAN      NOT NULL DEFAULT false,  -- true = overwrote an existing year

  -- Truncation --------------------------------------------------------------
  truncation_occurred            BOOLEAN      NOT NULL DEFAULT false,
  rows_kept                      INTEGER,     -- null when no truncation
  rows_total                     INTEGER,     -- null when no truncation

  -- Review behavior ---------------------------------------------------------
  time_on_review_ms              INTEGER,     -- ms from preview render to save click; null if unmeasured
  total_fields_edited            INTEGER      NOT NULL DEFAULT 0,
  edited_field_names             TEXT[],      -- e.g. ['gci', 'date'] — field names only, no values
  edited_field_counts            JSONB,       -- e.g. {"gci": 3, "date": 1}

  -- Safeguard signals -------------------------------------------------------
  brokerage_confirmation_shown   BOOLEAN      NOT NULL DEFAULT false,
  brokerage_confirmation_checked BOOLEAN      NOT NULL DEFAULT false,

  -- Quality signals (counts only — no financial content) -------------------
  issue_count_total              INTEGER,
  low_confidence_gci_count       INTEGER
);

-- RLS: users can insert their own rows; no client-side read
-- (reads happen via Supabase dashboard / service role for analysis)
ALTER TABLE import_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own telemetry"
  ON import_telemetry FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for user-level queries (e.g. per-user aggregates)
CREATE INDEX import_telemetry_user_id_idx     ON import_telemetry (user_id);
CREATE INDEX import_telemetry_created_at_idx  ON import_telemetry (created_at DESC);

COMMENT ON TABLE import_telemetry IS
  'Append-only behavioral telemetry for import saves. No financial values, names, or document content stored.';
