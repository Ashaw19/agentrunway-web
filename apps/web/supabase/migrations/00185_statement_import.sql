-- ============================================================================
-- Migration 00185: bank and credit-card statement import, with receipt matching
--
-- The agent uploads a statement (CSV, XLSX or PDF) on Expenses → Imports.
-- Its lines are staged here for review; nothing reaches the books until the
-- agent confirms. A confirmed line becomes a receipt_expenses row, the table
-- every expense total reads (expense-totals-engine, ytdExpenseTotals,
-- itcForExpense, the T2125 lines, the MCP server), so the totals need no
-- change of their own.
--
-- A charge counts once. A line for a charge already on file (a receipt, or a
-- Recurring Expenses charge, which counts on its date with nothing to
-- confirm) is LINKED on confirm, never added again. A line that only comes
-- close (another import of the same month, a near miss, a refund) is HELD
-- for the agent. Which lines those are is decided in code
-- (packages/core/engines/statement-import-engine.ts, findStatementDuplicates)
-- and written with fn_set_statement_line_flags before every confirm;
-- fn_confirm_statement_lines acts on what is stored, branch for branch the
-- same as confirmationOutcome in that engine. A receipt saved, or corrected,
-- AFTER its charge was confirmed replaces the statement copy, or flags the
-- line when it only comes close (triggers below), so the charge still counts
-- once whichever screen saved it.
--
-- GST/HST: a statement line does not show it. Rows added from a line have
-- tax_amount NULL: no input tax credit is claimed and nothing comes off the
-- expense total. It is never derived from a rate.
--
-- Privacy: account and card numbers are removed when the file is parsed,
-- before anything is stored. The uploaded file itself is never stored: it is
-- read in memory during the upload request and discarded. Staged lines stay
-- until the agent removes the import (Expenses → Imports → Remove), which
-- deletes the statement and its lines and leaves confirmed expenses in place.
--
-- Additive only: two new tables, two nullable columns on receipt_expenses,
-- four functions callable over RPC, a helper, and triggers. No existing row
-- changes.
-- ============================================================================

-- ── imported_statements: one row per uploaded file ─────────────────────────

CREATE TABLE IF NOT EXISTS public.imported_statements (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A bank account (chequing, savings) or a credit card: the agent's choice.
  kind             text          NOT NULL CHECK (kind IN ('bank', 'credit_card')),
  -- How it was read: 'csv:rbc', 'csv:generic', 'xlsx:amex', 'pdf', ...
  source_format    text          NOT NULL CHECK (char_length(source_format) BETWEEN 1 AND 40),
  institution      text          CHECK (institution IS NULL OR char_length(institution) <= 60),
  -- What the agent calls the account ("RBC Visa"). Never an account number:
  -- runs of digits are removed before it is saved.
  account_label    text          NOT NULL CHECK (char_length(account_label) BETWEEN 1 AND 80),
  -- The uploaded file's name, digit runs removed.
  file_name        text          CHECK (file_name IS NULL OR char_length(file_name) <= 200),
  -- SHA-256 of the file's bytes: the same file uploaded again lands on this row.
  file_hash        text          NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  period_start     date          NOT NULL,
  period_end       date          NOT NULL,
  -- Totals printed on a PDF statement, when it has them (the lines are checked against them).
  stated_total_out numeric(12,2),
  stated_total_in  numeric(12,2),
  opening_balance  numeric(12,2),
  closing_balance  numeric(12,2),
  -- How the lines were checked. not_applicable: a CSV or Excel export, read
  -- as written. reconciled: a PDF whose lines add up to its printed totals.
  -- mismatch: they don't. unverified: no totals could be read. A mismatch or
  -- unverified import's lines are confirmed one at a time, never in bulk.
  verification     text          NOT NULL DEFAULT 'not_applicable'
                                 CHECK (verification IN ('not_applicable', 'reconciled', 'mismatch', 'unverified')),
  -- Plain-language notes from parsing (lines left out, totals that don't reconcile).
  warnings         jsonb         NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  -- 'review' while any line is pending, 'done' after (kept by trigger).
  status           text          NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'done')),
  line_count       integer       NOT NULL DEFAULT 0,
  pending_count    integer       NOT NULL DEFAULT 0,
  confirmed_count  integer       NOT NULL DEFAULT 0,
  skipped_count    integer       NOT NULL DEFAULT 0,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT imported_statements_period_order CHECK (period_end >= period_start),
  CONSTRAINT imported_statements_user_file UNIQUE (user_id, file_hash)
);

CREATE INDEX IF NOT EXISTS imported_statements_user_idx
  ON public.imported_statements (user_id, period_end DESC);

ALTER TABLE public.imported_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own imported statements" ON public.imported_statements;
CREATE POLICY "Users manage own imported statements" ON public.imported_statements
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imported_statements TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_imported_statements_updated ON public.imported_statements;
CREATE TRIGGER trg_imported_statements_updated
  BEFORE UPDATE ON public.imported_statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── statement_lines: one row per charge or credit ──────────────────────────

CREATE TABLE IF NOT EXISTS public.statement_lines (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statement_id              uuid          NOT NULL REFERENCES public.imported_statements(id) ON DELETE CASCADE,
  -- The transaction date (YYYY-MM-DD as printed: a calendar day, no time zone).
  line_date                 date          NOT NULL,
  posted_date               date,
  -- As printed, with account and card numbers removed.
  description               text          NOT NULL CHECK (char_length(description) BETWEEN 1 AND 300),
  -- A cleaned-up merchant name, the expense's vendor when confirmed.
  merchant                  text          CHECK (merchant IS NULL OR char_length(merchant) <= 120),
  -- Always positive; `direction` is the sign.
  amount                    numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  -- 'out': money leaving (a purchase, a withdrawal, a fee). 'in': a refund, a deposit, a card payment.
  direction                 text          NOT NULL CHECK (direction IN ('out', 'in')),
  -- SHA-256 of account label, date, amount, description and its repeat number
  -- in the file. Unique per agent: importing a file again, or an overlapping
  -- export of the same account, never stages a line twice (upsert by
  -- fingerprint). Another export of the same month (a PDF after the CSV) has
  -- other fingerprints; its lines are held as "other_import" instead.
  fingerprint               text          NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  -- The bank's or QuickBooks' own category label, when the export has one.
  source_category           text          CHECK (source_category IS NULL OR char_length(source_category) <= 80),
  -- Estimated expense item key (RECEIPT_CATEGORY_GROUPS) and business likelihood.
  suggested_category_key    text          CHECK (suggested_category_key IS NULL OR char_length(suggested_category_key) <= 60),
  -- The agent's choice, when they changed it.
  category_key              text          CHECK (category_key IS NULL OR char_length(category_key) <= 60),
  category_source           text          CHECK (category_source IS NULL OR category_source IN ('hint', 'model', 'statement', 'agent')),
  business_likelihood       numeric(3,2)  CHECK (business_likelihood IS NULL OR business_likelihood BETWEEN 0 AND 1),
  likelihood_reason         text          CHECK (likelihood_reason IS NULL OR char_length(likelihood_reason) <= 200),
  status                    text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'skipped')),
  skip_reason               text          CHECK (skip_reason IS NULL OR skip_reason IN ('personal', 'transfer', 'payment', 'income', 'duplicate', 'user')),
  -- A receipt already on file for this charge (found by the duplicate check, or matched by the agent).
  match_receipt_id          uuid          REFERENCES public.receipt_expenses(id) ON DELETE SET NULL,
  match_method              text          CHECK (match_method IS NULL OR match_method IN ('exact', 'window', 'manual')),
  match_confidence          numeric(3,2)  CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 1),
  -- A Recurring Expenses charge this line is (it already counts on that date).
  recurring_expense_id      uuid          REFERENCES public.recurring_expenses(id) ON DELETE SET NULL,
  recurring_charge_date     date,
  -- How many records could be this charge.
  duplicate_candidate_count integer       NOT NULL DEFAULT 0 CHECK (duplicate_candidate_count >= 0),
  -- Set when the line is held for the agent: never linked, never added on its own.
  hold_reason               text          CHECK (hold_reason IS NULL OR hold_reason IN (
                                            'several', 'other_import', 'near_match', 'recurring_off_date',
                                            'refund', 'later_receipt', 'recurring_changed')),
  -- The other import's line, or the purchase a refund belongs to (or the refund of a purchase).
  related_line_id           uuid          REFERENCES public.statement_lines(id) ON DELETE SET NULL,
  -- A receipt that comes close, or that was saved after this line was confirmed.
  related_receipt_id        uuid          REFERENCES public.receipt_expenses(id) ON DELETE SET NULL,
  -- The agent said "not the same charge": the duplicate check leaves it alone.
  duplicate_dismissed       boolean       NOT NULL DEFAULT false,
  -- Set when the expense that recorded this line was deleted; the line went
  -- back to pending, and is confirmed again only one at a time.
  expense_deleted_at        timestamptz,
  confirmed_at              timestamptz,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT statement_lines_user_fingerprint UNIQUE (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS statement_lines_statement_idx ON public.statement_lines (statement_id, line_date);
CREATE INDEX IF NOT EXISTS statement_lines_user_date_idx ON public.statement_lines (user_id, line_date);
CREATE INDEX IF NOT EXISTS statement_lines_user_status_idx ON public.statement_lines (user_id, status);
CREATE INDEX IF NOT EXISTS statement_lines_match_receipt_idx ON public.statement_lines (match_receipt_id) WHERE match_receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS statement_lines_related_receipt_idx ON public.statement_lines (related_receipt_id) WHERE related_receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS statement_lines_related_line_idx ON public.statement_lines (related_line_id) WHERE related_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS statement_lines_recurring_idx ON public.statement_lines (recurring_expense_id) WHERE recurring_expense_id IS NOT NULL;

ALTER TABLE public.statement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own statement lines" ON public.statement_lines;
CREATE POLICY "Users manage own statement lines" ON public.statement_lines
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_lines TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_statement_lines_updated ON public.statement_lines;
CREATE TRIGGER trg_statement_lines_updated
  BEFORE UPDATE ON public.statement_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── receipt_expenses: the link back to a statement line ────────────────────

ALTER TABLE public.receipt_expenses
  -- 'statement_import' for a row added from a statement line; NULL for every
  -- other row (receipt capture, the Expenses form, Flight Crew, imports).
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IS NULL OR source IN ('statement_import')),
  -- The statement line this expense is reconciled with: the line it was
  -- added from, or the card charge it was matched to. One line per expense.
  ADD COLUMN IF NOT EXISTS statement_line_id uuid
    REFERENCES public.statement_lines(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS receipt_expenses_statement_line_uidx
  ON public.receipt_expenses (statement_line_id)
  WHERE statement_line_id IS NOT NULL;

-- ── Counts on the statement row ────────────────────────────────────────────
-- Statement-level triggers with transition tables: one UPDATE per statement
-- touched per SQL statement, by the change in counts only (no recount of
-- every line), so staging 5,000 lines or confirming 2,000 stays well inside
-- the statement timeout. Postgres allows transition tables only on
-- single-event triggers without a column list, hence three functions.

CREATE OR REPLACE FUNCTION public.fn_statement_lines_count_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE imported_statements s
     SET line_count      = s.line_count + d.total,
         pending_count   = s.pending_count + d.pending,
         confirmed_count = s.confirmed_count + d.confirmed,
         skipped_count   = s.skipped_count + d.skipped,
         status          = CASE WHEN s.pending_count + d.pending > 0 THEN 'review' ELSE 'done' END
    FROM (
      SELECT n.statement_id,
             count(*)                                       AS total,
             count(*) FILTER (WHERE n.status = 'pending')   AS pending,
             count(*) FILTER (WHERE n.status = 'confirmed') AS confirmed,
             count(*) FILTER (WHERE n.status = 'skipped')   AS skipped
        FROM new_lines n
       GROUP BY n.statement_id
    ) d
   WHERE s.id = d.statement_id;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_statement_lines_count_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE imported_statements s
     SET line_count      = s.line_count + d.total,
         pending_count   = s.pending_count + d.pending,
         confirmed_count = s.confirmed_count + d.confirmed,
         skipped_count   = s.skipped_count + d.skipped,
         status          = CASE WHEN s.pending_count + d.pending > 0 THEN 'review' ELSE 'done' END
    FROM (
      SELECT x.statement_id,
             coalesce(sum(x.sign), 0)                                       AS total,
             coalesce(sum(x.sign) FILTER (WHERE x.status = 'pending'), 0)   AS pending,
             coalesce(sum(x.sign) FILTER (WHERE x.status = 'confirmed'), 0) AS confirmed,
             coalesce(sum(x.sign) FILTER (WHERE x.status = 'skipped'), 0)   AS skipped
        FROM (
          SELECT o.statement_id, o.status, -1 AS sign
            FROM old_lines o JOIN new_lines n ON n.id = o.id
           WHERE o.status IS DISTINCT FROM n.status OR o.statement_id IS DISTINCT FROM n.statement_id
          UNION ALL
          SELECT n.statement_id, n.status, 1 AS sign
            FROM new_lines n JOIN old_lines o ON o.id = n.id
           WHERE o.status IS DISTINCT FROM n.status OR o.statement_id IS DISTINCT FROM n.statement_id
        ) x
       GROUP BY x.statement_id
    ) d
   WHERE s.id = d.statement_id;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_statement_lines_count_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- When the statement itself is being deleted (ON DELETE CASCADE), its row
  -- is already gone and this updates nothing.
  UPDATE imported_statements s
     SET line_count      = s.line_count - d.total,
         pending_count   = s.pending_count - d.pending,
         confirmed_count = s.confirmed_count - d.confirmed,
         skipped_count   = s.skipped_count - d.skipped,
         status          = CASE WHEN s.pending_count - d.pending > 0 THEN 'review' ELSE 'done' END
    FROM (
      SELECT o.statement_id,
             count(*)                                       AS total,
             count(*) FILTER (WHERE o.status = 'pending')   AS pending,
             count(*) FILTER (WHERE o.status = 'confirmed') AS confirmed,
             count(*) FILTER (WHERE o.status = 'skipped')   AS skipped
        FROM old_lines o
       GROUP BY o.statement_id
    ) d
   WHERE s.id = d.statement_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_statement_lines_count_insert ON public.statement_lines;
CREATE TRIGGER trg_statement_lines_count_insert
  AFTER INSERT ON public.statement_lines
  REFERENCING NEW TABLE AS new_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_statement_lines_count_insert();

DROP TRIGGER IF EXISTS trg_statement_lines_count_update ON public.statement_lines;
CREATE TRIGGER trg_statement_lines_count_update
  AFTER UPDATE ON public.statement_lines
  REFERENCING OLD TABLE AS old_lines NEW TABLE AS new_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_statement_lines_count_update();

DROP TRIGGER IF EXISTS trg_statement_lines_count_delete ON public.statement_lines;
CREATE TRIGGER trg_statement_lines_count_delete
  AFTER DELETE ON public.statement_lines
  REFERENCING OLD TABLE AS old_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_statement_lines_count_delete();

-- ── A deleted expense sends its statement line back to review ──────────────
-- BEFORE DELETE, so it runs ahead of the ON DELETE SET NULL on the links.
-- The charge is no longer recorded anywhere, so the line is pending again,
-- marked (expense_deleted_at): the Imports tab says why, and "Confirm all"
-- leaves it out, so an expense deleted on purpose doesn't come back in bulk.

CREATE OR REPLACE FUNCTION public.fn_statement_lines_on_receipt_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.statement_line_id IS NOT NULL THEN
    UPDATE statement_lines
       SET status             = 'pending',
           confirmed_at       = NULL,
           expense_deleted_at = now(),
           hold_reason        = CASE WHEN hold_reason = 'later_receipt' THEN NULL ELSE hold_reason END,
           related_receipt_id = CASE WHEN hold_reason = 'later_receipt' THEN NULL ELSE related_receipt_id END,
           match_receipt_id   = CASE WHEN match_receipt_id = OLD.id THEN NULL ELSE match_receipt_id END,
           match_method       = CASE WHEN match_receipt_id = OLD.id THEN NULL ELSE match_method END,
           match_confidence   = CASE WHEN match_receipt_id = OLD.id THEN NULL ELSE match_confidence END,
           duplicate_candidate_count = CASE WHEN match_receipt_id = OLD.id THEN 0 ELSE duplicate_candidate_count END
     WHERE id = OLD.statement_line_id
       AND status = 'confirmed';
  END IF;

  -- A pending line that pointed at this receipt as its duplicate: no longer one.
  UPDATE statement_lines
     SET match_receipt_id          = NULL,
         match_method              = NULL,
         match_confidence          = NULL,
         duplicate_candidate_count = 0
   WHERE match_receipt_id = OLD.id
     AND status = 'pending';

  -- A confirmed line asking about this receipt (saved after it): nothing to ask.
  UPDATE statement_lines
     SET hold_reason = NULL, related_receipt_id = NULL
   WHERE related_receipt_id = OLD.id
     AND hold_reason = 'later_receipt';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_expenses_statement_line_reset ON public.receipt_expenses;
CREATE TRIGGER trg_receipt_expenses_statement_line_reset
  BEFORE DELETE ON public.receipt_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_statement_lines_on_receipt_delete();

-- ── A receipt saved after its charge was confirmed ─────────────────────────
-- Every screen that saves an expense (receipt capture on the web and the
-- phone, the Expenses form, Flight Crew, the MCP server, imports) inserts
-- into receipt_expenses, and every screen that corrects one (the phone's
-- scan saves what OCR read, then the agent's fixes; the web edit dialog;
-- Flight Crew's updateExpense) updates it, so these two triggers see them
-- all: on insert, and when an expense's date or amount is edited.
--
-- Exactly one expense added from a confirmed statement line for the same
-- amount (within $0.02) on the same day: the receipt is that charge. It
-- takes the line over (with its printed GST/HST and image), takes the copy's
-- category when it has none, and the copy is removed: the charge counts once.
-- Otherwise, close but not certain (the engine's near-miss rule,
-- NEAR_MATCH_DAYS and NEAR_MATCH_AMOUNT_SHARE in statement-import-engine):
-- the same amount within 5 days, or the same merchant within 5 days at an
-- amount within 25% (a pre-tip restaurant receipt, a charge in US dollars),
-- or more than one copy on the day. Those lines are flagged (hold_reason
-- 'later_receipt') for the agent to match or keep both. An edit first clears
-- what the receipt flagged before, then asks again for its new values.

-- The merchant words of a text, as the engine's near-miss test reads them:
-- runs of 3+ letters, lower case, without words that say nothing about the
-- merchant (MERCHANT_STOP_WORDS; statement-import-confirm-sql.test.ts keeps
-- the two lists equal).
CREATE OR REPLACE FUNCTION public.fn_statement_merchant_words(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT m[1]), '{}'::text[])
    FROM regexp_matches(lower(coalesce(p_text, '')), '([a-z]{3,})', 'g') AS m
   WHERE m[1] <> ALL (ARRAY[
     'the', 'and', 'inc', 'ltd', 'llc', 'com', 'www', 'pos', 'purchase', 'payment', 'visa', 'debit', 'credit', 'card',
     'store', 'canada', 'can', 'sale', 'pre', 'authorized', 'interac', 'retail', 'online', 'bill', 'pay', 'refund',
     'return', 'returned', 'reversal', 'mastercard', 'amex', 'tst', 'fpos', 'opos', 'apos'
   ]);
$$;

-- The receipt trigger runs as whoever saves the receipt (the signed-in agent,
-- or the service role for server-side saves). A pure text function: nothing
-- it can read.
GRANT EXECUTE ON FUNCTION public.fn_statement_merchant_words(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_receipt_replaces_statement_copy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_copy  receipt_expenses%ROWTYPE;
  v_n     integer;
  v_words text[];
BEGIN
  IF NEW.source IS NOT NULL OR NEW.statement_line_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- An edit of the date or amount: what this receipt flagged before is
  -- cleared, then asked again for the new values below.
  IF TG_OP = 'UPDATE' THEN
    UPDATE statement_lines
       SET hold_reason = NULL, related_receipt_id = NULL
     WHERE user_id = NEW.user_id
       AND related_receipt_id = NEW.id
       AND hold_reason = 'later_receipt';
  END IF;

  IF NEW.expense_date IS NULL OR coalesce(NEW.total_amount, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_n
    FROM receipt_expenses c
    JOIN statement_lines l ON l.id = c.statement_line_id
   WHERE c.user_id = NEW.user_id
     AND l.user_id = NEW.user_id
     AND c.id <> NEW.id
     AND c.source = 'statement_import'
     AND c.receipt_path IS NULL
     AND l.status = 'confirmed'
     AND c.expense_date = NEW.expense_date
     AND abs(c.total_amount - NEW.total_amount) <= 0.02;

  IF v_n = 1 THEN
    SELECT c.* INTO v_copy
      FROM receipt_expenses c
      JOIN statement_lines l ON l.id = c.statement_line_id
     WHERE c.user_id = NEW.user_id
       AND l.user_id = NEW.user_id
       AND c.id <> NEW.id
       AND c.source = 'statement_import'
       AND c.receipt_path IS NULL
       AND l.status = 'confirmed'
       AND c.expense_date = NEW.expense_date
       AND abs(c.total_amount - NEW.total_amount) <= 0.02;

    -- The copy goes first: the line's link is unique.
    DELETE FROM receipt_expenses WHERE id = v_copy.id;
    UPDATE receipt_expenses
       SET statement_line_id = v_copy.statement_line_id,
           category_key      = coalesce(category_key, v_copy.category_key)
     WHERE id = NEW.id;
    UPDATE statement_lines
       SET status                    = 'confirmed',
           match_receipt_id          = NEW.id,
           match_method              = 'exact',
           match_confidence          = 1,
           duplicate_candidate_count = 1,
           hold_reason               = NULL,
           related_receipt_id        = NULL,
           expense_deleted_at        = NULL,
           confirmed_at              = now()
     WHERE id = v_copy.statement_line_id
       AND user_id = NEW.user_id;
    RETURN NULL;
  END IF;

  -- Close but not certain: flag the confirmed line for the agent.
  v_words := fn_statement_merchant_words(NEW.vendor);
  UPDATE statement_lines l
     SET hold_reason = 'later_receipt', related_receipt_id = NEW.id
    FROM receipt_expenses c
   WHERE c.statement_line_id = l.id
     AND l.user_id = NEW.user_id
     AND c.user_id = NEW.user_id
     AND c.id <> NEW.id
     AND c.source = 'statement_import'
     AND c.receipt_path IS NULL
     AND l.status = 'confirmed'
     AND l.hold_reason IS NULL
     AND c.expense_date BETWEEN NEW.expense_date - 5 AND NEW.expense_date + 5
     AND (
       abs(c.total_amount - NEW.total_amount) <= 0.02
       OR (abs(c.total_amount - NEW.total_amount) <= 0.25 * greatest(c.total_amount, NEW.total_amount)
           AND v_words && fn_statement_merchant_words(coalesce(l.merchant, '') || ' ' || l.description))
     );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_expenses_replace_statement_copy ON public.receipt_expenses;
CREATE TRIGGER trg_receipt_expenses_replace_statement_copy
  AFTER INSERT ON public.receipt_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_receipt_replaces_statement_copy();

-- The edit: only when the date or amount changes, on an expense that isn't
-- a statement line's record already. The function's own UPDATE of the
-- receipt (its link and category) doesn't fire it again.
DROP TRIGGER IF EXISTS trg_receipt_expenses_replace_statement_copy_on_edit ON public.receipt_expenses;
CREATE TRIGGER trg_receipt_expenses_replace_statement_copy_on_edit
  AFTER UPDATE OF expense_date, total_amount ON public.receipt_expenses
  FOR EACH ROW
  WHEN (NEW.source IS NULL AND NEW.statement_line_id IS NULL
        AND (OLD.expense_date IS DISTINCT FROM NEW.expense_date
             OR OLD.total_amount IS DISTINCT FROM NEW.total_amount))
  EXECUTE FUNCTION public.fn_receipt_replaces_statement_copy();

-- ── A recurring expense deleted or changed ─────────────────────────────────
-- Deleted: it no longer counts its charges, so lines confirmed as one of them
-- go back to review. Changed in a way that moves or resizes its charges
-- (amount, schedule, start or end date, paused): the lines marked as its
-- charges go back to review too, held as 'recurring_changed', and the
-- duplicate check runs again on the next confirm. Otherwise a charge the
-- list no longer makes would count zero times.

CREATE OR REPLACE FUNCTION public.fn_statement_lines_on_recurring_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE statement_lines
     SET status                    = CASE WHEN status = 'confirmed' THEN 'pending' ELSE status END,
         confirmed_at              = CASE WHEN status = 'confirmed' THEN NULL ELSE confirmed_at END,
         expense_deleted_at        = CASE WHEN status = 'confirmed' THEN now() ELSE expense_deleted_at END,
         recurring_expense_id      = NULL,
         recurring_charge_date     = NULL,
         match_method              = NULL,
         match_confidence          = NULL,
         duplicate_candidate_count = 0
   WHERE recurring_expense_id = OLD.id
     AND status IN ('pending', 'confirmed');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_recurring_expenses_statement_line_reset ON public.recurring_expenses;
CREATE TRIGGER trg_recurring_expenses_statement_line_reset
  BEFORE DELETE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_statement_lines_on_recurring_delete();

CREATE OR REPLACE FUNCTION public.fn_statement_lines_on_recurring_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.frequency IS NOT DISTINCT FROM OLD.frequency
     AND NEW.day_of_month IS NOT DISTINCT FROM OLD.day_of_month
     AND NEW.month_of_year IS NOT DISTINCT FROM OLD.month_of_year
     AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NULL;
  END IF;
  UPDATE statement_lines
     SET status                    = 'pending',
         confirmed_at              = NULL,
         recurring_expense_id      = NULL,
         recurring_charge_date     = NULL,
         match_method              = NULL,
         match_confidence          = NULL,
         duplicate_candidate_count = 0,
         hold_reason               = 'recurring_changed'
   WHERE recurring_expense_id = NEW.id
     AND status IN ('pending', 'confirmed');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recurring_expenses_statement_line_recheck ON public.recurring_expenses;
CREATE TRIGGER trg_recurring_expenses_statement_line_recheck
  AFTER UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_statement_lines_on_recurring_change();

-- ── The duplicate check's results, written in one statement ────────────────
-- p_updates: [{"id": "<line uuid>", "match_receipt_id": ..., "match_method": ...,
--   "match_confidence": ..., "recurring_expense_id": ..., "recurring_charge_date": ...,
--   "duplicate_candidate_count": ..., "hold_reason": ..., "related_line_id": ...,
--   "related_receipt_id": ...}, ...] (duplicateFlagUpdates in the engine).
-- Pending lines of the caller's only. Returns how many lines changed.

CREATE OR REPLACE FUNCTION public.fn_set_statement_line_flags(p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'p_updates must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_updates) > 5000 THEN
    RAISE EXCEPTION 'too many lines at once (max 5000)' USING ERRCODE = '22023';
  END IF;

  UPDATE statement_lines l
     SET match_receipt_id          = u.match_receipt_id,
         match_method              = u.match_method,
         match_confidence          = u.match_confidence,
         recurring_expense_id      = u.recurring_expense_id,
         recurring_charge_date     = u.recurring_charge_date,
         duplicate_candidate_count = coalesce(u.duplicate_candidate_count, 0),
         hold_reason               = u.hold_reason,
         related_line_id           = u.related_line_id,
         related_receipt_id        = u.related_receipt_id
    FROM jsonb_to_recordset(p_updates) AS u(
           id uuid, match_receipt_id uuid, match_method text, match_confidence numeric,
           recurring_expense_id uuid, recurring_charge_date date, duplicate_candidate_count integer,
           hold_reason text, related_line_id uuid, related_receipt_id uuid)
   WHERE l.id = u.id
     AND l.user_id = v_uid
     AND l.status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_statement_line_flags(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_set_statement_line_flags(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_set_statement_line_flags(jsonb) TO authenticated, service_role;

-- ── Confirm lines ──────────────────────────────────────────────────────────
-- p_lines: [{"id": "<line uuid>", "category_key": "<item key or null>"}, ...]
-- Per line, in this order (confirmationOutcome in statement-import-engine.ts
-- is the same; the behaviour checks in scripts/db/behavior-checks.sql run it):
--   not the caller's line                   → refused: not_found
--   not pending                             → refused: not_pending
--   money in                                → refused: not_a_charge
--   unless marked "not the same charge":
--     a receipt on file for it              → linked to that receipt, nothing added
--     a Recurring Expenses charge           → confirmed, nothing added (it counts on its date)
--     held (a hold reason, or several fits) → refused: needs_decision
--   no category given, chosen or estimated  → refused: needs_category
--   not an expense item key                 → refused: unknown_category
--   otherwise                               → added to receipt_expenses, GST/HST empty
-- The item keys are RECEIPT_CATEGORY_KEYS (packages/core/lib/expense-items.ts;
-- statement-import-keys.test.ts holds the two lists together), the list the
-- web checks with isReceiptCategoryKey, so an account missing a seeded
-- expense item is not refused a valid key.
-- SECURITY INVOKER: row level security applies to every read and write.

CREATE OR REPLACE FUNCTION public.fn_confirm_statement_lines(p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_item       jsonb;
  v_line       statement_lines%ROWTYPE;
  v_label      text;
  v_category   text;
  v_receipt_id uuid;
  v_created    jsonb := '[]'::jsonb;
  v_linked     jsonb := '[]'::jsonb;
  v_recurring  jsonb := '[]'::jsonb;
  v_refused    jsonb := '[]'::jsonb;
  v_keys       text[] := ARRAY[
    'vehicle_fuel', 'vehicle_service', 'vehicle_insurance', 'vehicle_payment',
    'marketing_ads', 'marketing_photography', 'marketing_print', 'marketing_gifts',
    'office_supplies', 'office_software', 'office_phone', 'office_hardware',
    'prof_board_mls', 'prof_licensing', 'prof_eo', 'prof_accounting',
    'edu_courses', 'edu_conferences', 'edu_books',
    'meals_client', 'meals_team', 'ent_client', 'ent_events',
    'home_utilities', 'home_internet', 'home_insurance', 'home_maintenance',
    'home_property_tax', 'home_mortgage_interest', 'home_rent', 'home_condo_fees',
    'other_misc'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) > 2000 THEN
    RAISE EXCEPTION 'too many lines at once (max 2000)' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_receipt_id := NULL;

    IF coalesce(v_item->>'id', '') !~ '^[0-9a-fA-F-]{36}$' THEN
      v_refused := v_refused || jsonb_build_object('id', v_item->>'id', 'reason', 'not_found');
      CONTINUE;
    END IF;

    SELECT * INTO v_line
      FROM statement_lines
     WHERE id = (v_item->>'id')::uuid AND user_id = v_uid
     FOR UPDATE;
    IF NOT FOUND THEN
      v_refused := v_refused || jsonb_build_object('id', v_item->>'id', 'reason', 'not_found');
      CONTINUE;
    END IF;
    IF v_line.status <> 'pending' THEN
      v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'not_pending');
      CONTINUE;
    END IF;
    IF v_line.direction <> 'out' THEN
      v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'not_a_charge');
      CONTINUE;
    END IF;

    IF NOT v_line.duplicate_dismissed THEN
      IF v_line.match_receipt_id IS NOT NULL THEN
        UPDATE receipt_expenses
           SET statement_line_id = v_line.id
         WHERE id = v_line.match_receipt_id
           AND user_id = v_uid
           AND (statement_line_id IS NULL OR statement_line_id = v_line.id)
        RETURNING id INTO v_receipt_id;
        IF v_receipt_id IS NULL THEN
          -- The receipt is gone, or another line holds it now.
          v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'needs_decision');
          CONTINUE;
        END IF;
        UPDATE statement_lines
           SET status = 'confirmed', skip_reason = NULL, expense_deleted_at = NULL, confirmed_at = now()
         WHERE id = v_line.id;
        v_linked := v_linked || jsonb_build_object('id', v_line.id, 'receipt_id', v_receipt_id);
        CONTINUE;
      END IF;

      IF v_line.recurring_expense_id IS NOT NULL THEN
        UPDATE statement_lines
           SET status = 'confirmed', skip_reason = NULL, expense_deleted_at = NULL, confirmed_at = now()
         WHERE id = v_line.id;
        v_recurring := v_recurring || jsonb_build_object('id', v_line.id, 'recurring_expense_id', v_line.recurring_expense_id);
        CONTINUE;
      END IF;

      IF v_line.hold_reason IS NOT NULL OR v_line.duplicate_candidate_count > 1 THEN
        v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'needs_decision');
        CONTINUE;
      END IF;
    END IF;

    v_category := coalesce(nullif(btrim(coalesce(v_item->>'category_key', '')), ''), v_line.category_key, v_line.suggested_category_key);
    IF v_category IS NULL THEN
      v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'needs_category');
      CONTINUE;
    END IF;
    IF NOT (v_category = ANY (v_keys)) THEN
      v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'unknown_category');
      CONTINUE;
    END IF;

    SELECT st.account_label INTO v_label FROM imported_statements st WHERE st.id = v_line.statement_id;

    -- A row this line already made is reused, never doubled.
    SELECT re.id INTO v_receipt_id
      FROM receipt_expenses re
     WHERE re.user_id = v_uid AND re.statement_line_id = v_line.id;

    IF v_receipt_id IS NULL THEN
      INSERT INTO receipt_expenses (
        user_id, vendor, expense_date, total_amount, tax_amount, subtotal,
        currency, category_key, notes, source, statement_line_id
      ) VALUES (
        v_uid,
        left(coalesce(nullif(btrim(v_line.merchant), ''), btrim(v_line.description)), 120),
        v_line.line_date,
        v_line.amount,
        NULL,
        NULL,
        'CAD',
        v_category,
        CASE WHEN nullif(btrim(coalesce(v_label, '')), '') IS NULL
             THEN 'From statement import'
             ELSE 'From statement import, ' || btrim(v_label) END,
        'statement_import',
        v_line.id
      )
      RETURNING id INTO v_receipt_id;
    END IF;

    UPDATE statement_lines
       SET status = 'confirmed',
           category_key = v_category,
           skip_reason = NULL,
           expense_deleted_at = NULL,
           confirmed_at = now()
     WHERE id = v_line.id;
    v_created := v_created || jsonb_build_object('id', v_line.id, 'receipt_id', v_receipt_id);
  END LOOP;

  RETURN jsonb_build_object(
    'created',   v_created,
    'linked',    v_linked,
    'recurring', v_recurring,
    'refused',   v_refused
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_confirm_statement_lines(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_confirm_statement_lines(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_confirm_statement_lines(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_confirm_statement_lines(jsonb) IS
  'Confirms the caller''s pending statement lines: a charge already on file (receipt or recurring) is linked, never added again; a held line is refused; any other is added to receipt_expenses with GST/HST empty.';

-- ── Match a receipt to a line ──────────────────────────────────────────────
-- The receipt is the record of this card charge. If the line had already
-- been added as its own expense (the statement copy, no receipt image), that
-- copy is removed so the charge counts once, and the receipt takes its
-- category when it has none. Refused when the receipt is already reconciled
-- with another line, or when the line is counted by a recurring expense (a
-- receipt for it would count the charge a second time).

CREATE OR REPLACE FUNCTION public.fn_match_statement_line(p_line_id uuid, p_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_line     statement_lines%ROWTYPE;
  v_receipt  receipt_expenses%ROWTYPE;
  v_own      receipt_expenses%ROWTYPE;
  v_replaced uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_line FROM statement_lines WHERE id = p_line_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'line_not_found');
  END IF;
  IF v_line.direction <> 'out' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_charge');
  END IF;

  SELECT * INTO v_receipt FROM receipt_expenses WHERE id = p_receipt_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receipt_not_found');
  END IF;
  IF v_receipt.statement_line_id IS NOT NULL AND v_receipt.statement_line_id <> v_line.id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receipt_linked_elsewhere');
  END IF;
  IF v_line.status = 'confirmed' AND v_line.recurring_expense_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM receipt_expenses re WHERE re.user_id = v_uid AND re.statement_line_id = v_line.id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'counted_by_recurring');
  END IF;

  -- The expense that records the line now, if it is another row.
  SELECT * INTO v_own
    FROM receipt_expenses
   WHERE user_id = v_uid AND statement_line_id = v_line.id AND id <> p_receipt_id;
  IF FOUND THEN
    IF v_own.source = 'statement_import' AND v_own.receipt_path IS NULL THEN
      IF v_receipt.category_key IS NULL THEN
        UPDATE receipt_expenses SET category_key = v_own.category_key WHERE id = p_receipt_id;
      END IF;
      DELETE FROM receipt_expenses WHERE id = v_own.id;
      v_replaced := v_own.id;
    ELSE
      UPDATE receipt_expenses SET statement_line_id = NULL WHERE id = v_own.id;
    END IF;
  END IF;

  UPDATE receipt_expenses SET statement_line_id = v_line.id WHERE id = p_receipt_id;

  UPDATE statement_lines
     SET status                    = 'confirmed',
         match_receipt_id          = p_receipt_id,
         match_method              = 'manual',
         match_confidence          = NULL,
         duplicate_candidate_count = 1,
         duplicate_dismissed       = false,
         hold_reason               = NULL,
         related_line_id           = NULL,
         related_receipt_id        = NULL,
         recurring_expense_id      = NULL,
         recurring_charge_date     = NULL,
         skip_reason               = NULL,
         expense_deleted_at        = NULL,
         confirmed_at              = now()
   WHERE id = v_line.id;

  RETURN jsonb_build_object('ok', true, 'line_id', v_line.id, 'receipt_id', p_receipt_id, 'replaced_receipt_id', v_replaced);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_match_statement_line(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_match_statement_line(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_match_statement_line(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_match_statement_line(uuid, uuid) IS
  'Reconciles one of the caller''s receipts with a statement line; a statement copy of the same charge is removed so it counts once.';

-- ── Send lines back to review ──────────────────────────────────────────────
-- Skipped → pending. Confirmed → pending: the expense the line added (its
-- statement copy, no receipt image) is removed; a receipt matched to it is
-- kept and unlinked. Returns how many lines went back.

CREATE OR REPLACE FUNCTION public.fn_reopen_statement_lines(p_line_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_line     statement_lines%ROWTYPE;
  v_reopened integer := 0;
  v_removed  integer := 0;
  v_count    integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_line_ids IS NULL OR cardinality(p_line_ids) = 0 THEN
    RETURN jsonb_build_object('reopened', 0, 'expenses_removed', 0);
  END IF;
  IF cardinality(p_line_ids) > 2000 THEN
    RAISE EXCEPTION 'too many lines at once (max 2000)' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM statement_lines
     WHERE user_id = v_uid AND id = ANY (p_line_ids) AND status IN ('confirmed', 'skipped')
     FOR UPDATE
  LOOP
    IF v_line.status = 'confirmed' THEN
      DELETE FROM receipt_expenses
       WHERE user_id = v_uid AND statement_line_id = v_line.id
         AND source = 'statement_import' AND receipt_path IS NULL;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_removed := v_removed + v_count;
      UPDATE receipt_expenses SET statement_line_id = NULL
       WHERE user_id = v_uid AND statement_line_id = v_line.id;
    END IF;
    UPDATE statement_lines
       SET status = 'pending', skip_reason = NULL, confirmed_at = NULL, expense_deleted_at = NULL,
           hold_reason = CASE WHEN hold_reason = 'later_receipt' THEN NULL ELSE hold_reason END,
           related_receipt_id = CASE WHEN hold_reason = 'later_receipt' THEN NULL ELSE related_receipt_id END
     WHERE id = v_line.id;
    v_reopened := v_reopened + 1;
  END LOOP;

  RETURN jsonb_build_object('reopened', v_reopened, 'expenses_removed', v_removed);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reopen_statement_lines(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_reopen_statement_lines(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_reopen_statement_lines(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_reopen_statement_lines(uuid[]) IS
  'Sends the caller''s confirmed or skipped statement lines back to review; an expense a line added (no receipt image) is removed, a matched receipt is kept.';
