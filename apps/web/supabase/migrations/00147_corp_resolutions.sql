-- migration: 00147_corp_resolutions
-- Corporate director resolutions / minute-book table for Agent Runway Inc.
-- (internal Director Cockpit — not customer-facing)
--
-- Auto-numbering:  {year}-DR-{NNN}  where NNN is zero-padded to 3 digits
-- fiscal_year:     extracted from passed_date in the BEFORE INSERT trigger
-- Immutability:    DELETE is blocked at the API layer for passed resolutions;
--                  the RLS policies allow it at DB level (API is the gate).

-- ── Main table ────────────────────────────────────────────────────────────────

create table if not exists corp_resolutions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  resolution_number text not null,            -- set by BEFORE INSERT trigger
  resolution_type   text not null check (resolution_type in (
    'salary_election', 'dividend_declaration', 'banking_authority',
    'officer_appointment', 'agm_waiver', 'general'
  )),
  subject           text not null,
  body_md           text not null default '',
  passed_date       date not null,
  fiscal_year       integer not null,          -- set by BEFORE INSERT trigger
  status            text not null default 'passed' check (status in ('draft', 'passed')),
  is_unanimous      boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Auto-numbering trigger ────────────────────────────────────────────────────

create or replace function assign_corp_resolution_number()
returns trigger
language plpgsql
as $$
declare
  v_year   int;
  v_seq    int;
  v_num    text;
begin
  v_year := extract(year from new.passed_date)::int;
  new.fiscal_year := v_year;

  select count(*) + 1
    into v_seq
    from corp_resolutions
   where user_id = new.user_id
     and fiscal_year = v_year;

  new.resolution_number := v_year || '-DR-' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

create trigger trg_corp_resolutions_number
  before insert on corp_resolutions
  for each row execute function assign_corp_resolution_number();

-- ── updated_at trigger ────────────────────────────────────────────────────────

create or replace function set_corp_resolutions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_corp_resolutions_updated_at
  before update on corp_resolutions
  for each row execute function set_corp_resolutions_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists idx_corp_resolutions_user_year
  on corp_resolutions(user_id, fiscal_year);

create index if not exists idx_corp_resolutions_user_type
  on corp_resolutions(user_id, resolution_type);

create index if not exists idx_corp_resolutions_user_status
  on corp_resolutions(user_id, status);

-- ── Row-level security ────────────────────────────────────────────────────────

alter table corp_resolutions enable row level security;

create policy "corp_resolutions_select"
  on corp_resolutions for select
  using (cockpit_has_access());

create policy "corp_resolutions_insert"
  on corp_resolutions for insert
  with check (cockpit_has_access());

create policy "corp_resolutions_update"
  on corp_resolutions for update
  using (cockpit_has_access())
  with check (cockpit_has_access());

create policy "corp_resolutions_delete"
  on corp_resolutions for delete
  using (cockpit_has_access());
