// ============================================================================
// Engagement Engine
// Pure-function engine: weighted engagement scoring with time decay for CRM
// contacts. Calculates scores, tiers, trends, and re-engagement suggestions.
// ============================================================================

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EngagementActivity {
  type: string;
  occurred_at: string; // ISO date
}

export type EngagementTier =
  | "dormant"
  | "cooling"
  | "cruising"
  | "ascending"
  | "hot";

export type EngagementTrend = "rising" | "stable" | "declining";

export interface EngagementResult {
  score: number;
  tier: EngagementTier;
  trend: EngagementTrend;
  last_activity_date: string | null;
  days_since_last_activity: number | null;
  top_activity_type: string | null;
}

// ── Activity weights & half-lives ──────────────────────────────────────────────

const ACTIVITY_WEIGHTS: Record<string, number> = {
  reply: 15,
  call: 20,
  appointment: 25,
  showing: 25,
  email_open: 3,
  link_click: 8,
  text: 5,
  note: 2,
  email_sent: 5,
};

/** Half-life in days — controls how fast the score decays for each type. */
const ACTIVITY_HALF_LIFE: Record<string, number> = {
  reply: 30,
  call: 30,
  appointment: 30,
  showing: 30,
  email_open: 14,
  link_click: 14,
  text: 21,
  email_sent: 21,
  note: 21,
};

const DEFAULT_WEIGHT = 5;
const DEFAULT_HALF_LIFE = 21;

/** Number of days to look back when computing trend comparison. */
const TREND_LOOKBACK_DAYS = 14;
/** Percentage thresholds for rising / declining classification. */
const TREND_RISING_PCT = 0.1;
const TREND_DECLINING_PCT = -0.1;

// ── Tier thresholds ────────────────────────────────────────────────────────────

function tierFromScore(score: number): EngagementTier {
  if (score > 80) return "hot";
  if (score >= 50) return "ascending";
  if (score >= 20) return "cruising";
  if (score >= 5) return "cooling";
  return "dormant";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Compute the raw decayed score for a set of activities as-of a given date.
 * Returns the total score and a map of contribution per activity type.
 */
function computeScore(
  activities: EngagementActivity[],
  asOf: Date
): { total: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {};
  let total = 0;

  for (const act of activities) {
    const actDate = new Date(act.occurred_at);
    const daysAgo = daysBetween(asOf, actDate);

    // Ignore future activities or those with invalid dates
    if (daysAgo < 0 || Number.isNaN(daysAgo)) continue;

    const weight = ACTIVITY_WEIGHTS[act.type] ?? DEFAULT_WEIGHT;
    const halfLife = ACTIVITY_HALF_LIFE[act.type] ?? DEFAULT_HALF_LIFE;
    const decayed = weight * Math.pow(0.5, daysAgo / halfLife);

    total += decayed;
    byType[act.type] = (byType[act.type] ?? 0) + decayed;
  }

  return { total: Math.round(total * 100) / 100, byType };
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Calculate the engagement score for a contact based on their activities.
 *
 * Pure function — no database access. All inputs are provided as arguments.
 */
export function calculateEngagementScore(
  activities: EngagementActivity[],
  asOfDate?: Date
): EngagementResult {
  const asOf = startOfDay(asOfDate ?? new Date());

  // No activities → fully dormant
  if (!activities.length) {
    return {
      score: 0,
      tier: "dormant",
      trend: "stable",
      last_activity_date: null,
      days_since_last_activity: null,
      top_activity_type: null,
    };
  }

  // Current score
  const current = computeScore(activities, asOf);

  // Trend: compare against score computed 14 days ago
  const trendDate = new Date(asOf);
  trendDate.setDate(trendDate.getDate() - TREND_LOOKBACK_DAYS);
  const pastActivities = activities.filter(
    (a) => new Date(a.occurred_at) <= trendDate
  );
  const past = computeScore(pastActivities, trendDate);

  let trend: EngagementTrend = "stable";
  if (past.total > 0) {
    const pctChange = (current.total - past.total) / past.total;
    if (pctChange >= TREND_RISING_PCT) trend = "rising";
    else if (pctChange <= TREND_DECLINING_PCT) trend = "declining";
  } else if (current.total > 0) {
    // Had no activity 14 days ago but do now → rising
    trend = "rising";
  }

  // Last activity date
  const sorted = [...activities]
    .map((a) => ({ ...a, _d: new Date(a.occurred_at) }))
    .filter((a) => a._d <= asOf)
    .sort((a, b) => b._d.getTime() - a._d.getTime());

  const lastDate = sorted.length ? sorted[0]._d : null;
  const daysSince =
    lastDate !== null ? Math.round(daysBetween(asOf, lastDate)) : null;

  // Top contributing activity type
  let topType: string | null = null;
  let topVal = 0;
  for (const [type, val] of Object.entries(current.byType)) {
    if (val > topVal) {
      topVal = val;
      topType = type;
    }
  }

  return {
    score: current.total,
    tier: tierFromScore(current.total),
    trend,
    last_activity_date: lastDate ? lastDate.toISOString() : null,
    days_since_last_activity: daysSince,
    top_activity_type: topType,
  };
}

// ── Re-engagement suggestions ──────────────────────────────────────────────────

const RE_ENGAGEMENT_SUGGESTIONS: Record<EngagementTier, string> = {
  dormant: "Consider a personal check-in call or handwritten note",
  cooling: "Schedule a touchpoint \u2014 share a relevant market update",
  cruising: "Maintain cadence \u2014 they\u2019re engaged but not urgent",
  ascending: "Strike while hot \u2014 this contact is highly engaged",
  hot: "Priority contact \u2014 respond quickly to maintain momentum",
};

/**
 * Return a short action suggestion based on the contact's engagement tier.
 */
export function suggestReEngagement(result: EngagementResult): string {
  return RE_ENGAGEMENT_SUGGESTIONS[result.tier];
}
