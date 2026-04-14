-- ============================================================================
-- 00115 · Fix generate_inbound_alias unqualified gen_random_bytes call
-- ============================================================================
-- Bug: P0 — ALL new user signups broken in prod.
--
-- Trigger chain:
--   1. gotrue inserts into auth.users with search_path=auth
--   2. on_auth_user_created trigger fires public.handle_new_user()
--      (SECURITY DEFINER, search_path=public)
--   3. handle_new_user inserts into user_settings
--   4. BEFORE INSERT trigger user_settings_inbound_alias fires
--      public.generate_inbound_alias()
--   5. That function had no SET search_path and called gen_random_bytes()
--      unqualified. pgcrypto lives in the `extensions` schema, which is
--      NOT in search_path at this point, so the call fails with
--      `function gen_random_bytes(integer) does not exist` and the whole
--      auth.users INSERT rolls back.
--
-- Fix: qualify the call as `extensions.gen_random_bytes`. This is resilient
-- to any future search_path changes and matches Supabase's convention for
-- functions that may be invoked from contexts without extensions on the
-- path.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_inbound_alias()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.inbound_alias IS NULL OR NEW.inbound_alias = '' THEN
    NEW.inbound_alias := lower(
      substring(encode(extensions.gen_random_bytes(12), 'hex') from 1 for 16)
    );
  END IF;
  RETURN NEW;
END;
$function$;
