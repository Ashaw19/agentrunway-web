-- Migration 00154 — pipeline_deals: add 'lost' stage + lost_reason/lost_at columns
--
-- Adds 'lost' to the pipeline_stage enum so buyer prospects can be
-- explicitly marked lost (parity with listing_appointments).
--
-- Postgres requires ALTER TYPE ... ADD VALUE to commit before the new
-- value can be referenced in a CHECK constraint. The CHECK that requires
-- (lost_reason, lost_at) NOT NULL when stage='lost' therefore lives in
-- the follow-up migration 00154b.

ALTER TYPE pipeline_stage ADD VALUE IF NOT EXISTS 'lost';

ALTER TABLE pipeline_deals
  ADD COLUMN IF NOT EXISTS lost_reason text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_at     timestamptz DEFAULT NULL;

ALTER TABLE pipeline_deals DROP CONSTRAINT IF EXISTS pipeline_deals_lost_reason_values;
ALTER TABLE pipeline_deals
  ADD CONSTRAINT pipeline_deals_lost_reason_values
    CHECK (
      lost_reason IS NULL OR lost_reason IN (
        'chose_other_agent','decided_not_to_transact','price_disagreement',
        'timing_deferred','out_of_area','financing_fell_through','lost_contact','other'
      )
    );

NOTIFY pgrst, 'reload schema';
