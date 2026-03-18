/**
 * Migration 00049 — Buyer profile fields on clients
 *
 * Phase B pipeline tracking: early-stage buyer qualification data.
 * Enables buyer conversion rate tracking and timeline projection accuracy.
 *
 * buyer_pre_approved        — did the buyer receive a pre-approval letter?
 * buyer_pre_approval_amount — the confirmed mortgage pre-approval amount
 * buyer_financing_type      — mortgage | cash | bridge | unknown
 * buyer_target_close_date   — agent's recorded expected close date (for accuracy tracking)
 */

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS buyer_pre_approved        boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_pre_approval_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS buyer_financing_type      text,
  ADD COLUMN IF NOT EXISTS buyer_target_close_date   date;

NOTIFY pgrst, 'reload schema';
