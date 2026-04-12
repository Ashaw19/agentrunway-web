-- ============================================================================
-- Migration 00112: Remove Sandbox Mode
-- Drops all sandbox RLS policies, helper function, columns, and constraints.
-- Reverses migrations 00065, 00066, 00067, 00068, 00094, 00095.
-- ============================================================================

-- ── 1. Drop sandbox RLS policies from public tables ─────────────────────────
-- Tables from migration 00066
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'transactions', 'pipeline_deals', 'history_items', 'expense_categories',
    'expense_items', 'receipt_expenses', 'mileage_logs', 'clients',
    'contact_activities', 'contact_tasks', 'client_records',
    'client_relationships', 'listing_appointments', 'property_showings',
    'flight_plans', 'flight_plan_steps', 'outreach_queue',
    'calendar_events', 'user_settings'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_delete ON public.%I', t);
  END LOOP;
END $$;

-- Tables from migration 00067
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'google_connections', 'email_connections', 'social_connections',
    'social_posts', 'plaid_items', 'plaid_transactions',
    'property_analyses', 'drive_documents', 'organizations',
    'organization_members', 'organization_invitations',
    'security_audit_log', 'import_telemetry', 'receipt_upload_tokens'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_delete ON public.%I', t);
  END LOOP;
END $$;

-- Tables from migration 00068
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'milestones', 'agent_profiles', 'team_deals',
    'market_data_points', 'newsletter_queue'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sandbox_block_delete ON public.%I', t);
  END LOOP;
END $$;

-- Tables from migration 00094
DROP POLICY IF EXISTS sandbox_block_client_memory_profiles ON client_memory_profiles;
DROP POLICY IF EXISTS sandbox_block_client_notes ON client_notes;
DROP POLICY IF EXISTS sandbox_block_chat_analytics ON chat_analytics;
DROP POLICY IF EXISTS sandbox_block_recruitment_pages ON recruitment_pages;
DROP POLICY IF EXISTS sandbox_block_recruitment_applications ON recruitment_applications;
DROP POLICY IF EXISTS sandbox_block_referrals ON referrals;

-- Tables from migration 00095
DROP POLICY IF EXISTS sandbox_block_market_data_snapshots ON market_data_snapshots;
DROP POLICY IF EXISTS sandbox_block_push_tokens ON push_tokens;
DROP POLICY IF EXISTS sandbox_block_notification_preferences ON notification_preferences;
DROP POLICY IF EXISTS sandbox_block_notification_log ON notification_log;
DROP POLICY IF EXISTS sandbox_block_testimonials ON testimonials;
DROP POLICY IF EXISTS sandbox_block_ai_knowledge_audit_log ON ai_knowledge_audit_log;
DROP POLICY IF EXISTS sandbox_block_accountant_shares ON accountant_shares;

-- ── 2. Drop sandbox storage policies ───────────────────────────────────────
DROP POLICY IF EXISTS sandbox_block_storage_insert ON storage.objects;
DROP POLICY IF EXISTS sandbox_block_storage_update ON storage.objects;
DROP POLICY IF EXISTS sandbox_block_storage_delete ON storage.objects;
DROP POLICY IF EXISTS sandbox_block_receipt_storage_insert ON storage.objects;
DROP POLICY IF EXISTS sandbox_block_receipt_storage_update ON storage.objects;
DROP POLICY IF EXISTS sandbox_block_receipt_storage_delete ON storage.objects;

-- ── 3. Drop the helper function ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.is_sandbox_active_for_current_user();

-- ── 4. Update auto-promote trigger to remove sandbox guard ─────────────────
CREATE OR REPLACE FUNCTION update_client_last_contact()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_flag_enabled  BOOLEAN;
  v_user_opted_in BOOLEAN;
BEGIN
  -- ── EXISTING BEHAVIOR (preserved unchanged) ────────────────────────────
  -- Keep clients.last_contact_at in sync; only forward in time, never back.
  UPDATE clients
     SET last_contact_at = NEW.activity_date,
         updated_at      = now()
   WHERE id      = NEW.client_id
     AND user_id = NEW.user_id
     AND (last_contact_at IS NULL OR last_contact_at < NEW.activity_date);

  -- ── AUTO-PROMOTE LOGIC ─────────────────────────────────────────────────
  -- Guard 1: feature flag
  SELECT enabled INTO v_flag_enabled
    FROM feature_flags
   WHERE name = 'auto_promote_on_activity';
  IF NOT COALESCE(v_flag_enabled, true) THEN
    RETURN NEW;
  END IF;

  -- Guard 2: per-user opt-out
  SELECT auto_promote_on_activity INTO v_user_opted_in
    FROM user_settings
   WHERE user_id = NEW.user_id;
  IF NOT COALESCE(v_user_opted_in, true) THEN
    RETURN NEW;
  END IF;

  -- Guard 3: notes aren't touchpoints
  IF NEW.type = 'note' THEN
    RETURN NEW;
  END IF;

  -- Promote boarding → scheduled on first real touchpoint
  UPDATE clients
     SET status     = 'scheduled',
         updated_at = now()
   WHERE id      = NEW.client_id
     AND user_id = NEW.user_id
     AND status  = 'boarding';

  RETURN NEW;
END;
$$;

-- ── 5. Drop sandbox columns from user_settings ─────────────────────────────
ALTER TABLE user_settings
  DROP CONSTRAINT IF EXISTS chk_sandbox_tier;

ALTER TABLE user_settings
  DROP COLUMN IF EXISTS sandbox_data,
  DROP COLUMN IF EXISTS sandbox_tier,
  DROP COLUMN IF EXISTS sandbox_expires_at,
  DROP COLUMN IF EXISTS sandbox_activated_at,
  DROP COLUMN IF EXISTS sandbox_mode;
