// Canonical voice constants — Deno edge mirror.
// Upstream canonical source: apps/web/lib/flight-crew/constants.ts
// DO NOT deviate from this wording without tax-expenses-champion +
// ai-flight-crew-champion sign-off.
// Reference: memory/feedback_tax_information_not_advice.md
//
// Sync discipline: if the upstream file at
// apps/web/lib/flight-crew/constants.ts changes, mirror the change here in
// the same commit. This mirror exists because Deno edge functions cannot
// import from the Next.js workspace. See ./README.md.

/**
 * Canonical tax disclaimer. Used on every MCP tool output that returns tax
 * estimates, CRA-rule references, or tax-burden numbers.
 */
export const CANONICAL_TAX_DISCLAIMER =
  "This is an estimate based on CRA rules and engine calculations. Verify with your accountant or tax professional before making any filing or financial decision.";

/**
 * Short variant for space-constrained contexts.
 */
export const CANONICAL_TAX_DISCLAIMER_SHORT =
  "Estimate only. Verify with your accountant before filing or making any financial decision.";
