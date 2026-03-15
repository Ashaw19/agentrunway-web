-- ============================================================================
-- Agent Runway — Migration 00035: Fix trigger search_path
-- ============================================================================
-- Root cause: handle_new_user() and seed_default_expenses() are SECURITY
-- DEFINER functions with no explicit search_path.  When Supabase Auth calls
-- the trigger, the session search_path may not include "public", causing
-- `relation "user_settings" does not exist`.
--
-- Fix: Add SET search_path = public to both functions so they always resolve
-- tables in the public schema regardless of the calling context.
-- ============================================================================

-- 1. Fix handle_new_user() — add SET search_path = public
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _admin_emails text[] := ARRAY[
    'andrew@andrewshaw.ca',
    'erin@ellisrealty.ca'
  ];
BEGIN
  IF NEW.email = ANY(_admin_emails) THEN
    INSERT INTO user_settings (user_id, subscription_tier, subscription_status, is_admin)
    VALUES (NEW.id, 'professional', 'active', true);
  ELSE
    INSERT INTO user_settings (user_id) VALUES (NEW.id);
  END IF;

  PERFORM seed_default_expenses(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. Fix seed_default_expenses() — add SET search_path = public
CREATE OR REPLACE FUNCTION seed_default_expenses(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_cat_id UUID;
BEGIN
  -- 1. Vehicle
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'vehicle', 'Vehicle', 0) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'vehicle_payment',   'Payment',   0),
    (p_user_id, v_cat_id, 'vehicle_insurance',  'Insurance', 1),
    (p_user_id, v_cat_id, 'vehicle_fuel',       'Fuel',      2),
    (p_user_id, v_cat_id, 'vehicle_service',    'Service',   3);

  -- 2. Marketing
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'marketing', 'Marketing', 1) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'marketing_ads',          'Ads',           0),
    (p_user_id, v_cat_id, 'marketing_photography',  'Photography',   1),
    (p_user_id, v_cat_id, 'marketing_print',         'Print',         2),
    (p_user_id, v_cat_id, 'marketing_gifts',         'Gifts',         3);

  -- 3. Office & Tech
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'office_tech', 'Office & Tech', 2) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'office_supplies',   'Supplies',   0),
    (p_user_id, v_cat_id, 'office_software',   'Software',   1),
    (p_user_id, v_cat_id, 'office_phone',      'Phone',      2),
    (p_user_id, v_cat_id, 'office_hardware',   'Hardware',   3);

  -- 4. Professional Fees
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'professional', 'Professional Fees', 3) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'prof_board_mls',    'Board / MLS',   0),
    (p_user_id, v_cat_id, 'prof_licensing',     'Licensing',     1),
    (p_user_id, v_cat_id, 'prof_eo',            'E&O Insurance', 2),
    (p_user_id, v_cat_id, 'prof_accounting',    'Accounting',    3);

  -- 5. Education
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'education', 'Education', 4) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'edu_courses',       'Courses',      0),
    (p_user_id, v_cat_id, 'edu_conferences',   'Conferences',  1),
    (p_user_id, v_cat_id, 'edu_books',         'Books',        2);

  -- 6. Meals
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'meals', 'Meals', 5) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'meals_client',   'Client Meals', 0),
    (p_user_id, v_cat_id, 'meals_team',     'Team Meals',   1);

  -- 7. Entertainment
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'entertainment', 'Entertainment', 6) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'ent_client',   'Client Events', 0),
    (p_user_id, v_cat_id, 'ent_events',   'Events',        1);

  -- 8. Other
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'other', 'Other', 7) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'other_misc',   'Miscellaneous', 0);

  -- 9. Payroll & HR
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'payroll', 'Payroll & HR', 8) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'payroll_wages',        'Admin wages',          0),
    (p_user_id, v_cat_id, 'payroll_employer_cpp', 'Employer CPP',         1),
    (p_user_id, v_cat_id, 'payroll_employer_ei',  'Employer EI',          2),
    (p_user_id, v_cat_id, 'payroll_wsib',         'WSIB / WCB',           3),
    (p_user_id, v_cat_id, 'payroll_benefits',     'Group benefits',       4),
    (p_user_id, v_cat_id, 'payroll_service_fees', 'Payroll service fees', 5);

  -- 10. Corporate Admin
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'corp_admin', 'Corporate Admin', 9) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'corp_accounting',    'Corporate accounting',   0),
    (p_user_id, v_cat_id, 'corp_legal',          'Legal & corporate',      1),
    (p_user_id, v_cat_id, 'corp_annual_filing',  'Annual registry filing', 2),
    (p_user_id, v_cat_id, 'corp_bank_fees',      'Business banking fees',  3),
    (p_user_id, v_cat_id, 'corp_insurance_gl',   'Commercial liability',   4),
    (p_user_id, v_cat_id, 'corp_insurance_do',   'D&O insurance',          5);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
