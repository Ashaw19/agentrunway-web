-- Add buyer_target_area column for storing the buyer's preferred search location
-- This is distinct from the client's home city (which is in the 'city' column)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS buyer_target_area text;

COMMENT ON COLUMN clients.buyer_target_area IS 'Buyer target search area (city/neighbourhood) — distinct from client home address city';
