-- ============================================================================
-- Migration 00122: pipeline_deals — DEFAULT 0 on estimated_commission_pct
--                  and estimated_price
-- ============================================================================
-- Problem
-- -------
-- Both columns are nullable in the DB schema. A NULL value multiplied in
-- computeEstimatedGCI produces NaN, which propagates to every pipeline GCI
-- card on the dashboard. The TypeScript null guard (field ?? 0) was added
-- as a code-level fix; this migration adds the DB-level default to prevent
-- the issue at the source for all future inserts.
--
-- Applied to production 2026-04-21 via Supabase MCP apply_migration.

UPDATE pipeline_deals SET estimated_commission_pct = 0 WHERE estimated_commission_pct IS NULL;
UPDATE pipeline_deals SET estimated_price = 0 WHERE estimated_price IS NULL;

ALTER TABLE pipeline_deals ALTER COLUMN estimated_commission_pct SET DEFAULT 0;
ALTER TABLE pipeline_deals ALTER COLUMN estimated_price SET DEFAULT 0;
