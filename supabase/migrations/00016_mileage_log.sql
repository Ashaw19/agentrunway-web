-- Migration 00016: Mileage log
-- Tracks individual business-purpose drives for CRA mileage deduction claims.
-- CRA 2025 rate: $0.72/km first 5,000 km; $0.66/km thereafter.
-- Reference: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/benefits-allowances/automobile/automobile-motor-vehicle-allowances/reasonable-kilometre-rates.html

CREATE TABLE IF NOT EXISTS mileage_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  trip_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT         NOT NULL DEFAULT '',  -- e.g. "Client showing — 123 Main St"
  from_location   TEXT,                              -- starting point (optional)
  to_location     TEXT,                              -- destination (optional)
  km              NUMERIC(8,1) NOT NULL DEFAULT 0,   -- kilometres driven

  -- CRA rate at time of entry (lets us recalculate if rates change)
  cra_rate_per_km NUMERIC(6,4) NOT NULL DEFAULT 0.72,

  -- Computed deduction (km × rate) — stored for quick queries; recalculated on update
  deduction       NUMERIC(10,2) GENERATED ALWAYS AS (km * cra_rate_per_km) STORED,

  purpose         TEXT,                              -- e.g. "Client meeting", "Open house", "Board office"
  notes           TEXT,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at fresh
CREATE TRIGGER mileage_logs_updated_at
  BEFORE UPDATE ON mileage_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE mileage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mileage logs"
  ON mileage_logs
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast user+date queries
CREATE INDEX IF NOT EXISTS mileage_logs_user_date_idx ON mileage_logs (user_id, trip_date DESC);
