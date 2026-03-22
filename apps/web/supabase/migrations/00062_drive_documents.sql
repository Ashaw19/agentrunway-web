-- ============================================================================
-- 00062 · drive_documents — Google Drive document index for Groq analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS drive_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Google Drive linkage
  google_file_id  text        NOT NULL,
  name            text        NOT NULL,
  mime_type       text        NOT NULL,
  size_bytes      bigint,
  last_modified   timestamptz,
  web_view_link   text,

  -- Groq analysis results
  indexed_at      timestamptz,                   -- when Groq last analyzed this file
  summary         text,                          -- Groq-generated summary
  extracted_data  jsonb,                         -- structured data Groq extracted
  tags            text[]      NOT NULL DEFAULT '{}',  -- auto-generated tags

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One index entry per file per user
CREATE UNIQUE INDEX idx_drive_documents_user_file
  ON drive_documents (user_id, google_file_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE drive_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drive documents"
  ON drive_documents FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_drive_documents_user       ON drive_documents (user_id);
CREATE INDEX idx_drive_documents_tags       ON drive_documents USING gin (tags);
CREATE INDEX idx_drive_documents_indexed    ON drive_documents (user_id, indexed_at DESC);

-- ── Auto-update updated_at ──────────────────────────────────────────────────

CREATE TRIGGER trg_drive_documents_updated
  BEFORE UPDATE ON drive_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
