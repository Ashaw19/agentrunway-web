-- Migration 00027: Client profile expansion — CRM fields & relationships
-- Adds aviation-themed flight status, extended contact info, property interest,
-- timeframe, preferred contact method, and a client_relationships join table.
-- Also stubs flight_plans + flight_plan_steps for future automated sequences.

-- ── 1. New columns on clients ──────────────────────────────────────────────────

-- Flight Status (aviation-themed pipeline stages)
-- Values: boarding | taxiing | in_flight | landed | cruising
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'boarding';

-- Location (simplified — city + province only)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province_region TEXT;

-- Phone type label for primary phone
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS phone_type TEXT NOT NULL DEFAULT 'mobile';

-- Secondary contact channels
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS secondary_email TEXT,
  ADD COLUMN IF NOT EXISTS secondary_phone TEXT,
  ADD COLUMN IF NOT EXISTS secondary_phone_type TEXT NOT NULL DEFAULT 'home';

-- Property interest: buyer budget or listing price expectation
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS property_interest NUMERIC,
  ADD COLUMN IF NOT EXISTS property_interest_type TEXT NOT NULL DEFAULT 'budget';

-- When they're looking to transact
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS timeframe TEXT;

-- How they prefer to be reached
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT NOT NULL DEFAULT 'phone';

-- ── 2. Performance index for status filtering ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clients_user_status
  ON clients (user_id, status);

-- ── 3. client_relationships table ──────────────────────────────────────────────
-- Bidirectional relationship links between clients (spouse, partner, etc.)

CREATE TABLE IF NOT EXISTS client_relationships (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id_a       UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_id_b       UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  relationship_type TEXT        NOT NULL DEFAULT 'spouse',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent self-relationships and enforce ordered IDs to avoid A-B / B-A dupes
  CONSTRAINT client_relationships_no_self CHECK (client_id_a <> client_id_b),
  CONSTRAINT client_relationships_ordered CHECK (client_id_a < client_id_b),
  UNIQUE (user_id, client_id_a, client_id_b)
);

ALTER TABLE client_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client relationships"
  ON client_relationships FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_client_relationships_a
  ON client_relationships (user_id, client_id_a);

CREATE INDEX IF NOT EXISTS idx_client_relationships_b
  ON client_relationships (user_id, client_id_b);

-- ── 4. Flight Plans stub (future automated contact sequences) ──────────────────

CREATE TABLE IF NOT EXISTS flight_plans (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  description    TEXT,
  trigger_status TEXT,       -- which client status triggers this plan
  is_active      BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE flight_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own flight plans"
  ON flight_plans FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS flight_plan_steps (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_plan_id  UUID        NOT NULL REFERENCES flight_plans(id) ON DELETE CASCADE,
  step_order      INTEGER     NOT NULL DEFAULT 0,
  delay_days      INTEGER     NOT NULL DEFAULT 0,
  action_type     TEXT        NOT NULL DEFAULT 'task',
  template        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE flight_plan_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own flight plan steps"
  ON flight_plan_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM flight_plans fp
      WHERE fp.id = flight_plan_steps.flight_plan_id
      AND fp.user_id = auth.uid()
    )
  );

-- Add updated_at trigger to flight_plans
CREATE TRIGGER flight_plans_updated_at
  BEFORE UPDATE ON flight_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
