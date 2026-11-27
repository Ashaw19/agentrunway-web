-- ============================================================================
-- Migration 00193: name each opportunity by its client
--
-- Andrew (2026-11-26): "Just show the client's name in the list rather than
-- the address of the subject home." The Pipeline table was changed in code
-- (#403, #404); the Opportunities cards read opportunities_v.title, which for
-- a listing appointment was the property address.
--
-- title is now the linked client's current name, falling back to what it was
-- before (listing: the address; buyer prospect: the name stored on the deal,
-- then the address). Referrals keep the referred person's name. Every other
-- column is unchanged and in the same order, so CREATE OR REPLACE works.
-- security_invoker stays on, so the clients join reads only the caller's own
-- clients under their RLS.
-- ============================================================================

CREATE OR REPLACE VIEW public.opportunities_v
WITH (security_invoker = true) AS

SELECT
  la.id,
  la.user_id,
  'listing_appointment'::text                                AS opportunity_type,
  COALESCE(NULLIF(btrim(c.name), ''), la.property_address, '(no address)') AS title,
  la.client_id,
  la.appointment_date                                        AS opportunity_date,
  la.expected_close_date,
  la.estimated_list_price                                    AS estimated_price,
  COALESCE(la.estimated_commission_pct, 0.025)               AS estimated_commission_pct,
  la.close_odds_pct,
  CASE la.status
    WHEN 'sold'      THEN 'converted'
    WHEN 'active'    THEN 'converted'
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
FROM public.listing_appointments la
LEFT JOIN public.clients c ON c.id = la.client_id

UNION ALL

SELECT
  pd.id,
  pd.user_id,
  'buyer_prospect'::text                                     AS opportunity_type,
  COALESCE(NULLIF(btrim(c.name), ''), NULLIF(pd.client_name, ''), pd.address, '(unnamed)') AS title,
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
FROM public.pipeline_deals pd
LEFT JOIN public.clients c ON c.id = pd.client_id
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
FROM public.referral_opportunities ro;
