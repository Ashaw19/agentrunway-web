// BenchmarkEngine — ported from Swift
// Canadian agent benchmarks + percentile ranking.
// Static industry-cohort estimates (aggregated from public industry sources).

// ── Experience Cohort ───────────────────────────────────────────────────────

export type Cohort = "rookie" | "growth" | "established" | "topProducer";

export const COHORT_LABELS: Record<Cohort, string> = {
  rookie: "Rookie",
  growth: "Growth",
  established: "Established",
  topProducer: "Top Producer",
};

export function cohortFromYears(years: number): Cohort {
  if (!isFinite(years) || years < 0) return "growth"; // safe fallback for NaN / Infinity / negative
  if (years <= 2) return "rookie";
  if (years <= 5) return "growth";
  if (years <= 10) return "established";
  return "topProducer";
}

// ── Benchmark Data (industry-cohort estimates) ──────────────────────────────

interface CohortBenchmark {
  medianGCI: number;
  p25GCI: number;
  p75GCI: number;
  p90GCI: number;
  medianTransactions: number;
  medianAvgPrice: number;
}

export const BENCHMARKS: Record<Cohort, CohortBenchmark> = {
  rookie: {
    medianGCI: 42_000, p25GCI: 18_000, p75GCI: 72_000, p90GCI: 110_000,
    medianTransactions: 4, medianAvgPrice: 380_000,
  },
  growth: {
    medianGCI: 78_000, p25GCI: 45_000, p75GCI: 120_000, p90GCI: 185_000,
    medianTransactions: 7, medianAvgPrice: 400_000,
  },
  established: {
    medianGCI: 96_000, p25GCI: 58_000, p75GCI: 155_000, p90GCI: 240_000,
    medianTransactions: 8, medianAvgPrice: 420_000,
  },
  topProducer: {
    medianGCI: 145_000, p25GCI: 85_000, p75GCI: 260_000, p90GCI: 400_000,
    medianTransactions: 12, medianAvgPrice: 460_000,
  },
};

export const NATIONAL_MEDIAN_GCI = 96_000;
export const NATIONAL_MEDIAN_TRANSACTIONS = 8;
export const NATIONAL_MEDIAN_AVG_PRICE = 380_000;

// ── Percentile Ranking ──────────────────────────────────────────────────────

/**
 * Returns 0–100 percentile rank of agentGCI within a cohort.
 * Uses linear interpolation between p25/median/p75/p90 breakpoints.
 */
export function percentileRank(agentGCI: number, cohort: Cohort): number {
  const b = BENCHMARKS[cohort];
  if (!b || agentGCI <= 0) return 0;

  const points: [number, number][] = [
    [0, 0],
    [b.p25GCI, 25],
    [b.medianGCI, 50],
    [b.p75GCI, 75],
    [b.p90GCI, 90],
    [b.p90GCI * 1.5, 99],
  ];

  for (let i = 1; i < points.length; i++) {
    const [v0, p0] = points[i - 1];
    const [v1, p1] = points[i];
    if (agentGCI <= v1) {
      const t = (agentGCI - v0) / Math.max(1, v1 - v0);
      return Math.round(p0 + t * (p1 - p0));
    }
  }
  return 99;
}

// ── Benchmark Comparison Result ─────────────────────────────────────────────

export interface BenchmarkResult {
  percentile: number; // 0–100 within cohort
  cohort: Cohort;
  cohortMedianGCI: number;
  distanceToNextTier: number | null;
  nextTierLabel: string | null;
  nationalPercentile: number;
}

/** Full benchmark comparison from projected GCI and experience years. */
export function compare(
  projectedGCI: number,
  experienceYears: number | null,
): BenchmarkResult {
  const cohort = cohortFromYears(experienceYears ?? 5);
  const pct = percentileRank(projectedGCI, cohort);
  const cohortBench = BENCHMARKS[cohort];

  // Percentile vs established agents (used as broad benchmark proxy)
  const nationalPct = percentileRank(projectedGCI, "established");

  // Distance to next cohort's median
  const nextTierMap: Record<Cohort, Cohort | null> = {
    rookie: "growth",
    growth: "established",
    established: "topProducer",
    topProducer: null,
  };
  const nextTier = nextTierMap[cohort];
  const distanceToNext =
    nextTier != null
      ? Math.max(0, BENCHMARKS[nextTier].medianGCI - projectedGCI)
      : null;

  return {
    percentile: pct,
    cohort,
    cohortMedianGCI: cohortBench.medianGCI,
    distanceToNextTier: distanceToNext,
    nextTierLabel: nextTier ? COHORT_LABELS[nextTier] : null,
    nationalPercentile: nationalPct,
  };
}
