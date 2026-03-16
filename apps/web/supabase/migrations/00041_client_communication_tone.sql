-- ============================================================================
-- Migration 00041 — Communication tone per client for AI Flight Control
-- Allows agents to set a formality level per client so AI-drafted messages
-- match the relationship style (casual for friends, formal for investors).
-- ============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS communication_tone TEXT NOT NULL DEFAULT 'friendly'
    CHECK (communication_tone IN ('casual', 'friendly', 'professional', 'formal'));

COMMENT ON COLUMN clients.communication_tone IS
  'AI message tone: casual (close friend) | friendly (warm default) | professional (business) | formal (investor/VIP)';
