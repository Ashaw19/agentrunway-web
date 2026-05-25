-- migration: 00150_corp_sred_entries_unique_date
-- Add unique constraint on (user_id, entry_date) to support idempotent
-- upserts from the Marcus scheduled SR&ED logging routine.
-- Required before Marcus switches from flat-file to Supabase-direct writes.

alter table corp_sred_entries
  add constraint corp_sred_entries_user_date_unique
  unique (user_id, entry_date);
