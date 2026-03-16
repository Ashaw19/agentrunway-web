-- ============================================================================
-- Migration 00037 — Client archive support (Hangar)
-- Adds archived_at + archive_reason to clients table so deceased, moved-away,
-- or do-not-contact clients can be hidden without losing their transaction history.
-- ============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT        DEFAULT NULL
    CONSTRAINT clients_archive_reason_check
    CHECK (archive_reason IN ('deceased', 'moved_away', 'do_not_contact', 'other'));

COMMENT ON COLUMN clients.archived_at    IS 'Set when client is moved to the Hangar; NULL means active';
COMMENT ON COLUMN clients.archive_reason IS 'Reason for archiving: deceased | moved_away | do_not_contact | other';
