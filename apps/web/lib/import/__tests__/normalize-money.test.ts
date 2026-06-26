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
import { parseMoneyLoose } from "../normalizers/normalize-money";

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
