/**
 * AnomalyEngine — Statistical anomaly detection for agent business data.
 *
 * Four detection types:
 * 1. Expense anomalies — IQR method to flag unusual category spending
 * 2. Pipeline coverage drops — coverage ratio vs remaining goal
 * 3. Activity decay — clients going cold relative to their own rhythm
 * 4. Marketing ROI divergence — spend vs closings deviating from history
 *
 * Design principles:
 * - Pure functions, no database access
 * - Statistical thresholds, not arbitrary rules
 * - Missing data → null → no anomaly (never fabricate)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ExpenseAnomaly {
  type: "expense_spike";
  category: string;
  amount: number;
  threshold: number; // Q3 + 1.5*IQR
  severity: "warning" | "alert";
  message: string;
}

export interface PipelineCoverageAnomaly {
  type: "pipeline_coverage_drop";
  current_coverage: number;
  previous_coverage: number;
  severity: "warning" | "alert";
  message: string;
}

export interface ActivityDecayAnomaly {
  type: "activity_decay";
  client_name: string;
  days_since_last_activity: number;
  previous_frequency_days: number;
  severity: "warning" | "alert";
  message: string;
}

export interface MarketingDivergenceAnomaly {
  type: "marketing_divergence";
  marketing_spend: number;
  closings_count: number;
  expected_closings: number;
  severity: "warning" | "alert";
  message: string;
}

export type Anomaly =
  | ExpenseAnomaly
  | PipelineCoverageAnomaly
  | ActivityDecayAnomaly
  | MarketingDivergenceAnomaly;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Calculate the interquartile range for a set of values.
 * Returns Q1, Q3, and IQR. Requires at least 4 values for meaningful results.
 */
export function calculateIQR(values: number[]): { q1: number; q3: number; iqr: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const quartile = (data: number[], q: number): number => {
    const pos = (data.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (base + 1 < data.length) {
      return data[base] + rest * (data[base + 1] - data[base]);
    }
    return data[base];
  };

  const q1 = quartile(sorted, 0.25);
  const q3 = quartile(sorted, 0.75);
  return { q1, q3, iqr: q3 - q1 };
}

/** Compute difference in days between two Date objects. */
function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

// ── 1. Expense Anomalies (IQR Method) ─────────────────────────────────────────

/**
 * Detect expense spikes using the IQR method.
 * For each category, flags any monthly amount that exceeds Q3 + 1.5*IQR.
 * Severity is "alert" if the amount exceeds Q3 + 3*IQR, otherwise "warning".
 *
 * Requires at least 4 months of data per category to produce meaningful IQR.
 */
export function detectExpenseAnomalies(
  monthlyExpenses: { category: string; amounts: number[] }[]
): ExpenseAnomaly[] {
  const anomalies: ExpenseAnomaly[] = [];

  for (const { category, amounts } of monthlyExpenses) {
    if (amounts.length < 4) continue;

    const { q3, iqr } = calculateIQR(amounts);
    const warningThreshold = q3 + 1.5 * iqr;
    const alertThreshold = q3 + 3 * iqr;

    for (const amount of amounts) {
      if (amount > warningThreshold) {
        const severity = amount > alertThreshold ? "alert" : "warning";
        anomalies.push({
          type: "expense_spike",
          category,
          amount,
          threshold: warningThreshold,
          severity,
          message:
            severity === "alert"
              ? `Extreme expense spike in ${category}: $${amount.toLocaleString()} is far above the normal range (threshold: $${warningThreshold.toLocaleString()})`
              : `Unusual expense in ${category}: $${amount.toLocaleString()} exceeds typical spending (threshold: $${warningThreshold.toLocaleString()})`,
        });
      }
    }
  }

  return anomalies;
}

// ── 2. Pipeline Coverage Drop ──────────────────────────────────────────────────

/**
 * Detect pipeline coverage issues.
 * Coverage = pipelineValue / remainingGoal.
 * Alert if coverage < 1.0x, warning if < 1.5x.
 * Returns null if no issue or if remainingGoal is zero/negative.
 */
export function detectPipelineCoverageIssue(
  pipelineValue: number,
  remainingGoal: number,
  previousCoverage?: number
): PipelineCoverageAnomaly | null {
  if (remainingGoal <= 0) return null;

  const currentCoverage = pipelineValue / remainingGoal;

  if (currentCoverage >= 1.5) return null;

  const severity: "warning" | "alert" = currentCoverage < 1.0 ? "alert" : "warning";
  const prev = previousCoverage ?? currentCoverage;

  return {
    type: "pipeline_coverage_drop",
    current_coverage: Math.round(currentCoverage * 100) / 100,
    previous_coverage: Math.round(prev * 100) / 100,
    severity,
    message:
      severity === "alert"
        ? `Pipeline coverage critically low at ${currentCoverage.toFixed(1)}x — not enough pipeline to hit your remaining goal`
        : `Pipeline coverage slipping to ${currentCoverage.toFixed(1)}x — consider adding more opportunities to stay on track`,
  };
}

// ── 3. Activity Decay (Client Going Cold) ──────────────────────────────────────

/**
 * Detect clients whose activity has decayed relative to their own historical rhythm.
 * Alert if days since last activity > 3x their average frequency.
 * Warning if > 2x their average frequency.
 *
 * Requires at least 3 activity dates per client to establish a rhythm.
 */
export function detectActivityDecay(
  clients: { name: string; activity_dates: string[] }[],
  asOfDate?: Date
): ActivityDecayAnomaly[] {
  const now = asOfDate ?? new Date();
  const anomalies: ActivityDecayAnomaly[] = [];

  for (const { name, activity_dates } of clients) {
    if (activity_dates.length < 3) continue;

    // Sort dates chronologically
    const sorted = activity_dates
      .map((d) => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime());

    // Calculate average gap between consecutive activities
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1], sorted[i]));
    }
    const avgFrequency = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

    if (avgFrequency <= 0) continue;

    // Days since last activity
    const lastActivity = sorted[sorted.length - 1];
    const daysSinceLast = daysBetween(lastActivity, now);

    const ratio = daysSinceLast / avgFrequency;

    if (ratio >= 2) {
      const severity: "warning" | "alert" = ratio >= 3 ? "alert" : "warning";
      anomalies.push({
        type: "activity_decay",
        client_name: name,
        days_since_last_activity: daysSinceLast,
        previous_frequency_days: Math.round(avgFrequency),
        severity,
        message:
          severity === "alert"
            ? `${name} has gone silent — ${daysSinceLast} days since last activity vs their usual ${Math.round(avgFrequency)}-day rhythm`
            : `${name} is cooling off — ${daysSinceLast} days since last activity, typically every ${Math.round(avgFrequency)} days`,
      });
    }
  }

  return anomalies;
}

// ── 4. Marketing ROI Divergence ────────────────────────────────────────────────

/**
 * Detect when marketing spend is not translating to closings at the historical rate.
 * historicalRatio = closings per dollar of spend (e.g. 0.001 = 1 closing per $1000 spent).
 * Alert if actual closings < 50% of expected, warning if < 75%.
 * Returns null if spend is zero or historicalRatio is non-positive.
 */
export function detectMarketingDivergence(
  spend: number,
  closings: number,
  historicalRatio: number
): MarketingDivergenceAnomaly | null {
  if (spend <= 0 || historicalRatio <= 0) return null;

  const expectedClosings = spend * historicalRatio;
  if (expectedClosings <= 0) return null;

  const ratio = closings / expectedClosings;

  if (ratio >= 0.75) return null;

  const severity: "warning" | "alert" = ratio < 0.5 ? "alert" : "warning";

  return {
    type: "marketing_divergence",
    marketing_spend: spend,
    closings_count: closings,
    expected_closings: Math.round(expectedClosings * 10) / 10,
    severity,
    message:
      severity === "alert"
        ? `Marketing ROI significantly below expectations — ${closings} closings from $${spend.toLocaleString()} spend vs ${expectedClosings.toFixed(1)} expected`
        : `Marketing efficiency dipping — ${closings} closings from $${spend.toLocaleString()} spend, expected closer to ${expectedClosings.toFixed(1)}`,
  };
}

// ── 5. Unified Detection ───────────────────────────────────────────────────────

export interface AnomalyDetectionInput {
  expenses?: { category: string; amounts: number[] }[];
  pipeline?: { pipelineValue: number; remainingGoal: number; previousCoverage?: number };
  clients?: { name: string; activity_dates: string[] }[];
  marketing?: { spend: number; closings: number; historicalRatio: number };
  asOfDate?: Date;
}

/**
 * Run all anomaly detectors against the provided data.
 * Only runs detectors for which data is provided.
 */
export function detectAllAnomalies(data: AnomalyDetectionInput): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (data.expenses) {
    anomalies.push(...detectExpenseAnomalies(data.expenses));
  }

  if (data.pipeline) {
    const result = detectPipelineCoverageIssue(
      data.pipeline.pipelineValue,
      data.pipeline.remainingGoal,
      data.pipeline.previousCoverage
    );
    if (result) anomalies.push(result);
  }

  if (data.clients) {
    anomalies.push(...detectActivityDecay(data.clients, data.asOfDate));
  }

  if (data.marketing) {
    const result = detectMarketingDivergence(
      data.marketing.spend,
      data.marketing.closings,
      data.marketing.historicalRatio
    );
    if (result) anomalies.push(result);
  }

  return anomalies;
}
