-- Migration 00157 — Opportunity promote / advance / lose RPC functions
--
-- These RPCs replace what an earlier draft put in an edge function with
-- two PostgREST calls + manual compensation. A single plpgsql function
-- body is ONE transaction, so promote (insert + update) is truly atomic:
-- either both writes land or neither does. No orphan rows, no compensation.
--
-- Convention follows fn_org_* / fn_auto_transition_* (migrations 00060,
-- 00096): SECURITY DEFINER with an explicit auth.uid() ownership guard +
-- SET search_path = public. DEFINER bypasses RLS, so every statement is
-- gated on user_id = auth.uid(). Both the Pipeline UI and the Dispatcher
-- MCP tools call these via supabase.rpc() — single source of write truth.

-- ── 1. Promote a listing appointment → seller-side pipeline deal ─────────────
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
    v_la.estimated_list_price          -- snapshot for accuracy tracking
  ) RETURNING id INTO v_deal_id;

  UPDATE listing_appointments
  SET status = 'active',
      converted_to_pipeline_deal_id = v_deal_id,
      updated_at = now()
  WHERE id = p_listing_id;

  RETURN v_deal_id;
END;
$$;

-- ── 2. Promote a referral → listing appointment OR buyer pipeline deal ───────
CREATE OR REPLACE FUNCTION fn_promote_referral(
  p_referral_id uuid,
  p_target      text,                 -- 'listing_appointment' | 'buyer_prospect'
  p_buyer_stage text DEFAULT 'lead'   -- 'lead' | 'showing' (buyer_prospect only)
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
    WHERE id = p_referral_id;

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
    WHERE id = p_referral_id;

    RETURN jsonb_build_object('target', 'buyer_prospect', 'pipeline_deal_id', v_deal_id);
  END IF;
END;
$$;

-- ── 3. Advance a buyer prospect's stage (offer/conditional/firm) ─────────────
CREATE OR REPLACE FUNCTION fn_advance_buyer_stage(p_deal_id uuid, p_stage text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_stage NOT IN ('offer','conditional','firm') THEN
    RAISE EXCEPTION 'Invalid stage: must be offer, conditional, or firm';
  END IF;

  UPDATE pipeline_deals
  SET stage = p_stage::pipeline_stage, updated_at = now()
  WHERE id = p_deal_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pipeline deal not found or not owned by caller';
  END IF;
END;
$$;

-- ── 4. Mark an opportunity lost (any of the three sources) ───────────────────
CREATE OR REPLACE FUNCTION fn_mark_opportunity_lost(
  p_id          uuid,
  p_source      text,           -- 'listing_appointment' | 'buyer_prospect' | 'referral'
  p_lost_reason text,
  p_notes       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_reasons text[] := ARRAY[
    'chose_other_agent','decided_not_to_transact','price_disagreement',
    'timing_deferred','out_of_area','financing_fell_through','lost_contact','other'
  ];
  v_rows int;
BEGIN
  IF p_source NOT IN ('listing_appointment','buyer_prospect','referral') THEN
    RAISE EXCEPTION 'Invalid source';
  END IF;
  IF NOT (p_lost_reason = ANY (v_valid_reasons)) THEN
    RAISE EXCEPTION 'Invalid lost_reason: %', p_lost_reason;
  END IF;
  IF p_lost_reason = 'other' AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RAISE EXCEPTION 'notes are required when lost_reason is other';
  END IF;

  IF p_source = 'listing_appointment' THEN
    UPDATE listing_appointments
    SET status = 'lost',
        lost_reason = p_lost_reason,
        notes = CASE WHEN p_notes IS NOT NULL AND btrim(p_notes) <> ''
                     THEN COALESCE(notes || E'\n', '') || p_notes ELSE notes END,
        updated_at = now()
    WHERE id = p_id AND user_id = auth.uid();
    GET DIAGNOSTICS v_rows = ROW_COUNT;

  ELSIF p_source = 'buyer_prospect' THEN
    UPDATE pipeline_deals
    SET stage = 'lost',
        lost_reason = p_lost_reason,
        lost_at = now(),
        notes = CASE WHEN p_notes IS NOT NULL AND btrim(p_notes) <> ''
                     THEN COALESCE(notes || E'\n', '') || p_notes ELSE notes END,
        updated_at = now()
    WHERE id = p_id AND user_id = auth.uid();
    GET DIAGNOSTICS v_rows = ROW_COUNT;

  ELSE  -- referral
    UPDATE referral_opportunities
    SET status = 'lost',
        lost_reason = p_lost_reason,
        lost_at = now(),
        notes = CASE WHEN p_notes IS NOT NULL AND btrim(p_notes) <> ''
                     THEN COALESCE(notes || E'\n', '') || p_notes ELSE notes END,
        updated_at = now()
    WHERE id = p_id AND user_id = auth.uid();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Opportunity not found or not owned by caller';
  END IF;
END;
$$;

-- Ownership + grants (match fn_org_* / fn_auto_transition_* convention)
ALTER FUNCTION fn_promote_listing_appointment(uuid)            OWNER TO postgres;
ALTER FUNCTION fn_promote_referral(uuid, text, text)           OWNER TO postgres;
ALTER FUNCTION fn_advance_buyer_stage(uuid, text)              OWNER TO postgres;
ALTER FUNCTION fn_mark_opportunity_lost(uuid, text, text, text) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION fn_promote_listing_appointment(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION fn_promote_referral(uuid, text, text)            TO authenticated;
GRANT EXECUTE ON FUNCTION fn_advance_buyer_stage(uuid, text)               TO authenticated;
GRANT EXECUTE ON FUNCTION fn_mark_opportunity_lost(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
