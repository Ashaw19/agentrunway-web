-- ============================================================================
-- Migration 00040 — Property Showings Ledger + AI Property Analysis
-- Tracks homes shown to buyer clients, supports AI screenshot extraction,
-- buyer pattern analysis ("Buyer DNA"), and MLS cut sheet analysis.
-- ============================================================================

-- ── Property Showings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_showings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        REFERENCES auth.users NOT NULL,
  client_id         uuid        REFERENCES clients(id) ON DELETE CASCADE NOT NULL,

  -- Property details (manual or AI-extracted)
  property_address  text        NOT NULL,
  city              text,
  province_region   text,
  postal_code       text,
  mls_number        text,
  listing_price     numeric,
  property_type     text,         -- detached | semi | townhouse | condo | other
  bedrooms          smallint,
  bathrooms         numeric,      -- e.g. 2.5
  square_feet       integer,
  lot_size          text,         -- "50 x 120 ft" or "0.25 acres"
  year_built        smallint,

  -- Showing details
  showing_date      date          NOT NULL DEFAULT CURRENT_DATE,
  client_rating     smallint      CHECK (client_rating BETWEEN 1 AND 5),
  notes             text,
  realtor_ca_url    text,         -- bookmark link to realtor.ca listing

  -- AI-extracted data from screenshot/cutsheet upload
  screenshot_url    text,         -- Supabase storage path
  extracted_data    jsonb         NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_showings_client_idx
  ON property_showings (user_id, client_id, showing_date DESC);

ALTER TABLE property_showings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "property_showings_owner" ON property_showings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Property Analyses (MLS cut sheets + AI market assessment) ───────────────
CREATE TABLE IF NOT EXISTS property_analyses (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        REFERENCES auth.users NOT NULL,
  client_id         uuid        REFERENCES clients(id) ON DELETE CASCADE,
  showing_id        uuid        REFERENCES property_showings(id) ON DELETE SET NULL,

  -- Source
  source_type       text        NOT NULL CHECK (source_type IN ('mls_cutsheet', 'screenshot', 'manual')),
  source_url        text,       -- Supabase storage path if uploaded

  -- Extracted property data (from vision AI)
  property_data     jsonb       NOT NULL DEFAULT '{}',

  -- AI analysis result
  ai_analysis       jsonb       NOT NULL DEFAULT '{}',
  -- Expected shape:
  -- {
  --   pricing_assessment:  string,   -- Current market value estimate + reasoning
  --   offer_strategy:      string,   -- Recommended offer range + tactics
  --   leverage_tips:       string[], -- Non-price advantages to strengthen an offer
  --   market_comparison:   string,   -- How this property compares to recent sales
  --   risk_factors:        string[], -- Red flags or concerns
  --   summary:             string    -- 2-3 sentence executive summary
  -- }

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_analyses_user_idx
  ON property_analyses (user_id, created_at DESC);

ALTER TABLE property_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "property_analyses_owner" ON property_analyses FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE property_showings IS
  'Homes shown to buyer clients — supports AI screenshot extraction and buyer pattern analysis';
COMMENT ON TABLE property_analyses IS
  'MLS cut sheet uploads and AI-generated market/offer analysis';
