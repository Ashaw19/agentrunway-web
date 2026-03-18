-- ── Flight Plan Defaults ─────────────────────────────────────────────────────
-- Adds fields to support pre-loaded system campaign templates and tag-based
-- triggers, enabling 20 default drip campaigns to be seeded per user.

-- is_system:   true = pre-loaded default campaign (user can edit/pause/delete)
-- system_key:  stable identifier used for idempotent upsert during seeding
-- trigger_tag: if set, plan only fires when client status changes AND the
--              client has this tag — allows differentiating Buyer vs Seller
--              vs "First-Time Buyer" etc. within the same status trigger

ALTER TABLE flight_plans
  ADD COLUMN IF NOT EXISTS is_system   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_key  text,
  ADD COLUMN IF NOT EXISTS trigger_tag text;

-- Unique constraint: one copy of each system campaign per user
CREATE UNIQUE INDEX IF NOT EXISTS flight_plans_user_system_key_idx
  ON flight_plans (user_id, system_key)
  WHERE system_key IS NOT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
