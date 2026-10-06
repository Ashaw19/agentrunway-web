-- Make a fresh supabase/postgres container look like prod before
-- check-functions.sh replays the migrations. Covers what prod has that no
-- migration file creates.

-- ── 1. Extensions prod enabled from the Supabase dashboard ──────────────────
-- Source: select extname from pg_extension (prod, 2026-10-06).
-- Not mirrored: pg_net, pgmq, btree_gist, supabase_vault, pg_stat_statements —
-- no migration or function references them.

create extension if not exists pg_cron     with schema pg_catalog;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ── 2. Storage tables ───────────────────────────────────────────────────────
-- In real Supabase the Storage API service creates these; the bare database
-- image doesn't. Migrations insert buckets (ON CONFLICT (id)) and put RLS
-- policies on storage.objects using storage.foldername(). Columns copied from
-- prod's information_schema (2026-10-06); the buckettype enum is plain text
-- here because nothing in the migrations reads it.

create schema if not exists storage;

create table if not exists storage.buckets (
  id                                 text primary key,
  name                               text not null,
  owner                              uuid,
  created_at                         timestamptz default now(),
  updated_at                         timestamptz default now(),
  public                             boolean default false,
  avif_autodetection                 boolean default false,
  file_size_limit                    bigint,
  allowed_mime_types                 text[],
  owner_id                           text,
  type                               text not null default 'STANDARD',
  versioning_status                  text not null default 'DISABLED',
  lifecycle_configuration            jsonb,
  lifecycle_configuration_generation uuid
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[],
  version          text,
  owner_id         text,
  user_metadata    jsonb,
  archived_at      timestamptz,
  is_delete_marker boolean not null default false,
  is_versioned     boolean not null default false
);

alter table storage.objects enable row level security;

-- Same body as prod's storage.foldername(text).
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

-- ── 3. Prod objects no migration creates ────────────────────────────────────
-- public.profiles predates the migration files (Supabase starter template)
-- and 00131 rewrites its RLS policies. Unused by app code. Shape from prod
-- (2026-10-06): id PK, email, created_at; RLS on; no triggers.

create table if not exists public.profiles (
  id         uuid primary key,
  email      text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- Functions prod has that no migration creates; 00160 ALTERs/REVOKEs them.
-- Definitions copied verbatim from prod (pg_get_functiondef, 2026-10-06).

-- Supabase "auto-enable RLS" event trigger (dashboard setting in prod).
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();

-- Stripe Sync Engine schema (created by the integration, not a migration).
-- Only the functions 00160 touches; their tables don't matter here.
create schema if not exists stripe;

CREATE OR REPLACE FUNCTION stripe.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'stripe', 'public'
AS $function$
BEGIN
  -- Support both legacy "updated_at" and newer "_updated_at" columns.
  -- jsonb_populate_record silently ignores keys that are not present on NEW.
  NEW := jsonb_populate_record(
    NEW,
    jsonb_build_object(
      'updated_at', now(),
      '_updated_at', now()
    )
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION stripe.set_updated_at_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'stripe', 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION stripe.check_rate_limit(rate_key text, max_requests integer, window_seconds integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'stripe', 'public'
AS $function$
DECLARE
  now TIMESTAMPTZ := clock_timestamp();
  window_length INTERVAL := make_interval(secs => window_seconds);
  current_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(rate_key));

  INSERT INTO "stripe"."_rate_limits" (key, count, window_start)
  VALUES (rate_key, 1, now)
  ON CONFLICT (key) DO UPDATE
  SET count = CASE
                WHEN "_rate_limits".window_start + window_length <= now
                  THEN 1
                  ELSE "_rate_limits".count + 1
              END,
      window_start = CASE
                       WHEN "_rate_limits".window_start + window_length <= now
                         THEN now
                         ELSE "_rate_limits".window_start
                     END;

  SELECT count INTO current_count FROM "stripe"."_rate_limits" WHERE key = rate_key;

  IF current_count > max_requests THEN
    RAISE EXCEPTION 'Rate limit exceeded for %', rate_key;
  END IF;
END;
$function$;

-- ── 4. Rows migrations assume exist ─────────────────────────────────────────
-- 00132 seeds Director Cockpit vendors against the founder's auth user and
-- aborts if that user is missing. A placeholder user with the same email
-- lets it replay. Throwaway CI database only.

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000132', 'andrew@andrewdshaw.ca')
on conflict do nothing;
