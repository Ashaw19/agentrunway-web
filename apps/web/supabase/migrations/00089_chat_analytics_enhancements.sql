-- Enhancement #2: Thumbs up/down feedback on AI responses
-- Enhancement #4: Escalation tracking
-- Adds feedback and escalation columns to chat_analytics

-- Feedback: 'positive', 'negative', or null (no feedback given)
ALTER TABLE chat_analytics
  ADD COLUMN IF NOT EXISTS feedback TEXT DEFAULT NULL
    CHECK (feedback IN ('positive', 'negative'));

-- Escalation flag: true when 4+ follow-ups detected on the same topic
ALTER TABLE chat_analytics
  ADD COLUMN IF NOT EXISTS was_escalation BOOLEAN DEFAULT false;

-- Index for feedback analysis in daily audit
CREATE INDEX IF NOT EXISTS idx_chat_analytics_feedback
  ON chat_analytics (feedback)
  WHERE feedback IS NOT NULL;

-- Index for escalation analysis
CREATE INDEX IF NOT EXISTS idx_chat_analytics_escalation
  ON chat_analytics (was_escalation)
  WHERE was_escalation = true;

-- Update the daily summary view to include feedback and escalation counts
DROP VIEW IF EXISTS chat_analytics_daily_summary;
CREATE VIEW chat_analytics_daily_summary AS
SELECT
  date_trunc('day', created_at)                     AS day,
  COUNT(*)                                          AS total_messages,
  COUNT(DISTINCT user_id)                           AS unique_users,
  COUNT(*) FILTER (WHERE had_playbook)              AS playbook_hits,
  COUNT(*) FILTER (WHERE had_diagnostics)           AS diagnostic_hits,
  COUNT(*) FILTER (WHERE follow_up_count >= 3)      AS high_followup_sessions,
  COUNT(*) FILTER (WHERE was_escalation)            AS escalation_count,
  COUNT(*) FILTER (WHERE feedback = 'positive')     AS thumbs_up,
  COUNT(*) FILTER (WHERE feedback = 'negative')     AS thumbs_down,
  ROUND(
    COUNT(*) FILTER (WHERE feedback = 'positive')::NUMERIC
    / NULLIF(COUNT(*) FILTER (WHERE feedback IS NOT NULL), 0)::NUMERIC,
    3
  )                                                 AS positive_feedback_rate
FROM chat_analytics
GROUP BY date_trunc('day', created_at)
ORDER BY day DESC;
