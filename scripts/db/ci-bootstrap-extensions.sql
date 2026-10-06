-- Extensions prod enabled from the Supabase dashboard rather than in a
-- migration file. check-functions.sh applies this before replaying
-- migrations so the fresh database matches prod.
-- Source: select extname from pg_extension (prod, 2026-10-06).
-- Not mirrored: pg_net, pgmq, btree_gist, supabase_vault, pg_stat_statements —
-- no migration or function references them.

create extension if not exists pg_cron     with schema pg_catalog;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
