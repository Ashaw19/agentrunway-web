-- ============================================================================
-- Migration 00191: routine heartbeats
--
-- Every unattended job (the Vercel cron routes and the Claude Code routines)
-- writes one row here when it finishes. A daily check (/api/cron/routine-
-- check) reads the latest row per routine against the cadence it is expected
-- to keep and emails the agent about any that has gone quiet or ended in an
-- error.
--
-- Why: two routines (Finn and Owen) were deleted some time after 2026-07-29
-- and nothing noticed until 2026-11-02. The outreach detector's last AI call
-- was 2026-10-28 although it is scheduled daily. Silence looked like success.
--
-- No user_id: these are the app's own jobs, not a user's records. Only the
-- service role writes or reads them; the table is invisible to app users.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.routine_heartbeats (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- "cron:<route>" for a Vercel cron, "routine:<name>" for a Claude Code routine.
  routine_id   text        NOT NULL,
  finished_at  timestamptz NOT NULL DEFAULT now(),
  outcome      text        NOT NULL CHECK (outcome IN ('ok', 'error')),
  -- A short line the run wants remembered (what it did, or the error).
  note         text,
  CONSTRAINT routine_heartbeats_note_len CHECK (note IS NULL OR length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS routine_heartbeats_routine_finished
  ON public.routine_heartbeats (routine_id, finished_at DESC);

COMMENT ON TABLE public.routine_heartbeats IS
  'One row per finished run of an unattended routine (00191). Read by /api/cron/routine-check, which alerts on silence.';

ALTER TABLE public.routine_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.routine_heartbeats FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.routine_heartbeats TO service_role;
-- data-api: not exposed: routine_heartbeats (service role only; the cron
-- routes and the Claude routines write it, the routine check reads it)

-- Keep 90 days; the check only reads the latest row per routine.
SELECT cron.schedule(
  'routine-heartbeats-retention',
  '15 3 * * *',
  $$DELETE FROM public.routine_heartbeats WHERE finished_at < now() - interval '90 days'$$
);
