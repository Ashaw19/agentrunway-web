// Canonical tax-disclaimer strings — shared across web, mobile, and (via
// sync-discipline mirror) the Deno MCP edge runtime. DO NOT deviate from
// this wording without tax-expenses-champion + ai-flight-crew-champion
// sign-off.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Spec:      memory/spec_mobile_tax_info_not_advice_baseline.md §1
//
// Audit 2 (2026-04-22) canonicalized both strings; this module is the
// post-2026-05-26 source of truth, replacing the previous canonical
// location at apps/web/lib/flight-crew/constants.ts (which now re-exports
// from here).
//
// Forbidden verbs in tax context: should, recommend, must, consult, need,
// suggest, encourage, urge, remind. Safe verbs: indicates, estimates,
// verify, may, could, based on.
//
// The MCP edge mirror at
// apps/web/supabase/functions/mcp-server/lib/constants.ts intentionally
// holds duplicate copies of these strings — Deno edge functions cannot
// import from the Next.js workspace. Any change here must be mirrored
// there in the same commit.

/**
 * Canonical tax disclaimer. Used on every surface that emits tax estimates,
 * CRA-rule references, or tax-burden numbers — Navigator responses, Captain
 * tax hand-offs, dashboard tax cards, tax estimator, MCP tool output, blog.
 */
export const CANONICAL_TAX_DISCLAIMER =
  "This is an estimate based on CRA rules and engine calculations. Verify with your accountant or tax professional before making any filing or financial decision.";

/**
 * Short variant for space-constrained UI contexts (tile footers, PDF
 * footers, narrow mobile cards). Preserves the core rule — estimate framing
 * + verify handoff — without the full CRA-source attribution.
 */
export const CANONICAL_TAX_DISCLAIMER_SHORT =
  "Estimate only. Verify with your accountant before filing or making any financial decision.";
