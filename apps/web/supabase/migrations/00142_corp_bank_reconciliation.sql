-- ============================================================================
-- Migration 00142 — Director Cockpit corp_bank_reconciliation (Phase 2 / Build #9)
--
-- Bank-CSV reconciliation closes the loop between what the cockpit ledger
-- says (corp_transactions) and what the bank actually processed. Andrew
-- uploads a CSV export from his business bank account; the system auto-matches
-- lines by date + amount against existing corp_transactions and flags anything
-- that doesn't match so he can investigate.
--
-- Why this matters:
--   1. CRA / T2 audit readiness: every corp_transaction must be traceable to
--      a bank statement line. Unmatched bank lines are either missing ledger
--      entries or bank errors.
--   2. Pre-accountant hygiene: before handing the cockpit export to the T2
--      accountant, the match rate should be ≥ 95%. The Director persona uses
--      this metric as a governance flag.
--   3. SR&ED: all eligible R&D spend needs a paper trail. A matched bank line
--      is the strongest corroboration for a corp_transaction with
--      sred_eligible = true.
--
-- Schema overview
-- ───────────────
-- corp_bank_statements
--   One row per uploaded statement file. Tracks bank name, period, and
--   aggregate match counts (updated by trigger after each line upsert).
--
-- corp_bank_lines
--   One row per CSV row / statement line. Each line has a match_status:
--     unmatched  — no corp_transaction found yet
--     matched    — linked to a corp_transaction (auto or manual)
--     manual     — user marked it as "not in ledger / skip" (transfer,
--                  payroll deduction, etc.)
--     split      — future: the line maps to >1 corp_transaction (partial
--                  allocation). Reserved — not implemented in v1.
--
-- v_corp_bank_reconciliation_summary
--   One row per statement. Reports total / matched / unmatched / manual
--   counts and a match_rate_pct. Used by the Director tool + Snapshot card.
--
-- Auto-match algorithm (runs inside the upload API route, not SQL):
--   Pass 1 — Exact date + amount match (confidence 1.0)
--   Pass 2 — ±2-day window + amount match (confidence 0.8)
--   Any line with 0 matches → stays 'unmatched'.
--   Any line with >1 candidate → stays 'unmatched' (surfaced as ambiguous).
--
-- Amount sign convention (IMPORTANT):
--   Bank exports: debits (money leaving) are stored as NEGATIVE amounts.
--                 credits (deposits, refunds) are stored as POSITIVE amounts.
--   corp_transactions: amount_total is ALWAYS POSITIVE. The sign is implied
--                 by the account_type (expense vs revenue).
--   Matching: ABS(bank_line.amount_cad) is matched against
--             corp_transaction.amount_total.
-- ============================================================================

-- ── corp_bank_statements ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS corp_bank_statements (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  bank_name       TEXT          NOT NULL,           -- e.g. 'RBC Business Chequing'
  account_label   TEXT,                             -- e.g. '****1234'
  period_start    DATE          NOT NULL,
  period_end      DATE          NOT NULL,

  raw_filename    TEXT,                             -- original CSV filename for reference
  row_count       INTEGER       NOT NULL DEFAULT 0, -- total lines parsed
  matched_count   INTEGER       NOT NULL DEFAULT 0,
  manual_count    INTEGER       NOT NULL DEFAULT 0,
  unmatched_count INTEGER       NOT NULL DEFAULT 0,

  uploaded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT bank_statement_period_order CHECK (period_start <= period_end)
);

ALTER TABLE corp_bank_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_bank_statements: select cockpit" ON corp_bank_statements;
CREATE POLICY "corp_bank_statements: select cockpit"
  ON corp_bank_statements FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_bank_statements: insert cockpit" ON corp_bank_statements;
CREATE POLICY "corp_bank_statements: insert cockpit"
  ON corp_bank_statements FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_bank_statements: update cockpit" ON corp_bank_statements;
CREATE POLICY "corp_bank_statements: update cockpit"
  ON corp_bank_statements FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_bank_statements: delete cockpit" ON corp_bank_statements;
CREATE POLICY "corp_bank_statements: delete cockpit"
  ON corp_bank_statements FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

-- ── corp_bank_lines ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS corp_bank_lines (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statement_id      UUID          NOT NULL REFERENCES corp_bank_statements(id) ON DELETE CASCADE,

  -- Raw statement data
  line_date         DATE          NOT NULL,
  description_raw   TEXT          NOT NULL,
  -- Signed amount: negative = debit (money out), positive = credit (money in).
  amount_cad        NUMERIC(12,2) NOT NULL,
  -- Running balance from the statement. NULL if the bank export omits it.
  balance_cad       NUMERIC(12,2),

  -- Reconciliation state
  match_status      TEXT          NOT NULL DEFAULT 'unmatched',
  matched_tx_id     UUID          REFERENCES corp_transactions(id) ON DELETE SET NULL,
  match_method      TEXT,         -- 'auto-exact' | 'auto-window' | 'manual'
  match_confidence  NUMERIC(4,3), -- 0.000 – 1.000

  -- Manual disposition (when user marks as not-in-ledger)
  skip_reason       TEXT,

  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT bank_line_match_status_check CHECK (
    match_status IN ('unmatched', 'matched', 'manual', 'split')
  ),
  CONSTRAINT bank_line_confidence_range CHECK (
    match_confidence IS NULL
    OR (match_confidence >= 0 AND match_confidence <= 1)
  ),
  CONSTRAINT bank_line_matched_requires_tx CHECK (
    match_status != 'matched' OR matched_tx_id IS NOT NULL
  )
);

ALTER TABLE corp_bank_lines ENABLE ROW LEVEL SECURITY;

-- Indexes for the auto-match algorithm (date + amount lookups are the hot path)
CREATE INDEX IF NOT EXISTS idx_corp_bank_lines_statement
  ON corp_bank_lines (statement_id, line_date);

CREATE INDEX IF NOT EXISTS idx_corp_bank_lines_unmatched
  ON corp_bank_lines (user_id, line_date, amount_cad)
  WHERE match_status = 'unmatched';

CREATE INDEX IF NOT EXISTS idx_corp_bank_lines_matched_tx
  ON corp_bank_lines (matched_tx_id)
  WHERE matched_tx_id IS NOT NULL;

DROP POLICY IF EXISTS "corp_bank_lines: select cockpit" ON corp_bank_lines;
CREATE POLICY "corp_bank_lines: select cockpit"
  ON corp_bank_lines FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_bank_lines: insert cockpit" ON corp_bank_lines;
CREATE POLICY "corp_bank_lines: insert cockpit"
  ON corp_bank_lines FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_bank_lines: update cockpit" ON corp_bank_lines;
CREATE POLICY "corp_bank_lines: update cockpit"
  ON corp_bank_lines FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_bank_lines: delete cockpit" ON corp_bank_lines;
CREATE POLICY "corp_bank_lines: delete cockpit"
  ON corp_bank_lines FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

-- ── Trigger: keep statement aggregate counts current ─────────────────────────
--
-- Called after INSERT or UPDATE on corp_bank_lines. Recalculates the three
-- count columns on the parent corp_bank_statements row so the Snapshot card
-- and Director tool don't need to COUNT(…) on every request.

CREATE OR REPLACE FUNCTION sync_bank_statement_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_statement_id UUID;
BEGIN
  v_statement_id := COALESCE(NEW.statement_id, OLD.statement_id);

  UPDATE corp_bank_statements
  SET
    row_count       = sub.total,
    matched_count   = sub.matched,
    manual_count    = sub.manual,
    unmatched_count = sub.unmatched,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*)                                           AS total,
      COUNT(*) FILTER (WHERE match_status = 'matched')  AS matched,
      COUNT(*) FILTER (WHERE match_status = 'manual')   AS manual,
      COUNT(*) FILTER (WHERE match_status = 'unmatched' OR match_status = 'split') AS unmatched
    FROM corp_bank_lines
    WHERE statement_id = v_statement_id
  ) sub
  WHERE corp_bank_statements.id = v_statement_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bank_statement_counts ON corp_bank_lines;
CREATE TRIGGER trg_sync_bank_statement_counts
  AFTER INSERT OR UPDATE OR DELETE ON corp_bank_lines
  FOR EACH ROW EXECUTE FUNCTION sync_bank_statement_counts();

-- ── Reporting view: v_corp_bank_reconciliation_summary ───────────────────────
--
-- One row per statement. Includes a match_rate_pct for quick health read.
-- NULL rate when row_count = 0 (empty statement, shouldn't happen in practice).

CREATE OR REPLACE VIEW v_corp_bank_reconciliation_summary AS
SELECT
  s.id                AS statement_id,
  s.user_id,
  s.bank_name,
  s.account_label,
  s.period_start,
  s.period_end,
  s.raw_filename,
  s.row_count,
  s.matched_count,
  s.manual_count,
  s.unmatched_count,
  CASE
    WHEN s.row_count = 0 THEN NULL
    ELSE ROUND(
      ((s.matched_count + s.manual_count)::NUMERIC / s.row_count) * 100,
      1
    )
  END                 AS match_rate_pct,
  s.uploaded_at,
  s.period_end - s.period_start + 1 AS period_days
FROM corp_bank_statements s
ORDER BY s.period_end DESC, s.uploaded_at DESC;
