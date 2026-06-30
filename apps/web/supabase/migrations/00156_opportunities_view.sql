-- Migration 00156 — opportunities_v unified read view
--
-- Single canonical read surface for pre-transactional opportunities.
-- UNIONs the three sources with normalized columns. Used by the new
-- opportunity-conversion-engine for KPI computation.
--
-- security_invoker=true so RLS of the calling user applies (per
-- migration 00128 convention).

CREATE OR REPLACE VIEW opportunities_v
WITH (security_invoker = true) AS

SELECT
  la.id,
  la.user_id,
  'listing_appointment'::text                                AS opportunity_type,
  COALESCE(la.property_address, '(no address)')              AS title,
  la.client_id,
  la.appointment_date                                        AS opportunity_date,
  la.expected_close_date,
  la.estimated_list_price                                    AS estimated_price,
  COALESCE(la.estimated_commission_pct, 0.025)               AS estimated_commission_pct,
  la.close_odds_pct,
  CASE la.status
    WHEN 'sold'      THEN 'converted'
    WHEN 'expired'   THEN 'lost'
    WHEN 'withdrawn' THEN 'lost'
    WHEN 'lost'      THEN 'lost'
    ELSE                  'open'
  END                                                        AS status,
  la.lost_reason,
  la.converted_to_pipeline_deal_id,
  NULL::uuid                                                 AS converted_to_listing_appointment_id,
  la.notes,
  la.created_at,
  la.updated_at
FROM listing_appointments la

UNION ALL

SELECT
  pd.id,
  pd.user_id,
  'buyer_prospect'::text                                     AS opportunity_type,
  COALESCE(NULLIF(pd.client_name,''), pd.address, '(unnamed)') AS title,
  pd.client_id,
  pd.created_at::date                                        AS opportunity_date,
  pd.expected_close_date,
  pd.estimated_price,
  pd.estimated_commission_pct,
  pd.probability_override                                    AS close_odds_pct,
  CASE pd.stage
    WHEN 'lead'        THEN 'open'
    WHEN 'showing'     THEN 'open'
    WHEN 'offer'       THEN 'converted'
    WHEN 'conditional' THEN 'converted'
    WHEN 'firm'        THEN 'converted'
    WHEN 'closed'      THEN 'converted'
    WHEN 'lost'        THEN 'lost'
  END                                                        AS status,
  pd.lost_reason,
  NULL::uuid                                                 AS converted_to_pipeline_deal_id,
  NULL::uuid                                                 AS converted_to_listing_appointment_id,
  pd.notes,
  pd.created_at,
  pd.updated_at
FROM pipeline_deals pd
WHERE pd.side = 'buyer'

UNION ALL

SELECT
  ro.id,
  ro.user_id,
  'referral'::text                                           AS opportunity_type,
  ro.referred_person_name                                    AS title,
  ro.client_id,
  ro.referral_date                                           AS opportunity_date,
  ro.expected_close_date,
  ro.estimated_price,
  COALESCE(ro.estimated_commission_pct, 0.025)               AS estimated_commission_pct,
  ro.close_odds_pct,
  ro.status,
  ro.lost_reason,
  ro.converted_to_pipeline_deal_id,
  ro.converted_to_listing_appointment_id,
  ro.notes,
  ro.created_at,
  ro.updated_at
FROM referral_opportunities ro;

NOTIFY pgrst, 'reload schema';
