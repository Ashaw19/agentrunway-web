/**
 * validateTaxCopy + asTaxCopy unit tests.
 *
 * Reference: memory/feedback_tax_information_not_advice.md
 * Spec:      memory/spec_mobile_tax_info_not_advice_baseline.md §7
 *
 * Coverage:
 *   - Per-category positive + negative match tests
 *   - Word-boundary correctness
 *   - Case-insensitivity
 *   - Ambiguous-verb warning posture
 *   - Multi-trigger ordering
 *   - Empty string + safe text
 *   - asTaxCopy brand gate
 */

import { describe, it, expect } from "vitest";
import {
  validateTaxCopy,
  asTaxCopy,
  TaxCopyValidationError,
} from "../validate";

describe("validateTaxCopy — single-word forbidden verbs", () => {
  it("flags `should` as an error", () => {
    const diagnostics = validateTaxCopy("You should file by April 30.");
    const triggers = diagnostics
      .filter((d) => d.level === "error")
      .map((d) => d.trigger.toLowerCase());
    expect(triggers).toContain("should");
  });

  it("flags `must`, `recommend`, `advise`, `urge`, `encourage`, `remind`", () => {
    const cases = [
      "You must file the return.",
      "I recommend filing early.",
      "We advise filing quarterly.",
      "I urge filing on time.",
      "We encourage filing now.",
      "I remind you to file.",
    ];
    for (const sentence of cases) {
      const diagnostics = validateTaxCopy(sentence);
      const errorCount = diagnostics.filter((d) => d.level === "error").length;
      expect(errorCount).toBeGreaterThan(0);
    }
  });

  it("does NOT flag `shouldering` (word-boundary correctness)", () => {
    const diagnostics = validateTaxCopy("She was shouldering the load.");
    const triggers = diagnostics.map((d) => d.trigger.toLowerCase());
    expect(triggers).not.toContain("should");
  });

  it("flags `Should` (case-insensitive)", () => {
    const diagnostics = validateTaxCopy("Should you file? Yes.");
    const errorCount = diagnostics.filter(
      (d) => d.level === "error" && d.trigger.toLowerCase() === "should",
    ).length;
    expect(errorCount).toBeGreaterThan(0);
  });

  it("flags `SHOULD` (uppercase)", () => {
    const diagnostics = validateTaxCopy("YOU SHOULD FILE THIS NOW.");
    const errorCount = diagnostics.filter(
      (d) => d.trigger.toLowerCase() === "should",
    ).length;
    expect(errorCount).toBeGreaterThan(0);
  });

  it("treats `suggests` as a warning (data-description ambiguity)", () => {
    const diagnostics = validateTaxCopy("The engine suggests $4,747.");
    const suggestsDiagnostics = diagnostics.filter(
      (d) => d.trigger.toLowerCase() === "suggests",
    );
    expect(suggestsDiagnostics).toHaveLength(1);
    expect(suggestsDiagnostics[0].level).toBe("warning");
    expect(suggestsDiagnostics[0].note).toBeDefined();
  });
});

describe("validateTaxCopy — multi-word forbidden phrases", () => {
  it("flags `you should`", () => {
    const diagnostics = validateTaxCopy("You should file early.");
    const hits = diagnostics.filter(
      (d) =>
        d.category === "forbidden-phrase" &&
        d.trigger.toLowerCase() === "you should",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe("error");
  });

  it("flags `you need to`", () => {
    const diagnostics = validateTaxCopy("You need to register for HST.");
    const hits = diagnostics.filter(
      (d) => d.trigger.toLowerCase() === "you need to",
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("tolerates extra internal whitespace (`you  should`)", () => {
    const diagnostics = validateTaxCopy("You   should  file.");
    const hits = diagnostics.filter(
      (d) => d.trigger.toLowerCase().replace(/\s+/g, " ") === "you should",
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags `set aside`", () => {
    const diagnostics = validateTaxCopy("Set aside 30% for taxes.");
    const hits = diagnostics.filter(
      (d) => d.trigger.toLowerCase() === "set aside",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe("error");
  });

  it("flags `critical zone`", () => {
    const diagnostics = validateTaxCopy("Your HST owing is in the critical zone.");
    const hits = diagnostics.filter(
      (d) => d.trigger.toLowerCase() === "critical zone",
    );
    expect(hits).toHaveLength(1);
  });

  it("treats `reserve` as a warning (noun-form ambiguity)", () => {
    const diagnostics = validateTaxCopy("Your HST reserve sits at $4,747.");
    const hits = diagnostics.filter(
      (d) => d.trigger.toLowerCase() === "reserve",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe("warning");
    expect(hits[0].note).toBeDefined();
  });

  it("treats `consider` as a warning", () => {
    const diagnostics = validateTaxCopy("Consider filing early.");
    const hits = diagnostics.filter(
      (d) => d.trigger.toLowerCase() === "consider",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe("warning");
  });
});

describe("validateTaxCopy — qualitative-judgment patterns", () => {
  it("flags `appears low`", () => {
    const diagnostics = validateTaxCopy("Your deduction total appears low.");
    const hits = diagnostics.filter(
      (d) => d.category === "qualitative-judgment",
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].trigger.toLowerCase()).toContain("low");
  });

  it("flags `is high`", () => {
    const diagnostics = validateTaxCopy("HST owing is high this quarter.");
    const hits = diagnostics.filter(
      (d) => d.category === "qualitative-judgment",
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags `looks thin`, `seems weak`, `is concerning`", () => {
    const cases = [
      "Cash position looks thin.",
      "The pipeline seems weak.",
      "Runway is concerning.",
    ];
    for (const sentence of cases) {
      const diagnostics = validateTaxCopy(sentence);
      const hits = diagnostics.filter(
        (d) => d.category === "qualitative-judgment",
      );
      expect(hits.length).toBeGreaterThan(0);
    }
  });

  it("does NOT flag `low tide` (no copula)", () => {
    const diagnostics = validateTaxCopy("Walking the beach at low tide.");
    const hits = diagnostics.filter(
      (d) => d.category === "qualitative-judgment",
    );
    expect(hits).toEqual([]);
  });
});

describe("validateTaxCopy — bare imperatives", () => {
  it("flags sentence-initial `Record your receipts`", () => {
    const diagnostics = validateTaxCopy("Record your receipts monthly.");
    const hits = diagnostics.filter((d) => d.category === "bare-imperative");
    expect(hits).toHaveLength(1);
    expect(hits[0].trigger).toBe("Record");
  });

  it("flags `Keep your records`", () => {
    const diagnostics = validateTaxCopy("Keep your records for six years.");
    const hits = diagnostics.filter((d) => d.category === "bare-imperative");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags `Track the receipts` after a period", () => {
    const diagnostics = validateTaxCopy(
      "HST sits at $4,747. Track the receipts.",
    );
    const hits = diagnostics.filter((d) => d.category === "bare-imperative");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag `He recorded the meeting` (past tense, not bare imperative)", () => {
    const diagnostics = validateTaxCopy("He recorded the meeting.");
    const hits = diagnostics.filter((d) => d.category === "bare-imperative");
    expect(hits).toEqual([]);
  });

  it("does NOT flag `Track` followed by something other than your/the + object", () => {
    const diagnostics = validateTaxCopy("Track 5 of the album is great.");
    const hits = diagnostics.filter((d) => d.category === "bare-imperative");
    expect(hits).toEqual([]);
  });
});

describe("validateTaxCopy — multi-trigger and ordering", () => {
  it("returns diagnostics in source order by start index", () => {
    const text = "You should file. You need to register for HST.";
    const diagnostics = validateTaxCopy(text);
    for (let i = 1; i < diagnostics.length; i++) {
      expect(diagnostics[i].start).toBeGreaterThanOrEqual(
        diagnostics[i - 1].start,
      );
    }
  });

  it("captures multiple distinct triggers in one string", () => {
    const text = "You must reserve cash. The fix is to set aside more.";
    const diagnostics = validateTaxCopy(text);
    const errorTriggers = diagnostics
      .filter((d) => d.level === "error")
      .map((d) => d.trigger.toLowerCase());
    expect(errorTriggers).toContain("must");
    expect(errorTriggers).toContain("the fix is");
    expect(errorTriggers).toContain("set aside");
  });
});

describe("validateTaxCopy — edge cases", () => {
  it("returns [] for empty string", () => {
    expect(validateTaxCopy("")).toEqual([]);
  });

  it("returns [] for clean tax-informational text", () => {
    const text =
      "The engine estimates HST owing at $4,747 based on YTD GCI of $52,000.";
    expect(validateTaxCopy(text)).toEqual([]);
  });

  it("emits diagnostics with valid start/end indices", () => {
    const text = "You should file.";
    const diagnostics = validateTaxCopy(text);
    for (const d of diagnostics) {
      expect(d.start).toBeGreaterThanOrEqual(0);
      expect(d.end).toBeGreaterThan(d.start);
      expect(d.end).toBeLessThanOrEqual(text.length);
      expect(text.slice(d.start, d.end).toLowerCase()).toBe(
        d.trigger.toLowerCase(),
      );
    }
  });
});

describe("asTaxCopy — branding gate", () => {
  it("returns the input string unchanged when clean", () => {
    const clean = "The engine estimates HST owing at $4,747.";
    const branded = asTaxCopy(clean);
    expect(branded).toBe(clean);
  });

  it("throws TaxCopyValidationError on error-level diagnostics", () => {
    expect(() => asTaxCopy("You should file now.")).toThrow(
      TaxCopyValidationError,
    );
  });

  it("does NOT throw on warning-only diagnostics", () => {
    // "reserve" as a noun is warning-level only; asTaxCopy must pass.
    expect(() =>
      asTaxCopy("Your HST reserve sits at $4,747."),
    ).not.toThrow();
  });

  it("error attaches the diagnostic array", () => {
    try {
      asTaxCopy("You should file. You must register.");
      expect.unreachable("asTaxCopy should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TaxCopyValidationError);
      const e = err as TaxCopyValidationError;
      expect(e.diagnostics.length).toBeGreaterThan(0);
      for (const d of e.diagnostics) {
        expect(d.level).toBe("error");
      }
    }
  });
});
