-- ============================================================================
-- Migration 00132 — Director Cockpit Phase 0 (corp_* tables)
--
-- Internal-only operator surface for AR Inc. Distinct from the customer-facing
-- realtor product. Schema isolation via separate `corp_*` tables (NOT a context
-- column on `receipt_expenses`) — a context column would silently leak
-- corporate rows into realtor metric engines.
--
-- Spec: memory/findings/spec_corp_director_cockpit_phase0_artifacts_2026-05-05.md
-- Greenlight: memory/findings/decision_director_cockpit_greenlight_2026-05-05.md
--
-- Tables:
--   1. corp_chart_of_accounts  — shared code list (no user_id)
--   2. corp_vendors            — user-scoped, regex match rules + defaults
--   3. corp_vendor_allocations — user-scoped, corp/personal % split per vendor
--   4. corp_transactions       — user-scoped, ledger of every booked txn
--
-- RLS: auth.uid() = user_id on corp_transactions, corp_vendors,
--      corp_vendor_allocations. corp_chart_of_accounts: SELECT for any
--      authenticated user; INSERT/UPDATE for service role only.
-- ============================================================================


-- ── 1. corp_chart_of_accounts (shared code list) ────────────────────────────

CREATE TABLE IF NOT EXISTS corp_chart_of_accounts (
  account_code TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  notes        TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corp_chart_of_accounts_type_chk
    CHECK (type IN ('revenue','cogs','opex','equity','liability','tax','asset'))
);

COMMENT ON TABLE corp_chart_of_accounts IS
  'AR Inc. chart of accounts. Shared code list — not user-scoped. Authenticated
   users can SELECT; only service role mutates.';

ALTER TABLE corp_chart_of_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_coa: select authenticated" ON corp_chart_of_accounts;
CREATE POLICY "corp_coa: select authenticated"
  ON corp_chart_of_accounts FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE intentionally have no policy → only service_role bypasses RLS.


-- ── 2. corp_vendors (user-scoped) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS corp_vendors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  regex_pattern         TEXT NOT NULL,
  default_account_code  TEXT NULL REFERENCES corp_chart_of_accounts(account_code),
  sred_eligible         BOOLEAN NOT NULL DEFAULT false,
  sred_category         TEXT NULL,
  corp_pct              NUMERIC NOT NULL DEFAULT 100,
  notes                 TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corp_vendors_sred_category_chk
    CHECK (sred_category IS NULL OR sred_category IN ('overhead','direct_labour','materials','contractor')),
  CONSTRAINT corp_vendors_corp_pct_chk
    CHECK (corp_pct >= 0 AND corp_pct <= 100)
);

CREATE INDEX IF NOT EXISTS corp_vendors_user_id_idx ON corp_vendors(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS corp_vendors_user_name_uniq ON corp_vendors(user_id, name);

ALTER TABLE corp_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_vendors: select own" ON corp_vendors;
CREATE POLICY "corp_vendors: select own"
  ON corp_vendors FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_vendors: insert own" ON corp_vendors;
CREATE POLICY "corp_vendors: insert own"
  ON corp_vendors FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_vendors: update own" ON corp_vendors;
CREATE POLICY "corp_vendors: update own"
  ON corp_vendors FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_vendors: delete own" ON corp_vendors;
CREATE POLICY "corp_vendors: delete own"
  ON corp_vendors FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ── 3. corp_vendor_allocations (user-scoped) ────────────────────────────────

CREATE TABLE IF NOT EXISTS corp_vendor_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES corp_vendors(id) ON DELETE CASCADE,
  corp_pct        NUMERIC NOT NULL,
  personal_pct    NUMERIC NOT NULL,
  rationale_text  TEXT NULL,
  set_by          TEXT NULL,
  effective_from  DATE NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corp_vendor_alloc_sum_chk
    CHECK ((corp_pct + personal_pct) = 100),
  CONSTRAINT corp_vendor_alloc_corp_range_chk
    CHECK (corp_pct >= 0 AND corp_pct <= 100),
  CONSTRAINT corp_vendor_alloc_personal_range_chk
    CHECK (personal_pct >= 0 AND personal_pct <= 100)
);

CREATE INDEX IF NOT EXISTS corp_vendor_alloc_user_id_idx ON corp_vendor_allocations(user_id);
CREATE INDEX IF NOT EXISTS corp_vendor_alloc_vendor_id_idx ON corp_vendor_allocations(vendor_id);

ALTER TABLE corp_vendor_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_alloc: select own" ON corp_vendor_allocations;
CREATE POLICY "corp_alloc: select own"
  ON corp_vendor_allocations FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_alloc: insert own" ON corp_vendor_allocations;
CREATE POLICY "corp_alloc: insert own"
  ON corp_vendor_allocations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_alloc: update own" ON corp_vendor_allocations;
CREATE POLICY "corp_alloc: update own"
  ON corp_vendor_allocations FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_alloc: delete own" ON corp_vendor_allocations;
CREATE POLICY "corp_alloc: delete own"
  ON corp_vendor_allocations FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ── 4. corp_transactions (user-scoped) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS corp_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                    DATE NOT NULL,
  amount_pretax           NUMERIC NOT NULL,
  gst_hst                 NUMERIC NOT NULL DEFAULT 0,
  amount_total            NUMERIC NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'CAD',
  fx_rate                 NUMERIC NULL,
  vendor_id               UUID NULL REFERENCES corp_vendors(id) ON DELETE SET NULL,
  vendor_name_raw         TEXT NULL,
  account_code            TEXT NULL REFERENCES corp_chart_of_accounts(account_code),
  account_type            TEXT NULL,
  description             TEXT NULL,
  source_channel          TEXT NOT NULL,
  source_ref              TEXT NULL,
  receipt_storage_path    TEXT NULL,
  corp_pct                NUMERIC NOT NULL DEFAULT 100,
  sred_eligible           BOOLEAN NOT NULL DEFAULT false,
  sred_category           TEXT NULL,
  pre_incorp_flag         BOOLEAN NOT NULL DEFAULT false,
  incurred_date           DATE NULL,
  parent_transaction_id   UUID NULL REFERENCES corp_transactions(id) ON DELETE SET NULL,
  needs_review            BOOLEAN NOT NULL DEFAULT false,
  review_reason           TEXT NULL,
  ingested_by_user_id     UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ingested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at               TIMESTAMPTZ NULL,
  notes                   TEXT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corp_txn_account_type_chk
    CHECK (account_type IS NULL OR account_type IN ('revenue','cogs','opex','equity','liability','tax','asset')),
  CONSTRAINT corp_txn_source_channel_chk
    CHECK (source_channel IN ('receipt_upload','mobile_photo','email_inbound','qbo','manual','stripe','bank_csv')),
  CONSTRAINT corp_txn_sred_category_chk
    CHECK (sred_category IS NULL OR sred_category IN ('overhead','direct_labour','materials','contractor')),
  CONSTRAINT corp_txn_corp_pct_chk
    CHECK (corp_pct >= 0 AND corp_pct <= 100)
);

COMMENT ON TABLE corp_transactions IS
  'Ledger of every AR Inc. corporate transaction. User-scoped (currently single
   user — Andrew as Director). Stripe rows split into gross+fee via parent_transaction_id.';

-- 7 partial indexes per spec
CREATE INDEX IF NOT EXISTS corp_txn_user_date_idx
  ON corp_transactions(user_id, date DESC);

CREATE INDEX IF NOT EXISTS corp_txn_user_account_date_idx
  ON corp_transactions(user_id, account_code, date);

CREATE INDEX IF NOT EXISTS corp_txn_user_sred_partial_idx
  ON corp_transactions(user_id, sred_eligible)
  WHERE sred_eligible = true;

CREATE INDEX IF NOT EXISTS corp_txn_user_preincorp_partial_idx
  ON corp_transactions(user_id, pre_incorp_flag)
  WHERE pre_incorp_flag = true;

CREATE INDEX IF NOT EXISTS corp_txn_user_review_partial_idx
  ON corp_transactions(user_id, needs_review)
  WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS corp_txn_vendor_idx
  ON corp_transactions(vendor_id);

CREATE INDEX IF NOT EXISTS corp_txn_parent_partial_idx
  ON corp_transactions(parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;

ALTER TABLE corp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_txn: select own" ON corp_transactions;
CREATE POLICY "corp_txn: select own"
  ON corp_transactions FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_txn: insert own" ON corp_transactions;
CREATE POLICY "corp_txn: insert own"
  ON corp_transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_txn: update own" ON corp_transactions;
CREATE POLICY "corp_txn: update own"
  ON corp_transactions FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "corp_txn: delete own" ON corp_transactions;
CREATE POLICY "corp_txn: delete own"
  ON corp_transactions FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ── 5. Seed: corp_chart_of_accounts (25 rows, verbatim from spec) ───────────

INSERT INTO corp_chart_of_accounts (account_code, name, type, notes) VALUES
  ('4000','Subscription Revenue','revenue','Stripe gross before fees'),
  ('4030','Other Income','revenue','Grants, refunds, FX gains'),
  ('5010','Hosting & Infrastructure','cogs','Vercel, Supabase, Mem0, Helicone'),
  ('5020','AI / LLM API Costs','cogs','Anthropic, OpenAI'),
  ('5030','Email & Comms','cogs','Resend, transactional infra'),
  ('5040','Payment Processing Fees','cogs','Stripe fees split from 4000'),
  ('5050','App Store / Distribution Fees','cogs','Apple/Google revenue share'),
  ('6010','Salaries & Wages','opex','T4 founder comp if elected'),
  ('6020','Subcontractor / Professional Services','opex','SR&ED contractor candidates'),
  ('6030','Legal Fees','opex','Cox & Palmer'),
  ('6040','Accounting Fees','opex','Future T2/SR&ED accountant'),
  ('6050','Software & SaaS (non-COGS)','opex','GitHub, dev tools'),
  ('6060','Telecom — Mobile','opex','Bell mobile (mixed allocation)'),
  ('6070','Telecom — Internet','opex','Home internet (mixed allocation)'),
  ('6080','Home Office Allocation','opex','Square footage % method'),
  ('6090','Insurance','opex','E&O / D&O / GL once bound'),
  ('6100','Bank Fees','opex','Account fees, wire fees'),
  ('6110','FX Losses & Bank Adjustments','opex','USD→CAD conversion losses'),
  ('3010','Shareholder Loan — Andrew Shaw','equity','Running balance, sign matters'),
  ('3020','Common Shares — Capital','equity','Initial subscription'),
  ('2110','GST/HST Collected','liability','Output tax'),
  ('2120','GST/HST ITC','liability','Input tax credits, contra'),
  ('2130','Corporate Income Tax Payable','tax','T2 accrual'),
  ('2140','Payroll Liabilities','liability','CPP/EI/source deductions if salary'),
  ('1510','Accumulated Depreciation — CCA','liability','REVIEW: confirm liability vs new asset type')
ON CONFLICT (account_code) DO NOTHING;


-- ── 6. Seed: corp_vendors + corp_vendor_allocations (Andrew-scoped) ─────────

DO $$
DECLARE
  v_user_id UUID;
  v_bell_mobility_id UUID;
  v_bell_internet_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'andrew@andrewdshaw.ca';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Migration 00132 abort: auth.users WHERE email=''andrew@andrewdshaw.ca'' returned 0 rows. Cannot seed corp_vendors / corp_vendor_allocations against an unknown user_id.';
  END IF;

  -- 15 vendor rows (verbatim from spec table)
  INSERT INTO corp_vendors (user_id, name, regex_pattern, default_account_code, sred_eligible, sred_category, corp_pct, notes) VALUES
    (v_user_id,'Stripe (revenue)',  '(?i)stripe.*(payout|transfer)', '4000', false, NULL, 100, 'SPECIAL: gross-to-4000, fees-to-5040 split needed in ingest pipeline (parent_transaction_id self-ref)'),
    (v_user_id,'Vercel',             '(?i)vercel',                    '5010', true,  'overhead', 100, NULL),
    (v_user_id,'Supabase',           '(?i)supabase',                  '5010', true,  'overhead', 100, NULL),
    (v_user_id,'Mem0',               '(?i)mem0',                      '5010', true,  'overhead', 100, NULL),
    (v_user_id,'Anthropic',          '(?i)anthropic|claude\.ai',      '5020', true,  'overhead', 100, 'REVIEW: pre-incorp Anthropic charges on personal card need separate audit'),
    (v_user_id,'OpenAI',             '(?i)openai',                    '5020', true,  'overhead', 100, 'REVIEW: confirm if used'),
    (v_user_id,'Helicone',           '(?i)helicone',                  '5010', true,  'overhead', 100, NULL),
    (v_user_id,'Resend',             '(?i)resend',                    '5030', true,  'overhead', 100, NULL),
    (v_user_id,'Cox & Palmer',       '(?i)cox.{0,3}palmer',           '6030', false, NULL, 100, '$550/mo retainer + upfront drawdown'),
    (v_user_id,'Bell Mobility',      '(?i)bell.*(mobil|mobility)',    '6060', false, NULL, 80,  'Mixed personal/corp'),
    (v_user_id,'Bell / Rogers Internet','(?i)(bell|rogers).*(internet|fibe|ignite)','6070', false, NULL, 50, 'REVIEW: provider + corp_pct'),
    (v_user_id,'Apple App Store',    '(?i)apple\.com/bill|itunes',    '5050', false, NULL, 100, 'REVIEW: separate personal Apple charges'),
    (v_user_id,'Google / Play',      '(?i)google\s*\*?(play|cloud|workspace)','5050', false, NULL, 100, 'REVIEW: Workspace vs Play vs personal'),
    (v_user_id,'GitHub',             '(?i)github',                    '6050', true,  'overhead', 100, NULL),
    (v_user_id,'GoDaddy / Domain',   '(?i)(godaddy|namecheap|cloudflare.*registrar)', '6050', false, NULL, 100, 'agentrunway.ca registrar')
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Allocations (3 rows: Bell Mobility 80/20, Internet 50/50 placeholder, Home Office 0/0 placeholder)
  -- Home Office is account-level, not vendor-level — we model it via a synthetic vendor row so the same allocation mechanism handles both.
  -- For Phase 0 we INSERT a stub "Home Office" vendor to anchor the allocation; spec calls this out as a placeholder.
  INSERT INTO corp_vendors (user_id, name, regex_pattern, default_account_code, sred_eligible, corp_pct, notes) VALUES
    (v_user_id,'Home Office (allocation anchor)','(?i)__never_match_sentinel__','6080', false, 0, 'PLACEHOLDER anchor row for 6080 allocation. Andrew sets sq-ft % later.')
  ON CONFLICT (user_id, name) DO NOTHING;

  SELECT id INTO v_bell_mobility_id FROM corp_vendors WHERE user_id=v_user_id AND name='Bell Mobility';
  SELECT id INTO v_bell_internet_id FROM corp_vendors WHERE user_id=v_user_id AND name='Bell / Rogers Internet';

  INSERT INTO corp_vendor_allocations (user_id, vendor_id, corp_pct, personal_pct, rationale_text, set_by) VALUES
    (v_user_id, v_bell_mobility_id, 80, 20, 'Phone primarily AR Inc. dev, customer comms, vendor calls; ~20% personal', 'andrew_initial')
  ON CONFLICT DO NOTHING;

  INSERT INTO corp_vendor_allocations (user_id, vendor_id, corp_pct, personal_pct, rationale_text, set_by) VALUES
    (v_user_id, v_bell_internet_id, 50, 50, 'Home internet shared work/personal — REVIEW basis (sq-ft or time-use)', 'andrew_initial_PLACEHOLDER')
  ON CONFLICT DO NOTHING;

  -- Home Office 0/0 placeholder allocation
  INSERT INTO corp_vendor_allocations (user_id, vendor_id, corp_pct, personal_pct, rationale_text, set_by)
  SELECT v_user_id, v.id, 0, 100, 'PLACEHOLDER — Andrew to set once sq-ft % calculated', 'andrew_initial_PLACEHOLDER'
  FROM corp_vendors v
  WHERE v.user_id = v_user_id AND v.name = 'Home Office (allocation anchor)'
  ON CONFLICT DO NOTHING;

END $$;
