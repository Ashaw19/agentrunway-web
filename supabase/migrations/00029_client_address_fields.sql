-- Migration 00029: Client address fields
-- Adds full address storage to clients: street, unit, postal code, country.
-- City and province_region already exist from migration 00027.

-- ── 1. New columns on clients ──────────────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS unit_number    TEXT,
  ADD COLUMN IF NOT EXISTS postal_code    TEXT,
  ADD COLUMN IF NOT EXISTS country        TEXT NOT NULL DEFAULT 'Canada';

-- ── 2. Index for postal code lookups ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clients_postal
  ON clients (user_id, postal_code)
  WHERE postal_code IS NOT NULL;
