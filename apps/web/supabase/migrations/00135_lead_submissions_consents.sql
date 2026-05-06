-- Migration 00135: lead_submissions + consents tables
-- Lead-gen form submissions (open house signup, listing inquiry) and
-- CASL-compliant consent audit trail.

-- ─────────────────────────────────────────────────────────────────────────────
-- lead_submissions
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists lead_submissions (
  id            uuid        primary key default gen_random_uuid(),
  form_type     text        not null check (form_type in ('open_house', 'listing_inquiry')),
  first_name    text        not null,
  last_name     text        not null,
  email         text        not null,
  phone         text,
  property_address text,
  message       text,
  created_at    timestamptz not null default now()
);

alter table lead_submissions enable row level security;

-- Service-role key (used by API routes) bypasses RLS automatically.
-- No anon SELECT/INSERT allowed — all writes go through the server-side API.

-- ─────────────────────────────────────────────────────────────────────────────
-- consents
-- CASL audit trail: retain for 3 years after business relationship ends.
-- Stores the exact consent language string, not just a boolean.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists consents (
  id                uuid        primary key default gen_random_uuid(),
  email             text        not null,
  form_type         text        not null,
  ip_address        text,
  consented_at      timestamptz not null default now(),
  consent_language  text        not null,
  form_url          text
);

alter table consents enable row level security;

-- No anon access — service-role writes only.

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists lead_submissions_email_idx      on lead_submissions (email);
create index if not exists lead_submissions_form_type_idx  on lead_submissions (form_type);
create index if not exists lead_submissions_created_at_idx on lead_submissions (created_at desc);
create index if not exists consents_email_idx              on consents (email);
create index if not exists consents_consented_at_idx       on consents (consented_at desc);
