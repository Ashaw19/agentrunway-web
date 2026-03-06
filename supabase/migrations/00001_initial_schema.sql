-- ============================================================================
-- Agent Runway — Initial Database Schema
-- Mirrors the iOS SwiftUI data model for the SaaS web platform
-- ============================================================================
-- Supabase Auth provides auth.users — every table references auth.uid()
-- All tables enforce Row Level Security (RLS)
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE transaction_side   AS ENUM ('buyer', 'seller', 'both');
CREATE TYPE transaction_status AS ENUM ('closed', 'pending', 'fallen');
CREATE TYPE pipeline_stage     AS ENUM ('lead', 'showing', 'offer', 'conditional', 'firm');
CREATE TYPE milestone_type     AS ENUM (
  'gciThreshold', 'dealCount', 'firstDealOfMonth', 'firstDealOfQuarter',
  'bestMonth', 'bestQuarter', 'paceAhead', 'streakWeek'
);
CREATE TYPE split_preset AS ENUM (
  'p70_30', 'p75_25', 'p80_20', 'p85_15', 'p90_10', 'p95_5', 'p100_0'
);
CREATE TYPE province AS ENUM (
  'alberta', 'britishColumbia', 'manitoba', 'newBrunswick', 'newfoundland',
  'northwestTerritories', 'novaScotia', 'nunavut', 'ontario',
  'princeEdwardIsland', 'quebec', 'saskatchewan', 'yukon'
);
CREATE TYPE market_geography_type AS ENUM ('national', 'province', 'board', 'city');
CREATE TYPE market_metric_focus   AS ENUM ('sales', 'price', 'combined');
CREATE TYPE market_data_readiness AS ENUM ('manualOnly', 'stubData', 'liveFeed');


-- ============================================================================
-- 1. USER SETTINGS
-- One row per user. Mirrors all @Published scalar properties from
-- AgentRunwayStore that are NOT array/collection data.
-- ============================================================================

CREATE TABLE user_settings (
  user_id                       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- YTD manual-entry overrides (text in iOS, stored as numeric here)
  ytd_gci                       NUMERIC(14,2)    NOT NULL DEFAULT 0,
  ytd_transactions              INTEGER          NOT NULL DEFAULT 0,
  ytd_volume                    NUMERIC(14,2)    NOT NULL DEFAULT 0,
  monthly_brokerage_fee         NUMERIC(10,2)    NOT NULL DEFAULT 0,

  -- Commission split
  split_preset                  split_preset     NOT NULL DEFAULT 'p80_20',

  -- Transaction fees
  tx_fee_rate_pct               NUMERIC(5,4)     NOT NULL DEFAULT 0,       -- e.g. 0.0100 = 1%
  tx_fee_annual_cap             NUMERIC(10,2)    NOT NULL DEFAULT 0,

  -- Commission cap (v5)
  post_cap_threshold_gci        NUMERIC(14,2)    NOT NULL DEFAULT 0,
  post_cap_agent_pct            NUMERIC(5,4)     NOT NULL DEFAULT 0,       -- 0.0–1.0
  post_cap_brokerage_pct        NUMERIC(5,4)     NOT NULL DEFAULT 0,

  -- Goals — current year
  goal_gci                      NUMERIC(14,2)    NOT NULL DEFAULT 0,
  goal_transactions             INTEGER          NOT NULL DEFAULT 0,
  goal_volume                   NUMERIC(14,2)    NOT NULL DEFAULT 0,

  -- Growth goals — 5-year plan (% per year)
  growth_goal_year_pcts         JSONB            NOT NULL DEFAULT '[0,0,0,0,0]',

  -- Province & tax
  province                      province         NOT NULL DEFAULT 'newBrunswick',

  -- Seasonality
  use_national_seasonality      BOOLEAN          NOT NULL DEFAULT FALSE,
  national_quarter_pcts         JSONB            NOT NULL DEFAULT '[25,25,25,25]',
  national_seasonality_updated  TEXT             NOT NULL DEFAULT '',

  -- Market context (v7)
  market_yoy_growth_pct         NUMERIC(6,3)     NOT NULL DEFAULT 0,
  market_mom_growth_pct         NUMERIC(6,3)     NOT NULL DEFAULT 0,
  market_sales_change_pct       NUMERIC(6,3)     NOT NULL DEFAULT 0,
  market_new_listings_change_pct NUMERIC(6,3)    NOT NULL DEFAULT 0,
  market_index_source_note      TEXT             NOT NULL DEFAULT '',
  apply_market_adjustment       BOOLEAN          NOT NULL DEFAULT FALSE,
  market_report_month           TEXT             NOT NULL DEFAULT '',
  market_data_is_manual         BOOLEAN          NOT NULL DEFAULT TRUE,
  market_last_updated           TEXT             NOT NULL DEFAULT '',

  -- Market architecture (v8)
  market_board_name             TEXT             NOT NULL DEFAULT '',
  market_metric_focus           market_metric_focus NOT NULL DEFAULT 'combined',

  -- Claiming (v9)
  home_office_business_use_pct  NUMERIC(5,4)     NOT NULL DEFAULT 0,       -- 0.0–1.0
  vehicle_business_use_pct      NUMERIC(5,4)     NOT NULL DEFAULT 0,

  -- Defensibility (v10)
  cash_reserve                  NUMERIC(14,2)    NOT NULL DEFAULT 0,
  experience_years              INTEGER,

  -- Timestamps
  created_at                    TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ      NOT NULL DEFAULT now()
);


-- ============================================================================
-- 2. TRANSACTIONS
-- Maps to iOS Transaction struct. GCI is computed client-side:
--   gci = gci_override ?? (sale_price * commission_pct)
-- ============================================================================

CREATE TABLE transactions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  date              DATE        NOT NULL,                       -- close / expected close
  address           TEXT        NOT NULL DEFAULT '',
  sale_price        NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_pct    NUMERIC(7,6)  NOT NULL DEFAULT 0.025000,    -- e.g. 0.025000 = 2.5%
  gci_override      NUMERIC(14,2),                              -- NULL = use sale_price * commission_pct
  side              transaction_side   NOT NULL DEFAULT 'buyer',
  status            transaction_status NOT NULL DEFAULT 'closed',
  client_name       TEXT        NOT NULL DEFAULT '',
  notes             TEXT        NOT NULL DEFAULT '',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 3. PIPELINE DEALS
-- Maps to iOS PipelineDeal struct. Computed client-side:
--   probability = probability_override ?? stage.defaultProbability
--   estimatedGCI = estimated_price * estimated_commission_pct
--   weightedGCI  = estimatedGCI * probability
-- ============================================================================

CREATE TABLE pipeline_deals (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  address                   TEXT        NOT NULL DEFAULT '',
  estimated_price           NUMERIC(14,2) NOT NULL DEFAULT 0,
  estimated_commission_pct  NUMERIC(7,6)  NOT NULL DEFAULT 0.025000,
  side                      transaction_side NOT NULL DEFAULT 'buyer',
  stage                     pipeline_stage   NOT NULL DEFAULT 'lead',
  expected_close_date       DATE,
  client_name               TEXT        NOT NULL DEFAULT '',
  notes                     TEXT        NOT NULL DEFAULT '',
  probability_override      NUMERIC(5,4),                        -- NULL = use stage default

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 4. HISTORY ITEMS
-- Year-by-year historical performance. Quarter data stored as JSONB arrays
-- of 4 elements matching iOS [String] arrays (parsed to numbers client-side).
-- ============================================================================

CREATE TABLE history_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  year        INTEGER     NOT NULL,
  annual_gci  NUMERIC(14,2) NOT NULL DEFAULT 0,
  annual_tx   INTEGER       NOT NULL DEFAULT 0,
  quarter_gci JSONB         NOT NULL DEFAULT '[0,0,0,0]',       -- [Q1, Q2, Q3, Q4]
  quarter_tx  JSONB         NOT NULL DEFAULT '[0,0,0,0]',
  is_locked   BOOLEAN       NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, year)
);


-- ============================================================================
-- 5. EXPENSE CATEGORIES & ITEMS
-- Two-level structure: categories contain items.
-- iOS defaults: 8 categories, ~20 items total.
-- ============================================================================

CREATE TABLE expense_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  key         TEXT        NOT NULL,                              -- stable identifier (e.g. 'vehicle')
  title       TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, key)
);

CREATE TABLE expense_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id     UUID        NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,

  key             TEXT        NOT NULL,                          -- stable identifier (e.g. 'fuel')
  title           TEXT        NOT NULL,
  ytd_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_recurring NUMERIC(10,2) NOT NULL DEFAULT 0,

  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, key)
);


-- ============================================================================
-- 6. MILESTONES
-- Achievement events triggered by the system. Acknowledged = user dismissed.
-- ============================================================================

CREATE TABLE milestones (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  type          milestone_type NOT NULL,
  title         TEXT           NOT NULL,
  message       TEXT           NOT NULL DEFAULT '',
  triggered_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  acknowledged  BOOLEAN        NOT NULL DEFAULT FALSE,

  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);


-- ============================================================================
-- 7. AGENT PROFILES (Team Management)
-- Team leader feature: manage agents under a brokerage.
-- The user_id is the team leader, not the agent themselves.
-- ============================================================================

CREATE TABLE agent_profiles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name            TEXT        NOT NULL DEFAULT '',
  role            TEXT        NOT NULL DEFAULT 'Agent',
  agent_split_pct NUMERIC(5,4) NOT NULL DEFAULT 0.8000,         -- 0.0–1.0 (agent keeps)
  monthly_desk_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  target_gci      NUMERIC(14,2) NOT NULL DEFAULT 0,
  color_index     INTEGER      NOT NULL DEFAULT 0,
  notes           TEXT        NOT NULL DEFAULT '',
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 8. TEAM DEALS
-- Individual deals tied to an agent profile. GCI stored directly (not calc'd).
-- ============================================================================

CREATE TABLE team_deals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_profile_id  UUID        NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,

  date              DATE        NOT NULL,
  address           TEXT        NOT NULL DEFAULT '',
  gci               NUMERIC(14,2) NOT NULL DEFAULT 0,
  side              transaction_side NOT NULL DEFAULT 'buyer',
  client_name       TEXT        NOT NULL DEFAULT '',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 9. MARKET DATA POINTS
-- MarketStatPoint from iOS. Stores raw market stats per period & geography.
-- ============================================================================

CREATE TABLE market_data_points (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Period
  period_label        TEXT        NOT NULL,                      -- ISO: '2026-02'
  period_start        DATE,
  period_end          DATE,

  -- Geography (embedded struct in iOS)
  geo_type            market_geography_type NOT NULL DEFAULT 'province',
  geo_name            TEXT        NOT NULL DEFAULT '',
  geo_province_code   TEXT        NOT NULL DEFAULT '',           -- ISO 3166-2 (e.g. 'NB')
  geo_board_code      TEXT,                                     -- e.g. 'SJREB'

  -- Core metrics
  sales               INTEGER,
  new_listings         INTEGER,
  active_listings      INTEGER,
  benchmark_price      NUMERIC(14,2),
  avg_price            NUMERIC(14,2),
  months_of_inventory  NUMERIC(6,2),
  dom_median           NUMERIC(6,1),                            -- days on market

  -- Period-over-period changes
  yoy_sales_pct        NUMERIC(8,4),
  yoy_price_pct        NUMERIC(8,4),
  mom_sales_pct        NUMERIC(8,4),
  mom_price_pct        NUMERIC(8,4),

  -- Provenance
  source_name          TEXT        NOT NULL DEFAULT '',
  source_url           TEXT,
  retrieved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_market_data_unique_period
  ON market_data_points (user_id, period_label, geo_province_code, COALESCE(geo_board_code, ''));


-- ============================================================================
-- ROW LEVEL SECURITY — every table
-- Policy: users can only access their own rows via auth.uid()
-- ============================================================================

-- Helper: enable RLS on all tables
ALTER TABLE user_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_deals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_deals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_points ENABLE ROW LEVEL SECURITY;

-- user_settings
CREATE POLICY "Users manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- transactions
CREATE POLICY "Users manage own transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- pipeline_deals
CREATE POLICY "Users manage own pipeline"
  ON pipeline_deals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- history_items
CREATE POLICY "Users manage own history"
  ON history_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- expense_categories
CREATE POLICY "Users manage own expense categories"
  ON expense_categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- expense_items
CREATE POLICY "Users manage own expense items"
  ON expense_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- milestones
CREATE POLICY "Users manage own milestones"
  ON milestones FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- agent_profiles
CREATE POLICY "Users manage own agent profiles"
  ON agent_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- team_deals
CREATE POLICY "Users manage own team deals"
  ON team_deals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- market_data_points
CREATE POLICY "Users manage own market data"
  ON market_data_points FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- INDEXES
-- Optimise common query patterns: filter by user + date/status/year
-- ============================================================================

-- transactions
CREATE INDEX idx_transactions_user_date   ON transactions (user_id, date DESC);
CREATE INDEX idx_transactions_user_status ON transactions (user_id, status);

-- pipeline_deals
CREATE INDEX idx_pipeline_user_stage      ON pipeline_deals (user_id, stage);
CREATE INDEX idx_pipeline_user_close_date ON pipeline_deals (user_id, expected_close_date);

-- history_items
CREATE INDEX idx_history_user_year        ON history_items (user_id, year);

-- expense_items
CREATE INDEX idx_expense_items_category   ON expense_items (category_id);

-- milestones
CREATE INDEX idx_milestones_user_ack      ON milestones (user_id, acknowledged);

-- agent_profiles
CREATE INDEX idx_agent_profiles_user      ON agent_profiles (user_id, is_active);

-- team_deals
CREATE INDEX idx_team_deals_agent         ON team_deals (agent_profile_id, date DESC);
CREATE INDEX idx_team_deals_user          ON team_deals (user_id, date DESC);

-- market_data_points
CREATE INDEX idx_market_data_user_period  ON market_data_points (user_id, period_label DESC);


-- ============================================================================
-- UPDATED_AT TRIGGER
-- Auto-update the updated_at column on any row modification
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_settings_updated    BEFORE UPDATE ON user_settings      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transactions_updated     BEFORE UPDATE ON transactions       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pipeline_deals_updated   BEFORE UPDATE ON pipeline_deals     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_history_items_updated    BEFORE UPDATE ON history_items      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_expense_categories_updated BEFORE UPDATE ON expense_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_expense_items_updated    BEFORE UPDATE ON expense_items      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agent_profiles_updated   BEFORE UPDATE ON agent_profiles     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_team_deals_updated       BEFORE UPDATE ON team_deals         FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- DEFAULT EXPENSE CATEGORIES FUNCTION
-- Called during onboarding to seed a new user's expense structure.
-- Mirrors the 8 default categories from the iOS app.
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_default_expenses(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_cat_id UUID;
BEGIN
  -- 1. Vehicle
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'vehicle', 'Vehicle', 0) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'vehicle_payment',   'Payment',   0),
    (p_user_id, v_cat_id, 'vehicle_insurance',  'Insurance', 1),
    (p_user_id, v_cat_id, 'vehicle_fuel',       'Fuel',      2),
    (p_user_id, v_cat_id, 'vehicle_service',    'Service',   3);

  -- 2. Marketing
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'marketing', 'Marketing', 1) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'marketing_ads',          'Ads',           0),
    (p_user_id, v_cat_id, 'marketing_photography',  'Photography',   1),
    (p_user_id, v_cat_id, 'marketing_print',         'Print',         2),
    (p_user_id, v_cat_id, 'marketing_gifts',         'Gifts',         3);

  -- 3. Office & Tech
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'office_tech', 'Office & Tech', 2) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'office_supplies',   'Supplies',   0),
    (p_user_id, v_cat_id, 'office_software',   'Software',   1),
    (p_user_id, v_cat_id, 'office_phone',      'Phone',      2),
    (p_user_id, v_cat_id, 'office_hardware',   'Hardware',   3);

  -- 4. Professional Fees
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'professional', 'Professional Fees', 3) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'prof_board_mls',    'Board / MLS',   0),
    (p_user_id, v_cat_id, 'prof_licensing',     'Licensing',     1),
    (p_user_id, v_cat_id, 'prof_eo',            'E&O Insurance', 2),
    (p_user_id, v_cat_id, 'prof_accounting',    'Accounting',    3);

  -- 5. Education
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'education', 'Education', 4) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'edu_courses',       'Courses',      0),
    (p_user_id, v_cat_id, 'edu_conferences',   'Conferences',  1),
    (p_user_id, v_cat_id, 'edu_books',         'Books',        2);

  -- 6. Meals
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'meals', 'Meals', 5) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'meals_client',   'Client Meals', 0),
    (p_user_id, v_cat_id, 'meals_team',     'Team Meals',   1);

  -- 7. Entertainment
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'entertainment', 'Entertainment', 6) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'ent_client',   'Client Events', 0),
    (p_user_id, v_cat_id, 'ent_events',   'Events',        1);

  -- 8. Other
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'other', 'Other', 7) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'other_misc',   'Miscellaneous', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- NEW USER INITIALISATION TRIGGER
-- Automatically creates a user_settings row when a new auth user signs up.
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id) VALUES (NEW.id);
  PERFORM seed_default_expenses(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
