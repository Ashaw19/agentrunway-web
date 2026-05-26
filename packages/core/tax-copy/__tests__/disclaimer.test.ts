/**
 * Canonical disclaimer self-consistency tests.
 *
 * Reference: memory/feedback_tax_information_not_advice.md
 * Spec:      memory/spec_mobile_tax_info_not_advice_baseline.md §7
 *
 * What these tests prove:
 *   1. The disclaimer strings are byte-identical to the spec §1 wording.
 *   2. The disclaimers themselves pass the lint (the rule cannot tell users
 *      to do anything it tells the disclaimer not to say).
 *   3. Both strings are non-empty and end with a period.
 */

import { describe, it, expect } from "vitest";
import {
  CANONICAL_TAX_DISCLAIMER,
  CANONICAL_TAX_DISCLAIMER_SHORT,
} from "../disclaimer";
import { validateTaxCopy } from "../validate";

describe("CANONICAL_TAX_DISCLAIMER", () => {
  it("matches the canonical wording byte-for-byte", () => {
    // If this test fails, the wording has drifted from
    // memory/spec_mobile_tax_info_not_advice_baseline.md §1. Re-read the
    // spec before changing this expected string; coordinate with
    // tax-expenses-champion + ai-flight-crew-champion + update the MCP
    // mirror at apps/web/supabase/functions/mcp-server/lib/constants.ts.
    expect(CANONICAL_TAX_DISCLAIMER).toBe(
      "This is an estimate based on CRA rules and engine calculations. Verify with your accountant or tax professional before making any filing or financial decision.",
    );
  });

  it("passes the info-not-advice lint with zero error-level diagnostics", () => {
    // Self-consistency: the disclaimer cannot say "should", "must", etc.
    // about itself. Warnings on ambiguous words (e.g., "reserve" as a
    // noun) are tolerated; errors are not.
    const diagnostics = validateTaxCopy(CANONICAL_TAX_DISCLAIMER);
    const errors = diagnostics.filter((d) => d.level === "error");
    expect(errors).toEqual([]);
  });

  it("is non-empty and ends with a period", () => {
    expect(CANONICAL_TAX_DISCLAIMER.length).toBeGreaterThan(0);
    expect(CANONICAL_TAX_DISCLAIMER.endsWith(".")).toBe(true);
  });
});

describe("CANONICAL_TAX_DISCLAIMER_SHORT", () => {
  it("matches the canonical short wording byte-for-byte", () => {
    expect(CANONICAL_TAX_DISCLAIMER_SHORT).toBe(
      "Estimate only. Verify with your accountant before filing or making any financial decision.",
    );
  });

  it("passes the info-not-advice lint with zero error-level diagnostics", () => {
    const diagnostics = validateTaxCopy(CANONICAL_TAX_DISCLAIMER_SHORT);
    const errors = diagnostics.filter((d) => d.level === "error");
    expect(errors).toEqual([]);
  });

  it("is non-empty and ends with a period", () => {
    expect(CANONICAL_TAX_DISCLAIMER_SHORT.length).toBeGreaterThan(0);
    expect(CANONICAL_TAX_DISCLAIMER_SHORT.endsWith(".")).toBe(true);
  });
});
