/**
 * Regression suite for the deterministic post-extraction validators.
 *
 * The contract these tests pin:
 *   • Validators FLAG, never discard — a single bad row degrades gracefully and
 *     does NOT kill the batch (the import-robustness guarantee).
 *   • Confidence is downgraded (not the value silently rewritten) so the review
 *     UI can surface the problem to the user.
 *   • applyValidation is pure: it returns a new deal, never mutates the input.
 *   • Out-of-range / garbage values produce issues, never throw.
 */
import { describe, expect, it } from "vitest";
import {
  validateExtractedDeal,
  applyValidation,
} from "../validation/validate-transactions";
import type { ExtractedDeal } from "@/app/api/import-history/route";

function deal(overrides: Partial<ExtractedDeal> = {}): ExtractedDeal {
  return {
    date: "2024-03-15",
    address: "123 Main St",
    sale_price: 450_000,
    gci: 12_000,
    party_a: "Jane Buyer",
    party_b: "John Seller",
    agent_side: 0,
    confidence: {
      gci: "high",
      sale_price: "high",
      names: "high",
      date: "high",
      address: "high",
    },
    ...overrides,
  };
}

describe("validateExtractedDeal — a clean deal produces no issues", () => {
  it("flags nothing for a normal in-range deal", () => {
    const { issues, confidence_overrides } = validateExtractedDeal(deal(), 2024);
    expect(issues).toEqual([]);
    expect(confidence_overrides).toEqual({});
  });
});

describe("validateExtractedDeal — GCI bounds (flag, do not discard)", () => {
  it("flags zero GCI and marks it missing", () => {
    const { issues, confidence_overrides } = validateExtractedDeal(
      deal({ gci: 0 }),
    );
    expect(issues.join(" ")).toMatch(/GCI is zero or missing/);
    expect(confidence_overrides.gci).toBe("missing");
  });

  it("flags a sub-$200 GCI as a probable rate-misread-as-dollars", () => {
    const { issues, confidence_overrides } = validateExtractedDeal(
      deal({ gci: 3 }),
    );
    expect(issues.join(" ")).toMatch(/unusually low/);
    expect(confidence_overrides.gci).toBe("low");
  });

  it("flags an enormous GCI as a probable sale-price misread", () => {
    const { issues, confidence_overrides } = validateExtractedDeal(
      deal({ gci: 600_000 }),
    );
    expect(issues.join(" ")).toMatch(/very high/);
    expect(confidence_overrides.gci).toBe("low");
  });
});

describe("validateExtractedDeal — cross-field sanity", () => {
  it("flags GCI > 25% of sale price (wrong column pulled in)", () => {
    const { issues } = validateExtractedDeal(
      deal({ gci: 200_000, sale_price: 450_000 }),
    );
    expect(issues.join(" ")).toMatch(/% of sale price/);
  });

  it("flags net income exceeding GCI (impossible)", () => {
    const { issues, confidence_overrides } = validateExtractedDeal(
      deal({ gci: 12_000, net_income: 15_000 }),
    );
    expect(issues.join(" ")).toMatch(/exceeds GCI/);
    expect(confidence_overrides.net_income).toBe("low");
  });

  it("flags an out-of-range commission rate (30%)", () => {
    const { issues, confidence_overrides } = validateExtractedDeal(
      deal({ commission_percent: 0.3 }),
    );
    expect(issues.join(" ")).toMatch(/unusually high/);
    expect(confidence_overrides.commission_percent).toBe("low");
  });
});

describe("validateExtractedDeal — date checks", () => {
  it("flags an unparseable date", () => {
    const { issues, confidence_overrides } = validateExtractedDeal(
      deal({ date: "not-a-date" }),
    );
    expect(issues.join(" ")).toMatch(/could not be parsed/);
    expect(confidence_overrides.date).toBe("low");
  });

  it("flags a date whose year does not match the document year", () => {
    const { issues } = validateExtractedDeal(
      deal({ date: "2023-06-01" }),
      2024,
    );
    expect(issues.join(" ")).toMatch(/will not be included in the 2024 totals/);
  });

  it("flags a far-future date beyond the grace window", () => {
    const future = new Date();
    future.setDate(future.getDate() + 200);
    const iso = future.toISOString().slice(0, 10);
    const { issues } = validateExtractedDeal(deal({ date: iso }));
    expect(issues.join(" ")).toMatch(/in the future/);
  });
});

describe("validateExtractedDeal — never throws on garbage", () => {
  it("survives an all-garbage deal (out-of-range crash class)", () => {
    expect(() =>
      validateExtractedDeal(
        deal({
          gci: Number.POSITIVE_INFINITY,
          sale_price: -1,
          net_income: NaN,
          commission_percent: 99,
          date: "garbage",
        }),
      ),
    ).not.toThrow();
  });

  it("a single bad row degrades gracefully — returns issues, not an exception", () => {
    const result = validateExtractedDeal(deal({ gci: 0, sale_price: 1 }));
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("applyValidation — pure, non-mutating", () => {
  it("returns the same object reference fast-path when there is nothing to flag", () => {
    const d = deal();
    expect(applyValidation(d, 2024)).toBe(d);
  });

  it("does not mutate the input deal when issues are appended", () => {
    const d = deal({ gci: 0 });
    const before = JSON.stringify(d);
    const out = applyValidation(d, 2024);
    expect(JSON.stringify(d)).toBe(before); // input untouched
    expect(out).not.toBe(d); // new object
    expect((out.issues ?? []).length).toBeGreaterThan(0);
  });

  it("merges new issues with any pre-existing issues", () => {
    const d = deal({ gci: 0, issues: ["pre-existing note"] });
    const out = applyValidation(d, 2024);
    expect(out.issues).toContain("pre-existing note");
    expect((out.issues ?? []).length).toBeGreaterThan(1);
  });
});
