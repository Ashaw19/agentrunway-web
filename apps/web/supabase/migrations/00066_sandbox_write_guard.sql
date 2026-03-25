-- ============================================================================
-- Agent Runway — Sandbox Write Guard
-- Prevents ANY data mutation from leaking into real account while sandbox is active.
--
-- Strategy:
--   1. Helper function checks if the current authenticated user has sandbox ON
--   2. RESTRICTIVE RLS policies on every data table block INSERT/UPDATE/DELETE
--   3. Service-role (admin) client bypasses RLS entirely — used by sandbox API,
--      Stripe/Plaid webhooks, cron jobs, and other system operations
--   4. user_settings gets the same treatment — only admin client can write when
--      sandbox is active (sandbox API uses admin client for toggle/activate/etc.)
-- ============================================================================

-- ── Helper function ─────────────────────────────────────────────────────────
-- Returns TRUE when the current authenticated user's sandbox_mode is ON.
-- SECURITY DEFINER so it can read user_settings regardless of calling context.
-- STABLE because it doesn't modify data and can be cached within a statement.
CREATE OR REPLACE FUNCTION public.is_sandbox_active_for_current_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT sandbox_mode FROM public.user_settings WHERE user_id = auth.uid()),
    false
  );
$$;

-- ── Apply RESTRICTIVE policies to all data tables ───────────────────────────
-- RESTRICTIVE policies are AND'd with existing permissive policies.
-- They do NOT affect service_role (admin) since admin bypasses RLS entirely.
-- They do NOT affect SELECT — only INSERT, UPDATE, DELETE are guarded.
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    -- Core financial data
    'transactions',
    'pipeline_deals',
    'history_items',
    'expense_categories',
    'expense_items',
    'receipt_expenses',
    'mileage_logs',
    't2125_cca_assets',
    -- CRM data
    'clients',
    'contact_activities',
    'contact_tasks',
    'client_records',
    'client_relationships',
    'listing_appointments',
    'property_showings',
    -- Flight plans & outreach
    'flight_plans',
    'flight_plan_steps',
    'outreach_queue',
    -- Calendar
    'calendar_events',
    -- Settings (blocks ALL writes from authenticated users when sandbox is on)
    'user_settings'
  ];
BEGIN
  FOR i IN 1..array_length(tables, 1) LOOP
    tbl := tables[i];

    -- Block INSERT
    EXECUTE format(
      'CREATE POLICY sandbox_block_insert ON public.%I AS RESTRICTIVE
       FOR INSERT TO authenticated
       WITH CHECK (NOT public.is_sandbox_active_for_current_user())',
      tbl
    );

    -- Block UPDATE
    EXECUTE format(
      'CREATE POLICY sandbox_block_update ON public.%I AS RESTRICTIVE
       FOR UPDATE TO authenticated
       USING (NOT public.is_sandbox_active_for_current_user())',
      tbl
    );

    -- Block DELETE
    EXECUTE format(
      'CREATE POLICY sandbox_block_delete ON public.%I AS RESTRICTIVE
       FOR DELETE TO authenticated
       USING (NOT public.is_sandbox_active_for_current_user())',
      tbl
    );
  END LOOP;
END;
$$;

-- ── Supabase Storage guard ──────────────────────────────────────────────────
-- Storage policies live in the storage schema. We add restrictive policies
-- on the objects table for the buckets that sandbox should protect.
-- NOTE: If storage RLS isn't enabled or these buckets don't exist yet,
-- the client-side guard is the primary defense for file uploads.
DO $$
BEGIN
  -- Guard profile-media bucket (avatars, logos, agent cutouts)
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'profile-media') THEN
    BEGIN
      CREATE POLICY sandbox_block_storage_insert ON storage.objects AS RESTRICTIVE
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id != 'profile-media'
          OR NOT public.is_sandbox_active_for_current_user()
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      CREATE POLICY sandbox_block_storage_update ON storage.objects AS RESTRICTIVE
        FOR UPDATE TO authenticated
        USING (
          bucket_id != 'profile-media'
          OR NOT public.is_sandbox_active_for_current_user()
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      CREATE POLICY sandbox_block_storage_delete ON storage.objects AS RESTRICTIVE
        FOR DELETE TO authenticated
        USING (
          bucket_id != 'profile-media'
          OR NOT public.is_sandbox_active_for_current_user()
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  -- Guard receipt-media bucket
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'receipt-media') THEN
    BEGIN
      CREATE POLICY sandbox_block_receipt_storage_insert ON storage.objects AS RESTRICTIVE
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id != 'receipt-media'
          OR NOT public.is_sandbox_active_for_current_user()
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      CREATE POLICY sandbox_block_receipt_storage_update ON storage.objects AS RESTRICTIVE
        FOR UPDATE TO authenticated
        USING (
          bucket_id != 'receipt-media'
          OR NOT public.is_sandbox_active_for_current_user()
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      CREATE POLICY sandbox_block_receipt_storage_delete ON storage.objects AS RESTRICTIVE
        FOR DELETE TO authenticated
        USING (
          bucket_id != 'receipt-media'
          OR NOT public.is_sandbox_active_for_current_user()
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;
