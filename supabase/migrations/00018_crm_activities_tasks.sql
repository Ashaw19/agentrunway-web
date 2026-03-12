-- Migration 00018: CRM — contact activities log + follow-up tasks
-- Adds lightweight CRM functionality to the Clients page:
--   contact_activities: log of every interaction (call, email, showing, etc.)
--   contact_tasks:      scheduled follow-ups with due dates and completion tracking

-- ── 1. Contact Activities ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_activities (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     UUID         NOT NULL REFERENCES clients(id)    ON DELETE CASCADE,

  -- Activity type: call | email | text | showing | meeting | offer | note
  type          TEXT         NOT NULL DEFAULT 'note',
  description   TEXT         NOT NULL DEFAULT '',
  activity_date TIMESTAMPTZ  NOT NULL DEFAULT now(),

  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contact activities"
  ON contact_activities FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS contact_activities_client_idx
  ON contact_activities (user_id, client_id, activity_date DESC);

-- ── 2. Contact Tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_tasks (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- client_id is nullable so tasks can exist without a specific client (general tasks)
  client_id    UUID         REFERENCES clients(id) ON DELETE SET NULL,

  title        TEXT         NOT NULL,
  due_date     DATE         NOT NULL,
  priority     TEXT         NOT NULL DEFAULT 'normal', -- low | normal | high
  notes        TEXT,

  completed_at TIMESTAMPTZ,          -- NULL = not done; set to now() when checked off

  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER contact_tasks_updated_at
  BEFORE UPDATE ON contact_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE contact_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contact tasks"
  ON contact_tasks FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for dashboard "tasks due soon" query (user + due_date + not completed)
CREATE INDEX IF NOT EXISTS contact_tasks_due_idx
  ON contact_tasks (user_id, due_date)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS contact_tasks_client_idx
  ON contact_tasks (user_id, client_id);

-- ── 3. Add birthday + key date fields to clients ─────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS birthdate        DATE,
  ADD COLUMN IF NOT EXISTS tags             TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lead_source      TEXT,   -- SOI | Referral | Zillow | Open House | Social | Other
  ADD COLUMN IF NOT EXISTS last_contact_at  TIMESTAMPTZ,  -- updated automatically
  ADD COLUMN IF NOT EXISTS notes            TEXT;

-- Function to keep clients.last_contact_at in sync when an activity is inserted
CREATE OR REPLACE FUNCTION update_client_last_contact()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE clients
     SET last_contact_at = NEW.activity_date,
         updated_at      = now()
   WHERE id = NEW.client_id
     AND (last_contact_at IS NULL OR NEW.activity_date > last_contact_at);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER contact_activities_update_last_contact
  AFTER INSERT ON contact_activities
  FOR EACH ROW EXECUTE FUNCTION update_client_last_contact();
