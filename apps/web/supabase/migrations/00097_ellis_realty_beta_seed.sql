-- ============================================================================
-- 00097 · Ellis Realty Beta Organization Seed
-- ============================================================================
-- Creates the Ellis Realty beta organization record.
--
-- Auth users and memberships are created by the seed script:
--   apps/web/scripts/seed-beta-team.ts
--
-- Beta orgs bypass all billing (is_beta = true). Erin Ellis
-- (erin@ellisrealty.ca) is the team leader with 5 member seats.
--
-- owner_id is set to NULL here because auth.users rows cannot be created
-- via migration SQL on Supabase hosted. The seed script creates the auth
-- user first, then updates owner_id on this org row.
-- ============================================================================

-- Allow owner_id to be NULL so we can insert the org before the auth user exists
ALTER TABLE organizations ALTER COLUMN owner_id DROP NOT NULL;

INSERT INTO organizations (name, slug, type, is_beta, subscription_status, max_seats, billing_email)
VALUES ('Ellis Realty', 'ellis-realty', 'brokerage', true, 'active', 10, 'erin@ellisrealty.ca')
ON CONFLICT (slug) DO UPDATE SET
  type = EXCLUDED.type,
  is_beta = EXCLUDED.is_beta,
  subscription_status = EXCLUDED.subscription_status,
  max_seats = EXCLUDED.max_seats,
  billing_email = EXCLUDED.billing_email;
