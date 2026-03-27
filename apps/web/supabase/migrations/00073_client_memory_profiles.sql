-- ============================================================================
-- Migration 00073 — Client Memory Profiles
--
-- Hidden per-client memory system. Stores AI-computed summaries of everything
-- the agent knows about a client: goals, timeline, motivation, objections,
-- communication style, etc.
--
-- Phase 1: compute-on-demand only. No triggers, no automatic recomputation.
-- A `stale` flag allows write paths to mark profiles for lazy refresh.
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_memory_profiles (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id         uuid          NOT NULL REFERENCES clients(id)    ON DELETE CASCADE,

  -- AI-generated narrative summary of the client relationship
  memory_summary    text,

  -- Structured facts extracted by Groq (typed in app code)
  structured_facts  jsonb         NOT NULL DEFAULT '{}',

  -- Timestamps
  last_computed_at  timestamptz,
  stale             boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),

  -- One memory profile per client per user
  UNIQUE (user_id, client_id)
);

-- RLS — agents can only see their own memory profiles
ALTER TABLE client_memory_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client memory profiles"
  ON client_memory_profiles FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_memory_user_client
  ON client_memory_profiles (user_id, client_id);

CREATE INDEX IF NOT EXISTS idx_client_memory_stale
  ON client_memory_profiles (user_id)
  WHERE stale = true;

-- Auto-update updated_at
CREATE TRIGGER client_memory_profiles_updated_at
  BEFORE UPDATE ON client_memory_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE client_memory_profiles IS
  'AI-computed per-client memory profiles — goals, timeline, motivation, communication style, etc.';
