-- ============================================================================
-- 00151 · organizations — beta → paid conversion provenance
-- ============================================================================
-- Adds `beta_converted_at` so we have an auditable, queryable record of when a
-- beta org was deliberately converted to a billable org (is_beta flipped to
-- false). NULL = never converted (either still beta, or always was paid).
--
-- Why a column, not just an audit-log row:
--   * The UI needs to distinguish "beta org" from "beta org that has been
--     converted and is mid-checkout" so it can swap the "Beta — Lifetime Free"
--     badge for a "Subscribe Team" CTA *before* the Stripe subscription exists.
--   * It is non-billing-sensitive (no Stripe IDs), so it is safe to expose to
--     plain members via the column-level SELECT grant — unlike
--     stripe_customer_id / stripe_subscription_id (revoked in 00117 / 00118).
--
-- RLS: `organizations` already has RLS enabled (00033) with org_member_read /
-- org_admin_update / org_owner_insert / org_owner_delete. No new table is
-- created, so no new RLS policy is required. We only need to extend the
-- column-level SELECT grant established in 00118 so the public projection can
-- read this new column.
--
-- The flip itself is performed server-side via the admin (service-role) client
-- after an explicit owner authz check (see lib/actions/beta-conversion.ts) —
-- the same pattern as create-team-checkout / update-seats billing writes.
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS beta_converted_at TIMESTAMPTZ;

COMMENT ON COLUMN organizations.beta_converted_at IS
  'When the org was deliberately converted from beta (is_beta=true) to billable (is_beta=false). NULL = never converted. Set by lib/actions/beta-conversion.ts.';

-- 00118 revoked table-level SELECT and re-granted an explicit safe-column list.
-- Extend that grant to include beta_converted_at (non-billing-sensitive).
GRANT SELECT (beta_converted_at) ON organizations TO authenticated;
