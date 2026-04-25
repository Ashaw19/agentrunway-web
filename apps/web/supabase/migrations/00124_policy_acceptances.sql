-- ============================================================================
-- Migration 00124: policy_acceptances
-- ----------------------------------------------------------------------------
-- Tracks each user's acceptance of a specific policy version. Drives the
-- just-in-time signup checkbox (Privacy Policy + Terms acknowledgement) and
-- the in-app "policies have been updated" banner that appears on first login
-- after a material policy revision.
--
-- Lawyer reference: Cox & Palmer review of policies (April 25, 2026):
--   - Comment 0 / 11 / 45 / 94: "users should be alerted that a new version
--     of the [Policy/Terms] is available the first time they log into their
--     portal after [it] has been updated"
--   - Comment 0 (Privacy): just-in-time notice with checkbox satisfies
--     Alberta PIPA notice-of-collection requirement
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_acceptances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which policy was accepted (matches the slugs used in lib/policy-versions.ts)
  policy_type     text NOT NULL CHECK (policy_type IN (
    'terms',
    'privacy',
    'acceptable_use',
    'cookie'
  )),

  -- The version date (ISO YYYY-MM-DD) the user accepted. Compared against
  -- POLICY_VERSIONS in lib/policy-versions.ts to decide whether the in-app
  -- banner should fire.
  version         text NOT NULL,

  -- When + where the acceptance happened. acceptance_context lets us
  -- distinguish signup-time consent from re-acceptance via the banner.
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  acceptance_context text NOT NULL CHECK (acceptance_context IN (
    'signup',
    'policy_update_banner',
    'backfill'
  )),

  -- Audit: IP + user agent at the moment of acceptance. Stored for
  -- regulator-evidence purposes; surfaced to the user only via data export.
  ip_address      inet,
  user_agent      text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One acceptance row per (user, policy_type, version) — re-accepting the
-- same version is a no-op (idempotent upsert from the API).
CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_acceptances_user_policy_version
  ON policy_acceptances (user_id, policy_type, version);

-- Lookup pattern from the layout: "what's the latest version this user has
-- accepted for each policy?"
CREATE INDEX IF NOT EXISTS idx_policy_acceptances_user_policy_recent
  ON policy_acceptances (user_id, policy_type, accepted_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE policy_acceptances ENABLE ROW LEVEL SECURITY;

-- Users may read their own acceptance history.
CREATE POLICY policy_acceptances_select_own
  ON policy_acceptances FOR SELECT
  USING (auth.uid() = user_id);

-- Users may insert acceptance rows for themselves only. acceptance_context
-- is constrained to the three allowed values via the CHECK above.
CREATE POLICY policy_acceptances_insert_own
  ON policy_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policies — acceptance rows are append-only history.
-- Service role can still manage them via admin client (used by /auth/callback
-- backfill from signup metadata).

COMMENT ON TABLE policy_acceptances IS
  'Append-only audit log of each user''s acceptance of a specific policy version. Drives the policy-update banner in (app) layout. Set in same migration as the just-in-time signup checkbox. See Cox & Palmer review 2026-04-25.';
