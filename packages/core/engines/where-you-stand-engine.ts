/**
 * WhereYouStand Engine
 *
 * Pure computation engine that answers four questions:
 *   1. Where am I relative to my market?
 *   2. Am I improving or falling behind?
 *   3. Why is this happening?
 *   4. What do I need to do next?
 *
 * All inputs come from already-computed values in dashboard-content.
 * This engine produces a typed result — no data fetching, no side effects.
 */

import type { BenchmarkResult, Cohort } from "./benchmark-engine";
import { BENCHMARKS } from "./benchmark-engine";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PerformanceBand = "launching" | "climbing" | "competitive" | "advancing" | "leading";

export const BAND_LABELS: Record<PerformanceBand, string> = {
  launching: "Launching",
  climbing: "Climbing",
  competitive: "Competitive",
  advancing: "Advancing",
  leading: "Leading",
};

export type MomentumDirection = "gaining" | "holding" | "losing" | "no_data";

export const MOMENTUM_LABELS: Record<MomentumDirection, string> = {
  gaining: "Gaining ground",
  holding: "Holding steady",
  losing: "Losing ground",
  no_data: "Not enough history",
};

export interface WhereYouStandResult {
  // Position
  band: PerformanceBand;
  bandLabel: string;
  bandIndex: number; // 0–4 for rendering

  // Identity line — the single most important sentence
  identityLine: string;

  // Momentum
  momentum: MomentumDirection;
  momentumLabel: string;
  momentumDetail: string | null; // e.g., "Your pace is outrunning the market by 12 points"

  // Diagnosis (expanded state)
  marketChangePct: number | null;    // board sales YoY % (reserved — market data layer is currently disabled)
  agentChangePct: number | null;     // agent deal growth YoY %
  diagnosisLine: string;             // one-sentence attribution

  // Distance to next tier
  distanceLine: string | null;       // e.g., "2 more closings this quarter..."
  dealsToNextTier: number | null;
  nextBandLabel: string | null;

  // Bridge to action
  bridgeLine: string;

  // Data confidence
  hasMarketData: boolean;
  hasPriorYear: boolean;
  tooEarlyToProject: boolean; // before March 1
}

// ── Input ──────────────────────────────────────────────────────────────────────

export interface WhereYouStandInput {
  // Agent performance (already computed in dashboard)
  ytdGCI: number;
  ytdDealCount: number;
  projectedGCI: number;
  avgDealGCI: number;           // ytdGCI / ytdDealCount
  goalGCI: number;
  fraction: number;             // seasonal fraction elapsed (0–1)

  // Benchmark (already computed)
  benchmark: BenchmarkResult;

  // Market momentum (always null — market data layer currently disabled)
  marketMomentum: {
    momentumTier: "gaining" | "tracking" | "trailing" | "no_data";
    agentDealGrowthPct: number | null;
    boardSalesYoYPct: number | null;
    gainLossVsMarket: number | null;
    avgDealsPerAgentPerYear: number | null;
    agentAnnualizedDeals: number | null;
    boardName: string;
  } | null;

  // Agent profile
  experienceYears: number | null;
  cohort: Cohort;

  // Prior year context
  hasPriorYearData: boolean;

  // Current quarter (0-based: 0=Q1, 3=Q4)
  currentQuarter: number;
}

// ── Band Determination ─────────────────────────────────────────────────────────

function percentileToBand(percentile: number): PerformanceBand {
  if (percentile >= 75) return "leading";
  if (percentile >= 50) return "advancing";
  if (percentile >= 25) return "competitive";
  if (percentile >= 10) return "climbing";
  return "launching";
}

function bandToIndex(band: PerformanceBand): number {
  const map: Record<PerformanceBand, number> = {
    launching: 0, climbing: 1, competitive: 2, advancing: 3, leading: 4,
  };
  return map[band];
}

function nextBand(band: PerformanceBand): PerformanceBand | null {
  const order: PerformanceBand[] = ["launching", "climbing", "competitive", "advancing", "leading"];
  const idx = order.indexOf(band);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

// ── Momentum Mapping ───────────────────────────────────────────────────────────

function mapMomentum(
  marketMomentum: WhereYouStandInput["marketMomentum"],
): MomentumDirection {
  if (!marketMomentum || marketMomentum.momentumTier === "no_data") return "no_data";
  if (marketMomentum.momentumTier === "gaining") return "gaining";
  if (marketMomentum.momentumTier === "trailing") return "losing";
  return "holding";
}

// ── Identity Line Generator ────────────────────────────────────────────────────

type PositionVsMarket = "above" | "at" | "below";

function getPositionVsMarket(
  marketMomentum: WhereYouStandInput["marketMomentum"],
): PositionVsMarket {
  if (
    !marketMomentum ||
    marketMomentum.avgDealsPerAgentPerYear == null ||
    marketMomentum.avgDealsPerAgentPerYear <= 0 ||
    !marketMomentum.agentAnnualizedDeals
  ) {
    return "at"; // default when no market data or market average is zero
  }
  const ratio = marketMomentum.agentAnnualizedDeals / marketMomentum.avgDealsPerAgentPerYear;
  if (ratio > 1.15) return "above";
  if (ratio < 0.85) return "below";
  return "at";
}

function generateIdentityLine(
  position: PositionVsMarket,
  momentum: MomentumDirection,
  experienceYears: number | null,
  hasPriorYear: boolean,
  tooEarly: boolean,
  boardName: string | null,
  marketNotDeclining: boolean,
): string {
  // Early-career softening
  const isEarlyCareer = experienceYears != null && experienceYears <= 2;

  // Too early in year — can't project meaningfully
  if (tooEarly) {
    return "It's early in the year — keep building pipeline and check back as deals close.";
  }

  // No market data available
  if (!boardName) {
    if (momentum === "no_data") {
      return "Keep logging deals — your year-over-year trend appears once you have enough history.";
    }
  }

  const board = boardName ? `on your board` : "in your market";

  // 3×3 matrix: position × momentum (+ early career override)
  if (isEarlyCareer && position === "below") {
    if (momentum === "gaining") {
      return "You're early in your career and building momentum. Your pace is heading the right direction.";
    }
    return "You're early in your career and still building volume. Most agents at your stage are in the same position.";
  }

  // Above market
  if (position === "above") {
    if (momentum === "gaining") {
      return `You're outperforming most agents ${board} and pulling further ahead.`;
    }
    if (momentum === "losing") {
      return `You're still ahead of most agents ${board}, but the gap is narrowing.`;
    }
    return `You're ahead of most agents ${board}. The question is whether you can sustain it.`;
  }

  // At market
  if (position === "at") {
    if (momentum === "gaining") {
      return `You're in the middle of the pack ${board} but gaining ground. Keep pushing.`;
    }
    if (momentum === "losing") {
      return `You're at the market average and trending down. Without a change, you'll fall below it.`;
    }
    return `You're tracking the market — not behind, not ahead. This is where most agents stay.`;
  }

  // Below market — sharper language when losing + market isn't the problem
  if (momentum === "gaining") {
    return `You're below the board average, but your pace is picking up. The trend is in your favor.`;
  }
  if (momentum === "losing" && marketNotDeclining) {
    return `You're falling behind your market. Pipeline is the priority right now.`;
  }
  if (momentum === "losing") {
    return `You're below average and the market is pulling away. Time to increase activity.`;
  }
  return `You're producing below the typical agent ${board}. Your pace hasn't changed.`;
}

// ── Diagnosis Generator ────────────────────────────────────────────────────────

function generateDiagnosis(
  agentChangePct: number | null,
  marketChangePct: number | null,
  hasPriorYear: boolean,
  goalGCI: number,
  ytdGCI: number,
  fraction: number,
  tooEarly: boolean,
): string {
  if (tooEarly) {
    return "Too early in the year for a meaningful comparison. Focus on pipeline building.";
  }

  // Both signals available — full diagnosis
  if (agentChangePct != null && marketChangePct != null) {
    const mktDir = marketChangePct >= 2 ? "up" : marketChangePct <= -2 ? "down" : "flat";
    const agtDir = agentChangePct >= 5 ? "up" : agentChangePct <= -5 ? "down" : "flat";
    const gap = agentChangePct - marketChangePct;

    // Market up, agent up more
    if (mktDir === "up" && agtDir === "up" && gap > 5) {
      return "The market grew and you outpaced it. You're capturing more than your share.";
    }
    // Market up, agent up less or flat
    if (mktDir === "up" && gap < -5) {
      return `The market is up ${Math.abs(Math.round(marketChangePct))}%, but your production hasn't kept pace. The opportunity is there — it's a capture issue.`;
    }
    // Market up, agent down
    if (mktDir === "up" && agtDir === "down") {
      return `The market grew ${Math.round(marketChangePct)}% but your production dropped. The market didn't slow you down — your pipeline did.`;
    }
    // Market down, agent down less or up
    if (mktDir === "down" && gap > 5) {
      return "The market contracted but you held up better than most. That's positioning, not luck.";
    }
    // Market down, agent down more
    if (mktDir === "down" && agtDir === "down" && gap < -5) {
      return `The market is down ${Math.abs(Math.round(marketChangePct))}% and your production dropped further. Activity needs to increase to offset the slower market.`;
    }
    // Market flat, agent growing
    if (mktDir === "flat" && agtDir === "up") {
      return "The market is flat but you're growing through it. That's pipeline work paying off.";
    }
    // Market flat, agent declining
    if (mktDir === "flat" && agtDir === "down") {
      return "The market held steady but your production slipped. This is a pipeline gap, not a market problem.";
    }
    // Both flat / both similar
    return "You're tracking the market closely. Consistent, but there's room to push ahead.";
  }

  // Only agent history available (no market-data signal)
  if (agentChangePct != null) {
    if (agentChangePct > 10) return "Your production is up significantly from last year. Strong trajectory.";
    if (agentChangePct < -10) return "Your production has dropped compared to last year. Worth examining what changed.";
    return "Your production is roughly in line with last year.";
  }

  // No prior year — fall back to pace-vs-goal
  if (goalGCI > 0 && fraction > 0) {
    const expectedGCI = goalGCI * fraction;
    const pctOfExpected = (ytdGCI / expectedGCI) * 100;
    if (pctOfExpected >= 110) return "You're running ahead of your annual target. Keep the pipeline fed.";
    if (pctOfExpected <= 75) return `You're at ${Math.round(pctOfExpected)}% of where you need to be for your goal. Pipeline is the priority.`;
    return "You're roughly on pace for your annual goal.";
  }

  return "Add a GCI goal in settings and log a few transactions to unlock the full year-over-year comparison.";
}

// ── Distance to Next Tier ──────────────────────────────────────────────────────

/**
 * Compute the GCI threshold for entering a given band within a cohort.
 * Band boundaries correspond to percentile thresholds:
 *   Climbing = 10th, Competitive = 25th, Advancing = 50th, Leading = 75th
 * These map to the cohort's p25/median/p75 breakpoints.
 */
function bandThresholdGCI(targetBand: PerformanceBand, cohort: Cohort): number {
  const b = BENCHMARKS[cohort];
  switch (targetBand) {
    case "climbing":    return Math.round(b.p25GCI * (10 / 25));   // 10th percentile
    case "competitive": return b.p25GCI;                            // 25th percentile
    case "advancing":   return b.medianGCI;                         // 50th percentile
    case "leading":     return b.p75GCI;                            // 75th percentile
    default:            return 0;
  }
}

function generateDistanceLine(
  band: PerformanceBand,
  cohort: Cohort,
  projectedGCI: number,
  avgDealGCI: number,
  currentQuarter: number,
): { line: string | null; deals: number | null; nextLabel: string | null } {
  const next = nextBand(band);
  if (!next) {
    return {
      line: "You're in the top tier. The goal now is to stay there.",
      deals: null,
      nextLabel: null,
    };
  }

  const threshold = bandThresholdGCI(next, cohort);
  const gciGap = Math.max(0, threshold - projectedGCI);
  if (gciGap <= 0) {
    return { line: null, deals: null, nextLabel: BAND_LABELS[next] };
  }

  const nextLabel = BAND_LABELS[next];

  // Express in deals when possible. `isFinite` guards against Infinity from
  // an upstream `ytdGCI / 0` divide — Math.ceil(gciGap / Infinity) silently
  // returns 0, producing prose like "0 more closings by end of Q2".
  if (avgDealGCI > 0 && isFinite(avgDealGCI)) {
    const dealsNeeded = Math.ceil(gciGap / avgDealGCI);
    const qLabel = `Q${currentQuarter + 1}`;

    // Monthly cadence hint — only when math divides cleanly
    const monthsLeftInQ = 3 - (new Date().getMonth() % 3);
    const perMonth = monthsLeftInQ > 0 ? dealsNeeded / monthsLeftInQ : 0;
    const cadenceHint =
      dealsNeeded >= 2 && monthsLeftInQ >= 2 && perMonth === Math.round(perMonth) && perMonth <= 3
        ? ` — about ${Math.round(perMonth)}/month`
        : "";

    // Quarterly framing
    if (currentQuarter <= 2) {
      // Q1-Q3: frame as deals this quarter
      if (dealsNeeded <= 1) {
        return {
          line: `One more closing moves you into ${nextLabel}.`,
          deals: 1,
          nextLabel,
        };
      }
      return {
        line: `${dealsNeeded} more closings by end of ${qLabel} would move you into ${nextLabel}${cadenceHint}.`,
        deals: dealsNeeded,
        nextLabel,
      };
    }
    // Q4: tighter framing
    if (dealsNeeded <= 2) {
      return {
        line: `${dealsNeeded} more closing${dealsNeeded === 1 ? "" : "s"} before year-end puts you in ${nextLabel}.`,
        deals: dealsNeeded,
        nextLabel,
      };
    }
    return {
      line: `Reaching ${nextLabel} this year would take about ${dealsNeeded} more deals. Focus on closing what's in pipeline.`,
      deals: dealsNeeded,
      nextLabel,
    };
  }

  // Fallback: express as GCI gap
  const gciK = Math.round(gciGap / 1000);
  return {
    line: `About $${gciK}K more projected GCI would move you into ${nextLabel}.`,
    deals: null,
    nextLabel,
  };
}

// ── Momentum Detail ────────────────────────────────────────────────────────────

function generateMomentumDetail(
  momentum: MomentumDirection,
  agentDealGrowthPct: number | null,
): string | null {
  if (momentum === "no_data") return null;
  if (agentDealGrowthPct == null) return null;

  const magnitude = Math.abs(agentDealGrowthPct);

  if (momentum === "gaining") {
    if (magnitude > 30) return "Your deal pace is significantly ahead of last year.";
    return "You're closing more than at this point last year.";
  }
  if (momentum === "losing") {
    if (magnitude > 30) return "Your deal pace has dropped sharply from last year. Activity is the lever.";
    return "You're behind last year's pace. More pipeline would close this gap.";
  }
  return "Your production is in line with where you were last year.";
}

// ── Bridge Line ────────────────────────────────────────────────────────────────

function generateBridgeLine(band: PerformanceBand, momentum: MomentumDirection): string {
  if (band === "leading" && momentum === "losing") {
    return "Your next move to hold your position ↓";
  }
  if (band === "leading") {
    return "Stay sharp — your next focus ↓";
  }
  if (momentum === "losing" || band === "launching" || band === "climbing") {
    return "This is how you close the gap ↓";
  }
  return "Your fastest path forward is below ↓";
}

// ── Main Computation ───────────────────────────────────────────────────────────

export function computeWhereYouStand(input: WhereYouStandInput): WhereYouStandResult {
  const {
    ytdGCI, ytdDealCount, projectedGCI, avgDealGCI, goalGCI, fraction,
    benchmark, marketMomentum, experienceYears, hasPriorYearData,
    currentQuarter,
  } = input;

  // Too early guard: before ~March 1 (fraction < 0.16), projections are unreliable
  const tooEarlyToProject = fraction < 0.16 && ytdDealCount < 3;

  // Band from benchmark percentile
  const band = tooEarlyToProject ? "competitive" : percentileToBand(benchmark.percentile);
  const bandIndex = bandToIndex(band);

  // Momentum
  const momentum = mapMomentum(marketMomentum);
  const momentumDetail = generateMomentumDetail(
    momentum,
    marketMomentum?.agentDealGrowthPct ?? null,
  );

  // Position vs market (for identity line)
  const position = getPositionVsMarket(marketMomentum);

  // Market not declining = market is flat or up (boardSalesYoYPct >= -2)
  const marketNotDeclining = marketMomentum?.boardSalesYoYPct == null
    || marketMomentum.boardSalesYoYPct >= -2;

  // Identity line
  const identityLine = generateIdentityLine(
    position, momentum, experienceYears, hasPriorYearData, tooEarlyToProject,
    marketMomentum?.boardName ?? null, marketNotDeclining,
  );

  // Diagnosis
  const agentChangePct = marketMomentum?.agentDealGrowthPct ?? null;
  const marketChangePct = marketMomentum?.boardSalesYoYPct ?? null;
  const diagnosisLine = generateDiagnosis(
    agentChangePct, marketChangePct, hasPriorYearData,
    goalGCI, ytdGCI, fraction, tooEarlyToProject,
  );

  // Distance to next tier — uses cohort-specific band thresholds, NOT cross-cohort distance
  const { line: distanceLine, deals: dealsToNextTier, nextLabel: nextBandLabel } =
    generateDistanceLine(band, input.cohort, projectedGCI, avgDealGCI, currentQuarter);

  // Bridge to action
  const bridgeLine = generateBridgeLine(band, momentum);

  return {
    band,
    bandLabel: BAND_LABELS[band],
    bandIndex,
    identityLine,
    momentum,
    momentumLabel: MOMENTUM_LABELS[momentum],
    momentumDetail,
    marketChangePct,
    agentChangePct,
    diagnosisLine,
    distanceLine,
    dealsToNextTier,
    nextBandLabel,
    bridgeLine,
    hasMarketData: marketMomentum != null,
    hasPriorYear: hasPriorYearData,
    tooEarlyToProject,
  };
}
