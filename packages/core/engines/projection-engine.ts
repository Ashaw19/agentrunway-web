// ProjectionEngine — ported from Swift
// Day-accurate projection math for real-time business intelligence.

import { computeGCI, type Transaction } from "../types/database";

// ── Calendar Awareness ──────────────────────────────────────────────────────

/**
 * Parse a transaction-style date string ("YYYY-MM-DD" or full ISO
 * timestamp) into a Date that anchors at local noon on the intended
 * civil date.
 *
 * `new Date("2026-01-01")` resolves to UTC midnight, which on negative
 * UTC offsets (e.g. Atlantic time UTC-04) becomes Dec 31 2025 local —
 * causing dashboard YTD (local) to disagree with Captain YTD (UTC) on
 * Jan 1–2 every year. Anchoring the date-only form at noon eliminates
 * that drift while preserving full timestamps untouched.
 */
export function parseTxDate(value: string | Date | null | undefined): Date {
  if (value instanceof Date) return value;
  if (!value) return new Date(NaN);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (dateOnly) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  return new Date(value);
}

/** Current day of the year (1–365/366). */
export function dayOfYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/** Total days in the year. */
export function daysInYear(date: Date = new Date()): number {
  const year = date.getFullYear();
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
}

/** Fraction of the year elapsed (0.0–1.0). */
export function yearFractionElapsed(date: Date = new Date()): number {
  return dayOfYear(date) / daysInYear(date);
}

/** Days remaining in the year (including today). */
export function daysRemaining(date: Date = new Date()): number {
  return daysInYear(date) - dayOfYear(date);
}

/** Current quarter index (0–3). */
export function currentQuarter(date: Date = new Date()): number {
  return Math.floor(date.getMonth() / 3);
}

/** Current week of the year. */
export function weekOfYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.ceil((diff / 86_400_000 + start.getDay() + 1) / 7);
}

/** Descriptive "today" string: "Day 60 of 365 · Q1 Week 9" */
export function todayDescription(date: Date = new Date()): string {
  const day = dayOfYear(date);
  const total = daysInYear(date);
  const q = currentQuarter(date) + 1;
  const week = weekOfYear(date);
  return `Day ${day} of ${total} · Q${q} Week ${week}`;
}

// ── Seasonality-Weighted Projections ────────────────────────────────────────

/**
 * Coerce quarter weights into normalized fractions (sum ≈ 1).
 *
 * The DB column `settings.national_quarter_pcts` is stored as percentages
 * (default `[25,25,25,25]`, sum=100) while agent-derived weights are
 * stored as fractions (sum≈1). Engine math expects fractions. Every
 * consumer that indexes `seasonalWeights[q]` or passes them to
 * `seasonalFractionElapsed` should normalize first — calling through
 * this helper keeps the rule in one place.
 *
 * Returns `[0.25,0.25,0.25,0.25]` when the input is missing, wrong length,
 * non-finite, non-positive sum, or otherwise unusable — so callers never
 * have to guard their own fallback.
 */
export function normalizeSeasonalWeights(weights: number[] | null | undefined): number[] {
  const uniform = [0.25, 0.25, 0.25, 0.25];
  if (!weights || weights.length !== 4) return uniform;
  const cleaned = weights.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = cleaned.reduce((a, b) => a + b, 0);
  if (sum <= 0) return uniform;
  return cleaned.map((v) => v / sum);
}

/**
 * Fraction of year elapsed, weighted by quarterly seasonality.
 * Accepts weights stored as fractions (sum≈1) OR percentages (sum≈100) —
 * they are normalized internally via `normalizeSeasonalWeights` so every
 * call site (dashboard, reports, altimeter, forecast, overhead, scenarios,
 * crons, chat, diagnostics) produces the same fraction regardless of how
 * the row was seeded.
 *
 * UTC-ANCHORED: quarter boundaries (qStart/qEnd) and the current quarter
 * index are derived in UTC so server-rendered surfaces (chat route, cron
 * jobs) and client-rendered surfaces (dashboard, reports, forecast, etc.)
 * produce the same fraction for the same instant. Prior behaviour used
 * `new Date(year, month, 1)`, which resolves to LOCAL midnight and drifts
 * by the runtime's TZ offset — that shifted paceScore by 1 point between
 * the Captain (server, UTC) and the dashboard (client, local), which
 * propagated to a 1-point Runway Score divergence.
 */
export function seasonalFractionElapsed(
  weights: number[],
  date: Date = new Date(),
): number {
  if (!weights || weights.length !== 4) return yearFractionElapsed(date);
  const w = normalizeSeasonalWeights(weights);

  const year = date.getUTCFullYear();
  const qIndex = Math.floor(date.getUTCMonth() / 3);

  // Quarter start and end dates — UTC so all runtimes agree.
  const qStartMonth = qIndex * 3;
  const qStart = new Date(Date.UTC(year, qStartMonth, 1));
  const qEnd = new Date(Date.UTC(year, qStartMonth + 3, 1));

  const qTotalDays = Math.max(
    1,
    (qEnd.getTime() - qStart.getTime()) / 86_400_000,
  );
  const qElapsedDays = Math.max(
    0,
    (date.getTime() - qStart.getTime()) / 86_400_000,
  );
  const withinQ = qElapsedDays / qTotalDays;

  // Sum of completed quarters (using normalized weights)
  let fraction = 0;
  for (let i = 0; i < qIndex; i++) {
    fraction += w[i];
  }
  fraction += w[qIndex] * withinQ;

  return Math.min(0.999, Math.max(0.01, fraction));
}

// ── GCI / Transaction Projections ───────────────────────────────────────────

/**
 * Project year-end GCI from closed deals + weighted pipeline.
 * Early-year guard: when less than 10% of the year has elapsed,
 * blend the raw extrapolation toward the goal (or the closed total)
 * to avoid a single January deal projecting a million-dollar year.
 */
export function projectedYearEndGCI(
  closedGCI: number,
  pipelineWeightedGCI: number = 0,
  seasonalFraction: number,
  goalGCI: number = 0,
): number {
  if (!isFinite(seasonalFraction) || seasonalFraction <= 0) return closedGCI;
  const paceBasedProjection = closedGCI / seasonalFraction;
  const pipelineAdj = pipelineWeightedGCI * 0.5;
  const rawProjection = paceBasedProjection + pipelineAdj;

  // Early-year dampening: blend raw extrapolation toward goal (or actual)
  // to prevent a single early deal from implying a wildly inflated year.
  if (seasonalFraction < 0.10) {
    // Confidence ramp: at fraction=0.01 → 10% raw, at fraction=0.10 → 100% raw
    const confidence = Math.min(1, seasonalFraction / 0.10);
    const anchor = goalGCI > 0 ? goalGCI : closedGCI;
    return anchor * (1 - confidence) + rawProjection * confidence;
  }

  return rawProjection;
}

/** Project year-end transaction count. */
export function projectedYearEndTransactions(
  closedCount: number,
  pipelineCount: number = 0,
  seasonalFraction: number,
): number {
  if (!isFinite(seasonalFraction) || seasonalFraction <= 0) return closedCount;
  const paceBasedProjection = closedCount / seasonalFraction;
  const raw = Math.round(paceBasedProjection + pipelineCount * 0.3);
  // Early-year dampening for deal count too
  if (seasonalFraction < 0.10) {
    const confidence = Math.min(1, seasonalFraction / 0.10);
    return Math.round(closedCount * (1 - confidence) + raw * confidence);
  }
  return raw;
}

// ── Pace Analysis ───────────────────────────────────────────────────────────

/** Required daily GCI pace to hit a goal. */
export function dailyPaceRequired(
  goal: number,
  achieved: number,
  daysRem: number,
): number {
  if (daysRem <= 0) return 0;
  return Math.max(0, goal - achieved) / daysRem;
}

/** Current daily GCI pace (achieved / days elapsed). */
export function currentDailyPace(achieved: number, daysElapsed: number): number {
  if (daysElapsed <= 0) return 0;
  return achieved / daysElapsed;
}

/** How far ahead or behind goal pace (%). Positive = ahead, negative = behind. */
export function paceVsGoalPercent(
  goal: number,
  achieved: number,
  fractionElapsed: number,
): number {
  if (goal <= 0 || fractionElapsed <= 0) return 0;
  const expectedAtThisPoint = goal * fractionElapsed;
  if (expectedAtThisPoint <= 0) return 0;
  return ((achieved - expectedAtThisPoint) / expectedAtThisPoint) * 100;
}

// ── Trend Detection ─────────────────────────────────────────────────────────

export type TrendDirection = "up" | "flat" | "down";

/** Detect trend direction from transaction history. */
export function trendDirection(transactions: Transaction[]): TrendDirection {
  const closed = transactions.filter((tx) => tx.status === "closed");
  if (closed.length < 5) return "flat";

  const monthly = monthlyGCITotals(closed);
  if (monthly.length < 3) return "flat";

  const recentMonths = monthly.slice(-2);
  const olderMonths = monthly.slice(0, -2);

  if (olderMonths.length === 0) return "flat";

  const recentAvg = recentMonths.reduce((a, b) => a + b, 0) / recentMonths.length;
  const olderAvg = olderMonths.reduce((a, b) => a + b, 0) / olderMonths.length;

  if (olderAvg <= 0) return "flat";

  const change = (recentAvg - olderAvg) / olderAvg;
  if (change > 0.1) return "up";
  if (change < -0.1) return "down";
  return "flat";
}

/** Monthly GCI totals for the current year, ordered by month. */
export function monthlyGCITotals(transactions: Transaction[]): number[] {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed

  const yearTx = transactions.filter(
    (tx) =>
      tx.status === "closed" &&
      parseTxDate(tx.date).getFullYear() === currentYear,
  );

  const monthlyTotals = new Array(12).fill(0);
  for (const tx of yearTx) {
    const month = parseTxDate(tx.date).getMonth();
    if (month >= 0 && month < 12) {
      monthlyTotals[month] += computeGCI(tx);
    }
  }

  // Only return months up to the current month
  return monthlyTotals.slice(0, currentMonth + 1);
}

// ── Month Projections (for charts) ──────────────────────────────────────────

export interface MonthProjection {
  month: number; // 1-12
  year: number;
  gci: number;
  isActual: boolean;
}

/** Generate month-by-month projections for chart display. */
export function monthlyProjections(
  transactions: Transaction[],
  goalGCI: number,
  seasonalWeights: number[],
): MonthProjection[] {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-indexed

  const monthlyActuals = monthlyGCITotals(transactions);

  // Monthly weights derived from quarterly weights.
  // Normalize first so callers can pass either percentages or fractions.
  let monthWeights: number[];
  if (seasonalWeights.length === 4) {
    const qW = normalizeSeasonalWeights(seasonalWeights);
    monthWeights = [];
    for (let q = 0; q < 4; q++) {
      const share = qW[q] / 3;
      monthWeights.push(share, share, share);
    }
  } else {
    monthWeights = new Array(12).fill(1 / 12);
  }

  const projections: MonthProjection[] = [];

  for (let month = 1; month <= 12; month++) {
    const idx = month - 1;
    if (month <= currentMonth) {
      projections.push({
        month,
        year: currentYear,
        gci: idx < monthlyActuals.length ? monthlyActuals[idx] : 0,
        isActual: true,
      });
    } else {
      const projected = goalGCI > 0 ? goalGCI * monthWeights[idx] : 0;
      projections.push({
        month,
        year: currentYear,
        gci: projected,
        isActual: false,
      });
    }
  }

  return projections;
}
