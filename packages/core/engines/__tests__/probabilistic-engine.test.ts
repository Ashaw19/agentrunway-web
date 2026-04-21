/**
 * Layer 7: Probabilistic Forecast Engine
 * ========================================
 * Tests for probability bands and 5-year projections.
 *
 * Band calculation:
 *   - < 6 months data → low confidence, fixed bands ±15% / ±30%
 *   - ≥ 6 months → compute CV (clamped 5–50%), bands at ±CV / ±2CV
 *   - ≥ 12 months → high confidence
 *
 * 5-year bands widen 5% per year from current year band width.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { probabilityBands, fiveYearBands } from "../probabilistic-forecast-engine";
import type { ProbabilityBands } from "../probabilistic-forecast-engine";
import type { Transaction } from "../../types/database";
import { TEST_TRANSACTIONS } from "./test-data";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 11)); // March 11, 2026
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Probability Bands (Low Confidence — < 6 months) ─────────────────────────

describe("probabilityBands — Low Confidence", () => {
  it("uses fixed bands when < 6 non-zero months", () => {
    // Test agent has 3 months of data (Jan, Feb, Mar)
    // All 3 are non-zero → < 6 → low confidence
    const base = 150_000;
    const bands = probabilityBands(TEST_TRANSACTIONS, base);

    expect(bands.confidence).toBe("low");
    expect(bands.monthsOfData).toBe(3);

    // Fixed bands: lowBand = 0.15, highBand = 0.30
    expect(bands.p10).toBeCloseTo(base * 0.70, 0); // 1.0 - 0.30
    expect(bands.p25).toBeCloseTo(base * 0.85, 0); // 1.0 - 0.15
    expect(bands.p50).toBe(base);
    expect(bands.p75).toBeCloseTo(base * 1.15, 0); // 1.0 + 0.15
    expect(bands.p90).toBeCloseTo(base * 1.30, 0); // 1.0 + 0.30
  });

  it("bands are symmetric around p50", () => {
    const base = 100_000;
    const bands = probabilityBands(TEST_TRANSACTIONS, base);
    // p50 - p25 should equal p75 - p50
    expect(bands.p50 - bands.p25).toBeCloseTo(bands.p75 - bands.p50, 2);
    // p50 - p10 should equal p90 - p50
    expect(bands.p50 - bands.p10).toBeCloseTo(bands.p90 - bands.p50, 2);
  });

  it("p10 is always ≥ 0", () => {
    const bands = probabilityBands(TEST_TRANSACTIONS, 100);
    expect(bands.p10).toBeGreaterThanOrEqual(0);
  });
});

// ── Probability Bands (Medium/High Confidence — ≥ 6 months) ────────────────

describe("probabilityBands — Variance-Based", () => {
  // Create 8 months of data to trigger variance calculation.
  // Returns Transaction[] shape — all required fields populated, no casts.
  function makeMonthlyTransactions(monthlyAmounts: number[]): Transaction[] {
    return monthlyAmounts.map((amount, i) => ({
      id: `var-tx-${i}`,
      user_id: "test",
      date: `2026-${String(i + 1).padStart(2, "0")}-15`,
      address: "",
      sale_price: amount / 0.025,
      commission_pct: 0.025,
      gci_override: null,
      side: "buyer",
      status: "closed",
      client_name: `Variance Test ${i}`,
      notes: "",
      date_precision: "day",
      source: "manual",
      team_split_pct: null,
      pipeline_deal_id: null,
      import_external_id: null,
      edited_at: null,
      created_at: `2026-${String(i + 1).padStart(2, "0")}-15`,
      updated_at: `2026-${String(i + 1).padStart(2, "0")}-15`,
    }));
  }

  it("uses CV-based bands for ≥ 6 months with variation", () => {
    // Need time to be in August+ for 6+ months of data
    vi.setSystemTime(new Date(2026, 7, 15)); // August 15
    const transactions = makeMonthlyTransactions([
      10_000, 12_000, 8_000, 15_000, 11_000, 9_000, 13_000, 10_000,
    ]);
    const bands = probabilityBands(transactions, 120_000);
    // 8 non-zero months → medium confidence
    expect(bands.confidence).toBe("medium");
    expect(bands.monthsOfData).toBe(8);
    // Bands should be based on CV, not fixed 15%/30%
    // Mean = (10+12+8+15+11+9+13+10)×1000/8 = 11000
    // Variance = mean of squared deviations
    // The exact CV determines band width
    expect(bands.p10).toBeLessThan(bands.p25);
    expect(bands.p25).toBeLessThan(bands.p50);
    expect(bands.p75).toBeGreaterThan(bands.p50);
    expect(bands.p90).toBeGreaterThan(bands.p75);
  });

  it("high confidence for ≥ 12 months", () => {
    vi.setSystemTime(new Date(2026, 11, 15)); // December
    const transactions = makeMonthlyTransactions([
      10_000, 12_000, 8_000, 15_000, 11_000, 9_000,
      13_000, 10_000, 14_000, 11_000, 12_000, 10_000,
    ]);
    const bands = probabilityBands(transactions, 140_000);
    expect(bands.confidence).toBe("high");
    expect(bands.monthsOfData).toBe(12);
  });
});

// ── Five-Year Bands ──────────────────────────────────────────────────────────

describe("fiveYearBands", () => {
  it("generates exactly 5 years", () => {
    const currentBands: ProbabilityBands = {
      p10: 70_000, p25: 85_000, p50: 100_000, p75: 115_000, p90: 130_000,
      confidence: "low", monthsOfData: 3,
    };
    const result = fiveYearBands(100_000, [0.10, 0.10, 0.08, 0.08, 0.05], currentBands);
    expect(result).toHaveLength(5);
  });

  it("applies growth rates compounding year over year", () => {
    const currentBands: ProbabilityBands = {
      p10: 70_000, p25: 85_000, p50: 100_000, p75: 115_000, p90: 130_000,
      confidence: "low", monthsOfData: 3,
    };
    const growth = [0.10, 0.10, 0.08, 0.08, 0.05];
    const result = fiveYearBands(100_000, growth, currentBands);

    // Year 1: 100000 × 1.10 = 110000
    expect(result[0].p50).toBeCloseTo(110_000, 0);
    // Year 2: 110000 × 1.10 = 121000
    expect(result[1].p50).toBeCloseTo(121_000, 0);
    // Year 3: 121000 × 1.08 = 130680
    expect(result[2].p50).toBeCloseTo(130_680, 0);
    // Year 4: 130680 × 1.08 = 141134.4
    expect(result[3].p50).toBeCloseTo(141_134.4, 0);
    // Year 5: 141134.4 × 1.05 = 148191.12
    expect(result[4].p50).toBeCloseTo(148_191.12, 0);
  });

  it("bands widen 5% per year", () => {
    const currentBands: ProbabilityBands = {
      p10: 70_000, p25: 85_000, p50: 100_000, p75: 115_000, p90: 130_000,
      confidence: "medium", monthsOfData: 8,
    };
    const result = fiveYearBands(100_000, [0.05, 0.05, 0.05, 0.05, 0.05], currentBands);

    // Base band width = (p75 - p50) / p50 = 15000 / 100000 = 0.15
    // Year 1 band = 0.15 × (1 + 0.05 × 0) = 0.15
    // Year 2 band = 0.15 × (1 + 0.05 × 1) = 0.1575
    // ...
    // Year 5 band = 0.15 × (1 + 0.05 × 4) = 0.18

    // Year 1 p75 spread from p50
    const year1Spread = result[0].p75 - result[0].p50;
    // Year 5 p75 spread from p50
    const year5Spread = result[4].p75 - result[4].p50;
    // Year 5 should be wider (relatively)
    expect(year5Spread / result[4].p50).toBeGreaterThan(year1Spread / result[0].p50);
  });

  it("year IDs are 1 through 5", () => {
    const currentBands: ProbabilityBands = {
      p10: 70_000, p25: 85_000, p50: 100_000, p75: 115_000, p90: 130_000,
      confidence: "low", monthsOfData: 3,
    };
    const result = fiveYearBands(100_000, [0.05], currentBands);
    expect(result.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("years are sequential from current year + 1", () => {
    const currentBands: ProbabilityBands = {
      p10: 70_000, p25: 85_000, p50: 100_000, p75: 115_000, p90: 130_000,
      confidence: "low", monthsOfData: 3,
    };
    const result = fiveYearBands(100_000, [0.05], currentBands);
    expect(result[0].year).toBe(2027);
    expect(result[4].year).toBe(2031);
  });

  it("uses rate 0 when growth array is shorter than 5", () => {
    const currentBands: ProbabilityBands = {
      p10: 70_000, p25: 85_000, p50: 100_000, p75: 115_000, p90: 130_000,
      confidence: "low", monthsOfData: 3,
    };
    // Only 2 growth rates provided
    const result = fiveYearBands(100_000, [0.10, 0.05], currentBands);
    // Year 1: ×1.10, Year 2: ×1.05, Years 3–5: ×1.00 (no growth)
    expect(result[0].p50).toBeCloseTo(110_000, 0);
    expect(result[1].p50).toBeCloseTo(115_500, 0);
    expect(result[2].p50).toBeCloseTo(115_500, 0); // no growth
    expect(result[3].p50).toBeCloseTo(115_500, 0);
    expect(result[4].p50).toBeCloseTo(115_500, 0);
  });

  it("p10 values are always ≥ 0", () => {
    const currentBands: ProbabilityBands = {
      p10: 100, p25: 500, p50: 1_000, p75: 1_500, p90: 2_000,
      confidence: "low", monthsOfData: 1,
    };
    const result = fiveYearBands(1_000, [0.05], currentBands);
    for (const year of result) {
      expect(year.p10).toBeGreaterThanOrEqual(0);
    }
  });
});
