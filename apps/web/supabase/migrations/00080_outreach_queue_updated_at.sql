-- ============================================================================
-- Migration 00080: Add updated_at to outreach_queue for optimistic locking
--
-- Enables conflict detection when two browser tabs or a stale session
-- tries to overwrite edits made by a more recent save.
-- ============================================================================

ALTER TABLE outreach_queue
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Auto-set updated_at on every UPDATE via trigger
CREATE OR REPLACE FUNCTION set_outreach_queue_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_outreach_queue_updated_at
  BEFORE UPDATE ON outreach_queue
  FOR EACH ROW
  EXECUTE FUNCTION set_outreach_queue_updated_at();
