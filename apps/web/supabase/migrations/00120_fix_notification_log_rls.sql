-- Fix notification_log INSERT policy: restrict to service_role only.
-- The original WITH CHECK (true) with no role qualifier defaulted to public,
-- allowing any authenticated user to insert arbitrary rows.

DROP POLICY IF EXISTS "Service role inserts notification log" ON notification_log;

CREATE POLICY "Service role inserts notification log"
  ON notification_log FOR INSERT
  TO service_role
  WITH CHECK (true);
