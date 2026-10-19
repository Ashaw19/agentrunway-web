-- ============================================================================
-- Migration 00186: Business Parking and Supplementary Business Insurance
--
-- CRA ("Motor vehicle expenses (not including CCA)", completing Form T2125,
-- page dated 2026-08-31): "you can deduct the full amount of parking fees
-- related to your business activities and supplementary business insurance
-- for your motor vehicle or passenger vehicle." Until now parking was filed
-- under Service & Repairs and every Vehicle item took the vehicle business-use
-- share, so both were under-counted. Two Vehicle items now carry them; the
-- engines put them on T2125 line 9281 in full (VEHICLE_FULL_DEDUCTION_KEYS in
-- packages/core/engines/t2125-engine.ts).
--
-- ADDITIVE ONLY. No receipt or recurring expense is re-filed: on 2026-10-19
-- production had no receipt under Service & Repairs and no recurring expense
-- named for parking (counts only), so nothing was filed the old way.
--
-- seed_vehicle_full_deduction_items(user): idempotent (ON CONFLICT DO
--   NOTHING), into the account's existing Vehicle category. Called by
--   seed_default_expenses for new sign-ups and run once here for every
--   account that has one. SECURITY DEFINER with EXECUTE for service_role only:
--   it takes a user id.
-- seed_default_expenses: prod's body (read 2026-10-19) plus the one call.
-- fn_confirm_statement_lines: 00185's body with the two keys added to its
--   list (statement-import-keys.test.ts holds it to RECEIPT_CATEGORY_KEYS and
--   checks nothing else changed).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_vehicle_full_deduction_items(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
BEGIN
  SELECT id INTO v_cat_id
    FROM expense_categories
   WHERE user_id = p_user_id AND key = 'vehicle';
  IF v_cat_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'vehicle_parking',            'Business Parking',                 4),
    (p_user_id, v_cat_id, 'vehicle_business_insurance', 'Supplementary Business Insurance', 5)
  ON CONFLICT (user_id, key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_vehicle_full_deduction_items(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_vehicle_full_deduction_items(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.seed_default_expenses(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cat_id UUID;
BEGIN
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'vehicle', 'Vehicle', 0) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'vehicle_payment', 'Payment', 0),
    (p_user_id, v_cat_id, 'vehicle_insurance', 'Insurance', 1),
    (p_user_id, v_cat_id, 'vehicle_fuel', 'Fuel', 2),
    (p_user_id, v_cat_id, 'vehicle_service', 'Service', 3);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'marketing', 'Marketing', 1) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'marketing_ads', 'Ads', 0),
    (p_user_id, v_cat_id, 'marketing_photography', 'Photography', 1),
    (p_user_id, v_cat_id, 'marketing_print', 'Print', 2),
    (p_user_id, v_cat_id, 'marketing_gifts', 'Gifts', 3);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'office_tech', 'Office & Tech', 2) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'office_supplies', 'Supplies', 0),
    (p_user_id, v_cat_id, 'office_software', 'Software', 1),
    (p_user_id, v_cat_id, 'office_phone', 'Phone', 2),
    (p_user_id, v_cat_id, 'office_hardware', 'Hardware', 3);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'professional', 'Professional Fees', 3) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'prof_board_mls', 'Board / MLS', 0),
    (p_user_id, v_cat_id, 'prof_licensing', 'Licensing', 1),
    (p_user_id, v_cat_id, 'prof_eo', 'E&O Insurance', 2),
    (p_user_id, v_cat_id, 'prof_accounting', 'Accounting', 3);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'education', 'Education', 4) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'edu_courses', 'Courses', 0),
    (p_user_id, v_cat_id, 'edu_conferences', 'Conferences', 1),
    (p_user_id, v_cat_id, 'edu_books', 'Books', 2);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'meals', 'Meals', 5) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'meals_client', 'Client Meals', 0),
    (p_user_id, v_cat_id, 'meals_team', 'Team Meals', 1);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'entertainment', 'Entertainment', 6) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'ent_client', 'Client Events', 0),
    (p_user_id, v_cat_id, 'ent_events', 'Events', 1);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'other', 'Other', 7) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'other_misc', 'Miscellaneous', 0);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'payroll', 'Payroll & HR', 8) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'payroll_wages', 'Admin wages', 0),
    (p_user_id, v_cat_id, 'payroll_employer_cpp', 'Employer CPP', 1),
    (p_user_id, v_cat_id, 'payroll_employer_ei', 'Employer EI', 2),
    (p_user_id, v_cat_id, 'payroll_wsib', 'WSIB / WCB', 3),
    (p_user_id, v_cat_id, 'payroll_benefits', 'Group benefits', 4),
    (p_user_id, v_cat_id, 'payroll_service_fees', 'Payroll service fees', 5);

  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'corp_admin', 'Corporate Admin', 9) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'corp_accounting', 'Corporate accounting', 0),
    (p_user_id, v_cat_id, 'corp_legal', 'Legal & corporate', 1),
    (p_user_id, v_cat_id, 'corp_annual_filing', 'Annual registry filing', 2),
    (p_user_id, v_cat_id, 'corp_bank_fees', 'Business banking fees', 3),
    (p_user_id, v_cat_id, 'corp_insurance_gl', 'Commercial liability', 4),
    (p_user_id, v_cat_id, 'corp_insurance_do', 'D&O insurance', 5);

  -- Home Office (00174)
  PERFORM public.seed_home_office_expenses(p_user_id);
  -- Business Parking and Supplementary Business Insurance (00186)
  PERFORM public.seed_vehicle_full_deduction_items(p_user_id);
END;
$function$;

-- Every account that already has a Vehicle category.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT user_id FROM public.expense_categories WHERE key = 'vehicle' LOOP
    PERFORM public.seed_vehicle_full_deduction_items(r.user_id);
  END LOOP;
END;
$$;

-- ── Statement import accepts the two keys ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_confirm_statement_lines(p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_item       jsonb;
  v_line       statement_lines%ROWTYPE;
  v_label      text;
  v_category   text;
  v_receipt_id uuid;
  v_created    jsonb := '[]'::jsonb;
  v_linked     jsonb := '[]'::jsonb;
  v_recurring  jsonb := '[]'::jsonb;
  v_refused    jsonb := '[]'::jsonb;
  v_keys       text[] := ARRAY[
    'vehicle_fuel', 'vehicle_service', 'vehicle_insurance', 'vehicle_payment',
    'vehicle_parking', 'vehicle_business_insurance',
    'marketing_ads', 'marketing_photography', 'marketing_print', 'marketing_gifts',
    'office_supplies', 'office_software', 'office_phone', 'office_hardware',
    'prof_board_mls', 'prof_licensing', 'prof_eo', 'prof_accounting',
    'edu_courses', 'edu_conferences', 'edu_books',
    'meals_client', 'meals_team', 'ent_client', 'ent_events',
    'home_utilities', 'home_internet', 'home_insurance', 'home_maintenance',
    'home_property_tax', 'home_mortgage_interest', 'home_rent', 'home_condo_fees',
    'other_misc'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) > 2000 THEN
    RAISE EXCEPTION 'too many lines at once (max 2000)' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_receipt_id := NULL;

    IF coalesce(v_item->>'id', '') !~ '^[0-9a-fA-F-]{36}$' THEN
      v_refused := v_refused || jsonb_build_object('id', v_item->>'id', 'reason', 'not_found');
      CONTINUE;
    END IF;

    SELECT * INTO v_line
      FROM statement_lines
     WHERE id = (v_item->>'id')::uuid AND user_id = v_uid
     FOR UPDATE;
    IF NOT FOUND THEN
      v_refused := v_refused || jsonb_build_object('id', v_item->>'id', 'reason', 'not_found');
      CONTINUE;
    END IF;
    IF v_line.status <> 'pending' THEN
      v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'not_pending');
      CONTINUE;
    END IF;
    IF v_line.direction <> 'out' THEN
      v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'not_a_charge');
      CONTINUE;
    END IF;

    IF NOT v_line.duplicate_dismissed THEN
      IF v_line.match_receipt_id IS NOT NULL THEN
        UPDATE receipt_expenses
           SET statement_line_id = v_line.id
         WHERE id = v_line.match_receipt_id
           AND user_id = v_uid
           AND (statement_line_id IS NULL OR statement_line_id = v_line.id)
        RETURNING id INTO v_receipt_id;
        IF v_receipt_id IS NULL THEN
          -- The receipt is gone, or another line holds it now.
          v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'needs_decision');
          CONTINUE;
        END IF;
        UPDATE statement_lines
           SET status = 'confirmed', skip_reason = NULL, expense_deleted_at = NULL, confirmed_at = now()
         WHERE id = v_line.id;
        v_linked := v_linked || jsonb_build_object('id', v_line.id, 'receipt_id', v_receipt_id);
        CONTINUE;
      END IF;

      IF v_line.recurring_expense_id IS NOT NULL THEN
        UPDATE statement_lines
           SET status = 'confirmed', skip_reason = NULL, expense_deleted_at = NULL, confirmed_at = now()
         WHERE id = v_line.id;
        v_recurring := v_recurring || jsonb_build_object('id', v_line.id, 'recurring_expense_id', v_line.recurring_expense_id);
        CONTINUE;
      END IF;

      IF v_line.hold_reason IS NOT NULL OR v_line.duplicate_candidate_count > 1 THEN
        v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'needs_decision');
        CONTINUE;
      END IF;
    END IF;

    v_category := coalesce(nullif(btrim(coalesce(v_item->>'category_key', '')), ''), v_line.category_key, v_line.suggested_category_key);
    IF v_category IS NULL THEN
      v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'needs_category');
      CONTINUE;
    END IF;
    IF NOT (v_category = ANY (v_keys)) THEN
      v_refused := v_refused || jsonb_build_object('id', v_line.id, 'reason', 'unknown_category');
      CONTINUE;
    END IF;

    SELECT st.account_label INTO v_label FROM imported_statements st WHERE st.id = v_line.statement_id;

    -- A row this line already made is reused, never doubled.
    SELECT re.id INTO v_receipt_id
      FROM receipt_expenses re
     WHERE re.user_id = v_uid AND re.statement_line_id = v_line.id;

    IF v_receipt_id IS NULL THEN
      INSERT INTO receipt_expenses (
        user_id, vendor, expense_date, total_amount, tax_amount, subtotal,
        currency, category_key, notes, source, statement_line_id
      ) VALUES (
        v_uid,
        left(coalesce(nullif(btrim(v_line.merchant), ''), btrim(v_line.description)), 120),
        v_line.line_date,
        v_line.amount,
        NULL,
        NULL,
        'CAD',
        v_category,
        CASE WHEN nullif(btrim(coalesce(v_label, '')), '') IS NULL
             THEN 'From statement import'
             ELSE 'From statement import, ' || btrim(v_label) END,
        'statement_import',
        v_line.id
      )
      RETURNING id INTO v_receipt_id;
    END IF;

    UPDATE statement_lines
       SET status = 'confirmed',
           category_key = v_category,
           skip_reason = NULL,
           expense_deleted_at = NULL,
           confirmed_at = now()
     WHERE id = v_line.id;
    v_created := v_created || jsonb_build_object('id', v_line.id, 'receipt_id', v_receipt_id);
  END LOOP;

  RETURN jsonb_build_object(
    'created',   v_created,
    'linked',    v_linked,
    'recurring', v_recurring,
    'refused',   v_refused
  );
END;
$$;
