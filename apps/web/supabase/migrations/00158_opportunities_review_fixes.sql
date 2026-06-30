-- Migration 00158 — review fixes for the pre-transactional Opportunities feature
--
-- Two fixes surfaced by the adversarial review of migrations 00153–00157:
--
-- (1) opportunities_v: a listing appointment that the agent WINS (status
--     'active' — listing agreement signed, or promoted to a pipeline deal)
--     was mapped to 'open', so the headline "Appointment -> Contract
--     conversion %" KPI never registered the very event it is named for, and
--     a won listing kept showing in the open Opportunities section. Map
--     'active' -> 'converted'. ('scheduled' stays 'open'.)
--
-- (2) fn_promote_listing_appointment / fn_promote_referral: the mutating
--     UPDATE matched on id only (ownership was proven by the upstream
--     SELECT). Re-assert user_id = auth.uid() on the UPDATE so every write
--     statement is independently access-controlled, matching
--     fn_advance_buyer_stage / fn_mark_opportunity_lost.

-- ── (1) View: map won listings to 'converted' ────────────────────────────────
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
    WHEN 'active'    THEN 'converted'   -- listing won (agreement signed / promoted)
    WHEN 'expired'   THEN 'lost'
    WHEN 'withdrawn' THEN 'lost'
    WHEN 'lost'      THEN 'lost'
    ELSE                  'open'        -- 'scheduled'
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

-- ── (2) Harden promote RPCs: ownership guard on the UPDATE ───────────────────
CREATE OR REPLACE FUNCTION fn_promote_listing_appointment(p_listing_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_la      listing_appointments%ROWTYPE;
  v_deal_id uuid;
BEGIN
  SELECT * INTO v_la
  FROM listing_appointments
  WHERE id = p_listing_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing appointment not found or not owned by caller';
  END IF;
  IF v_la.converted_to_pipeline_deal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Listing appointment already promoted';
  END IF;

  INSERT INTO pipeline_deals (
    user_id, address, estimated_price, estimated_commission_pct, side, stage,
    expected_close_date, client_name, notes, client_id, original_estimated_price
  ) VALUES (
    v_la.user_id,
    COALESCE(v_la.property_address, ''),
    COALESCE(v_la.estimated_list_price, 0),
    COALESCE(v_la.estimated_commission_pct, 0.025),
    'seller',
    'showing',
    v_la.expected_close_date,
    '',
    COALESCE(v_la.notes, ''),
    v_la.client_id,
    v_la.estimated_list_price
  ) RETURNING id INTO v_deal_id;

  UPDATE listing_appointments
  SET status = 'active',
      converted_to_pipeline_deal_id = v_deal_id,
      updated_at = now()
  WHERE id = p_listing_id AND user_id = auth.uid();

  RETURN v_deal_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_promote_referral(
  p_referral_id uuid,
  p_target      text,
  p_buyer_stage text DEFAULT 'lead'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref     referral_opportunities%ROWTYPE;
  v_deal_id uuid;
  v_la_id   uuid;
BEGIN
  IF p_target NOT IN ('listing_appointment','buyer_prospect') THEN
    RAISE EXCEPTION 'Invalid target: must be listing_appointment or buyer_prospect';
  END IF;
  IF p_buyer_stage NOT IN ('lead','showing') THEN
    RAISE EXCEPTION 'Invalid buyer stage: must be lead or showing';
  END IF;

  SELECT * INTO v_ref
  FROM referral_opportunities
  WHERE id = p_referral_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral not found or not owned by caller';
  END IF;
  IF v_ref.status <> 'open' THEN
    RAISE EXCEPTION 'Only open referrals can be promoted';
  END IF;

  IF p_target = 'listing_appointment' THEN
    INSERT INTO listing_appointments (
      user_id, client_id, appointment_date, property_address,
      estimated_list_price, estimated_commission_pct, expected_close_date,
      close_odds_pct, status, notes
    ) VALUES (
      v_ref.user_id, v_ref.client_id, CURRENT_DATE, NULL,
      v_ref.estimated_price, v_ref.estimated_commission_pct, v_ref.expected_close_date,
      v_ref.close_odds_pct, 'scheduled', COALESCE(v_ref.notes, '')
    ) RETURNING id INTO v_la_id;

    UPDATE referral_opportunities
    SET status = 'converted',
        converted_at = now(),
        converted_to_listing_appointment_id = v_la_id,
        updated_at = now()
    WHERE id = p_referral_id AND user_id = auth.uid();

    RETURN jsonb_build_object('target', 'listing_appointment', 'listing_appointment_id', v_la_id);
  ELSE
    INSERT INTO pipeline_deals (
      user_id, address, estimated_price, estimated_commission_pct, side, stage,
      expected_close_date, client_name, notes, client_id, probability_override
    ) VALUES (
      v_ref.user_id, '', COALESCE(v_ref.estimated_price, 0),
      COALESCE(v_ref.estimated_commission_pct, 0.025),
      'buyer', p_buyer_stage::pipeline_stage, v_ref.expected_close_date,
      v_ref.referred_person_name, COALESCE(v_ref.notes, ''), v_ref.client_id,
      v_ref.close_odds_pct
    ) RETURNING id INTO v_deal_id;

    UPDATE referral_opportunities
    SET status = 'converted',
        converted_at = now(),
        converted_to_pipeline_deal_id = v_deal_id,
        updated_at = now()
    WHERE id = p_referral_id AND user_id = auth.uid();

    RETURN jsonb_build_object('target', 'buyer_prospect', 'pipeline_deal_id', v_deal_id);
  END IF;
END;
$$;

ALTER FUNCTION fn_promote_listing_appointment(uuid)            OWNER TO postgres;
ALTER FUNCTION fn_promote_referral(uuid, text, text)           OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
