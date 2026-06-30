-- Migration 00155 — referral_opportunities table
--
-- Tracks referral leads as a first-class pre-transactional opportunity
-- type alongside listing_appointments and (buyer-side) pipeline_deals.
-- Referrals don't fit either existing shape — they need a referrer
-- field and a fork in the promote path (to listing_appt OR pipeline_deal).
--
-- RLS lands in the same migration per CLAUDE.md never-do.

CREATE TABLE IF NOT EXISTS referral_opportunities (
  id                                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  referred_person_name                text          NOT NULL,
  client_id                           uuid          REFERENCES clients(id) ON DELETE SET NULL,

  referrer_name                       text,
  referrer_client_id                  uuid          REFERENCES clients(id) ON DELETE SET NULL,

  referral_date                       date          NOT NULL DEFAULT CURRENT_DATE,
  referral_type                       text          NOT NULL DEFAULT 'unknown'
                                                     CHECK (referral_type IN ('seller','buyer','unknown')),

  estimated_price                     numeric(14,2),
  estimated_commission_pct            numeric(7,6)  DEFAULT 0.025000,
  close_odds_pct                      numeric(5,4)  DEFAULT 0.20
                                                     CHECK (close_odds_pct IS NULL OR (close_odds_pct >= 0 AND close_odds_pct <= 1)),
  expected_close_date                 date,

  notes                               text,

  status                              text          NOT NULL DEFAULT 'open'
                                                     CHECK (status IN ('open','converted','lost')),
  lost_reason                         text          CHECK (
                                                       lost_reason IS NULL OR lost_reason IN (
                                                         'chose_other_agent','decided_not_to_transact','price_disagreement',
                                                         'timing_deferred','out_of_area','financing_fell_through','lost_contact','other'
                                                       )
                                                     ),
  lost_at                             timestamptz,
  converted_at                        timestamptz,
  converted_to_pipeline_deal_id       uuid          REFERENCES pipeline_deals(id) ON DELETE SET NULL,
  converted_to_listing_appointment_id uuid          REFERENCES listing_appointments(id) ON DELETE SET NULL,

  created_at                          timestamptz   NOT NULL DEFAULT now(),
  updated_at                          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT referral_opps_lost_consistent
    CHECK (status <> 'lost' OR (lost_reason IS NOT NULL AND lost_at IS NOT NULL)),
  CONSTRAINT referral_opps_converted_consistent
    CHECK (status <> 'converted' OR converted_at IS NOT NULL)
);

ALTER TABLE referral_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own referral opportunities"
  ON referral_opportunities FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_referral_opps_user_id         ON referral_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_opps_status          ON referral_opportunities(user_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_opps_referrer_client ON referral_opportunities(referrer_client_id) WHERE referrer_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_opps_client          ON referral_opportunities(client_id)          WHERE client_id          IS NOT NULL;

NOTIFY pgrst, 'reload schema';
