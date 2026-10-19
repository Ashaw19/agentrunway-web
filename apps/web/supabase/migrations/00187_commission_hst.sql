-- ============================================================================
-- Migration 00187: the GST/HST on a commission, from the brokerage's statement,
-- and which date places a commission on a GST/HST return
--
-- Until now every surface took the HST collected on a commission as the
-- province's rate × the full commission, and the GST/HST return card put each
-- deal in the period of its closing date. A real commission statement
-- (Royal LePage, plan 75/25, NB) paid the agent $777 of HST on a $7,000
-- commission: 15% of $5,180, the agent's share after the $1,750 split and the
-- $70 franchise fee. Brokerages differ, so the figure is taken from the
-- statement (engines/commission-hst-engine.ts):
--
--   transactions.commission_hst            the GST/HST the commission statement
--                                          shows was paid to the agent. NULL =
--                                          not entered: the estimate (rate ×
--                                          the full commission) is used, as before.
--   user_settings.gst_hst_commission_timing 'closing' (default, the placement
--                                          every account had) | 'paid' (the
--                                          commission paid date, the closing
--                                          date when that is blank). CRA: GST/HST
--                                          is payable on the earlier of the day
--                                          paid and the day due (Memorandum
--                                          300-6); the agent picks the date that
--                                          matches their agreement.
--
-- ADDITIVE ONLY: one nullable column and one column with a default that keeps
-- every account's figures as they were. No row is rewritten.
-- ============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS commission_hst numeric(12,2)
    CHECK (commission_hst IS NULL OR commission_hst >= 0);

COMMENT ON COLUMN public.transactions.commission_hst IS
  'GST/HST the brokerage''s commission statement shows was paid to the agent on this commission. NULL = not entered (estimated at the rate on the full commission). Read through engines/commission-hst-engine.ts.';

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS gst_hst_commission_timing text NOT NULL DEFAULT 'closing'
    CHECK (gst_hst_commission_timing IN ('closing', 'paid'));

COMMENT ON COLUMN public.user_settings.gst_hst_commission_timing IS
  'Which date places a commission on a GST/HST return: closing (default) or paid (commission_paid_date, else the closing date). Read through gstHstCommissionTiming().';
