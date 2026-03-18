-- ── AI Touchpoint Safeguards ─────────────────────────────────────────────────
-- Adds three client-level safety flags that gate AI outreach generation,
-- and a property_use field on client_records for context-aware post-close prompts.

-- ── Client safety flags ──────────────────────────────────────────────────────
-- deceased:           hard stop — suppress ALL AI outreach for this client
-- do_not_contact:     hard stop — suppress ALL AI outreach for this client
-- sensitive_situation: soft stop — suppress solicitation types only
--                      (review_request, referral_ask) while allowing care-based
--                      touchpoints (post_close, birthday, anniversary)

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS deceased           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitive_situation boolean NOT NULL DEFAULT false;

-- Index for efficient filtering in detect-opportunities scanner
CREATE INDEX IF NOT EXISTS idx_clients_safeguard_flags
  ON clients (user_id, deceased, do_not_contact)
  WHERE deceased = true OR do_not_contact = true;

-- ── Property use on client_records ───────────────────────────────────────────
-- Tells the AI what kind of property was involved so post-close prompts
-- can avoid "settling in to your new home" language for investment/commercial.

ALTER TABLE client_records
  ADD COLUMN IF NOT EXISTS property_use text
    CHECK (property_use IN ('primary_residence', 'investment', 'commercial', 'pre_construction'));

-- ── Reload PostgREST schema cache ────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
