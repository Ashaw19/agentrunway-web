-- ── client_records ──────────────────────────────────────────────────────────
-- Stores individual deal-level client data extracted during history imports.
-- One row per deal (a client who bought twice in different years = 2 rows).
-- Populated automatically when a brokerage report or career tracker is imported.

CREATE TABLE IF NOT EXISTS client_records (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  side        text        CHECK (side IN ('buyer', 'seller', 'both')),
  source      text,                          -- SOI, Agent Referral, Realtor.ca, etc.
  address     text,
  close_date  date,
  year        integer,
  gci         numeric(10, 2) DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Row-level security
ALTER TABLE client_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own client_records"
  ON client_records FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS client_records_user_id_idx  ON client_records (user_id);
CREATE INDEX IF NOT EXISTS client_records_user_year_idx ON client_records (user_id, year);
CREATE INDEX IF NOT EXISTS client_records_name_idx      ON client_records (user_id, lower(name));

-- Auto-update updated_at
CREATE TRIGGER update_client_records_updated_at
  BEFORE UPDATE ON client_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
