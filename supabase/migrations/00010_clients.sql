-- ── clients: master identity record per unique client ────────────────────────
-- Thin identity table only — no CRM fields (no notes, activity log, reminders).
-- All analytics are derived from client_records (and future: transactions) via JOIN.
-- Enforces one canonical record per client per agent via UNIQUE(user_id, name_search).

CREATE TABLE IF NOT EXISTS clients (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  name           text        NOT NULL,
  name_search    text        NOT NULL,  -- lower(trim(name)) — for dedup matching

  -- Optional contact info for identification only (not for CRM communication)
  email          text,
  phone          text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, name_search)
);

-- Row-level security — agents can only see their own clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own clients"
  ON clients FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on every change
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_clients_user_id
  ON clients (user_id);

CREATE INDEX IF NOT EXISTS idx_clients_user_id_name_search
  ON clients (user_id, name_search);

-- ── client_records: add FK to clients ────────────────────────────────────────
-- Links each imported deal record to a canonical client identity.
-- NULL = unlinked (pre-migration records or deals with no matching name).

ALTER TABLE client_records
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_records_client_id
  ON client_records (client_id);
