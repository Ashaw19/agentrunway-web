// ============================================================================
// Agent Runway — Sandbox Diff Engine
// Compares before/after metric snapshots when sandbox data is edited.
// Returns human-readable change summaries for the teaching trigger system.
// ============================================================================

export interface MetricSnapshot {
  ytdGCI: number;
  projectedGCI: number;
  pipelineWeightedGCI: number;
  netTakeHome: number;
  cashRunwayMonths: number;
  expensesYTD: number;
  dealCount: number;
  pipelineCount: number;
  effectiveTaxRate: number;
}

export interface MetricChange {
  /** Which metric changed */
  metric: keyof MetricSnapshot;
  /** Human-readable metric label */
  label: string;
  /** Previous value */
  before: number;
  /** New value */
  after: number;
  /** Absolute change */
  delta: number;
  /** Percentage change */
  deltaPct: number;
  /** Human-readable summary */
  summary: string;
  /** Where to go to change this in the real app */
  settingsHref: string;
  /** Prompt nudging user to enter their real data */
  realDataNudge: string;
}

const METRIC_LABELS: Record<keyof MetricSnapshot, string> = {
  ytdGCI: "YTD Gross Commission",
  projectedGCI: "Projected Year-End GCI",
  pipelineWeightedGCI: "Weighted Pipeline Value",
  netTakeHome: "Net Take-Home",
  cashRunwayMonths: "Cash Runway",
  expensesYTD: "YTD Expenses",
  dealCount: "Closed Deals",
  pipelineCount: "Pipeline Deals",
  effectiveTaxRate: "Effective Tax Rate",
};

const METRIC_HREFS: Record<keyof MetricSnapshot, string> = {
  ytdGCI: "/transactions",
  projectedGCI: "/altimeter",
  pipelineWeightedGCI: "/pipeline",
  netTakeHome: "/settings",
  cashRunwayMonths: "/settings",
  expensesYTD: "/overhead",
  dealCount: "/transactions",
  pipelineCount: "/pipeline",
  effectiveTaxRate: "/overhead",
};

const REAL_DATA_NUDGES: Record<keyof MetricSnapshot, string> = {
  ytdGCI: "Your real commission split is set under Settings → Commission Structure.",
  projectedGCI: "Projections update automatically as you enter real transactions.",
  pipelineWeightedGCI: "Add your actual deals in Pipeline to see your real weighted value.",
  netTakeHome: "Your real brokerage fees and split are configured in Settings.",
  cashRunwayMonths: "Enter your actual cash reserve in Settings to see your real runway.",
  expensesYTD: "Track your real expenses in Overhead to get accurate projections.",
  dealCount: "Log your closed deals in Transactions to track real performance.",
  pipelineCount: "Add your active prospects in Pipeline for accurate forecasting.",
  effectiveTaxRate: "Your real tax rate depends on your actual income and province.",
};

function fmtDelta(metric: keyof MetricSnapshot, value: number): string {
  const isCurrency = ["ytdGCI", "projectedGCI", "pipelineWeightedGCI", "netTakeHome", "expensesYTD"].includes(metric);
  const isMonths = metric === "cashRunwayMonths";
  const isPct = metric === "effectiveTaxRate";
  const isCount = ["dealCount", "pipelineCount"].includes(metric);

  const sign = value >= 0 ? "+" : "";

  if (isCurrency) return `${sign}$${Math.abs(Math.round(value)).toLocaleString()}`;
  if (isMonths) return `${sign}${value.toFixed(1)} months`;
  if (isPct) return `${sign}${(value * 100).toFixed(1)}%`;
  if (isCount) return `${sign}${Math.round(value)}`;
  return `${sign}${value.toFixed(1)}`;
}

/**
 * Compare two metric snapshots and return all meaningful changes.
 * Only returns changes where the delta exceeds a minimum threshold
 * to avoid noise from rounding.
 */
export function computeSandboxDiff(
  before: MetricSnapshot,
  after: MetricSnapshot,
): MetricChange[] {
  const changes: MetricChange[] = [];

  for (const key of Object.keys(METRIC_LABELS) as (keyof MetricSnapshot)[]) {
    const b = before[key];
    const a = after[key];
    const delta = a - b;
    const deltaPct = b !== 0 ? (delta / Math.abs(b)) * 100 : a !== 0 ? 100 : 0;

    // Skip trivially small changes (less than 1% or less than $10 for currency)
    const isCurrency = ["ytdGCI", "projectedGCI", "pipelineWeightedGCI", "netTakeHome", "expensesYTD"].includes(key);
    if (Math.abs(deltaPct) < 1 && (!isCurrency || Math.abs(delta) < 10)) continue;

    const direction = delta > 0 ? "increased" : "decreased";
    const label = METRIC_LABELS[key];

    changes.push({
      metric: key,
      label,
      before: b,
      after: a,
      delta,
      deltaPct,
      summary: `${label} ${direction} by ${fmtDelta(key, delta)} (${Math.abs(deltaPct).toFixed(0)}%).`,
      settingsHref: METRIC_HREFS[key],
      realDataNudge: REAL_DATA_NUDGES[key],
    });
  }

  // Sort by absolute percentage change — biggest movers first
  changes.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  return changes;
}

/**
 * Generate a teaching toast message from the top 1-2 changes.
 * Returns null if no meaningful changes detected.
 */
export function generateTeachingMessage(changes: MetricChange[]): {
  title: string;
  description: string;
  href: string;
} | null {
  if (changes.length === 0) return null;

  const top = changes[0];
  const secondary = changes.length > 1 ? changes[1] : null;

  let description = top.summary;
  if (secondary) {
    description += ` ${secondary.summary}`;
  }
  description += ` ${top.realDataNudge}`;

  return {
    title: `Sandbox: ${top.label} changed`,
    description,
    href: top.settingsHref,
  };
}
