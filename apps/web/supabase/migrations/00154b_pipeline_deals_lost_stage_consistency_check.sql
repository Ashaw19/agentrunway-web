-- Migration 00154b — CHECK + index referencing 'lost' enum value
--
-- Split from 00154 because Postgres requires ALTER TYPE ... ADD VALUE
-- to commit before the new value can be referenced in a CHECK.

ALTER TABLE pipeline_deals DROP CONSTRAINT IF EXISTS pipeline_deals_lost_reason_when_lost;
ALTER TABLE pipeline_deals
  ADD CONSTRAINT pipeline_deals_lost_reason_when_lost
    CHECK (stage <> 'lost' OR (lost_reason IS NOT NULL AND lost_at IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_pipeline_deals_buyer_opportunity
  ON pipeline_deals(user_id, stage)
  WHERE side = 'buyer' AND stage IN ('lead','showing','lost');

NOTIFY pgrst, 'reload schema';
