-- 00160: Function hardening ahead of Ellis team onboarding.
-- Clears the Supabase advisor WARN backlog on app-level functions:
--
-- 1) search_path pinning — functions without a pinned search_path are
--    hijackable via schema shadowing when invoked by definer/elevated
--    contexts. Pin every APP function flagged (btree_gist extension
--    internals in the stripe schema are deliberately untouched).
--
-- 2) Revoke anon EXECUTE on SECURITY DEFINER functions — all of these
--    internally re-assert auth.uid() (verified by the 2026-07-02 QA
--    audit), so anon calls always fail — but pre-auth API callers have
--    no business reaching them. Defense in depth; authenticated grants
--    are unchanged (app code calls several via supabase.rpc()).

-- ── 1. Pin search_path (behaviour-preserving: pins to the schema(s)
--       the function bodies already resolve against) ──────────────────

ALTER FUNCTION public.assign_corp_resolution_number()        SET search_path = public;
ALTER FUNCTION public.feature_flags_update_timestamp()       SET search_path = public;
ALTER FUNCTION public.fn_email_connections_updated_at()      SET search_path = public;
ALTER FUNCTION public.fn_org_expense_filing_status(p_org_id uuid)  SET search_path = public;
ALTER FUNCTION public.fn_org_pending_deals_summary(p_org_id uuid)  SET search_path = public;
ALTER FUNCTION public.generate_inbound_alias()               SET search_path = public;
ALTER FUNCTION public.new_role_is_not_owner(r org_member_role) SET search_path = public;
ALTER FUNCTION public.set_client_first_contacted()           SET search_path = public;
ALTER FUNCTION public.set_corp_doc_updated_at()              SET search_path = public;
ALTER FUNCTION public.set_corp_resolution_updated_at()       SET search_path = public;
ALTER FUNCTION public.set_corp_sred_entries_updated_at()     SET search_path = public;
ALTER FUNCTION public.set_outreach_queue_updated_at()        SET search_path = public;
ALTER FUNCTION public.update_client_last_contact()           SET search_path = public;
ALTER FUNCTION public.update_testimonials_updated_at()       SET search_path = public;
ALTER FUNCTION public.update_updated_at()                    SET search_path = public;

ALTER FUNCTION stripe.set_updated_at()                       SET search_path = stripe, public;
ALTER FUNCTION stripe.set_updated_at_metadata()              SET search_path = stripe, public;
ALTER FUNCTION stripe.check_rate_limit(rate_key text, max_requests integer, window_seconds integer)
                                                             SET search_path = stripe, public;

-- ── 2. Revoke anon EXECUTE on SECURITY DEFINER functions ──────────────

REVOKE EXECUTE ON FUNCTION public.fn_advance_buyer_stage(p_deal_id uuid, p_stage text)                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_mark_opportunity_lost(p_id uuid, p_source text, p_lost_reason text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_org_crm_activity_summary(p_org_id uuid)                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_org_expense_filing_status(p_org_id uuid)                                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_org_pending_deals_summary(p_org_id uuid)                                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_promote_listing_appointment(p_listing_id uuid)                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_promote_referral(p_referral_id uuid, p_target text, p_buyer_stage text)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_org_member_self_update()                                              FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_seat_lock(p_org_id uuid)                                            FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_inbound_alias(alias_token text)                                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                                                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_expenses(p_user_id uuid)                                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_bank_statement_counts()                                                FROM anon;
REVOKE EXECUTE ON FUNCTION public.try_acquire_seat_lock(p_org_id uuid, p_ttl_seconds integer)                 FROM anon;
