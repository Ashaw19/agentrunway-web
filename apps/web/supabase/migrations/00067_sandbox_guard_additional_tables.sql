-- ============================================================================
-- Agent Runway — Sandbox Write Guard: Additional Tables
-- Extends 00066 to cover tables that were missed in the initial sweep.
-- Same strategy: RESTRICTIVE RLS policies that block INSERT/UPDATE/DELETE
-- when is_sandbox_active_for_current_user() returns TRUE.
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    -- External service connections
    'google_connections',
    'email_connections',
    'social_connections',
    'social_posts',
    -- Plaid (bank sync)
    'plaid_items',
    'plaid_transactions',
    -- AI / document data
    'property_analyses',
    'drive_documents',
    -- Organization tables
    'organizations',
    'organization_members',
    'organization_invitations',
    'security_audit_log',
    -- Misc
    'import_telemetry',
    'receipt_upload_tokens'
  ];
BEGIN
  FOR i IN 1..array_length(tables, 1) LOOP
    tbl := tables[i];

    -- Skip if table doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      RAISE NOTICE 'Skipping % — table does not exist', tbl;
      CONTINUE;
    END IF;

    -- Block INSERT
    BEGIN
      EXECUTE format(
        'CREATE POLICY sandbox_block_insert ON public.%I AS RESTRICTIVE
         FOR INSERT TO authenticated
         WITH CHECK (NOT public.is_sandbox_active_for_current_user())',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Block UPDATE
    BEGIN
      EXECUTE format(
        'CREATE POLICY sandbox_block_update ON public.%I AS RESTRICTIVE
         FOR UPDATE TO authenticated
         USING (NOT public.is_sandbox_active_for_current_user())',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Block DELETE
    BEGIN
      EXECUTE format(
        'CREATE POLICY sandbox_block_delete ON public.%I AS RESTRICTIVE
         FOR DELETE TO authenticated
         USING (NOT public.is_sandbox_active_for_current_user())',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END;
$$;
