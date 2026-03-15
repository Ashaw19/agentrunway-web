/**
 * Layer 3: Survival Engine
 * =========================
 * Tests for cash runway calculation and risk classification.
 *
 * Formula: runwayMonths = cashReserve / (monthlyBurn - monthlyIncome)
 * Risk levels: critical (<2), warning (<4), healthy (<6), strong (≥6)
 */

import { describe, it, expect } from "vitest";
import {
  runwayMonths,
  survivalResult,
  riskLevelFromMonths,
} from "../survival-engine";

// ── runwayMonths ─────────────────────────────────────────────────────────────

describe("runwayMonths", () => {
  it("basic calculation: cash / burn", () => {
    // $15,000 reserve / $1,300 monthly burn = 11.54 months
    expect(runwayMonths(1_300, 15_000, 0)).toBeCloseTo(11.54, 1);
  });

  it("subtracts monthly income from burn", () => {
    // Net burn = 1300 - 500 = 800
    // $15,000 / $800 = 18.75 months
    expect(runwayMonths(1_300, 15_000, 500)).toBeCloseTo(18.75, 2);
  });

  it("caps at 24 months", () => {
    // $100,000 / $100 = 1000 → capped to 24
    expect(runwayMonths(100, 100_000, 0)).toBe(24);
  });

  it("returns 24 when income exceeds burn (net burn ≤ 0)", () => {
    // Income > burn → indefinite runway → 24
    expect(runwayMonths(1_000, 10_000, 2_000)).toBe(24);
  });

  it("returns 0 when burn = income and no cash reserve", () => {
    expect(runwayMonths(1_000, 0, 1_000)).toBe(0);
  });

  it("returns 24 when burn = income but cash > 0", () => {
    // Net burn = 0, cash > 0 → 24
    expect(runwayMonths(1_000, 5_000, 1_000)).toBe(24);
  });

  it("returns 0 when no cash and positive net burn", () => {
    expect(runwayMonths(1_000, 0, 0)).toBe(0);
  });

  it("handles zero burn with cash reserve", () => {
    // burn = 0, income = 0 → net burn = 0, cash > 0 → 24
    expect(runwayMonths(0, 10_000, 0)).toBe(24);
  });
});

// ── riskLevelFromMonths ──────────────────────────────────────────────────────

describe("riskLevelFromMonths", () => {
  it("critical when < 2 months", () => {
    expect(riskLevelFromMonths(0)).toBe("critical");
    expect(riskLevelFromMonths(1)).toBe("critical");
    expect(riskLevelFromMonths(1.9)).toBe("critical");
  });

  it("warning when 2–3.9 months", () => {
    expect(riskLevelFromMonths(2)).toBe("warning");
    expect(riskLevelFromMonths(3)).toBe("warning");
    expect(riskLevelFromMonths(3.9)).toBe("warning");
  });

  it("healthy when 4–5.9 months", () => {
    expect(riskLevelFromMonths(4)).toBe("healthy");
    expect(riskLevelFromMonths(5)).toBe("healthy");
    expect(riskLevelFromMonths(5.9)).toBe("healthy");
  });

  it("strong when ≥ 6 months", () => {
    expect(riskLevelFromMonths(6)).toBe("strong");
    expect(riskLevelFromMonths(12)).toBe("strong");
    expect(riskLevelFromMonths(24)).toBe("strong");
  });
});

// ── survivalResult (full result with test agent data) ────────────────────────

describe("survivalResult", () => {
  it("computes test agent survival (monthly brokerage $500, recurring $800, cash $15,000)", () => {
    // burn = 500 + 800 = 1300
    // months = 15000 / 1300 = 11.538...
    const result = survivalResult(500, 800, 15_000, 0);
    expect(result.monthlyBurn).toBe(1_300);
    expect(result.monthlyIncome).toBe(0);
    expect(result.cashReserve).toBe(15_000);
    expect(result.months).toBeCloseTo(11.54, 1);
    expect(result.riskLevel).toBe("strong"); // 11.54 ≥ 6
    expect(result.label).toContain("months");
  });

  it("with pipeline monthly income reduces net burn", () => {
    // burn = 1300, income = 500
    // net burn = 800, months = 15000/800 = 18.75
    const result = survivalResult(500, 800, 15_000, 500);
    expect(result.months).toBeCloseTo(18.75, 2);
    expect(result.riskLevel).toBe("strong");
  });

  it("returns critical for very low cash", () => {
    // cash = $1,000, burn = $1,300 → 0.77 months
    const result = survivalResult(500, 800, 1_000, 0);
    expect(result.months).toBeCloseTo(0.77, 1);
    expect(result.riskLevel).toBe("critical");
  });

  it("returns 24+ label for capped result", () => {
    const result = survivalResult(10, 0, 100_000, 0);
    expect(result.months).toBe(24);
    expect(result.label).toBe("24+ months");
  });
});
