/**
 * Benchmark engine (ported from Swift). Single source of truth for the
 * Benchmark figures and for every word a surface prints about them: the
 * dashboard, Altimeter, Reports, the team dashboard, the annual review, both
 * PDFs, the advisor and team insight cards, Flight Crew's knowledge, the
 * marketing pages and the Terms.
 *
 * The Benchmark places an agent's projected annual GCI on a 0–99 scale for
 * their years of experience. That number is the Benchmark component of the
 * Runway Score (5%).
 *
 * THE FIGURES HAVE NO PUBLISHED SOURCE. The table came across from the Swift
 * app described as "industry-cohort estimates aggregated from public industry
 * sources". No source was ever named, and none exists to name: CREA and
 * Statistics Canada publish no agent GCI by years of experience. Until
 * 2026-10-13 the app called them industry estimates, a cohort median, a
 * percentile and a national median.
 *
 * Andrew's decision that day: keep the numbers, so no Runway Score moves, and
 * say whose they are. They are Agent Runway's own reference figures (not
 * "estimates": nothing was measured to estimate from). No
 * surface calls them an industry, national or peer statistic, and none calls
 * the score a percentile or a rank among agents, because nothing here
 * measures other agents. The field names below (`medianGCI`, `p25GCI`,
 * `percentile`) are the anchor points of Agent Runway's reference scale, not
 * statistics of a measured group. Print the wording in BENCHMARK_COPY.
 */

import { fmtCurrency } from "../formatters";

// ── Experience Level ────────────────────────────────────────────────────────

export type Cohort = "rookie" | "growth" | "established" | "topProducer";

/** The levels in order of experience. */
export const COHORTS = ["rookie", "growth", "established", "topProducer"] as const satisfies readonly Cohort[];

/** Level names describe years licensed, not production. */
export const COHORT_LABELS: Record<Cohort, string> = {
  rookie: "Rookie",
  growth: "Growth",
  established: "Established",
  topProducer: "Top Producer",
};

/** Last year of experience in each level, inclusive. Top Producer is everything past Established. */
const COHORT_MAX_YEARS = { rookie: 2, growth: 5, established: 10 } as const;

export function cohortFromYears(years: number): Cohort {
  if (!isFinite(years) || years < 0) return "growth"; // safe fallback for NaN / Infinity / negative
  if (years <= COHORT_MAX_YEARS.rookie) return "rookie";
  if (years <= COHORT_MAX_YEARS.growth) return "growth";
  if (years <= COHORT_MAX_YEARS.established) return "established";
  return "topProducer";
}

/** The years a level covers, from the same edges cohortFromYears() uses: "3–5 yrs", "over 10 yrs". */
export function cohortYears(cohort: Cohort): string {
  switch (cohort) {
    case "rookie":      return `0–${COHORT_MAX_YEARS.rookie} yrs`;
    case "growth":      return `${COHORT_MAX_YEARS.rookie + 1}–${COHORT_MAX_YEARS.growth} yrs`;
    case "established": return `${COHORT_MAX_YEARS.growth + 1}–${COHORT_MAX_YEARS.established} yrs`;
    case "topProducer": return `over ${COHORT_MAX_YEARS.established} yrs`;
  }
}

/** A level with its years: "Growth (3–5 yrs)". */
export function cohortLabelWithYears(cohort: Cohort): string {
  return `${COHORT_LABELS[cohort]} (${cohortYears(cohort)})`;
}

// ── Reference Figures (Agent Runway's own, no published source) ─────────────

interface CohortBenchmark {
  /** GCI at 50 on the scale: the level's reference GCI. */
  medianGCI: number;
  /** GCI at 25, 75 and 90 on the scale. */
  p25GCI: number;
  p75GCI: number;
  p90GCI: number;
  /** Reference deal count and sale price. Told to Flight Crew; no score uses them. */
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

/**
 * The one reference used where a card compares every agent to the same
 * figure, whatever their experience: the Established level's. Until
 * 2026-10-13 these were exported as a "national median". They were never
 * national figures, only this row under another name.
 */
export const GENERAL_REFERENCE_COHORT: Cohort = "established";
export const GENERAL_REFERENCE_GCI = BENCHMARKS[GENERAL_REFERENCE_COHORT].medianGCI;
export const GENERAL_REFERENCE_TRANSACTIONS = BENCHMARKS[GENERAL_REFERENCE_COHORT].medianTransactions;
/** Reference GCI per deal: the general reference GCI over its deal count. */
export const GENERAL_REFERENCE_GCI_PER_DEAL = GENERAL_REFERENCE_GCI / Math.max(1, GENERAL_REFERENCE_TRANSACTIONS);

// ── Benchmark Score ─────────────────────────────────────────────────────────

/**
 * Where agentGCI sits on a level's reference scale, 0–99. Linear
 * interpolation between the level's anchor points at 25, 50, 75 and 90.
 * Printed as a Benchmark score ("62/100"), never as a percentile of agents.
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
  /** Benchmark score, 0–99, on the agent's own level's scale. The Runway Score's Benchmark component. */
  percentile: number;
  cohort: Cohort;
  /** The level's reference GCI (50 on its scale). */
  cohortMedianGCI: number;
  /** Projected GCI short of the next level's reference GCI. Null at the last level. */
  distanceToNextTier: number | null;
  nextTierLabel: string | null;
  /** The same projected GCI on the Established level's scale, 0–99. */
  establishedPercentile: number;
}

/** Full benchmark comparison from projected GCI and experience years. */
export function compare(
  projectedGCI: number,
  experienceYears: number | null,
): BenchmarkResult {
  const cohort = cohortFromYears(experienceYears ?? 5);
  const pct = percentileRank(projectedGCI, cohort);
  const cohortBench = BENCHMARKS[cohort];

  const establishedPct = percentileRank(projectedGCI, GENERAL_REFERENCE_COHORT);

  // Distance to the next level's reference GCI
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
    establishedPercentile: establishedPct,
  };
}

// ── Wording ─────────────────────────────────────────────────────────────────

/** A Benchmark score as it prints: "62/100". */
export function formatBenchmarkScore(score: number): string {
  return Number.isFinite(score) ? `${Math.round(score)}/100` : "—";
}

/**
 * The Benchmark, worded once. A surface that prints one of these cannot call
 * the figures an industry statistic or the score a rank among agents.
 */
export const BENCHMARK_COPY = {
  /** Whose figures they are. Said wherever the Benchmark is explained, not just shown. */
  provenance:
    "The reference figures are Agent Runway's own. They are not a published industry or national statistic, and the score is not a rank among other agents.",
  /** The same, short enough for a footnote under a card. */
  provenanceShort: "Reference figures are Agent Runway's own, not a published industry or national statistic.",
  /** After the level on a card: "vs. Growth (3–5 yrs) · Agent Runway reference figures". */
  sourceTag: "Agent Runway reference figures",
  /** Label for the 0–100 number. */
  scoreLabel: "Benchmark score",
  /** Label for a level's reference GCI. */
  referenceGciLabel: "Reference GCI",
  /** Label for the same projected GCI on the Established level's scale. */
  establishedScoreLabel: `On the ${COHORT_LABELS[GENERAL_REFERENCE_COHORT]} scale`,
  /** What the Benchmark is, in one sentence. */
  definition:
    "Your projected annual GCI placed on Agent Runway's reference scale for your years of experience, from 0 to 100.",
  /** How to read the number. */
  scale: "50 is the reference GCI for your experience level. A higher projected GCI scores higher.",
  /** One-line feature description for a feature grid or a schema feature list. */
  feature: "Benchmark score against Agent Runway's reference figures for your years of experience",
  /** The same, short enough for a plan's bullet list. */
  featureShort: "Benchmark score (Agent Runway's reference figures)",
} as const;

/** Label for the gap row: "Gap to Established reference GCI". */
export function benchmarkGapLabel(nextTierLabel: string): string {
  return `Gap to ${nextTierLabel} reference GCI`;
}

/** The card subtitle: "vs. Growth (3–5 yrs) · Agent Runway reference figures". */
export function benchmarkCardSubtitle(cohort: Cohort): string {
  return `vs. ${cohortLabelWithYears(cohort)} · ${BENCHMARK_COPY.sourceTag}`;
}

/**
 * Where a score sits against the level's reference GCI, to finish "Your
 * projected GCI is …". 50 on the scale is the reference GCI itself.
 */
export function benchmarkVsReference(score: number): string {
  const side = score > 50 ? "above" : score < 50 ? "below" : "at";
  return `${side} Agent Runway's reference GCI for your experience level`;
}

/**
 * The comparison in one sentence, for an explainer or for Flight Crew:
 * "Projected GCI of $84,000 scores 54/100 on Agent Runway's reference scale
 * for the Growth level (3–5 yrs), where the reference GCI is $78,000."
 */
export function benchmarkSentence(projectedGCI: number, result: BenchmarkResult): string {
  return (
    `Projected GCI of ${fmtCurrency(projectedGCI)} scores ${formatBenchmarkScore(result.percentile)} ` +
    `on Agent Runway's reference scale for the ${cohortLabelWithYears(result.cohort)} level, ` +
    `where the reference GCI is ${fmtCurrency(result.cohortMedianGCI)}.`
  );
}

/**
 * The reference table as a list, one level per line, for Flight Crew's
 * knowledge and playbooks: "- Growth (3–5 yrs): reference GCI $78,000,
 * 7 deals, average sale price $400,000".
 */
export function benchmarkReferenceList(): string {
  return COHORTS.map((cohort) => {
    const b = BENCHMARKS[cohort];
    return (
      `- ${cohortLabelWithYears(cohort)}: reference GCI ${fmtCurrency(b.medianGCI)}, ` +
      `${b.medianTransactions} deals, average sale price ${fmtCurrency(b.medianAvgPrice)}`
    );
  }).join("\n");
}

/**
 * How Flight Crew talks about the Benchmark. Printed in its knowledge base,
 * its Benchmark playbook and beside the figures in the chat context, so the
 * rule travels with the number.
 */
export const BENCHMARK_VOICE_RULE =
  "The Benchmark figures are Agent Runway's own reference figures with no published source. " +
  "Call them Agent Runway's reference figures. Never present them as an industry, national, board or peer statistic. " +
  "Never call the Benchmark score a percentile or a rank among agents, and never say the agent is ahead of or behind other agents because of it.";
