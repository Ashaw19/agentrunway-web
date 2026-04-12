-- ============================================================================
-- Migration 00112: Remove Sandbox Mode
-- Drops all sandbox RLS policies, helper function, columns, and constraints.
-- Reverses migrations 00065, 00066, 00067, 00068, 00094, 00095.
-- ============================================================================

-- ── 1. Drop ALL sandbox policies from every table that has them ─────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE policyname LIKE 'sandbox_block%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── 2. Drop the helper function (CASCADE catches any remaining dependents) ──
DROP FUNCTION IF EXISTS public.is_sandbox_active_for_current_user() CASCADE;

-- ── 3. Update auto-promote trigger to remove sandbox guard ─────────────────
CREATE OR REPLACE FUNCTION update_client_last_contact()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_flag_enabled  BOOLEAN;
  v_user_opted_in BOOLEAN;
BEGIN
  UPDATE clients
     SET last_contact_at = NEW.activity_date,
         updated_at      = now()
   WHERE id      = NEW.client_id
     AND user_id = NEW.user_id
     AND (last_contact_at IS NULL OR last_contact_at < NEW.activity_date);

  SELECT enabled INTO v_flag_enabled
    FROM feature_flags
   WHERE name = 'auto_promote_on_activity';
  IF NOT COALESCE(v_flag_enabled, true) THEN
    RETURN NEW;
  END IF;

  SELECT auto_promote_on_activity INTO v_user_opted_in
    FROM user_settings
   WHERE user_id = NEW.user_id;
  IF NOT COALESCE(v_user_opted_in, true) THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'note' THEN
    RETURN NEW;
  END IF;

  UPDATE clients
     SET status     = 'scheduled',
         updated_at = now()
   WHERE id      = NEW.client_id
     AND user_id = NEW.user_id
     AND status  = 'boarding';

  RETURN NEW;
END;
$$;

-- ── 4. Drop sandbox columns from user_settings ─────────────────────────────
ALTER TABLE user_settings
  DROP CONSTRAINT IF EXISTS chk_sandbox_tier;

ALTER TABLE user_settings
  DROP COLUMN IF EXISTS sandbox_data,
  DROP COLUMN IF EXISTS sandbox_tier,
  DROP COLUMN IF EXISTS sandbox_expires_at,
  DROP COLUMN IF EXISTS sandbox_activated_at,
  DROP COLUMN IF EXISTS sandbox_mode;
