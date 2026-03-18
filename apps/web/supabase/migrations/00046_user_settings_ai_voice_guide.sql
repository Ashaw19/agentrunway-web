-- Migration: Add ai_voice_guide column to user_settings
-- Stores the agent's personal writing style guide for AI-generated outreach drafts.
-- Injected into Flight Control prompts so messages sound like the agent personally wrote them.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ai_voice_guide text;

NOTIFY pgrst, 'reload schema';
