-- ============================================================================
-- Migration 00168: persist Flight Control "Dismiss"
--
-- Andrew (2026-10-06): dismissing a suggested contact, then refreshing,
-- brought it straight back. Dismiss was React state only (07-19 QA #17).
--
-- One row = one dismissed occurrence: (client, opportunity type, trigger
-- date), the same key outreach_queue is unique on. Next month's idle
-- check-in or next year's anniversary is a new occurrence. Read by
-- getTopOpportunities (Scan) and detectAndDraftForUser (nightly drafts) via
-- lib/crm/dismissed-opportunities.ts.
--
-- fn_merge_clients: a single, independent client FK plus id/user_id, so the
-- generic FK loop repoints it; a duplicate on the surviving client raises
-- unique_violation, which the loop handles by deleting the loser's row.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.flight_control_dismissals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  client_id        uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  opportunity_type text        NOT NULL,
  trigger_date     date        NOT NULL,
  dismissed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_control_dismissals_occurrence_key
    UNIQUE (user_id, client_id, opportunity_type, trigger_date)
);

ALTER TABLE public.flight_control_dismissals ENABLE ROW LEVEL SECURITY;

-- (select auth.uid()) form per 00130/00131 (initplan, evaluated once per query).
CREATE POLICY "flight_control_dismissals_select_own"
  ON public.flight_control_dismissals FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "flight_control_dismissals_insert_own"
  ON public.flight_control_dismissals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = client_id AND c.user_id = (select auth.uid()))
  );

CREATE POLICY "flight_control_dismissals_delete_own"
  ON public.flight_control_dismissals FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

REVOKE ALL ON public.flight_control_dismissals FROM anon;
