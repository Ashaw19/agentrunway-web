// Canonical voice constants — web re-export shim.
//
// As of 2026-05-26 the canonical strings live at
// packages/core/tax-copy/disclaimer.ts (workspace package
// @agent-runway/core). This file remains as a back-compat re-export so the
// six existing web import sites continue to resolve without churn. New code
// should import directly from @agent-runway/core/tax-copy/disclaimer.
//
// DO NOT deviate from this wording without tax-expenses-champion +
// ai-flight-crew-champion sign-off.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Spec:      memory/spec_mobile_tax_info_not_advice_baseline.md §3
//
// Audit 2 (2026-04-22) canonicalized the wording. The 2026-05-26 shared-lib
// back-port moved the source of truth into packages/core/tax-copy/ to
// unblock mobile parity (mobile parity audit gap #4).
//
// Forbidden verbs in tax context: should, recommend, must, consult, need,
// suggest, encourage, urge, remind. Safe verbs: indicates, estimates,
// verify, may, could, based on.
//
// Mirror copy exists at
// apps/web/supabase/functions/mcp-server/lib/constants.ts for Deno edge
// functions (which cannot import from the Next.js workspace). Any change
// to the canonical strings in packages/core/tax-copy/disclaimer.ts must be
// mirrored there in the same commit.

export {
  CANONICAL_TAX_DISCLAIMER,
  CANONICAL_TAX_DISCLAIMER_SHORT,
} from "@agent-runway/core/tax-copy/disclaimer";
