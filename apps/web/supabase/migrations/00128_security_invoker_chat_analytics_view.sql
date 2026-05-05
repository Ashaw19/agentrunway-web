-- 00128 · Security definer view advisor cleanup
--
-- Supabase advisor flagged two CRITICAL "Security Definer View" warnings on
-- 2026-05-04. Both views ran with security_invoker=false (legacy default),
-- meaning they execute with the creator's privileges and bypass RLS on
-- underlying tables.
--
-- These two views need different treatments:

-- ── 1. chat_analytics_daily_summary ──────────────────────────────────────────
-- Used only by Owen (AI knowledge audit cron) running as service role, which
-- bypasses RLS regardless. No app-level callers found in apps/. Safe to flip
-- to security_invoker=true so any future caller respects RLS on chat_analytics.
ALTER VIEW public.chat_analytics_daily_summary SET (security_invoker = true);

-- ── 2. org_agent_performance ─────────────────────────────────────────────────
-- INTENTIONAL EXCEPTION — DO NOT FLIP TO security_invoker=true.
--
-- Migration 00113 (org_view_security_definer) deliberately set this view to
-- security_invoker=false so team leaders (e.g., Erin in the Ellis Realty beta)
-- can aggregate metrics across their org members. RLS on transactions /
-- pipeline_deals / user_settings is per-user — flipping invoker would block
-- leaders from seeing member rows and silently break the org dashboard,
-- reports, chat context, and team-comparative-engine.
--
-- The advisor warning will remain on this view by design. Long-term
-- mitigation (queued, not in this migration): replace the view with a
-- SECURITY DEFINER function that performs explicit org-membership
-- authorization in its body, which satisfies the advisor without changing
-- behavior.
COMMENT ON VIEW public.org_agent_performance IS
  'INTENTIONAL SECURITY DEFINER (security_invoker=false). Required so team leaders can aggregate metrics across org members; RLS on underlying tables is per-user. See migration 00113. Long-term: replace with SECURITY DEFINER function with org-membership auth check.';
