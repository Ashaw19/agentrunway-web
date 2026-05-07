-- Migration 00143: agent_open_houses
--
-- Persistent branded open house page for each agent.
-- One row per agent (UNIQUE on user_id). The URL slug never changes;
-- agents just update property details before each new open house.
-- Public visitors see the page via /open-house/[slug] and sign in with
-- name + email + CASL consent. Sign-ups are written to:
--   1. email_signups (marketing list with CASL audit trail in consents)
--   2. clients (added to the agent's Flight Control CRM at Boarding stage)
--   3. Resend notification to the agent (non-fatal)
--
-- RLS:
--   Authenticated: agents can read/write their own row (ALL operations)
--   Anon: SELECT only where is_active = TRUE (for public page rendering)
--
-- Storage: property photos go to the existing profile-media bucket at
--   {user_id}/open-house/property.{ext}
--   The existing INSERT/UPDATE/DELETE policies on profile-media already
--   scope to (storage.foldername(name))[1] = auth.uid()::text, so no
--   new storage policies are needed.

CREATE TABLE IF NOT EXISTS agent_open_houses (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One open house page per agent; user_id is the natural PK for lookup
  user_id             UUID          NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- URL slug — persistent. Derived from display name at first save,
  -- agents may customise it once. Immutable after first publish.
  slug                TEXT          NOT NULL UNIQUE
    CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,59}$'),

  -- ── Property details (updated before each open house) ──────────────
  property_address    TEXT          NOT NULL DEFAULT '',
  property_city       TEXT          NOT NULL DEFAULT '',
  property_province   TEXT          NOT NULL DEFAULT '',
  property_price      NUMERIC(14,2),          -- NULL = price not shown
  property_photo_url  TEXT          NOT NULL DEFAULT '',
  open_house_date     DATE,
  open_house_start    TIME,                   -- e.g. 14:00
  open_house_end      TIME,                   -- e.g. 16:00
  description         TEXT          NOT NULL DEFAULT '',

  -- ── Agent branding (copied from user_settings at first save; editable) ─
  agent_display_name  TEXT          NOT NULL DEFAULT '',
  agent_photo_url     TEXT          NOT NULL DEFAULT '',
  agent_brokerage     TEXT          NOT NULL DEFAULT '',
  agent_phone         TEXT          NOT NULL DEFAULT '',
  agent_email         TEXT          NOT NULL DEFAULT '',

  -- ── Visibility ───────────────────────────────────────────────────────
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE agent_open_houses ENABLE ROW LEVEL SECURITY;

-- Agents manage their own row (auth path)
CREATE POLICY "Agents manage own open house page"
  ON agent_open_houses FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Anonymous visitors can read active pages (public route)
CREATE POLICY "Anon can read active open house pages"
  ON agent_open_houses FOR SELECT
  TO anon
  USING (is_active = TRUE);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX idx_agent_open_houses_user_id ON agent_open_houses (user_id);
CREATE INDEX idx_agent_open_houses_slug    ON agent_open_houses (slug) WHERE is_active = TRUE;

-- ── Auto-update updated_at ────────────────────────────────────────────
CREATE TRIGGER trg_agent_open_houses_updated
  BEFORE UPDATE ON agent_open_houses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
