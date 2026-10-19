-- ============================================================================
-- Migration 00188: suggestion holds, and the day's handful
--
-- Phone dashboard "Next up" (design 2026-10-19). Two changes.
--
-- 1. flight_control_dismissals gets Later and Stop holds.
--    A row was always one skipped occurrence (client, opportunity type,
--    trigger date: 00168). Now it has a kind:
--      skip   one occurrence, as before. Every existing row is a skip.
--      later  hold the client until `until` ("in an hour", "tonight",
--             "tomorrow"). The client's slot in the handful is kept.
--      stop   stop suggesting the client until `until` (3 or 6 months).
--             Moving a client to the Hangar is not a hold: it archives them.
--    A hold covers the client, not one reason, so its row uses
--    opportunity_type = 'any' and trigger_date = the Atlantic day it was
--    made. Holding the same client twice in a day replaces the first hold,
--    which is an upsert, and an upsert needs an UPDATE policy: 00168 had none.
--
-- 2. next_up_handful pins the day's picks per client.
--    getTopOpportunities is stateless: a birthday entering its 14-day window
--    would push an untouched client off the list tomorrow, but the design
--    says untouched clients stay until handled (correction 1). A pin closes
--    when the client is contacted, skipped, stopped or archived (those count
--    as done today), or as 'expired' when the reason lapses, for example a
--    birthday that has passed (that one does not count as done). One open
--    pin per client; the phone and the web both sync the handful, and two
--    requests at once must not make a second pin.
--
-- fn_merge_clients: next_up_handful has ONE client FK plus id and user_id, so
-- the generic FK loop repoints it. When both clients hold an open pin, the
-- partial unique index raises unique_violation and the loop deletes the
-- loser's row; handled rows (history) never clash.
-- ============================================================================

-- ── 1. Holds on flight_control_dismissals ───────────────────────────────────

ALTER TABLE public.flight_control_dismissals
  ADD COLUMN kind  text        NOT NULL DEFAULT 'skip',
  ADD COLUMN until timestamptz;

ALTER TABLE public.flight_control_dismissals
  ADD CONSTRAINT flight_control_dismissals_kind_check
    CHECK (kind IN ('skip', 'later', 'stop')),
  -- A skip has no end; a hold always has one.
  ADD CONSTRAINT flight_control_dismissals_until_matches_kind
    CHECK ((kind = 'skip') = (until IS NULL)),
  -- A hold is on the client, not on one reason.
  ADD CONSTRAINT flight_control_dismissals_hold_covers_client
    CHECK (kind = 'skip' OR opportunity_type = 'any');

-- Upserting a hold (ON CONFLICT DO UPDATE) needs UPDATE.
CREATE POLICY "flight_control_dismissals_update_own"
  ON public.flight_control_dismissals FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flight_control_dismissals TO authenticated, service_role;

-- ── 2. The day's handful ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.next_up_handful (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  client_id        uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- The reason the client was picked, as Flight Control named it. Compared
  -- with today's candidates to see when the reason has lapsed.
  opportunity_type text        NOT NULL,
  trigger_date     date        NOT NULL,
  -- Position in the handful, 0 first.
  rank             smallint    NOT NULL CHECK (rank BETWEEN 0 AND 9),
  added_at         timestamptz NOT NULL DEFAULT now(),
  handled_at       timestamptz,
  handled_how      text        CHECK (handled_how IN ('contacted', 'skipped', 'stopped', 'archived', 'expired')),
  -- Open or handled, never half of each.
  CONSTRAINT next_up_handful_handled_pair
    CHECK ((handled_at IS NULL) = (handled_how IS NULL))
);

-- One open pin per client. Handled rows are history and may repeat.
CREATE UNIQUE INDEX next_up_handful_open_client
  ON public.next_up_handful (user_id, client_id)
  WHERE handled_at IS NULL;

CREATE INDEX next_up_handful_user_handled
  ON public.next_up_handful (user_id, handled_at);

ALTER TABLE public.next_up_handful ENABLE ROW LEVEL SECURITY;

-- (select auth.uid()) form per 00130/00131 (initplan, evaluated once per query).
CREATE POLICY "next_up_handful_select_own"
  ON public.next_up_handful FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "next_up_handful_insert_own"
  ON public.next_up_handful FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = client_id AND c.user_id = (select auth.uid()))
  );

CREATE POLICY "next_up_handful_update_own"
  ON public.next_up_handful FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "next_up_handful_delete_own"
  ON public.next_up_handful FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.next_up_handful TO authenticated, service_role;
REVOKE ALL ON public.next_up_handful FROM anon;
