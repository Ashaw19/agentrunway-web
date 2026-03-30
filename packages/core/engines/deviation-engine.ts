/**
 * DeviationEngine — Experience-aware personal baseline deviation detection.
 *
 * Four components, no more:
 * 1. Experience tier (early / mid / established) — tone only
 * 2. Personal baselines — rolling average from agent's own data
 * 3. Deviation detection — current vs baseline, ≥20% threshold
 * 4. Tone adjustment — experience-appropriate framing
 *
 * Design principles:
 * - One metric = one insight
 * - No cross-metric reasoning
 * - No stored baselines — pure computation
 * - Missing data → null → no insight (never fabricate)
 */

import { computeGCI, type Transaction, type ContactActivity } from "../types/database";

/** Parse "YYYY-MM-DD" directly to avoid Date constructor timezone issues. */
function yearMonth(dateStr: string): number | null {
  const parts = dateStr.split("-");
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return null;
  return y * 12 + (m - 1); // 0-indexed month
}

// ── 1. Experience Tier ──────────────────────────────────────────────────────

export type ExperienceTier = "early" | "mid" | "established";

/** Derive tier from experience_years. Null/undefined defaults to "early". */
export function experienceTier(years: number | null | undefined): ExperienceTier {
  if (years == null || years < 0) return "early";
  if (years < 3) return "early";
  if (years < 8) return "mid";
  return "established";
}

// ── 2. Personal Baselines ───────────────────────────────────────────────────

export interface PersonalBaselines {
  /** Average monthly GCI over baseline window, null if < 3 months data */
  monthlyGCI: number | null;
  /** Average deals per month over baseline window, null if < 3 months data */
  monthlyDeals: number | null;
  /** Average expense ratio (expenses/GCI) over baseline window, null if < 3 months data or no GCI */
  expenseRatio: number | null;
  /** Average monthly touchpoints over baseline window, null if < 3 months data */
  monthlyTouchpoints: number | null;
  /** Number of months of data used for baselines */
  monthsOfData: number;
}

/**
 * Compute personal baselines from raw data.
 *
 * Uses up to 12 months of data ending at the previous month.
 * Requires at least 3 months with data to produce a baseline.
 */
export function computeBaselines(
  transactions: Transaction[],
  activities: ContactActivity[],
  monthlyExpensesTotal: number,
  monthlyGCIForRatio: number,
): PersonalBaselines {
  const now = new Date();
  const currentMonth = now.getFullYear() * 12 + now.getMonth(); // months since epoch

  // ── Bucket transactions by month (last 12 months, excluding current) ──
  const monthlyGCI: Map<number, number> = new Map();
  const monthlyDealCount: Map<number, number> = new Map();

  for (const tx of transactions) {
    if (tx.status !== "closed") continue;
    const txMonth = yearMonth(tx.date);
    if (txMonth == null) continue;
    // Only include completed months in the baseline window (not current month)
    if (txMonth >= currentMonth) continue;
    if (txMonth < currentMonth - 12) continue;

    const gci = computeGCI(tx);
    monthlyGCI.set(txMonth, (monthlyGCI.get(txMonth) ?? 0) + gci);
    monthlyDealCount.set(txMonth, (monthlyDealCount.get(txMonth) ?? 0) + 1);
  }

  // ── Bucket activities by month (last 12 months, excluding current) ──
  const monthlyTouchpoints: Map<number, number> = new Map();

  for (const act of activities) {
    const actMonth = yearMonth(act.activity_date.slice(0, 10));
    if (actMonth == null) continue;
    if (actMonth >= currentMonth) continue;
    if (actMonth < currentMonth - 12) continue;
    monthlyTouchpoints.set(actMonth, (monthlyTouchpoints.get(actMonth) ?? 0) + 1);
  }

  // ── Count months with ANY transaction data ──
  const monthsWithGCI = monthlyGCI.size;
  const monthsWithActivity = monthlyTouchpoints.size;

  // Use the larger of the two as our data window (some months may have
  // activities but no deals, or vice versa — both indicate active months)
  const monthsOfData = Math.max(monthsWithGCI, monthsWithActivity);

  // ── Compute averages (require ≥ 3 months) ──
  const minMonths = 3;

  let avgMonthlyGCI: number | null = null;
  if (monthsWithGCI >= minMonths) {
    const totalGCI = Array.from(monthlyGCI.values()).reduce((a, b) => a + b, 0);
    avgMonthlyGCI = totalGCI / monthsWithGCI;
  }

  let avgMonthlyDeals: number | null = null;
  if (monthsWithGCI >= minMonths) {
    const totalDeals = Array.from(monthlyDealCount.values()).reduce((a, b) => a + b, 0);
    avgMonthlyDeals = totalDeals / monthsWithGCI;
  }

  let avgExpenseRatio: number | null = null;
  // Expense ratio: current monthly expenses / current monthly GCI
  // Only meaningful if we have enough GCI history AND current GCI > 0
  if (monthsWithGCI >= minMonths && monthlyGCIForRatio > 0 && monthlyExpensesTotal >= 0) {
    avgExpenseRatio = monthlyExpensesTotal / monthlyGCIForRatio;
  }

  let avgMonthlyTouchpoints: number | null = null;
  if (monthsWithActivity >= minMonths) {
    const totalTouchpoints = Array.from(monthlyTouchpoints.values()).reduce((a, b) => a + b, 0);
    avgMonthlyTouchpoints = totalTouchpoints / monthsWithActivity;
  }

  return {
    monthlyGCI: avgMonthlyGCI,
    monthlyDeals: avgMonthlyDeals,
    expenseRatio: avgExpenseRatio,
    monthlyTouchpoints: avgMonthlyTouchpoints,
    monthsOfData,
  };
}

// ── 3. Deviation Detection ──────────────────────────────────────────────────

export interface Deviation {
  metric: string;
  current: number;
  baseline: number;
  pctChange: number; // e.g. -40 means 40% below baseline
  direction: "above" | "below";
}

/** Minimum baseline thresholds below which % deviation is unreliable. */
const MIN_BASELINES: Record<string, number> = {
  monthlyGCI: 1000,       // $1k/month minimum for % to be meaningful
  monthlyDeals: 0.5,      // ~6 deals/year minimum
  expenseRatio: 0.05,     // 5% ratio minimum
  monthlyTouchpoints: 5,  // 5 touchpoints/month minimum
};

/** Minimum absolute difference — suppress when % is technically high but gap is trivial. */
const MIN_ABSOLUTE_DIFF: Record<string, number> = {
  monthlyDeals: 0.75,     // < 0.75 deals/month difference is noise, not signal
};

/**
 * Detect deviation from personal baseline.
 * Returns null if:
 * - baseline is null (not enough data)
 * - baseline is below minimum volume threshold
 * - deviation is < 20% (not meaningful)
 */
export function detectDeviation(
  current: number,
  baseline: number | null,
  metricName: string,
): Deviation | null {
  if (baseline == null) return null;

  // Minimum volume protection — % is unreliable on tiny numbers
  const minBaseline = MIN_BASELINES[metricName] ?? 0;
  if (baseline < minBaseline) return null;

  // Avoid division by zero
  if (baseline === 0) return null;

  // Minimum absolute difference — suppress when gap is trivially small
  const minAbsDiff = MIN_ABSOLUTE_DIFF[metricName];
  if (minAbsDiff != null && Math.abs(current - baseline) < minAbsDiff) return null;

  const pctChange = Math.round(((current - baseline) / baseline) * 100);

  // Only flag meaningful deviations (≥ 20%)
  if (Math.abs(pctChange) < 20) return null;

  return {
    metric: metricName,
    current,
    baseline,
    pctChange,
    direction: pctChange > 0 ? "above" : "below",
  };
}

/**
 * Run deviation detection across all baselines.
 * Returns only metrics with meaningful deviations.
 */
export function detectAllDeviations(
  baselines: PersonalBaselines,
  currentMonthlyGCI: number,
  currentMonthlyDeals: number,
  currentExpenseRatio: number,
  currentMonthlyTouchpoints: number,
): Deviation[] {
  const deviations: Deviation[] = [];

  const checks: [number, number | null, string][] = [
    [currentMonthlyGCI, baselines.monthlyGCI, "monthlyGCI"],
    [currentMonthlyDeals, baselines.monthlyDeals, "monthlyDeals"],
    [currentExpenseRatio, baselines.expenseRatio, "expenseRatio"],
    [currentMonthlyTouchpoints, baselines.monthlyTouchpoints, "monthlyTouchpoints"],
  ];

  for (const [current, baseline, name] of checks) {
    const d = detectDeviation(current, baseline, name);
    if (d) deviations.push(d);
  }

  return deviations;
}

// ── 4. Experience-Based Tone ────────────────────────────────────────────────

/** Human-readable metric labels */
const METRIC_LABELS: Record<string, string> = {
  monthlyGCI: "monthly GCI",
  monthlyDeals: "deal count",
  expenseRatio: "expense ratio",
  monthlyTouchpoints: "contact activity",
};

/** Direction-appropriate verbs */
function directionPhrase(d: Deviation): string {
  const absChange = Math.abs(d.pctChange);
  if (d.direction === "above") return `${absChange}% above`;
  return `${absChange}% below`;
}

/**
 * Generate a single deviation insight with experience-appropriate tone.
 * One metric, one sentence, one optional suggestion. Nothing more.
 */
export function deviationInsight(d: Deviation, tier: ExperienceTier): string {
  const label = METRIC_LABELS[d.metric] ?? d.metric;
  const phrase = directionPhrase(d);

  const absChange = Math.abs(d.pctChange);

  switch (tier) {
    case "early":
      if (d.direction === "below") {
        if (absChange >= 50) {
          return `Your ${label} is ${phrase} your recent average. That's a meaningful gap — worth checking what changed.`;
        }
        return `Your ${label} is ${phrase} your recent average. This is common as you build consistency.`;
      }
      return `Your ${label} is ${phrase} your recent average — nice momentum.`;

    case "mid":
      if (d.direction === "below") {
        return `Your ${label} is ${phrase} your usual level. Worth reviewing whether recent activity has slowed.`;
      }
      return `Your ${label} is ${phrase} your usual level. Strong period — consider how to sustain it.`;

    case "established":
      if (d.direction === "below") {
        if (absChange < 40) {
          return `Your ${label} is ${phrase} your normal — likely a timing difference, but worth tracking.`;
        }
        return `Your ${label} is ${phrase} your normal. This is unusual for your business and worth attention.`;
      }
      return `Your ${label} is ${phrase} your normal — an exceptionally strong period.`;
  }
}

/**
 * Generate all deviation insights for an agent.
 * Returns an array of plain-English strings, one per deviation.
 * Empty array = no meaningful deviations detected.
 */
export function generateDeviationInsights(
  deviations: Deviation[],
  tier: ExperienceTier,
): string[] {
  return deviations.map((d) => deviationInsight(d, tier));
}

// ── Prompt Integration Helper ───────────────────────────────────────────────

/**
 * Build a minimal prompt fragment for AI system prompts.
 * Returns empty string if no deviations — adds zero noise.
 */
export function deviationPromptFragment(
  deviations: Deviation[],
  tier: ExperienceTier,
): string {
  if (deviations.length === 0) return "";

  const lines = [
    `Agent experience tier: ${tier}`,
    "",
    "Recent deviations from personal baseline:",
  ];

  for (const d of deviations) {
    const label = METRIC_LABELS[d.metric] ?? d.metric;
    const dir = d.direction === "above" ? "above" : "below";
    lines.push(`- ${label}: ${Math.abs(d.pctChange)}% ${dir} their 12-month average`);
  }

  lines.push("");
  lines.push("Tone guidance:");
  switch (tier) {
    case "early":
      lines.push("- Normalize deviations. Suggest building consistency. Do not alarm.");
      break;
    case "mid":
      lines.push("- Note deviations clearly. Suggest specific adjustments. Be direct.");
      break;
    case "established":
      lines.push("- Flag deviations as unusual. This agent knows their business — be concise.");
      break;
  }

  return lines.join("\n");
}
