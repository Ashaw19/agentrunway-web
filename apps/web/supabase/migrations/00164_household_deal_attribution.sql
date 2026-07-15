-- Migration 00164 — Household deal attribution
--
-- WHY: PR #254 fixed the dominant bug (a joint-name deal creating a phantom
-- third contact) but left two gaps: a co-party's own card shows nothing for
-- a deal they were part of, and primary attribution is decided by word
-- order in the report string, so the same couple could fragment into two
-- people if a later report names them in reversed order. Design:
-- docs/superpowers/specs/2026-07-15-household-deal-attribution-design.md
--
-- client_record_co_parties: per-deal fact — "this specific deal also named
-- this person" — independent of who currently holds primary attribution.
-- co_client_id is a FK to clients(id), so fn_merge_clients's existing
-- dynamic FK discovery (information_schema, from #252) picks it up
-- automatically on a client merge; no changes needed there.
--
-- client_relationships.primary_client_id: nullable override, meaningful
-- only for spouse/partner rows. NULL = no override, use the deterministic
-- alphabetical default computed at import time.

CREATE TABLE IF NOT EXISTS client_record_co_parties (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_record_id  uuid        NOT NULL REFERENCES client_records(id) ON DELETE CASCADE,
  co_client_id      uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_record_id, co_client_id)
);

ALTER TABLE client_record_co_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client record co-parties"
  ON client_record_co_parties FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_client_record_co_parties_co_client
  ON client_record_co_parties (co_client_id);
CREATE INDEX IF NOT EXISTS idx_client_record_co_parties_record
  ON client_record_co_parties (client_record_id);

ALTER TABLE client_relationships
  ADD COLUMN IF NOT EXISTS primary_client_id uuid
    REFERENCES clients(id) ON DELETE SET NULL
    CONSTRAINT client_relationships_primary_is_a_or_b
    CHECK (primary_client_id IS NULL OR primary_client_id IN (client_id_a, client_id_b));

-- Backfill: an existing spouse/partner link gets a primary only when
-- EXACTLY ONE side already holds deal history. Neither/both sides holding
-- records is ambiguous — leave NULL (falls back to the deterministic
-- per-deal alphabetical logic, no guessing).
UPDATE client_relationships cr
SET primary_client_id = sub.holder_id
FROM (
  SELECT
    r.id AS rel_id,
    CASE
      WHEN EXISTS (SELECT 1 FROM client_records WHERE client_id = r.client_id_a)
       AND NOT EXISTS (SELECT 1 FROM client_records WHERE client_id = r.client_id_b)
        THEN r.client_id_a
      WHEN EXISTS (SELECT 1 FROM client_records WHERE client_id = r.client_id_b)
       AND NOT EXISTS (SELECT 1 FROM client_records WHERE client_id = r.client_id_a)
        THEN r.client_id_b
      ELSE NULL
    END AS holder_id
  FROM client_relationships r
  WHERE r.relationship_type IN ('spouse', 'partner')
) sub
WHERE cr.id = sub.rel_id AND sub.holder_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
