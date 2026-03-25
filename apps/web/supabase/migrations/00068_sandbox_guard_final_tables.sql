-- ============================================================================
-- Agent Runway — Sandbox Write Guard: Final Tables
-- Extends 00066/00067 to cover remaining user-data tables.
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'milestones',
    'agent_profiles',
    'team_deals',
    'market_data_points',
    'newsletter_queue'
  ];
BEGIN
  FOR i IN 1..array_length(tables, 1) LOOP
    tbl := tables[i];

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      RAISE NOTICE 'Skipping % — table does not exist', tbl;
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format(
        'CREATE POLICY sandbox_block_insert ON public.%I AS RESTRICTIVE
         FOR INSERT TO authenticated
         WITH CHECK (NOT public.is_sandbox_active_for_current_user())',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY sandbox_block_update ON public.%I AS RESTRICTIVE
         FOR UPDATE TO authenticated
         USING (NOT public.is_sandbox_active_for_current_user())',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

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
