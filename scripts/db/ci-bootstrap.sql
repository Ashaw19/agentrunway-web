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
