/**
 * Regression suite for parseMoneyLoose — the money normalizer.
 *
 * Covers the messy currency variants real brokerage / tracker exports produce,
 * with explicit attention to:
 *   • French-Canadian number formatting (space + non-breaking-space thousands
 *     separators, comma decimal) — bilingual NB groundwork.
 *   • Garbage / out-of-range inputs that must degrade to NaN (never throw, never
 *     return a poisoned value the DB clamp can't catch).
 */
import { describe, expect, it } from "vitest";
import { parseMoneyLoose, parseMoneyStrict } from "../normalizers/normalize-money";

describe("parseMoneyLoose — standard formats", () => {
  it("parses a plain dollar-and-comma value", () => {
    expect(parseMoneyLoose("$1,234.56")).toBeCloseTo(1234.56);
  });

  it("parses a bare number", () => {
    expect(parseMoneyLoose("1234.56")).toBeCloseTo(1234.56);
  });

  it("parses with no decimals", () => {
    expect(parseMoneyLoose("1,234")).toBe(1234);
  });

  it("strips a CAD prefix", () => {
    expect(parseMoneyLoose("CAD 1,234")).toBe(1234);
  });

  it("strips a ca$ prefix", () => {
    expect(parseMoneyLoose("ca$1,234")).toBe(1234);
  });

  it("strips a USD prefix", () => {
    expect(parseMoneyLoose("USD 1,234.56")).toBeCloseTo(1234.56);
  });

  it("strips a euro / pound symbol", () => {
    expect(parseMoneyLoose("€1.234")).toBeCloseTo(1.234);
    expect(parseMoneyLoose("£500")).toBe(500);
  });
});

describe("parseMoneyLoose — accounting negatives", () => {
  it("treats parenthesized values as negative", () => {
    expect(parseMoneyLoose("(1,234)")).toBe(-1234);
    expect(parseMoneyLoose("(1234.56)")).toBeCloseTo(-1234.56);
  });
});

describe("parseMoneyLoose — French-Canadian formatting (bilingual groundwork)", () => {
  it("parses a regular-space thousands separator", () => {
    expect(parseMoneyLoose("9 750")).toBe(9750);
  });

  it("parses a non-breaking-space (U+00A0) thousands separator", () => {
    expect(parseMoneyLoose("325 000")).toBe(325000);
  });

  it("parses a narrow-no-break-space (U+202F) thousands separator", () => {
    // fr-CA Windows exports often use the narrow NBSP. \s covers it.
    expect(parseMoneyLoose("1 234")).toBe(1234);
  });

  it("parses multiple space-grouped thousands groups", () => {
    expect(parseMoneyLoose("1 234 567")).toBe(1234567);
  });
});

describe("parseMoneyLoose — garbage / edge inputs degrade to NaN (never throw)", () => {
  it("returns NaN for null / undefined / empty", () => {
    expect(parseMoneyLoose(null)).toBeNaN();
    expect(parseMoneyLoose(undefined)).toBeNaN();
    expect(parseMoneyLoose("")).toBeNaN();
    expect(parseMoneyLoose("   ")).toBeNaN();
  });

  it("returns NaN for non-numeric text", () => {
    expect(parseMoneyLoose("N/A")).toBeNaN();
    expect(parseMoneyLoose("pending")).toBeNaN();
    expect(parseMoneyLoose("TBD")).toBeNaN();
  });

  it("returns NaN for a lone sign or decimal point", () => {
    expect(parseMoneyLoose("-")).toBeNaN();
    expect(parseMoneyLoose(".")).toBeNaN();
    expect(parseMoneyLoose("$")).toBeNaN();
  });

  it("never throws on bizarre input", () => {
    expect(() => parseMoneyLoose("$$$,,,...")).not.toThrow();
    expect(() => parseMoneyLoose("12.34.56.78")).not.toThrow();
  });
});

describe("parseMoneyLoose — comma-as-decimal (fr-CA), the docstring's long-promised coverage", () => {
  // The docstring claimed comma-decimal support for months; no test asserted it,
  // and the blanket comma-strip silently 100x-inflated every fr-CA decimal
  // ("9 750,50 $" parsed as 975050). These lock the locale-aware behaviour.
  it("treats a lone comma with 2 trailing digits as a decimal", () => {
    expect(parseMoneyLoose("9,50")).toBeCloseTo(9.5);
  });

  it("treats a lone comma with 1 trailing digit as a decimal", () => {
    expect(parseMoneyLoose("12,5")).toBeCloseTo(12.5);
  });

  it("parses space thousands + comma decimal + trailing $ (the core fr-CA form)", () => {
    expect(parseMoneyLoose("9 750,50 $")).toBeCloseTo(9750.5);
    expect(parseMoneyLoose("325 000,00 $")).toBeCloseTo(325000);
  });

  it("parses grouped thousands + comma decimal", () => {
    expect(parseMoneyLoose("1 234 567,89")).toBeCloseTo(1234567.89);
  });

  it("parses European dot-thousands + comma-decimal", () => {
    expect(parseMoneyLoose("1.234,56")).toBeCloseTo(1234.56);
    expect(parseMoneyLoose("1.234.567,89")).toBeCloseTo(1234567.89);
  });
});

describe("parseMoneyLoose — disambiguation must NOT regress en-CA/US", () => {
  it("keeps a single comma + exactly 3 trailing digits as thousands", () => {
    expect(parseMoneyLoose("1,234")).toBe(1234);
    expect(parseMoneyLoose("12,345")).toBe(12345);
  });

  it("keeps multi-comma groupings as thousands", () => {
    expect(parseMoneyLoose("1,234,567")).toBe(1234567);
    expect(parseMoneyLoose("1,234,567.89")).toBeCloseTo(1234567.89);
  });

  it("keeps dot as decimal even with 3 trailing digits (unchanged)", () => {
    expect(parseMoneyLoose("1.234")).toBeCloseTo(1.234);
  });

  it("uses the last separator as the decimal when both appear", () => {
    expect(parseMoneyLoose("$1,234.56")).toBeCloseTo(1234.56);
  });
});

describe("parseMoneyLoose — F1: trailing/leading annotation must NOT flip thousands 1000x down", () => {
  // Regression F1 (PR #264 / da8e9ab): stripping ALL whitespace before
  // disambiguation glued annotation text onto the digits — "1,234 approx"
  // became "1,234approx", whose ",234approx" tail (length 9 ≠ 3) was read as a
  // decimal group -> 1.234. Every assertion below returned the 1000x-too-small
  // value under the pre-fix code (1.234 / 1.5 / 2 instead of 1234 / 1500 / 2000).
  it("strips a trailing dotless word annotation", () => {
    expect(parseMoneyLoose("1,234 approx")).toBe(1234);
    expect(parseMoneyLoose("1,500 est")).toBe(1500);
    expect(parseMoneyLoose("2,000 net")).toBe(2000);
  });

  it("strips a trailing dotless currency-code annotation glued to digits", () => {
    // "1,234CAD" — the CAD prefix-regex only fires with a leading boundary, so
    // the trailing CAD survives to the core-extraction peel. Pre-fix -> 1.234.
    expect(parseMoneyLoose("1,234CAD")).toBe(1234);
  });

  it("strips a leading word annotation", () => {
    expect(parseMoneyLoose("approx 1,234")).toBe(1234);
  });

  it("keeps fr-CA space+comma decimals intact through the annotation peel", () => {
    expect(parseMoneyLoose("9 750,50 $")).toBeCloseTo(9750.5);
    expect(parseMoneyLoose("1 234,56 CAD")).toBeCloseTo(1234.56);
    expect(parseMoneyLoose("(9 750,50 $)")).toBeCloseTo(-9750.5);
  });

  it("uses residual-space evidence: space grouping proves the comma is decimal", () => {
    // "1 234,567" — space groups thousands, so the lone comma with 3 trailing
    // digits is the DECIMAL, not another thousands group. Without the evidence
    // this would read as 1234567.
    expect(parseMoneyLoose("1 234,567")).toBeCloseTo(1234.567);
  });
});

describe("parseMoneyLoose — F3: leading-digit / multi-number annotation cells fail safe to NaN", () => {
  // Regression F3 (PR #265 / 993fa88): the F1 core-token extraction grabs the
  // FIRST digit run and greedily spans whitespace-grouped digits. A money cell
  // whose annotation carries its OWN digits (unit / lot / MLS / deal numbers, a
  // "@" quantity, a price range) therefore returned a digit lifted from the
  // annotation — "Unit 5 - $325,000" -> 5, "Lot 12 $500,000" -> 12500 — a silent
  // wrong value where the pre-#265 parser returned NaN ("missing" in review).
  // These lock the fail-safe: two numeric groups split by a hard char -> NaN.
  it("rejects a leading unit/lot number before the price", () => {
    expect(parseMoneyLoose("Unit 5 - $325,000")).toBeNaN();
    expect(parseMoneyLoose("Lot 12 $500,000")).toBeNaN();
    expect(parseMoneyLoose("Deal 3: $325,000")).toBeNaN();
  });

  it("rejects an MLS/reference number glued ahead of the price", () => {
    expect(parseMoneyLoose("MLS 40312345 $325,000")).toBeNaN();
    expect(parseMoneyLoose("#2 $1,200,000")).toBeNaN();
  });

  it("rejects a quantity-@-price cell", () => {
    expect(parseMoneyLoose("2 @ $450,000")).toBeNaN();
  });

  it("rejects a two-ended price range as ambiguous", () => {
    expect(parseMoneyLoose("$300,000-$350,000")).toBeNaN();
  });

  it("still salvages legitimate single-number annotation cells (no regression)", () => {
    expect(parseMoneyLoose("1,234 approx")).toBe(1234);
    expect(parseMoneyLoose("approx 1,234")).toBe(1234);
    expect(parseMoneyLoose("1,234CAD")).toBe(1234);
    expect(parseMoneyLoose("325 000")).toBe(325000);
    expect(parseMoneyLoose("9 750,50 $")).toBeCloseTo(9750.5);
    expect(parseMoneyLoose("1 234 567")).toBe(1234567);
  });
});

describe("parseMoneyStrict — F2: AI path rejects numeric-prefix garbage (unit suffixes / annotations)", () => {
  // Regression F2 (PR #264): delegating the AI route's toNum to parseMoneyLoose
  // inherited parseFloat prefix semantics, so "1.5M" -> 1.5 and "300k" -> 300
  // flowed into sale_price/gci at default "high" confidence. The old Number()-
  // based toNum returned null (surfaced as "missing" in review). Strict restores
  // whole-string validation: any non-currency alphabetic residue -> NaN.
  it("rejects magnitude unit suffixes", () => {
    expect(parseMoneyStrict("1.5M")).toBeNaN();
    expect(parseMoneyStrict("300k")).toBeNaN();
    expect(parseMoneyStrict("$1.2M")).toBeNaN();
    expect(parseMoneyStrict("2.4m")).toBeNaN();
  });

  it("rejects free-text annotations that the loose path would salvage", () => {
    expect(parseMoneyStrict("1,500 est")).toBeNaN();
    expect(parseMoneyStrict("1,234 approx")).toBeNaN();
    expect(parseMoneyStrict("2,000 net")).toBeNaN();
    expect(parseMoneyStrict("1,234CAD approx")).toBeNaN();
  });

  it("accepts clean values, currency symbols, and recognized currency codes", () => {
    expect(parseMoneyStrict("$450,000")).toBe(450000);
    expect(parseMoneyStrict("450000")).toBe(450000);
    expect(parseMoneyStrict("ca$1,234")).toBe(1234);
    expect(parseMoneyStrict("9 750,50 $")).toBeCloseTo(9750.5);
    expect(parseMoneyStrict("1 234,56 CAD")).toBeCloseTo(1234.56);
    expect(parseMoneyStrict("CAD 1,234")).toBe(1234);
    expect(parseMoneyStrict("(1,234)")).toBe(-1234);
  });

  it("returns NaN for null / undefined / empty / non-numeric", () => {
    expect(parseMoneyStrict(null)).toBeNaN();
    expect(parseMoneyStrict(undefined)).toBeNaN();
    expect(parseMoneyStrict("")).toBeNaN();
    expect(parseMoneyStrict("N/A")).toBeNaN();
    expect(parseMoneyStrict("pending")).toBeNaN();
  });

  it("F1/F2 interplay: the SAME annotation string is salvaged loose, rejected strict", () => {
    expect(parseMoneyLoose("1,234 approx")).toBe(1234);
    expect(parseMoneyStrict("1,234 approx")).toBeNaN();
  });
});
