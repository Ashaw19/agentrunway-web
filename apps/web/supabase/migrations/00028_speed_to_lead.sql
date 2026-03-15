-- 00028_speed_to_lead.sql
-- Track time from lead creation to first contact (Speed to Lead metric)

-- 1. Add column
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ;

-- 2. Backfill from existing contact_activities
UPDATE clients c
SET first_contacted_at = sub.first_contact
FROM (
  SELECT client_id, MIN(activity_date) AS first_contact
  FROM contact_activities
  GROUP BY client_id
) sub
WHERE c.id = sub.client_id
  AND c.first_contacted_at IS NULL;

-- 3. Trigger: auto-set first_contacted_at on first activity insert
CREATE OR REPLACE FUNCTION set_client_first_contacted()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients
  SET first_contacted_at = NEW.activity_date
  WHERE id = NEW.client_id
    AND first_contacted_at IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_activities_set_first_contacted ON contact_activities;
CREATE TRIGGER contact_activities_set_first_contacted
  AFTER INSERT ON contact_activities
  FOR EACH ROW
  EXECUTE FUNCTION set_client_first_contacted();

-- 4. Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_clients_first_contacted
  ON clients (user_id, first_contacted_at)
  WHERE first_contacted_at IS NOT NULL;
