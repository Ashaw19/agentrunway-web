-- Add historical comparison data to market_data_snapshots
ALTER TABLE market_data_snapshots
  ADD COLUMN IF NOT EXISTS sales_yoy_pct NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS avg_price_yoy_pct NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS dollar_volume_yoy_pct NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS new_listings_yoy_pct NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS ytd_sales INTEGER,
  ADD COLUMN IF NOT EXISTS ytd_sales_yoy_pct NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS ytd_avg_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS ytd_avg_price_yoy_pct NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS ytd_dollar_volume NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS historical_comparisons JSONB DEFAULT '[]'::jsonb;

-- historical_comparisons stores an array like:
-- [
--   { "year": 2025, "sales_pct": -24.2, "avg_price_pct": -11.3, "dollar_volume_pct": -32.8 },
--   { "year": 2024, "sales_pct": -42.5, "avg_price_pct": -9.2, "dollar_volume_pct": -47.8 },
--   ...
-- ]

COMMENT ON COLUMN market_data_snapshots.historical_comparisons IS 'YoY % change vs same month in historical years. Extracted from CREA multi-year comparison tables.';
