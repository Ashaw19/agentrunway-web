-- 00130 · Retention sweep indexes (Phase 1 of IOPs remediation)
--
-- Two pg_cron jobs run daily DELETEs filtered by created_at:
--   - user_security_events retention sweep (03:00 UTC) — `WHERE created_at < now() - interval '2 years'`
--   - mcp_events cleanup (04:00 Sundays)              — same shape
--
-- Both tables have RLS-friendly composite indexes leading with another column
-- (user_id, event_type), so the planner cannot use them to satisfy a
-- created_at-only predicate. Result: daily Seq Scan of the entire table,
-- contributing to the chronic IOPs drain.
--
-- Adding standalone (created_at) btree indexes converts these sweeps into
-- index range scans. Tables are append-only audit logs and small enough
-- that we can build the indexes inline without CONCURRENTLY (apply_migration
-- wraps in a transaction; CONCURRENTLY would error). Brief write lock during
-- creation is acceptable for these tables.

CREATE INDEX IF NOT EXISTS idx_user_security_events_created_at
  ON public.user_security_events (created_at);

CREATE INDEX IF NOT EXISTS idx_mcp_events_created_at
  ON public.mcp_events (created_at);
