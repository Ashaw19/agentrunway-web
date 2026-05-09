-- migration: 00148_corp_sred_entries
-- SR&ED daily work-log entries for Agent Runway Inc.
-- (internal Director Cockpit — not customer-facing)
--
-- Replaces the flat markdown file as the canonical SR&ED record.
-- Each row is one work session (typically one day).
-- sred_weight drives eligible-hours computation in the annual summary view.
--
-- Eligible-hours weights:
--   high   → 1.00  (direct SR&ED — novel design, tech uncertainty resolution)
--   medium → 0.50  (mixed — some SR&ED work, some routine)
--   low    → 0.15  (support activities — project management, documentation)
--   none   → 0.00  (non-SR&ED — marketing, admin, sales)

-- ── Main table ────────────────────────────────────────────────────────────────

create table if not exists corp_sred_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  entry_date      date not null,
  hours           numeric(5,2) not null check (hours > 0 and hours <= 24),
  work_summary    text not null,          -- "what I built today" (T661 narrative)
  tech_challenges text,                   -- technological uncertainty or advancement
  sred_note       text,                   -- SR&ED characterization/weight rationale
  sred_weight     text not null default 'high' check (
    sred_weight in ('none', 'low', 'medium', 'high')
  ),
  commits_count   int,                    -- optional Git commit count for the day
  pr_refs         text,                   -- comma-sep PR numbers / refs
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── updated_at trigger ────────────────────────────────────────────────────────

create or replace function set_corp_sred_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_corp_sred_entries_updated_at
  before update on corp_sred_entries
  for each row execute function set_corp_sred_entries_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists idx_corp_sred_entries_user_date
  on corp_sred_entries(user_id, entry_date desc);

-- Note: expression index on year omitted — date index covers year-range queries.
-- GROUP BY date_part('year', entry_date)::int is used in the view below.

-- ── Annual summary view ───────────────────────────────────────────────────────
-- Used by the Director tool and SR&ED summary page.
-- eligible_hours = weight-adjusted hours (for T661 labour quantum).

create or replace view v_corp_sred_annual_summary as
select
  user_id,
  date_part('year', entry_date)::int             as fiscal_year,
  count(*)                                        as entry_count,
  sum(hours)                                      as total_hours,
  sum(
    case sred_weight
      when 'high'   then hours
      when 'medium' then hours * 0.5
      when 'low'    then hours * 0.15
      else 0
    end
  )                                               as eligible_hours,
  sum(case when sred_weight = 'high'   then hours else 0 end) as high_hours,
  sum(case when sred_weight = 'medium' then hours else 0 end) as medium_hours,
  sum(case when sred_weight = 'low'    then hours else 0 end) as low_hours,
  sum(case when sred_weight = 'none'   then hours else 0 end) as none_hours
from corp_sred_entries
group by user_id, date_part('year', entry_date)::int;

-- ── Row-level security ────────────────────────────────────────────────────────

alter table corp_sred_entries enable row level security;

create policy "corp_sred_entries_select"
  on corp_sred_entries for select
  using (cockpit_has_access());

create policy "corp_sred_entries_insert"
  on corp_sred_entries for insert
  with check (cockpit_has_access());

create policy "corp_sred_entries_update"
  on corp_sred_entries for update
  using (cockpit_has_access())
  with check (cockpit_has_access());

create policy "corp_sred_entries_delete"
  on corp_sred_entries for delete
  using (cockpit_has_access());
