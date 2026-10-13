-- ============================================================================
-- Migration 00174: Home Office expense category (actual home bills)
--
-- Andrew (2026-10-13): his business-use-of-home costs vary month to month, and
-- the only place for them was a fixed monthly amount in Reports → T2125. Each
-- real bill (power, internet, repairs, insurance, property tax, mortgage
-- interest, rent, condo fees) can now be logged like any other expense, under
-- a "Home Office" category. The app applies the home business-use share
-- (user_settings.home_office_business_use_pct) to the T2125 estimate and to
-- the HST helper's ITCs.
--
-- seed_home_office_expenses(user): idempotent (ON CONFLICT DO NOTHING).
--   - Called by seed_default_expenses for new sign-ups.
--   - Run once here for every account that already has categories.
--   - SECURITY DEFINER with EXECUTE revoked from clients: it takes a user id.
-- seed_default_expenses: prod's body (checked 2026-10-13) plus the one call.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_home_office_expenses(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
BEGIN
  INSERT INTO expense_categories (user_id, key, title, sort_order)
  VALUES (p_user_id, 'home_office', 'Home Office', 10)
  ON CONFLICT (user_id, key) DO NOTHING;

  SELECT id INTO v_cat_id
    FROM expense_categories
   WHERE user_id = p_user_id AND key = 'home_office';

  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'home_utilities',         'Electricity, Heat & Water', 0),
    (p_user_id, v_cat_id, 'home_internet',          'Home Internet',             1),
    (p_user_id, v_cat_id, 'home_insurance',         'Home Insurance',            2),
    (p_user_id, v_cat_id, 'home_maintenance',       'Repairs & Maintenance',     3),
    (p_user_id, v_cat_id, 'home_property_tax',      'Property Tax',              4),
    (p_user_id, v_cat_id, 'home_mortgage_interest', 'Mortgage Interest',         5),
    (p_user_id, v_cat_id, 'home_rent',              'Rent',                      6),
    (p_user_id, v_cat_id, 'home_condo_fees',        'Condo Fees',                7)
  ON CONFLICT (user_id, key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_home_office_expenses(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seed_default_expenses(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END;
$$;

-- Every account that already has expense categories gets the new one.
SELECT public.seed_home_office_expenses(u.user_id)
  FROM (SELECT DISTINCT user_id FROM public.expense_categories) u;
