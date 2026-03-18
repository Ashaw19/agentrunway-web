-- ── AI Touchpoint Safeguards ─────────────────────────────────────────────────
-- Adds property_use to client_records so AI post-close prompts can frame
-- messaging appropriately (investment vs primary residence vs commercial).
--
-- Hard stops (deceased, do_not_contact) are already handled by:
--   - clients.archived_at IS NULL filter in detect-opportunities
--   - clients.archive_reason ('deceased' | 'do_not_contact') values
-- No new boolean flags are needed — archive is the gate.

ALTER TABLE client_records
  ADD COLUMN IF NOT EXISTS property_use text
    CHECK (property_use IN ('primary_residence', 'investment', 'commercial', 'pre_construction'));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
