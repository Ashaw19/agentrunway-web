/**
 * Layer 4: Benchmark Engine
 * ===========================
 * Tests for industry-cohort benchmarking and percentile ranking.
 *
 * Cohort data (embedded constants):
 *   rookie (≤2yr):      median $42K, p25 $18K, p75 $72K, p90 $110K
 *   growth (3–5yr):     median $78K, p25 $45K, p75 $120K, p90 $185K
 *   established (6–10): median $96K, p25 $58K, p75 $155K, p90 $240K
 *   topProducer (>10):  median $145K, p25 $85K, p75 $260K, p90 $400K
 *
 * Percentile ranking: linear interpolation between
 *   [0,0], [p25,25], [median,50], [p75,75], [p90,90], [p90×1.5,99]
 */

import { describe, it, expect } from "vitest";
import {
  cohortFromYears,
  percentileRank,
  compare,
  NATIONAL_MEDIAN_GCI,
  COHORT_LABELS,
} from "../benchmark-engine";

// ── cohortFromYears ──────────────────────────────────────────────────────────

describe("cohortFromYears", () => {
  it("rookie for ≤ 2 years", () => {
    expect(cohortFromYears(0)).toBe("rookie");
    expect(cohortFromYears(1)).toBe("rookie");
    expect(cohortFromYears(2)).toBe("rookie");
  });

  it("growth for 3–5 years", () => {
    expect(cohortFromYears(3)).toBe("growth");
    expect(cohortFromYears(4)).toBe("growth");
    expect(cohortFromYears(5)).toBe("growth");
  });

  it("established for 6–10 years", () => {
    expect(cohortFromYears(6)).toBe("established");
    expect(cohortFromYears(10)).toBe("established");
  });

  it("topProducer for > 10 years", () => {
    expect(cohortFromYears(11)).toBe("topProducer");
    expect(cohortFromYears(25)).toBe("topProducer");
  });
});

// ── percentileRank ───────────────────────────────────────────────────────────

describe("percentileRank", () => {
  it("returns 0 for zero or negative GCI", () => {
    expect(percentileRank(0, "growth")).toBe(0);
    expect(percentileRank(-5000, "growth")).toBe(0);
  });

  it("returns 50 at exact cohort median (growth = $78,000)", () => {
    expect(percentileRank(78_000, "growth")).toBe(50);
  });

  it("returns 25 at exact p25 (growth = $45,000)", () => {
    expect(percentileRank(45_000, "growth")).toBe(25);
  });

  it("returns 75 at exact p75 (growth = $120,000)", () => {
    expect(percentileRank(120_000, "growth")).toBe(75);
  });

  it("returns 90 at exact p90 (growth = $185,000)", () => {
    expect(percentileRank(185_000, "growth")).toBe(90);
  });

  it("interpolates between breakpoints", () => {
    // $61,500 is halfway between p25 ($45K) and median ($78K)
    // t = (61500 - 45000) / (78000 - 45000) = 16500 / 33000 = 0.5
    // percentile = 25 + 0.5 × (50 - 25) = 37.5 → rounds to 38
    expect(percentileRank(61_500, "growth")).toBe(38);
  });

  it("returns 99 for extremely high GCI", () => {
    expect(percentileRank(1_000_000, "growth")).toBe(99);
  });

  it("test agent: $66,375 in growth cohort", () => {
    // $66,375 is between p25 ($45K) and median ($78K) for growth
    // t = (66375 - 45000) / (78000 - 45000) = 21375 / 33000 = 0.6477
    // percentile = 25 + 0.6477 × 25 = 25 + 16.19 = 41.19 → rounds to 41
    expect(percentileRank(66_375, "growth")).toBe(41);
  });

  it("test agent: projected ~$131K in growth cohort", () => {
    // Between p75 ($120K) and p90 ($185K) for growth
    // t = (131000 - 120000) / (185000 - 120000) = 11000 / 65000 = 0.1692
    // percentile = 75 + 0.1692 × 15 = 75 + 2.54 = 77.54 → rounds to 78
    expect(percentileRank(131_000, "growth")).toBe(78);
  });
});

// ── compare ──────────────────────────────────────────────────────────────────

describe("compare", () => {
  it("returns correct cohort for test agent (4 years = growth)", () => {
    const result = compare(66_375, 4);
    expect(result.cohort).toBe("growth");
    expect(result.cohortMedianGCI).toBe(78_000);
  });

  it("computes distance to next tier", () => {
    // Growth → next tier is Established (median $96K)
    // distance = max(0, 96000 - 66375) = 29625
    const result = compare(66_375, 4);
    expect(result.distanceToNextTier).toBe(29_625);
    expect(result.nextTierLabel).toBe("Established");
  });

  it("returns null distance for topProducer (no next tier)", () => {
    const result = compare(200_000, 15);
    expect(result.cohort).toBe("topProducer");
    expect(result.distanceToNextTier).toBeNull();
    expect(result.nextTierLabel).toBeNull();
  });

  it("computes national percentile (uses established cohort as proxy)", () => {
    const result = compare(66_375, 4);
    // National percentile uses "established" cohort:
    // Between p25 ($58K) and median ($96K)
    // t = (66375 - 58000) / (96000 - 58000) = 8375 / 38000 = 0.2204
    // percentile = 25 + 0.2204 × 25 = 25 + 5.51 = 30.51 → rounds to 31
    expect(result.nationalPercentile).toBe(31);
  });

  it("defaults to growth cohort when experience is null", () => {
    // null → defaults to 5 years → growth
    const result = compare(80_000, null);
    expect(result.cohort).toBe("growth");
  });

  it("distance is 0 when already above next tier median", () => {
    // Rookie with $80K GCI, next tier growth median = $78K
    // distance = max(0, 78000 - 80000) = 0
    const result = compare(80_000, 1);
    expect(result.distanceToNextTier).toBe(0);
  });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe("Benchmark Constants", () => {
  it("national median GCI is $96,000", () => {
    expect(NATIONAL_MEDIAN_GCI).toBe(96_000);
  });

  it("all cohort labels are defined", () => {
    expect(COHORT_LABELS.rookie).toBe("Rookie");
    expect(COHORT_LABELS.growth).toBe("Growth");
    expect(COHORT_LABELS.established).toBe("Established");
    expect(COHORT_LABELS.topProducer).toBe("Top Producer");
  });
});
