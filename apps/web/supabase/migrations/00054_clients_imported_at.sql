-- Track when a client was created via CSV import.
-- When set, the Intelligence Briefing engine skips contact-recency alerts
-- (uncontacted_lead, in_flight_stale, vip_overdue, past_client_check_in)
-- for that client until at least one activity has been logged against them.
-- This prevents a flood of false alerts immediately after a bulk CSV upload.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN clients.imported_at IS
  'Set to the timestamp of the CSV import batch that created this row. NULL for clients added manually. Used by the briefing engine to suppress stale-contact alerts until the first activity is logged.';
