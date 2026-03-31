-- Migration 00084 — Pipeline deal accuracy tracking
--
-- Links pipeline deals to CRM clients and preserves original estimates
-- for forecasting accuracy measurement after deals close.

ALTER TABLE pipeline_deals
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_estimated_price NUMERIC(14,2) DEFAULT NULL;

-- Index for client_id lookups
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_client_id ON pipeline_deals(client_id) WHERE client_id IS NOT NULL;

-- Add pipeline_deal_id to transactions for accuracy tracking on closed deals
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS pipeline_deal_id UUID DEFAULT NULL;
