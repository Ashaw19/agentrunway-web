-- Deleting clients, one or many, in one transaction (web CRM: "Delete
-- Forever…" on a client and the bulk Delete on the list).
--
-- A plain DELETE FROM clients cascades away consent_records and
-- client_email_consents. Those hold a client's email consent and their
-- unsubscribe: delete a client who unsubscribed, re-import them from a phone
-- or a CSV, and Agent Runway would treat them as never having opted out
-- (CASL). It also leaves their deals (client_records, pipeline_deals,
-- co-party links) behind with no client. So a client who has any of those is
-- ARCHIVED (Hangar, restorable) instead of deleted; everyone else is deleted.
-- Their open Checklist items go too (contact_tasks is ON DELETE SET NULL,
-- which left them as loose items with no client).
--
-- p_dry_run = true returns the same split without changing anything, so the
-- confirm dialog can say exactly what will happen.

CREATE OR REPLACE FUNCTION public.fn_delete_clients(
  p_client_ids uuid[],
  p_dry_run    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_owned   uuid[];
  v_keep    uuid[];
  v_delete  uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_ids IS NULL OR cardinality(p_client_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', '[]'::jsonb, 'archived', '[]'::jsonb);
  END IF;
  IF cardinality(p_client_ids) > 5000 THEN
    RAISE EXCEPTION 'too many clients at once (max 5000)' USING ERRCODE = '22023';
  END IF;

  -- Only the caller's own clients; anything else is ignored.
  SELECT coalesce(array_agg(c.id), '{}') INTO v_owned
  FROM clients c
  WHERE c.user_id = v_uid AND c.id = ANY (p_client_ids);

  SELECT coalesce(array_agg(c.id), '{}') INTO v_keep
  FROM clients c
  WHERE c.id = ANY (v_owned)
    AND (
      c.email_opt_out_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM consent_records x WHERE x.client_id = c.id)
      OR EXISTS (SELECT 1 FROM client_email_consents x WHERE x.client_id = c.id)
      OR EXISTS (SELECT 1 FROM client_records x WHERE x.client_id = c.id)
      OR EXISTS (SELECT 1 FROM pipeline_deals x WHERE x.client_id = c.id)
      OR EXISTS (SELECT 1 FROM client_record_co_parties x WHERE x.co_client_id = c.id)
    );

  SELECT coalesce(array_agg(id), '{}') INTO v_delete
  FROM unnest(v_owned) AS id
  WHERE NOT (id = ANY (v_keep));

  IF NOT p_dry_run THEN
    UPDATE clients
       SET archived_at    = coalesce(archived_at, now()),
           archive_reason = coalesce(archive_reason,
                              CASE WHEN email_opt_out_at IS NOT NULL THEN 'do_not_contact' ELSE 'other' END),
           updated_at     = now()
     WHERE user_id = v_uid AND id = ANY (v_keep);

    DELETE FROM contact_tasks
     WHERE user_id = v_uid AND client_id = ANY (v_delete);

    DELETE FROM clients
     WHERE user_id = v_uid AND id = ANY (v_delete);
  END IF;

  RETURN jsonb_build_object('deleted', to_jsonb(v_delete), 'archived', to_jsonb(v_keep));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_delete_clients(uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_delete_clients(uuid[], boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_clients(uuid[], boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_delete_clients(uuid[], boolean) IS
  'Deletes the caller''s clients; archives instead any with a deal, an unsubscribe or consent records (CASL). p_dry_run returns the split only.';
