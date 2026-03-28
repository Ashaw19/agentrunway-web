-- Monthly CREA market data snapshots.
-- Stores historical board-level stats so we can detect trends
-- and wire market conditions into opportunity detection.

CREATE TABLE IF NOT EXISTS market_data_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_slug    TEXT NOT NULL,
  board_name    TEXT NOT NULL,
  report_month  TEXT NOT NULL,            -- e.g. "March 2026"
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Board-level monthly stats
  total_sales          INTEGER,
  total_new_listings   INTEGER,
  total_dollar_volume  NUMERIC(18,2),
  average_price        NUMERIC(14,2),

  -- Market condition
  sales_to_new_listings_ratio NUMERIC(5,4),
  market_condition     TEXT,              -- "seller" | "balanced" | "buyer"

  -- Quarterly stats (when available)
  quarterly_unit_sales       INTEGER,
  quarterly_unit_sales_yoy   NUMERIC(8,2),
  median_sale_price          NUMERIC(14,2),
  median_sale_price_yoy      NUMERIC(8,2),

  -- Sub-region breakdown (JSONB array)
  sub_regions JSONB DEFAULT '[]'::jsonb,

  -- Full raw payload for future use
  raw_payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One snapshot per board per month
  UNIQUE (board_slug, report_month)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_market_snapshots_board_date
  ON market_data_snapshots (board_slug, snapshot_date DESC);

-- RLS: public read (market data is not user-specific)
ALTER TABLE market_data_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Market snapshots are publicly readable"
  ON market_data_snapshots FOR SELECT
  USING (true);

-- Only service role can insert (cron job)
CREATE POLICY "Only service role can insert market snapshots"
  ON market_data_snapshots FOR INSERT
  WITH CHECK (false);
