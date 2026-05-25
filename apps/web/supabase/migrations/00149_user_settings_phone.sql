-- Migration 00149: Add phone to user_settings
--
-- Canonical agent phone number used as the default for any surface that
-- needs to display the agent's contact phone — Open House Setup page,
-- Showings Ledger sign-in, listing inquiry, public open house pages, and
-- any future client-facing touchpoint that should show the agent's reachable
-- number.
--
-- Until now the only place this lived was per-row on agent_open_houses,
-- which forced re-entry on every fresh open house setup. By putting it on
-- user_settings, the field flows through onboarding once and pre-populates
-- everywhere else.
--
-- Default '' (not NULL) matches the existing pattern on display_name and
-- brokerage_name — string fields on user_settings are non-null with empty
-- default so consumers never have to null-check.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN user_settings.phone IS
  'Agent phone number used as the canonical default for client-facing surfaces (Open House Setup, Showings Ledger, listing inquiry). Collected during onboarding, editable on /profile.';
