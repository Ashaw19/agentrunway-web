-- 00175_expense_category_keys_to_item_keys.sql
--
-- Data repair: expenses whose category_key is not an expense ITEM key.
--
-- receipt_expenses.category_key and recurring_expenses.category_key hold an
-- expense item key (expense_items.key: 'vehicle_fuel', 'meals_client', ...).
-- The Expenses page rows, the T2125 lines (EXPENSE_KEY_TO_T2125) and the
-- GST34 ITC limits all look the row up by that key.
--
-- Two kinds of key that match no item got written:
--   1. Category keys (expense_categories.key): 'vehicle', 'marketing',
--      'office_tech', 'professional', 'education', 'meals', 'entertainment',
--      'other'.
--   2. Four keys the Flight Crew expense tools offered that exist nowhere
--      else: 'professional_fees', 'travel_meals', 'insurance_licenses',
--      'education_dev'. (apps/web/lib/ai/tools.ts, 2026-04-06 to 2026-10-13.
--      The tools now take the item keys from RECEIPT_CATEGORY_GROUPS.)
--
-- A row with one of those keys was counted in the dashboard's expense total
-- but sat in no row on the Expenses page, so it was missing from that page's
-- YTD Expenses, expense ratio and Est. Tax Deductible, and it reached no
-- T2125 line.
--
-- Each goes to the default item of the SAME category. Within a category every
-- item has the same deductible share and the same ITC rule (vehicle: business
-- use; meals and entertainment: 50%; the rest: 100%), so the choice of item
-- changes neither the deductible amount nor the input tax credit. It only
-- picks the row the expense shows under, and for Marketing, Office & Tech and
-- Professional Fees which 100%-deductible T2125 line it is listed on. The
-- item can be changed on the Expenses page.
--
-- Prod at 2026-10-13 (counted by key only): 20 receipt_expenses rows
-- (vehicle 6, marketing 4, professional 4, office_tech 2, entertainment 2,
-- education 1, meals 1), 0 recurring_expenses rows, none with the four
-- Flight Crew-only keys.
--
-- Idempotent: an item key is never a source key, so a second run changes
-- nothing. receipt_expenses.updated_at moves (trg_receipt_expenses_updated).

WITH mapping(old_key, item_key) AS (
  VALUES
    ('vehicle',            'vehicle_fuel'),
    ('marketing',          'marketing_ads'),
    ('office_tech',        'office_supplies'),
    ('professional',       'prof_accounting'),
    ('professional_fees',  'prof_accounting'),
    ('insurance_licenses', 'prof_licensing'),
    ('education',          'edu_courses'),
    ('education_dev',      'edu_courses'),
    ('meals',              'meals_client'),
    ('travel_meals',       'meals_client'),
    ('entertainment',      'ent_client'),
    ('other',              'other_misc')
),
-- A data-modifying CTE runs to completion whether or not it is read, so one
-- mapping list serves both tables.
receipts AS (
  UPDATE receipt_expenses r
  SET category_key = m.item_key
  FROM mapping m
  WHERE r.category_key = m.old_key
  RETURNING r.id
)
UPDATE recurring_expenses r
SET category_key = m.item_key,
    updated_at = now()
FROM mapping m
WHERE r.category_key = m.old_key;
