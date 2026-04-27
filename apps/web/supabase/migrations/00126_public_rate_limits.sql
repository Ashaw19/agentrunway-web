-- ============================================================================
-- 00126 · public_rate_limits — IP-keyed limiter for unauthenticated routes
-- ============================================================================
-- The existing `rate_limits` table is keyed by `user_id UUID REFERENCES
-- auth.users(id)`. Unauthenticated routes (POST /api/recruit, POST
-- /api/testimonials) tried to use it by passing an IP string — every
-- upsert silently failed on the UUID type cast, and `checkRateLimit`
-- documents that DB errors fail open. Net: zero limiting on those two
-- public endpoints.
--
-- This adds a parallel table keyed by a TEXT identifier (IP hash) with
-- the same window/count shape so we can rate-limit pre-auth traffic
-- without weakening the auth-user-keyed table's referential integrity.

CREATE TABLE IF NOT EXISTS public_rate_limits (
  key            TEXT        NOT NULL,
  endpoint       TEXT        NOT NULL,
  window_start   TIMESTAMPTZ NOT NULL,
  request_count  INTEGER     NOT NULL DEFAULT 1,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key, endpoint)
);

-- Index on window_start so we can sweep stale rows cheaply
CREATE INDEX IF NOT EXISTS public_rate_limits_window_start_idx
  ON public_rate_limits (window_start);

-- RLS: deny all access to authenticated/anon roles. The limiter only
-- runs server-side via the service-role admin client.
ALTER TABLE public_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_rate_limits_no_anon
  ON public_rate_limits FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Service role bypasses RLS by default; no explicit policy needed.

REVOKE ALL ON public_rate_limits FROM authenticated, anon;
GRANT  ALL ON public_rate_limits TO service_role;

COMMENT ON TABLE public_rate_limits IS
  'Fixed-window rate-limit counters keyed by arbitrary string (e.g. hashed IP) for unauthenticated routes. See lib/rate-limit.ts checkPublicRateLimit.';
