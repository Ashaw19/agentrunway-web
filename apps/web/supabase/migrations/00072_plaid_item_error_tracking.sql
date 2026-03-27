-- Migration 00072: Add error tracking columns to plaid_items
-- When Plaid sends an ITEM ERROR webhook or a sync fails with a token error,
-- we store the error code/message so the UI can prompt the user to reconnect.

ALTER TABLE plaid_items
  ADD COLUMN IF NOT EXISTS error_code    TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMENT ON COLUMN plaid_items.error_code IS 'Plaid error code (e.g. ITEM_LOGIN_REQUIRED). NULL = healthy.';
COMMENT ON COLUMN plaid_items.error_message IS 'Human-readable error message from Plaid.';
