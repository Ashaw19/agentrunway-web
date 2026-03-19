-- AI Voice Profile: structured personality quiz results + business identity
-- communication_profile: { completed, answers: {q1:[],q2:[],...}, derived: { voice_traits, humor_level, directness, archetype, sign_off_style, avoids } }
-- business_identity: { completed, specialty, market_type, business_model, lead_sources, years_experience, avg_price_range }
-- agent_goals: { completed, primary_goal, secondary_goals, signature_phrases, hard_nogos, suppressed_topics }
-- ai_profile_prompt_dismissed_at: tracks weekly floating prompt dismissal

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS communication_profile jsonb,
  ADD COLUMN IF NOT EXISTS business_identity jsonb,
  ADD COLUMN IF NOT EXISTS agent_goals jsonb,
  ADD COLUMN IF NOT EXISTS ai_profile_prompt_dismissed_at timestamptz;
