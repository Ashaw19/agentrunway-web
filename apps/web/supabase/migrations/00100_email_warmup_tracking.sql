-- Email warm-up tracking for deliverability
CREATE TABLE IF NOT EXISTS email_warmup_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail', -- gmail, microsoft, smtp
  daily_sends_today INT NOT NULL DEFAULT 0,
  daily_limit INT NOT NULL DEFAULT 5,
  warmup_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_sends INT NOT NULL DEFAULT 0,
  bounce_count INT NOT NULL DEFAULT 0,
  complaint_count INT NOT NULL DEFAULT 0,
  paused BOOLEAN NOT NULL DEFAULT false,
  pause_reason TEXT,
  last_send_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE email_warmup_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own warmup status" ON email_warmup_status
  FOR SELECT USING (auth.uid() = user_id);

-- Reset daily counts at midnight UTC via cron
-- (Application handles this — no pg_cron needed for now)
