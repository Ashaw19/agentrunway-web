-- Chat Analytics: Track AI assistant interactions for self-improvement
-- Records topic classifications, diagnostic availability, and resolution signals
-- so the daily knowledge audit can identify gaps and improve playbooks.

CREATE TABLE IF NOT EXISTS chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  -- What the user asked (truncated, no PII)
  message_preview TEXT NOT NULL,          -- First 120 chars of user message (enough for topic analysis, not enough for PII)
  -- Classification results
  primary_topic TEXT NOT NULL DEFAULT 'general',
  secondary_topic TEXT,
  classifier_score INTEGER NOT NULL DEFAULT 0,
  -- Did we have relevant data?
  had_diagnostics BOOLEAN NOT NULL DEFAULT false,
  had_playbook BOOLEAN NOT NULL DEFAULT false,
  -- Resolution signals
  follow_up_count INTEGER NOT NULL DEFAULT 0,   -- How many follow-up messages in same topic (high = unresolved)
  session_message_count INTEGER NOT NULL DEFAULT 1,
  -- Context
  current_page TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for daily gap analysis queries
CREATE INDEX idx_chat_analytics_created ON chat_analytics (created_at DESC);
CREATE INDEX idx_chat_analytics_topic ON chat_analytics (primary_topic, created_at DESC);

-- RLS: Users can only see their own analytics (but cron/service role can read all)
ALTER TABLE chat_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own chat analytics"
  ON chat_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can read all chat analytics"
  ON chat_analytics FOR SELECT
  USING (auth.role() = 'service_role');

-- Audit log: Daily summary from the AI knowledge audit cron
CREATE TABLE IF NOT EXISTS ai_knowledge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date DATE NOT NULL UNIQUE,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  resolution_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  classifier_coverage NUMERIC(5,1) NOT NULL DEFAULT 0,
  diagnostic_coverage NUMERIC(5,1) NOT NULL DEFAULT 0,
  trending_topics JSONB DEFAULT '[]',
  unresolved_previews JSONB DEFAULT '[]',
  classifier_gaps JSONB DEFAULT '[]',
  topic_quality JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_knowledge_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage audit logs"
  ON ai_knowledge_audit_log FOR ALL
  USING (auth.role() = 'service_role');

-- Aggregation view for the daily audit (no PII exposed)
CREATE OR REPLACE VIEW chat_analytics_daily_summary AS
SELECT
  date_trunc('day', created_at)::DATE AS day,
  primary_topic,
  COUNT(*) AS question_count,
  COUNT(*) FILTER (WHERE NOT had_playbook) AS no_playbook_count,
  COUNT(*) FILTER (WHERE NOT had_diagnostics) AS no_diagnostics_count,
  COUNT(*) FILTER (WHERE follow_up_count >= 3) AS likely_unresolved_count,
  AVG(classifier_score)::NUMERIC(5,1) AS avg_classifier_score,
  COUNT(DISTINCT user_id) AS unique_users
FROM chat_analytics
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;
