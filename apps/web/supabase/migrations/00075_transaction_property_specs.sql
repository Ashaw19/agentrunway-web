-- ============================================================================
-- 00075 · Transaction Property Specs, Listing URL & Condition Date
--
-- Adds property specification fields, MLS/listing URL, and conditional
-- due date tracking to client_records (transactions).
-- ============================================================================

-- Property specifications
ALTER TABLE client_records
  ADD COLUMN IF NOT EXISTS bedrooms      SMALLINT,
  ADD COLUMN IF NOT EXISTS bathrooms     NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS garage        BOOLEAN,
  ADD COLUMN IF NOT EXISTS lot_acres     NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS waterfront    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS square_feet   INTEGER;

-- MLS / listing URL
ALTER TABLE client_records
  ADD COLUMN IF NOT EXISTS listing_url   TEXT;

-- Condition tracking
ALTER TABLE client_records
  ADD COLUMN IF NOT EXISTS condition_date  DATE,
  ADD COLUMN IF NOT EXISTS condition_status TEXT DEFAULT 'pending'
    CHECK (condition_status IN ('pending', 'waived', 'firmed', 'collapsed'));
