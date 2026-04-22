// Canonical voice constants. DO NOT deviate from this wording without
// tax-expenses-champion + ai-flight-crew-champion sign-off.
// Reference: memory/feedback_tax_information_not_advice.md
//
// Audit 2 (2026-04-22) canonicalized all tax disclaimers to this single
// string. Forbidden verbs in tax context: should, recommend, must, consult,
// need, suggest, encourage, urge, remind. Safe verbs: indicates, estimates,
// verify, may, could, based on.
//
// If layout forces a shorter footer variant (dashboard tiles), use
// CANONICAL_TAX_DISCLAIMER_SHORT — but prefer the full string wherever space
// allows. The full string is the one that satisfies the rule.
//
// Mirror copy exists at
// apps/web/supabase/functions/mcp-server/lib/constants.ts for Deno edge
// functions (which cannot import from the Next.js workspace). Any change
// here must be mirrored there in the same commit.

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
