// ProbabilisticForecastEngine — ported from Swift
// Probability bands using historical variance for year-end GCI projections.

import { monthlyGCITotals } from "./projection-engine";
import type { Transaction } from "../types/database";

// ── Probability Bands ───────────────────────────────────────────────────────

export type Confidence = "low" | "medium" | "high";

export interface ProbabilityBands {
  p10: number; // pessimistic (-2σ)
  p25: number; // conservative (-1σ)
  p50: number; // base (median)
  p75: number; // optimistic (+1σ)
  p90: number; // best-case (+2σ)
  confidence: Confidence;
  monthsOfData: number;
}

// ── Computation ─────────────────────────────────────────────────────────────

/** Compute probability bands for projected year-end GCI. */
export function probabilityBands(
  transactions: Transaction[],
  baseProjectedGCI: number,
  _seasonalFraction?: number,
): ProbabilityBands {
  const totals = monthlyGCITotals(transactions);
  const nonZeroMonths = totals.filter((v) => v > 0);
  const monthCount = nonZeroMonths.length;

  // Use ALL elapsed months (including zeros) for variance so bands widen
  // appropriately when there are zero-GCI months, but keep nonZeroMonths
  // count for the mean/projection midpoint so zeros don't drag it down.
  const { lowBand, highBand, confidence } = varianceBands(
    totals,
    totals.length,
  );

  // Floor at 0 — negative projections (clawbacks) produce nonsensical bands.
  // Guard against NaN: Math.max(0, NaN) === NaN, so we must check isFinite first.
  const base = Number.isFinite(baseProjectedGCI) ? Math.max(0, baseProjectedGCI) : 0;
  return {
    p10: Math.max(0, base * (1.0 - highBand)),
    p25: Math.max(0, base * (1.0 - lowBand)),
    p50: base,
    p75: base * (1.0 + lowBand),
    p90: base * (1.0 + highBand),
    confidence,
    monthsOfData: monthCount,
  };
}

/** Returns (±1σ band fraction, ±2σ band fraction, confidence). */
function varianceBands(
  monthlyTotals: number[],
  monthCount: number,
): { lowBand: number; highBand: number; confidence: Confidence } {
  if (monthCount < 6) {
    return { lowBand: 0.15, highBand: 0.3, confidence: "low" };
  }

  const mean = monthlyTotals.reduce((a, b) => a + b, 0) / monthCount;
  // Guard against NaN (e.g. if upstream data contains NaN) and non-positive means.
  if (!Number.isFinite(mean) || mean <= 0) {
    return { lowBand: 0.15, highBand: 0.3, confidence: "low" };
  }

  // Bessel's correction (N-1) for small sample sizes
  const variance =
    monthlyTotals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    Math.max(1, monthCount - 1);
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation

  // Clamp CV to reasonable bounds (5%–50%)
  const clampedCV = Math.min(0.5, Math.max(0.05, cv));

  const confidence: Confidence = monthCount >= 12 ? "high" : "medium";

  return { lowBand: clampedCV, highBand: clampedCV * 2.0, confidence };
}

// ── 5-Year Probability Bands ────────────────────────────────────────────────

export interface YearBand {
  id: number; // year offset (1-5)
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

/** Generate 5-year probability bands. Bands widen slightly each year. */
export function fiveYearBands(
  startingGCI: number,
  growthRates: number[], // decimal (e.g. 0.10 for 10%)
  currentYearBands: ProbabilityBands,
): YearBand[] {
  const currentYear = new Date().getFullYear();
  const bandWidth1σ =
    currentYearBands.p50 > 0
      ? (currentYearBands.p75 - currentYearBands.p50) / currentYearBands.p50
      : 0.15;

  const results: YearBand[] = [];
  let base = startingGCI;

  for (let i = 0; i < 5; i++) {
    const rate = i < growthRates.length ? growthRates[i] : 0;
    base *= 1.0 + rate;
    // Bands widen 5% per year
    const yearBand = bandWidth1σ * (1.0 + 0.05 * i);
    results.push({
      id: i + 1,
      year: currentYear + i + 1,
      p10: Math.max(0, base * (1.0 - yearBand * 2.0)),
      p25: Math.max(0, base * (1.0 - yearBand)),
      p50: base,
      p75: base * (1.0 + yearBand),
      p90: base * (1.0 + yearBand * 2.0),
    });
  }
  return results;
}
