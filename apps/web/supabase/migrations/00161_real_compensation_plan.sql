-- 00161: REAL Brokerage compensation plan (scope A — agent's own deal economics)
--
-- Adds a compensation-plan selector to user_settings plus the REAL-specific
-- fields. Default 'simple_split' preserves existing behavior for every
-- current user; 'real' activates the per-deal waterfall in
-- packages/core/engines/real-compensation-engine.ts.
--
-- Design notes:
--   * REAL's company-dollar rate pre-cap is a fixed 15% of GCI (engine
--     constant, not a column) — the CAP counts REAL's take, not GCI crossed.
--   * Cap tier defaults: solo_full $15,000 / team_member $7,500 /
--     mega_team $5,000 (cap_amount editable — figures from the REAL income
--     deck snapshot; users can adjust when REAL revises).
--   * real_pre_cap_agent_pct default 0.85 = solo (1 − 0.15 REAL − 0 team
--     override). Team members typically 0.70 (leader override 0.15) — the
--     settings UI suggests per-tier values; DB default is the solo case.
--   * real_post_cap_agent_pct default 1.0 = solo keeps 100% post-cap (REAL
--     switches to flat per-deal fees); team members typically 0.80 (leader
--     override continues post-cap).
--   * *_seed columns let mid-year switchers (deals paid at REAL before
--     using Agent Runway) start cap/Elite progress from reality instead
--     of zero.
--   * No new table → RLS unchanged (user_settings policies already scope
--     by user_id and cover new columns automatically).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS comp_plan TEXT NOT NULL DEFAULT 'simple_split'
    CHECK (comp_plan IN ('simple_split', 'real')),
  ADD COLUMN IF NOT EXISTS real_join_date DATE,
  ADD COLUMN IF NOT EXISTS real_cap_tier TEXT NOT NULL DEFAULT 'solo_full'
    CHECK (real_cap_tier IN ('solo_full', 'team_member', 'mega_team')),
  ADD COLUMN IF NOT EXISTS real_cap_amount NUMERIC NOT NULL DEFAULT 15000
    CHECK (real_cap_amount >= 0),
  ADD COLUMN IF NOT EXISTS real_pre_cap_agent_pct NUMERIC NOT NULL DEFAULT 0.85
    CHECK (real_pre_cap_agent_pct >= 0 AND real_pre_cap_agent_pct <= 1),
  ADD COLUMN IF NOT EXISTS real_post_cap_agent_pct NUMERIC NOT NULL DEFAULT 1.0
    CHECK (real_post_cap_agent_pct >= 0 AND real_post_cap_agent_pct <= 1),
  ADD COLUMN IF NOT EXISTS real_post_cap_fee NUMERIC NOT NULL DEFAULT 375
    CHECK (real_post_cap_fee >= 0),
  ADD COLUMN IF NOT EXISTS real_elite_fee NUMERIC NOT NULL DEFAULT 175
    CHECK (real_elite_fee >= 0),
  ADD COLUMN IF NOT EXISTS real_elite_threshold NUMERIC NOT NULL DEFAULT 9000
    CHECK (real_elite_threshold >= 0),
  ADD COLUMN IF NOT EXISTS real_cbr_fee NUMERIC NOT NULL DEFAULT 40
    CHECK (real_cbr_fee >= 0),
  ADD COLUMN IF NOT EXISTS real_beop_annual NUMERIC NOT NULL DEFAULT 1200
    CHECK (real_beop_annual >= 0),
  ADD COLUMN IF NOT EXISTS real_signup_fee NUMERIC NOT NULL DEFAULT 249
    CHECK (real_signup_fee >= 0),
  ADD COLUMN IF NOT EXISTS real_cap_paid_seed NUMERIC NOT NULL DEFAULT 0
    CHECK (real_cap_paid_seed >= 0),
  ADD COLUMN IF NOT EXISTS real_post_cap_fees_paid_seed NUMERIC NOT NULL DEFAULT 0
    CHECK (real_post_cap_fees_paid_seed >= 0);

COMMENT ON COLUMN user_settings.comp_plan IS
  'Compensation model: simple_split (static preset, default) | real (REAL Brokerage per-deal waterfall)';
COMMENT ON COLUMN user_settings.real_join_date IS
  'Date the agent joined REAL. Anchors the anniversary year for cap tracking; deals closed before this date stay on the legacy split.';
COMMENT ON COLUMN user_settings.real_cap_paid_seed IS
  'Company dollar already paid toward the current anniversary-year cap outside Agent Runway data (mid-year switchers).';
COMMENT ON COLUMN user_settings.real_post_cap_fees_paid_seed IS
  'Post-cap transaction fees already paid this anniversary year outside Agent Runway data (advances Elite threshold).';
