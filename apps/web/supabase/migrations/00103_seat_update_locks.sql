-- ────────────────────────────────────────────────────────────────────────────
-- Migration 00103 — Seat update distributed lock
-- ────────────────────────────────────────────────────────────────────────────
-- Adds a row-based distributed lock that serializes concurrent Stripe seat
-- update calls for the same organization. Vercel serverless + PgBouncer makes
-- session-level pg_advisory_lock unreliable, so we use a lightweight lock
-- table with TTL-based expiration.
--
-- Acquired via try_acquire_seat_lock(org_id, ttl_seconds) which returns
-- true if the lock was acquired and false if another seat update is in
-- flight. The lock is released by release_seat_lock(org_id) after the
-- Stripe call completes (or via TTL expiry if the route crashes).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seat_update_locks (
  org_id      uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS seat_update_locks_expires_idx
  ON seat_update_locks(expires_at);

-- ── Acquire lock ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION try_acquire_seat_lock(
  p_org_id       uuid,
  p_ttl_seconds  int DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- Sweep any expired locks for this org first
  DELETE FROM seat_update_locks
   WHERE org_id = p_org_id
     AND expires_at < v_now;

  -- Attempt to insert; conflict means another caller still holds the lock
  INSERT INTO seat_update_locks (org_id, acquired_at, expires_at)
  VALUES (p_org_id, v_now, v_now + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (org_id) DO NOTHING;

  RETURN FOUND;
END;
$$;

-- ── Release lock ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION release_seat_lock(p_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM seat_update_locks WHERE org_id = p_org_id;
$$;

-- ── Permissions ─────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION try_acquire_seat_lock(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION release_seat_lock(uuid)          TO service_role;

ALTER TABLE seat_update_locks ENABLE ROW LEVEL SECURITY;
-- No policies → only service_role can read/write (matches the route which
-- already uses the admin client for billing operations).
