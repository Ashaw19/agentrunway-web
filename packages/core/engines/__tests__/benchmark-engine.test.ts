/**
 * Layer 4: Benchmark Engine
 * ===========================
 * Tests for the Benchmark score: projected GCI placed on Agent Runway's
 * reference scale for an experience level.
 *
 * The reference figures are Agent Runway's own, with no published source
 * (see the engine's header). Anchor points per level (embedded constants):
 *   rookie (≤2yr):      50 at $42K, 25 at $18K, 75 at $72K, 90 at $110K
 *   growth (3–5yr):     50 at $78K, 25 at $45K, 75 at $120K, 90 at $185K
 *   established (6–10): 50 at $96K, 25 at $58K, 75 at $155K, 90 at $240K
 *   topProducer (>10):  50 at $145K, 25 at $85K, 75 at $260K, 90 at $400K
 *
 * Score: linear interpolation between
 *   [0,0], [p25,25], [median,50], [p75,75], [p90,90], [p90×1.5,99]
 */

import { describe, it, expect } from "vitest";
import {
  cohortFromYears,
  percentileRank,
  compare,
  BENCHMARKS,
  BENCHMARK_COPY,
  BENCHMARK_VOICE_RULE,
  COHORTS,
  COHORT_LABELS,
  GENERAL_REFERENCE_COHORT,
  GENERAL_REFERENCE_GCI,
  GENERAL_REFERENCE_GCI_PER_DEAL,
  GENERAL_REFERENCE_TRANSACTIONS,
  benchmarkCardSubtitle,
  benchmarkGapLabel,
  benchmarkReferenceList,
  benchmarkSentence,
  benchmarkVsReference,
  cohortLabelWithYears,
  cohortYears,
  formatBenchmarkScore,
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

  it("scores the same GCI on the Established level's scale", () => {
    const result = compare(66_375, 4);
    // Between the Established 25 point ($58K) and 50 point ($96K)
    // t = (66375 - 58000) / (96000 - 58000) = 8375 / 38000 = 0.2204
    // score = 25 + 0.2204 × 25 = 25 + 5.51 = 30.51 → rounds to 31
    expect(result.establishedPercentile).toBe(31);
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
  it("the general reference is the Established row: $96,000 over 8 deals", () => {
    expect(GENERAL_REFERENCE_COHORT).toBe("established");
    expect(GENERAL_REFERENCE_GCI).toBe(96_000);
    expect(GENERAL_REFERENCE_TRANSACTIONS).toBe(8);
    expect(GENERAL_REFERENCE_GCI_PER_DEAL).toBe(12_000);
  });

  // 2026-10-13: the figures were relabelled as Agent Runway's own and not
  // changed, so that no Runway Score moved. A change to any number here moves
  // the Benchmark component of every user's score and needs Andrew's sign-off.
  it("the reference table is the one the Runway Score has always used", () => {
    expect(BENCHMARKS).toEqual({
      rookie:      { medianGCI: 42_000,  p25GCI: 18_000, p75GCI: 72_000,  p90GCI: 110_000, medianTransactions: 4,  medianAvgPrice: 380_000 },
      growth:      { medianGCI: 78_000,  p25GCI: 45_000, p75GCI: 120_000, p90GCI: 185_000, medianTransactions: 7,  medianAvgPrice: 400_000 },
      established: { medianGCI: 96_000,  p25GCI: 58_000, p75GCI: 155_000, p90GCI: 240_000, medianTransactions: 8,  medianAvgPrice: 420_000 },
      topProducer: { medianGCI: 145_000, p25GCI: 85_000, p75GCI: 260_000, p90GCI: 400_000, medianTransactions: 12, medianAvgPrice: 460_000 },
    });
  });

  it("all cohort labels are defined", () => {
    expect(COHORT_LABELS.rookie).toBe("Rookie");
    expect(COHORT_LABELS.growth).toBe("Growth");
    expect(COHORT_LABELS.established).toBe("Established");
    expect(COHORT_LABELS.topProducer).toBe("Top Producer");
  });
});

// ── Wording ──────────────────────────────────────────────────────────────────

describe("experience level labels", () => {
  it("the years printed are the edges cohortFromYears() uses", () => {
    expect(COHORTS.map(cohortYears)).toEqual(["0–2 yrs", "3–5 yrs", "6–10 yrs", "over 10 yrs"]);
    // Every whole year lands in the level whose label names it.
    for (let years = 0; years <= 30; years++) {
      const cohort = cohortFromYears(years);
      const [low, high] = { rookie: [0, 2], growth: [3, 5], established: [6, 10], topProducer: [11, Infinity] }[cohort];
      expect(years, `${years} years is ${cohort}`).toBeGreaterThanOrEqual(low);
      expect(years, `${years} years is ${cohort}`).toBeLessThanOrEqual(high);
    }
  });

  it("joins the name and the years", () => {
    expect(cohortLabelWithYears("growth")).toBe("Growth (3–5 yrs)");
    expect(cohortLabelWithYears("topProducer")).toBe("Top Producer (over 10 yrs)");
  });
});

describe("Benchmark wording", () => {
  it("prints the score out of 100, never as a percentile", () => {
    expect(formatBenchmarkScore(62)).toBe("62/100");
    expect(formatBenchmarkScore(0)).toBe("0/100");
    expect(formatBenchmarkScore(NaN)).toBe("—");
  });

  it("says whose figures they are", () => {
    expect(BENCHMARK_COPY.provenance).toContain("The reference figures are Agent Runway's own.");
    expect(BENCHMARK_COPY.provenance).toContain("not a published industry or national statistic");
    expect(BENCHMARK_COPY.provenance).toContain("not a rank among other agents");
    expect(BENCHMARK_COPY.provenanceShort).toContain("Agent Runway's own, not a published industry or national statistic");
    expect(BENCHMARK_COPY.sourceTag).toBe("Agent Runway reference figures");
  });

  it("no string calls the figures an industry, national or peer statistic, or the score a percentile", () => {
    const claims = /industry[\s-](?:cohort|estimate|median|benchmark|average)|national (?:median|average|percentile)|\bpeers?\b|percentile|\bmedian\b|\bcohort\b/i;
    // The provenance lines and the voice rule name those words to rule them out.
    const denial = /\b(?:not|never)\b/i;
    const strings = [
      ...Object.values(BENCHMARK_COPY),
      benchmarkCardSubtitle("growth"),
      benchmarkGapLabel("Established"),
      benchmarkVsReference(40),
      benchmarkSentence(84_000, compare(84_000, 4)),
      benchmarkReferenceList(),
    ];
    for (const text of strings) {
      for (const sentence of text.split(/(?<=\.)\s+/)) {
        if (denial.test(sentence)) continue;
        expect(sentence, sentence).not.toMatch(claims);
      }
    }
  });

  it("the card subtitle names the level, its years and whose figures", () => {
    expect(benchmarkCardSubtitle("growth")).toBe("vs. Growth (3–5 yrs) · Agent Runway reference figures");
  });

  it("the gap row names the next level's reference GCI", () => {
    expect(benchmarkGapLabel("Established")).toBe("Gap to Established reference GCI");
  });

  it("50 is the reference GCI: above it, at it, below it", () => {
    expect(benchmarkVsReference(51)).toBe("above Agent Runway's reference GCI for your experience level");
    expect(benchmarkVsReference(50)).toBe("at Agent Runway's reference GCI for your experience level");
    expect(benchmarkVsReference(49)).toBe("below Agent Runway's reference GCI for your experience level");
    // The engine agrees: the reference GCI itself scores 50.
    for (const cohort of COHORTS) expect(percentileRank(BENCHMARKS[cohort].medianGCI, cohort)).toBe(50);
  });

  it("states the comparison in one sentence", () => {
    // $84,000 at 4 years: between the Growth 50 point ($78K) and 75 point ($120K)
    // t = 6000 / 42000 = 0.1429 → 50 + 3.57 = 53.57 → rounds to 54
    expect(benchmarkSentence(84_000, compare(84_000, 4))).toBe(
      "Projected GCI of $84,000 scores 54/100 on Agent Runway's reference scale for the Growth (3–5 yrs) level, where the reference GCI is $78,000.",
    );
  });

  it("lists the reference table for Flight Crew, one level per line, from the table", () => {
    expect(benchmarkReferenceList().split("\n")).toEqual([
      "- Rookie (0–2 yrs): reference GCI $42,000, 4 deals, average sale price $380,000",
      "- Growth (3–5 yrs): reference GCI $78,000, 7 deals, average sale price $400,000",
      "- Established (6–10 yrs): reference GCI $96,000, 8 deals, average sale price $420,000",
      "- Top Producer (over 10 yrs): reference GCI $145,000, 12 deals, average sale price $460,000",
    ]);
  });

  it("Flight Crew's rule names what the figures are and what never to call them", () => {
    expect(BENCHMARK_VOICE_RULE).toContain("Agent Runway's own reference figures with no published source");
    expect(BENCHMARK_VOICE_RULE).toContain("Never present them as an industry, national, board or peer statistic");
    expect(BENCHMARK_VOICE_RULE).toContain("Never call the Benchmark score a percentile or a rank among agents");
  });
});
