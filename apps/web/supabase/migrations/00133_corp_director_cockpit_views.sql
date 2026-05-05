-- ============================================================================
-- Migration 00133 — Director Cockpit Phase 0 (year-end + reporting views)
--
-- Five SQL views over corp_transactions that aggregate Phase 0 data for
-- (a) the year-end accountant export (built later) and (b) future cockpit
-- numbers panels (Phase 1).
--
-- All views use WITH (security_invoker = true) so they evaluate RLS as the
-- calling user — the underlying corp_transactions / corp_chart_of_accounts
-- RLS policies do all the user-scoping work. No separate view RLS needed.
--
-- Fiscal year = calendar year (Dec 31 year-end) per Andrew's REVIEW answer
-- 2026-05-05; if accountant elects different fiscal year-end later, update
-- the EXTRACT(YEAR FROM date) expression here in a follow-up migration.
--
-- Spec source:
--   memory/findings/spec_corp_director_cockpit_phase0_artifacts_2026-05-05.md
-- ============================================================================


-- ── 1. v_corp_pl_by_account ─────────────────────────────────────────────────
-- P&L by account_code + fiscal_year. corp_pct applied so personal portion
-- excluded. Feeds year-end T2 prep + future P&L panel.

CREATE OR REPLACE VIEW v_corp_pl_by_account
WITH (security_invoker = true) AS
SELECT
  t.user_id,
  EXTRACT(YEAR FROM t.date)::int      AS fiscal_year,
  t.account_code,
  coa.name                            AS account_name,
  coa.type                            AS account_type,
  COUNT(*)::int                       AS txn_count,
  SUM(t.amount_pretax * t.corp_pct / 100.0)  AS total_pretax_corp_portion,
  SUM(t.gst_hst       * t.corp_pct / 100.0)  AS total_gst_hst_corp_portion,
  SUM(t.amount_total  * t.corp_pct / 100.0)  AS total_corp_portion
FROM corp_transactions t
LEFT JOIN corp_chart_of_accounts coa ON coa.account_code = t.account_code
WHERE t.account_code IS NOT NULL
GROUP BY t.user_id, fiscal_year, t.account_code, coa.name, coa.type;

COMMENT ON VIEW v_corp_pl_by_account IS
  'P&L by account_code + fiscal year (calendar). corp_pct applied. Feeds year-end T2 prep.';


-- ── 2. v_corp_gst_hst_summary ───────────────────────────────────────────────
-- Quarterly HST collected vs ITC. Collected = gst_hst on revenue rows.
-- ITC = gst_hst (× corp_pct) on cogs/opex rows. Net remittance = collected − ITC.

CREATE OR REPLACE VIEW v_corp_gst_hst_summary
WITH (security_invoker = true) AS
SELECT
  t.user_id,
  date_trunc('quarter', t.date)::date                                            AS quarter_start,
  (date_trunc('quarter', t.date) + interval '3 months' - interval '1 day')::date AS quarter_end,
  COALESCE(SUM(t.gst_hst) FILTER (WHERE coa.type = 'revenue'), 0) AS hst_collected,
  COALESCE(
    SUM(t.gst_hst * t.corp_pct / 100.0) FILTER (WHERE coa.type IN ('cogs', 'opex')),
    0
  ) AS hst_itc,
  COALESCE(SUM(t.gst_hst) FILTER (WHERE coa.type = 'revenue'), 0)
    - COALESCE(
        SUM(t.gst_hst * t.corp_pct / 100.0) FILTER (WHERE coa.type IN ('cogs', 'opex')),
        0
      ) AS net_remittance,
  COUNT(*) FILTER (WHERE coa.type IN ('revenue', 'cogs', 'opex'))::int AS txn_count
FROM corp_transactions t
LEFT JOIN corp_chart_of_accounts coa ON coa.account_code = t.account_code
WHERE t.account_code IS NOT NULL
GROUP BY t.user_id, date_trunc('quarter', t.date);

COMMENT ON VIEW v_corp_gst_hst_summary IS
  'Quarterly GST/HST collected vs ITC + net remittance. Feeds quarterly remittance prep.';


-- ── 3. v_corp_sred_eligible_totals ──────────────────────────────────────────
-- SR&ED-eligible totals by category, per fiscal year. Feeds T661 working paper.

CREATE OR REPLACE VIEW v_corp_sred_eligible_totals
WITH (security_invoker = true) AS
SELECT
  user_id,
  EXTRACT(YEAR FROM date)::int  AS fiscal_year,
  sred_category,
  COUNT(*)::int                 AS txn_count,
  SUM(amount_pretax * corp_pct / 100.0)  AS total_corp_portion
FROM corp_transactions
WHERE sred_eligible = true
GROUP BY user_id, fiscal_year, sred_category;

COMMENT ON VIEW v_corp_sred_eligible_totals IS
  'SR&ED-eligible totals by category + fiscal year. Feeds T661.';


-- ── 4. v_corp_shareholder_loan_balance ──────────────────────────────────────
-- Running balance of shareholder loan account 3010. Sign convention preserved
-- from underlying rows: positive = company owes Andrew (advance); negative =
-- repayment.

CREATE OR REPLACE VIEW v_corp_shareholder_loan_balance
WITH (security_invoker = true) AS
SELECT
  user_id,
  date,
  id              AS txn_id,
  amount_total    AS amount,
  description,
  notes,
  SUM(amount_total) OVER (
    PARTITION BY user_id
    ORDER BY date, created_at
    ROWS UNBOUNDED PRECEDING
  ) AS running_balance
FROM corp_transactions
WHERE account_code = '3010';

COMMENT ON VIEW v_corp_shareholder_loan_balance IS
  'Shareholder loan (account 3010) ledger with running balance. Positive = company owes Andrew.';


-- ── 5. v_corp_pre_incorp_register ───────────────────────────────────────────
-- All transactions flagged pre_incorp_flag=true with derived days-before-
-- incorporation column. Feeds accountant pre-incorp reclassification working
-- paper. cra_rule_status reserved for accountant sign-off (Phase 1+).

CREATE OR REPLACE VIEW v_corp_pre_incorp_register
WITH (security_invoker = true) AS
SELECT
  t.*,
  COALESCE(t.incurred_date, t.date)                            AS effective_incurred_date,
  (DATE '2026-04-16' - COALESCE(t.incurred_date, t.date))::int AS days_before_incorp,
  NULL::text                                                   AS cra_rule_status
FROM corp_transactions t
WHERE t.pre_incorp_flag = true;

COMMENT ON VIEW v_corp_pre_incorp_register IS
  'Pre-incorporation transactions (pre_incorp_flag=true). AR Inc. incorp date = 2026-04-16. Feeds accountant T2 reclassification.';
