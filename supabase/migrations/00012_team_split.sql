-- ============================================================================
-- Migration 00012 — Per-deal team / referral split
--
-- When a commission is shared with a team member BEFORE the brokerage split
-- is applied, the agent only earns their portion of the full commission.
--
-- Stored as the agent's SHARE (e.g. 0.60 = agent keeps 60% of the deal GCI
-- before the brokerage split is then applied on top).
--
-- NULL  = no team split on this deal (agent keeps 100% before brokerage cut).
-- Range : 0.0001–0.9999 stored as NUMERIC(5,4).
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS team_split_pct NUMERIC(5,4) DEFAULT NULL;

COMMENT ON COLUMN transactions.team_split_pct IS
  'Agent''s share of the commission BEFORE the brokerage split is applied.
   NULL = no team split (agent keeps 100%).
   Example: 0.60 means a 60/40 arrangement with a team member.
   Waterfall: sale_price × commission_pct × team_split_pct × brokerage_split = net.';
