-- Migration 00098: Precomputed Insights table and Engagement Scoring columns
-- Creates infrastructure for nightly AI batch insights and client engagement scoring

-- 1. Precomputed Insights table
CREATE TABLE IF NOT EXISTS precomputed_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, insight_type)
);

-- RLS
ALTER TABLE precomputed_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own insights" ON precomputed_insights
  FOR SELECT USING (auth.uid() = user_id);
-- Service role handles writes (cron job)

CREATE INDEX idx_precomputed_insights_user_type ON precomputed_insights(user_id, insight_type);
CREATE INDEX idx_precomputed_insights_expires ON precomputed_insights(expires_at);

COMMENT ON TABLE precomputed_insights IS 'Pre-computed AI insights generated nightly via Batch API. Served instantly on dashboard load.';

-- 2. Engagement scoring columns on clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS engagement_score NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS engagement_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clients_engagement ON clients(user_id, engagement_score DESC);

COMMENT ON COLUMN clients.engagement_score IS 'Weighted engagement score with time decay. Updated daily via cron.';
