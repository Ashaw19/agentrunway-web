-- ============================================================================
-- Migration 00121 — Import Provenance + Edit Protection
--
-- Fixes two data-loss bugs in the history import apply step:
--
--   Bug A (multi-file same year): Uploading a second CSV/report for a year
--   that already has imported rows was wiping the first upload, because the
--   apply step ran DELETE …WHERE year = X BEFORE the INSERT.
--
--   Bug B (manual edits wiped): Any row the user manually edited post-import
--   was still tagged `source = 'imported'`, so a re-import for that year
--   would delete and re-insert the row, blowing away the manual edit.
--
-- The fix: stop deleting. Give every imported row a stable natural-key
-- fingerprint (`import_external_id`) and UPSERT on it. Track manual edits
-- with `edited_at` so reimports skip rows the user has touched.
--
-- The `import_external_id` is a canonical string built client-side from the
-- normalized deal fields (year | date | address | party_a | party_b | gci).
-- Same document re-uploaded → same IDs → upsert overwrites in place.
-- Second document with different deals → different IDs → merges alongside.
-- ============================================================================

-- ── client_records ──────────────────────────────────────────────────────────

ALTER TABLE client_records
  ADD COLUMN IF NOT EXISTS import_external_id TEXT,
  ADD COLUMN IF NOT EXISTS edited_at          TIMESTAMPTZ;

COMMENT ON COLUMN client_records.import_external_id IS
  'Stable natural-key fingerprint for imported rows. Built client-side from
   year|date|address|party_a|party_b|gci so the same deal extracted from the
   same document produces the same ID on re-import. Used for UPSERT on re-import.
   NULL for rows created manually via the CRM.';

COMMENT ON COLUMN client_records.edited_at IS
  'Timestamp of the most recent MANUAL edit by the user (via CRM row update).
   NULL means the row has never been hand-edited since import. Reimports skip
   any row with edited_at IS NOT NULL to preserve manual corrections.';

-- Partial unique index: enforce one row per (user_id, import_external_id) when
-- the external ID is set. NULLs allowed for manual CRM entries.
CREATE UNIQUE INDEX IF NOT EXISTS client_records_user_ext_id_uniq
  ON client_records (user_id, import_external_id)
  WHERE import_external_id IS NOT NULL;


-- ── transactions ────────────────────────────────────────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS import_external_id TEXT,
  ADD COLUMN IF NOT EXISTS edited_at          TIMESTAMPTZ;

COMMENT ON COLUMN transactions.import_external_id IS
  'Stable natural-key fingerprint for imported transactions. Same semantics as
   client_records.import_external_id. NULL for manual entries.';

COMMENT ON COLUMN transactions.edited_at IS
  'Timestamp of the most recent manual edit. NULL = untouched since import.
   Reimports skip rows with edited_at IS NOT NULL to protect manual corrections.';

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_ext_id_uniq
  ON transactions (user_id, import_external_id)
  WHERE import_external_id IS NOT NULL;


-- ── Reload PostgREST schema cache so the new columns are immediately visible ─
NOTIFY pgrst, 'reload schema';
