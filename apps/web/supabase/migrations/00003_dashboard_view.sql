-- ============================================================================
-- Agent Runway — Migration 00003: Dashboard view mode preference
-- Adds dashboard_view to user_settings so the user's chosen density level
-- (essentials / standard / full) persists across sessions.
-- Safe to run multiple times (IF NOT EXISTS guard).
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS dashboard_view TEXT NOT NULL DEFAULT 'standard';

COMMENT ON COLUMN user_settings.dashboard_view IS
  'Dashboard density level: essentials | standard | full. Defaults to standard.';
