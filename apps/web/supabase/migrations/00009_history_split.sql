-- ── history_items: brokerage split column ────────────────────────────────────
-- Stores the agent's share of each commission as a decimal.
-- e.g. 0.70 = 70/30 split (agent keeps 70%)
--      0.75 = 75/25 split (agent keeps 75%)
-- Used to reconcile GCI (pre-split) with take-home (net), and to calibrate
-- historical projections when the split has changed over the years.

ALTER TABLE history_items ADD COLUMN IF NOT EXISTS split_pct numeric(5,4);
