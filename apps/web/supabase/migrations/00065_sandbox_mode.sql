-- Migration 00065: Sandbox Mode
-- Adds sandbox mode columns to user_settings for the interactive
-- fictional-agent toggle feature. Users can explore a board-aware
-- sandbox dataset before committing their own data.

-- sandbox_mode          — whether sandbox is currently active
-- sandbox_activated_at  — timestamp of first activation (starts the 90-day window)
-- sandbox_expires_at    — when sandbox access transitions to read-only archive
-- sandbox_tier          — production tier selected at activation (building/established/high_producer)
-- sandbox_data          — JSONB blob of the generated fictional dataset

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS sandbox_mode         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sandbox_activated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sandbox_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sandbox_tier          TEXT,
  ADD COLUMN IF NOT EXISTS sandbox_data          JSONB;

-- Constraint: sandbox_tier must be one of the allowed values when set
ALTER TABLE user_settings
  ADD CONSTRAINT chk_sandbox_tier
  CHECK (sandbox_tier IS NULL OR sandbox_tier IN ('building', 'established', 'high_producer'));

COMMENT ON COLUMN user_settings.sandbox_mode IS 'Whether the user is currently viewing sandbox (fictional) data';
COMMENT ON COLUMN user_settings.sandbox_activated_at IS 'Timestamp of first sandbox activation — starts the 90-day window';
COMMENT ON COLUMN user_settings.sandbox_expires_at IS 'When sandbox transitions from interactive to read-only archive';
COMMENT ON COLUMN user_settings.sandbox_tier IS 'Production tier selected at activation: building, established, or high_producer';
COMMENT ON COLUMN user_settings.sandbox_data IS 'JSONB blob of the generated fictional agent dataset (transactions, pipeline, expenses, history, settings overrides)';
