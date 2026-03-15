-- ============================================================================
-- 00023_business_structure.sql
--
-- Adds business-structure fields to user_settings (incorporated, corp type,
-- compensation method, employees), seeds two new expense categories
-- (Payroll & HR + Corporate Admin) for new and existing users.
-- ============================================================================


-- ── 1. New columns on user_settings ─────────────────────────────────────────

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS is_incorporated     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS corp_type           TEXT    CHECK (corp_type IN ('prec', 'general')),
  ADD COLUMN IF NOT EXISTS compensation_method TEXT    NOT NULL DEFAULT 'salary'
               CHECK (compensation_method IN ('salary', 'dividends', 'mixed')),
  ADD COLUMN IF NOT EXISTS has_employees       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS num_employees       INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_settings.is_incorporated
  IS 'True when the agent operates through a corporation (PREC or general corp).';
COMMENT ON COLUMN user_settings.corp_type
  IS 'prec = Personal Real Estate Corporation; general = numbered/named corporation.';
COMMENT ON COLUMN user_settings.compensation_method
  IS 'How the owner pays themselves: salary, dividends, or mixed. Drives tax engine.';
COMMENT ON COLUMN user_settings.has_employees
  IS 'True when the agent has staff on payroll (unlocks Payroll & HR expense category).';
COMMENT ON COLUMN user_settings.num_employees
  IS 'Approximate headcount on payroll. Informational only.';


-- ── 2. Replace seed function — add Payroll & HR + Corporate Admin ────────────

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

  -- 9. Payroll & HR (seeded for all users; visible only when has_employees = true)
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'payroll', 'Payroll & HR', 8) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'payroll_wages',        'Admin wages',          0),
    (p_user_id, v_cat_id, 'payroll_employer_cpp', 'Employer CPP',         1),
    (p_user_id, v_cat_id, 'payroll_employer_ei',  'Employer EI',          2),
    (p_user_id, v_cat_id, 'payroll_wsib',         'WSIB / WCB',           3),
    (p_user_id, v_cat_id, 'payroll_benefits',     'Group benefits',       4),
    (p_user_id, v_cat_id, 'payroll_service_fees', 'Payroll service fees', 5);

  -- 10. Corporate Admin (seeded for all users; visible only when is_incorporated = true)
  INSERT INTO expense_categories (user_id, key, title, sort_order) VALUES (p_user_id, 'corp_admin', 'Corporate Admin', 9) RETURNING id INTO v_cat_id;
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order) VALUES
    (p_user_id, v_cat_id, 'corp_accounting',    'Corporate accounting',   0),
    (p_user_id, v_cat_id, 'corp_legal',          'Legal & corporate',      1),
    (p_user_id, v_cat_id, 'corp_annual_filing',  'Annual registry filing', 2),
    (p_user_id, v_cat_id, 'corp_bank_fees',      'Business banking fees',  3),
    (p_user_id, v_cat_id, 'corp_insurance_gl',   'Commercial liability',   4),
    (p_user_id, v_cat_id, 'corp_insurance_do',   'D&O insurance',          5);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 3. Backfill existing users ───────────────────────────────────────────────
-- Insert the two new categories + items for every user who signed up before
-- this migration. WHERE NOT EXISTS guards prevent double-inserts on re-runs.

DO $$
DECLARE
  u          RECORD;
  payroll_id UUID;
  corp_id    UUID;
BEGIN
  FOR u IN SELECT user_id FROM user_settings LOOP

    -- Payroll & HR
    IF NOT EXISTS (
      SELECT 1 FROM expense_categories WHERE user_id = u.user_id AND key = 'payroll'
    ) THEN
      INSERT INTO expense_categories (user_id, key, title, sort_order)
        VALUES (u.user_id, 'payroll', 'Payroll & HR', 8)
        RETURNING id INTO payroll_id;

      INSERT INTO expense_items (user_id, category_id, key, title, sort_order, ytd_amount, monthly_recurring)
      VALUES
        (u.user_id, payroll_id, 'payroll_wages',        'Admin wages',          0, 0, 0),
        (u.user_id, payroll_id, 'payroll_employer_cpp', 'Employer CPP',         1, 0, 0),
        (u.user_id, payroll_id, 'payroll_employer_ei',  'Employer EI',          2, 0, 0),
        (u.user_id, payroll_id, 'payroll_wsib',         'WSIB / WCB',           3, 0, 0),
        (u.user_id, payroll_id, 'payroll_benefits',     'Group benefits',       4, 0, 0),
        (u.user_id, payroll_id, 'payroll_service_fees', 'Payroll service fees', 5, 0, 0);
    END IF;

    -- Corporate Admin
    IF NOT EXISTS (
      SELECT 1 FROM expense_categories WHERE user_id = u.user_id AND key = 'corp_admin'
    ) THEN
      INSERT INTO expense_categories (user_id, key, title, sort_order)
        VALUES (u.user_id, 'corp_admin', 'Corporate Admin', 9)
        RETURNING id INTO corp_id;

      INSERT INTO expense_items (user_id, category_id, key, title, sort_order, ytd_amount, monthly_recurring)
      VALUES
        (u.user_id, corp_id, 'corp_accounting',    'Corporate accounting',   0, 0, 0),
        (u.user_id, corp_id, 'corp_legal',          'Legal & corporate',      1, 0, 0),
        (u.user_id, corp_id, 'corp_annual_filing',  'Annual registry filing', 2, 0, 0),
        (u.user_id, corp_id, 'corp_bank_fees',      'Business banking fees',  3, 0, 0),
        (u.user_id, corp_id, 'corp_insurance_gl',   'Commercial liability',   4, 0, 0),
        (u.user_id, corp_id, 'corp_insurance_do',   'D&O insurance',          5, 0, 0);
    END IF;

  END LOOP;
END $$;
