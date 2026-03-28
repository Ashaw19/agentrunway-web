-- ============================================================================
-- 00074 · Client Notes Log
--
-- Converts the single-text `clients.notes` field into a timestamped log.
-- Each note is an individual row with its own timestamp and delete support.
-- Existing notes are migrated as a single initial entry per client.
-- ============================================================================

-- 1. Create the notes log table
CREATE TABLE IF NOT EXISTS client_notes (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         NOT NULL REFERENCES auth.users(id),
  client_id  UUID         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content    TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_notes_client_idx
  ON client_notes (user_id, client_id, created_at DESC);

-- 2. RLS
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client notes"
  ON client_notes FOR ALL
  USING (user_id = auth.uid());

-- 3. Migrate existing notes into the log
INSERT INTO client_notes (user_id, client_id, content, created_at)
SELECT user_id, id, notes, COALESCE(updated_at, created_at, now())
FROM clients
WHERE notes IS NOT NULL AND TRIM(notes) != '';
