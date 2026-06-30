-- Migration 00153 — listing_appointments opportunity fields
--
-- Adds user-set close odds %, structured lost reason, and a promote FK
-- to pipeline_deals. Enables pre-transactional opportunity tracking on
-- the Pipeline tab.

ALTER TABLE listing_appointments
  ADD COLUMN IF NOT EXISTS close_odds_pct              numeric(5,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason                 text         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS converted_to_pipeline_deal_id uuid       REFERENCES pipeline_deals(id) ON DELETE SET NULL DEFAULT NULL;

ALTER TABLE listing_appointments
  ADD CONSTRAINT listing_appointments_close_odds_range
    CHECK (close_odds_pct IS NULL OR (close_odds_pct >= 0 AND close_odds_pct <= 1));

ALTER TABLE listing_appointments
  ADD CONSTRAINT listing_appointments_lost_reason_when_lost
    CHECK (status <> 'lost' OR lost_reason IS NOT NULL);

ALTER TABLE listing_appointments
  ADD CONSTRAINT listing_appointments_lost_reason_values
    CHECK (
      lost_reason IS NULL OR lost_reason IN (
        'chose_other_agent','decided_not_to_transact','price_disagreement',
        'timing_deferred','out_of_area','financing_fell_through','lost_contact','other'
      )
    );

CREATE INDEX IF NOT EXISTS idx_listing_appts_status_open
  ON listing_appointments(user_id, status)
  WHERE status IN ('scheduled','active');

NOTIFY pgrst, 'reload schema';
