-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00119: user_security_events
-- ─────────────────────────────────────────────────────────────────────────────
-- Records security-relevant events per USER (auth, billing, account, data,
-- integration, general security). Distinct from public.security_audit_log
-- (migration 00033), which is org-scoped and tracks team membership actions.
--
-- Used for:
--   • user-facing transparency (future "recent account activity" view)
--   • breach-response forensics (who did what, when, from where)
--   • regulatory evidence (PIPEDA/Law 25 breach investigations)
--
-- PII policy: this table stores ONLY non-PII context. Raw IPs are never stored
-- — only the first 16 hex chars of a SHA-256 hash so that correlation is
-- possible without retaining identity. User agent is truncated to 500 chars.
-- Emails, phone numbers, SINs, addresses MUST NEVER be written to `metadata`.
--
-- See apps/web/lib/audit-log.ts for the write helper.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.user_security_events (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type       TEXT         NOT NULL,
  event_category   TEXT         NOT NULL,
  actor_user_id    UUID,        -- who performed the action; differs from user_id for org admin actions
  metadata         JSONB,       -- event-specific context — MUST be PII-free
  ip_address_hash  TEXT,        -- SHA-256(ip)[0..16] — correlation without identity
  user_agent       TEXT,        -- truncated client hint; not PII by itself
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT valid_user_event_category CHECK (
    event_category IN ('auth', 'billing', 'account', 'team', 'data', 'integration', 'security')
  )
);

COMMENT ON TABLE public.user_security_events IS
  'Per-user security-relevant events. Non-PII only. Distinct from public.security_audit_log (org-scoped team audit trail from migration 00033).';

-- Hot path: user pulls their own recent events
CREATE INDEX idx_user_sec_events_user_created
  ON public.user_security_events (user_id, created_at DESC);

-- Investigation path: search by event type across all users
CREATE INDEX idx_user_sec_events_event_type
  ON public.user_security_events (event_type, created_at DESC);

-- Filtering by category (e.g. show only billing events)
CREATE INDEX idx_user_sec_events_category
  ON public.user_security_events (event_category, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security: users read their own log, writes are service-role only
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_security_events ENABLE ROW LEVEL SECURITY;

-- Users can SELECT rows where they are the subject
CREATE POLICY users_read_own_security_events
  ON public.user_security_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users CANNOT insert/update/delete from the client — no INSERT/UPDATE/DELETE
-- policy exists, so the default deny applies. All writes must go through the
-- service-role client in lib/audit-log.ts (which bypasses RLS).

GRANT SELECT ON public.user_security_events TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Retention: purge entries older than 2 years
-- ─────────────────────────────────────────────────────────────────────────────
-- Two-year retention is the middle of the road: long enough to investigate a
-- breach that's discovered months after the fact, short enough not to retain
-- activity indefinitely. Users have a legitimate expectation that very old
-- account activity won't be kept forever.
SELECT cron.schedule(
  'user-security-events-retention',
  '0 3 * * *', -- 3 AM UTC daily
  $$DELETE FROM public.user_security_events WHERE created_at < now() - interval '2 years'$$
);
