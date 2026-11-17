-- ============================================================================
-- Migration 00192: persist the briefing's dismiss (✕)
--
-- Andrew (2026-11-17): dismissing every item in the CRM tab's "Today's
-- briefing", then refreshing, brought them all back. The ✕ was React state
-- only, the same bug Flight Control had before 00168.
--
-- One row = one dismissed briefing item, saved under the item's dismissKey
-- (packages/core/engines/crm-analytics-engine.ts, briefingDismissKey). A
-- contact check-in's key carries the last contact's day, so logging a contact
-- ends the dismissal; a birthday or anniversary key carries its year or
-- closing month, so next year's is a new item. computeIntelligenceBriefing
-- drops dismissed keys before its caps, on the CRM tab, the dashboard and the
-- phone (/api/mobile/briefing).
--
-- client_id is null for an item with no client (a listing appointment with no
-- client). fn_merge_clients: one independent client FK plus id/user_id, so
-- the generic FK loop repoints it; dismiss_key never names the surviving
-- client, so the unique key can't clash.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.briefing_dismissals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  client_id    uuid                 REFERENCES public.clients(id) ON DELETE CASCADE,
  dismiss_key  text        NOT NULL CHECK (char_length(dismiss_key) BETWEEN 1 AND 300),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT briefing_dismissals_key UNIQUE (user_id, dismiss_key)
);

CREATE INDEX IF NOT EXISTS briefing_dismissals_client_idx
  ON public.briefing_dismissals (client_id);

ALTER TABLE public.briefing_dismissals ENABLE ROW LEVEL SECURITY;

-- (select auth.uid()) form per 00130/00131 (initplan, evaluated once per query).
CREATE POLICY "briefing_dismissals_select_own"
  ON public.briefing_dismissals FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "briefing_dismissals_insert_own"
  ON public.briefing_dismissals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND (
      client_id IS NULL
      OR EXISTS (SELECT 1 FROM public.clients c
                  WHERE c.id = client_id AND c.user_id = (select auth.uid()))
    )
  );

CREATE POLICY "briefing_dismissals_delete_own"
  ON public.briefing_dismissals FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

REVOKE ALL ON public.briefing_dismissals FROM anon;

-- New tables aren't exposed to the Data API without a grant (new-table-grants
-- guard). The CRM tab writes with the signed-in client; the phone's briefing
-- route reads with the service role.
GRANT SELECT, INSERT, DELETE ON public.briefing_dismissals TO authenticated, service_role;
